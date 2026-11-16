import { expect, test } from 'claude-code/testing'

import { EMPTY, MAX_ITEMS, USAGE, clean, cut, isAgentBusy, listText, normalize, parseArgs, putBack, reduce, take, turnVerdict } from './queue'
import type { QueueAction } from './queue'
import type { QueueState } from '../types'

const run = (s: QueueState, ...actions: QueueAction[]): QueueState => actions.reduce((acc, a) => reduce(acc, a).state, s)
const three = (): QueueState => run(EMPTY, { type: 'add', text: 'one' }, { type: 'add', text: 'two' }, { type: 'add', text: 'three' })

test('add appends trimmed text; empty text and a full queue change nothing', () => {
  const s = three()
  expect(s.items).toEqual(['one', 'two', 'three'])
  expect(reduce(EMPTY, { type: 'add', text: '  hi  ' })).toEqual({ state: { ...EMPTY, items: ['hi'] }, note: 'Queued as item 1 of 1.' })
  expect(reduce(s, { type: 'add', text: '   ' }).state).toBe(s)
  const full: QueueState = { ...EMPTY, items: Array.from({ length: MAX_ITEMS }, (_, i) => `p${i}`) }
  expect(reduce(full, { type: 'add', text: 'more' }).state).toBe(full)
})

test('add refuses a slash command, the first non-space character a slash', () => {
  const s = three()
  for (const text of ['/compact', '  /clear', '\t/model x']) {
    expect(reduce(s, { type: 'add', text })).toEqual({ state: s, note: 'Slash commands cannot be queued: type them directly.' })
  }
  expect(reduce(s, { type: 'add', text: 'read a/b' }).state.items).toEqual(['one', 'two', 'three', 'read a/b'])
})

test('rm removes item n (1-based), keeps the selection in range, refuses out of range', () => {
  const s = { ...three(), selected: 2 }
  const r = reduce(s, { type: 'rm', n: 3 })
  expect(r.state.items).toEqual(['one', 'two'])
  expect(r.state.selected).toBe(1)
  expect(r.note).toBe('Removed item 3; 2 items left.')
  expect(reduce(s, { type: 'rm', n: 0 }).state).toBe(s)
  expect(reduce(s, { type: 'rm', n: 4 }).note).toBe('No item 4: the queue has 3 items (1 to 3).')
  expect(reduce(EMPTY, { type: 'rm', n: 1 }).note).toBe('The queue is empty.')
  // Removing an item above the selection keeps the selection on its own item.
  const below = reduce({ ...three(), selected: 2 }, { type: 'rm', n: 1 }).state
  expect(below.items[below.selected]).toBe('three')
  const taken = take({ ...three(), selected: 1 }, 1, true).state
  expect(taken.items[taken.selected]).toBe('two')
})

test('up swaps item n with the one before it; the selection follows its item', () => {
  const s = { ...three(), selected: 2 }
  const r = reduce(s, { type: 'up', n: 3 })
  expect(r.state.items).toEqual(['one', 'three', 'two'])
  expect(r.state.selected).toBe(1)
  expect(reduce(s, { type: 'up', n: 1 }).state).toBe(s)
  expect(reduce(s, { type: 'up', n: 1 }).note).toBe('Item 1 is already first.')
  expect(reduce(s, { type: 'up', n: 9 }).state).toBe(s)
})

test('clear empties the queue and resets the selection; pause and resume flip the flag', () => {
  const s = { ...three(), selected: 2 }
  expect(reduce(s, { type: 'clear' }).state).toEqual({ ...EMPTY, items: [], isPaused: false, selected: 0 })
  const paused = reduce(s, { type: 'pause' }).state
  expect(paused.isPaused).toBe(true)
  expect(reduce(paused, { type: 'pause' }).note).toBe('The queue was already paused.')
  expect(reduce(paused, { type: 'resume' }).state.isPaused).toBe(false)
  expect(reduce(s, { type: 'resume' }).note).toBe('The queue was not paused.')
})

test('select and move keep the selection inside the list', () => {
  const s = three()
  expect(run(s, { type: 'move', delta: 1 }, { type: 'move', delta: 1 }, { type: 'move', delta: 1 }).selected).toBe(2)
  expect(run(s, { type: 'move', delta: -1 }).selected).toBe(0)
  expect(reduce(s, { type: 'select', n: 2 }).state.selected).toBe(1)
  expect(reduce(s, { type: 'select', n: 5 }).state).toBe(s)
})

test('take: the automatic send takes item 1 only and never while paused; a manual send takes any item', () => {
  const s = three()
  expect(take(s, 1, true)).toEqual({ state: { ...s, items: ['two', 'three'] }, item: 'one' })
  expect(take(s, 2, true).item).toBeNull()
  const paused = { ...s, isPaused: true }
  expect(take(paused, 1, true)).toEqual({ state: paused, item: null })
  const manual = take(paused, 2, false)
  expect(manual.item).toBe('two')
  expect(manual.state).toEqual({ ...EMPTY, items: ['one', 'three'], isPaused: true, selected: 0 })
  expect(take(EMPTY, 1, false).item).toBeNull()
  expect(take(s, 4, false).item).toBeNull()
  expect(putBack({ ...s, items: ['three'] }, 'one')).toEqual({ ...EMPTY, items: ['one', 'three'], isPaused: true, selected: 0 })
})

test('turnVerdict: send on a main-loop answer, pause on an interrupt, error or refusal, ignore subagents and idle queues', () => {
  const s = three()
  expect(turnVerdict({ reason: 'answer', isAborted: false }, s)).toBe('send')
  expect(turnVerdict({ reason: 'aborted', isAborted: true }, s)).toBe('pause')
  expect(turnVerdict({ reason: 'error', isAborted: false }, s)).toBe('pause')
  expect(turnVerdict({ reason: 'refusal', isAborted: false }, s)).toBe('pause')
  expect(turnVerdict({ reason: 'answer', isAborted: false, agentId: 'a1' }, s)).toBe('ignore')
  expect(turnVerdict({ reason: 'error', isAborted: false, agentId: 'a1' }, s)).toBe('ignore')
  expect(turnVerdict({ reason: 'answer', isAborted: false }, EMPTY)).toBe('ignore')
  expect(turnVerdict({ reason: 'aborted', isAborted: true }, { ...s, isPaused: true })).toBe('ignore')
})

test('parseArgs: bare text adds, subcommands parse, a bad number is the usage', () => {
  expect(parseArgs('run the tests')).toEqual({ kind: 'action', action: { type: 'add', text: 'run the tests' } })
  expect(parseArgs('add list the files')).toEqual({ kind: 'action', action: { type: 'add', text: 'list the files' } })
  expect(parseArgs('')).toEqual({ kind: 'list' })
  expect(parseArgs('list')).toEqual({ kind: 'list' })
  expect(parseArgs('rm 2')).toEqual({ kind: 'action', action: { type: 'rm', n: 2 } })
  expect(parseArgs('up 3')).toEqual({ kind: 'action', action: { type: 'up', n: 3 } })
  expect(parseArgs('rm two')).toEqual({ kind: 'usage' })
  expect(parseArgs('next')).toEqual({ kind: 'next' })
  expect(parseArgs('send 2')).toEqual({ kind: 'send', n: 2 })
  expect(parseArgs('PAUSE')).toEqual({ kind: 'action', action: { type: 'pause' } })
  expect(parseArgs('help')).toEqual({ kind: 'usage' })
  expect(USAGE.startsWith('Usage: /q')).toBe(true)
})

test('listText and cut', () => {
  expect(listText(EMPTY)).toBe('The queue is empty: /q <text> adds one.')
  expect(listText({ ...three(), isPaused: true })).toBe('3 items queued (paused):\n1. one\n2. two\n3. three')
  expect(cut('abcdefghij', 5)).toBe('abcd…')
  expect(cut('a\n b', 10)).toBe('a b')
  expect(cut('\u{1F642}\u{1F642}\u{1F642}\u{1F642}', 5)).toBe('\u{1F642}\u{1F642}…')
})

test('isAgentBusy: only a running subagent (kind agent, or no kind) holds the automatic send', () => {
  const run = (status: string, kind?: string) => ({ id: 'r1', status, ...(kind !== undefined ? { kind } : {}) })
  expect(isAgentBusy(undefined)).toBe(false)
  expect(isAgentBusy([])).toBe(false)
  expect(isAgentBusy([run('finished', 'agent')])).toBe(false)
  expect(isAgentBusy([run('error')])).toBe(false)
  expect(isAgentBusy([run('running', 'shell')])).toBe(false)
  expect(isAgentBusy([run('running', 'cron')])).toBe(false)
  expect(isAgentBusy([run('running', 'watch')])).toBe(false)
  expect(isAgentBusy([run('running', 'agent')])).toBe(true)
  expect(isAgentBusy([run('running')])).toBe(true)
  expect(isAgentBusy([run('finished'), run('running', 'cron'), run('running', 'agent')])).toBe(true)
  // Anything that is not a list of runs reads as idle.
  expect(isAgentBusy(null)).toBe(false)
  expect(isAgentBusy({ status: 'running' })).toBe(false)
  expect(isAgentBusy([null, 'running', 3])).toBe(false)
})

test('clean: control characters leave an added prompt and every one-row view', () => {
  expect(clean('a\u0000b\u001b[31mc\u007f\u009fd\te\nf\rg')).toBe('ab[31mcd\te\nfg')
  const s = reduce(EMPTY, { type: 'add', text: 'run \u001b[2Jthe\ttests\nnow' }).state
  expect(s.items).toEqual(['run [2Jthe\ttests\nnow'])
  expect(cut('x\u0007y\nz', 10)).toBe('xy z')
  expect(listText({ ...EMPTY, items: ['p\u0008q'] })).toBe('1 item queued:\n1. pq')
})

test('an older stored value is filled in', () => {
  // A value written before isSending and waitingOn existed.
  const older = { items: ['a'], isPaused: false, selected: 0 } as Partial<QueueState>
  expect(normalize(older)).toEqual({ ...EMPTY, items: ['a'] })
  expect(normalize(null)).toEqual(EMPTY)
  expect(normalize(undefined)).toEqual(EMPTY)
})
