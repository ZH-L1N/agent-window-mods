// The strip's pills: their colours, their words at four levels of richness,
// their cell widths and the chooser that takes the richest level that fits.
// Pure, no engine calls, so the look is tested without a session.

/** Catppuccin Mocha. */
export const C = {
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  red: '#f38ba8',
  teal: '#94e2d5',
  mauve: '#cba6f7',
  sapphire: '#74c7ec',
  lavender: '#b4befe',
  dim: '#6c7086',
  /** An idle pill's body and caps. */
  surface: '#313244',
  /** An attention pill's text. */
  ink: '#11111b',
} as const

/** Powerline rounded caps (Nerd Font, private use area: one cell each). */
export const CAP_L = '\ue0b6'
export const CAP_R = '\ue0b4'

/** Nerd Font icons, private use area: one cell each, never drawn as emoji. */
export const ICON = {
  stop: '\uf04d',
  context: '\uf0e4',
  cache: '\uf017',
  diff: '\uf440',
  tests: '\uf00c',
  testsFailing: '\uf00d',
  agents: '\uf0c0',
  queue: '\uf03a',
  system: '\uf2db',
  peers: '\uf0e8',
  health: '\uf071',
} as const

export type PillId = 'stop' | 'context' | 'cache' | 'diff' | 'tests' | 'agents' | 'queue' | 'system' | 'peers' | 'health'
/** Left to right. */
export const PILL_IDS: readonly PillId[] = ['stop', 'context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers', 'health']

/** What the pills show, from whichever source answered (see sources.ts). */
export type Facts = {
  /** A held motion is running (the motion-hold mod); null: none. */
  stop: { summary: string } | null
  /** Percent of the auto-compact threshold (or of the window); null with no reading. */
  context: { pct: number } | null
  /** Cache warmth left in ms (0 or less: cold); null with no cache data. */
  cacheLeftMs: number | null
  /** Applied edits of the running turn, else of the last one that made any. */
  diff: number
  /** The last test run; null: none seen. */
  tests: { failed: number; total: number } | null
  /** Running subagents. */
  agents: number
  /** Prompts waiting in the queue mod. */
  queue: { count: number; isPaused: boolean }
  /** RAM and CPU percent; null with no reading. */
  sys: { ram: number | null; cpu: number | null } | null
  /** Other panes, and how many of them are blocked. */
  peers: { count: number; waiting: number }
  /** What is wrong with the session; null: no pill. */
  health: { text: string } | null
}

/** One run of a pill's text; `color` overrides the pill's own on an idle pill (the bar's empty cells). */
export type Seg = { text: string; color?: string }

/**
 * One pill. `color` is its text on an idle pill and its body on an attention
 * pill; `segs` is its body, the icon first.
 */
export type Pill = { id: PillId; isAttention: boolean; color: string; segs: Seg[] }

/** 0 full, 1 without the context bar, 2 without the words, 3 numbers only. */
export type Level = 0 | 1 | 2 | 3
const LEVELS: readonly Level[] = [0, 1, 2, 3]

/** Cells kept for the working pill: a space, two caps and one frame. */
export const WORK_W = 4

const BAR_CELLS = 10
const BAR_FULL = '\u25b0'
const BAR_EMPTY = '\u25b1'
const EN_DASH = '\u2013'
/** Attention from this many percent of RAM or CPU. */
const SYS_ALERT_PCT = 90
/** The cache pill turns yellow with less than this left. */
const CACHE_LOW_MS = 10 * 60_000
/** When even level 3 is too wide, idle pills go in this order. */
const DROP_ORDER: readonly PillId[] = ['peers', 'system', 'queue', 'agents', 'tests', 'diff', 'cache']

/** Zero-width code points: controls, combining marks, joiners and variation selectors. */
const isZeroWidth = (cp: number): boolean =>
  cp < 0x20 ||
  (cp >= 0x7f && cp < 0xa0) ||
  (cp >= 0x300 && cp <= 0x36f) ||
  (cp >= 0x483 && cp <= 0x489) ||
  (cp >= 0x591 && cp <= 0x5bd) ||
  (cp >= 0x610 && cp <= 0x61a) ||
  (cp >= 0x64b && cp <= 0x65f) ||
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x200b && cp <= 0x200f) ||
  (cp >= 0x20d0 && cp <= 0x20ff) ||
  (cp >= 0x3099 && cp <= 0x309a) ||
  (cp >= 0xfe00 && cp <= 0xfe0f) ||
  (cp >= 0xfe20 && cp <= 0xfe2f) ||
  cp === 0xfeff ||
  (cp >= 0xe0100 && cp <= 0xe01ef)

/**
 * Two cells: East Asian wide and fullwidth, and the emoji blocks. The private
 * use area (the caps and icons), box drawing and block elements stay one.
 */
const isWide = (cp: number): boolean =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f000 && cp <= 0x1faff) ||
  (cp >= 0x20000 && cp <= 0x3fffd)

/** The cells a string takes in a terminal: 0, 1 or 2 for each code point. */
export function cellWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    w += isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1
  }
  return w
}

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)

/** Filled cells of the bar: none at 0%, at least one above, all from 100%. */
const barCells = (pct: number): number => (pct <= 0 ? 0 : Math.min(BAR_CELLS, Math.max(1, Math.round((pct / 100) * BAR_CELLS))))

const idle = (id: PillId, icon: string, color: string, text: string): Pill => ({
  id,
  isAttention: false,
  color,
  segs: text === '' ? [{ text: icon }] : [{ text: icon }, { text }],
})

const alert = (id: PillId, icon: string, text: string): Pill => ({
  id,
  isAttention: true,
  color: C.red,
  segs: text === '' ? [{ text: icon }] : [{ text: icon }, { text }],
})

function contextPill(f: Facts, level: Level): Pill {
  if (!f.context) return idle('context', ICON.context, C.dim, EN_DASH)
  const pct = whole(f.context.pct)
  const isAttention = pct >= 80
  const color = pct < 30 ? C.green : pct < 60 ? C.yellow : pct < 80 ? C.peach : C.red
  const segs: Seg[] = [{ text: ICON.context }]
  if (level === 0) {
    const n = barCells(pct)
    if (n > 0) segs.push({ text: BAR_FULL.repeat(n) })
    if (n < BAR_CELLS) segs.push({ text: BAR_EMPTY.repeat(BAR_CELLS - n), color: C.dim })
    segs.push({ text: ` ${pct}%` })
  } else {
    segs.push({ text: `${pct}%` })
  }
  return { id: 'context', isAttention, color, segs }
}

function cachePill(f: Facts): Pill {
  const left = f.cacheLeftMs
  if (left === null || !Number.isFinite(left)) return idle('cache', ICON.cache, C.dim, EN_DASH)
  if (left <= 0) return idle('cache', ICON.cache, C.dim, 'cold')
  return idle('cache', ICON.cache, left < CACHE_LOW_MS ? C.yellow : C.teal, `${Math.ceil(left / 60_000)}m`)
}

/** A count pill: its colour above 0, dim at 0. */
function countPill(id: PillId, icon: string, color: string, count: number): Pill {
  const n = whole(count)
  return idle(id, icon, n > 0 ? color : C.dim, `${n}`)
}

function testsPill(f: Facts, level: Level): Pill {
  const t = f.tests
  if (!t) return idle('tests', ICON.tests, C.dim, EN_DASH)
  const failed = whole(t.failed)
  const total = whole(t.total)
  if (failed > 0) return alert('tests', ICON.testsFailing, level <= 1 ? `tests ${failed}/${total}` : `${failed}/${total}`)
  return idle('tests', ICON.tests, C.green, `${total}`)
}

function queuePill(f: Facts, level: Level): Pill {
  const n = whole(f.queue.count)
  if (n > 0 && f.queue.isPaused) return idle('queue', ICON.queue, C.yellow, level <= 1 ? `${n} paused` : `${n}`)
  return countPill('queue', ICON.queue, C.lavender, n)
}

function systemPill(f: Facts, level: Level): Pill {
  const s = f.sys
  const parts: string[] = []
  if (s && s.ram !== null && s.ram >= SYS_ALERT_PCT) parts.push(level <= 2 ? `RAM ${whole(s.ram)}%` : `${whole(s.ram)}%`)
  if (s && s.cpu !== null && s.cpu >= SYS_ALERT_PCT) parts.push(level <= 2 ? `CPU ${whole(s.cpu)}%` : `${whole(s.cpu)}%`)
  if (parts.length === 0) return idle('system', ICON.system, C.dim, '')
  return alert('system', ICON.system, parts.join(' '))
}

function peersPill(f: Facts, level: Level): Pill {
  const count = whole(f.peers.count)
  const waiting = whole(f.peers.waiting)
  if (count <= 0) return idle('peers', ICON.peers, C.dim, '0')
  if (waiting > 0) return idle('peers', ICON.peers, C.peach, level <= 1 ? `${count} \u00b7 ${waiting} waiting` : `${count}\u00b7${waiting}`)
  return idle('peers', ICON.peers, C.green, `${count}`)
}

function healthPill(f: Facts, level: Level): Pill | null {
  if (!f.health) return null
  const text = f.health.text.trim()
  return alert('health', ICON.health, level <= 2 ? text : (text.split(/\s+/)[0] ?? ''))
}

/** The pills, left to right, at one level of richness. */
export function pillsAt(f: Facts, level: Level): Pill[] {
  const pills: (Pill | null)[] = [
    f.stop ? alert('stop', ICON.stop, 'STOP') : null,
    contextPill(f, level),
    cachePill(f),
    countPill('diff', ICON.diff, C.mauve, f.diff),
    testsPill(f, level),
    countPill('agents', ICON.agents, C.sapphire, f.agents),
    queuePill(f, level),
    systemPill(f, level),
    peersPill(f, level),
    healthPill(f, level),
  ]
  return pills.filter((p): p is Pill => p !== null)
}

/** One pill's cells: two caps and its body. */
const pillWidth = (p: Pill): number => 2 + p.segs.reduce((w, s) => w + cellWidth(s.text), 0)

/** The strip's cells: its pills and one space between each two. */
export function stripWidth(pills: readonly Pill[]): number {
  return pills.reduce((w, p) => w + pillWidth(p), 0) + Math.max(0, pills.length - 1)
}

/**
 * The richest level whose strip fits `columns - reserve`. When the plainest
 * still does not, idle pills are left out from the right (peers first);
 * context and every attention pill always stay.
 */
export function fitStrip(f: Facts, columns: number, reserve: number): { level: Level; pills: Pill[] } {
  const room = columns - reserve
  for (const level of LEVELS) {
    const pills = pillsAt(f, level)
    if (stripWidth(pills) <= room) return { level, pills }
  }
  let pills = pillsAt(f, 3)
  for (const id of DROP_ORDER) {
    if (stripWidth(pills) <= room) break
    pills = pills.filter(p => p.id !== id || p.isAttention)
  }
  return { level: 3, pills }
}

/** The strip as plain text, caps and icons included: for tests and /strip sources. */
export function stripText(pills: readonly Pill[]): string {
  return pills.map(p => CAP_L + p.segs.map(s => s.text).join('') + CAP_R).join(' ')
}
