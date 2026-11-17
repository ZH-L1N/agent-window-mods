// Shared by register.tsx, pipeline.ts, row.tsx and under.tsx: the look, the options held
// to their listed values, the tags read from a sent prompt, the session's
// images folder by name, the sips command lines, the BMP reader, the
// box-average into half-block Raster cells, the command's words, the
// terminal-column measure, the stack-order helper, the thumbnails and
// placed rows of the row under the sent prompt, and (0.4.0) the reading of a
// change in the prompt box, the osascript command line and the file names of
// the preview before sending, the draw mode, the true picture's box and the
// sweep of picture files a killed session left. Pure functions only; the
// state atoms are declared again in each file that reads or writes them (the
// engine reads a state source only from a const of the calling file).
import type { RenderElement, RenderNode } from 'claude-code'

import type { ImageTile } from '../types'

export const CHIP = ' ▣ IMAGES  ' // the word padded to 7 letters, like every zehui-mods chip, so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#e879f9'
export const COMMAND = 'img'
/** This plugin's name, as a placed row's `plugin` reads before any `@marketplace`. */
export const PLUGIN_NAME = 'images'
/** Where the store keeps /img on|off across sessions. */
export const STORE_BAND = 'band'
/** Where the store keeps /img under on|off across sessions. */
export const STORE_UNDER = 'under'
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

/** Where the store keeps /img preview on|off across sessions. */
export const STORE_PREVIEW = 'preview'
/** Where the store keeps /img draw auto|picture|blocks across sessions. */
export const STORE_DRAW = 'draw'

export const USAGE = `Usage: /${COMMAND} [<n> | on | off | clear | under on | under off | preview on | preview off | draw auto | draw picture | draw blocks]   (/${COMMAND} shows the last tiles again; <n> draws [Image #n] of this session; off stops the automatic tiles; clear drops them; under on|off: the thumbnails under the sent prompt; preview on|off: a pasted image shown before you send; draw: true pictures, half-blocks, or auto by the terminal)`

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

/** The `under` option: 'on' unless it says 'off'. */
export const underOf = (option: unknown): 'on' | 'off' => (option === 'off' ? 'off' : 'on')

/** Whether a sent prompt gets a thumbnail row under it: the store's /img under on|off, else the `under` option. */
export const isUnderOn = (under: string, option: unknown): boolean => (under === 'on' || under === 'off' ? under === 'on' : underOf(option) === 'on')

/** The `preview` option: 'on' unless it says 'off'. */
export const previewOf = (option: unknown): 'on' | 'off' => (option === 'off' ? 'off' : 'on')

/** Whether a pasted image is shown before sending: the store's /img preview on|off, else the `preview` option. */
export const isPreviewOn = (preview: string, option: unknown): boolean =>
  preview === 'on' || preview === 'off' ? preview === 'on' : previewOf(option) === 'on'

export const DRAWS = ['auto', 'picture', 'blocks'] as const
export type DrawMode = (typeof DRAWS)[number]

/** The `draw` option: auto, picture or blocks; auto for anything else. */
export const drawOf = (option: unknown): DrawMode => DRAWS.find(d => d === option) ?? 'auto'

/** The draw mode: the store's /img draw, else the `draw` option. */
export const drawModeOf = (stored: string, option: unknown): DrawMode => DRAWS.find(d => d === stored) ?? drawOf(option)

/** The terminals `auto` draws true pictures in, by TERM_PROGRAM, lower case. */
const PICTURE_TERMINALS: readonly string[] = ['ghostty', 'kitty']

/**
 * Whether the terminal can draw true pictures, from the environment read at
 * the session's start: CLAUDE_CODE_FORCE_TERMINAL_IMAGES is `1`, or
 * TERM_PROGRAM is ghostty or kitty. Unset or unreadable: no.
 */
export const canDrawPictures = (force: string | undefined, term: string | undefined): boolean =>
  force === '1' || (typeof term === 'string' && PICTURE_TERMINALS.includes(term.toLowerCase()))

/** Whether tiles are drawn as true pictures: `picture`, or `auto` where the terminal can. */
export const isPictures = (mode: DrawMode, canPicture: boolean): boolean => mode === 'picture' || (mode === 'auto' && canPicture)

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

/** The tags in `now` that were not in `before`, in order. */
export const freshTags = (before: readonly number[], now: readonly number[]): number[] => now.filter(n => !before.includes(n))

/** Whether two tag lists are the same, in the same order. */
export const sameTags = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((n, i) => n === b[i])

/**
 * prompt.change origins that are not a paste: a recalled history entry, an
 * undo, a plugin's fill, a clear, the app's hand. A new tag from one of these
 * is not read from the clipboard. Anything else (`engine`, a kind not known)
 * may be a paste.
 */
const NOT_PASTE: readonly string[] = ['history', 'undo', 'plugin', 'clear', 'app']
export const mayBePaste = (originKind: string): boolean => !NOT_PASTE.includes(originKind)

/**
 * The tags in `now` that were not in `before` and lie above `highest`, the
 * highest tag seen so far in this conversation. The engine numbers pasted
 * images upward, so a new tag at or below it was put back (a queued prompt
 * pulled back, a prompt put back after an interrupt, a stash restored), not
 * pasted: its picture is no longer the one on the clipboard.
 */
export const pastedTags = (before: readonly number[], now: readonly number[], highest: number): number[] =>
  freshTags(before, now).filter(n => n > highest)

/** `[Image #n]` tags and white space only (a pasted image's own insertion). */
const TAGS_ONLY = /^(?:\s|\[Image #\d{1,6}\])*$/

/**
 * Whether an edit's inserted text is text of its own: not empty and not only
 * `[Image #n]` tags and white space. A dragged file or a pasted path arrives
 * so, and the engine turns it into a tag: the new tags of that same edit are
 * not the clipboard's picture.
 */
export const isTextInsert = (inputText: unknown): boolean => typeof inputText === 'string' && inputText !== '' && !TAGS_ONLY.test(inputText)

/** How a file path starts: `/`, `~`, `file://`, or a quote and then `/` or `~`. */
const PATH_START = /^(?:\/|~|file:\/\/|["'][/~])/
/** How the name of an image file ends, any letter case, before a closing quote. */
const IMAGE_END = /\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic)\s*["']?$/i

/**
 * Whether an edit's inserted text, trimmed, looks like a file path or a list
 * of them (a dragged file, a pasted path): no line break, and it starts with
 * `/`, `~`, `file://` or a quote followed by `/` or `~`, or it ends (a closing
 * quote and white space aside) with an image file's extension. Typed text, an
 * input-method commit, dictated text and a link to a web page do not.
 */
export function isPathInsert(inputText: unknown): boolean {
  if (typeof inputText !== 'string') return false
  const text = inputText.trim()
  if (text === '' || /[\r\n]/.test(text)) return false
  return PATH_START.test(text) || IMAGE_END.test(text)
}

/** After an insertion that looks like a path, a new tag an engine write brings within this long is that path's, not the clipboard's. */
export const PATH_INSERT_WINDOW_MS = 2_000

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

/** The largest side of the small PNG the terminal reads for a true picture. */
export const SMALL_PNG_SIDE = 512

/** sips: the picture as a PNG no wider or taller than SMALL_PNG_SIDE pixels (`out` may be the picture itself). */
export const smallPngArgv = (picture: string, out: string): string[] => ['sips', '-s', 'format', 'png', '-Z', String(SMALL_PNG_SIDE), picture, '--out', out]

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
export const tileWidth = (t: ImageTile, caption: (t: ImageTile) => string = captionOf): number => Math.max(t.cells ? t.columns : 0, cellsOf(caption(t)))

// --- before you send

export const NOT_SENT = 'not sent yet'
/** The note of a pasted tag when osascript finds no picture on the clipboard (not macOS, the clipboard emptied since). */
export const NO_PICTURE = 'no picture on the clipboard'
/** The note of a tag whose picture a later paste has taken off the clipboard (it holds one picture). */
export const SUPERSEDED = 'a later paste replaced it on the clipboard'
/** The osascript run's limit. */
export const OSA_TIMEOUT_MS = 3_000

/** The caption beneath a tile not sent yet: `[Image #n] WxH · not sent yet`, or the tag and its note. */
export const pendingCaptionOf = (t: ImageTile): string => {
  if (t.note) return `${tagText(t.n)} · ${t.note}`
  return t.w > 0 && t.h > 0 ? `${tagText(t.n)} ${t.w}x${t.h} · ${NOT_SENT}` : `${tagText(t.n)} · ${NOT_SENT}`
}

/** A tile of the box not sent yet that shows only its tag and `note`. */
export const noteTile = (n: number, note: string): ImageTile => ({ ...textTile(n), note })

/** A path that can stand inside an AppleScript string literal: absolute, no double quote, backslash or control character. */
export const isScriptSafePath = (path: string): boolean => path.startsWith('/') && !/["\\\u0000-\u001f\u007f]/.test(path)

/** A session id fit for a file name in the scratch folder (letters, digits, `_`, `-`); anything else becomes `session`. */
export const safeName = (id: string): string => (/^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : 'session')

/** Where the clipboard's picture for tag n is written before sending (and, as a true picture, scaled in place). */
export const prePngPathOf = (home: string, fileId: string, n: number): string => `${home}/${CACHE_DIR}/${fileId}-${n}-pre.png`

/** The BMP sips writes for tag n before sending. */
export const preBmpPathOf = (home: string, fileId: string, n: number): string => `${home}/${CACHE_DIR}/${fileId}-${n}-pre.bmp`

/**
 * The small PNG of one build of tag n after sending, named by the build's
 * content number `gen`: a rebuild never writes over a file a tile or a
 * thumbnail still holds.
 */
export const smallPngPathOf = (home: string, fileId: string, n: number, gen: number): string => `${home}/${CACHE_DIR}/${fileId}-${n}-${gen}.png`

// --- the files left behind

/** A picture file in the scratch folder older than this, of a session with no sign of life this recent, is emptied at a session's start (a killed session's). */
export const SWEEP_AGE_MS = 24 * 60 * 60 * 1000
/** The most files looked at in one sweep. */
export const SWEEP_MAX = 200
/** A session's sign of life: an empty `<session>.alive` in the scratch folder, written at its start and every ALIVE_EVERY_MS. */
export const ALIVE_EXT = '.alive'
export const ALIVE_EVERY_MS = 60 * 60 * 1000

/** Where the session `fileId` (its safe name, as its picture files use) writes its sign of life. */
export const alivePathOf = (home: string, fileId: string): string => `${home}/${CACHE_DIR}/${fileId}${ALIVE_EXT}`

type Listed = { name: string; kind: string; size: number; mtimeMs: number; isLink: boolean }

/**
 * The PNGs of a listing of the scratch folder `dir` to empty at a session's
 * start: plain files (no link) ending in `.png`, not empty, last written more
 * than SWEEP_AGE_MS before `now`, and not of a session that shows a sign of
 * life: a plain `<session>.alive` written less than SWEEP_AGE_MS before `now`
 * protects every name that starts with `<session>-` (the whole name, so a
 * session name may hold a `-`). At most SWEEP_MAX; the .alive files are never
 * among them nor counted.
 */
export function staleOf(entries: readonly Listed[], dir: string, now: number): string[] {
  const living = entries
    .filter(e => e.kind === 'file' && !e.isLink && e.name.endsWith(ALIVE_EXT) && e.name.length > ALIVE_EXT.length && now - e.mtimeMs < SWEEP_AGE_MS)
    .map(e => `${e.name.slice(0, -ALIVE_EXT.length)}-`)
  return entries
    .filter(e => e.kind === 'file' && !e.isLink && e.name.endsWith('.png') && e.size > 0 && now - e.mtimeMs > SWEEP_AGE_MS)
    .filter(e => !living.some(prefix => e.name.startsWith(prefix)))
    .slice(0, SWEEP_MAX)
    .map(e => `${dir}/${e.name}`)
}

/** The osascript command that writes the clipboard's picture to `png` as PNG data; each script line its own -e argument, no shell. */
export const osascriptArgv = (png: string): string[] => [
  '/usr/bin/osascript',
  '-e',
  'set png_data to (the clipboard as «class PNGf»)',
  '-e',
  `set fp to open for access POSIX file "${png}" with write permission`,
  '-e',
  'set eof of fp to 0',
  '-e',
  'write png_data to fp',
  '-e',
  'close access fp',
]

// --- true pictures

/**
 * A true picture's box in cells: `columns` wide and its rows from the
 * picture's shape (a cell is about twice as tall as wide), at least one; past
 * `maxRows` rows it is `maxRows` rows and narrower, so the picture keeps its
 * shape (the terminal scales the picture to fill the box). The shape is the
 * tile's own size, else its Raster's, else square.
 */
export function pictureBox(t: ImageTile, columns: number, maxRows: number): { columns: number; rows: number } {
  const shape = t.w > 0 && t.h > 0 ? t.h / t.w : t.columns > 0 && t.rows > 0 ? (2 * t.rows) / t.columns : 1
  const most = Math.max(1, Math.floor(maxRows))
  let c = Math.max(1, Math.floor(columns))
  let r = Math.max(1, Math.round((c * shape) / 2))
  if (r > most) {
    r = most
    c = Math.max(1, Math.min(c, Math.round((2 * r) / shape)))
  }
  return { columns: c, rows: r }
}

/** Whether a tile is drawn as a true picture: pictures on and a small PNG made for it. */
export const isPictureTile = (t: ImageTile, pictures: boolean): boolean => pictures && typeof t.file === 'string' && t.file !== ''

/** The small PNGs `tiles` hold, each once. */
export const filesOf = (tiles: Iterable<ImageTile>): string[] => {
  const out: string[] = []
  for (const t of tiles) if (t.file && !out.includes(t.file)) out.push(t.file)
  return out
}

/** The files among `candidates` that none of `held` holds any more: the ones to empty. */
export const unheldOf = (candidates: readonly string[], held: readonly string[]): string[] => candidates.filter((f, i) => !held.includes(f) && candidates.indexOf(f) === i)

// The hooks environment has the web's Uint8Array.prototype.toBase64 and
// Uint8Array.fromBase64; the es2023 lib types neither.
export const toBase64 = (bytes: Uint8Array): string => (bytes as Uint8Array & { toBase64: () => string }).toBase64()
export const fromBase64 = (text: string): Uint8Array => (Uint8Array as unknown as { fromBase64: (s: string) => Uint8Array }).fromBase64(text)

// --- the command

/** What /img was asked. */
export type ImgArgs =
  | { kind: 'show' }
  | { kind: 'draw'; n: number }
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'clear' }
  | { kind: 'under'; value: 'on' | 'off' }
  | { kind: 'preview'; value: 'on' | 'off' }
  | { kind: 'draw-mode'; value: DrawMode }
  | { kind: 'usage' }

export function parseArgs(args: string): ImgArgs {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'show' }
  if (words.length === 2 && words[0] === 'under' && (words[1] === 'on' || words[1] === 'off')) return { kind: 'under', value: words[1] }
  if (words.length === 2 && words[0] === 'preview' && (words[1] === 'on' || words[1] === 'off')) return { kind: 'preview', value: words[1] }
  const mode = words.length === 2 && words[0] === 'draw' ? DRAWS.find(d => d === words[1]) : undefined
  if (mode) return { kind: 'draw-mode', value: mode }
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
  return resampled(t, Math.max(1, Math.round((t.columns * toRows) / t.rows)), toRows)
}

// --- the thumbnails under the sent prompt

/** A thumbnail's largest box, in cells. */
export const THUMB_COLUMNS = 12
export const THUMB_ROWS = 6
/** The most thumbnails kept (by tag), and the most placed rows remembered. */
export const THUMBS_KEPT = 24
export const PLACED_KEPT = 12
/** The placed row's id is this, the load's stamp, `-` and the run's number. */
export const PLACE_PREFIX = 'img-'
/** What a caption shows after the tag while its tile is not built yet. */
export const PENDING_MARK = '\u2026'

/** A tile's cells resampled to `columns` by `rows` (nearest cell, no averaging). */
function resampled(t: ImageTile, columns: number, rows: number): ImageTile {
  const src = new Uint32Array(fromBase64(t.cells).buffer)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(t.rows - 1, Math.floor((y * t.rows) / rows))
    for (let x = 0; x < columns; x++) {
      const sx = Math.min(t.columns - 1, Math.floor((x * t.columns) / columns))
      const from = (sy * t.columns + sx) * 3
      const to = (y * columns + x) * 3
      words[to] = src[from]!
      words[to + 1] = src[from + 1]!
      words[to + 2] = src[from + 2]!
    }
  }
  return { ...t, columns, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

/**
 * A tile drawn small for the row under the sent prompt: at most THUMB_COLUMNS
 * by THUMB_ROWS cells, its shape kept (shrinkTile); a tile already that small,
 * or one with no cells, is itself. A one-row strip still too wide is narrowed.
 */
export function thumbOf(tile: ImageTile): ImageTile {
  if (!tile.cells || tile.columns <= 0 || tile.rows <= 0) return tile
  if (tile.columns <= THUMB_COLUMNS && tile.rows <= THUMB_ROWS) return tile
  const toRows = Math.max(1, Math.min(THUMB_ROWS, tile.rows, Math.floor((tile.rows * THUMB_COLUMNS) / tile.columns)))
  const small = shrinkTile(tile, toRows)
  return small.columns > THUMB_COLUMNS ? resampled(small, THUMB_COLUMNS, small.rows) : small
}

/** The thumbnails with `tile` stored under its tag: at most THUMBS_KEPT, the lowest tags (the oldest in a session) dropped first, never `tile` itself. */
export function withThumb(thumbs: Readonly<Record<string, ImageTile>>, tile: ImageTile): Record<string, ImageTile> {
  const out: Record<string, ImageTile> = { ...thumbs, [String(tile.n)]: tile }
  const others = Object.keys(out)
    .filter(k => k !== String(tile.n))
    .sort((a, b) => Number(a) - Number(b))
  for (const k of others.slice(0, Math.max(0, others.length - (THUMBS_KEPT - 1)))) delete out[k]
  return out
}

type PlacedRow = { tags: number[]; at: number; done?: true }

/** A placed row copied, its `done` kept only when set. */
const copyRow = (v: PlacedRow): PlacedRow => ({ tags: [...v.tags], at: v.at, ...(v.done ? { done: true as const } : {}) })

/** The placed rows with `id` added (or moved to the newest), `done` when its run already ended: at most PLACED_KEPT, the oldest by `at` dropped first. */
export function withPlaced(
  placed: Readonly<Record<string, PlacedRow>>,
  id: string,
  tags: readonly number[],
  at: number,
  isDone = false,
): Record<string, PlacedRow> {
  const rest = Object.entries(placed).filter(([k]) => k !== id)
  const row: PlacedRow = { tags: [...tags], at, ...(isDone ? { done: true as const } : {}) }
  // A stable sort: two rows of one time keep their order.
  const kept = [...rest, [id, row] as const].sort((a, b) => a[1].at - b[1].at).slice(-PLACED_KEPT)
  return Object.fromEntries(kept.map(([k, v]) => [k, copyRow(v)]))
}

/** The placed rows with `id`'s run marked ended; unchanged when `id` is no longer kept or already done. */
export function withDone(placed: Readonly<Record<string, PlacedRow>>, id: string): Record<string, PlacedRow> {
  const row = placed[id]
  if (!row || row.done) return { ...placed }
  return { ...placed, [id]: { ...copyRow(row), done: true } }
}

/** A placed row's `plugin` (a bare name or `name@marketplace`) without its marketplace. */
export const bareName = (plugin: string): string => plugin.split('@')[0] ?? ''

/**
 * The caption under a thumbnail: `[Image #n] WxH`, the tag alone when the size
 * is not known, `[Image #n] …` while it is not built, and the tag alone once
 * the row's run is done (`isDone`) with no thumbnail for it (never built, or
 * dropped since).
 */
export const underCaptionOf = (n: number, thumb: ImageTile | undefined, isDone = false): string =>
  thumb ? captionOf(thumb) : isDone ? tagText(n) : `${tagText(n)} ${PENDING_MARK}`
