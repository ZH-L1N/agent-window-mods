// Shared setup for the cache-clock mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'cache-clock'
export const T0 = Date.parse('2026-10-19T12:00:00Z')
export const MIN = 60_000

export type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const usage = (model: string, input: number, cacheRead = 0, cacheWrite = 0, output = 100): Usage => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

/** What the mocked compaction answers: a compaction with sizes, a skip, or a rejection. */
export type CompactAnswer = { tokensBefore?: number; tokensAfter?: number } | { skip: string } | Error

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  /** Every $.session.compact call that reached the bottom. */
  compacts: unknown[]
  setCompact: (a: CompactAnswer) => void
  state: (key: string) => unknown
  start: () => Promise<void>
  /** One model request: main loop unless `agentId` is given. */
  step: (u: Usage | null, agentId?: string) => Promise<void>
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
}

/**
 * The world beneath the plugin: a mocked clock, a store in a Map, toasts and
 * compactions recorded, steps that answer the usage the test hands them, and
 * another mod's band beneath (a Text `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const toasts: string[] = []
  const compacts: unknown[] = []
  const latest = new Map<string, unknown>()
  let compactAnswer: CompactAnswer = { tokensBefore: 412_000, tokensAfter: 38_000 }

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key) latest.set(w.key, w.value)
    return next(e)
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('ui.render', async ($$, e) => {
    if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
    if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  // The transcript the engine hands a plugin's compaction; a test has no engine to read it from.
  const kept = [{ role: 'user', text: 'summary', toolUses: [] }]
  on('session.messages', () => ({ value: kept }) as never)
  on('session.compact', async (_$, e) => {
    compacts.push({ trigger: (e as { trigger?: string }).trigger })
    if (compactAnswer instanceof Error) throw compactAnswer
    return ('skip' in compactAnswer ? compactAnswer : { messages: kept, ...compactAnswer }) as never
  })
  let pending: Usage | null = null
  on('turn.step', async function* (_$, e) {
    const s = e as { turnId: string; index: number }
    return { turnId: s.turnId, index: s.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: pending } as never
  })
  let steps = 0

  return {
    clock,
    store,
    toasts,
    compacts,
    setCompact: a => (compactAnswer = a),
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    },
    step: async (u, agentId) => {
      pending = u
      const stream = $.turn.step({
        turnId: agentId ? `t-${agentId}` : 't-main',
        index: steps++,
        model: u?.model ?? 'claude-opus-5-5',
        messageCount: 1,
        ...(agentId ? { agentId } : {}),
      } as never)
      for await (const _chunk of stream) {
        // Drained: the bottom yields no chunks.
      }
      await stream.result
    },
    command: async args => ((await $.command.run({ command: 'cache-clock', args } as never)) as { text?: string }).text ?? '',
  }
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

type Run = { text: string; color?: string; bg?: string; bold?: boolean; dim: boolean }

/** The row's text runs (the line only, not the button), each with its colour and dimness. */
export async function lineRuns($: Engine, cols = 160): Promise<Run[]> {
  const ui = await mountRow($, cols)
  const line = await ui.find({ key: 'cache-line' })
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
