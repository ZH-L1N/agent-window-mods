// The handoff mod's pure helpers: the stacked bar, the fill against the
// compaction point and its colours, the top three categories, the reading
// from $.session.usage, HANDOFF.md's objective, and small formatters.
// No state here: each file that reads or writes state declares its own refs
// (the engine reads a state source only from a const of the calling file).
import type { PluginOptions, SessionUsage } from 'claude-code'

import type { HandoffCategory, HandoffContext, HandoffSettings } from '../types'
import type { RenderElement, RenderNode } from 'claude-code'

export const CHIP = ' ⇄ HANDOFF ' // the widest zehui-mods chip; the others pad to it
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#a78bfa'
export const GREEN = '#22c55e'
export const AMBER = '#f59e0b'
export const RED = '#ef4444'
export const BAR_CELLS = 20
/** Under this percent of the compaction point the fill is green; amber from it to the threshold. */
export const AMBER_FROM = 60
export const TOP_COUNT = 3
export const FILE_NAME = 'HANDOFF.md'
/** A save this recent counts as fresh at a compaction. */
export const FRESH_MS = 10 * 60_000
/** How often HANDOFF.md is looked at while a save is being written, and for how long. */
export const WATCH_MS = 3_000
export const WATCH_FOR_MS = 20 * 60_000
export const COMMAND = 'handoff-line'
/** The person's own command, run in place of the prompt when it exists. */
export const OWN_COMMAND = 'handoff'
export const RESUME_PROMPT = 'Read HANDOFF.md and continue from its exact next step'

export const DEFAULTS: HandoffSettings = { band: 'on', mode: 'ask', threshold: 80 }

/** The prompt that asks Claude to write the handoff, naming where. */
export const savePrompt = (root: string): string =>
  [
    `Write a handoff note to ${handoffPath(root)} (replace the file if it exists) so a fresh session can pick up this work without this conversation.`,
    'Use these sections, short and specific (file paths, commands, names):',
    '## Objective (one line first)',
    '## Done',
    '## In progress',
    '## Next',
    '## Decisions and why',
    '## Open questions',
    '## Exact next step (one concrete action)',
    'Write only that file; do not change anything else.',
  ].join('\n')

export const handoffPath = (root: string): string => `${root.replace(/[\\/]+$/, '')}/${FILE_NAME}`

/** A threshold the row accepts: a whole number from 50 to 95. */
export const isThreshold = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 50 && n <= 95

/** The options as settings, anything unknown falling back to the default. */
export function settingsOf(options: PluginOptions, stored: { band?: unknown; mode?: unknown; threshold?: unknown } = {}): HandoffSettings {
  const pick = <T extends string>(a: unknown, b: unknown, allowed: readonly T[], d: T): T =>
    allowed.includes(a as T) ? (a as T) : allowed.includes(b as T) ? (b as T) : d
  const t = isThreshold(stored.threshold) ? stored.threshold : isThreshold(options.threshold) ? options.threshold : DEFAULTS.threshold
  return {
    band: pick(stored.band, options.band, ['on', 'off'] as const, DEFAULTS.band),
    mode: pick(stored.mode, options.mode, ['ask', 'auto'] as const, DEFAULTS.mode),
    threshold: t,
  }
}

// --- the reading

// The breakdown names each category's colour by its theme key: the dark
// theme's values, approximately; a key not listed draws grey. The same table
// is in token-weather's hooks/token-weather.mjs (local change 3), whose
// reading this mod prefers; this copy serves only when token-weather is absent.
const THEME_HEX: Record<string, string> = {
  text: '#ffffff',
  inactive: '#999999',
  subtle: '#505050',
  suggestion: '#b1b9f9',
  remember: '#b1b9f9',
  success: '#4eba65',
  error: '#ff6b80',
  warning: '#ffc107',
  merged: '#af87ff',
  claude: '#d77757',
  permission: '#b1b9f9',
  planMode: '#48968c',
  autoAccept: '#af87ff',
  promptBorder: '#888888',
  bashBorder: '#fd5db1',
  ide: '#4782c8',
  red_FOR_SUBAGENTS_ONLY: '#dc2626',
  blue_FOR_SUBAGENTS_ONLY: '#2563eb',
  green_FOR_SUBAGENTS_ONLY: '#16a34a',
  yellow_FOR_SUBAGENTS_ONLY: '#ca8a04',
  purple_FOR_SUBAGENTS_ONLY: '#9333ea',
  orange_FOR_SUBAGENTS_ONLY: '#ea580c',
  pink_FOR_SUBAGENTS_ONLY: '#db2777',
  cyan_FOR_SUBAGENTS_ONLY: '#0891b2',
}
const GREY = '#9a9a96'

export const hexFor = (color: unknown): string => {
  if (typeof color !== 'string') return GREY
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  return Object.hasOwn(THEME_HEX, color) ? (THEME_HEX[color] ?? GREY) : GREY
}

/** `$.session.usage({ breakdown: 'summary' })` as a reading, in token-weather's shape; null with no window. */
export function readingOf(usage: SessionUsage, at: number): HandoffContext | null {
  const c = usage.context
  if (!c || !c.window) return null
  const bd = c.breakdown
  // Before any response, with no breakdown to estimate from, there is nothing to draw.
  if (c.tokens == null && !bd) return null
  const categories: HandoffCategory[] = (bd?.categories ?? [])
    .filter(x => x.kind !== 'deferred' && !x.isDeferred && Number(x.tokens) > 0)
    .map(x => ({ name: String(x.name), tokens: Number(x.tokens), color: hexFor(x.color), kind: String(x.kind) }))
  const tokens = c.tokens ?? (bd ? Number(bd.totalTokens) || 0 : 0)
  const threshold = bd && bd.isAutoCompactEnabled !== false ? Number(bd.autoCompactThreshold) || 0 : 0
  return {
    categories,
    totalTokens: tokens,
    maxTokens: c.window,
    ...(threshold ? { autoCompactThreshold: threshold } : {}),
    percent: Math.round(c.percent ?? (tokens / c.window) * 100),
    readAt: at,
  }
}

/** The newer of two readings; one taken before the last /clear does not count. */
export function newest(a: HandoffContext | null | undefined, b: HandoffContext | null | undefined, clearedAt = 0): HandoffContext | null {
  const ok = (r: HandoffContext | null | undefined): r is HandoffContext => !!r && r.readAt >= clearedAt && r.maxTokens > 0
  if (ok(a) && ok(b)) return a.readAt >= b.readAt ? a : b
  return ok(a) ? a : ok(b) ? b : null
}

/** The fill as a whole percent of the compaction point (the window when auto-compact is off). */
export const fillOf = (r: HandoffContext): number => {
  const at = r.autoCompactThreshold && r.autoCompactThreshold > 0 ? r.autoCompactThreshold : r.maxTokens
  return at > 0 ? Math.round((r.totalTokens / at) * 100) : 0
}

/** Green under 60% of the compaction point, amber to the threshold, red from it. */
export const fillColor = (fill: number, threshold: number): string =>
  fill >= threshold ? RED : fill >= Math.min(AMBER_FROM, threshold) ? AMBER : GREEN

// --- the bar

export type Segment = HandoffCategory & { cells: number }

/**
 * The bar as segments of whole cells, in the breakdown's order. A row under
 * half a cell folds into its neighbour (the one before it, else the one
 * after); cells are shared out by largest remainder so they sum to `cells`.
 * The rule token-weather's PLAN row drew by until local change 6.
 */
export function stackBar(categories: readonly HandoffCategory[], cells = BAR_CELLS): Segment[] {
  const total = categories.reduce((sum, c) => sum + c.tokens, 0)
  if (total <= 0) return []
  const unit = total / cells
  const kept: HandoffCategory[] = []
  let carry = 0
  for (const c of categories) {
    const seg = { ...c, tokens: c.tokens + carry }
    carry = 0
    if (seg.tokens < unit / 2) {
      const last = kept[kept.length - 1]
      if (last) last.tokens += seg.tokens
      else carry = seg.tokens
      continue
    }
    kept.push(seg)
  }
  const tail = kept[kept.length - 1]
  if (carry > 0 && tail) tail.tokens += carry
  const exact = kept.map(s => s.tokens / unit)
  const out: Segment[] = kept.map((s, i) => ({ ...s, cells: Math.floor(exact[i] ?? 0) }))
  let left = cells - out.reduce((sum, s) => sum + s.cells, 0)
  const byRemainder = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of byRemainder) {
    if (left <= 0) break
    const s = out[i]
    if (s) s.cells += 1
    left -= 1
  }
  return out.filter(s => s.cells > 0)
}

/** One run of the bar: its glyphs and how they are drawn. */
export type BarRun = { text: string; color?: string; isDim?: boolean }

/** The stacked bar's runs: `▰` per used cell in its colour, dim `▱` free, dim `░` buffer; a two-colour fill without categories. */
export function barRuns(r: HandoffContext, color: string, cells = BAR_CELLS): BarRun[] {
  const segs = stackBar(r.categories, cells)
  if (segs.length === 0) {
    const used = Math.max(0, Math.min(cells, Math.round((r.percent / 100) * cells)))
    const out: BarRun[] = []
    if (used > 0) out.push({ text: '▰'.repeat(used), color })
    if (used < cells) out.push({ text: '▱'.repeat(cells - used), isDim: true })
    return out
  }
  return segs.map(s =>
    s.kind === 'free'
      ? { text: '▱'.repeat(s.cells), isDim: true }
      : s.kind === 'buffer'
        ? { text: '░'.repeat(s.cells), isDim: true }
        : { text: '▰'.repeat(s.cells), color: s.color },
  )
}

/** The three used categories holding the most tokens, as `name n%` of the window, in their colours. */
export function topThree(categories: readonly HandoffCategory[]): { text: string; color: string }[] {
  const total = categories.reduce((sum, c) => sum + c.tokens, 0)
  return categories
    .filter(c => c.kind === 'used')
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, TOP_COUNT)
    .map(c => {
      const pct = total > 0 ? Math.round((c.tokens / total) * 100) : 0
      return { text: `${c.name} ${pct > 0 ? pct : '<1'}%`, color: c.color }
    })
}

// --- HANDOFF.md

/** The objective's first line: the line under an `Objective` heading, else the first line of prose, else the first heading. */
export function objectiveOf(text: string): string {
  const lines = text.split(/\r?\n/).map(l => l.trim())
  const clean = (l: string) => l.replace(/^#+\s*/, '').replace(/^[-*+]\s+/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim()
  const at = lines.findIndex(l => /^#+\s*objective\b/i.test(l))
  if (at >= 0) {
    const inline = clean(lines[at] ?? '').replace(/^objective\s*[:—-]?\s*/i, '')
    if (inline) return inline
    const next = lines.slice(at + 1).find(l => l !== '' && !l.startsWith('#'))
    if (next) return clean(next)
  }
  const prose = lines.find(l => l !== '' && !l.startsWith('#') && !/^---+$/.test(l))
  if (prose) return clean(prose)
  const heading = lines.find(l => l.startsWith('#'))
  return heading ? clean(heading) : ''
}

/** `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function ageText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** `14:32`, local time. */
export const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A short stable key for a path (FNV-1a, 32-bit, hex): the store key of a root's last save. */
export function rootKey(root: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** `117k`, `1.2M`. */
export const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

/** Cuts `s` to `max` characters, the last an ellipsis. */
export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

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
