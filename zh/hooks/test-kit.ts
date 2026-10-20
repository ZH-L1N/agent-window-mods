// Shared setup for the zh mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteInput, ModelCompleteResult, On } from 'claude-code'


export const PLUGIN = 'zh'
export const T0 = Date.parse('2026-10-19T12:00:00Z')

export type Msg = { role: 'user' | 'assistant'; text: string }

/** What the mocked model answers for one request: a result, or a `{ deny }` that rejects the call (an engine refusal). */
export type Answerer = (e: ModelCompleteInput) => ModelCompleteResult | { deny: string }

export const usage = (input = 100, output = 200) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
})

/** The default model: answers `ZH(<prompt>)`. */
export const echo: Answerer = e => ({ isAnswered: true, text: `ZH(${e.prompt})`, usage: usage() })

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  /** Every $.ui.open and $.ui.close that reached the bottom, by pane id. */
  opened: string[]
  closed: string[]
  /** Every $.model.complete request that reached the bottom. */
  calls: ModelCompleteInput[]
  setMessages: (m: Msg[]) => void
  setAnswer: (a: Answerer) => void
  state: (key: string) => unknown
  start: () => Promise<void>
  command: (args: string) => Promise<string>
  /** Lets the timers run: the call starts 10 ms after the request. */
  settle: () => Promise<void>
}

/**
 * The world beneath the plugin: a mocked clock, toasts and panes recorded, a
 * transcript the test sets, and `model.complete` answered beneath the plugin
 * (the test kit has no model mock), each request recorded.
 */
export async function world($: Engine, on: On, messages: Msg[] = []): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const toasts: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const calls: ModelCompleteInput[] = []
  const open = new Set<string>()
  const latest = new Map<string, unknown>()
  let msgs: Msg[] = messages
  let answer: Answerer = echo

  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    const id = (e as { id: string }).id
    opened.push(id)
    open.add(id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    const id = (e as { id: string }).id
    closed.push(id)
    open.delete(id)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('command.register', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.messages', () => ({ value: msgs.map(m => ({ ...m, toolUses: [] })) }) as never)
  on('model.complete', (_$, e) => {
    const req = e as ModelCompleteInput
    calls.push(req)
    const a = answer(req)
    return ('deny' in a ? a : { value: a }) as never
  })

  return {
    clock,
    toasts,
    opened,
    closed,
    calls,
    setMessages: m => (msgs = m),
    setAnswer: a => (answer = a),
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    },
    command: async args => ((await $.command.run({ command: 'zh', args } as never)) as { text?: string }).text ?? '',
    settle: async () => {
      await clock.advance(50)
    },
  }
}

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 100) =>
  ({ title: '', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} }) as never

export const mountPane = ($: Engine, cols = 100, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'zh', props: paneProps(cols) })

/** What the pane shows: its header line, the busy line and the Markdown's text ('' where absent). */
export async function paneView($: Engine): Promise<{ header: string; busy: string; markdown: string }> {
  const ui = await mountPane($)
  const head = (await ui.findAll({ type: 'Text' }))[0]
  // A Text's key is not kept in the drawn props: the busy line is found by its words.
  const busy = await ui.find({ type: 'Text', text: 'Translating reply' })
  const md = await ui.find({ type: 'Markdown' })
  await ui.unmount()
  return {
    header: head?.text ?? '',
    busy: busy?.text ?? '',
    markdown: (md?.props as { text?: string } | undefined)?.text ?? '',
  }
}

/** Presses a pane button and lets its timer and the call run. */
export async function press($: Engine, w: World, key: 'zh-prev' | 'zh-next' | 'zh-close'): Promise<void> {
  const ui = await mountPane($)
  await ui.press({ key })
  await ui.unmount()
  await w.settle()
  await w.settle()
}

export const CONVO: Msg[] = [
  { role: 'user', text: 'First question' },
  { role: 'assistant', text: 'Older reply with `npm test` and **bold**.' },
  { role: 'user', text: 'Second question' },
  { role: 'assistant', text: '' },
  { role: 'assistant', text: 'Newest reply.' },
]
