import { describe, expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { C, CAP_L, CAP_R, WORK_W } from './pills'
import { FRAMES, SPIN_CAP_L, SPIN_CAP_R, SPIN_COLOR, SPIN_SURFACE, SPIN_W } from './spin'
import { EDIT_RESULT, ROW_KEY, T0, WRITE_RESULT, lastList, mountBand, mountList, mountPane, pillWords, row, stripDrawn, world } from './test-kit'

const BAR = (filled: number): string => '\u25b0'.repeat(filled) + '\u25b1'.repeat(10 - filled)
const IDLE_SAVE = { phase: 'idle', requestedAt: 0, baseMtime: 0, savedAt: 0, via: '' }
/** The local day of a moment, `YYYY-MM-DD`, as token-weather writes `today.ymd`. */
const dayOf = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every owner loaded and quiet. 70,140 of a 167,000 threshold is 42%; the cache was touched 23 minutes ago. */
const LIVE: Record<string, unknown> = {
  'token-weather.context': {
    categories: [
      { name: 'System prompt', tokens: 4_000, color: '#89b4fa', kind: 'used' },
      { name: 'Messages', tokens: 66_140, color: '#cba6f7', kind: 'used' },
      { name: 'Free space', tokens: 113_860, color: '#9a9a96', kind: 'free' },
    ],
    totalTokens: 70_140,
    maxTokens: 200_000,
    autoCompactThreshold: 167_000,
    percent: 35,
    readAt: T0,
  },
  'token-weather.totals': { costUsd: 1.25, today: { ymd: dayOf(T0), tokens: 1_234_567 }, month: { ym: '2026-11', usd: 412.4, tokens: 98_765_432 }, readAt: T0 },
  'handoff.context': null,
  'handoff.clearedAt': 0,
  // handoff writes isOver only when the fill crosses its threshold or after a clear: absent in an ordinary session.
  'handoff.save': IDLE_SAVE,
  'handoff.offer': null,
  'cache-clock.lastCacheAt': T0 - 23 * 60_000,
  'cache-clock.now': T0,
  'agents.runs': [
    { status: 'running', kind: 'agent' },
    { status: 'running' },
    { status: 'running', kind: 'cron' },
    { status: 'running', kind: 'shell' },
    { status: 'finished', kind: 'agent' },
  ],
  'queue.queue': { items: ['one', 'two', 'three'], isPaused: false, selected: 0, isSending: false, waitingOn: '' },
  'sys.reading': { cpu: 20, ram: { used: 32 * 1024 ** 3, total: 64 * 1024 ** 3 }, battery: { percent: 65, isCharging: false }, readAt: T0 },
  'peers.seen': {
    'w1:p2': { status: 'blocked', since: T0, agent: 'claude', title: '' },
    'w1:p6': { status: 'working', since: T0, agent: 'claude', title: '' },
    'w1:p4': { status: 'idle', since: T0, agent: 'claude', title: '' },
    'w1:p5': { status: 'done', since: T0, agent: 'claude', title: '' },
  },
  'redgreen.runs': [
    { passed: 3, failed: 1, skipped: 0, at: T0 - 60_000 },
    { passed: 14, failed: 0, skipped: 0, at: T0 },
  ],
  'motion-hold.active': null,
}

/**
 * Another mod that opens panes of its own: /other-open takes the open's
 * argument as JSON. The test's `$` is the engine, which opens no pane itself.
 */
const OTHER: Plugin = {
  name: 'other',
  register(on) {
    on('command.run', { command: 'other-open' }, async ($, e) => {
      await $.ui.open(JSON.parse(e.args))
      return { text: 'opened' }
    })
  },
}
const openOther = ($: Engine, pane: Record<string, unknown>) => $.command.run({ command: 'other-open', args: JSON.stringify(pane) } as never)

const COMMANDS = ['motion', 'compact-offer', 'cache-clock', 'tests', 'agents-info', 'q', 'peer-alarm', 'sys']
const BAND = ['sys', 'token-weather', 'handoff', 'cache-clock', 'strip', 'next', 'agents']

describe('strip', () => {
  test('live values from the other mods', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'context')).toBe(`${BAR(4)} 42%`)
    expect(await pillWords(ui, 'cache')).toBe('37m')
    expect(await pillWords(ui, 'diff')).toBe('0')
    expect(await pillWords(ui, 'tests')).toBe('14')
    // A running cron and a running shell are not agents.
    expect(await pillWords(ui, 'agents')).toBe('2')
    expect(await pillWords(ui, 'queue')).toBe('3')
    expect(await pillWords(ui, 'system')).toBe('')
    expect(await pillWords(ui, 'peers')).toBe('4 \xb7 1 waiting')
    expect(await pillWords(ui, 'stop')).toBe(null)
    expect(await pillWords(ui, 'health')).toBe(null)
    // One keyed row; each pill a plain Button with no hotkey.
    expect((await ui.find({ key: ROW_KEY }))?.type).toBe('Box')
    const cache = await ui.find({ key: 'sp-cache' })
    expect(cache?.type).toBe('Button')
    expect(cache?.props.plain).toBe(true)
    expect(cache?.props.hotkey).toBeUndefined()
    // An idle pill: its colour on the surface, caps in the surface colour.
    const minutes = await ui.find({ type: 'Text', text: '37m' })
    expect(minutes?.props.color).toBe(C.teal)
    expect(minutes?.props.backgroundColor).toBe(C.surface)
    expect((await ui.find({ type: 'Text', text: CAP_L }))?.props.color).toBe(C.surface)
    expect((await ui.find({ type: 'Text', text: '4 \xb7 1 waiting' }))?.props.color).toBe(C.peach)
    await ui.unmount()
    expect((await stripDrawn($)).ids).toEqual(['context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers'])
  })

  test('no other mod loaded', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const ui = await mountBand($)
    // 50,100 of the 167,000 threshold, from the strip's own reading.
    expect(await pillWords(ui, 'context')).toBe(`${BAR(3)} 30%`)
    expect(await pillWords(ui, 'cache')).toBe('\u2013')
    expect(await pillWords(ui, 'diff')).toBe('0')
    expect(await pillWords(ui, 'tests')).toBe('\u2013')
    expect(await pillWords(ui, 'agents')).toBe('0')
    expect(await pillWords(ui, 'queue')).toBe('0')
    expect(await pillWords(ui, 'system')).toBe('')
    expect(await pillWords(ui, 'peers')).toBe('0')
    expect(await pillWords(ui, 'stop')).toBe(null)
    expect(await pillWords(ui, 'health')).toBe(null)
    for (const words of ['\u2013', '0']) {
      for (const t of await ui.findAll({ type: 'Text', text: words })) {
        if (t.text === words) expect(t.props.color).toBe(C.dim)
      }
    }
    await ui.unmount()
    const report = await w.strip('sources')
    expect(report).toContain('context: own $.session.usage reading, 30% of the auto-compact threshold')
    expect(report).toContain('cache: none: the cache-clock mod has written no value yet, or is not loaded')
    expect(report).toContain('system: none: the sys mod has written no value yet, or is not loaded')
  })

  test('without a breakdown the own reading is of the window', async ($, on) => {
    const w = await world($, on, { isNoBreakdown: true })
    await w.start()
    expect(await w.strip('sources')).toContain('context: own $.session.usage reading, 9% of the window')
  })

  test('a broken owner', async ($, on) => {
    const w = await world($, on, { peers: LIVE, broken: ['sys.reading', 'agents.runs', 'token-weather.context'] })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'system')).toBe('')
    expect(await pillWords(ui, 'agents')).toBe('0')
    // The context falls back to the strip's own reading.
    expect(await pillWords(ui, 'context')).toBe(`${BAR(3)} 30%`)
    expect(await pillWords(ui, 'cache')).toBe('37m')
    await ui.unmount()
    const report = await w.strip('sources')
    expect(report).toContain('system: none: sys.reading could not be read')
    expect(report).toContain('agents: none: agents.runs could not be read')
    // Its pane says there is no reading rather than failing.
    const pane = await mountPane($, 'strip-system')
    expect(await pane.find({ type: 'Text', text: 'No reading: the sys mod is not loaded.' })).toBeDefined()
    await pane.unmount()
  })

  test('/strip sources', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    for (const args of ['sources', '']) {
      const report = await w.strip(args)
      expect(report).toContain('context: token-weather.context, 42% of the auto-compact threshold')
      expect(report).toContain('cache: cache-clock.lastCacheAt, 37m left of a 60-minute window')
      expect(report).toContain('tests: redgreen.runs, the last run: 14 passed, 0 failed')
      expect(report).toContain('agents: agents.runs, 2 running subagents of 5 runs')
      expect(report).toContain('queue: queue.queue, 3 waiting')
      expect(report).toContain('system: sys.reading, RAM 50% CPU 20%')
      expect(report).toContain('peers: peers.seen, 4 other panes, 1 waiting')
      expect(report).toContain('stop: motion-hold.active: nothing is moving')
      expect(report).toContain('health: own record: nothing is wrong')
      expect(report).toContain('rows: hidden')
      expect(report).toContain(`${CAP_L}`)
    }
    expect(await w.strip('nonsense')).toContain('Usage: /strip sources')
  })

  test('the cache window follows the cache-clock option', async ($, on) => {
    const w = await world($, on, { peers: { ...LIVE, 'cache-clock.lastCacheAt': T0 - 2 * 60_000 }, config: { 'cache-clock.cacheMinutes': '5' } })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'cache')).toBe('3m')
    expect((await ui.find({ type: 'Text', text: '3m' }))?.props.color).toBe(C.yellow)
    await ui.unmount()
    // The tick moves the minutes on.
    await w.clock.advance(60_000)
    const later = await mountBand($)
    expect(await pillWords(later, 'cache')).toBe('2m')
    await later.unmount()
    await w.clock.advance(3 * 60_000)
    const cold = await mountBand($)
    expect(await pillWords(cold, 'cache')).toBe('cold')
    await cold.unmount()
  })

  test('the tick stops when the session ends and starts again at the next main turn', async ($, on) => {
    // Every value the strip writes to its own `now`, as the state beneath records it.
    const ticks: unknown[] = []
    on('state.set', async (_$, e, next) => {
      const w = e as { plugin: string; key: string; value: unknown }
      if (w.plugin === 'strip' && w.key === 'now') ticks.push(w.value)
      return next(e)
    })
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const tick = async (): Promise<unknown> => ticks.at(-1)
    expect(await tick()).toBe(T0)
    await w.clock.advance(30_000)
    expect(await tick()).toBe(T0 + 30_000)
    // An end that is not a /clear or a resume: no further tick.
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1' } as never)
    await w.clock.advance(60_000)
    expect(await tick()).toBe(T0 + 30_000)
    // A main-loop turn starts it again.
    await w.turnStart()
    await w.clock.advance(30_000)
    expect(await tick()).toBe(T0 + 120_000)
  })

  test('diff counts applied edits only', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const diff = async (): Promise<string | null> => {
      const ui = await mountBand($)
      const words = await pillWords(ui, 'diff')
      await ui.unmount()
      return words
    }
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await w.write(WRITE_RESULT)
    await w.edit(EDIT_RESULT, { answer: 'deny' })
    await w.edit(EDIT_RESULT, { answer: 'error' })
    await w.edit({ ...EDIT_RESULT, staged: true })
    await w.write({ ...WRITE_RESULT, staged: true })
    expect(await diff()).toBe('2')
    // A subagent's edit counts; its turn's end does not close the main turn.
    await w.edit({ ...EDIT_RESULT, filePath: '/repo/src/b.ts' }, { agentId: 'agent-1' })
    await w.turnEnd('answer', 'agent-1')
    expect(await diff()).toBe('3')
    await w.turnEnd()
    expect(await diff()).toBe('3')
    const ui = await mountBand($)
    expect((await ui.find({ type: 'Text', text: /^3$/ }))?.props.color).toBe(C.mauve)
    await ui.unmount()
    // A turn with no edits keeps the last set.
    await w.turnStart()
    expect(await diff()).toBe('3')
    await w.turnEnd()
    expect(await diff()).toBe('3')
    // A turn keeps its newest 50 steps.
    await w.turnStart()
    for (let i = 0; i < 53; i++) await w.edit({ ...EDIT_RESULT, filePath: `/repo/src/f${i}.ts` })
    expect(await diff()).toBe('50')
    await w.turnEnd()
    const pane = await mountPane($, 'strip-diff')
    expect(await pane.find({ type: 'Text', text: /^Step 1\/50 .* \/repo\/src\/f3\.ts / })).toBeDefined()
    await pane.unmount()
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await w.write(WRITE_RESULT)
    await w.edit(EDIT_RESULT, { agentId: 'agent-1' })
    await w.turnEnd()
    // A result that is no Edit's adds nothing.
    await w.turnStart()
    await w.edit(null)
    await w.edit({})
    await w.turnEnd()
    expect(await diff()).toBe('3')
  })

  test('an edit a background subagent applies between main turns joins the last turn', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const diff = async (): Promise<string | null> => {
      const ui = await mountBand($)
      const words = await pillWords(ui, 'diff')
      await ui.unmount()
      return words
    }
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await w.turnEnd()
    expect(await diff()).toBe('1')
    // No main-loop turn runs: a background subagent's Write is shown at once.
    await w.write(WRITE_RESULT, { agentId: 'agent-1' })
    expect(await diff()).toBe('2')
    expect(await w.strip('diff 2')).toBe('Step 2/2.')
    let pane = await mountPane($, 'strip-diff')
    expect(await pane.find({ type: 'Text', text: /^Step 2\/2 \xb7 Write \xb7 \/repo\/notes\/new\.txt/ })).toBeDefined()
    await pane.unmount()
    // The next main turn, with no edits of its own, keeps it.
    await w.turnStart()
    await w.turnEnd()
    expect(await diff()).toBe('2')
    pane = await mountPane($, 'strip-diff')
    expect(await pane.find({ type: 'Text', text: /^Step 2\/2 \xb7 Write/ })).toBeDefined()
    await pane.unmount()
  })

  test('steps left over when a turn starts join the last turn instead of being dropped', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const diff = async (): Promise<string | null> => {
      const ui = await mountBand($)
      const words = await pillWords(ui, 'diff')
      await ui.unmount()
      return words
    }
    // A turn records an edit and never reports its end (or an edit raced that end).
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    // The next main turn starts: the step is kept as the last turn's, not wiped.
    await w.turnStart()
    await w.turnEnd()
    expect(await diff()).toBe('1')
    expect(await w.strip('diff 1')).toBe('Step 1/1.')
  })

  test('a press opens the context pane', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const ui = await mountBand($)
    await ui.press({ key: 'sp-context' })
    await ui.press({ key: 'sp-diff' })
    await ui.press({ key: 'sp-system' })
    await ui.unmount()
    expect(w.opens).toEqual([
      { id: 'strip-context', title: 'Context', focus: true, backgroundColor: 'transparent' },
      { id: 'strip-diff', title: 'Last turn', focus: true, backgroundColor: 'transparent' },
      { id: 'strip-system', title: 'System', focus: true, backgroundColor: 'transparent' },
    ])
    expect(w.toasts).toEqual([])
    expect(w.runs).toEqual([])
  })

  test('not placed falls back to the twin', async ($, on) => {
    const w = await world($, on, { peers: LIVE, isPlaced: false })
    await w.start()
    const ui = await mountBand($)
    await ui.press({ key: 'sp-context' })
    await ui.unmount()
    expect(w.toasts).toEqual(['/strip context queued until the turn ends'])
    expect(w.runs).toEqual([])
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'strip', args: 'context' }])
    // The twin itself opens once more and does not queue itself again.
    expect(await w.strip('context')).toContain('waiting for room')
    await w.clock.advance(100)
    expect(w.runs.length).toBe(1)
    expect(w.toasts.length).toBe(1)
  })

  test('the cache pill prefers the compaction offer', async ($, on) => {
    const w = await world($, on, { peers: LIVE, commands: ['compact-offer', 'cache-clock'] })
    await w.start()
    const ui = await mountBand($)
    await ui.press({ key: 'sp-cache' })
    await ui.unmount()
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'compact-offer', args: '' }])
    expect(w.toasts).toEqual([])
  })

  test('the cache pill runs /cache-clock status without the compaction offer', async ($, on) => {
    const w = await world($, on, { peers: LIVE, commands: ['cache-clock'] })
    await w.start()
    const ui = await mountBand($)
    await ui.press({ key: 'sp-cache' })
    await ui.unmount()
    // Never inside the press: from a timer.
    expect(w.runs).toEqual([])
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'cache-clock', args: 'status' }])
  })

  test('the tests pill follows the last run', async ($, on) => {
    const runs = [
      { passed: 14, failed: 0, skipped: 0, at: T0 - 60_000 },
      { passed: 12, failed: 2, skipped: 1, at: T0 },
    ]
    const w = await world($, on, { peers: { ...LIVE, 'redgreen.runs': runs }, commands: ['tests'] })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'tests')).toBe('tests 2/14')
    // An attention pill: ink, bold, on its colour; caps in its colour.
    const words = await ui.find({ type: 'Text', text: 'tests 2/14' })
    expect(words?.props.color).toBe(C.ink)
    expect(words?.props.backgroundColor).toBe(C.red)
    expect(words?.props.bold).toBe(true)
    await ui.press({ key: 'sp-tests' })
    await ui.unmount()
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'tests', args: '' }])
    // No run yet: a dim dash.
    w.setPeer('redgreen.runs', [])
    const none = await mountBand($)
    expect(await pillWords(none, 'tests')).toBe('\u2013')
    await none.unmount()
  })

  test('the tests pill says so when the redgreen mod is not loaded', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const ui = await mountBand($)
    await ui.press({ key: 'sp-tests' })
    await ui.unmount()
    await w.clock.advance(20)
    expect(w.toasts).toEqual(['tests: the redgreen mod is not loaded (/strip open tests)'])
    expect(w.runs).toEqual([])
  })

  test('the stop pill follows motion-hold', async ($, on) => {
    const active = { id: 'm1', kinds: ['move'], summary: 'ctl move --axis 1 on rig-1.local\u001b[2J', host: 'rig-1.local', command: 'ctl move --axis 1', startedAt: T0, isBackground: false }
    const w = await world($, on, { peers: { ...LIVE, 'motion-hold.active': active }, commands: COMMANDS })
    await w.start()
    expect((await stripDrawn($)).ids[0]).toBe('stop')
    const ui = await mountBand($)
    expect(await pillWords(ui, 'stop')).toBe('STOP')
    expect((await ui.find({ type: 'Text', text: 'STOP' }))?.props.backgroundColor).toBe(C.red)
    await ui.press({ key: 'sp-stop' })
    await ui.unmount()
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'motion', args: 'status' }])
    // Its summary is cleaned before it is shown.
    expect(await w.strip('sources')).toContain('stop: motion-hold.active: ctl move --axis 1 on rig-1.local[2J')
    w.setPeer('motion-hold.active', null)
    expect((await stripDrawn($)).ids[0]).toBe('context')
  })

  test('health', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const health = async (): Promise<string | null> => {
      const ui = await mountBand($)
      const words = await pillWords(ui, 'health')
      await ui.unmount()
      return words
    }
    expect(await health()).toBe(null)
    // A subagent's failure is not the session's.
    await $.classic.StopFailure({ error: 'authentication_failed', agent_id: 'agent-1' } as never)
    expect(await health()).toBe(null)
    await w.turnStart()
    await $.classic.StopFailure({ error: 'authentication_failed' } as never)
    await w.turnEnd('error')
    expect(await health()).toBe('login expired')
    expect((await stripDrawn($)).ids.at(-1)).toBe('health')
    // The press toasts the detail and its twin.
    const ui = await mountBand($)
    await ui.press({ key: 'sp-health' })
    await ui.unmount()
    expect(w.toasts).toEqual(['login expired: authentication_failed (/strip open health)'])
    expect(await w.strip('sources')).toContain('health: own record: login expired (authentication_failed)')
    // A refused or interrupted turn does not clear it; an answered main turn does.
    await w.turnStart()
    await w.turnEnd('refusal')
    expect(await health()).toBe('login expired')
    await w.turnStart('agent-1')
    await w.turnEnd('answer', 'agent-1')
    expect(await health()).toBe('login expired')
    await w.turnStart()
    await w.turnEnd('answer')
    expect(await health()).toBe(null)
    // A main turn that ends on an error with no stop failure.
    await w.clock.advance(60_000)
    await w.turnStart()
    await w.turnEnd('error')
    expect(await health()).toBe('turn failed')
    await w.turnStart()
    await w.turnEnd('answer')
    expect(await health()).toBe(null)
  })

  test('health: a rate-limit window at 100 percent', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const measure = (percentUsed: number) =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed }], changed: ['rateLimits'] } as never)
    await measure(100)
    let ui = await mountBand($)
    expect(await pillWords(ui, 'health')).toBe('limit reached')
    await ui.unmount()
    expect(await w.strip('open health')).toBe('limit reached: five_hour at 100% (/strip open health)')
    await measure(12)
    ui = await mountBand($)
    expect(await pillWords(ui, 'health')).toBe(null)
    await ui.unmount()
    expect(await w.strip('open health')).toBe('health: nothing is wrong (/strip open health)')
  })

  test('the band list', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const rows = BAND.map(row)
    const ui = await mountList($, rows)
    expect(lastList(w)).toEqual(['strip', 'agents', 'next'])
    // The rows it was handed, unchanged. They cross to the host by value, so
    // equality is what can be seen here; order.test.ts holds the identity.
    const got = w.lists[w.lists.length - 1] ?? []
    expect(got[0]).toEqual(rows[4])
    expect(got[1]).toEqual(rows[6])
    expect(got[2]).toEqual(rows[5])
    expect(await ui.find({ type: 'Text', text: 'sys' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'agents' })).toBeDefined()
    await ui.unmount()
  })

  test('a HANDOFF row with a save offer stays', async ($, on) => {
    const w = await world($, on, { peers: { ...LIVE, 'handoff.isOver': true } })
    await w.start()
    let ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'handoff', 'agents', 'next'])
    await ui.unmount()
    // A save under way or a resume offer keeps it too.
    w.setPeer('handoff.isOver', false)
    w.setPeer('handoff.save', { ...IDLE_SAVE, phase: 'saving' })
    ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'handoff', 'agents', 'next'])
    await ui.unmount()
    w.setPeer('handoff.save', IDLE_SAVE)
    w.setPeer('handoff.offer', { mtimeMs: T0, age: '2d ago', objective: 'finish the strip' })
    ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'handoff', 'agents', 'next'])
    await ui.unmount()
  })

  test('a HANDOFF row whose state cannot be read stays', async ($, on) => {
    const w = await world($, on, { peers: LIVE, broken: ['handoff.isOver', 'handoff.offer'] })
    await w.start()
    const ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'handoff', 'agents', 'next'])
    await ui.unmount()
  })

  test('a HANDOFF row whose values all read idle is hidden', async ($, on) => {
    const w = await world($, on, { peers: { ...LIVE, 'handoff.isOver': false, 'handoff.save': IDLE_SAVE, 'handoff.offer': null } })
    await w.start()
    const ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'agents', 'next'])
    await ui.unmount()
  })

  test('a HANDOFF row whose values were never written is hidden', async ($, on) => {
    const peers = { ...LIVE }
    delete peers['handoff.isOver']
    delete peers['handoff.save']
    delete peers['handoff.offer']
    const w = await world($, on, { peers })
    await w.start()
    let ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'agents', 'next'])
    await ui.unmount()
    // Once handoff's threshold is crossed, the row comes back.
    w.setPeer('handoff.isOver', true)
    ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'handoff', 'agents', 'next'])
    await ui.unmount()
  })

  test('nothing is hidden when the strip did not draw', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const all = BAND.map(row)
    // A survey holds the band.
    let ui = await mountList($, all, true)
    expect(lastList(w)).toEqual(BAND)
    await ui.unmount()
    // Another surface.
    ui = await mountList($, all, false, 'desktop')
    expect(lastList(w)).toEqual(BAND)
    await ui.unmount()
    // No row of the strip's.
    const without = BAND.filter(p => p !== 'strip')
    ui = await mountList($, without.map(row))
    expect(lastList(w)).toEqual(without)
    expect(await ui.find({ type: 'Text', text: 'sys' })).toBeDefined()
    await ui.unmount()
  })

  test('/strip rows show', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    expect(await w.strip('rows')).toContain('hidden')
    expect(await w.strip('rows show')).toContain('shown')
    expect(w.store.get('rows')).toBe('show')
    let ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'sys', 'token-weather', 'handoff', 'cache-clock', 'agents', 'next'])
    await ui.unmount()
    expect(await w.strip('sources')).toContain('rows: shown')
    expect(await w.strip('rows hide')).toContain('hidden')
    expect(w.store.get('rows')).toBe('hide')
    ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'agents', 'next'])
    await ui.unmount()
    expect(await w.strip('rows sideways')).toContain('Usage: /strip rows')
  })

  test('the rows option shows the old rows', { options: { rows: 'show', transparentPanes: true } }, async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    const ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'sys', 'token-weather', 'handoff', 'cache-clock', 'agents', 'next'])
    await ui.unmount()
  })

  test('the stored choice wins over the option at the next start', { plugins: [OTHER], options: { rows: 'show', transparentPanes: true } }, async ($, on) => {
    const w = await world($, on, { peers: LIVE, stored: { rows: 'hide', panes: 'solid' } })
    await w.start()
    const ui = await mountList($, BAND.map(row))
    expect(lastList(w)).toEqual(['strip', 'agents', 'next'])
    await ui.unmount()
    await openOther($, { id: 'other-pane', title: 'Other' })
    expect(w.opens).toEqual([{ id: 'other-pane', title: 'Other' }])
  })

  test('/clear', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await w.turnEnd()
    let ui = await mountBand($)
    expect(await pillWords(ui, 'context')).toBe(`${BAR(4)} 42%`)
    expect(await pillWords(ui, 'diff')).toBe('1')
    await ui.unmount()
    await w.clock.advance(5_000)
    await w.clear()
    // token-weather's reading predates the /clear: the strip's own, taken after it, is drawn.
    ui = await mountBand($)
    expect(await pillWords(ui, 'context')).toBe(`${BAR(3)} 30%`)
    expect(await pillWords(ui, 'diff')).toBe('0')
    await ui.unmount()
    expect(await w.strip('sources')).toContain('context: own $.session.usage reading, 30%')
    const pane = await mountPane($, 'strip-diff')
    expect(await pane.find({ type: 'Text', text: 'No edits in the last turn.' })).toBeDefined()
    await pane.unmount()
    // A reading token-weather takes after the /clear is used again.
    w.setPeer('token-weather.context', { categories: [], totalTokens: 100_200, maxTokens: 200_000, autoCompactThreshold: 167_000, percent: 50, readAt: w.clock.now() })
    expect(await w.strip('sources')).toContain('context: token-weather.context, 60% of the auto-compact threshold')
  })

  test('/clear as the handoff mod records it', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    expect(await w.strip('sources')).toContain('context: token-weather.context, 42%')
    // handoff saw a /clear: every reading taken before it is stale, the strip's own too.
    w.setPeer('handoff.clearedAt', T0 + 1)
    expect(await w.strip('sources')).toContain('context: none: no reading yet')
    const ui = await mountBand($)
    expect(await pillWords(ui, 'context')).toBe('\u2013')
    await ui.unmount()
    // The next measurement brings a fresh reading of the strip's own.
    await w.clock.advance(1_000)
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
    expect(await w.strip('sources')).toContain('context: own $.session.usage reading, 30%')
  })

  test('without token-weather the context comes from handoff', async ($, on) => {
    // 83,500 of a 167,000 threshold is 50%.
    const handoffContext = {
      categories: [{ name: 'Messages', tokens: 79_500, color: '#cba6f7' }],
      totalTokens: 83_500,
      maxTokens: 200_000,
      autoCompactThreshold: 167_000,
      readAt: T0,
    }
    const w = await world($, on, { peers: { ...LIVE, 'token-weather.context': undefined, 'handoff.context': handoffContext } })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'context')).toBe(`${BAR(5)} 50%`)
    await ui.unmount()
    expect(await w.strip('sources')).toContain('context: handoff.context, 50% of the auto-compact threshold')
    const pane = await mountPane($, 'strip-context')
    expect(await pane.find({ type: 'Text', text: 'Context 50% of the compact window \xb7 83.5k / 167k' })).toBeDefined()
    await pane.unmount()
    // A handoff reading older than handoff's own clear is stale: the strip's own, taken after it, is used.
    await w.clock.advance(1_000)
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
    w.setPeer('handoff.clearedAt', T0 + 1)
    expect(await w.strip('sources')).toContain('context: own $.session.usage reading, 30% of the auto-compact threshold')
    const after = await mountBand($)
    expect(await pillWords(after, 'context')).toBe(`${BAR(3)} 30%`)
    await after.unmount()
  })

  test('a new session starts with no running turn, no steps and no alert', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await $.classic.StopFailure({ error: 'rate_limit' } as never)
    let ui = await mountBand($)
    expect(await ui.find({ type: 'Client' })).toBeDefined()
    expect(await pillWords(ui, 'health')).toBe('limit reached')
    await ui.unmount()
    // The module loads again in the same session state (a reload, a resume).
    await w.start()
    ui = await mountBand($)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await pillWords(ui, 'health')).toBe(null)
    expect(await pillWords(ui, 'diff')).toBe('0')
    await ui.unmount()
  })

  test('transparent panes', { plugins: [OTHER] }, async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    await openOther($, { id: 'other-pane', title: 'Other' })
    await openOther($, { id: 'tinted', backgroundColor: '#000000' })
    await openOther($, { id: 'settings' })
    await openOther($, { id: 'changes' })
    expect(w.opens).toEqual([{ id: 'other-pane', title: 'Other', backgroundColor: 'transparent' }, { id: 'tinted', backgroundColor: '#000000' }, { id: 'settings' }, { id: 'changes' }])
    expect(await w.strip('panes')).toContain('no background fill')
    expect(await w.strip('panes solid')).toContain('solid')
    expect(w.store.get('panes')).toBe('solid')
    await openOther($, { id: 'other-pane', title: 'Other' })
    expect(w.opens[4]).toEqual({ id: 'other-pane', title: 'Other' })
    // The strip's own panes follow the same switch.
    await w.strip('system')
    expect(w.opens[5]).toEqual({ id: 'strip-system', title: 'System', focus: true })
    expect(await w.strip('panes clear')).toContain('no background fill')
    expect(w.store.get('panes')).toBe('clear')
    await openOther($, { id: 'other-pane' })
    expect(w.opens[6]).toEqual({ id: 'other-pane', backgroundColor: 'transparent' })
    expect(await w.strip('panes sideways')).toContain('Usage: /strip panes')
  })

  test('a refused fill: the open goes on as it came, once', { plugins: [OTHER] }, async ($, on) => {
    const w = await world($, on, { peers: LIVE, isFillRefused: true })
    await w.start()
    await openOther($, { id: 'other-pane', title: 'Other' })
    expect(w.refusedOpens).toEqual([{ id: 'other-pane', title: 'Other', backgroundColor: 'transparent' }])
    expect(w.opens).toEqual([{ id: 'other-pane', title: 'Other' }])
  })

  test('the transparentPanes option off adds nothing', { plugins: [OTHER], options: { rows: 'hide', transparentPanes: false } }, async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    await openOther($, { id: 'other-pane', title: 'Other' })
    expect(w.opens).toEqual([{ id: 'other-pane', title: 'Other' }])
  })

  test('the working pill waits five seconds', async ($, on) => {
    const w = await world($, on)
    await w.start()
    const hasBar = async (columns: number): Promise<boolean> => (await stripDrawn($, columns)).text.includes('\u25b0')
    // With no turn the Client is absent and the fit uses the full width.
    let ui = await mountBand($)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.unmount()
    let full = 30
    while (!(await hasBar(full))) full += 1
    expect(await hasBar(full - 1)).toBe(false)

    // A subagent's turn draws none.
    await w.turnStart('agent-1')
    ui = await mountBand($)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.unmount()

    await w.turnStart()
    // The working pill's cells are kept free while the turn runs.
    expect(await hasBar(full)).toBe(false)
    expect(await hasBar(full + WORK_W - 1)).toBe(false)
    expect(await hasBar(full + WORK_W)).toBe(true)
    ui = await mountBand($)
    const client = await ui.find({ type: 'Client', key: 'sp-work' })
    expect(String(client?.props.module)).toContain('spin.tsx')
    expect(client?.props.props).toEqual({ startedAt: T0, now: T0, delayMs: 5_000, frameMs: 150 })
    expect(client?.props.width).toBe(WORK_W)
    expect(client?.props.height).toBe(1)
    // Blank cells until five seconds have passed, then a frame between caps that moves on.
    await ui.advance(4_800)
    expect((await ui.findAll({ type: 'Text', in: 'sp-work' })).map(t => t.text).join('')).toBe(' '.repeat(WORK_W))
    await ui.advance(300)
    const shown = async (): Promise<string> => (await ui.findAll({ type: 'Text', in: 'sp-work' })).map(t => t.text).join('')
    const first = await shown()
    expect(first.length).toBe(WORK_W)
    expect(first.startsWith(` ${CAP_L}`)).toBe(true)
    expect(first.endsWith(CAP_R)).toBe(true)
    expect((FRAMES as readonly string[]).includes(first[2] ?? '')).toBe(true)
    await ui.advance(150)
    expect(await shown()).not.toBe(first)
    await ui.unmount()

    await w.turnEnd()
    ui = await mountBand($)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.unmount()
    expect(await hasBar(full)).toBe(true)
  })

  test('the working pill repeats the look of the pills', async () => {
    expect(SPIN_W).toBe(WORK_W)
    expect(SPIN_CAP_L).toBe(CAP_L)
    expect(SPIN_CAP_R).toBe(CAP_R)
    expect(SPIN_COLOR).toBe(C.lavender)
    expect(SPIN_SURFACE).toBe(C.surface)
  })

  test('the context pane shows the totals', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    let ui = await mountPane($, 'strip-context')
    expect(await ui.find({ type: 'Text', text: 'Context 42% of the compact window \xb7 70.1k / 167k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Session cost $1.25 \xb7 today 1.23M tok \xb7 Nov $412, 98.8M tok' })).toBeDefined()
    // One line for each category: its name, a 20-cell bar in its colour, its percent.
    expect(await ui.find({ type: 'Text', text: /^Messages +\u25b0{8}\u25b1{12} +40%$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^\u25b0{8}$/ }))?.props.color).toBe('#cba6f7')
    expect(await ui.find({ type: 'Text', text: 'Twins: /strip context, /strip context close' })).toBeDefined()
    expect((await ui.find({ key: 'ctx-refresh' }))?.props.hotkey).toBe('r')
    expect((await ui.find({ key: 'ctx-refresh' }))?.props.label).toBe('r: refresh')
    expect((await ui.find({ key: 'ctx-refresh' }))?.props.plain).toBeUndefined()
    expect((await ui.find({ key: 'ctx-close' }))?.props.hotkey).toBe('x')
    await ui.press({ key: 'ctx-close' })
    expect(w.closes).toEqual(['strip-context'])
    await ui.unmount()
    // Without token-weather's totals the pane says what it needs.
    w.setPeer('token-weather.totals', undefined)
    ui = await mountPane($, 'strip-context')
    expect(await ui.find({ type: 'Text', text: 'Cost and totals need the token-weather mod.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Session cost/ })).toBeUndefined()
    await ui.unmount()
    // The twins.
    expect(await w.strip('context')).toBe('Context pane opened.')
    expect(w.opens.at(-1)).toEqual({ id: 'strip-context', title: 'Context', focus: true, backgroundColor: 'transparent' })
    expect(await w.strip('context close')).toBe('Context pane closed.')
    expect(w.closes).toEqual(['strip-context', 'strip-context'])
  })

  test("the context pane shows today's tokens only on the clock's own day", async ($, on) => {
    const totals = (ymd: string) => ({ costUsd: 1.25, today: { ymd, tokens: 1_234_567 }, month: { ym: '2026-11', usd: 412.4, tokens: 98_765_432 }, readAt: T0 })
    // Published before midnight and not since: yesterday's sum is not today's.
    const w = await world($, on, { peers: { ...LIVE, 'token-weather.totals': totals(dayOf(T0 - 86_400_000)) } })
    await w.start()
    let ui = await mountPane($, 'strip-context')
    expect(await ui.find({ type: 'Text', text: 'Session cost $1.25 \xb7 today \u2013 \xb7 Nov $412, 98.8M tok' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\.23M tok/ })).toBeUndefined()
    await ui.unmount()
    w.setPeer('token-weather.totals', totals(dayOf(T0)))
    ui = await mountPane($, 'strip-context')
    expect(await ui.find({ type: 'Text', text: 'Session cost $1.25 \xb7 today 1.23M tok \xb7 Nov $412, 98.8M tok' })).toBeDefined()
    await ui.unmount()
  })

  test('the context pane with no other mod', async ($, on) => {
    const w = await world($, on, { isNoBreakdown: true })
    await w.start()
    const ui = await mountPane($, 'strip-context')
    expect(await ui.find({ type: 'Text', text: 'Context 9% of the window \xb7 90.0k / 1.00M' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Cost and totals need the token-weather mod.' })).toBeDefined()
    await ui.unmount()
  })

  test('the diff pane', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    let ui = await mountPane($, 'strip-diff')
    expect(await ui.find({ type: 'Text', text: 'No edits in the last turn.' })).toBeDefined()
    await ui.unmount()
    expect(await w.strip('diff next')).toBe('No edits in the last turn.')

    await w.turnStart()
    await w.edit(EDIT_RESULT)
    await w.write(WRITE_RESULT)
    ui = await mountPane($, 'strip-diff')
    expect(await ui.find({ type: 'Text', text: '2 edits in the running turn, shown when it ends.' })).toBeDefined()
    await ui.unmount()
    await w.turnEnd()

    ui = await mountPane($, 'strip-diff')
    expect(await ui.find({ type: 'Text', text: '2 edits in the running turn' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Step 1/2 \xb7 Edit \xb7 /repo/src/a.ts \xb7 +2 \u22120' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '@@ -10,1 +10,3 @@' }))?.props.color).toBe(C.teal)
    expect((await ui.find({ type: 'Text', text: '+line 11' }))?.props.color).toBe(C.green)
    expect((await ui.find({ type: 'Text', text: ' line 10' }))?.props.dimColor).toBe(true)
    // The step strip: the selected step inverse.
    expect((await ui.find({ type: 'Text', text: /^ 1 a\.ts $/ }))?.props.inverse).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^ 2 new\.txt $/ }))?.props.inverse).toBeUndefined()
    expect((await ui.find({ key: 'diff-prev' }))?.props.hotkey).toBe('p')
    expect((await ui.find({ key: 'diff-next' }))?.props.hotkey).toBe('n')
    expect((await ui.find({ key: 'diff-close' }))?.props.hotkey).toBe('c')

    await ui.press({ key: 'diff-next' })
    expect(await ui.find({ type: 'Text', text: 'Step 2/2 \xb7 Write \xb7 /repo/notes/new.txt \xb7 +2 \u22120' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '@@ -0,0 +1,2 @@' })).toBeDefined()
    // Past the end it stays on the last step.
    await ui.press({ key: 'diff-next' })
    expect(await ui.find({ type: 'Text', text: /^Step 2\/2/ })).toBeDefined()
    await ui.press({ key: 'diff-prev' })
    expect(await ui.find({ type: 'Text', text: /^Step 1\/2/ })).toBeDefined()

    expect(await w.strip('diff next')).toBe('Step 2/2.')
    expect(await ui.find({ type: 'Text', text: /^Step 2\/2/ })).toBeDefined()
    expect(await w.strip('diff prev')).toBe('Step 1/2.')
    expect(await w.strip('diff 2')).toBe('Step 2/2.')
    expect(await w.strip('diff 9')).toBe('Step 2/2.')
    expect(await w.strip('diff')).toBe('Last turn pane opened.')
    expect(await w.strip('diff sideways')).toContain('Usage: /strip diff')
    await ui.press({ key: 'diff-close' })
    expect(w.closes).toEqual(['strip-diff'])
    expect(await w.strip('diff close')).toBe('Last turn pane closed.')
    await ui.unmount()

    // The next turn's edits take the pane over, from its first step.
    await w.turnStart()
    await w.write(WRITE_RESULT)
    await w.turnEnd()
    ui = await mountPane($, 'strip-diff')
    expect(await ui.find({ type: 'Text', text: /^Step 1\/1 \xb7 Write/ })).toBeDefined()
    await ui.unmount()
  })

  test('the system pane', async ($, on) => {
    const w = await world($, on, { peers: LIVE, commands: ['sys'] })
    await w.start()
    const ui = await mountPane($, 'strip-system')
    expect(await ui.find({ type: 'Text', text: /^CPU 20% +\u25b0{2}\u25b1{8}$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^RAM 32\.0\/64G +\u25b0{5}\u25b1{5}$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Battery 65% +\u25b0{7}\u25b1{3}$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^\u25b0{2}$/ }))?.props.color).toBe(C.green)
    expect((await ui.find({ key: 'sys-btop' }))?.props.label).toBe('b: btop')
    expect((await ui.find({ key: 'sys-refresh' }))?.props.label).toBe('r: refresh')
    expect((await ui.find({ key: 'sys-close' }))?.props.label).toBe('x: close')
    await ui.press({ key: 'sys-btop' })
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'sys', args: 'btop' }])
    await ui.press({ key: 'sys-refresh' })
    await w.clock.advance(20)
    expect(w.runs[1]).toEqual({ command: 'sys', args: 'now' })
    await ui.press({ key: 'sys-close' })
    expect(w.closes).toEqual(['strip-system'])
    await ui.unmount()
    // Loads from 80 and from 90 take the warning colours; a charging battery says so.
    w.setPeer('sys.reading', { cpu: 85, ram: { used: 95, total: 100 }, battery: { percent: 10, isCharging: true }, readAt: T0 })
    const hot = await mountPane($, 'strip-system')
    expect((await hot.find({ type: 'Text', text: /^CPU 85% +$/ }))?.props.color).toBe(C.yellow)
    expect((await hot.find({ type: 'Text', text: /^RAM .*G +$/ }))?.props.color).toBe(C.red)
    expect(await hot.find({ type: 'Text', text: /^Battery 10% charging/ })).toBeDefined()
    await hot.unmount()
    expect(await w.strip('system')).toBe('System pane opened.')
    expect(await w.strip('system close')).toBe('System pane closed.')
  })

  test('the system pill alerts on a hot machine', async ($, on) => {
    const w = await world($, on, { peers: { ...LIVE, 'sys.reading': { cpu: 95, ram: { used: 92, total: 100 }, battery: null, readAt: T0 } } })
    await w.start()
    const ui = await mountBand($)
    expect(await pillWords(ui, 'system')).toBe('RAM 92% CPU 95%')
    expect((await ui.find({ type: 'Text', text: 'RAM 92% CPU 95%' }))?.props.backgroundColor).toBe(C.red)
    await ui.unmount()
  })

  test('the row yields', async ($, on) => {
    const w = await world($, on, { peers: LIVE })
    await w.start()
    let ui = await mountBand($)
    expect(await ui.find({ key: ROW_KEY })).toBeDefined()
    await ui.unmount()
    ui = await mountBand($, 160, true)
    expect(await ui.find({ key: ROW_KEY })).toBeUndefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
    ui = await mountBand($, 160, false, 'desktop')
    expect(await ui.find({ key: ROW_KEY })).toBeUndefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  })

  test('narrow terminals: the strip never passes the band, attention pills stay', async ($, on) => {
    const runs = [{ passed: 12, failed: 2, skipped: 0, at: T0 }]
    const w = await world($, on, { peers: { ...LIVE, 'redgreen.runs': runs, 'queue.queue': { items: ['a', 'b'], isPaused: true } } })
    await w.start()
    const wide = await stripDrawn($, 200)
    expect(wide.text).toContain('2 paused')
    expect(wide.text).toContain('tests 2/14')
    const narrow = await stripDrawn($, 44)
    expect(narrow.text).not.toContain('\u25b0')
    expect(narrow.text).not.toContain('paused')
    expect([...narrow.text].length <= 44).toBe(true)
    const tiny = await stripDrawn($, 12)
    expect(tiny.ids).toEqual(['context', 'tests'])
  })

  test('/strip open runs each pill as a press does', async ($, on) => {
    const w = await world($, on, { peers: LIVE, commands: COMMANDS })
    await w.start()
    expect(await w.strip('open agents')).toBe('/agents-info open runs once the session is idle.')
    expect(await w.strip('open queue')).toBe('/q pane runs once the session is idle.')
    expect(await w.strip('open peers')).toBe('/peer-alarm board runs once the session is idle.')
    expect(await w.strip('open stop')).toBe('/motion status runs once the session is idle.')
    expect(await w.strip('open cache')).toBe('/compact-offer runs once the session is idle.')
    expect(await w.strip('open tests')).toBe('/tests runs once the session is idle.')
    expect(await w.strip('open context')).toBe('Context pane opened.')
    expect(await w.strip('open system')).toBe('System pane opened.')
    expect(await w.strip('open diff')).toBe('Last turn pane opened.')
    expect(w.runs).toEqual([])
    await w.clock.advance(20)
    expect(w.runs).toEqual([
      { command: 'agents-info', args: 'open' },
      { command: 'q', args: 'pane' },
      { command: 'peer-alarm', args: 'board' },
      { command: 'motion', args: 'status' },
      { command: 'compact-offer', args: '' },
      { command: 'tests', args: '' },
    ])
    expect(w.opens.map(o => o.id)).toEqual(['strip-context', 'strip-system', 'strip-diff'])
    expect(w.toasts).toEqual([])
    expect(await w.strip('open')).toContain('Usage: /strip open stop | context')
    expect(await w.strip('open nothing')).toContain('Usage: /strip open stop | context')
  })

  test('a command that is not in the session is a toast; one run during a turn is said to be queued', async ($, on) => {
    const w = await world($, on, { peers: LIVE, commands: ['agents-info'] })
    await w.start()
    let ui = await mountBand($)
    await ui.press({ key: 'sp-queue' })
    await ui.press({ key: 'sp-peers' })
    await ui.press({ key: 'sp-cache' })
    await ui.unmount()
    await w.clock.advance(20)
    expect(w.toasts).toEqual([
      'q is not in this session (/strip open queue)',
      'peer-alarm is not in this session (/strip open peers)',
      'cache-clock is not in this session (/strip open cache)',
    ])
    expect(w.runs).toEqual([])
    await w.turnStart()
    ui = await mountBand($)
    await ui.press({ key: 'sp-agents' })
    await ui.unmount()
    expect(w.toasts[3]).toBe('/agents-info open queued until the turn ends')
    await w.clock.advance(20)
    expect(w.runs).toEqual([{ command: 'agents-info', args: 'open' }])
  })
})
