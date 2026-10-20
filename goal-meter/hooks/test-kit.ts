// Shared setup for the goal-meter mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'goal-meter'
export const T0 = Date.parse('2026-10-19T12:00:00Z')
export const MIN = 60_000

type Status = 'pending' | 'in_progress' | 'completed'

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  opened: string[]
  /** Every task-list call that reached the bottom: its tool and agentId. */
  calls: { tool: string; agentId?: string }[]
  state: (key: string) => unknown
  start: () => Promise<void>
  /** A main-loop turn starting with this prompt. */
  prompt: (text: string) => Promise<void>
  /** A TodoWrite call: each item's title and status (main loop unless `agentId`). */
  todo: (items: [string, Status][], agentId?: string) => Promise<void>
  /** A TaskCreate call; resolves with the id the tool answered. */
  create: (subject: string, agentId?: string) => Promise<string>
  /** A TaskUpdate call. */
  set: (taskId: string, status: Status | 'deleted', agentId?: string) => Promise<void>
  /** A TaskList call: the tool answers every task it holds. */
  list: () => Promise<void>
  command: (args: string) => Promise<string>
}

export type WorldShape = {
  /** Beneath the row, the engine's own placeholder instead of another mod's Text. */
  isEngineBeneath?: boolean
  /**
   * Beneath the band, a column of zehui-mods rows keyed as listed (each a Box
   * holding a Text of its key), then another mod's band (a Box keyed `other-band` holding a Text `beneath`).
   */
  stackBeneath?: string[]
  store?: Record<string, unknown>
  /** While this answers true, every state write of the plugin throws. */
  isStateDown?: () => boolean
  /** While this answers true, every store write throws. */
  isStoreDown?: () => boolean
  /** TaskUpdate refuses these task ids: `success: false`, no `isError`. */
  refused?: ReadonlySet<string>
}

/**
 * The world beneath the plugin: a mocked clock, a store in a Map, toasts and
 * opened panes recorded, the task tools answering as this build's do (their
 * own list of tasks behind TaskCreate, TaskUpdate and TaskList), and another
 * mod's band beneath (a Text `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const toasts: string[] = []
  const opened: string[] = []
  const calls: { tool: string; agentId?: string }[] = []
  const latest = new Map<string, unknown>()
  const tasks = new Map<string, { id: string; subject: string; status: Status }>()
  let ids = 0

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    if (shape.isStoreDown?.()) throw new Error('store is down')
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && shape.isStateDown?.()) throw new Error('state is down')
    const done = await next(e)
    // Only a write that landed: an `ifVersion` miss (isSet false) left the value as it was.
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('command.register', async () => ({ value: {} }) as never)
  on('ui.render', async ($$, e) => {
    if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
    if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('tool.call', async (_$, e) => {
    const c = e as Record<string, unknown> & { tool: string; agentId?: string }
    calls.push({ tool: c.tool, ...(c.agentId !== undefined ? { agentId: c.agentId } : {}) })
    switch (c.tool) {
      case 'TodoWrite':
        return { result: { oldTodos: [], newTodos: c.todos } } as never
      case 'TaskCreate': {
        const id = String(++ids)
        tasks.set(id, { id, subject: String(c.subject), status: 'pending' })
        return { result: { task: { id, subject: String(c.subject) } } } as never
      }
      case 'TaskUpdate': {
        const t = tasks.get(String(c.taskId))
        if (!t) return { result: { success: false, taskId: String(c.taskId), updatedFields: [], error: 'no such task' } } as never
        if (shape.refused?.has(t.id)) return { result: { success: false, taskId: t.id, updatedFields: [], error: 'refused' } } as never
        if (c.status === 'deleted') tasks.delete(t.id)
        else if (c.status) t.status = c.status as Status
        return { result: { success: true, taskId: t.id, updatedFields: ['status'] } } as never
      }
      case 'TaskList':
        return { result: { tasks: [...tasks.values()].map(t => ({ ...t, blockedBy: [] })) } } as never
      default:
        return { result: 'ok' } as never
    }
  })

  let turns = 0
  const call = (input: Record<string, unknown>, agentId?: string) =>
    $.tool.call({ ...input, ...(agentId !== undefined ? { agentId } : {}) } as never) as Promise<{ result?: unknown }>

  return {
    clock,
    store,
    toasts,
    opened,
    calls,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    },
    prompt: async text => {
      await $.turn.start({ text, turnId: `t${++turns}` } as never)
    },
    todo: async (items, agentId) => {
      await call({ tool: 'TodoWrite', todos: items.map(([content, status]) => ({ content, status, activeForm: content })) }, agentId)
    },
    create: async (subject, agentId) => {
      const ran = await call({ tool: 'TaskCreate', subject, description: subject }, agentId)
      return String((ran.result as { task?: { id?: string } } | undefined)?.task?.id ?? '')
    },
    set: async (taskId, status, agentId) => {
      await call({ tool: 'TaskUpdate', taskId, status }, agentId)
    },
    list: async () => {
      await call({ tool: 'TaskList' })
    },
    command: async args => ((await $.command.run({ command: 'goals', args } as never)) as { text?: string }).text ?? '',
  }
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 80) =>
  ({ title: '', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

export const mountPane = ($: Engine, cols = 80, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'goals', props: paneProps(cols) })

type Run = { text: string; color?: string; bg?: string; bold?: boolean; dim: boolean }

/** The row's text runs, each with its colour and dimness; empty when the row is hidden. */
export async function lineRuns($: Engine, cols = 160): Promise<Run[]> {
  const ui = await mountRow($, cols)
  const line = await ui.find({ key: 'goal-line' })
  await ui.unmount()
  type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const wrap = (line?.children?.[0] ?? {}) as Node
  return (wrap.children ?? []).map(c => {
    const n = c as Node
    const p = n.props ?? {}
    return {
      text: (n.children ?? []).filter(x => typeof x === 'string').join(''),
      ...(typeof p.color === 'string' ? { color: p.color } : {}),
      ...(typeof p.backgroundColor === 'string' ? { bg: p.backgroundColor } : {}),
      ...(p.bold ? { bold: true } : {}),
      dim: Boolean(p.dimColor),
    }
  })
}

export const lineText = (runs: readonly Run[]): string => runs.map(r => r.text).join('')

/** A lower band tree for the stack-order test: zm rows as listed, then a non-zm Text. */
export const stackTree = (keys: readonly string[]) => ({
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [
    ...keys.map(key => ({ type: 'Box', props: { key }, children: [{ type: 'Text', props: {}, children: [key] }] })),
    { type: 'Box', props: { key: 'other-band' }, children: [{ type: 'Text', props: {}, children: ['beneath'] }] },
  ],
})

/** The keys of a drawn tree's direct children, in order. */
export const childKeys = (tree: unknown): string[] =>
  (((tree as { children?: unknown[] }).children ?? []) as { props?: { key?: string } }[]).map(c => c.props?.key ?? '')
