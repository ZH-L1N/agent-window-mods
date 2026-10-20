// Shared by register.tsx, pipeline.ts and row.tsx: the look, the options held
// to their listed values, the tags read from a sent prompt, the session's
// images folder by name, the sips command lines, the BMP reader, the
// box-average into half-block Raster cells, the command's words, the
// terminal-column measure and the stack-order helper. Pure functions only; the
// state atoms are declared again in each file that reads or writes them (the
// engine reads a state source only from a const of the calling file).
import type { RenderElement, RenderNode } from 'claude-code'

import type { ImageTile } from '../types'

export const CHIP = ' ▣ IMAGES  ' // the word padded to 7 letters, like every zehui-mods chip, so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#e879f9'
export const COMMAND = 'img'
/** Where the store keeps /img on|off across sessions. */
export const STORE_BAND = 'band'
/** A timer's work starts this long after the hook or press that set it. */
export const DELAY_MS = 10
/** How often the image file is looked for, and for how long in all. */
export const POLL_MS = 250
export const WAIT_MS = 5_000
/** Each sips run's limit. */
export const SIPS_TIMEOUT_MS = 3_000
/** The tallest tile, in half-block rows (two pixels each). */
export const MAX_ROWS = 24
/** The most tiles kept; the newest last. */
export const MAX_TILES = 6
/** linger=2min: the row clears this long after it first showed a tile. */
export const LINGER_MS = 120_000
/** Where the engine keeps each user's `claude-<uid>` folder. */
export const TMP_ROOT = '/private/tmp'
/** The scratch folder for the BMPs, under HOME. */
export const CACHE_DIR = '.cache/zehui-mods/images'

export const USAGE = `Usage: /${COMMAND} [<n> | on | off | clear]   (/${COMMAND} shows the last tiles again; <n> draws [Image #n] of this session; off stops the automatic tiles; clear drops them)`

// --- the options, held to their listed values

/** The tile widths the `size` option lists, in terminal columns. */
export const SIZES = [12, 16, 24, 32] as const
export type TileSize = (typeof SIZES)[number]

/** The `size` option: 12, 16, 24 or 32 (as the string the settings hold, or a number); 24 for anything else. */
export function sizeOf(option: unknown): TileSize {
  const n = typeof option === 'string' && /^\d+$/.test(option) ? Number(option) : option
  return SIZES.find(s => s === n) ?? 24
}

/** The `auto` option: 'on' unless it says 'off'. */
export const autoOf = (option: unknown): 'on' | 'off' => (option === 'off' ? 'off' : 'on')

export const LINGERS = ['turn', '2min', 'until-cleared'] as const
export type Linger = (typeof LINGERS)[number]

/** The `linger` option: turn, 2min or until-cleared; turn for anything else. */
export const lingerOf = (option: unknown): Linger => LINGERS.find(l => l === option) ?? 'turn'

/** Whether a sent prompt's images are drawn on their own: the store's on|off, else the `auto` option. */
export const isAutoOn = (band: string, option: unknown): boolean => (band === 'on' || band === 'off' ? band === 'on' : autoOf(option) === 'on')

// --- the tags

/** `[Image #3]` as the engine writes a pasted image's tag in the prompt. */
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

// --- where the engine writes the pasted images

/**
 * The names the engine may give the session's working directory under
 * `claude-<uid>`: every '/' as '-' (`/Users/zehui/Documents/GitHub` is
 * `-Users-zehui-Documents-GitHub`), then every character but a letter or a
 * digit as '-' (a '.' in the path), when that differs.
 */
export function slugsOf(cwd: string): string[] {
  const slashes = cwd.replaceAll('/', '-')
  const all = cwd.replace(/[^A-Za-z0-9]/g, '-')
  return slashes === all ? [slashes] : [slashes, all]
}

/** The `claude-<uid>` folders among a listing of TMP_ROOT, by name, in order. */
export const claudeDirsOf = (entries: readonly { name: string; kind: string }[]): string[] =>
  entries.filter(e => e.kind === 'dir' && /^claude-\d+$/.test(e.name)).map(e => e.name).sort()

/** Every folder that may be the session's own (its pasted images are in `images` beneath), most likely first. */
export const sessionDirsOf = (claudeDirs: readonly string[], cwd: string, sessionId: string): string[] =>
  claudeDirs.flatMap(d => slugsOf(cwd).map(slug => `${TMP_ROOT}/${d}/${slug}/${sessionId}`))

// --- sips

/** The command that turns the PNG into an uncompressed BMP no taller or wider than 2 × MAX_ROWS pixels. */
export const sipsArgv = (png: string, bmp: string): string[] => ['sips', '-s', 'format', 'bmp', '-Z', String(2 * MAX_ROWS), png, '--out', bmp]

/** The command that reads the PNG's own size (sips refuses a query and a change in one run). */
export const sizeArgv = (png: string): string[] => ['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', png]

/** The width and height from `sips -g pixelWidth -g pixelHeight`, or null. */
export function parseSipsSize(stdout: string): { w: number; h: number } | null {
  const w = /pixelWidth:\s*(\d+)/.exec(stdout)
  const h = /pixelHeight:\s*(\d+)/.exec(stdout)
  return w && h && Number(w[1]) > 0 && Number(h[1]) > 0 ? { w: Number(w[1]), h: Number(h[1]) } : null
}

// --- the BMP

/** A decoded bitmap: `width` by `height` pixels, `rgb` three bytes each, top row first. */
export type Bitmap = { width: number; height: number; rgb: Uint8Array }

/** The largest side read; sips is asked for 2 × MAX_ROWS. */
const MAX_SIDE = 4096

/** A channel's shift and its largest value, from a BI_BITFIELDS mask. */
function channelOf(mask: number): { shift: number; max: number } | null {
  if (mask === 0) return null
  let shift = 0
  while (((mask >>> shift) & 1) === 0) shift++
  return { shift, max: mask >>> shift }
}

/**
 * Reads an uncompressed BMP: `BM`, the pixels' offset (bfOffBits at 10), the
 * width and height (int32 at 18 and 22; a negative height is top-down), the
 * bits per pixel (28: 24 or 32) and the compression (30: 0 BI_RGB, or 3
 * BI_BITFIELDS with the red, green and blue masks at 54). Rows are padded to
 * 4 bytes. Alpha is ignored. Null for anything else or a short file.
 */
export function parseBmp(bytes: Uint8Array): Bitmap | null {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bpp = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  const height = Math.abs(rawHeight)
  const isTopDown = rawHeight < 0
  if (bpp !== 24 && bpp !== 32) return null
  if (compression !== 0 && compression !== 3) return null
  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) return null
  const stride = Math.floor((bpp * width + 31) / 32) * 4
  if (offset < 54 || offset + stride * (height - 1) + width * (bpp / 8) > bytes.length) return null
  const step = bpp / 8
  let masks: { r: { shift: number; max: number }; g: { shift: number; max: number }; b: { shift: number; max: number } } | null = null
  if (compression === 3 && bpp === 32) {
    if (bytes.length < 66) return null
    const r = channelOf(view.getUint32(54, true))
    const g = channelOf(view.getUint32(58, true))
    const b = channelOf(view.getUint32(62, true))
    if (!r || !g || !b) return null
    masks = { r, g, b }
  }
  const rgb = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    const row = offset + (isTopDown ? y : height - 1 - y) * stride
    for (let x = 0; x < width; x++) {
      const at = row + x * step
      const out = (y * width + x) * 3
      if (masks) {
        const px = view.getUint32(at, true)
        rgb[out] = Math.round((((px >>> masks.r.shift) & masks.r.max) * 255) / masks.r.max)
        rgb[out + 1] = Math.round((((px >>> masks.g.shift) & masks.g.max) * 255) / masks.g.max)
        rgb[out + 2] = Math.round((((px >>> masks.b.shift) & masks.b.max) * 255) / masks.b.max)
      } else {
        // BI_RGB stores blue, green, red (and an unused byte at 32 bits).
        rgb[out] = bytes[at + 2]!
        rgb[out + 1] = bytes[at + 1]!
        rgb[out + 2] = bytes[at]!
      }
    }
  }
  return { width, height, rgb }
}

// --- the tile

/**
 * A tile's box in cells for an image `w` by `h`: `size` columns and
 * round(size × h / w / 2) half-block rows (a cell is about twice as tall as
 * wide, and holds two pixels), at least one; past MAX_ROWS rows the tile is
 * MAX_ROWS rows and narrower, so the image keeps its shape.
 */
export function tileGrid(size: number, w: number, h: number): { columns: number; rows: number } {
  if (w <= 0 || h <= 0) return { columns: size, rows: 1 }
  const rows = Math.max(1, Math.round((size * h) / w / 2))
  if (rows <= MAX_ROWS) return { columns: size, rows }
  return { columns: Math.max(1, Math.min(size, Math.round((MAX_ROWS * 2 * w) / h))), rows: MAX_ROWS }
}

const UPPER = 0x2580 // ▀: the top pixel as the foreground, the bottom one as the background

/**
 * The bitmap box-averaged to `columns` by `rows × 2` pixels and packed as
 * Raster cells, row-major base64 u32 triplets [codePoint, fg, bg]: each cell
 * `▀`, the upper pixel its foreground and the lower its background. A source
 * smaller than the grid repeats its pixels.
 */
export function rasterCells(bmp: Bitmap, columns: number, rows: number): string {
  const height = rows * 2
  const px = new Uint32Array(columns * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * bmp.height) / height)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * bmp.height) / height))
    for (let x = 0; x < columns; x++) {
      const x0 = Math.floor((x * bmp.width) / columns)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * bmp.width) / columns))
      let r = 0
      let g = 0
      let b = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * bmp.width + sx) * 3
          r += bmp.rgb[i]!
          g += bmp.rgb[i + 1]!
          b += bmp.rgb[i + 2]!
        }
      }
      const count = (y1 - y0) * (x1 - x0)
      px[y * columns + x] = (Math.round(r / count) << 16) | (Math.round(g / count) << 8) | Math.round(b / count)
    }
  }
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 3
      words[i] = UPPER
      words[i + 1] = px[2 * y * columns + x]!
      words[i + 2] = px[(2 * y + 1) * columns + x]!
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

/** A tile that shows only its tag: no sips, the file never came, or a BMP that would not parse. */
export const textTile = (n: number, w = 0, h = 0): ImageTile => ({ n, w, h, columns: 0, rows: 0, cells: '' })

/** The tiles with `tile` added: one of the same n replaced, at most MAX_TILES, the newest last. */
export const withTile = (tiles: readonly ImageTile[], tile: ImageTile): ImageTile[] => [...tiles.filter(t => t.n !== tile.n), tile].slice(-MAX_TILES)

/** The caption beneath a tile: `[Image #2] 1376x1584`, or the tag alone when the size is not known. */
export const captionOf = (t: ImageTile): string => (t.w > 0 && t.h > 0 ? `${tagText(t.n)} ${t.w}x${t.h}` : tagText(t.n))

/** The columns a tile takes in the row: its Raster or its caption, whichever is wider. */
export const tileWidth = (t: ImageTile): number => Math.max(t.cells ? t.columns : 0, cellsOf(captionOf(t)))

// The hooks environment has the web's Uint8Array.prototype.toBase64 and
// Uint8Array.fromBase64; the es2023 lib types neither.
export const toBase64 = (bytes: Uint8Array): string => (bytes as Uint8Array & { toBase64: () => string }).toBase64()
export const fromBase64 = (text: string): Uint8Array => (Uint8Array as unknown as { fromBase64: (s: string) => Uint8Array }).fromBase64(text)

// --- the command

/** What /img was asked. */
export type ImgArgs = { kind: 'show' } | { kind: 'draw'; n: number } | { kind: 'on' } | { kind: 'off' } | { kind: 'clear' } | { kind: 'usage' }

export function parseArgs(args: string): ImgArgs {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'show' }
  if (words.length > 1) return { kind: 'usage' }
  const [w] = words
  const tag = /^(?:#)?(\d{1,6})$/.exec(w!)
  if (tag && Number(tag[1]) > 0) return { kind: 'draw', n: Number(tag[1]) }
  if (w === 'on' || w === 'off' || w === 'clear') return { kind: w }
  return { kind: 'usage' }
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

// --- the stack

/**
 * This row's key in the zehui-mods stack: IMAGES 90, under NEXT 80. Spelled
 * here rather than added to STACK below, so the block below stays the
 * canonical copy unchanged; stackOrderOf reads the number from any
 * `zm-<order>-<name>` key.
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

/**
 * The tile's cells drawn again at `toRows` rows, the width scaled to keep the
 * image's shape (nearest cell, no averaging): for a band with fewer rows free
 * than the tile is tall. Returns the tile itself when it already fits.
 */
export function shrinkTile(t: ImageTile, toRows: number): ImageTile {
  if (!t.cells || t.rows <= toRows || toRows < 1) return t
  const src = new Uint32Array(fromBase64(t.cells).buffer)
  const columns = Math.max(1, Math.round((t.columns * toRows) / t.rows))
  const words = new Uint32Array(columns * toRows * 3)
  for (let y = 0; y < toRows; y++) {
    const sy = Math.min(t.rows - 1, Math.floor((y * t.rows) / toRows))
    for (let x = 0; x < columns; x++) {
      const sx = Math.min(t.columns - 1, Math.floor((x * t.columns) / columns))
      const from = (sy * t.columns + sx) * 3
      const to = (y * columns + x) * 3
      words[to] = src[from]!
      words[to + 1] = src[from + 1]!
      words[to + 2] = src[from + 2]!
    }
  }
  return { ...t, columns, rows: toRows, cells: toBase64(new Uint8Array(words.buffer)) }
}
