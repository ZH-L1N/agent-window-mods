// Shared by register.tsx and row.tsx: the look, the parsers of each command's
// output (the arithmetic of herdr-setup/monitor/herdr_monitor.py,
// sysinfo_parts and _mem_used_bytes) and the row's segments. The state atoms
// are declared again in each file that reads or writes them: the engine reads
// a state source only from a const of the calling file.
import type { SysBattery, SysReading } from '../types'
import type { RenderElement, RenderNode } from 'claude-code'

export const CHIP = ' ▣ SYS     ' // padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#2dd4bf'
export const GREEN = '#22c55e'
export const AMBER = '#f59e0b'
export const RED = '#ef4444'
export const BAR_CELLS = 6
/** CPU and RAM turn amber at this percentage, red at the next. */
export const AMBER_AT = 80
export const RED_AT = 95
/** The battery turns red under this percentage while it does not charge. */
export const BATTERY_LOW = 15
/** The reader's period. */
export const TICK_MS = 5_000
/** Each reader command's limit. */
export const RUN_TIMEOUT_MS = 2_000
/** Each herdr command's limit (the btop split). */
export const HERDR_TIMEOUT_MS = 5_000
export const COMMAND = 'sys'
export const STORE_BAND = 'sys.band'
/** Run by the new pane's shell, so $HOME expands there. */
export const BTOP_LINE = 'XDG_CONFIG_HOME=$HOME/.config/btop-mini btop'
export const NEEDS_HERDR = `btop needs a herdr pane (/${COMMAND} btop)`
export const USAGE = `Usage: /${COMMAND} on | off | now | btop`

const GIB = 1024 ** 3

/** The first figure of `sysctl -n vm.loadavg` (`{ 2.12 1.59 1.46 }`): the 1-minute load. */
export function parseLoad(stdout: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(stdout)
  return m ? Number(m[1]) : null
}

/** A positive whole number (`sysctl -n hw.ncpu`, `hw.memsize`), else null. */
export function parsePositiveInt(stdout: string): number | null {
  const n = Number.parseInt(stdout.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Load over cores as a whole percentage, truncated as the monitor's int() does. */
export const cpuPercent = (load: number, cores: number): number => Math.floor((load / cores) * 100 + 1e-9)

/**
 * Bytes in use from vm_stat: active + wired down + occupied by compressor
 * pages times the page size in its header (4096 when the header lacks one);
 * null when any of the three is missing.
 */
export function memUsedBytes(vmStat: string): number | null {
  const header = /page size of (\d+) bytes/.exec(vmStat)
  const page = header ? Number(header[1]) : 4096
  let pages = 0
  for (const key of ['Pages active', 'Pages wired down', 'Pages occupied by compressor']) {
    const m = new RegExp(`${key}:\\s+(\\d+)`).exec(vmStat)
    if (!m) return null
    pages += Number(m[1])
  }
  return pages * page
}

/**
 * The battery from `pmset -g batt`: the first `n%`, and whether it charges
 * (`; charging`, `; charged`, `; finishing charge`). Null with no percent: a
 * machine with no battery.
 */
export function parseBattery(stdout: string): SysBattery | null {
  const m = /(\d+)%/.exec(stdout)
  if (!m) return null
  return { percent: Number(m[1]), isCharging: /;\s*(charging|charged|finishing charge)/i.test(stdout) }
}

/** Green under 80%, amber from 80%, red from 95%. */
export const levelColor = (pct: number): string => (pct >= RED_AT ? RED : pct >= AMBER_AT ? AMBER : GREEN)

/** Red under 15% while not charging; otherwise the default colour. */
export const batteryColor = (b: SysBattery): string | undefined => (b.percent < BATTERY_LOW && !b.isCharging ? RED : undefined)

/** Filled cells of the 6-cell bar: at least one above 0%, all six from 100%. */
export const barCells = (pct: number, cells = BAR_CELLS): number =>
  pct <= 0 ? 0 : Math.min(cells, Math.max(1, Math.round((pct / 100) * cells)))

export const ramPercent = (ram: { used: number; total: number }): number => (ram.used / ram.total) * 100

/** `28.9/64G`: used to one decimal, the total whole, in GiB. */
export const ramText = (ram: { used: number; total: number }): string => `${(ram.used / GIB).toFixed(1)}/${Math.round(ram.total / GIB)}G`

/** The row's switch: /sys on|off when set, else the `band` option (anything but `off` is on). */
export const isBandOn = (stored: '' | 'on' | 'off', option: unknown): boolean => (stored ? stored === 'on' : option !== 'off')

/** One run of text in the row: its words and how they are drawn. */
export type Seg = { text: string; color?: string; bg?: string; isBold?: boolean; isDim?: boolean }

export const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + [...s.text].length, 0)

const bar = (pct: number, color: string): Seg[] => {
  const n = barCells(pct)
  return [
    ...(n > 0 ? [{ text: '▰'.repeat(n), color }] : []),
    ...(n < BAR_CELLS ? [{ text: '▱'.repeat(BAR_CELLS - n), isDim: true }] : []),
  ]
}

/**
 * The row's segments after the chip, fitted to `room` columns: with both bars
 * and the battery first, then without the bars, then without the battery.
 * Empty when the reading has nothing to show.
 */
export function readingSegs(r: SysReading | null, room: number): Seg[] {
  if (!r) return []
  const build = (isBars: boolean, isBattery: boolean): Seg[] => {
    const parts: Seg[][] = []
    if (r.cpu !== null) {
      const c = levelColor(r.cpu)
      parts.push([{ text: 'CPU ' }, { text: `${r.cpu}%`, color: c }, ...(isBars ? [{ text: ' ' }, ...bar(r.cpu, c)] : [])])
    }
    if (r.ram) {
      const pct = ramPercent(r.ram)
      const c = levelColor(pct)
      parts.push([{ text: 'RAM ' }, { text: ramText(r.ram), color: c }, ...(isBars ? [{ text: ' ' }, ...bar(pct, c)] : [])])
    }
    if (r.battery && isBattery) {
      const c = batteryColor(r.battery)
      parts.push([{ text: `⚡ ${r.battery.percent}%`, ...(c ? { color: c, isBold: true } : {}) }])
    }
    return parts.flatMap((p, i) => [{ text: i === 0 ? ' ' : ' · ', isDim: i > 0 }, ...p])
  }
  const tries = [build(true, true), build(false, true), build(false, false)]
  const fits = tries.find(t => widthOf(t) <= room)
  const chosen = fits ?? tries[tries.length - 1]!
  return chosen.length > 0 ? chosen : []
}

/** `CPU 6% · RAM 28.9/64G · ⚡ 65% (discharging)`: the /sys now answer. */
export function readingText(r: SysReading): string {
  const parts: string[] = []
  if (r.cpu !== null) parts.push(`CPU ${r.cpu}%`)
  if (r.ram) parts.push(`RAM ${ramText(r.ram)} (${Math.round(ramPercent(r.ram))}%)`)
  if (r.battery) parts.push(`⚡ ${r.battery.percent}% (${r.battery.isCharging ? 'charging' : 'not charging'})`)
  return parts.length > 0 ? parts.join(' · ') : 'No reading: sysctl, vm_stat and pmset gave nothing.'
}

/** The new pane's id from `herdr pane split`'s JSON (`.result.pane.pane_id`), else null. */
export function paneIdOf(stdout: string): string | null {
  try {
    const j = JSON.parse(stdout) as { result?: { pane?: { pane_id?: unknown } } }
    const id = j.result?.pane?.pane_id
    return typeof id === 'string' && id.length > 0 ? id : typeof id === 'number' ? String(id) : null
  } catch {
    return null
  }
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
