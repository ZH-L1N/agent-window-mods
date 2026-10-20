// Shared by register.tsx, skin.tsx and band.tsx: the state, the price table,
// the tier colours and the small formatters.
// The state atoms are declared again in each file that reads or writes them:
// the engine reads a state source only from a const of the calling file.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRun, MainLoop, PaneView } from '../types'
import { SHELL_POSE, codexPose, donePose, errorPose, runningPose, waitPose } from './mascots'
import type { Pose } from './mascots'
import { lastLineOf } from './shells'
import { STALE_MS, fmtClock, fmtLeft } from './watch'
import type { RenderElement, RenderNode } from 'claude-code'

const runs = atom({ plugin: 'agents', key: 'runs' } as const, [])
const skills = atom({ plugin: 'agents', key: 'skills' } as const, {})
const main = atom({ plugin: 'agents', key: 'main' } as const, { model: '', isRunning: false, startedAt: 0 })
const now = atom({ plugin: 'agents', key: 'now' } as const, 0)
const dismissedAt = atom({ plugin: 'agents', key: 'dismissedAt' } as const, 0)
const isCompact = atom({ plugin: 'agents', key: 'isCompact' } as const, false)
const isStill = atom({ plugin: 'agents', key: 'isStill' } as const, false)
const tails = atom({ plugin: 'agents', key: 'tails' } as const, {})
const view = atom({ plugin: 'agents', key: 'view' } as const, 'who')
const isDiffArmed = atom({ plugin: 'agents', key: 'isDiffArmed' } as const, false)

export const PANE = 'agents'
export const PANE_TITLE = 'Agents'
/** The band stays up this long after the last run of its batch ends. */
export const LINGER_MS = 10_000
/** A run awaiting a tool's result this long sleeps. */
export const WAIT_MS = 20_000
/** The bar's bright flash on finish, and the amber pulse on error. */
export const FLASH_MS = 600
export const PULSE_MS = 2_000
/** Runs kept in state; the oldest beyond this are dropped. */
export const MAX_RUNS = 200
/** Ended runs (finished or failed) the pane keeps by default; the `keepEnded` option. */
export const KEEP_ENDED = 10
/** The `keepEnded` option as a count: a whole number, else the default. */
export const keepEndedOf = (option: unknown): number => {
  const n = Number(option)
  return Number.isInteger(n) && n >= 0 ? n : KEEP_ENDED
}
/** The list with only the newest `keep` ended runs (by end time); running runs always stay. */
export const pruneEnded = (list: readonly AgentRun[], keep: number): AgentRun[] => {
  const ended = list.filter(a => a.status !== 'running').sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0))
  const drop = new Set(ended.slice(keep).map(a => a.id))
  return drop.size === 0 ? [...list] : list.filter(a => !drop.has(a.id))
}
/** A shell's output file over this size is not read for its last line. */
export const TAIL_MAX_BYTES = 1_048_576
/** What a numbered card button says until the messages view (E3) lands. */
export const MESSAGES_STUB = 'messages view comes with E3'
/** The ALL DONE toast, when the last subagent, shell or watch in flight ends. */
export const ALL_DONE = '★ all background work done'
/** The rising chime played with it (copied from the peers mod). */
export const SOUND_DONE = 'assets/done.wav'
/** The caffeinate hold's command: idle sleep held, for 600 s at most (the tick re-arms it while work runs). */
export const CAFFEINATE = ['caffeinate', '-i', '-t', '600'] as const
/** The `caffeinate` option: anything but `off` is on (default on). */
export const isCaffeinateOn = (option: unknown): boolean => option !== 'off'
/** The `sound` option: only `on` is on (default off). */
export const isSoundOn = (option: unknown): boolean => option === 'on'

/**
 * Files the Code view's `d` + number (or `/agents-info diff <n>`) asked /diff
 * for; the 1 s tick runs them through $.command.run, never the press itself.
 * A reload drops the queue with the environment.
 */
export const diffQueue: string[] = []

// --- tiers: the savvy-flow tier colours (savvy-progress register.tsx, Zehui's copy)

export const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

/**
 * A savvy-flow worker's tier comes from its type (`savvy-careful`); any other
 * run's from its model and effort, the way the savvy tiers are defined
 * (fable: Fable; heavy: Opus xhigh; careful: Opus high; medium: Opus medium;
 * light: Opus low), with Sonnet as medium and Haiku as light.
 */
export const tierOf = (a: Pick<AgentRun, 'type' | 'model' | 'effort'>): string => {
  const bare = a.type.replace(/^[^:]*:/, '')
  const savvy = /^savvy-(\w+)$/i.exec(bare)?.[1]?.toLowerCase()
  if (savvy && Object.hasOwn(TIER_COLOR, savvy)) return savvy
  const family = familyOf(a.model)
  if (family === 'fable' || family === 'mythos') return 'fable'
  if (family === 'opus') {
    if (a.effort === 'xhigh' || a.effort === 'max') return 'heavy'
    if (a.effort === 'high') return 'careful'
    if (a.effort === 'low') return 'light'
    return 'medium'
  }
  if (family === 'sonnet') return 'medium'
  if (family === 'haiku') return 'light'
  return 'other'
}

export const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

// --- models

/** The deck's model colours (the "Claude Code Mods" deck, slide 15). */
export const MODEL_COLOR: Record<string, string> = {
  fable: '#d16bff',
  mythos: '#d16bff',
  opus: '#ff8c1a',
  sonnet: '#3d9bff',
  haiku: '#19c3a6',
}

const MODEL_RE = /(fable|mythos|opus|sonnet|haiku)(?:-(\d+)(?:-(\d{1,2})(?!\d))?)?/i

/** `opus` for `claude-opus-5-5` (or the alias `opus`); '' for an unknown model. */
export const familyOf = (model: string): string => MODEL_RE.exec(model)?.[1]?.toLowerCase() ?? ''

/** `5.5` for `claude-opus-5-5`; '' when the id names no version. */
export const versionOf = (model: string): string => {
  const m = MODEL_RE.exec(model)
  return m?.[2] ? `${m[2]}${m[3] ? '.' + m[3] : ''}` : ''
}

/** `Opus 5.5`: the card's model name; the id itself (less `claude-`) when unknown. */
export const modelName = (model: string): string => {
  const family = familyOf(model)
  if (!family) return model.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  const v = versionOf(model)
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${v ? ' ' + v : ''}`
}

/** `fable·5.1`: the band's word for the main loop's model. */
export const modelTag = (model: string): string => {
  const family = familyOf(model)
  if (!family) return modelName(model)
  const v = versionOf(model)
  return v ? `${family}·${v}` : family
}

// USD per million tokens: input, output, cache read, cache write. From the
// claude-api skill bundled with Claude Code 2.1.303 (model table cached
// 2026-10-06; cache reads as listed there; cache writes at the 5-minute rate,
// 1.25x input, since the engine reports one write count with no TTL split).
type Price = readonly [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: Record<string, Price> = {
  'fable-5.1': [10, 50, 0.25, 12.5],
  'mythos-5.1': [10, 50, 0.25, 12.5],
  'fable-5': [10, 50, 1, 12.5],
  'mythos-5': [10, 50, 1, 12.5],
  'opus-5.5': [4, 20, 0.2, 5],
  'opus-5': [5, 25, 0.5, 6.25],
  'opus-4.8': [5, 25, 0.5, 6.25],
  'opus-4.7': [5, 25, 0.5, 6.25],
  'opus-4.6': [5, 25, 0.5, 6.25],
  'sonnet-5.5': [2, 10, 0.2, 2.5],
  'sonnet-5': [2, 10, 0.2, 2.5],
  'sonnet-4.6': [3, 15, 0.3, 3.75],
  'haiku-5.5': [0.1, 0.5, 0.01, 0.125],
  'haiku-4.5': [1, 5, 0.1, 1.25],
}
// Haiku 5.5 is priced by prompt length: a request whose prompt (input and cache
// reads and writes) is over 100K tokens pays these instead.
const HAIKU_55_LONG: Price = [0.5, 2.5, 0.05, 0.625]
const HAIKU_55_LONG_PROMPT = 100_000

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const promptOf = (u: Usage): number =>
  (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)

export const tokensOf = (u: Usage): number => promptOf(u) + (u.output_tokens || 0)

/** One request's cost in USD, or null for a model the table does not know. */
export const costOf = (model: string, u: Usage): number | null => {
  const key = `${familyOf(model)}-${versionOf(model)}`
  const base = PRICES[key]
  if (!base) return null
  const [i, o, r, w] = key === 'haiku-5.5' && promptOf(u) > HAIKU_55_LONG_PROMPT ? HAIKU_55_LONG : base
  return (
    ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * w) / 1e6
  )
}

/** Haiku 4.5 and the Claude 3 models have a 200K window; the rest 1M. */
export const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// --- formatting

export const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

export const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

/** `≈$0.09`, or `≈ ?` for a run on a model with no price. */
export const costText = (a: Pick<AgentRun, 'costUsd' | 'isUnpriced'>): string => (a.isUnpriced ? '≈ ?' : '≈' + fmtCost(a.costUsd))

export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

export const ctxPct = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

/** Cuts `s` to `max` characters, the last an ellipsis. */
export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// --- run state

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
/** The braille spinner's frame at `at` (one step per 100 ms); `●` when motion is reduced. */
export const spinnerAt = (at: number, still: boolean): string => (still ? '●' : (SPINNER[Math.floor(at / 100) % SPINNER.length] ?? '●'))

export const isWaiting = (a: AgentRun, at: number): boolean =>
  a.status === 'running' && a.awaitingSince !== undefined && at - a.awaitingSince > WAIT_MS

/** True for a background shell's run. */
export const isShell = (a: Pick<AgentRun, 'kind'>): boolean => a.kind === 'shell'

/** True for a Monitor watcher's or a CronCreate timer's run: the pane lists them under Watching. */
export const isWatching = (a: Pick<AgentRun, 'kind'>): boolean => a.kind === 'watch' || a.kind === 'cron'

/** In flight: a subagent, shell or watch still running (a cron waiting to fire is not). */
export const isInFlight = (a: Pick<AgentRun, 'kind' | 'status'>): boolean => a.status === 'running' && a.kind !== 'cron'

/** True while a stale notification greys the entry. */
export const isStale = (a: Pick<AgentRun, 'staleAt'>, at: number): boolean => a.staleAt !== undefined && at - a.staleAt < STALE_MS

/**
 * A watch's or cron's time words: `⏳ 12m` left before a watch's deadline
 * (its elapsed time when persistent), `20:30 in 41m` for a cron's next fire
 * (its schedule when that is unknown).
 */
export const watchTime = (a: AgentRun, at: number): string => {
  if (a.kind === 'cron') return a.nextAt !== undefined ? `${fmtClock(a.nextAt)} in ${fmtLeft(a.nextAt - at)}` : (a.schedule ?? '')
  return a.nextAt !== undefined ? `⏳ ${fmtLeft(a.nextAt - at)}` : `⏳ ${fmtTime(elapsed(a, at))}`
}

/**
 * The pose a run's card shows now: a pick from its state's pool by its run id,
 * so it never changes pose within a state. A shell keeps the terminal window
 * (a codex fuzzy for a coding agent's CLI).
 */
export const poseOf = (a: AgentRun, at: number): Pose =>
  isShell(a)
    ? a.label
      ? codexPose(a.id)
      : SHELL_POSE
    : a.status === 'finished'
      ? donePose(a.id)
      : a.status === 'error'
        ? errorPose(a.id)
        : isWaiting(a, at)
          ? waitPose(a.id)
          : runningPose(a.id)

/** The id the main loop's hub pose is picked by: the session's id, else its first main turn's, else `main`. */
export const mainPoseId = (m: Pick<MainLoop, 'id'>): string => m.id || 'main'

/**
 * Each card's number, 1 up, in pane order: Running, Finished, then Error
 * (watches and crons are not numbered). The Code view's subagents row uses the same.
 */
export const cardNumbers = (list: readonly AgentRun[]): Map<string, number> => {
  const cards = list.filter(a => !isWatching(a))
  const ordered = [...cards.filter(a => a.status === 'running'), ...cards.filter(a => a.status === 'finished'), ...cards.filter(a => a.status === 'error')]
  return new Map(ordered.map((a, i) => [a.id, i + 1]))
}

/** A shell's words before its task: `sh`, or the agent and its model (`codex gpt-5.4`). */
export const shellWords = (a: Pick<AgentRun, 'label' | 'model'>): string =>
  a.label ? `${a.label}${a.model ? ' ' + clip(a.model, 16) : ''}` : 'sh'

/** The toast's cut of a task text. */
export const TOAST_TASK_MAX = 40

/**
 * The toast for a run that ended: `✓ Explore "survey the mods" finished in
 * 0:31`; `✗ sh "pytest -q tests/" exit 1 after 0:42`, `killed after`, or
 * `failed after` when no exit code is known.
 */
export const toastText = (a: AgentRun): string => {
  if (isWatching(a)) {
    const what = a.description ? ` "${clip(a.description, TOAST_TASK_MAX)}"` : ''
    const span = fmtTime(elapsed(a, a.endedAt ?? a.startedAt))
    return a.status === 'finished' ? `✓ ${a.kind}${what} ended after ${span}` : `✗ ${a.kind}${what} ${a.endWord ?? 'failed'} after ${span}`
  }
  const who = isShell(a) ? shellWords(a) : a.name || a.type
  const task = a.description ? ` "${clip(a.description, TOAST_TASK_MAX)}"` : ''
  const t = fmtTime(elapsed(a, a.endedAt ?? a.startedAt))
  if (a.status === 'finished') return `✓ ${who}${task} finished in ${t}`
  const how = a.endWord === 'killed' ? 'killed' : a.exitCode !== undefined ? `exit ${a.exitCode}` : 'failed'
  return `✗ ${who}${task} ${how} after ${t}`
}

/** The `toasts` option: anything but `off` is on. */
export const isToastsOn = (option: unknown): boolean => option !== 'off'

/** True while the step in flight has taken twice the average of the run's finished steps. */
export const isSlowStep = (a: AgentRun, at: number): boolean => {
  const cycles = a.stepCycles ?? 0
  if (a.status !== 'running' || cycles < 2 || a.stepStartedAt === undefined) return false
  return at - a.stepStartedAt > (2 * (a.stepMsTotal ?? 0)) / cycles
}

const isLive = (a: AgentRun, at: number): boolean =>
  a.status === 'running' || (a.endedAt !== undefined && at - a.endedAt <= LINGER_MS) || isStale(a, at)

/**
 * The band's batch: the live runs (running, or ended within LINGER_MS) plus the
 * runs that ended at or after the earliest live start, one level only. Empty
 * when nothing is live, or when no run of it started after `dismissed`.
 */
export function batchOf(list: readonly AgentRun[], at: number, dismissed = 0): AgentRun[] {
  const live = list.filter(a => isLive(a, at))
  if (live.length === 0) return []
  // A watch or cron can wait for hours: it anchors the batch only when nothing else is live.
  const anchors = live.filter(a => !isWatching(a))
  const from = Math.min(...(anchors.length ? anchors : live).map(a => a.startedAt))
  const batch = list.filter(a => isLive(a, at) || (a.endedAt ?? Number.POSITIVE_INFINITY) >= from)
  return batch.some(a => a.startedAt > dismissed) ? batch : []
}

/** The time a drawing is drawn at: the tick's, or a later event's. */
export const drawTime = (list: readonly AgentRun[], tick: number): number =>
  Math.max(tick, 0, ...list.map(a => Math.max(a.startedAt, a.endedAt ?? 0)))

/** The `band` option: anything but `off` is on. */
export const isBandOn = (option: unknown): boolean => option !== 'off'

/**
 * The last output line of each ended shell the pane has none for (one that
 * ended while the pane was closed, past the tick's linger reads), read once
 * as the pane opens; never a file over TAIL_MAX_BYTES. Best effort.
 */
async function readEndedTails($: EngineInterface): Promise<void> {
  try {
    const list = await read($, runs)
    const have = await read($, tails)
    const found: Record<string, string> = {}
    for (const a of list) {
      if (!isShell(a) || !a.outputFile || a.status === 'running' || have[a.id] !== undefined) continue
      try {
        if ((await $.fs.stat(a.outputFile)).size > TAIL_MAX_BYTES) continue
        const line = lastLineOf(await $.fs.read(a.outputFile))
        if (line !== undefined) found[a.id] = line
      } catch {
        // No file any more: the card keeps its '…'.
      }
    }
    if (Object.keys(found).length === 0) return
    const ids = new Set(list.map(r => r.id))
    await update($, tails, t => ({ ...Object.fromEntries(Object.entries(t).filter(([id]) => ids.has(id))), ...found }))
  } catch {
    // No state or files to read: the cards keep what they had.
  }
}

/**
 * Opens the pane (in `to`'s view when given), the tick's time brought up to
 * date first, then fills the ended shells' last lines.
 */
export async function openPane($: EngineInterface, to?: PaneView): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  if (to !== undefined) await setView($, to)
  await $.ui.open({ id: PANE, title: PANE_TITLE })
  await readEndedTails($)
}

/** Switches the pane's view (`w` Who, `c` Code); the diff pick is dropped. */
export async function setView($: EngineInterface, to: PaneView): Promise<void> {
  await update($, view, () => to)
  await update($, isDiffArmed, () => false)
}

/** Closes the pane (`q`, `/agents-info close`); false when it was not open. */
export async function closePane($: EngineInterface): Promise<boolean> {
  if (!(await $.ui.panes()).some(p => p.id === PANE)) return false
  await $.ui.close({ id: PANE })
  return true
}

/** Toggles the pane; true when it is open afterwards. */
export async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await openPane($)
  return true
}

/** Hides the band until a new run starts, and clears its skills. */
export async function dismissBand($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, dismissedAt, () => at)
  await update($, skills, () => ({}))
}

/** The shells' last output lines, by run id (subscribing the drawing to them). */
export async function readTails($: EngineInterface): Promise<Readonly<Record<string, string>>> {
  return read($, tails)
}

/** The runs and the tick's time, read together for a drawing (subscribing it to both). */
export async function readRuns($: EngineInterface): Promise<{ list: readonly AgentRun[]; at: number }> {
  const list = await read($, runs)
  return { list, at: drawTime(list, await read($, now)) }
}

// Stack order of the zehui-mods band rows (plan 2026-10-20-boards-codemap-recap,
// section 0): SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70,
// NEXT 80. Copied unchanged from the canonical
// ~/.claude/skills/building-claude-code-mods/references/stack-row.tsx; change it
// there first, then in every band mod.

/** The rows each zehui-mods band draws, by stack order. */
export const STACK = { sys: 10, plan: 20, handoff: 30, cache: 40, agents: 50, goal: 60, here: 70, next: 80 } as const

/** A row's key: `zm-<order>-<name>`. */
export const stackKey = (name: keyof typeof STACK): string => `zm-${STACK[name]}-${name}`

type Loose = { type?: unknown; props?: Record<string, unknown> | null; part?: unknown; children?: unknown }

/** The order of a zehui-mods row (`zm-<order>-<name>`), or null for any other node. */
export const stackOrderOf = (node: unknown): number | null => {
  const key = node && typeof node === 'object' ? (node as Loose).props?.key : undefined
  const m = typeof key === 'string' ? /^zm-(\d+)-/.exec(key) : null
  return m ? Number(m[1]) : null
}

/**
 * The column a band hook beneath built: a Box whose only prop is
 * `flexDirection: 'column'` and whose direct children hold a zm row. A Box with
 * other props (a border, a padding) is another mod's own drawing, kept whole.
 */
const isStack = (node: Loose): node is Loose & { children: unknown[] } =>
  node.type === 'Box' &&
  node.props?.flexDirection === 'column' &&
  Object.keys(node.props).every(k => k === 'flexDirection') &&
  Array.isArray(node.children) &&
  node.children.some(c => stackOrderOf(c) !== null)

/**
 * `row` put in its slot among the zm rows of `below` (what `next(e)` drew):
 * zm rows sorted by their number, then every other child in its original order.
 * Nothing beneath (null, a failed next, the engine placeholder): the row alone.
 */
export function stackRow(row: RenderElement, below: unknown): RenderElement {
  const tree = below && typeof below === 'object' && (below as Loose).type !== 'engine' ? (below as Loose) : null
  if (!tree) return row
  let items: unknown[] = [tree]
  if (isStack(tree)) {
    items = [...tree.children]
    // The column's mark (whose drawing started there) moves to the one row
    // that carries none, its own; the engine lets a mark move, never multiply.
    const bare = items.filter(c => c && typeof c === 'object' && !(c as Loose).part)
    if (tree.part && bare.length === 1) items = items.map(c => (c === bare[0] ? { ...(c as object), part: tree.part } : c))
  }
  const rows = items.filter(c => stackOrderOf(c) !== null)
  const others = items.filter(c => stackOrderOf(c) === null)
  // A stable sort: two rows of one number keep their order, this row after.
  const sorted = [...rows, row].sort((a, b) => (stackOrderOf(a) ?? 0) - (stackOrderOf(b) ?? 0))
  return { type: 'Box', props: { flexDirection: 'column' }, children: [...sorted, ...others] as RenderNode[] }
}
