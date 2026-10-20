// Shared by register.tsx, row.tsx and pane.tsx: the look, how a task-list
// tool call changes the goal, the figures the row shows and the small
// formatters. Pure functions only; the state atoms are declared again in each
// file that reads or writes them (the engine reads a state source only from a
// const of the calling file).
import type { Goal, GoalRecord, GoalTask, GoalTaskStatus } from '../types'
import type { RenderElement, RenderNode } from 'claude-code'

export const CHIP = ' ◆ GOAL    ' // padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#facc15'
export const GREEN = '#22c55e'
export const AMBER = '#f59e0b'
export const BAR_CELLS = 6
/** The row's tick while a goal shows. */
export const TICK_MS = 15_000
/** A finished goal's `done ✓` stays this long, then the row hides. */
export const DONE_SHOW_MS = 2 * 60_000
/** A running task is dragging once it has taken this many times the finished tasks' average. */
export const SLOW_FACTOR = 2
export const NAME_MAX = 50
export const HISTORY_MAX = 5
export const COMMAND = 'goals'
export const PANE = 'goals'
export const PANE_TITLE = 'Goals'
export const STORE_BAND = 'goal-meter.band'
export const STORE_HISTORY = 'goal-meter.history'

const MINUTE = 60_000

// --- terminal columns

/** East Asian Wide and Fullwidth ranges (CJK, Hangul, fullwidth forms) and emoji: two columns each. */
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

/** The columns one character takes in the terminal: 2 for a wide one, else 1. */
export function charCells(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

/** The columns a string takes in the terminal. */
export const cellsOf = (s: string): number => [...s].reduce((w, ch) => w + charCells(ch), 0)

// --- the goal's name

/** The first non-empty line of a prompt, cut to `max` terminal columns (an ellipsis marks the cut). */
export function goalName(prompt: string, max = NAME_MAX): string {
  const line = prompt.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) ?? ''
  const flat = line.replace(/\s+/g, ' ')
  if (flat.length === 0) return 'Task list'
  if (cellsOf(flat) <= max) return flat
  let kept = ''
  let width = 0
  for (const ch of flat) {
    const w = charCells(ch)
    if (width + w > max - 1) break
    kept += ch
    width += w
  }
  return `${kept.trimEnd()}…`
}

// --- how a task-list call changes the goal

/** A task moved to `status` at `at`; its times follow the move. */
export function withStatus(t: GoalTask, status: GoalTaskStatus, at: number): GoalTask {
  if (t.status === status) return t
  if (status === 'in_progress') return { id: t.id, title: t.title, status, startedAt: t.startedAt ?? at }
  if (status === 'completed') return { ...t, status, doneAt: at }
  return { id: t.id, title: t.title, status }
}

export const isAllDone = (g: Goal): boolean => g.tasks.length > 0 && g.tasks.every(t => t.status === 'completed')

/** The goal's `doneAt`: set when its last task is completed, cleared when one opens again. */
export function settle(g: Goal, at: number): Goal {
  if (isAllDone(g)) return g.doneAt === undefined ? { ...g, doneAt: at } : g
  if (g.doneAt === undefined) return g
  const { doneAt: _, ...open } = g
  return open
}

/** Whether a list call starts a new goal: none yet, or the last one is finished. */
export const startsNew = (g: Goal | null): boolean => g === null || g.doneAt !== undefined

const fresh = (prompt: string, at: number): Goal => ({ name: goalName(prompt), startedAt: at, tasks: [] })

export type TodoItem = { content: string; status: GoalTaskStatus }

const sameTitles = (g: Goal, todos: readonly TodoItem[]): boolean =>
  g.tasks.length === todos.length && g.tasks.every((t, i) => t.title === todos[i]?.content)

/**
 * TodoWrite: the list is the whole list. Items keep their times by title; a
 * new list after a finished goal starts a new goal (`replaced` is the old
 * one). An empty list ends the goal.
 */
export function applyTodos(
  prev: Goal | null,
  todos: readonly TodoItem[],
  at: number,
  prompt: string,
): { goal: Goal | null; replaced: Goal | null } {
  if (todos.length === 0) return { goal: null, replaced: prev }
  const isNew = startsNew(prev)
  // The finished list written again as it was: the same goal, not a new one.
  if (isNew && prev && todos.every(td => td.status === 'completed') && sameTitles(prev, todos)) return { goal: prev, replaced: null }
  const base = isNew ? fresh(prompt, at) : (prev as Goal)
  const unused = [...base.tasks]
  const tasks = todos.map((td, i) => {
    const k = unused.findIndex(t => t.title === td.content)
    const old = k >= 0 ? unused.splice(k, 1)[0] : undefined
    const task: GoalTask = old ?? { id: `todo-${at}-${i}`, title: td.content, status: 'pending' }
    return withStatus(task, td.status, at)
  })
  return { goal: settle({ ...base, tasks }, at), replaced: isNew ? prev : null }
}

/** TaskCreate: one pending task; after a finished goal it starts a new goal. */
export function applyCreate(
  prev: Goal | null,
  id: string,
  subject: string,
  at: number,
  prompt: string,
): { goal: Goal; replaced: Goal | null } {
  const isNew = startsNew(prev)
  const base = isNew ? fresh(prompt, at) : (prev as Goal)
  const tasks = [...base.tasks.filter(t => t.id !== id), { id, title: subject, status: 'pending' as const }]
  return { goal: settle({ ...base, tasks }, at), replaced: isNew ? prev : null }
}

/** TaskUpdate: a known task's status or subject; `deleted` removes it. Unknown ids change nothing. */
export function applyUpdate(
  prev: Goal | null,
  u: { taskId: string; status?: GoalTaskStatus | 'deleted'; subject?: string },
  at: number,
): Goal | null {
  if (!prev || !prev.tasks.some(t => t.id === u.taskId)) return prev
  const status = u.status
  const tasks =
    status === 'deleted'
      ? prev.tasks.filter(t => t.id !== u.taskId)
      : prev.tasks.map(t => {
          if (t.id !== u.taskId) return t
          const titled = u.subject ? { ...t, title: u.subject } : t
          return status ? withStatus(titled, status, at) : titled
        })
  return settle({ ...prev, tasks }, at)
}

/**
 * TaskList: the statuses of the goal's own tasks, as the list reads them now.
 * Tasks of older goals in the same list are not pulled in, and a finished
 * goal is left alone.
 */
export function applyList(prev: Goal | null, listed: readonly { id: string; status: GoalTaskStatus }[], at: number): Goal | null {
  if (!prev || prev.doneAt !== undefined) return prev
  const byId = new Map(listed.map(t => [t.id, t.status]))
  const tasks = prev.tasks.map(t => {
    const s = byId.get(t.id)
    return s ? withStatus(t, s, at) : t
  })
  return settle({ ...prev, tasks }, at)
}

// --- the figures

/**
 * How long a finished task took: from its start, or, when it never showed as
 * running, from the finish before it (or the goal's start).
 */
export function spanOf(t: GoalTask, g: Goal): number | null {
  if (t.doneAt === undefined) return null
  const doneAt = t.doneAt
  const before = g.tasks
    .filter(o => o !== t && o.doneAt !== undefined && o.doneAt <= doneAt)
    .reduce((m, o) => Math.max(m, o.doneAt ?? 0), 0)
  const from = t.startedAt ?? (before > 0 ? before : g.startedAt)
  return Math.max(0, doneAt - from)
}

/** The finished tasks' average time; null before the first finish. */
export function averageMs(g: Goal): number | null {
  const spans = g.tasks.filter(t => t.status === 'completed').map(t => spanOf(t, g) ?? 0)
  return spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null
}

export type GoalView = {
  done: number
  total: number
  pct: number
  /** Since the goal started; up to its finish once done. */
  elapsedMs: number
  /** Average per finished task × tasks left; null before the first finish or once done. */
  etaMs: number | null
  /** The in_progress task, else the first pending one. */
  current: GoalTask | null
  /** How long the current task has run; null when it is not running. */
  currentMs: number | null
  /** The running task has taken SLOW_FACTOR times the average. */
  isSlow: boolean
  isDone: boolean
}

export function viewOf(g: Goal, at: number): GoalView {
  const total = g.tasks.length
  const done = g.tasks.filter(t => t.status === 'completed').length
  const isDone = g.doneAt !== undefined
  const avg = averageMs(g)
  const current = isDone ? null : (g.tasks.find(t => t.status === 'in_progress') ?? g.tasks.find(t => t.status === 'pending') ?? null)
  const currentMs = current?.status === 'in_progress' && current.startedAt !== undefined ? Math.max(0, at - current.startedAt) : null
  return {
    done,
    total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    elapsedMs: Math.max(0, (g.doneAt ?? at) - g.startedAt),
    etaMs: !isDone && avg !== null && done > 0 ? avg * (total - done) : null,
    current,
    currentMs,
    isSlow: currentMs !== null && avg !== null && avg > 0 && currentMs >= SLOW_FACTOR * avg,
    isDone,
  }
}

/** Whether the row shows the goal at `at`: tasks to show, and not past the done linger. */
export const isShown = (g: Goal | null, at: number): g is Goal =>
  g !== null && g.tasks.length > 0 && (g.doneAt === undefined || at - g.doneAt < DONE_SHOW_MS)

/** Filled cells of the bar: done of total, at least one once any is done, all only when all are. */
export function barCells(done: number, total: number, cells = BAR_CELLS): number {
  if (total <= 0 || done <= 0) return 0
  if (done >= total) return cells
  return Math.min(cells - 1, Math.max(1, Math.round((done / total) * cells)))
}

// --- the history

export const recordOf = (g: Goal): GoalRecord => ({
  name: g.name,
  startedAt: g.startedAt,
  ...(g.doneAt !== undefined ? { doneAt: g.doneAt } : {}),
  total: g.tasks.length,
  done: g.tasks.filter(t => t.status === 'completed').length,
})

/** The goal into the history, newest first: replacing its own earlier record, the last HISTORY_MAX kept. */
export const withRecord = (history: readonly GoalRecord[], g: Goal): GoalRecord[] =>
  [recordOf(g), ...history.filter(r => r.startedAt !== g.startedAt)].slice(0, HISTORY_MAX)

/** The store's history, whatever it held: well-formed records only. */
export function historyOf(stored: unknown): GoalRecord[] {
  if (!Array.isArray(stored)) return []
  return stored
    .filter(
      (r): r is GoalRecord =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as GoalRecord).name === 'string' &&
        typeof (r as GoalRecord).startedAt === 'number' &&
        typeof (r as GoalRecord).total === 'number' &&
        typeof (r as GoalRecord).done === 'number',
    )
    .slice(0, HISTORY_MAX)
}

// --- the switch and the formatters

/** The row's switch: /goals on|off when set, else the `band` option (anything but `off` is on). */
export const isBandOn = (stored: '' | 'on' | 'off', option: unknown): boolean => (stored ? stored === 'on' : option !== 'off')

/** `18m`, `1h05m`: whole minutes, rounded. */
export function fmtMin(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE))
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** `~9m`: an estimate, never under a minute. */
export const fmtEta = (ms: number): string => `~${fmtMin(Math.max(MINUTE, ms))}`

/** `14:32`, local time. */
export const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The one toast when the last task is completed. */
export const doneToast = (g: Goal): string =>
  `Goal done in ${fmtMin((g.doneAt ?? g.startedAt) - g.startedAt)}, ${g.tasks.length} ${g.tasks.length === 1 ? 'task' : 'tasks'}`

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
