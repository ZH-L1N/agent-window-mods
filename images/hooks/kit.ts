// Shared by register.tsx and row.tsx: the look, the option held to its listed
// values, the tags read from the prompt box, the placeholder tile's cells, the
// command's words, the terminal-column measure and the stack-order helper.
// Pure functions only; the state atoms are declared again in each file that
// reads or writes them (the engine reads a state source only from a const of
// the calling file).
import type { RenderElement, RenderNode } from 'claude-code'

export const CHIP = ' ▣ IMAGES  ' // the word padded to 7 letters, like every zehui-mods chip, so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#f472b6'
export const COMMAND = 'images'
/** Where the store keeps /images on|off across sessions. */
export const STORE_BAND = 'band'
/** A press's work runs this long after the press, from a timer. */
export const DELAY_MS = 10

export const USAGE = `Usage: /${COMMAND} [on | off]   (/${COMMAND} lists the image tags in the prompt box; on or off shows or hides the tiles)`

/** What a tile says in its middle: the engine hands a plugin no pasted image's bytes before the prompt is sent. */
export const NO_PREVIEW = 'no preview'

// --- the option, held to its listed values

/** The tile heights the `size` option lists, in terminal rows. */
export const SIZES = [16, 24, 32] as const
export type TileSize = (typeof SIZES)[number]

/** The `size` option: 16, 24 or 32 (as the string the settings hold, or a number); 24 for anything else. */
export function sizeOf(option: unknown): TileSize {
  const n = typeof option === 'string' && /^\d+$/.test(option) ? Number(option) : option
  return SIZES.find(s => s === n) ?? 24
}

// --- the tags

/** `[Image #3]` as the engine writes a pasted image's tag in the prompt box. */
const TAG = /\[Image #(\d{1,6})\]/g

/** The n of every `[Image #n]` tag in `text`, in order of first appearance, each once. */
export function tagsOf(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(TAG)) {
    const n = Number(m[1])
    if (n > 0 && !out.includes(n)) out.push(n)
  }
  return out
}

export const tagText = (n: number): string => `[Image #${n}]`

/** Whether two tag lists are the same, in order. */
export const isSameTags = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((n, i) => n === b[i])

/** The row's on/off as kept: on unless it was turned off. */
export const isBandOn = (band: string): boolean => band !== 'off'

// --- the tile

/** The smallest tile drawn, in rows; a tile is twice as many columns wide. */
export const MIN_ROWS = 4
/** Columns between two tiles, and between the chip and the first. */
export const GAP = 1
/** `[ hide ]`, the framed Button at the row's end. */
export const HIDE_WIDTH = 8
/** `+99 more`, the dim note when more tags are in the box than tiles fit. */
export const MORE_WIDTH = 8

/**
 * The tile's box in cells: `size` rows by twice as many columns, shrunk to the
 * band's height (`maxRows` less the caption and `belowRows`, the rows the other
 * bands stacked with this row take, so the whole tree shows without scrolling)
 * and to the width left beside the chip and the hide button; never under
 * MIN_ROWS rows (hasRoom says whether that much fits).
 */
export function tileBox(size: TileSize, maxRows: number, bodyColumns: number, belowRows = 0): { columns: number; rows: number } {
  const byHeight = maxRows > 0 ? maxRows - 1 - belowRows : size
  const byWidth = Math.floor((bodyColumns - cellsOf(CHIP) - GAP - HIDE_WIDTH - GAP) / 2)
  const rows = Math.max(MIN_ROWS, Math.min(size, byHeight, byWidth))
  return { columns: rows * 2, rows }
}

/** Whether the smallest tile and its caption fit in the band beside `belowRows` other rows (an unknown height: yes). */
export const hasRoom = (maxRows: number, belowRows: number): boolean => maxRows <= 0 || maxRows - 1 - belowRows >= MIN_ROWS

const cellsIn = (space: unknown): number => (typeof space === 'number' && space > 0 ? space : 0)

/**
 * The rows a drawn tree takes, as near as its props tell: a string or a Text
 * its lines, a Raster its `rows`, a Box its `height`, else its children summed
 * down a column (with the gaps) or the tallest across a row, plus its border,
 * padding and margin; an unknown element one row, the engine's placeholder none.
 */
export function rowsOf(node: unknown): number {
  if (typeof node === 'string') return node.split('\n').length
  if (typeof node === 'number') return 1
  if (Array.isArray(node)) return node.reduce((sum: number, c) => sum + rowsOf(c), 0)
  if (!node || typeof node !== 'object') return 0
  const n = node as Loose
  const p = n.props ?? {}
  const kids = Array.isArray(n.children) ? n.children : n.children === undefined || n.children === null ? [] : [n.children]
  if (n.type === 'engine' || p.display === 'none') return 0
  if (n.type === 'Raster') return typeof p.rows === 'number' ? p.rows : 1
  if (n.type === 'Text') return Math.max(1, kids.filter(c => typeof c === 'string').join('').split('\n').length)
  if (n.type !== 'Box') return 1
  const outer = (cellsIn(p.margin) || cellsIn(p.marginY)) * 2 + cellsIn(p.marginTop) + cellsIn(p.marginBottom)
  if (typeof p.height === 'number') return p.height + outer
  const sizes = kids.map(rowsOf).filter(r => r > 0)
  const isColumn = p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
  const inner = isColumn
    ? sizes.reduce((sum, r) => sum + r, 0) + Math.max(0, sizes.length - 1) * (cellsIn(p.rowGap) || cellsIn(p.gap))
    : Math.max(0, ...sizes)
  const border = typeof p.borderStyle === 'string' ? (p.borderTop === false ? 0 : 1) + (p.borderBottom === false ? 0 : 1) : 0
  const padding = (cellsIn(p.padding) || cellsIn(p.paddingY)) * 2 + cellsIn(p.paddingTop) + cellsIn(p.paddingBottom)
  return inner + border + padding + outer
}

/** How many tiles fit beside the chip and the hide button, a `+n more` note kept room for when not all do; at least one. */
export function tilesThatFit(count: number, tileColumns: number, bodyColumns: number): number {
  const room = bodyColumns - cellsOf(CHIP) - GAP - HIDE_WIDTH
  const fit = (width: number): number => Math.max(1, Math.floor(width / (tileColumns + GAP)))
  if (fit(room) >= count) return count
  return Math.min(count, fit(room - MORE_WIDTH - GAP))
}

/** Raster colour for the terminal's default (bit 24 alone). */
const DEFAULT = 0x01000000
const FRAME = 0x6b7280
const CHECK_A = 0x27272a
const CHECK_B = 0x3f3f46
const LABEL_BG = 0x18181b
const LABEL_FG = 0xa1a1aa
// An empty cell still names a colour for its glyph, never the terminal's default foreground.
const BLANK_FG = 0x000000
const SPACE = 0x20
const H = 0x2500 // ─
const V = 0x2502 // │
const TL = 0x256d // ╭
const TR = 0x256e // ╮
const BL = 0x2570 // ╰
const BR = 0x256f // ╯

const memo = new Map<string, string>()

/**
 * A placeholder tile's Raster cells, row-major base64 u32 triplets
 * [codePoint, fg, bg]: a round grey frame round a two-grey checkerboard (the
 * usual sign of an empty picture), `no preview` on a dark band across the
 * middle row. The same for every tag of one box size, so kept per size.
 */
export function placeholderCells(columns: number, rows: number): string {
  const key = `${columns}x${rows}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const words = new Uint32Array(columns * rows * 3)
  const put = (x: number, y: number, cp: number, fg: number, bg: number) => {
    const i = (y * columns + x) * 3
    words[i] = cp
    words[i + 1] = fg
    words[i + 2] = bg
  }
  const mid = Math.floor((rows - 1) / 2)
  const label = [...NO_PREVIEW]
  const labelAt = Math.floor((columns - label.length) / 2)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const isTop = y === 0
      const isBottom = y === rows - 1
      const isLeft = x === 0
      const isRight = x === columns - 1
      if (isTop || isBottom) {
        const cp = isLeft ? (isTop ? TL : BL) : isRight ? (isTop ? TR : BR) : H
        put(x, y, cp, FRAME, DEFAULT)
      } else if (isLeft || isRight) {
        put(x, y, V, FRAME, DEFAULT)
      } else if (y === mid) {
        const ch = label[x - labelAt]
        put(x, y, ch !== undefined && columns - 2 >= label.length ? ch.codePointAt(0)! : SPACE, LABEL_FG, LABEL_BG)
      } else {
        // Squares of two columns by one row: half-blocks would make them square pixels of 2 by 2.
        put(x, y, SPACE, BLANK_FG, (Math.floor(x / 2) + y) % 2 === 0 ? CHECK_A : CHECK_B)
      }
    }
  }
  // The hooks environment has the web's Uint8Array.prototype.toBase64; the es2023 lib does not type it.
  const cells = (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
  memo.set(key, cells)
  return cells
}

/** The caption beneath a tile: the tag and the tile's size, `[Image #2] · 48×24`, cut to the tile's width. */
export const captionOf = (n: number, columns: number, rows: number): string => cut(`${tagText(n)} · ${columns}×${rows}`, columns)

// --- the command

/** What /images was asked: the list, on, off, or the usage. */
export type ImagesArgs = { kind: 'list' } | { kind: 'on' } | { kind: 'off' } | { kind: 'usage' }

export function parseArgs(args: string): ImagesArgs {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'list' }
  if (words.length > 1) return { kind: 'usage' }
  if (words[0] === 'on') return { kind: 'on' }
  if (words[0] === 'off' || words[0] === 'hide') return { kind: 'off' }
  return { kind: 'usage' }
}

/** /images with no words: the tags in the box and whether the tiles show. */
export function listText(tags: readonly number[], isOn: boolean): string {
  const state = isOn ? 'tiles on' : `tiles off (/${COMMAND} on shows them)`
  if (tags.length === 0) return `No image tags in the prompt box; ${state}.`
  return `In the prompt box: ${tags.map(tagText).join(', ')}; ${state}. No preview: the engine hands a plugin no pasted image's bytes before the prompt is sent.`
}

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

/** Cut to `max` terminal columns (an ellipsis marks the cut). */
export function cut(text: string, max: number): string {
  if (cellsOf(text) <= max) return text
  let kept = ''
  let width = 0
  for (const ch of text) {
    const w = charCells(ch)
    if (width + w > Math.max(0, max - 1)) break
    kept += ch
    width += w
  }
  return `${kept.trimEnd()}…`
}

// --- the stack

/**
 * This row's key in the zehui-mods stack: IMAGES 90, under NEXT 80 (the plan's
 * section 6 order). Spelled here rather than added to STACK below, so the
 * block below stays the canonical copy unchanged; stackOrderOf reads the
 * number from any `zm-<order>-<name>` key.
 */
export const ROW_KEY = 'zm-90-images'

// Stack order of the zehui-mods band rows (plan 2026-10-20-boards-codemap-recap,
// section 0): SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70,
// NEXT 80 (and IMAGES 90, ROW_KEY above). Copied unchanged from the canonical
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
