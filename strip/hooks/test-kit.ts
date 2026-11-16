// Shared setup for the strip mod's engine tests (imported by *.test.* files
// only). The test stands for the host: it answers every call the mod makes on
// `$`, and for the other mods, whose state it answers by `plugin.key`.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CAP_L, CAP_R } from './pills'
import type { PillId } from './pills'

export const PLUGIN = 'strip'
export const ROW_KEY = 'zm-10-strip'
export const T0 = Date.parse('2026-11-16T12:00:00Z')

/** The breakdown $.session.usage answers: 50.1k of a 167k auto-compact threshold, 30%. */
export const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 4_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 46_100, color: 'purple', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 133_900, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 16_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 50_100,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'settings',
  percentage: 25,
  gridRows: [],
  model: 'test-model',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 167_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

/** An Edit's result as the tool reports it: two lines added after line 10. */
export const EDIT_RESULT = {
  filePath: '/repo/src/a.ts',
  oldString: 'line 10',
  newString: 'line 10\nline 11\nline 12',
  originalFile: null,
  structuredPatch: [{ oldStart: 10, oldLines: 1, newStart: 10, newLines: 3, lines: [' line 10', '+line 11', '+line 12'] }],
  userModified: false,
  replaceAll: false,
}

/** A Write's result: a new two-line file. */
export const WRITE_RESULT = {
  type: 'create',
  filePath: '/repo/notes/new.txt',
  content: 'x\ny\n',
  originalFile: null,
  structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+x', '+y'] }],
}

export type WorldShape = {
  /** Other plugins' state values, by `plugin.key`; a key left out reads as never written. */
  peers?: Record<string, unknown>
  /** `plugin.key` refs whose read fails. */
  broken?: string[]
  /** The slash commands $.command.list answers, by name. */
  commands?: string[]
  /** What $.ui.open answers: placed by default. */
  isPlaced?: boolean
  /** $.ui.open refuses an open that names a background colour, as a surface without that option would; it is not recorded. */
  isFillRefused?: boolean
  /** The rows $.config.list answers, by key. */
  config?: Record<string, unknown>
  /** What the mod's store holds at the start. */
  stored?: Record<string, unknown>
  /** $.session.usage answers no breakdown. */
  isNoBreakdown?: boolean
}

export type ToolExtra = { agentId?: string; answer?: 'ok' | 'error' | 'deny' }
export type Row = { plugin: string; tree: unknown }

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  /** Every command the mod ran through $.command.run, in order. */
  runs: { command: string; args?: string }[]
  /** The argument of every $.ui.open that reached the host, in order. */
  opens: Record<string, unknown>[]
  /** The argument of every $.ui.open refused for its background colour (`isFillRefused`), in order. */
  refusedOpens: Record<string, unknown>[]
  /** The id of every $.ui.close, in order. */
  closes: string[]
  /** The rows the band's list was handed beneath the mod, one entry for each draw. */
  lists: Row[][]
  /** Changes another plugin's value between draws. */
  setPeer: (ref: string, value: unknown) => void
  start: () => Promise<void>
  turnStart: (agentId?: string) => Promise<void>
  turnEnd: (reason?: 'answer' | 'aborted' | 'refusal' | 'error', agentId?: string) => Promise<void>
  /** Raises an Edit call whose tool answers `result`. */
  edit: (result: unknown, extra?: ToolExtra) => Promise<void>
  /** Raises a Write call whose tool answers `result`. */
  write: (result: unknown, extra?: ToolExtra) => Promise<void>
  /** Runs /strip with these arguments and answers its text. */
  strip: (args: string) => Promise<string>
  /** A /clear: session.end with reason `clear`, then the settle timer. */
  clear: () => Promise<void>
}

export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(shape.stored ?? {}))
  const toasts: string[] = []
  const runs: { command: string; args?: string }[] = []
  const opens: Record<string, unknown>[] = []
  const refusedOpens: Record<string, unknown>[] = []
  const closes: string[] = []
  const lists: Row[][] = []
  const peers: Record<string, unknown> = { ...(shape.peers ?? {}) }
  let toolAnswer: { kind: 'ok' | 'error' | 'deny'; result: unknown } = { kind: 'ok', result: {} }
  let turns = 0

  // Other plugins' values. The strip's own go on to the kit's state beneath.
  on('state.get', async (_$, e, next) => {
    const w = e as { plugin: string; key: string }
    if (w.plugin === PLUGIN) return next(e)
    const ref = `${w.plugin}.${w.key}`
    if ((shape.broken ?? []).includes(ref)) return { deny: `${ref} cannot be read` } as never
    return { value: ref in peers ? { value: peers[ref], version: 1 } : { value: undefined, version: 0 } } as never
  })
  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, w.value)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    if (shape.isFillRefused && (e as { backgroundColor?: unknown }).backgroundColor !== undefined) {
      refusedOpens.push({ ...(e as Record<string, unknown>) })
      return { deny: 'no background colour here' } as never
    }
    opens.push({ ...(e as Record<string, unknown>) })
    return { value: shape.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    closes.push((e as { id: string }).id)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: { command: 'strip' } }) as never)
  on('command.list', () => ({ value: (shape.commands ?? []).map(name => ({ name, description: '', source: 'plugin' })) }) as never)
  on('command.run', (_$, e) => {
    const w = e as { command: string; args?: string }
    runs.push({ command: w.command, ...(w.args !== undefined ? { args: w.args } : {}) })
    return { text: '' } as never
  })
  on('config.list', () =>
    ({
      value: Object.entries(shape.config ?? {}).map(([key, value]) => ({ key, label: key, kind: 'choice', value, provider: { plugin: key.split('.')[0], tier: 'user' }, isLocked: false })),
    }) as never,
  )
  on('session.usage', () =>
    ({
      value: {
        startedAt: T0,
        context: shape.isNoBreakdown ? { tokens: 90_000, window: 1_000_000, percent: 9 } : { tokens: 60_000, window: 200_000, percent: 30, breakdown: BREAKDOWN },
        rateLimits: [],
      },
    }) as never,
  )
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.end', async () => ({ sessionId: 's1' }) as never)
  on('session.measure', async (_$, e) => ({ changed: (e as { changed: unknown }).changed }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('classic.StopFailure', async () => ({}) as never)
  on('tool.call', async () => {
    if (toolAnswer.kind === 'deny') return { deny: 'no' } as never
    if (toolAnswer.kind === 'error') return { isError: true, result: 'boom', text: 'boom' } as never
    return { result: toolAnswer.result, text: 'ok' } as never
  })
  // What reaches the band's list beneath the mod, before the kit stacks it.
  on('ui.render', { component: 'AbovePromptList' }, async (_$, e, next) => {
    lists.push([...(e as unknown as { props: { rows: Row[] } }).props.rows])
    return next(e)
  })

  const call = async (tool: 'Edit' | 'Write', result: unknown, extra: ToolExtra = {}): Promise<void> => {
    toolAnswer = { kind: extra.answer ?? 'ok', result }
    const file = ((result ?? {}) as { filePath?: string }).filePath ?? '/repo/a.ts'
    const input = tool === 'Edit' ? { tool, file_path: file, old_string: 'a', new_string: 'b' } : { tool, file_path: file, content: 'x' }
    await $.tool.call({ ...input, ...(extra.agentId !== undefined ? { agentId: extra.agentId } : {}) } as never)
  }

  return {
    clock,
    store,
    toasts,
    runs,
    opens,
    refusedOpens,
    closes,
    lists,
    setPeer: (ref, value) => {
      peers[ref] = value
    },
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
      await clock.settle()
    },
    turnStart: async agentId => {
      turns += 1
      await $.turn.start({ text: 'go', turnId: `t${turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    turnEnd: async (reason = 'answer', agentId) => {
      await $.turn.complete({
        answer: 'ok',
        durationMs: 1_000,
        isAborted: reason === 'aborted',
        turnId: `t${turns}`,
        reason,
        ...(agentId !== undefined ? { agentId } : {}),
      } as never)
    },
    edit: (result, extra) => call('Edit', result, extra),
    write: (result, extra) => call('Write', result, extra),
    strip: async args => {
      const r = (await $.command.run({ command: 'strip', args } as never)) as { text?: string } | undefined
      return r?.text ?? ''
    },
    clear: async () => {
      await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
      await clock.advance(1_000)
    },
  }
}

export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountBand = ($: Engine, columns = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(columns, hasSurvey) })

/** One row of the band as the list is handed it: the plugin and a tree that says its name. */
export const row = (plugin: string): Row => ({
  plugin,
  tree: { type: 'Box', props: { key: `r-${plugin}` }, children: [{ type: 'Text', props: {}, children: [plugin] }] },
})

export const mountList = ($: Engine, rows: readonly Row[], hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePromptList',
    props: { rows, hasSurvey, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never,
  })

export const mountPane = ($: Engine, id: string) =>
  $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'Pane',
    requestId: id,
    props: { title: id, isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as never,
  })

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

/** Every string a node shows, in document order. */
export const flat = (n: unknown): string =>
  typeof n === 'string' ? n : n && typeof n === 'object' ? ((n as Node).children ?? []).map(flat).join('') : ''

type Finder = { find: (q: { key?: string; type?: string }) => Promise<{ children: unknown[]; props: Record<string, unknown> } | undefined> }

/** One pill's words as drawn: its Button's text without the caps and the icon; null when the pill is not drawn. */
export async function pillWords(ui: Finder, id: PillId): Promise<string | null> {
  const button = await ui.find({ key: `sp-${id}` })
  if (!button) return null
  const text = button.children.map(flat).join('')
  if (!text.startsWith(CAP_L) || !text.endsWith(CAP_R)) throw new Error(`the ${id} pill has no caps: ${text}`)
  return [...text.slice(CAP_L.length, text.length - CAP_R.length)].slice(1).join('')
}

/** The strip as drawn at a width: each pill's whole text (caps, icon, words), by id, in order. */
export async function stripDrawn($: Engine, columns = 160): Promise<{ ids: string[]; text: string }> {
  const ui = await mountBand($, columns)
  const buttons = await ui.findAll({ type: 'Button' })
  await ui.unmount()
  const pills = buttons.filter(b => (b.key ?? '').startsWith('sp-'))
  return { ids: pills.map(b => (b.key ?? '').slice(3)), text: pills.map(b => b.children.map(flat).join('')).join(' ') }
}

/** The plugin names of the last list that reached the host. */
export const lastList = (w: World): string[] => (w.lists[w.lists.length - 1] ?? []).map(r => r.plugin)
