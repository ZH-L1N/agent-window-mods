import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { AGENT_RETRY_MS, EMPTY, PAUSE_TOAST } from './queue'
import { SURVEY_RETRIES, SURVEY_RETRY_MS } from './register'
import type { QueueState } from '../types'

const PLUGIN = 'queue'
const T0 = Date.parse('2026-11-15T12:00:00Z')

/** One run as the agents mod records it, in the fields the queue reads. */
type Run = { id: string; status: string; kind?: string }

/**
 * The engine beneath the plugin: a clock, toasts, submitted prompts, opened
 * panes, turns, and the agents mod's runs (`agents.runs`) once the test sets
 * them; never set, the agents mod is not loaded and the value reads undefined.
 */
async function world($: Engine, on: On) {
  const clock = mock.clock(on, { now: T0 })
  const toasts: string[] = []
  const sent: { text: string; asUser?: boolean }[] = []
  const opened: string[] = []
  let turns = 0
  let runs: Run[] | undefined
  let runsVersion = 0
  // The queue's own value as last written, and a change the next write carries (a reload's leftover).
  let latest: QueueState = EMPTY
  let rewrite: ((s: QueueState) => QueueState) | null = null
  // Run once between the automatic send's read of the agents' runs and its
  // take: at the first read of the queue after that read of the runs.
  // `atRuns` runs it instead as the read of the runs answers, before the take begins.
  let beforeTake: (() => Promise<void>) | null = null
  let isAtRuns = false
  let isRunsRead = false
  // Run once right after a write of the queue that marks a prompt on its way has landed.
  let afterTake: (() => Promise<void>) | null = null
  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string; key?: string }
    if (a.plugin === 'agents' && a.key === 'runs') {
      isRunsRead = true
      if (isAtRuns && beforeTake) {
        const fn = beforeTake
        beforeTake = null
        await fn()
      }
      if (runs !== undefined) return { value: { value: runs, version: runsVersion } } as never
    } else if (a.plugin === PLUGIN && a.key === 'queue' && isRunsRead && beforeTake) {
      const fn = beforeTake
      beforeTake = null
      await fn()
    }
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin !== PLUGIN || w.key !== 'queue') return next(e)
    const value = rewrite ? rewrite(w.value as QueueState) : (w.value as QueueState)
    rewrite = null
    const done = await next({ ...e, value } as never)
    if ((done as { isSet?: boolean }).isSet !== false) {
      latest = value
      if (value.isSending && afterTake) {
        const fn = afterTake
        afterTake = null
        await fn()
      }
    }
    return done
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  // How the next submit is answered: taken (the default), dropped, or failed
  // (handed on to nothing beneath, so the plugin's call rejects).
  let nextSubmit: { drop: string } | { fail: true } | null = null
  on('prompt.submit', (_$, e, next) => {
    const p = e as { text: string; asUser?: boolean; origin?: { asUser?: boolean } }
    const how = nextSubmit
    nextSubmit = null
    if (how && 'drop' in how) return { drop: how.drop } as never
    if (how && 'fail' in how) return next(e)
    sent.push({ text: p.text, asUser: p.asUser ?? p.origin?.asUser })
    return { text: p.text } as never
  })
  on('ui.open', (_$, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  // A main-loop turn start can be held beneath the plugin: `onHeld` resolves
  // once one reaches here, and it goes on when `release` is called.
  let turnHold: { reached: () => void; gate: Promise<void> } | null = null
  on('turn.start', async (_$, e) => {
    const hold = turnHold
    turnHold = null
    if (hold) {
      hold.reached()
      await hold.gate
    }
    return { turnId: (e as { turnId: string }).turnId } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return {
    toasts,
    sent,
    opened,
    command: async (args: string) => ((await $.command.run({ command: 'q', args } as never)) as { text?: string }).text ?? '',
    turnStart: async (agentId?: string) => {
      turns++
      await $.turn.start({ text: 'go', turnId: `t${turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    turnEnd: async (reason: 'answer' | 'aborted' | 'error' = 'answer', agentId?: string) => {
      await $.turn.complete({
        answer: 'done',
        durationMs: 1_000,
        isAborted: reason === 'aborted',
        turnId: `t${turns}`,
        reason,
        ...(agentId !== undefined ? { agentId } : {}),
      } as never)
    },
    settle: () => clock.advance(50),
    advance: (ms: number) => clock.advance(ms),
    setRuns: (next: Run[]) => {
      runs = next
      runsVersion++
    },
    state: async (): Promise<QueueState> => latest,
    /** The plugin's next write of its queue carries this change too. */
    rewriteNext: (fn: (s: QueueState) => QueueState) => {
      rewrite = fn
    },
    startSession: () => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never),
    endSession: () => $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never),
    /** The next submit is dropped with this reason, or fails (the plugin's call rejects). */
    failNextSubmit: (how: { drop: string } | { fail: true }) => {
      nextSubmit = how
    },
    /** `fn` runs once, after the next automatic send has read the agents' runs and before it takes its item. */
    beforeTake: (fn: () => Promise<void>, where: 'take' | 'runs' = 'take') => {
      isRunsRead = false
      isAtRuns = where === 'runs'
      beforeTake = fn
    },
    /** `fn` runs once, right after the next write that marks a prompt of the queue's on its way has landed. */
    afterTake: (fn: () => Promise<void>) => {
      afterTake = fn
    },
    /**
     * Holds the next turn start beneath the plugin: `reached` resolves once it
     * gets there (the plugin's hook has run up to its `next(e)`), and it goes
     * on when `release` is called.
     */
    holdTurnStart: () => {
      let reached!: () => void
      let release!: () => void
      const isReached = new Promise<void>(r => (reached = r))
      const gate = new Promise<void>(r => (release = r))
      turnHold = { reached, gate }
      return { reached: isReached, release }
    },
  }
}

const bandProps = (hasSurvey = false) =>
  ({ hasSurvey, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

async function bandButtons($: Engine, hasSurvey = false): Promise<string[] | null> {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(hasSurvey) })
  const chip = await ui.find({ key: 'queue-chip' })
  const labels = (await ui.findAll({ type: 'Button' })).map(b => String((b.props as { label?: string }).label ?? ''))
  await ui.unmount()
  return chip ? labels : null
}

test('turn complete: a main-loop answer sends item 1 from a timer; the next turn end sends item 2', async ($, on) => {
  const w = await world($, on)
  expect(await w.command('first prompt')).toBe('Queued as item 1 of 1.')
  expect(await w.command('add second prompt')).toBe('Queued as item 2 of 2.')
  expect(await bandButtons($)).toEqual(['next', 'pause', 'pane'])

  await w.turnStart()
  await w.turnEnd('answer')
  // Never inside the hook.
  expect(w.sent).toEqual([])
  await w.settle()
  expect(w.sent).toEqual([{ text: 'first prompt', asUser: true }])
  expect(await w.command('list')).toBe('1 item queued:\n1. second prompt')

  // A second turn end before the sent prompt's turn starts sends nothing more.
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toHaveLength(1)

  // The sent prompt's turn runs and answers: item 2 goes.
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['first prompt', 'second prompt'])
  expect(await bandButtons($)).toBeNull()
})

test('turn complete: an interrupted or failed turn pauses with a toast; a subagent turn is ignored; resume sends again', async ($, on) => {
  const w = await world($, on)
  await w.command('alpha')
  await w.command('beta')

  await w.turnStart('a1')
  await w.turnEnd('error', 'a1')
  await w.settle()
  expect(w.sent).toEqual([])
  expect(w.toasts).toEqual([])

  await w.turnStart()
  await w.turnEnd('aborted')
  await w.settle()
  expect(w.sent).toEqual([])
  expect(w.toasts).toEqual([PAUSE_TOAST])
  expect(await bandButtons($)).toEqual(['next', 'resume', 'pane'])

  // Paused: an answer sends nothing.
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])

  expect(await w.command('resume')).toBe('Queue resumed; the next item is sent when a turn ends (or /q next).')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['alpha'])

  await w.turnStart()
  await w.turnEnd('error')
  expect(w.toasts).toEqual([PAUSE_TOAST, PAUSE_TOAST])
})

test('band buttons and /q next send by hand; the pane button opens the pane', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.command('pause')
  expect(await w.command('next')).toBe('Sending item 1: one')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps() })
  await ui.press({ key: 'queue-pane' })
  await ui.unmount()
  await w.settle()
  expect(w.opened).toEqual(['queue'])

  // A survey holds the band: no row.
  expect(await bandButtons($, true)).toBeNull()
})

test('pane: numbered list, the selection highlighted, j/k/u/x/s act on it', async ($, on) => {
  const w = await world($, on)
  await w.command('aaa')
  await w.command('bbb')
  await w.command('ccc')
  const PANE = {
    plugin: PLUGIN,
    component: 'Pane',
    requestId: 'queue',
    surface: 'terminal',
    props: { title: 'Queue', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const
  const press = async (key: string) => {
    const ui = await $.ui.mount(PANE as never)
    await ui.press({ key })
    await ui.unmount()
    await w.settle()
  }
  const items = async () => {
    const ui = await $.ui.mount(PANE as never)
    const rows = (await ui.findAll({ type: 'Text', text: /^[ >]\s*\d+\. / })).map(t => t.text)
    const buttons = (await ui.findAll({ type: 'Button' })).map(b => (b.props as { hotkey?: string }).hotkey)
    await ui.unmount()
    return { rows, buttons }
  }
  expect(await items()).toEqual({
    rows: ['> 1. aaa', '  2. bbb', '  3. ccc'],
    buttons: ['j', 'k', 'x', 'u', 's', 'c'],
  })
  await press('queue-down')
  await press('queue-down')
  await press('queue-moveup')
  expect((await items()).rows).toEqual(['  1. aaa', '> 2. ccc', '  3. bbb'])
  await press('queue-rm')
  expect((await items()).rows).toEqual(['  1. aaa', '> 2. bbb'])
  await press('queue-send')
  expect(w.sent.map(s => s.text)).toEqual(['bbb'])
  expect((await items()).rows).toEqual(['> 1. aaa'])
})

test('survey: the turn-end send waits while a survey shows, sends once when it goes, and two turn ends never send twice', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  // A survey holds the band: no row, and the turn-end send waits.
  expect(await bandButtons($, true)).toBeNull()
  await w.turnStart()
  await w.turnEnd('answer')
  await w.turnEnd('answer')
  await w.settle()
  await w.advance(5_000)
  expect(w.sent).toEqual([])

  // The survey goes: exactly one item is sent, however many turn ends waited.
  await bandButtons($, false)
  await w.advance(10_000)
  expect(w.sent.map(s => s.text)).toEqual(['one'])

  // Its turn runs and answers: the next item follows.
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one', 'two'])
})

test('a main-loop turn that starts while a send waits on a survey cancels that send', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  expect(await bandButtons($, true)).toBeNull()
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  // The person types a prompt: its turn starts, the waiting send is dropped.
  await w.turnStart()
  await bandButtons($, false)
  await w.advance(10_000)
  expect(w.sent).toEqual([])
  // That turn's own end sends.
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

/** The band row's texts, or null when the row is not drawn. */
async function rowTexts($: Engine): Promise<string[] | null> {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps() })
  const chip = await ui.find({ key: 'queue-chip' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return chip ? texts : null
}

const RUNNING_AGENT: Run = { id: 'r1', kind: 'agent', status: 'running' }
const FINISHED_AGENT: Run = { id: 'r1', kind: 'agent', status: 'finished' }

test('an automatic send waits while an agent runs', async ($, on) => {
  const w = await world($, on)
  w.setRuns([RUNNING_AGENT, { id: 'c1', kind: 'cron', status: 'running' }])
  await w.command('first')
  await w.command('second')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])
  expect((await w.state()).waitingOn).toBe('agents')
  expect((await rowTexts($))?.some(t => t.includes('waiting on agents'))).toBe(true)

  // Still running: each retry looks again and sends nothing.
  await w.advance(AGENT_RETRY_MS * 3)
  expect(w.sent).toEqual([])

  // The agent's run finishes (the cron goes on): the next retry submits item 1.
  w.setRuns([FINISHED_AGENT, { id: 'c1', kind: 'cron', status: 'running' }])
  await w.advance(AGENT_RETRY_MS)
  expect(w.sent).toEqual([{ text: 'first', asUser: true }])
  const s = await w.state()
  expect(s.waitingOn).toBe('')
  expect(s.isSending).toBe(true)
  expect(s.items).toEqual(['second'])
  expect((await rowTexts($))?.some(t => t.includes('waiting on agents'))).toBe(false)
})

test('a manual send goes anyway', async ($, on) => {
  const w = await world($, on)
  w.setRuns([RUNNING_AGENT])
  await w.command('one')
  await w.command('two')
  await w.command('three')
  expect(await w.command('next')).toBe('Sending item 1: one')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])

  // The band's next button and the pane's send go too.
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps() })
  await band.press({ key: 'queue-next' })
  await band.unmount()
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one', 'two'])
  expect(await w.command('send 1')).toBe('Sending item 1: three')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one', 'two', 'three'])
  expect((await w.state()).waitingOn).toBe('')
})

test('no agents mod: sends as before', async ($, on) => {
  const w = await world($, on)
  await w.command('alpha')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['alpha'])
  expect((await w.state()).waitingOn).toBe('')
})

test('a reload does not send twice', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  // A reload while a prompt of the queue's is on its way: the module's memory
  // is gone, the state still says a send is pending.
  w.rewriteNext(s => ({ ...s, isSending: true }))
  await w.command('two')
  expect((await w.state()).isSending).toBe(true)
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])

  // The reload fires session.start again: the flag survives it, and a turn
  // end still sends nothing.
  await w.startSession()
  expect((await w.state()).isSending).toBe(true)
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])

  // The pending prompt's main-loop turn starts and ends: item 1 is sent, once.
  await w.turnStart()
  expect((await w.state()).isSending).toBe(false)
  await w.turnEnd('answer')
  await w.settle()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

test('the wait for agents ends when the queue is paused, emptied or a main turn starts', async ($, on) => {
  const w = await world($, on)
  w.setRuns([RUNNING_AGENT])
  await w.command('one')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect((await w.state()).waitingOn).toBe('agents')

  // Paused: the wait ends, and nothing goes when the agent finishes.
  await w.command('pause')
  expect((await w.state()).waitingOn).toBe('')
  w.setRuns([FINISHED_AGENT])
  await w.advance(AGENT_RETRY_MS * 2)
  expect(w.sent).toEqual([])

  // A main-loop turn starting ends a wait too; its own end sends.
  await w.command('resume')
  w.setRuns([RUNNING_AGENT])
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect((await w.state()).waitingOn).toBe('agents')
  await w.turnStart()
  expect((await w.state()).waitingOn).toBe('')
  w.setRuns([FINISHED_AGENT])
  await w.advance(AGENT_RETRY_MS * 2)
  expect(w.sent).toEqual([])
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])

  // Emptied: the wait ends.
  await w.command('two')
  w.setRuns([RUNNING_AGENT])
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect((await w.state()).waitingOn).toBe('agents')
  await w.command('clear')
  expect((await w.state()).waitingOn).toBe('')
})

test('a slash command is not queued', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  const before = await w.state()
  const REFUSAL = 'Slash commands cannot be queued: type them directly.'
  expect(await w.command('/compact')).toBe(REFUSAL)
  expect(await w.command('add /clear now')).toBe(REFUSAL)
  expect(await w.command('add    /model x')).toBe(REFUSAL)
  expect(await w.state()).toEqual(before)
  expect(await w.command('list')).toBe('1 item queued:\n1. one')
  // A slash later in the text is an ordinary prompt.
  expect(await w.command('add read a/b')).toBe('Queued as item 2 of 2.')
})

test('a cancelled automatic send takes nothing: a main-loop turn starts before the take', async ($, on) => {
  // A main-loop turn starts between the automatic send's read of the agents
  // and its take: the cancelled send takes nothing; that turn's end sends.
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.turnStart()
  w.beforeTake(() => w.turnStart())
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])
  expect(await w.state()).toEqual({ ...EMPTY, items: ['one', 'two'] })
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

test('a cancelled automatic send takes nothing: a manual send lands before the take', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.turnStart()
  w.beforeTake(async () => {
    expect(await w.command('next')).toBe('Sending item 1: one')
    await w.settle()
  }, 'runs')
  await w.turnEnd('answer')
  await w.settle()
  await w.advance(AGENT_RETRY_MS * 2)
  // The manual send went; the automatic one took nothing for this turn end.
  expect(w.sent.map(s => s.text)).toEqual(['one'])
  const s = await w.state()
  expect(s.items).toEqual(['two'])
  expect(s.isSending).toBe(true)
  // The sent prompt's own turn end sends the next item.
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one', 'two'])
})

test('a cancelled automatic send sends nothing: a main-loop turn starts right after its take has landed', async ($, on) => {
  // The take is written, then a main-loop turn starts before the submit: the
  // item goes back first in line, not paused, nothing on its way, no toast.
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.turnStart()
  w.afterTake(() => w.turnStart())
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])
  expect(w.toasts).toEqual([])
  expect(await w.state()).toEqual({ ...EMPTY, items: ['one', 'two'] })
  // That turn's own end sends item 1, once.
  await w.turnEnd('answer')
  await w.settle()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

test('a cancelled automatic send sends nothing: a main-loop turn start still on its way down the chain', async ($, on) => {
  // The turn start reaches the plugin right after the take has landed, but the
  // engine beneath has not answered it yet: the cancel already stands.
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.turnStart()
  let release = () => {}
  let starting: Promise<void> = Promise.resolve()
  w.afterTake(async () => {
    const hold = w.holdTurnStart()
    release = hold.release
    starting = w.turnStart()
    await hold.reached
  })
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent).toEqual([])
  expect(w.toasts).toEqual([])
  expect(await w.state()).toEqual({ ...EMPTY, items: ['one', 'two'] })
  release()
  await starting
  expect(await w.state()).toEqual({ ...EMPTY, items: ['one', 'two'] })
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

test('a manual send answered before the automatic take does not send the next item in its place', async ($, on) => {
  // `/q next` is answered (naming item 1) just before the automatic send takes
  // item 1; its work runs after that take: it sends nothing and says why.
  const w = await world($, on)
  await w.command('one')
  await w.command('two')
  await w.turnStart()
  w.beforeTake(async () => {
    expect(await w.command('next')).toBe('Sending item 1: one')
  })
  await w.turnEnd('answer')
  await w.settle()
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
  const s = await w.state()
  expect(s.items).toEqual(['two'])
  expect(s.isSending).toBe(true)
  expect(w.toasts).toEqual(['queue: item 1 changed before it was sent; /q list'])
})

for (const c of [
  {
    name: 'a dropped submit puts the item back and pauses',
    how: { drop: 'blocked by a hook' },
    toast: /^queue paused: the prompt was not sent \(blocked by a hook\); \/q resume$/,
  },
  {
    name: 'a failed submit puts the item back and pauses',
    how: { fail: true as const },
    toast: /^queue paused: sending failed \(.+\); \/q resume$/,
  },
]) {
  test(c.name, async ($, on) => {
    const w = await world($, on)
    await w.command('one')
    await w.command('two')
    await w.turnStart()
    w.failNextSubmit(c.how)
    await w.turnEnd('answer')
    await w.settle()
    expect(w.sent).toEqual([])
    const s = await w.state()
    expect(s.items).toEqual(['one', 'two'])
    expect(s.isPaused).toBe(true)
    expect(s.isSending).toBe(false)
    expect(s.waitingOn).toBe('')
    expect(w.toasts).toHaveLength(1)
    expect(c.toast.test(w.toasts[0] ?? '')).toBe(true)

    // Resumed, the next turn end sends item 1, once.
    await w.command('resume')
    await w.turnStart()
    await w.turnEnd('answer')
    await w.settle()
    await w.turnEnd('answer')
    await w.settle()
    expect(w.sent.map(s => s.text)).toEqual(['one'])
  })
}

test('an older stored value is filled in: it lists and sends once', async ($, on) => {
  const w = await world($, on)
  // A value an earlier version wrote, before isSending and waitingOn existed.
  w.rewriteNext(s => ({ items: s.items, isPaused: s.isPaused, selected: s.selected }) as QueueState)
  await w.command('one')
  const stored = await w.state()
  expect('isSending' in stored || 'waitingOn' in stored).toBe(false)
  expect(await w.command('list')).toBe('1 item queued:\n1. one')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  await w.turnEnd('answer')
  await w.settle()
  expect(w.sent.map(s => s.text)).toEqual(['one'])
})

test('a session end stops a wait', async ($, on) => {
  const w = await world($, on)
  w.setRuns([RUNNING_AGENT])
  await w.command('one')
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  const before = await w.state()
  expect(before.waitingOn).toBe('agents')

  await w.endSession()
  w.setRuns([FINISHED_AGENT])
  await w.advance(AGENT_RETRY_MS * 2)
  expect(w.sent).toEqual([])
  const s = await w.state()
  expect(s.waitingOn).toBe('')
  expect(s.isSending).toBe(before.isSending)
  expect(s.items).toEqual(['one'])
})

test('a survey that stays ends the wait', async ($, on) => {
  const w = await world($, on)
  await w.command('one')
  expect(await bandButtons($, true)).toBeNull()
  await w.turnStart()
  await w.turnEnd('answer')
  await w.settle()
  expect((await w.state()).waitingOn).toBe('survey')

  await w.advance(SURVEY_RETRIES * SURVEY_RETRY_MS + SURVEY_RETRY_MS)
  expect(w.toasts).toEqual(['queue waiting: a survey is showing; /q next sends item 1'])
  const s = await w.state()
  expect(s.waitingOn).toBe('')
  expect(s.items).toEqual(['one'])
  expect(w.sent).toEqual([])
  // Given up: no retry is left to send later.
  await w.advance(SURVEY_RETRY_MS * 5)
  expect(w.sent).toEqual([])
})
