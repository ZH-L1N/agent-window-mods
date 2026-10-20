// Shared setup for the images mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine, EngineCall } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'images'
export const T0 = Date.parse('2026-10-20T12:00:00Z')
export const CWD = '/repo'

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  /** What the store holds, by key. */
  store: Map<string, unknown>
  state: (key: string) => unknown
  start: () => Promise<void>
  /** The person types or pastes `inputText` at the end of the box as it stands. */
  type: (inputText: string) => Promise<void>
  /** The box changed with no edit (history, clear, undo, a fill): it now holds `text`. */
  change: (text: string, kind?: 'history' | 'clear' | 'undo' | 'engine') => Promise<void>
  /** A prompt sent from the box (the box is empty after it; no prompt.change is raised). */
  submit: (text: string) => Promise<void>
  sessionEnd: (reason: string) => Promise<void>
  command: (args: string) => Promise<string>
  /** Lets the timers run: a press's work starts 10 ms after it. */
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
  /** What the store holds at the start. */
  stored?: Record<string, unknown>
}

/**
 * The world beneath the plugin: a mocked clock, toasts, a store, the prompt box
 * as the edits and changes leave it (no hook beneath: the editor's own splice),
 * and another mod's band beneath (a Text `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const toasts: string[] = []
  const latest = new Map<string, unknown>()
  const store = new Map<string, unknown>(Object.entries(shape.stored ?? {}))
  let box = ''

  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const s = e as { key: string; value: unknown }
    store.set(s.key, s.value)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('prompt.edit', (_$, e) => {
    const x = e as { text: string; start: number; end: number; inputText: string }
    const text = x.text.slice(0, x.start) + x.inputText + x.text.slice(x.end)
    return { text, cursor: x.start + x.inputText.length } as never
  })
  on('prompt.change', (_$, e) => ({ text: (e as { text: string }).text }) as never)
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
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)

  // The test engine raises prompt.edit and prompt.change, though its typed
  // `prompt` noun (EventCalls) names neither; typed here from their events.
  const box$ = $.prompt as unknown as { edit: EngineCall<'prompt.edit'>; change: EngineCall<'prompt.change'> }

  return {
    clock,
    toasts,
    store,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    },
    type: async inputText => {
      const r = (await box$.edit({ origin: { kind: 'composer' }, text: box, cursor: box.length, start: box.length, end: box.length, inputText } as never)) as {
        text: string
      }
      box = r.text
    },
    change: async (text, kind = 'history') => {
      box = text
      await box$.change({ text, cursor: text.length, origin: { kind } } as never)
    },
    submit: async text => {
      // The editor takes the draft; the box's own clear (prompt.change) is left to the test.
      box = ''
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
    },
    sessionEnd: async reason => {
      await $.session.end({ sessionId: 's1', reason } as never)
    },
    command: async args => ((await $.command.run({ command: 'images', args } as never)) as { text?: string }).text ?? '',
    settle: async () => {
      await clock.advance(50)
    },
  }
}

/** The band's props at `bodyColumns` and `maxRows`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false, maxRows = 40) =>
  ({ hasSurvey, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} }) as never

export type MountOpts = { hasSurvey?: boolean; maxRows?: number; surface?: 'terminal' | 'desktop' }

export const mountRow = ($: Engine, cols = 160, opts: MountOpts = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: opts.surface ?? 'terminal', component: 'AbovePrompt', props: bandProps(cols, opts.hasSurvey, opts.maxRows) })

/** What the row shows: each tile's key, columns and rows, the captions, the `+n more` note ('' when absent); null when the row is hidden. */
export async function rowView(
  $: Engine,
  cols = 160,
  opts: MountOpts = {},
): Promise<{ tiles: { key: string; columns: number; rows: number }[]; captions: string[]; more: string } | null> {
  const ui = await mountRow($, cols, opts)
  const drawn = await ui.find({ key: 'images-chip' })
  if (!drawn) {
    await ui.unmount()
    return null
  }
  const tiles = (await ui.findAll({ type: 'Raster' })).map(r => {
    const p = (r.props ?? {}) as { key?: string; columns?: number; rows?: number }
    return { key: p.key ?? String((r as { key?: unknown }).key ?? ''), columns: p.columns ?? 0, rows: p.rows ?? 0 }
  })
  const captions = (await ui.findAll({ type: 'Text', text: /^\[Image #/ })).map(t => t.text)
  const more = (await ui.find({ type: 'Text', text: /^\+\d+ more$/ }))?.text ?? ''
  await ui.unmount()
  return { tiles, captions, more }
}

/** A lower band tree for the stack-order test: zm rows as listed, then a non-zm Box. */
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
