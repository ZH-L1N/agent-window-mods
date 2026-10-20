// Shared setup for the next mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteInput, On } from 'claude-code'

export const PLUGIN = 'next'
export const T0 = Date.parse('2026-10-20T12:00:00Z')
export const CWD = '/repo'

export type Msg = { role: 'user' | 'assistant'; text: string }
export type PeerGoalShape = { name: string; tasks: { title: string; status: string }[]; doneAt?: number } | null
export type AgentShape = { id: string; status: string }

/** What the mocked model answers a request: a reply's text, a failure, or a rejection (the engine refusing the call). */
export type Answer = { text: string } | { fail: true } | { deny: string }
export type Answerer = (req: ModelCompleteInput) => Answer | Promise<Answer>

/** A long answer (over 300 characters) that ends with a question. */
export const LONG = `${'I rewrote the band hook and ran the suite; everything passes. '.repeat(6)}Should I ship it?`

export const json = (o: unknown) => JSON.stringify(o)
export const THREE = ['Ship it', 'Run the tests again', 'Show me the diff of kit.ts']

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  /** Every $.model.complete request that reached the bottom. */
  calls: ModelCompleteInput[]
  /** Every $.prompt.fill that reached the bottom: its text and mode. */
  fills: { text: string; mode: string }[]
  state: (key: string) => unknown
  start: () => Promise<void>
  setMessages: (m: Msg[]) => void
  setGoal: (g: PeerGoalShape | undefined) => void
  setAgents: (a: AgentShape[]) => void
  setAnswer: (a: Answerer) => void
  /** What the box answers a fill. */
  setFill: (r: { isFilled: boolean; refusal?: 'no_composer' | 'dialog' }) => void
  /** A main-loop turn starting (or a subagent's, with `agentId`). */
  turnStart: (agentId?: string) => Promise<void>
  /** A main-loop turn ending with this answer (or a subagent's, with `agentId`). */
  turnEnd: (answer: string, agentId?: string, reason?: 'answer' | 'aborted' | 'error') => Promise<void>
  /** A prompt sent from the composer; `command` makes it a slash command's line. */
  submit: (text: string, command?: { name: string; args: string }) => Promise<void>
  sessionEnd: (reason: string) => Promise<void>
  command: (args: string) => Promise<string>
  /** Lets the timers run: calls and fills start 10 ms after their hook. */
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
}

/**
 * The world beneath the plugin: a mocked clock, toasts, a transcript, the
 * session's agents and goal-meter's goal as the test sets them, turns and
 * prompts answering as this build's do, `model.complete` and `prompt.fill`
 * answered beneath the plugin (each request recorded; the test kit has no
 * model mock), and another mod's band beneath (a Text `beneath`).
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const toasts: string[] = []
  const calls: ModelCompleteInput[] = []
  const fills: { text: string; mode: string }[] = []
  const latest = new Map<string, unknown>()
  let msgs: Msg[] = []
  let goal: PeerGoalShape | undefined
  let agents: AgentShape[] = []
  let answer: Answerer = () => ({ text: json(THREE) })
  let fill: { isFilled: boolean; refusal?: 'no_composer' | 'dialog' } = { isFilled: true }
  let turns = 0

  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string; key?: string }
    if (a.plugin === 'goal-meter' && a.key === 'goal' && goal !== undefined) return { value: { value: goal, version: 1 } } as never
    return next(e)
  })
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
  on('command.register', async () => ({ value: {} }) as never)
  on('session.messages', () => ({ value: msgs.map(m => ({ ...m, toolUses: [] })) }) as never)
  on('agent.list', () =>
    ({ value: agents.map(a => ({ id: a.id, description: 'task', type: 'general-purpose', status: a.status })) }) as never,
  )
  on('model.complete', async (_$, e) => {
    const req = e as ModelCompleteInput
    calls.push(req)
    const a = await answer(req)
    if ('deny' in a) return a as never
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return {
      value: 'fail' in a ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage } : { isAnswered: true, text: a.text, usage },
    } as never
  })
  on('prompt.fill', (_$, e) => {
    const f = e as { text: string; mode: string }
    if (fill.isFilled) fills.push({ text: f.text, mode: f.mode })
    return fill as never
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

  return {
    clock,
    toasts,
    calls,
    fills,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    },
    setMessages: m => {
      msgs = m
    },
    setGoal: g => {
      goal = g
    },
    setAgents: a => {
      agents = a
    },
    setAnswer: a => {
      answer = a
    },
    setFill: r => {
      fill = r
    },
    turnStart: async agentId => {
      turns++
      await $.turn.start({ text: 'go', turnId: `t${turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    turnEnd: async (text, agentId, reason = 'answer') => {
      await $.turn.complete({
        answer: text,
        durationMs: 1_000,
        isAborted: reason === 'aborted',
        turnId: `t${turns}`,
        reason,
        ...(agentId !== undefined ? { agentId } : {}),
      } as never)
    },
    submit: async (text, command) => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...(command ? { command } : {}) } as never)
    },
    sessionEnd: async reason => {
      await $.session.end({ sessionId: 's1', reason } as never)
    },
    command: async args => ((await $.command.run({ command: 'next', args } as never)) as { text?: string }).text ?? '',
    settle: async () => {
      await clock.advance(50)
    },
  }
}

/** A main-loop turn that answers `text`, then the timers. */
export async function answerTurn(w: World, text: string): Promise<void> {
  await w.turnStart()
  await w.turnEnd(text)
  await w.settle()
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false, isWorking = false) =>
  ({ hasSurvey, isWorking, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, opts: { hasSurvey?: boolean; isWorking?: boolean; surface?: 'terminal' | 'desktop' } = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: opts.surface ?? 'terminal', component: 'AbovePrompt', props: bandProps(cols, opts.hasSurvey, opts.isWorking) })

/** What the row shows: its buttons' keys, labels and hotkeys, and the dim busy line ('' when absent); null when the row is hidden. */
export async function rowView(
  $: Engine,
  cols = 160,
  opts: { hasSurvey?: boolean; isWorking?: boolean; surface?: 'terminal' | 'desktop' } = {},
): Promise<{ buttons: { key: string; label: string; hotkey: string }[]; busy: string } | null> {
  const ui = await mountRow($, cols, opts)
  const drawn = await ui.find({ key: 'next-chip' })
  if (!drawn) {
    await ui.unmount()
    return null
  }
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => {
    const p = (b.props ?? {}) as { label?: string; hotkey?: string }
    return { key: String((b as { key?: unknown }).key ?? ''), label: p.label ?? '', hotkey: p.hotkey ?? '' }
  })
  const line = await ui.find({ key: 'next-line' })
  await ui.unmount()
  type Node = { children?: unknown[] }
  const text = ((line?.children?.[0] ?? {}) as Node).children?.filter(x => typeof x === 'string').join('') ?? ''
  return { buttons, busy: text }
}

/** Presses a row button and lets its timers run. */
export async function press($: Engine, w: World, key: string): Promise<void> {
  const ui = await mountRow($)
  await ui.press({ key })
  await ui.unmount()
  await w.settle()
  await w.settle()
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
