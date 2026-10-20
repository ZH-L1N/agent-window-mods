// The board's pure parts: the HERDR-ORCH envelope parser and the request
// records it feeds, the result file's check, the board rows and the words the
// pane draws. Shared by register.tsx, pane.tsx and the tests.
//
// The envelope header is POLICY.md section 2 (herdr-setup):
//   [HERDR-ORCH v0] req=<id> from=<agent-name>@<pane-id> type=<type>
// and the result file is section 4: ~/.local/state/herdr-orch/<req-id>/result.md,
// valid iff its first two lines are exactly `req: <id>` and `status: <status>`
// and a non-blank line follows.
import type { Board, BoardRow, OrchRequest, PeerSeen, PeerStatus } from '../types'
import type { Peer } from './kit'
import { TICK_MS, durationText, quoted } from './kit'

export const PANE = 'peers'
export const PANE_TITLE = 'Peers'
/** The envelope types POLICY.md lists. */
export const ENVELOPE_TYPES = ['request', 'handoff', 'progress', 'blocked', 'needs-approval', 'completed', 'failed'] as const
/**
 * Not in POLICY.md's list, but the hubs send it (the same `req=`, a later
 * round): taken only as an update to a request already kept, never a new one.
 */
export const FOLLOWUP = 'followup'
/** POLICY.md section 4: a brief that names no deadline has 30 minutes. */
export const DEFAULT_DEADLINE_MS = 30 * 60_000
/** The requests kept; the oldest beyond this are dropped. */
export const MAX_REQUESTS = 40
/** A result file over this size is taken as present but not read. */
export const RESULT_MAX_BYTES = 65_536
/** The folder of the result files, under the home folder. */
export const ORCH_DIR = '.local/state/herdr-orch'
/** The result statuses POLICY.md allows. */
const RESULT_STATUSES = ['completed', 'failed', 'blocked']

// At a line's start, or after `herdr agent prompt <pane>` and an opening quote
// there (the hub's own Bash line, pasted or typed); never mid-sentence.
const HEADER = /^[^\S\n]*(?:herdr agent prompt\s+\S+\s+)?["'`]?\[HERDR-ORCH v0\] req=(\S+) from=(\S+)@(\S+) type=(\S+)(.*)$/gm
/** A herdr pane id: `w1:p6`, `wZ:p1`. */
const PANE_ID = /\bw[A-Za-z0-9]+:p\d+\b/g

/** One envelope header found in a prompt, with what the prompt around it says. */
export type Envelope = {
  req: string
  /** The sender's agent name and pane (`from=`). */
  fromAgent: string
  fromPane: string
  type: string
  /** The spoke the envelope concerns; '' when the text does not say. */
  target: string
  round: number | null
  ceiling: number | null
  /** The deadline the text names, in milliseconds; null when none. */
  deadlineMs: number | null
}

/** A request id safe to use as one folder name: letters, digits, `.`, `_`, `-`, never `.` or `..`. */
export const isSafeReq = (req: string): boolean => /^[A-Za-z0-9._-]{1,128}$/.test(req) && req !== '.' && req !== '..'

const num = (s: string | undefined): number | null => {
  const n = s === undefined ? NaN : Number(s)
  return Number.isInteger(n) && n > 0 && n < 1_000 ? n : null
}

/** `round 4/5`, `round 4 of 5`, `round=4`, else a `-r4` req suffix; the ceiling from the same or `ceiling 5`, `max rounds 5`. */
export function roundOf(text: string, req: string): { round: number | null; ceiling: number | null } {
  const pair = /\bround[ =:]*(\d+)\s*(?:\/|of)\s*(\d+)/i.exec(text)
  const alone = /\bround[ =:]*(\d+)\b/i.exec(text)
  const suffix = /-r(\d+)$/i.exec(req)
  const cap = /\b(?:ceiling|max[ _-]?rounds)[ =:]*(\d+)/i.exec(text)
  return {
    round: num(pair?.[1]) ?? num(alone?.[1]) ?? num(suffix?.[1]),
    ceiling: num(pair?.[2]) ?? num(cap?.[1]),
  }
}

/** `deadline: 45 minutes`, `Deadline 2 h`, `DEADLINE: 90 min` in milliseconds; null when the text names none. */
export function deadlineOf(text: string): number | null {
  const m = /\bdeadline\b[^0-9\n]{0,12}(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i.exec(text)
  const n = num(m?.[1])
  if (!m || n === null) return null
  return /^h/i.test(m[2] ?? '') ? n * 3_600_000 : n * 60_000
}

const isBrief = (type: string): boolean => type === 'request' || type === 'handoff'
/** A hub-to-spoke envelope: a brief or a follow-up; every other type is a spoke's report. */
const isHubToSpoke = (type: string): boolean => isBrief(type) || type === FOLLOWUP

/**
 * The spoke an envelope concerns: a `to=<pane>` on its header line or a
 * `herdr agent prompt <pane>` in the text; else the sender, when that is not
 * this pane (a spoke's report reaching this session); else the first other
 * pane id in the text. '' when none. null when this pane is the spoke: a
 * brief or follow-up from another pane with no other target named (sent to
 * this pane), or a report this pane sends (its own, to its hub).
 */
function targetOf(text: string, rest: string, type: string, fromPane: string, selfPane: string): string | null {
  const isIncoming = fromPane !== selfPane
  if (!isIncoming && !isHubToSpoke(type)) return null
  const to = /\bto=(w[A-Za-z0-9]+:p\d+)\b/.exec(rest)?.[1] ?? /\bherdr agent prompt\s+(w[A-Za-z0-9]+:p\d+)\b/.exec(text)?.[1]
  if (to && to !== selfPane) return to
  if (isIncoming && isHubToSpoke(type)) return null
  if (isIncoming && /^w[A-Za-z0-9]+:p\d+$/.test(fromPane)) return fromPane
  const others = [...text.matchAll(PANE_ID)].map(m => m[0]).filter(p => p !== selfPane && p !== fromPane)
  return others[0] ?? ''
}

/**
 * Every envelope header in a prompt's text, in order, with the target, round
 * and deadline the text gives; an envelope that makes this pane the spoke
 * (see targetOf) is left out, so the board never lists the hub as a spoke.
 */
export function parseEnvelopes(text: string, selfPane: string): Envelope[] {
  const found: Envelope[] = []
  for (const m of text.matchAll(HEADER)) {
    const [, req = '', fromAgent = '', fromPane = '', rawType = '', rest = ''] = m
    // A one-line header in quotes ends its type with the closing quote.
    const type = rawType.replace(/["'`]+$/, '')
    if (!isSafeReq(req) || (!(ENVELOPE_TYPES as readonly string[]).includes(type) && type !== FOLLOWUP)) continue
    const target = targetOf(text, rest, type, fromPane, selfPane)
    if (target === null) continue
    found.push({
      req,
      fromAgent,
      fromPane,
      type,
      target,
      ...roundOf(text, req),
      deadlineMs: deadlineOf(text),
    })
  }
  return found
}

/**
 * The requests after these envelopes, submitted at `at`: a new request starts
 * its deadline clock now (the text's deadline, else 30 minutes for a request
 * or handoff); a known one keeps its start, takes a pane, round or deadline
 * the new envelope names, and its type. A follow-up only updates a known
 * request, and a deadline it names counts from the follow-up. The newest
 * MAX_REQUESTS are kept.
 */
export function recordEnvelopes(prev: Readonly<Record<string, OrchRequest>>, envs: readonly Envelope[], at: number): Record<string, OrchRequest> {
  const next: Record<string, OrchRequest> = { ...prev }
  for (const env of envs) {
    const old = next[env.req]
    const isFollowup = env.type === FOLLOWUP
    if (isFollowup && !old) continue
    const deadlineMs = env.deadlineMs ?? (isBrief(env.type) && !old?.deadlineAt ? DEFAULT_DEADLINE_MS : null)
    const deadlineFrom = isFollowup ? at : (old?.sentAt ?? at)
    next[env.req] = {
      req: env.req,
      pane: env.target || old?.pane || '',
      type: env.type,
      round: env.round ?? old?.round ?? null,
      ceiling: env.ceiling ?? old?.ceiling ?? null,
      sentAt: old?.sentAt ?? at,
      deadlineAt: deadlineMs !== null ? deadlineFrom + deadlineMs : (old?.deadlineAt ?? null),
      result: old?.result ?? null,
    }
  }
  const kept = Object.values(next)
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, MAX_REQUESTS)
  return Object.fromEntries(kept.map(r => [r.req, r]))
}

/** The result file of a request: `<home>/.local/state/herdr-orch/<req>/result.md`. */
export const resultPath = (home: string, req: string): string => `${home.replace(/\/+$/, '')}/${ORCH_DIR}/${req}/result.md`

/**
 * A result file's status, POLICY.md section 4: the first line exactly
 * `req: <req>`, the second exactly `status: <status>`, then a non-blank line
 * (the deliverable or the explanation); '' when it is not valid so, as while
 * the spoke is still writing it.
 */
export function resultStatus(text: string, req: string): string {
  const [first = '', second = '', ...body] = text.split(/\r?\n/)
  if (first !== `req: ${req}`) return ''
  const status = /^status: (\S+)$/.exec(second)?.[1] ?? ''
  if (!body.some(line => line.trim() !== '')) return ''
  return RESULT_STATUSES.includes(status) ? status : ''
}

/** The newest request of each spoke pane (the one the board shows on its row). */
export function requestsByPane(requests: Readonly<Record<string, OrchRequest>>): Map<string, OrchRequest> {
  const byPane = new Map<string, OrchRequest>()
  for (const r of Object.values(requests)) {
    if (!r.pane) continue
    const had = byPane.get(r.pane)
    if (!had || r.sentAt > had.sentAt) byPane.set(r.pane, r)
  }
  return byPane
}

/**
 * The board rows of a herdr read at `at`: each peer's time in its state from
 * the alarm's `seen` when it has the pane in that state, else from the last
 * board when that read is recent (within two ticks; an older one, as after
 * the board was closed, may have missed changes), else from now.
 */
export function boardRows(peers: readonly Peer[], seen: Readonly<Record<string, PeerSeen>> | null, last: Board | null, at: number): BoardRow[] {
  const recent = last && at - last.at <= 2 * TICK_MS ? last : null
  return peers.map(p => {
    const s = seen?.[p.pane]
    const b = recent?.rows.find(r => r.pane === p.pane)
    const since = s && s.status === p.status ? s.since : b && b.status === p.status ? b.since : at
    return { pane: p.pane, agent: p.agent, status: p.status, title: p.title, since }
  })
}

/** Blocked peers first, the rest in herdr's order. */
export const sortedRows = (rows: readonly BoardRow[]): BoardRow[] => [
  ...rows.filter(r => r.status === 'blocked'),
  ...rows.filter(r => r.status !== 'blocked'),
]

/** Each state's glyph and colour on the board; blocked is amber. */
export const STATE_GLYPH: Record<PeerStatus, string> = { blocked: '▲', working: '●', idle: '○', done: '✓', unknown: '?' }
export const STATE_COLOR: Record<PeerStatus, string> = {
  blocked: '#f59e0b',
  working: '#60a5fa',
  idle: '#9ca3af',
  done: '#22c55e',
  unknown: '#9ca3af',
}

/** `▲ blocked 4m`: the glyph, the word and the time in the state (left out until a later read sees it so). */
export const stateText = (r: BoardRow, at: number): string =>
  `${STATE_GLYPH[r.status]} ${r.status}${r.since < at ? ' ' + durationText(at - r.since) : ''}`

/** `"title"` cut as the toasts cut it; '' when none. */
export const titleText = (title: string): string => quoted(title).trim()

/** `⏳ 26m left`, `overdue 4m`; '' when no deadline is known. */
export function deadlineText(r: OrchRequest, at: number): string {
  if (r.deadlineAt === null) return ''
  const left = r.deadlineAt - at
  return left > 0 ? `⏳ ${durationText(left)} left` : `overdue ${durationText(-left)}`
}

/** `result.md ✓ completed`, `result.md ✗ failed`, `result.md ▲ blocked`, `result.md (no status)`, `no result.md`. */
export function resultText(result: string | null): string {
  if (result === null) return 'no result.md'
  if (result === '') return 'result.md (no status)'
  return `result.md ${result === 'completed' ? '✓' : result === 'failed' ? '✗' : '▲'} ${result}`
}

/** The spoke line under a peer: `req apr-alp-r4 · round 4/5 · ⏳ 26m left · no result.md`. */
export function orchText(r: OrchRequest, at: number): string {
  const round = r.round !== null ? `round ${r.round}${r.ceiling !== null ? '/' + r.ceiling : ''}` : ''
  // A result file settles the request: its countdown no longer applies.
  const deadline = r.result ? '' : deadlineText(r, at)
  return [`req ${r.req}`, round, deadline, resultText(r.result)].filter(Boolean).join(' · ')
}

/** The board's head: `3 peers in w1 · 1 blocked · read every 30 s`. */
export function headText(board: Board | null): string {
  if (!board) return 'Reading herdr…'
  const n = board.rows.length
  const blocked = board.rows.filter(r => r.status === 'blocked').length
  return [`${n} ${n === 1 ? 'peer' : 'peers'} in ${board.workspace}`, ...(blocked > 0 ? [`${blocked} blocked`] : []), 'read every 30 s'].join(' · ')
}
