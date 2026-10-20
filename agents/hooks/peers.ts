// The agents pane's Peers view (0.4.0): the other agents of this herdr
// workspace, as the peers mod's board shows them, with this session's
// HERDR-ORCH spokes grouped under their request ids, the hub's row first.
//
// Ported, not imported: the peers mod's reading code (peers/hooks/kit.ts
// `parsePeers`, peers/hooks/orch.ts envelope rule, request records, result
// file check and row words), written again here, since one mod never imports
// from another's folder. Ours (Zehui Lin, MIT), no third-party code.
//
// The envelope header is herdr-setup POLICY.md section 2:
//   [HERDR-ORCH v0] req=<id> from=<agent-name>@<pane-id> type=<type>
// and the result file is section 4: ~/.local/state/herdr-orch/<req-id>/result.md,
// valid iff its first two lines are exactly `req: <id>` and `status: <status>`
// and a non-blank line follows.
//
// herdr is read with `$.process.run(['herdr', 'agent', 'list'])` only while the
// pane shows this view (every 30 s from the 1 s tick, `r` or
// `/agents-info peers` at once), and the result files with $.fs.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { PeerBoard, PeerRequest, PeerRow, PeerStatus } from '../types'
import { PANE, setView } from './kit'

const view = atom({ plugin: 'agents', key: 'view' } as const, 'who')
const peerBoard = atom({ plugin: 'agents', key: 'peerBoard' } as const, null)
const peerRequests = atom({ plugin: 'agents', key: 'peerRequests' } as const, {})
const peerHub = atom({ plugin: 'agents', key: 'peerHub' } as const, '')

/** The view's read of herdr: every this many ms while shown. */
export const PEERS_TICK_MS = 30_000
/** `herdr agent list`'s limit. */
export const HERDR_TIMEOUT_MS = 5_000
/** What the view and `/agents-info peers` say outside a herdr pane. */
export const NEEDS_HERDR = 'The Peers view needs a herdr pane (HERDR_ENV=1 with a workspace and pane id).'
/** The envelope types POLICY.md lists. */
export const ENVELOPE_TYPES = ['request', 'handoff', 'progress', 'blocked', 'needs-approval', 'completed', 'failed'] as const
/** Not in POLICY.md's list, but the hubs send it: only an update to a request already kept. */
export const FOLLOWUP = 'followup'
/** POLICY.md section 4: a brief that names no deadline has 30 minutes. */
export const DEFAULT_DEADLINE_MS = 30 * 60_000
/** The requests kept; the oldest beyond this are dropped. */
export const MAX_REQUESTS = 40
/** A result file over this size is taken as present but not read. */
export const RESULT_MAX_BYTES = 65_536
/** The folder of the result files, under the home folder. */
export const ORCH_DIR = '.local/state/herdr-orch'
/** A title longer than this is cut, with an ellipsis. */
export const TITLE_MAX = 48
const RESULT_STATUSES = ['completed', 'failed', 'blocked']
const STATUSES: readonly PeerStatus[] = ['idle', 'working', 'blocked', 'done', 'unknown']

// --- herdr agent list

/** One agent of `herdr agent list`. */
export type Agent = { pane: string; agent: string; status: PeerStatus; title: string }

const asStatus = (v: unknown): PeerStatus => (STATUSES.includes(v as PeerStatus) ? (v as PeerStatus) : 'unknown')
const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/**
 * The agents of `workspace` in `herdr agent list`'s JSON (`.result.agents[]`),
 * this pane among them, in herdr's order. Null when the output is not that
 * JSON, so a bad read never looks like every peer leaving.
 */
export function parseAgents(stdout: string, workspace: string): Agent[] | null {
  let agents: unknown
  try {
    agents = (JSON.parse(stdout) as { result?: { agents?: unknown } }).result?.agents
  } catch {
    return null
  }
  if (!Array.isArray(agents)) return null
  const found: Agent[] = []
  for (const a of agents) {
    if (!a || typeof a !== 'object') continue
    const r = a as Record<string, unknown>
    const pane = asText(r.pane_id)
    if (!pane || asText(r.workspace_id) !== workspace) continue
    found.push({ pane, agent: asText(r.agent) || 'agent', status: asStatus(r.agent_status), title: asText(r.terminal_title_stripped).trim() })
  }
  return found
}

/**
 * Each agent's row at a read at `at`: its time in its state carried from the
 * last read when that read is recent (within two ticks; an older one, as after
 * the view was left, may have missed changes) and saw it in the same state,
 * else from now (then no time is drawn yet).
 */
export function rowsOf(agents: readonly Agent[], last: PeerBoard | null, at: number): PeerRow[] {
  const recent = last && last.isHerdr && at - last.at <= 2 * PEERS_TICK_MS ? last : null
  const before = recent ? [...recent.rows, ...(recent.self ? [recent.self] : [])] : []
  return agents.map(a => {
    const b = before.find(r => r.pane === a.pane)
    return { ...a, since: b && b.status === a.status ? b.since : at }
  })
}

// --- HERDR-ORCH envelopes and requests

// At a line's start, or after `herdr agent prompt <pane>` and an opening quote
// there (the hub's own Bash line, pasted or typed); never mid-sentence.
const HEADER = /^[^\S\n]*(?:herdr agent prompt\s+(\S+)\s+)?["'`]?\[HERDR-ORCH v0\] req=(\S+) from=(\S+)@(\S+) type=(\S+)(.*)$/gm
/** A herdr pane id: `w1:p6`, `wZ:p1`. */
const PANE_ID = /\bw[A-Za-z0-9]+:p\d+\b/g

/** One envelope header found in a prompt, with what the prompt around it says. */
export type Envelope = {
  req: string
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
  return { round: num(pair?.[1]) ?? num(alone?.[1]) ?? num(suffix?.[1]), ceiling: num(pair?.[2]) ?? num(cap?.[1]) }
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
 * The spoke an envelope concerns: the pane of the `herdr agent prompt <pane>`
 * its header line starts with, a `to=<pane>` on that line, or (not for an
 * incoming brief or follow-up, whose body often says how to wake its hub) a
 * `herdr agent prompt <pane>` elsewhere in the text other than the sender's; else the sender, when that is not
 * this pane (a spoke's report reaching this session); else the first other
 * pane id in the text. '' when none. null when this pane is the spoke: a
 * brief or follow-up from another pane naming no other target (sent to this
 * pane), or a report this pane sends (its own, to its hub).
 */
function targetOf(text: string, line: string, rest: string, type: string, fromPane: string, selfPane: string): string | null {
  const isIncoming = fromPane !== selfPane
  if (!isIncoming && !isHubToSpoke(type)) return null
  // The pane of the header's own `herdr agent prompt` line first (a fan-out names one per line), then `to=`, then the text's first.
  const own = /^w[A-Za-z0-9]+:p\d+$/.test(line) ? line : undefined
  const isToThisPane = isIncoming && isHubToSpoke(type)
  const elsewhere = isToThisPane
    ? undefined
    : [...text.matchAll(/\bherdr agent prompt\s+(w[A-Za-z0-9]+:p\d+)\b/g)].map(m => m[1]).find(p => p !== fromPane)
  const to = own ?? /\bto=(w[A-Za-z0-9]+:p\d+)\b/.exec(rest)?.[1] ?? elsewhere
  if (to && to !== selfPane && to !== fromPane) return to
  if (isToThisPane) return null
  if (isIncoming && /^w[A-Za-z0-9]+:p\d+$/.test(fromPane)) return fromPane
  const others = [...text.matchAll(PANE_ID)].map(m => m[0]).filter(p => p !== selfPane && p !== fromPane)
  return others[0] ?? ''
}

/**
 * Every envelope header in a prompt's text, in order, with the target, round
 * and deadline the text gives; an envelope that makes this pane the spoke is
 * left out of `envelopes`, and its sender (a brief's) is the `hub`: this
 * session's hub, drawn first when this session sent no requests of its own.
 */
export function parseEnvelopes(text: string, selfPane: string): { envelopes: Envelope[]; hub: string } {
  const envelopes: Envelope[] = []
  let hub = ''
  for (const m of text.matchAll(HEADER)) {
    const [, line = '', req = '', fromAgent = '', fromPane = '', rawType = '', rest = ''] = m
    // A one-line header in quotes ends its type with the closing quote.
    const type = rawType.replace(/["'`]+$/, '')
    if (!isSafeReq(req) || (!(ENVELOPE_TYPES as readonly string[]).includes(type) && type !== FOLLOWUP)) continue
    const target = targetOf(text, line, rest, type, fromPane, selfPane)
    if (target === null) {
      if (fromPane !== selfPane && isBrief(type) && /^w[A-Za-z0-9]+:p\d+$/.test(fromPane)) hub = fromPane
      continue
    }
    envelopes.push({ req, fromAgent, fromPane, type, target, ...roundOf(text, req), deadlineMs: deadlineOf(text) })
  }
  return { envelopes, hub }
}

/**
 * The requests after these envelopes, submitted at `at`: a new request starts
 * its deadline clock now (the text's deadline, else 30 minutes for a request
 * or handoff); a known one keeps its start, adds the spoke pane it names, and
 * takes a round or deadline the new envelope names, and its type. A follow-up
 * only updates a known request, and a deadline it names counts from the
 * follow-up. The newest MAX_REQUESTS are kept.
 */
export function recordEnvelopes(prev: Readonly<Record<string, PeerRequest>>, envs: readonly Envelope[], at: number): Record<string, PeerRequest> {
  const next: Record<string, PeerRequest> = { ...prev }
  for (const env of envs) {
    const old = next[env.req]
    const isFollowup = env.type === FOLLOWUP
    if (isFollowup && !old) continue
    const deadlineMs = env.deadlineMs ?? (isBrief(env.type) && !old?.deadlineAt ? DEFAULT_DEADLINE_MS : null)
    const deadlineFrom = isFollowup ? at : (old?.sentAt ?? at)
    const panes = old?.panes ?? []
    next[env.req] = {
      req: env.req,
      panes: env.target && !panes.includes(env.target) ? [...panes, env.target] : [...panes],
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

/** The folder of the result files: `<home>/.local/state/herdr-orch`. */
export const orchRoot = (home: string): string => `${home.replace(/\/+$/, '')}/${ORCH_DIR}`
/** The result file of a request: `<home>/.local/state/herdr-orch/<req>/result.md`. */
export const resultPath = (home: string, req: string): string => `${orchRoot(home)}/${req}/result.md`

/**
 * A result file's status, POLICY.md section 4: the first line exactly
 * `req: <req>`, the second exactly `status: <status>`, then a non-blank line;
 * '' when it is not valid so, as while the spoke is still writing it.
 */
export function resultStatus(text: string, req: string): string {
  const [first = '', second = '', ...body] = text.split(/\r?\n/)
  if (first !== `req: ${req}`) return ''
  const status = /^status: (\S+)$/.exec(second)?.[1] ?? ''
  if (!body.some(line => line.trim() !== '')) return ''
  return RESULT_STATUSES.includes(status) ? status : ''
}

/** The newest request of each spoke pane: a spoke is drawn under that one only. */
export function requestByPane(requests: Readonly<Record<string, PeerRequest>>): Map<string, PeerRequest> {
  const byPane = new Map<string, PeerRequest>()
  for (const r of Object.values(requests)) {
    for (const pane of r.panes) {
      const had = byPane.get(pane)
      if (!had || r.sentAt > had.sentAt) byPane.set(pane, r)
    }
  }
  return byPane
}

// --- the view's layout

/** Blocked rows first, the rest in herdr's order. */
export const blockedFirst = (rows: readonly PeerRow[]): PeerRow[] => [
  ...rows.filter(r => r.status === 'blocked'),
  ...rows.filter(r => r.status !== 'blocked'),
]

/** One request and the spokes drawn under it. */
export type PeerGroup = { request: PeerRequest; rows: PeerRow[] }

/** What the view draws: the hub's row (and whether it is this pane), the request groups, the other peers. */
export type PeerLayout = { hub: PeerRow | null; isSelfHub: boolean; groups: PeerGroup[]; others: PeerRow[] }

/**
 * The view's layout of a board: the hub's row first (this pane when this
 * session sent requests, else the pane whose brief made this session a
 * spoke), then each request with its spokes (the groups holding a blocked
 * spoke first, then the newest first; blocked spokes first within), then the
 * peers no request names (blocked first). A request no shown peer belongs to
 * is left out.
 */
export function layoutOf(board: PeerBoard, requests: Readonly<Record<string, PeerRequest>>, hubPane: string): PeerLayout {
  const isSelfHub = Object.values(requests).some(r => r.panes.length > 0)
  const hub = isSelfHub ? board.self : (board.rows.find(r => r.pane === hubPane) ?? null)
  const peers = board.rows.filter(r => r.pane !== hub?.pane)
  const byPane = requestByPane(requests)
  const groups = new Map<string, PeerGroup>()
  const others: PeerRow[] = []
  for (const row of peers) {
    const request = byPane.get(row.pane)
    if (!request) {
      others.push(row)
      continue
    }
    const g = groups.get(request.req) ?? { request, rows: [] }
    g.rows.push(row)
    groups.set(request.req, g)
  }
  const isBlocked = (g: PeerGroup) => g.rows.some(r => r.status === 'blocked')
  const ordered = [...groups.values()]
    .map(g => ({ ...g, rows: blockedFirst(g.rows) }))
    .sort((a, b) => Number(isBlocked(b)) - Number(isBlocked(a)) || b.request.sentAt - a.request.sentAt)
  return { hub, isSelfHub, groups: ordered, others: blockedFirst(others) }
}

// --- words

/** `45s`, `12m`, `1h 05m`. */
export function durationText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Each state's glyph and colour; blocked is amber. */
export const STATE_GLYPH: Record<PeerStatus, string> = { blocked: '▲', working: '●', idle: '○', done: '✓', unknown: '?' }
export const STATE_COLOR: Record<PeerStatus, string> = {
  blocked: '#f59e0b',
  working: '#60a5fa',
  idle: '#9ca3af',
  done: '#22c55e',
  unknown: '#9ca3af',
}

/** `▲ blocked 4m`: the glyph, the word and the time in the state (left out until a later read sees it so). */
export const stateText = (r: PeerRow, at: number): string =>
  `${STATE_GLYPH[r.status]} ${r.status}${r.since < at ? ' ' + durationText(at - r.since) : ''}`

/** `"title"`, cut to TITLE_MAX characters; '' when none. */
export function titleText(title: string): string {
  if (!title) return ''
  const chars = [...title]
  return `"${chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX - 1).join('') + '…' : title}"`
}

/** `⏳ 26m left`, `overdue 4m`; '' when no deadline is known. */
export function deadlineText(r: PeerRequest, at: number): string {
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

/** A group's head: `req apr-alp-r4 · round 4/5 · ⏳ 26m left · no result.md`. */
export function requestText(r: PeerRequest, at: number): string {
  const round = r.round !== null ? `round ${r.round}${r.ceiling !== null ? '/' + r.ceiling : ''}` : ''
  // A result file settles the request: its countdown no longer applies.
  const deadline = r.result ? '' : deadlineText(r, at)
  return [`req ${r.req}`, round, deadline, resultText(r.result)].filter(Boolean).join(' · ')
}

/** The view's head: `Peers · 3 in w1 · 1 blocked · read every 30 s`. */
export function peersHead(board: PeerBoard | null): string {
  if (!board) return 'Peers · reading herdr…'
  if (!board.isHerdr) return 'Peers'
  if (board.error) return `Peers · ${board.error}`
  const n = board.rows.length
  const blocked = board.rows.filter(r => r.status === 'blocked').length
  return ['Peers', `${n} in ${board.workspace}`, ...(blocked > 0 ? [`${blocked} blocked`] : []), 'read every 30 s'].join(' · ')
}

// --- reading herdr and the result files (state lives here, so the atoms are declared above)

type HerdrIds = { workspace: string; pane: string }

/** This pane's herdr workspace and pane, or null outside herdr. */
export async function herdrIds($: EngineInterface): Promise<HerdrIds | null> {
  try {
    if ((await $.env.get('HERDR_ENV')) !== '1') return null
    const workspace = await $.env.get('HERDR_WORKSPACE_ID')
    const pane = await $.env.get('HERDR_PANE_ID')
    return workspace && pane ? { workspace, pane } : null
  } catch {
    return null
  }
}

// One read at a time: a slow herdr never stacks reads.
let isPolling = false
// When herdr was last read for the view ($.clock time); the tick reads again 30 s after.
let polledAt = 0

/** The result file of each request a shown spoke belongs to, read with $.fs; only changed records are written. */
async function readResults($: EngineInterface, board: PeerBoard): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) return
  const shown = new Set(board.rows.map(r => r.pane))
  // The folder where every link is followed: a result file is read only when it lands at its own place there.
  const root = (await $.fs.stat(orchRoot(home), { resolve: true }).catch(() => undefined))?.realPath?.replace(/\/+$/, '')
  const found: Record<string, string | null> = {}
  for (const r of Object.values(await read($, peerRequests))) {
    if (!r.panes.some(p => shown.has(p)) || !isSafeReq(r.req)) continue
    const path = resultPath(home, r.req)
    try {
      if (root === undefined) throw new Error('no result folder')
      const stat = await $.fs.stat(path, { resolve: true })
      const isInside = stat.realPath === `${root}/${r.req}/result.md`
      found[r.req] = isInside && stat.kind === 'file' && stat.size <= RESULT_MAX_BYTES ? resultStatus(await $.fs.read(path), r.req) : ''
    } catch {
      // No result file yet.
      found[r.req] = null
    }
  }
  const list = await read($, peerRequests)
  if (!Object.entries(found).some(([req, v]) => list[req] !== undefined && list[req].result !== v)) return
  await update($, peerRequests, l =>
    Object.fromEntries(Object.entries(l).map(([req, r]) => [req, Object.hasOwn(found, req) ? { ...r, result: found[req] ?? null } : r])),
  )
}

/**
 * One read for the view: `herdr agent list` (5 s at most), this workspace's
 * agents kept as the board (this pane apart, for the hub row), then the
 * result files of the requests shown. Outside herdr the board says so and
 * nothing runs. A failed read keeps the last good board; with none yet, the
 * board says the read failed. Best effort.
 */
export async function pollPeers($: EngineInterface): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    const at = await $.clock.now()
    polledAt = at
    const ids = await herdrIds($)
    if (!ids) {
      await update($, peerBoard, () => ({ at, workspace: '', isHerdr: false, self: null, rows: [] }))
      return
    }
    const out = await $.process.run(['herdr', 'agent', 'list'], { timeoutMs: HERDR_TIMEOUT_MS }).catch(() => null)
    const agents = out?.exitCode === 0 ? parseAgents(out.stdout, ids.workspace) : null
    if (!agents) {
      const error = !out ? 'herdr agent list did not run' : out.exitCode !== 0 ? `herdr agent list failed (exit ${out.exitCode})` : 'herdr agent list gave no agent list'
      const last = await read($, peerBoard)
      if (!last || !last.isHerdr || last.error) await update($, peerBoard, () => ({ at, workspace: ids.workspace, isHerdr: true, self: null, rows: [], error }))
      return
    }
    const rows = rowsOf(agents, await read($, peerBoard), at)
    const board: PeerBoard = {
      at,
      workspace: ids.workspace,
      isHerdr: true,
      self: rows.find(r => r.pane === ids.pane) ?? null,
      rows: rows.filter(r => r.pane !== ids.pane),
    }
    await update($, peerBoard, () => board)
    await readResults($, board)
  } catch {
    // herdr gave no answer: the view keeps its last read.
  } finally {
    isPolling = false
  }
}

/** True while the agents pane is open. */
async function isPaneOpen($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    return false
  }
}

/**
 * From the 1 s tick: reads herdr when 30 s passed since the last read, and
 * only while the pane is open in the Peers view. Never awaited by the tick.
 */
export async function tickPeers($: EngineInterface, at: number): Promise<void> {
  if (at - polledAt < PEERS_TICK_MS || isPolling) return
  if ((await read($, view)) !== 'peers' || !(await isPaneOpen($))) return
  await pollPeers($)
}

/** `p`: the Peers view, read now. */
export async function showPeers($: EngineInterface): Promise<void> {
  await setView($, 'peers')
  await pollPeers($)
}

/** Keeps the HERDR-ORCH requests (and the hub) in a prompt this session submitted. */
export async function noteEnvelopes($: EngineInterface, text: string): Promise<void> {
  if (!text.includes('[HERDR-ORCH v0]')) return
  const ids = await herdrIds($)
  if (!ids) return
  const { envelopes, hub } = parseEnvelopes(text, ids.pane)
  if (hub) await update($, peerHub, () => hub)
  if (envelopes.length === 0) return
  const at = await $.clock.now()
  await update($, peerRequests, l => recordEnvelopes(l, envelopes, at))
}
