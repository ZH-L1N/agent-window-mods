// Shared by register.tsx and the tests: the constants, the parser of
// `herdr agent list`, the transition step that turns two polls into alerts,
// and the texts. The state atoms live in register.tsx only: the engine reads
// a state source only from a const of the calling file.
import type { PeerSeen, PeerStatus } from '../types'

/** The poll's period. */
export const TICK_MS = 30_000
/** `herdr agent list`'s limit. */
export const HERDR_TIMEOUT_MS = 5_000
export const COMMAND = 'peer-alarm'
/** /peer-alarm on|off, kept across sessions; anything but 'off' watches. */
export const STORE_WATCH = 'peers.watch'
/** /peer-alarm sound on|off, kept across sessions; '' or absent: the `sound` option applies. */
export const STORE_SOUND = 'peers.sound'
/** The bundled clips, relative to the plugin's directory (tools/make-sounds.py writes them). */
export const SOUND_BLOCKED = 'assets/blocked.wav'
export const SOUND_DONE = 'assets/done.wav'
/** A title longer than this is cut, with an ellipsis, in toasts and the list. */
export const TITLE_MAX = 48
export const NEEDS_HERDR = `The peer alarm needs a herdr pane (HERDR_ENV=1 with a workspace and pane id) (/${COMMAND} list)`
export const USAGE = `Usage: /${COMMAND} list | on | off | sound on|off`

/** One agent of this workspace, other than this pane, from `herdr agent list`. */
export type Peer = {
  pane: string
  agent: string
  status: PeerStatus
  title: string
}

/** What a poll raises: one toast each, and a clip for blocked and ALL DONE when sound is on. */
export type Alert = { kind: 'blocked' | 'finished' | 'alldone'; text: string }

const STATUSES: readonly PeerStatus[] = ['idle', 'working', 'blocked', 'done', 'unknown']

const asStatus = (v: unknown): PeerStatus => (STATUSES.includes(v as PeerStatus) ? (v as PeerStatus) : 'unknown')

const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/**
 * The peers in `herdr agent list`'s JSON (`.result.agents[]`): only those in
 * `workspace`, never `selfPane`, in herdr's order. Null when the output is not
 * that JSON, so a bad read never looks like every peer leaving.
 */
export function parsePeers(stdout: string, workspace: string, selfPane: string): Peer[] | null {
  let agents: unknown
  try {
    agents = (JSON.parse(stdout) as { result?: { agents?: unknown } }).result?.agents
  } catch {
    return null
  }
  if (!Array.isArray(agents)) return null
  const peers: Peer[] = []
  for (const a of agents) {
    if (!a || typeof a !== 'object') continue
    const r = a as Record<string, unknown>
    const pane = asText(r.pane_id)
    if (!pane || pane === selfPane || asText(r.workspace_id) !== workspace) continue
    peers.push({
      pane,
      agent: asText(r.agent) || 'agent',
      status: asStatus(r.agent_status),
      title: asText(r.terminal_title_stripped).trim(),
    })
  }
  return peers
}

/** ` "title"`, cut to TITLE_MAX characters; '' when there is no title. */
export function quoted(title: string): string {
  if (!title) return ''
  const chars = [...title]
  const cut = chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX - 1).join('') + '…' : title
  return ` "${cut}"`
}

const isRest = (s: PeerStatus): boolean => s === 'idle' || s === 'done'

export type StepResult = { seen: Record<string, PeerSeen>; isArmed: boolean; alerts: Alert[] }

/**
 * One poll against the last: the new `seen`, whether ALL DONE is armed, and
 * the alerts. With no last poll (`prev` null) it only takes a baseline: no
 * alerts, armed when a peer is working. Afterwards: a pane that becomes
 * blocked (or first appears blocked) raises ▲; one that goes from working to
 * idle or done raises ✓; a peer going working arms ALL DONE; and once every
 * peer rests (idle or done) while armed, ★ ALL DONE fires and disarms.
 */
export function step(prev: Record<string, PeerSeen> | null, peers: readonly Peer[], now: number, wasArmed: boolean): StepResult {
  const seen: Record<string, PeerSeen> = {}
  const alerts: Alert[] = []
  let isArmed = wasArmed
  for (const p of peers) {
    const old = prev?.[p.pane]
    const isSame = old !== undefined && old.status === p.status
    seen[p.pane] = { status: p.status, since: isSame ? old.since : now, agent: p.agent, title: p.title }
    if (p.status === 'working') isArmed = true
    if (prev === null || isSame) continue
    if (p.status === 'blocked') alerts.push({ kind: 'blocked', text: `▲ ${p.pane}${quoted(p.title)} is blocked` })
    else if (old?.status === 'working' && isRest(p.status)) alerts.push({ kind: 'finished', text: `✓ ${p.pane}${quoted(p.title)} finished` })
  }
  if (prev !== null && isArmed && peers.length > 0 && peers.every(p => isRest(p.status))) {
    alerts.push({ kind: 'alldone', text: `★ ALL DONE · ${peers.length} ${peers.length === 1 ? 'peer' : 'peers'} idle` })
    isArmed = false
  }
  return { seen, isArmed, alerts }
}

/** `45s`, `12m`, `1h 05m`. */
export function durationText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/**
 * The /peer-alarm list answer: one line per peer (pane, agent, state, time in that
 * state, title). The time is known only while the watcher has seen the pane in
 * the same state; it counts from the first poll that saw it so.
 */
export function listText(workspace: string, peers: readonly Peer[], seen: Record<string, PeerSeen> | null, now: number): string {
  if (peers.length === 0) return `No other agents in herdr workspace ${workspace}.`
  const lines = peers.map(p => {
    const s = seen?.[p.pane]
    const time = s && s.status === p.status ? ` ${durationText(now - s.since)}` : ''
    return `${p.pane}  ${p.agent}  ${p.status}${time}${quoted(p.title)}`
  })
  return [`${peers.length} ${peers.length === 1 ? 'peer' : 'peers'} in herdr workspace ${workspace}:`, ...lines].join('\n')
}

/** The watcher's switch: anything but a stored 'off' watches. */
export const isWatchOn = (stored: unknown): boolean => stored !== 'off'

/** Sound: /peer-alarm sound on|off when stored, else the `sound` option (only 'on' plays). */
export const isSoundOn = (stored: unknown, option: unknown): boolean =>
  stored === 'on' || stored === 'off' ? stored === 'on' : option === 'on'
