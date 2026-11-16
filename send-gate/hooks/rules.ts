// The send-gate mod's rules: which MCP tool call sends something to other
// people (kindOf), what the card shows of it (previewOf), the site config
// (parseGateConfig) and which permission modes are gated (shouldGate).
// Pure: no `$` call here.
import type { Mode, SendKind } from '../types'

export type { Mode, SendKind } from '../types'

/** Globs on the full tool name: `*` any run, `?` one character. */
export type GateConfig = { gate: string[]; pass: string[] }

export type GateRead =
  | { status: 'none' }
  | { status: 'ok'; config: GateConfig; warnings: string[] }
  | { status: 'broken'; error: string }

export type Preview = {
  kind: SendKind
  tool: string
  /** `name: value` of each target argument the input has, joined with ` · `; '' when none. */
  target: string
  mentions: string[]
  dates: string[]
  /** Every body value the input has, joined with a line break in the lists' order, cleaned and cut to 600 characters; '' when none. The card draws its line breaks as the mark. */
  body: string
  /** Whether the call carries a body key at all (a saved draft's send does not). */
  hasBodyKey: boolean
  /** Every argument no target, body or date key used: a scalar as it is, a list or an object as compact JSON, on one line, cut to 80 characters, secrets masked at any depth. */
  fields: [string, string][]
}

const BODY_MAX = 600
const FIELD_MAX = 80
const TARGET_PART_MAX = 200
const TARGET_MAX = 400
const DATE_MAX = 80
export const MASK = '••••'
/** What a line break in a value shown on one line is drawn as, so a value cannot forge a card line. */
export const BREAK_MARK = '⏎'
const LINE_BREAK = /\r\n?|[\n\u2028\u2029]/g

/** The text with every line break (`\n`, `\r`, U+2028, U+2029) drawn as the mark. */
export function oneLine(text: string): string {
  return String(text ?? '').replace(LINE_BREAK, BREAK_MARK)
}

/** A value shown on one line: line breaks marked, then cleaned and cut. */
const lineOf = (text: string, max: number): string => clean(oneLine(text), max)

/** Characters a terminal could read as control: U+0000 to U+001F but tab and newline, and U+007F to U+009F. */
export function clean(text: string, max: number): string {
  const s = String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
  if (s.length <= max) return s
  let cut = s.slice(0, Math.max(0, max - 1))
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** The tool name after its last `__`: `slack_send_message` of `mcp__claude_ai_Slack__slack_send_message`. */
export function lastPartOf(tool: string): string {
  const at = tool.lastIndexOf('__')
  return at < 0 ? tool : tool.slice(at + 2)
}

/** The server part of an MCP tool name: `claude_ai_Gmail` of `mcp__claude_ai_Gmail__send_message`. */
function serverOf(tool: string): string {
  const at = tool.lastIndexOf('__')
  return at <= 5 ? '' : tool.slice(5, at)
}

/** Verbs that start the name of a tool that only reads. */
const READ_VERBS = ['get', 'list', 'read', 'search', 'fetch', 'query', 'describe', 'find', 'lookup', 'check', 'view', 'show', 'download']

/** Whether a tool's last name part starts with a read verb. */
export function isReadName(tool: string): boolean {
  const last = lastPartOf(tool).toLowerCase()
  return READ_VERBS.some(v => last.startsWith(v))
}

const MESSAGE = new Set(['slack_send_message', 'slack_schedule_message', 'post_message', 'chat_post_message'])
const EMAIL = new Set(['send_email', 'send_mail', 'reply', 'forward', 'send_draft'])
const NOTIFY = new Set(['createevent', 'updateevent', 'deleteevent', 'respondtoevent', 'sharefile'])
const COMMENT_VERBS = ['add', 'create', 'post', 'reply']

function globRe(glob: string, flags: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${body}$`, flags)
}

/** A gate glob holds more: case aside. A pass glob lets through only the name as written. */
const gateMatch = (tool: string, globs: string[]): boolean => globs.some(g => globRe(g, 'i').test(tool))
const passMatch = (tool: string, globs: string[]): boolean => globs.some(g => globRe(g, '').test(tool))

const KEYS = new Set(['gate', 'pass'])

/** Reads the config file's text; null is no file. Anything not as documented is broken. */
export function parseGateConfig(text: string | null): GateRead {
  if (text === null) return { status: 'none' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { status: 'broken', error: clean(`not JSON (${err instanceof Error ? err.message : 'error'})`, 200) }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { status: 'broken', error: 'the file is not a JSON object' }
  const obj = raw as Record<string, unknown>
  const lists: GateConfig = { gate: [], pass: [] }
  for (const key of ['gate', 'pass'] as const) {
    const v = obj[key]
    if (v === undefined) continue
    if (!Array.isArray(v)) return { status: 'broken', error: `"${key}" is not a list` }
    for (const g of v) {
      if (typeof g !== 'string') return { status: 'broken', error: `"${key}" holds an entry that is not text` }
      if (g.trim() === '') return { status: 'broken', error: `"${key}" holds an empty entry` }
      lists[key].push(g.trim())
    }
  }
  const warnings = Object.keys(obj)
    .filter(k => !KEYS.has(k))
    .map(k => clean(`unknown key "${k}"`, 100))
  return { status: 'ok', config: lists, warnings }
}

/** What an MCP tool call would do to other people, or null when it is not held. */
export function kindOf(tool: string, read: GateRead): SendKind | null {
  if (!tool.startsWith('mcp__')) return null
  if (read.status === 'ok') {
    if (passMatch(tool, read.config.pass)) return null
    if (gateMatch(tool, read.config.gate)) return 'site'
  }
  const last = lastPartOf(tool).toLowerCase()
  if (MESSAGE.has(last)) return 'message'
  if (EMAIL.has(last)) return 'email'
  if (last === 'send_message') return /mail/i.test(serverOf(tool)) ? 'email' : 'message'
  if (!last.includes('draft')) {
    const bare = last.replace(/[_-]/g, '')
    if (NOTIFY.has(bare)) return 'notify'
    if (bare.includes('comment') && COMMENT_VERBS.some(v => bare.startsWith(v))) return 'notify'
  }
  // An unreadable config may have named any tool: hold every one that does not only read.
  if (read.status === 'broken' && !isReadName(tool)) return 'site'
  return null
}

/** A key as the lists compare it: case, `_` and `-` ignored, so `startTime` is `start_time`. */
const keyOf = (k: string): string => k.toLowerCase().replace(/[_-]/g, '')

/** The lists, in their order; each is matched against the input's keys by keyOf. */
const TARGET_KEYS = [
  'channel',
  'channel_id',
  'to',
  'recipient',
  'recipients',
  'cc',
  'bcc',
  'thread_ts',
  'thread_id',
  'subject',
  'attendees',
  'emails',
  'email',
  'calendar_id',
  'file_id',
  'issue_key',
  'page_id',
  'issue_id_or_key',
  'draft_id',
  'message_id',
  'reply_thread_id',
  'reply_all',
].map(keyOf)
const BODY_KEYS = ['text', 'message', 'body', 'content', 'markdown_text', 'html', 'html_body', 'comment_body', 'description', 'summary'].map(keyOf)
const DATE_KEYS = ['post_at', 'send_at', 'scheduled_time', 'start', 'end', 'start_time', 'end_time', 'date', 'due_date'].map(keyOf)
const LISTED = new Set([...TARGET_KEYS, ...BODY_KEYS, ...DATE_KEYS])
const SECRET = /key|token|secret|password|credential|authorization|bearer|cookie/i

const isPresent = (v: unknown): boolean => v !== undefined && v !== null && v !== ''

/** The input's arguments whose key is one of `keys`, in the list's order (the input's order within one list key), present values only. */
function argsFor(input: Record<string, unknown>, keys: string[]): [string, unknown][] {
  const entries = Object.entries(input)
  return keys.flatMap(k => entries.filter(([name, v]) => keyOf(name) === k && isPresent(v)))
}

/** One argument as text: a list joined, an object as JSON. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x !== null ? jsonOf(x) : String(x))).join(', ')
  return jsonOf(v)
}

/**
 * Compact JSON with the value of every key that looks like a secret, at any
 * depth, shown as the mask. A value JSON cannot hold (nested too deep) throws:
 * the gate then refuses the call rather than show it empty.
 */
function jsonOf(v: unknown): string {
  return JSON.stringify(v, (k: string, x: unknown) => (k !== '' && SECRET.test(k) ? MASK : x)) ?? ''
}

/**
 * A date argument's value: a calendar's `{ dateTime }` or `{ date }` reads as
 * that value, followed by its `timeZone` when it has one. An object with any
 * other key shows as compact JSON, so nothing in it is left off the card.
 */
function dateValueOf(v: unknown): string {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const at = typeof o.dateTime === 'string' ? 'dateTime' : typeof o.date === 'string' ? 'date' : null
    const zone = o.timeZone
    if (at !== null && Object.keys(o).every(k => k === at || k === 'timeZone') && (zone === undefined || typeof zone === 'string')) {
      return typeof zone === 'string' && zone !== '' ? `${String(o[at])} ${zone}` : String(o[at])
    }
  }
  return textOf(v)
}

const MENTION = /<@[^>\s]+>|<!(?:here|channel|everyone)>|(?<![\w<])@\w{2,}/g

const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)'
const DATE = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?(?!\\d)',
    '\\b\\d{1,2}:\\d{2}(?:\\s?[ap]\\.?m\\b\\.?)?',
    '\\b\\d{1,2}\\s?[ap]m\\b',
    '\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b',
    `\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,
    '\\b(?:today|tomorrow|tonight|next week|EOD|EOW)\\b',
  ].join('|'),
  'gi',
)

const unique = (list: string[]): string[] => [...new Set(list)]

/** What the card shows of a held call. */
export function previewOf(kind: SendKind, tool: string, input: Record<string, unknown>): Preview {
  const target = lineOf(
    argsFor(input, TARGET_KEYS)
      .map(([k, v]) => `${k}: ${lineOf(textOf(v), TARGET_PART_MAX)}`)
      .join(' · '),
    TARGET_MAX,
  )
  // Mentions and dates are read from the whole text, so none hides past the cut.
  const full = clean(
    argsFor(input, BODY_KEYS)
      .map(([, v]) => textOf(v))
      .join('\n'),
    Number.MAX_SAFE_INTEGER,
  )
  const mentions = unique((full.match(MENTION) ?? []).map(oneLine))
  const dates = unique([...(full.match(DATE) ?? []).map(d => lineOf(d, DATE_MAX)), ...argsFor(input, DATE_KEYS).map(([, v]) => lineOf(dateValueOf(v), DATE_MAX))])
  // Every argument the lists do not name, for every kind: nothing that goes out is left off the card.
  const fields: [string, string][] = Object.entries(input)
    .filter(([k, v]) => v !== undefined && !LISTED.has(keyOf(k)))
    .map(([k, v]) => [lineOf(k, FIELD_MAX), SECRET.test(k) ? MASK : lineOf(typeof v === 'object' && v !== null ? jsonOf(v) : textOf(v), FIELD_MAX)])
  const hasBodyKey = Object.keys(input).some(k => BODY_KEYS.includes(keyOf(k)))
  return { kind, tool, target, mentions, dates, body: clean(full, BODY_MAX), hasBodyKey, fields }
}

/** Gated: a session that runs without permission prompts, or one whose mode is not known. */
export function shouldGate(mode: Mode): boolean {
  return mode === 'bypassPermissions' || mode === 'unknown'
}

const MODES = new Set<string>(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'])

/** A permission mode as an event or the settings spell it; anything else is unknown. */
export function modeOf(value: unknown): Mode {
  return typeof value === 'string' && MODES.has(value) ? (value as Mode) : 'unknown'
}
