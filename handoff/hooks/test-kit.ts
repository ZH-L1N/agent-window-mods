// Shared setup for the handoff mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { HandoffCategory, HandoffContext } from '../types'

export const PLUGIN = 'handoff'
export const T0 = Date.parse('2026-10-19T12:00:00Z')
export const WINDOW = 1_000_000
export const ROOT = '/repo'
export const FILE = '/repo/HANDOFF.md'

const cat = (name: string, tokens: number, color: string, kind = 'used'): HandoffCategory => ({ name, tokens, color, kind })

/**
 * A reading as token-weather publishes it: System prompt 100k, System tools
 * 50k, Memory files 10k, Messages making up `tokens`, the buffer the window
 * less the compaction point (150k when none is given), the rest free.
 */
export function ctx(tokens: number, compactAt?: number, readAt = T0): HandoffContext {
  const buffer = WINDOW - (compactAt ?? 850_000)
  const messages = Math.max(0, tokens - 160_000)
  return {
    categories: [
      cat('System prompt', 100_000, '#888888'),
      cat('System tools', 50_000, '#999999'),
      cat('Memory files', 10_000, '#d77757'),
      cat('Messages', messages, '#9333ea'),
      cat('Free space', WINDOW - tokens - buffer, '#888888', 'free'),
      cat('Autocompact buffer', buffer, '#999999', 'buffer'),
    ].filter(c => c.tokens > 0),
    totalTokens: tokens,
    maxTokens: WINDOW,
    ...(compactAt ? { autoCompactThreshold: compactAt } : {}),
    percent: Math.round((tokens / WINDOW) * 100),
    readAt,
  }
}

export type File = { mtimeMs: number; text: string }

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  prompts: string[]
  commands: string[]
  files: Map<string, File>
  /** token-weather's reading, as its state holds it; undefined: token-weather is absent. */
  setTw: (r: HandoffContext | undefined) => void
  /** What $.session.usage answers this mod (its own reading, when token-weather is absent). */
  setUsage: (u: unknown) => void
  state: (key: string) => unknown
  start: (turns?: number) => Promise<void>
  /** A main-loop turn ends, and the mod's settle timer runs. */
  turn: () => Promise<void>
  compact: (trigger?: 'manual' | 'auto' | 'precompute', skip?: string) => Promise<unknown>
  /** A /clear: session.end with reason clear, and the mod's settle timer. */
  clear: () => Promise<void>
}

/** How the world beneath differs for one test. */
export type WorldShape = {
  /** Commands the session lists besides this mod's own (`handoff`: the person's own). */
  listed?: string[]
  /** Beneath the row, the engine's own placeholder instead of another mod's Text. */
  isEngineBeneath?: boolean
  /**
   * Beneath the band, a column of zehui-mods rows keyed as listed (each a Box
   * holding a Text of its key), then another mod's band (a Box keyed `other-band` holding a Text `beneath`).
   */
  stackBeneath?: string[]
  store?: Record<string, unknown>
  files?: Record<string, File>
}

/**
 * The world beneath the plugin: a mocked clock, a store in a Map, files in a
 * Map, token-weather's state as the test sets it, the commands, prompts and
 * toasts the mod makes recorded, and another mod's band beneath (a Text
 * `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const files = new Map<string, File>(Object.entries(shape.files ?? {}))
  const toasts: string[] = []
  const prompts: string[] = []
  const commands: string[] = []
  const latest = new Map<string, unknown>()
  let tw: HandoffContext | undefined
  let twVersion = 0
  let usage: unknown = { startedAt: T0, context: { window: WINDOW }, rateLimits: [] }
  let turns = 0

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    store.delete((e as { key: string }).key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string; key?: string }
    if (a.plugin === 'token-weather' && a.key === 'context' && tw !== undefined) return { value: { value: tw, version: twVersion } } as never
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key) latest.set(w.key, w.value)
    return next(e)
  })
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.turns', () => ({ value: turns }) as never)
  on('session.usage', () => ({ value: usage }) as never)
  on('fs.stat', (_$, e) => {
    const f = files.get((e as { path: string }).path)
    return (f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }) as never
  })
  on('fs.read', (_$, e) => {
    const f = files.get((e as { path: string }).path)
    return (f ? { value: f.text } : { deny: 'ENOENT' }) as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('command.list', () => ({ value: (shape.listed ?? []).map(name => ({ name, description: '', source: 'user' })) }) as never)
  on('command.run', async (_$, e) => {
    const c = e as { command: string; args: string }
    commands.push(c.args ? `${c.command} ${c.args}` : c.command)
    return { text: '' } as never
  })
  on('prompt.submit', async (_$, e) => {
    prompts.push((e as { text: string }).text)
    return { text: (e as { text: string }).text } as never
  })
  on('ui.render', async ($$, e) => {
    if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
    if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: ROOT }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  const kept = [{ role: 'user', text: 'summary', toolUses: [] }]
  let compactResult: unknown = { messages: kept }
  on('session.compact', async () => compactResult as never)

  return {
    clock,
    store,
    toasts,
    prompts,
    commands,
    files,
    setTw: r => {
      tw = r
      twVersion++
    },
    setUsage: u => (usage = u),
    state: key => latest.get(key),
    start: async (n = 0) => {
      turns = n
      await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
      await clock.advance(300)
    },
    turn: async () => {
      turns++
      await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: `t${turns}`, reason: 'answer' } as never)
      await clock.advance(300)
    },
    compact: async (trigger = 'manual', skip) => {
      compactResult = skip ? { skip } : { messages: kept }
      const result = await $.session.compact({ trigger, messages: kept } as never)
      await clock.advance(300)
      return result
    },
    clear: async () => {
      await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
      await clock.advance(600)
    },
  }
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 200, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 200, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

/** The row's text runs (the line only, not the buttons), each with its colour and dimness. */
export async function lineRuns($: Engine, cols = 200): Promise<{ text: string; color?: string; dim: boolean; bg?: string; bold?: boolean }[]> {
  const ui = await mountRow($, cols)
  const line = await ui.find({ key: 'handoff-line' })
  await ui.unmount()
  // The line Box holds one Text (truncate-end) whose children are the runs.
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

export const barOf = (runs: { text: string; color?: string; dim: boolean }[]) =>
  runs.filter(r => /^[▰▱░]+$/.test(r.text)).map(r => ({ text: r.text, ...(r.color ? { color: r.color } : {}), dim: r.dim }))

export const pctOf = (runs: { text: string; color?: string }[]) => runs.find(r => /^ \d+%$/.test(r.text))

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
