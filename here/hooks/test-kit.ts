// Shared setup for the here mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteInput, On } from 'claude-code'

export const PLUGIN = 'here'
export const T0 = Date.parse('2026-10-20T12:00:00Z')
export const CWD = '/repo'

export type PeerGoalShape = { name: string; tasks: { title: string; status: string }[]; doneAt?: number } | null

/** What the mocked model answers a request: a reply's text, or a failure. */
export type Answerer = (req: ModelCompleteInput) => { text: string } | { fail: true }

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  /** Every $.model.complete request that reached the bottom. */
  calls: ModelCompleteInput[]
  state: (key: string) => unknown
  start: () => Promise<void>
  /** goal-meter's goal as its state holds it; undefined: goal-meter is absent. */
  setGoal: (g: PeerGoalShape | undefined) => void
  setAnswer: (a: Answerer) => void
  /** A main-loop turn starting (or a subagent's, with `agentId`). */
  turnStart: (agentId?: string) => Promise<void>
  /** A main-loop turn ending with this answer (or a subagent's, with `agentId`). */
  turnEnd: (answer: string, agentId?: string) => Promise<void>
  /** A tool call (main loop unless `agentId`). */
  tool: (input: Record<string, unknown> & { tool: string }, agentId?: string) => Promise<void>
  /** A prompt sent from the composer; `command` makes it a slash command's line. */
  submit: (text: string, command?: { name: string; args: string }) => Promise<void>
  /** The spinner drawn with this word. */
  spin: (word: string) => Promise<void>
  command: (args: string) => Promise<string>
  /** Lets the timers run: the rewrite starts 10 ms after the answer. */
  settle: () => Promise<void>
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
  /** While this answers true, every store write throws. */
  isStoreDown?: () => boolean
  /** While this answers true, every state write of the plugin throws. */
  isStateDown?: () => boolean
}

const json = (o: unknown) => JSON.stringify(o)

/**
 * The world beneath the plugin: a mocked clock, a store in a Map, goal-meter's
 * goal as the test sets it, the tools, turns and prompts answering as this
 * build's do, `model.complete` answered beneath the plugin (each request
 * recorded), and another mod's band beneath (a Text `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const calls: ModelCompleteInput[] = []
  const latest = new Map<string, unknown>()
  let goal: PeerGoalShape | undefined
  let answer: Answerer = () => ({ text: json({ goal: 'Ship HERE', now: 'Writing tests', you: 'Merge now?' }) })
  let turns = 0

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    if (shape.isStoreDown?.()) throw new Error('store is down')
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string; key?: string }
    if (a.plugin === 'goal-meter' && a.key === 'goal' && goal !== undefined) return { value: { value: goal, version: 1 } } as never
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && shape.isStateDown?.()) throw new Error('state is down')
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('model.complete', (_$, e) => {
    const req = e as ModelCompleteInput
    calls.push(req)
    const a = answer(req)
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: 'fail' in a ? { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage } : { isAnswered: true, text: a.text, usage } } as never
  })
  on('ui.render', async ($$, e) => {
    if ((e as { component?: string }).component === 'AbovePrompt') {
      if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
      if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    }
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: CWD }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  let taskIds = 0
  // TaskCreate answers its new task's id, as this build's does; the rest answer 'ok'.
  on('tool.call', async (_$, e) => {
    const c = e as { tool?: string; subject?: string }
    if (c.tool === 'TaskCreate') return { result: { task: { id: String(++taskIds), subject: c.subject ?? '' } } } as never
    if (c.tool === 'TaskUpdate') return { result: { success: true } } as never
    return { result: 'ok' } as never
  })

  return {
    clock,
    store,
    calls,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    },
    setGoal: g => {
      goal = g
    },
    setAnswer: a => {
      answer = a
    },
    turnStart: async agentId => {
      turns++
      await $.turn.start({ text: 'go', turnId: `t${turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    turnEnd: async (text, agentId) => {
      await $.turn.complete({
        answer: text,
        durationMs: 1_000,
        isAborted: false,
        turnId: `t${turns}`,
        reason: 'answer',
        ...(agentId !== undefined ? { agentId } : {}),
      } as never)
    },
    tool: async (input, agentId) => {
      await $.tool.call({ tool_use_id: `tu${Math.random()}`, ...input, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    submit: async (text, command) => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...(command ? { command } : {}) } as never)
    },
    spin: async word => {
      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface: 'terminal',
        component: 'Spinner',
        props: { word, message: null, suffix: '…', mode: 'thinking' } as never,
      })
      await ui.unmount()
    },
    command: async args => ((await $.command.run({ command: 'here', args } as never)) as { text?: string }).text ?? '',
    settle: async () => {
      await clock.advance(50)
    },
  }
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

type Run = { text: string; color?: string; bg?: string; bold?: boolean; dim: boolean }

/** The row's text runs, each with its colour and dimness; empty when the row is hidden. */
export async function lineRuns($: Engine, cols = 160): Promise<Run[]> {
  const ui = await mountRow($, cols)
  const line = await ui.find({ key: 'here-line' })
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
