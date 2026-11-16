// The queue reducer, the command parser, the turn-end rule and the agents
// rule: pure functions only, no engine calls, so every rule is unit-tested on
// its own.
import type { QueueState } from '../types'

export const COMMAND = 'q'
export const PANE = 'queue'
export const PANE_TITLE = 'Queue'
export const PAUSE_TOAST = `queue paused: last turn did not finish; /${COMMAND} resume`
/**
 * The answer to a queued slash command: it starts no model turn, so nothing
 * would clear `isSending` and the queue would stall without saying why.
 */
export const SLASH_NOTE = 'Slash commands cannot be queued: type them directly.'
/** The most items kept, and the longest item text in characters. */
export const MAX_ITEMS = 50
export const MAX_TEXT = 4_000
/** While a subagent runs, the automatic send looks again after this long. */
export const AGENT_RETRY_MS = 5000

export const EMPTY: QueueState = { items: [], isPaused: false, selected: 0, isSending: false, waitingOn: '' }

/**
 * A stored value as this version reads it: a value written before a field
 * existed (a hot reload keeps the state) gets that field's empty default.
 */
export const normalize = (s: Partial<QueueState> | null | undefined): QueueState => ({ ...EMPTY, ...(s ?? {}) })

export const USAGE =
  `Usage: /${COMMAND} <text> | add <text> | list | rm <n> | up <n> | clear | pause | resume | next | pane` +
  ` (pane twins: sel <n>, send <n>, close)`

export type QueueAction =
  | { type: 'add'; text: string }
  | { type: 'rm'; n: number }
  | { type: 'up'; n: number }
  | { type: 'clear' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'select'; n: number }
  | { type: 'move'; delta: number }

/** What a reducer step answers: the new state and one line for the person. */
export type Step = { state: QueueState; note: string }

const clampSel = (sel: number, len: number): number => (len === 0 ? 0 : Math.min(Math.max(0, sel), len - 1))
/** The selection after item `gone` (0-based) left: it stays on its own item when that one was below it. */
const afterRemove = (sel: number, gone: number, len: number): number => clampSel(gone < sel ? sel - 1 : sel, len)
const plural = (n: number): string => `${n} ${n === 1 ? 'item' : 'items'}`

/** Applies one action. Items are numbered from 1 for the person; an out-of-range n changes nothing. */
export function reduce(s: QueueState, a: QueueAction): Step {
  const len = s.items.length
  const bad = (n: number): Step => ({
    state: s,
    note: len === 0 ? 'The queue is empty.' : `No item ${n}: the queue has ${plural(len)} (1 to ${len}).`,
  })
  switch (a.type) {
    case 'add': {
      const text = clean(a.text).trim().slice(0, MAX_TEXT)
      if (!text) return { state: s, note: `Nothing to add: /${COMMAND} add <text>.` }
      if (text.startsWith('/')) return { state: s, note: SLASH_NOTE }
      if (len >= MAX_ITEMS) return { state: s, note: `The queue is full (${MAX_ITEMS} items).` }
      return { state: { ...s, items: [...s.items, text] }, note: `Queued as item ${len + 1} of ${len + 1}.` }
    }
    case 'rm': {
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > len) return bad(a.n)
      const items = s.items.filter((_, i) => i !== a.n - 1)
      return { state: { ...s, items, selected: afterRemove(s.selected, a.n - 1, items.length) }, note: `Removed item ${a.n}; ${plural(items.length)} left.` }
    }
    case 'up': {
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > len) return bad(a.n)
      if (a.n === 1) return { state: s, note: 'Item 1 is already first.' }
      const items = [...s.items]
      const i = a.n - 1
      ;[items[i - 1], items[i]] = [items[i]!, items[i - 1]!]
      // The selection follows the item it was on.
      const selected = s.selected === i ? i - 1 : s.selected === i - 1 ? i : s.selected
      return { state: { ...s, items, selected }, note: `Moved item ${a.n} to ${a.n - 1}.` }
    }
    case 'clear':
      return { state: { ...s, items: [], selected: 0 }, note: len === 0 ? 'The queue was already empty.' : `Cleared ${plural(len)}.` }
    case 'pause':
      return { state: { ...s, isPaused: true }, note: s.isPaused ? 'The queue was already paused.' : `Queue paused (/${COMMAND} resume).` }
    case 'resume':
      return {
        state: { ...s, isPaused: false },
        note: s.isPaused ? `Queue resumed; the next item is sent when a turn ends (or /${COMMAND} next).` : 'The queue was not paused.',
      }
    case 'select':
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > len) return bad(a.n)
      return { state: { ...s, selected: a.n - 1 }, note: `Selected item ${a.n}.` }
    case 'move': {
      const selected = clampSel(s.selected + a.delta, len)
      return { state: { ...s, selected }, note: len === 0 ? 'The queue is empty.' : `Selected item ${selected + 1}.` }
    }
  }
}

/**
 * Takes item `n` (1-based) out to send it. `isAuto` is the turn-end send:
 * it takes only item 1 and never while paused. A manual send (/q next, the
 * pane's send) takes any item and leaves the pause as it stands.
 */
export function take(s: QueueState, n: number, isAuto: boolean): { state: QueueState; item: string | null } {
  if (isAuto && (s.isPaused || n !== 1)) return { state: s, item: null }
  if (!Number.isInteger(n) || n < 1 || n > s.items.length) return { state: s, item: null }
  const items = s.items.filter((_, i) => i !== n - 1)
  return { state: { ...s, items, selected: afterRemove(s.selected, n - 1, items.length) }, item: s.items[n - 1]! }
}

/** An item put back at the front (a send the engine dropped), the queue paused. */
export const putBack = (s: QueueState, item: string): QueueState => ({ ...s, items: [item, ...s.items], isPaused: true })

/**
 * True when the agents mod's runs (its `agents.runs` value, read as unknown)
 * hold a subagent that is still running: an entry with `status === 'running'`
 * whose `kind` is `'agent'` or absent (runs recorded before kinds existed).
 * A background shell, a watch or a cron does not count: a recurring cron
 * stays `running` until deleted. Anything else, an absent agents mod
 * included, reads as idle.
 */
export function isAgentBusy(runs: unknown): boolean {
  if (!Array.isArray(runs)) return false
  return runs.some(r => {
    if (!r || typeof r !== 'object') return false
    const run = r as { status?: unknown; kind?: unknown }
    return run.status === 'running' && (run.kind === undefined || run.kind === 'agent')
  })
}

/** What a turn's end means for the queue. */
export type TurnVerdict = 'send' | 'pause' | 'ignore'

/**
 * A subagent's turn is ignored. A main-loop turn that answered sends the next
 * item when the queue has one and is not paused; one that was interrupted, hit
 * an error or was refused pauses a non-empty, running queue.
 */
export function turnVerdict(
  t: { agentId?: string; reason: string; isAborted: boolean },
  s: QueueState,
): TurnVerdict {
  if (t.agentId !== undefined) return 'ignore'
  if (s.items.length === 0 || s.isPaused) return 'ignore'
  if (t.reason === 'answer' && !t.isAborted) return 'send'
  return 'pause'
}

export type Parsed =
  | { kind: 'action'; action: QueueAction }
  | { kind: 'list' }
  | { kind: 'next' }
  | { kind: 'send'; n: number }
  | { kind: 'pane' }
  | { kind: 'close' }
  | { kind: 'usage' }

const WORDS = new Set(['add', 'list', 'rm', 'up', 'clear', 'pause', 'resume', 'next', 'pane', 'sel', 'send', 'close', 'help'])

/** `/q` arguments to what they ask. Any text not led by a subcommand word is added. */
export function parseArgs(raw: string): Parsed {
  const args = raw.trim()
  if (!args) return { kind: 'list' }
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args)
  const word = (m?.[1] ?? '').toLowerCase()
  const rest = (m?.[2] ?? '').trim()
  const num = (): number => (/^\d+$/.test(rest) ? Number(rest) : NaN)
  if (!WORDS.has(word)) return { kind: 'action', action: { type: 'add', text: args } }
  switch (word) {
    case 'add':
      return { kind: 'action', action: { type: 'add', text: rest } }
    case 'list':
      return { kind: 'list' }
    case 'rm':
      return Number.isNaN(num()) ? { kind: 'usage' } : { kind: 'action', action: { type: 'rm', n: num() } }
    case 'up':
      return Number.isNaN(num()) ? { kind: 'usage' } : { kind: 'action', action: { type: 'up', n: num() } }
    case 'sel':
      return Number.isNaN(num()) ? { kind: 'usage' } : { kind: 'action', action: { type: 'select', n: num() } }
    case 'send':
      return Number.isNaN(num()) ? { kind: 'usage' } : { kind: 'send', n: num() }
    case 'clear':
      return { kind: 'action', action: { type: 'clear' } }
    case 'pause':
      return { kind: 'action', action: { type: 'pause' } }
    case 'resume':
      return { kind: 'action', action: { type: 'resume' } }
    case 'next':
      return { kind: 'next' }
    case 'pane':
      return { kind: 'pane' }
    case 'close':
      return { kind: 'close' }
    default:
      return { kind: 'usage' }
  }
}

/** The list as `/q list` prints it. */
export function listText(s: QueueState): string {
  if (s.items.length === 0) return `The queue is empty: /${COMMAND} <text> adds one.`
  const head = `${plural(s.items.length)} queued${s.isPaused ? ' (paused)' : ''}:`
  return [head, ...s.items.map((t, i) => `${i + 1}. ${oneLine(t)}`)].join('\n')
}

/** Control characters dropped (U+0000 to U+001F but tab and newline, and U+007F to U+009F). */
export const clean = (t: string): string => t.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')

/** Control characters dropped, newlines and runs of spaces folded to one space, for a one-row view. */
export const oneLine = (t: string): string => clean(t).replace(/\s+/g, ' ').trim()

/** East Asian Wide and Fullwidth ranges and emoji: two terminal columns each. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]
const cells = (ch: string): number => {
  const cp = ch.codePointAt(0) ?? 0
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

/** `t` on one line, cut to at most `max` terminal columns with a trailing ellipsis. */
export function cut(t: string, max: number): string {
  const s = oneLine(t)
  if (max <= 0) return ''
  let w = 0
  for (const ch of s) w += cells(ch)
  if (w <= max) return s
  let out = ''
  w = 0
  for (const ch of s) {
    const c = cells(ch)
    if (w + c > max - 1) break
    out += ch
    w += c
  }
  return out + '…'
}
