import { expect, test } from 'claude-code/testing'

import { CANCEL_LABEL, READ_MS, canApprove, createHolder, questionOf, whyOf } from './hold'
import type { Card, Decision, HoldEngine, Holder, Slot } from './hold'

const T0 = 1_000_000
const POLL_MS = 250

const CARD: Card = {
  paneId: 'motion-hold',
  title: 'Motion Hold',
  header: 'Motion Hold',
  runLabel: 'Run once',
  what: 'Would run a site motion command on rig-1.local',
  lines: ['Host rig-1.local', "Command ssh rig-1.local 'ctl move x 10'"],
  rows: 12,
  timeoutMs: 120_000,
}

type Shape = {
  isPlaced?: boolean
  /** What the dialog answers; left out, it never settles. */
  ask?: () => Promise<string>
  isOpenThrowing?: boolean
  isNotifyThrowing?: boolean
  isCloseThrowing?: boolean
  /** What a poll's sleep exits with. */
  exitCode?: number
}

type Stub = {
  engine: HoldEngine
  now: () => number
  opened: Record<string, unknown>[]
  closed: string[]
  asked: { question: string; options: unknown }[]
  notified: { text: string; title?: string }[]
  invalidated: number
  polls: number
  /** Runs at each poll, after the clock moved, with the poll's number (from 1). */
  onPoll: (fn: (n: number) => void) => void
}

/** A hand-made engine: every sleep moves a fake clock on by 250 ms. */
function stub(shape: Shape = {}): Stub {
  let now = T0
  let listener: (n: number) => void = () => {}
  const s: Stub = {
    engine: undefined as unknown as HoldEngine,
    now: () => now,
    opened: [],
    closed: [],
    asked: [],
    notified: [],
    invalidated: 0,
    polls: 0,
    onPoll: fn => {
      listener = fn
    },
  }
  const engine = {
    ui: {
      open: async (pane: Record<string, unknown>) => {
        if (shape.isOpenThrowing) throw new Error('no pane')
        s.opened.push(pane)
        return shape.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true }
      },
      close: async (pane: { id: string }) => {
        s.closed.push(pane.id)
        if (shape.isCloseThrowing) throw new Error('no close')
      },
      ask: (question: string, options: unknown) => {
        s.asked.push({ question, options })
        return shape.ask ? shape.ask() : new Promise<string>(() => {})
      },
      notify: async (text: string, options?: { title?: string }) => {
        if (shape.isNotifyThrowing) throw new Error('no channel')
        s.notified.push({ text, ...(options?.title !== undefined ? { title: options.title } : {}) })
        return { isSent: true, channel: 'terminal' }
      },
      invalidate: () => {
        s.invalidated++
      },
    },
    process: {
      run: async (argv: readonly string[], init?: { timeoutMs?: number }) => {
        expect(argv).toEqual(['sleep', '0.25'])
        expect(init).toEqual({ timeoutMs: 5000 })
        now += POLL_MS
        s.polls++
        listener(s.polls)
        return { exitCode: shape.exitCode ?? 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      },
    },
    clock: { now: async () => now },
  }
  s.engine = engine as unknown as HoldEngine
  return s
}

const heldId = (holder: Holder): number => holder.slot()?.id ?? -1

test('hold: pane: run', async () => {
  const s = stub()
  const holder = createHolder()
  let whereSeen = ''
  s.onPoll(n => {
    if (n === 2) {
      whereSeen = holder.slot()?.where ?? ''
      expect(holder.decide(heldId(holder), 'run')).toBe(true)
    }
  })
  const d = await holder.request(s.engine, undefined, CARD)
  expect(d).toBe('run')
  expect(whereSeen).toBe('pane')
  expect(s.polls).toBe(2)
  expect(s.opened).toEqual([{ id: 'motion-hold', title: 'Motion Hold', focus: true, rows: 12 }])
  expect(s.closed).toEqual(['motion-hold'])
  expect(s.asked).toHaveLength(0)
  expect(s.notified).toEqual([{ text: CARD.what, title: 'Motion Hold: holding' }])
  expect(holder.slot()).toBeNull()
  expect(s.invalidated).toBeGreaterThanOrEqual(2)
})

test('hold: pane: cancel', async () => {
  const s = stub()
  const holder = createHolder()
  s.onPoll(n => {
    if (n === 1) holder.decide(heldId(holder), 'cancel')
  })
  expect(await holder.request(s.engine, undefined, CARD)).toBe('cancel')
  expect(s.closed).toEqual(['motion-hold'])
  expect(holder.slot()).toBeNull()
})

test('hold: pane: no answer', async () => {
  const s = stub()
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, CARD)).toBe('timeout')
  const moved = s.now() - T0
  expect(moved).toBeGreaterThan(120_000)
  expect(moved).toBeLessThanOrEqual(120_500)
  expect(s.asked).toHaveLength(0)
  expect(s.closed).toEqual(['motion-hold'])
  expect(holder.slot()).toBeNull()
})

test('hold: dialog: a decision through decide wins', async () => {
  const s = stub({ isPlaced: false })
  const holder = createHolder()
  let whereSeen = ''
  s.onPoll(n => {
    if (n === 3) {
      whereSeen = holder.slot()?.where ?? ''
      holder.decide(heldId(holder), 'run')
    }
  })
  expect(await holder.request(s.engine, undefined, CARD)).toBe('run')
  expect(whereSeen).toBe('dialog')
  expect(s.asked).toHaveLength(1)
  // A pane that was opened but not placed waits undrawn for a wider
  // terminal: it is closed too, or an empty card would appear later.
  expect(s.closed).toEqual(['motion-hold'])
})

test('hold: an unplaced pane is closed on every way out', async () => {
  const answers: { name: string; shape: Shape; timeoutMs?: number; abortAt?: number; expected: Decision }[] = [
    { name: 'run label', shape: { isPlaced: false, ask: async () => 'Run once' }, expected: 'run' },
    { name: 'cancel', shape: { isPlaced: false, ask: async () => 'Cancel' }, expected: 'cancel' },
    { name: 'dismissed', shape: { isPlaced: false, ask: async () => Promise.reject(new Error('dismissed')) }, expected: 'cancel' },
    { name: 'timeout', shape: { isPlaced: false }, timeoutMs: 1_000, expected: 'timeout' },
    { name: 'interrupted', shape: { isPlaced: false }, abortAt: 2, expected: 'interrupted' },
    { name: 'error', shape: { isPlaced: false, exitCode: 127 }, expected: 'error' },
  ]
  for (const a of answers) {
    const s = stub(a.shape)
    const ac = new AbortController()
    s.onPoll(n => {
      if (n === a.abortAt) ac.abort()
    })
    const d = await createHolder().request(s.engine, ac.signal, { ...CARD, timeoutMs: a.timeoutMs ?? CARD.timeoutMs })
    expect(d, a.name).toBe(a.expected)
    expect(s.closed, a.name).toEqual(['motion-hold'])
  }
})

test('hold: dialog: the run label runs', async () => {
  const s = stub({ isPlaced: false, ask: async () => 'Run once' })
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, CARD)).toBe('run')
  expect(s.asked).toHaveLength(1)
  expect(s.asked[0]?.question).toBe(questionOf(CARD))
  expect(s.asked[0]?.options).toEqual({ options: [CANCEL_LABEL, 'Run once'], header: 'Motion Hold' })
  expect(holder.slot()).toBeNull()
})

test('hold: dialog: anything else cancels', async () => {
  for (const answer of ['Cancel', '', 'run once', 'Yes', 'Run once ', 'Cancel, Run once']) {
    const s = stub({ isPlaced: false, ask: async () => answer })
    const holder = createHolder()
    expect(await holder.request(s.engine, undefined, CARD), `answer "${answer}"`).toBe('cancel')
  }
  // An answer that is not even a string.
  const s = stub({ isPlaced: false, ask: async () => undefined as unknown as string })
  expect(await createHolder().request(s.engine, undefined, CARD)).toBe('cancel')
})

test('hold: dialog: dismissed cancels', async () => {
  const s = stub({ isPlaced: false, ask: async () => Promise.reject(new Error('dismissed')) })
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, CARD)).toBe('cancel')
  expect(holder.slot()).toBeNull()
})

test('hold: dialog: no answer times out', async () => {
  const s = stub({ isPlaced: false })
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, { ...CARD, timeoutMs: 20_000 })).toBe('timeout')
  const moved = s.now() - T0
  expect(moved).toBeGreaterThan(20_000)
  expect(moved).toBeLessThanOrEqual(20_500)
  expect(s.asked).toHaveLength(1)
})

test('hold: dialog: an answer after the time limit changes nothing', async () => {
  let answer: (label: string) => void = () => {}
  const s = stub({ isPlaced: false, ask: () => new Promise<string>(resolve => (answer = resolve)) })
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, { ...CARD, timeoutMs: 1_000 })).toBe('timeout')
  answer('Run once')
  await Promise.resolve()
  expect(holder.slot()).toBeNull()
})

test('hold: interrupted', async () => {
  for (const isPlaced of [true, false]) {
    const s = stub({ isPlaced })
    const holder = createHolder()
    const ac = new AbortController()
    s.onPoll(n => {
      if (n === 2) ac.abort()
    })
    expect(await holder.request(s.engine, ac.signal, CARD), `isPlaced ${isPlaced}`).toBe('interrupted')
    expect(s.polls).toBe(2)
    expect(holder.slot()).toBeNull()
  }
  // A dialog dismissed because the turn was interrupted reads as interrupted.
  const ac = new AbortController()
  const s = stub({
    isPlaced: false,
    ask: async () => {
      ac.abort()
      throw new Error('aborted')
    },
  })
  expect(await createHolder().request(s.engine, ac.signal, CARD)).toBe('interrupted')
  // Aborted before it started.
  const before = new AbortController()
  before.abort()
  expect(await createHolder().request(stub().engine, before.signal, CARD)).toBe('interrupted')
})

test('hold: an error is not a run', async () => {
  const s = stub({ isOpenThrowing: true })
  const holder = createHolder()
  expect(await holder.request(s.engine, undefined, CARD)).toBe('error')
  expect(holder.slot()).toBeNull()
  expect(s.closed).toEqual([])
  // A sleep that does not sleep would spin the wait: it ends the hold as an error.
  const broken = stub({ exitCode: 127 })
  expect(await createHolder().request(broken.engine, undefined, CARD)).toBe('error')
  expect(broken.polls).toBe(1)
  // A notification that cannot be sent and a pane that will not close change nothing.
  const quiet = stub({ isNotifyThrowing: true, isCloseThrowing: true })
  const h = createHolder()
  quiet.onPoll(() => h.decide(heldId(h), 'run'))
  expect(await h.request(quiet.engine, undefined, CARD)).toBe('run')
  expect(h.slot()).toBeNull()
})

test('hold: one at a time', async () => {
  const s = stub()
  const holder = createHolder()
  const second: Card = { ...CARD, what: 'Would reboot or power off on rig-1.local' }
  const seen = { firstId: -1, opensWhileFirst: -1, whatWhileFirst: '', opensWhileSecond: -1, whatWhileSecond: '' }
  s.onPoll(n => {
    const slot = holder.slot()
    if (!slot) return
    if (n === 6 && seen.firstId < 0) {
      // Both requests have polled: only the first was shown.
      seen.firstId = slot.id
      seen.opensWhileFirst = s.opened.length
      seen.whatWhileFirst = slot.card.what
      holder.decide(slot.id, 'run')
      return
    }
    if (seen.firstId >= 0 && slot.id !== seen.firstId && slot.where === 'pane' && slot.decision === null) {
      seen.opensWhileSecond = s.opened.length
      seen.whatWhileSecond = slot.card.what
      holder.decide(slot.id, 'cancel')
    }
  })
  const results: Decision[] = await Promise.all([holder.request(s.engine, undefined, CARD), holder.request(s.engine, undefined, second)])
  expect(results).toEqual(['run', 'cancel'])
  expect(seen.opensWhileFirst).toBe(1)
  expect(seen.whatWhileFirst).toBe(CARD.what)
  expect(seen.opensWhileSecond).toBe(2)
  expect(seen.whatWhileSecond).toBe(second.what)
  expect(s.closed).toEqual(['motion-hold', 'motion-hold'])
  expect(holder.slot()).toBeNull()
})

test('hold: a request waiting for the slot ends when its turn is interrupted', async () => {
  const s = stub()
  const holder = createHolder()
  const ac = new AbortController()
  s.onPoll(n => {
    if (n === 4) ac.abort()
    if (n === 8) holder.decide(heldId(holder), 'run')
  })
  const results = await Promise.all([holder.request(s.engine, undefined, CARD), holder.request(s.engine, ac.signal, CARD)])
  expect(results).toEqual(['run', 'interrupted'])
  expect(s.opened).toHaveLength(1)
})

test('hold: decide ignores a stale id', async () => {
  const s = stub()
  const holder = createHolder()
  expect(holder.decide(1, 'run')).toBe(false)
  let stale = true
  let again = true
  s.onPoll(n => {
    if (n === 1) {
      stale = holder.decide(heldId(holder) + 1, 'run')
      expect(holder.slot()?.decision).toBeNull()
    }
    if (n === 3) {
      expect(holder.decide(heldId(holder), 'cancel')).toBe(true)
      // The slot is answered: a second answer does not replace the first.
      again = holder.decide(heldId(holder), 'run')
    }
  })
  expect(await holder.request(s.engine, undefined, CARD)).toBe('cancel')
  expect(stale).toBe(false)
  expect(again).toBe(false)
  expect(holder.decide(1, 'run')).toBe(false)
})

test('hold: whyOf and questionOf', async () => {
  expect(whyOf('timeout', 120_000)).toBe('no answer within 120 seconds')
  expect(whyOf('timeout', 20_000)).toBe('no answer within 20 seconds')
  expect(whyOf('cancel', 1)).toBe('the user chose Cancel (or dismissed the dialog)')
  expect(whyOf('interrupted', 1)).toBe('the turn was interrupted')
  expect(whyOf('error', 1)).toBe('the hold failed')
  const q = questionOf(CARD)
  expect(q).toContain('Motion Hold')
  expect(q).toContain(CARD.what)
  expect(q).toContain("Command ssh rig-1.local 'ctl move x 10'")
  expect(q).toContain('Run once')
  expect(CARD.header.length).toBeLessThanOrEqual(12)
  expect(CANCEL_LABEL).toBe('Cancel')
  // A card that fits is shown whole, with no mark.
  expect(q).not.toContain('not shown here')
  // A card with more lines than the dialog shows says how many it leaves out, before the question.
  const long: Card = { ...CARD, lines: Array.from({ length: 10 }, (_, i) => `line ${i + 1}`) }
  const lq = questionOf(long).split('\n')
  expect(lq).toContain('line 8')
  expect(lq).not.toContain('line 9')
  expect(lq[lq.length - 2]).toBe('… 2 more lines not shown here: Cancel, then widen the terminal to read the full card')
  expect(lq[lq.length - 1]).toBe('Run once?')
  const nine = questionOf({ ...CARD, lines: Array.from({ length: 9 }, (_, i) => `line ${i + 1}`) })
  expect(nine).toContain('… 1 more line not shown here')
})

test('hold: shownAt is null while waiting and set when the card is shown', async () => {
  for (const isPlaced of [true, false]) {
    const s = stub({ isPlaced })
    const holder = createHolder()
    let whileOpening: Slot | null = null
    const open = s.engine.ui.open
    s.engine.ui.open = (async (pane: Parameters<HoldEngine['ui']['open']>[0]) => {
      whileOpening = holder.slot() === null ? null : { ...holder.slot()! }
      return open(pane)
    }) as HoldEngine['ui']['open']
    const seen: { where: string; shownAt: number | null; now: number }[] = []
    s.onPoll(n => {
      const slot = holder.slot()
      if (slot) seen.push({ where: slot.where, shownAt: slot.shownAt, now: s.now() })
      if (n === 3) holder.decide(heldId(holder), 'cancel')
    })
    expect(await holder.request(s.engine, undefined, CARD)).toBe('cancel')
    const name = `isPlaced ${isPlaced}`
    expect(whileOpening, name).toMatchObject({ where: 'waiting', shownAt: null })
    expect(seen[0], name).toMatchObject({ where: isPlaced ? 'pane' : 'dialog', shownAt: T0 })
  }
})

test('hold: canApprove: only a card on screen for READ_MS', async () => {
  expect(READ_MS).toBe(1_500)
  expect(canApprove(null, T0)).toBe(false)
  const waiting: Slot = { id: 1, card: CARD, decision: null, where: 'waiting', shownAt: null }
  expect(canApprove(waiting, T0 + 60_000)).toBe(false)
  for (const where of ['pane', 'dialog'] as const) {
    const shown: Slot = { id: 1, card: CARD, decision: null, where, shownAt: T0 }
    expect(canApprove(shown, T0), where).toBe(false)
    expect(canApprove(shown, T0 + READ_MS - 1), where).toBe(false)
    expect(canApprove(shown, T0 + READ_MS), where).toBe(true)
    expect(canApprove(shown, T0 + 60_000), where).toBe(true)
    // A clock that went back is not time on screen.
    expect(canApprove(shown, T0 - 10_000), where).toBe(false)
    // A slot shown but with no time is not readable.
    expect(canApprove({ ...shown, shownAt: null }, T0 + 60_000), where).toBe(false)
  }
  // The live slot: false at the first polls, true from the sixth (1500 ms).
  const s = stub()
  const holder = createHolder()
  const answers: boolean[] = []
  s.onPoll(n => {
    answers.push(canApprove(holder.slot(), s.now()))
    if (n === 6) holder.decide(heldId(holder), 'cancel')
  })
  await holder.request(s.engine, undefined, CARD)
  expect(answers).toEqual([false, false, false, false, false, true])
})
