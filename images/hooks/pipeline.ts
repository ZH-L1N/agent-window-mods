// One pasted image to one tile, run from a timer (never inside a hook): wait
// for `<n>.png` in the session's own images folder (every 250 ms, up to 5 s), turn
// it into a small BMP with macOS's sips (3 s limit), read and parse the BMP,
// box-average it into half-block Raster cells, and empty the BMP. Every
// failure ends in a text-only tile; the caller writes the state.
import type { EngineInterface } from 'claude-code'

import type { ImageTile } from '../types'
import {
  CACHE_DIR,
  POLL_MS,
  SIPS_TIMEOUT_MS,
  TMP_ROOT,
  WAIT_MS,
  claudeDirsOf,
  fromBase64,
  parseBmp,
  parseSipsSize,
  rasterCells,
  sessionDirsOf,
  sipsArgv,
  sizeArgv,
  textTile,
  tileGrid,
} from './kit'
import type { Bitmap } from './kit'

/** What one run needs: the session's id and directory, HOME, and whether the run is still wanted. */
export type Pipeline = {
  sessionId: string
  cwd: string
  home: string | undefined
  isLive: () => boolean
}

/** The session's id, directory and HOME, read once per run. */
export async function pipelineOf($: EngineInterface, isLive: () => boolean): Promise<Pipeline> {
  const [sessionId, cwd, home] = await Promise.all([$.session.id(), $.session.cwd(), $.env.get('HOME')])
  return { sessionId, cwd, home, isLive }
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

/** `[Image #n]` of this session as a tile `size` columns wide; null when the run stopped being wanted. */
export async function buildTile($: EngineInterface, n: number, size: number, p: Pipeline): Promise<ImageTile | null> {
  const png = await waitForPng($, n, p)
  if (!p.isLive()) return null
  if (png === null || !p.home) return textTile(n)
  const dir = `${p.home}/${CACHE_DIR}`
  try {
    // sips writes to a file named after a missing folder, so the folder is made first.
    await $.fs.write(`${dir}/.keep`, '')
  } catch {
    return textTile(n)
  }
  const bitmap = await bitmapOf($, png, `${dir}/${p.sessionId}-${n}.bmp`)
  if (!p.isLive()) return null
  if (bitmap === null) return textTile(n)
  const own = await sizeOf($, png)
  if (!p.isLive()) return null
  const grid = tileGrid(size, bitmap.width, bitmap.height)
  return { n, w: own?.w ?? bitmap.width, h: own?.h ?? bitmap.height, ...grid, cells: rasterCells(bitmap, grid.columns, grid.rows) }
}
