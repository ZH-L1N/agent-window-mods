// One pasted image to one tile, run from a timer (never inside a hook).
//
// After sending: wait for `<n>.png` in the session's own images folder (every
// 250 ms, up to 5 s), turn it into a small BMP with macOS's sips (3 s limit),
// read and parse the BMP, box-average it into half-block Raster cells, and
// empty the BMP. With true pictures on, sips also writes a small PNG
// (`<session>-<n>-<gen>.png`, at most 512 pixels a side, a name of its own
// for each build) the terminal reads itself.
//
// Before sending (0.4.0): osascript (argv, no shell, 3 s) writes the
// clipboard's picture to `<session>-<n>-pre.png`, which is built the same way;
// with true pictures on, sips scales that file in place to the small PNG. The
// clipboard holds one picture: a tag that is no longer the newest when its
// turn comes, or when osascript returns, gets a note instead of the
// clipboard's picture.
//
// The pipeline never empties a picture file itself: one that no tile keeps (a
// failed sips, a stopped run, the clipboard's PNG with pictures off) goes to
// the run's `strays`, which the caller hands to its release (it empties only
// files nothing holds). Every failure ends in a text-only tile; the caller
// writes the state.
import type { EngineInterface } from 'claude-code'

import type { ImageTile } from '../types'
import {
  CACHE_DIR,
  NO_PICTURE,
  OSA_TIMEOUT_MS,
  POLL_MS,
  SIPS_TIMEOUT_MS,
  SUPERSEDED,
  SWEEP_AGE_MS,
  TMP_ROOT,
  WAIT_MS,
  alivePathOf,
  claudeDirsOf,
  fromBase64,
  isScriptSafePath,
  noteTile,
  osascriptArgv,
  parseBmp,
  parseSipsSize,
  preBmpPathOf,
  prePngPathOf,
  rasterCells,
  safeName,
  sessionDirsOf,
  sipsArgv,
  sizeArgv,
  smallPngArgv,
  smallPngPathOf,
  staleOf,
  textTile,
  tileGrid,
} from './kit'
import type { Bitmap } from './kit'

/**
 * What one run needs: the session's id (and the plain form used in file
 * names), its directory, HOME (only when absolute), whether the run is still
 * wanted, and whether a small PNG is made for true pictures; and what it
 * leaves: `strays`, the picture files it wrote that no tile keeps, for the
 * caller to release.
 */
export type Pipeline = {
  sessionId: string
  fileId: string
  cwd: string
  home: string | undefined
  isLive: () => boolean
  isPictures: boolean
  strays: string[]
}

/** The session's id, directory and HOME, read once per run. */
export async function pipelineOf($: EngineInterface, isLive: () => boolean, isPictures = false): Promise<Pipeline> {
  const [sessionId, cwd, home] = await Promise.all([$.session.id(), $.session.cwd(), $.env.get('HOME')])
  return { sessionId, fileId: safeName(sessionId), cwd, home: home && home.startsWith('/') ? home : undefined, isLive, isPictures, strays: [] }
}

/** Resolves after `ms` on the session's clock. */
function pause($: EngineInterface, ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    $.clock.after(ms, () => resolve())
  })
}

/** True when `path` is a regular file reached with no symbolic link on the way. */
async function isPlainFile($: EngineInterface, path: string): Promise<boolean> {
  try {
    const stat = await $.fs.stat(path, { resolve: true })
    return stat.kind === 'file' && !stat.isLink && stat.realPath === path
  } catch {
    return false
  }
}

/**
 * The path of `<n>.png` once it exists, looked for every POLL_MS up to WAIT_MS
 * in the session's own `claude-<uid>/<cwd slug>/<session id>/images` folder;
 * null when it never came or the run stopped being wanted. The hooks cannot
 * read their uid, and /private/tmp is world-writable: the session's folder
 * must be the only one of that name under every `claude-<uid>` (the engine
 * makes it when the session starts, so another user's copy shows as a second
 * one and nothing is drawn), and the PNG a plain file with no link on its path.
 */
export async function waitForPng($: EngineInterface, n: number, p: Pipeline): Promise<string | null> {
  let claudeDirs: string[] = []
  for (let waited = 0; ; waited += POLL_MS) {
    if (!p.isLive()) return null
    try {
      if (claudeDirs.length === 0) claudeDirs = claudeDirsOf(await $.fs.list(TMP_ROOT))
      const found: string[] = []
      for (const dir of sessionDirsOf(claudeDirs, p.cwd, p.sessionId)) if (await $.fs.exists(dir)) found.push(dir)
      if (found.length > 1) return null
      const png = `${found[0]}/images/${n}.png`
      if (found.length === 1 && (await isPlainFile($, png))) return png
    } catch {
      // Looked for again at the next poll.
    }
    if (waited >= WAIT_MS) return null
    await pause($, POLL_MS)
  }
}

/** The BMP sips wrote, parsed; null when sips failed (none, not macOS, too slow) or the file would not parse. */
async function bitmapOf($: EngineInterface, png: string, bmp: string): Promise<Bitmap | null> {
  try {
    const run = await $.process.run(sipsArgv(png, bmp), { timeoutMs: SIPS_TIMEOUT_MS })
    if (run.exitCode !== 0) return null
    const { base64 } = await $.fs.read(bmp, { as: 'bytes' })
    return parseBmp(fromBase64(base64))
  } catch {
    return null
  } finally {
    // The plugin API has no delete: the BMP is emptied, one zero-byte file per
    // session and tag, also after a failed or killed sips that wrote part of it.
    await $.fs.write(bmp, '').catch(() => {})
  }
}

/** The PNG's own size from sips; null when not known. */
async function sizeOf($: EngineInterface, png: string): Promise<{ w: number; h: number } | null> {
  try {
    const run = await $.process.run(sizeArgv(png), { timeoutMs: SIPS_TIMEOUT_MS })
    return run.exitCode === 0 ? parseSipsSize(run.stdout) : null
  } catch {
    return null
  }
}

// Bumped for each small PNG build, so two started in one millisecond differ.
let made = 0

/** A build's content number: the clock in milliseconds, times 1000, plus a count. */
async function nextGen($: EngineInterface): Promise<number> {
  const now = await $.clock.now().catch(() => 0)
  made = (made + 1) % 1000
  return Math.floor(now) * 1000 + made
}

/**
 * The small PNG sips wrote, at `outOf(gen)`, and its content number `gen`;
 * null when sips failed (what it may have written goes to the run's strays).
 */
async function smallPngOf($: EngineInterface, picture: string, outOf: (gen: number) => string, p: Pipeline): Promise<{ file: string; gen: number } | null> {
  const gen = await nextGen($)
  const out = outOf(gen)
  try {
    const run = await $.process.run(smallPngArgv(picture, out), { timeoutMs: SIPS_TIMEOUT_MS })
    if (run.exitCode === 0) return { file: out, gen }
  } catch {
    // A stray below.
  }
  p.strays.push(out)
  return null
}

/** The scratch folder made (sips and osascript write to a file only in a folder that exists); false when it could not be. */
async function makeCache($: EngineInterface, home: string): Promise<boolean> {
  try {
    await $.fs.write(`${home}/${CACHE_DIR}/.keep`, '')
    return true
  } catch {
    return false
  }
}

/**
 * The picture at `picture` as tag n's tile `size` columns wide: the BMP at
 * `bmp`, the picture's own size, and with true pictures on the small PNG at
 * `smallOf(gen)`; null when the run stopped being wanted. A text-only tile when
 * the BMP failed. The scratch folder must exist.
 */
async function tileOf(
  $: EngineInterface,
  picture: string,
  n: number,
  size: number,
  p: Pipeline,
  bmp: string,
  smallOf: (gen: number) => string,
): Promise<ImageTile | null> {
  const bitmap = await bitmapOf($, picture, bmp)
  if (!p.isLive()) return null
  if (bitmap === null) return textTile(n)
  const own = await sizeOf($, picture)
  if (!p.isLive()) return null
  const grid = tileGrid(size, bitmap.width, bitmap.height)
  const tile: ImageTile = { n, w: own?.w ?? bitmap.width, h: own?.h ?? bitmap.height, ...grid, cells: rasterCells(bitmap, grid.columns, grid.rows) }
  if (!p.isPictures) return tile
  const png = await smallPngOf($, picture, smallOf, p)
  return png ? { ...tile, ...png } : tile
}

/**
 * `[Image #n]` of this session as a tile `size` columns wide; null when the run
 * stopped being wanted (its small PNG, if any, goes to the run's strays).
 */
export async function buildTile($: EngineInterface, n: number, size: number, p: Pipeline): Promise<ImageTile | null> {
  const png = await waitForPng($, n, p)
  if (!p.isLive()) return null
  if (png === null || !p.home) return textTile(n)
  // sips writes to a file named after a missing folder, so the folder is made first.
  if (!(await makeCache($, p.home))) return textTile(n)
  const home = p.home
  const tile = await tileOf($, png, n, size, p, `${home}/${CACHE_DIR}/${p.fileId}-${n}.bmp`, gen => smallPngPathOf(home, p.fileId, n, gen))
  if (tile === null) return null
  if (!p.isLive()) {
    if (tile.file) p.strays.push(tile.file)
    return null
  }
  return tile
}

/**
 * Tag n's tile from the clipboard, before sending: osascript writes the
 * clipboard's picture to `<session>-<n>-pre.png`, built as any picture is.
 * `isLatest` says whether n's ticket is still the newest: when it is not, at
 * its turn or once osascript returned, the tile is the tag with a note. The
 * PNG is kept only as the tile's small PNG (scaled in place); otherwise it goes
 * to the run's strays. Null when the run stopped being wanted (nothing is kept
 * then). The caller makes sure no tile holds this tag's PNG before the run.
 */
export async function tileFromClipboard($: EngineInterface, n: number, size: number, p: Pipeline, isLatest: () => boolean): Promise<ImageTile | null> {
  if (!p.home) return noteTile(n, 'no HOME')
  const png = prePngPathOf(p.home, p.fileId, n)
  if (!isScriptSafePath(png)) return noteTile(n, 'the file name is not safe')
  // The clipboard holds one picture: once a later tag has been seen, this
  // tag's picture is gone from it, so it is not read for this tag at all.
  if (!isLatest()) return noteTile(n, SUPERSEDED)
  if (!(await makeCache($, p.home))) return noteTile(n, 'scratch folder not writable')
  if (!p.isLive()) return null
  let kept: string | undefined
  try {
    let isOk = false
    try {
      const run = await $.process.run(osascriptArgv(png), { timeoutMs: OSA_TIMEOUT_MS })
      isOk = run.exitCode === 0
    } catch {
      // Not macOS, no osascript, too slow: no picture.
    }
    if (!p.isLive()) return null
    if (!isOk) return noteTile(n, NO_PICTURE)
    // A later paste seen while osascript ran: what it wrote may be that one's picture.
    if (!isLatest()) return noteTile(n, SUPERSEDED)
    const tile = await tileOf($, png, n, size, p, preBmpPathOf(p.home, p.fileId, n), () => png)
    if (tile === null || !p.isLive()) return null
    if (!tile.cells) return noteTile(n, 'sips could not read the picture')
    kept = tile.file
    return tile
  } finally {
    // The clipboard's PNG, unless it is the tile's small PNG, is the caller's to release.
    if (kept !== png) p.strays.push(png)
  }
}

/**
 * This session's sign of life: an empty `<session>.alive` in the scratch
 * folder (the safe name its picture files use), written at its start and every
 * hour. While it is less than a day old, no other session's sweep empties this
 * session's pictures, however old they are.
 */
export async function markAlive($: EngineInterface): Promise<void> {
  const [sessionId, home] = await Promise.all([$.session.id(), $.env.get('HOME')])
  if (!home || !home.startsWith('/')) return
  await $.fs.write(alivePathOf(home, safeName(sessionId)), '')
}

/**
 * The picture files a killed session left in the scratch folder: every PNG
 * there that is a plain file with no link on its path, not empty, last
 * written more than a day ago, and whose session shows no sign of life (no
 * `<session>.alive` written within the day; at most 200 looked at). A session
 * still running writes its .alive file every hour, so its pictures are never
 * among them however long it has been open; a killed session's are, once a day
 * has passed since its last sign of life. [] on any failure; the caller
 * releases them (it empties only files this session does not hold).
 */
export async function staleFiles($: EngineInterface): Promise<string[]> {
  try {
    const home = await $.env.get('HOME')
    if (!home || !home.startsWith('/')) return []
    const dir = `${home}/${CACHE_DIR}`
    const now = await $.clock.now()
    const out: string[] = []
    for (const path of staleOf(await $.fs.list(dir), dir, now)) {
      try {
        const stat = await $.fs.stat(path, { resolve: true })
        if (stat.kind === 'file' && !stat.isLink && stat.realPath === path && stat.size > 0 && now - stat.mtimeMs > SWEEP_AGE_MS) out.push(path)
      } catch {
        // Gone or unreadable: left alone.
      }
    }
    return out
  } catch {
    return []
  }
}
