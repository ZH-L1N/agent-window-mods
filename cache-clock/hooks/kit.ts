// Shared by register.tsx and row.tsx: the look, the countdown rules, the
// figures of one request and the small formatters. The state atoms are
// declared again in each file that reads or writes them: the engine reads a
// state source only from a const of the calling file.
import type { CacheBucket, CacheStep } from '../types'
import { cachePriceOf } from './prices'
import type { RenderElement, RenderNode } from 'claude-code'

export const CHIP = ' ● CACHE   ' // padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#22d3ee'
export const GREEN = '#22c55e'
export const AMBER = '#f59e0b'
export const RED = '#ef4444'
export const BAR_CELLS = 6
/** The countdown's tick while the cache is warm. */
export const TICK_MS = 30_000
export const COMMAND = 'cache-clock'
export const STORE_BAND = 'cache-clock.band'

const MINUTE = 60_000

/** The `cacheMinutes` option: 5 or 60 (anything but 5 is 60, the default). */
export const windowMinutes = (option: unknown): number => (String(option) === '5' ? 5 : 60)

/**
 * The row turns amber with this much left: 15 minutes of the 1-hour window.
 * The 5-minute window would be amber from its start at 15, so it turns at 2.
 */
export const amberAtMs = (minutes: number): number => (minutes >= 60 ? 15 * MINUTE : 2 * MINUTE)

/**
 * The one toast comes with this much left: 5 minutes of the 1-hour window.
 * The 5-minute window would toast on every request at 5, so it toasts at 1.
 */
export const warnAtMs = (minutes: number): number => (minutes >= 60 ? 5 * MINUTE : 1 * MINUTE)

/** Time left before the cache entry lapses; 0 or less: cold. */
export const leftMs = (lastCacheAt: number, at: number, minutes: number): number => lastCacheAt + minutes * MINUTE - at

/** Green above the amber mark, amber at or under it, red when cold. */
export const leftColor = (left: number, minutes: number): string => (left <= 0 ? RED : left <= amberAtMs(minutes) ? AMBER : GREEN)

/** `52m`: whole minutes left, rounded up, so 14m30s reads `15m`. */
export const minutesText = (left: number): string => `${Math.max(0, Math.ceil(left / MINUTE))}m`

/** Filled cells of the 6-cell bar: the share of the window left, at least one while warm. */
export const barCells = (left: number, minutes: number, cells = BAR_CELLS): number =>
  left <= 0 ? 0 : Math.min(cells, Math.max(1, Math.round((left / (minutes * MINUTE)) * cells)))

/** The tokens the cache holds for the conversation: the last request's reads plus writes. */
export const cachedOf = (s: CacheStep): number => s.reads + s.writes

/** reads / (reads + writes + fresh input) of one request, a whole percentage. */
export const reusedPct = (reads: number, writes: number, input: number): number => {
  const all = reads + writes + input
  return all > 0 ? Math.round((reads / all) * 100) : 0
}

/** What writing the cached tokens again would cost, USD; null for a model with no price. */
export function rewriteUsd(s: CacheStep, minutes: number): number | null {
  const price = cachePriceOf(s.model, s.reads + s.writes + s.input, minutes)
  return price ? (cachedOf(s) * price.write) / 1e6 : null
}

export const emptyBucket = (): CacheBucket => ({ reads: 0, writes: 0, input: 0, steps: 0, savedUsd: 0, unpricedReads: 0 })

/** One request added to a bucket; its reads saved (write price - read price) each, when priced. */
export function addStep(b: CacheBucket, s: CacheStep, minutes: number): CacheBucket {
  const price = cachePriceOf(s.model, s.reads + s.writes + s.input, minutes)
  return {
    reads: b.reads + s.reads,
    writes: b.writes + s.writes,
    input: b.input + s.input,
    steps: b.steps + 1,
    savedUsd: b.savedUsd + (price ? (s.reads * (price.write - price.read)) / 1e6 : 0),
    unpricedReads: b.unpricedReads + (price ? 0 : s.reads),
  }
}

/** The row's switch: /cache-clock on|off when set, else the `band` option (anything but `off` is on). */
export const isBandOn = (stored: '' | 'on' | 'off', option: unknown): boolean => (stored ? stored === 'on' : option !== 'off')

/** `180k`, `1.0M`: rounded to thousands first, so 999.6k reads `1.0M`, never `1000k`. */
export const fmtTokens = (n: number): string => {
  const k = Math.round(n / 1e3)
  return k >= 1000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${k}k` : `${Math.round(n)}`
}

export const fmtUsd = (usd: number): string => (usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`)

/** `≈ $1.12`, or `≈ ?` for a model with no price. */
export const dollarText = (usd: number | null): string => (usd === null ? '≈ ?' : `≈ ${fmtUsd(usd)}`)

/** `14:32`, local time. */
export const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The five-minutes-left toast. */
export const warnText = (s: CacheStep, minutes: number): string =>
  `${fmtTokens(cachedOf(s))} cached, rewrite ${dollarText(rewriteUsd(s, minutes))}. Send anything to keep it warm.`

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
