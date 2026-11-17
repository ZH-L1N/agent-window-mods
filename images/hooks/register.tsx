// The images mod: after a prompt is sent, the ▣ IMAGES row (row.tsx) draws
// each pasted `[Image #n]` as a half-block thumbnail. `prompt.submit` notes
// the sent prompt's tags (before `next`, since the main loop's `turn.start`
// runs inside it); the next main-loop `turn.start` starts the pipeline
// (pipeline.ts) from a $.clock timer, one image after another, each tile
// written to $.state `images.tiles` (at most 6, newest last) as it is built.
// The next prompt clears the row (option linger: turn, 2min or
// until-cleared). /img shows the last tiles again, /img <n> draws one image of
// this session, /img off|on (kept in the store) and /img clear; the row's
// `clear` Button is /img clear, run from a timer. With `under` on (option, or
// /img under on|off kept in the store), the run first places a transcript row
// under the sent prompt (`img-<stamp>-<run>`, its tags in `images.placed`, the
// newest 12), and every tile built is also kept small in `images.thumbs` (the
// newest 24); under.tsx draws that row. A prompt typed over a running turn has
// its row placed instead at the next main-loop turn.start, or at the running
// turn's end when the prompt was delivered into that turn and no turn of its
// own starts. The mod does not hook turn.step to place it sooner: a hook there
// would stand in the stream of every model response of every session.
// /img off and the auto option reach the band only: with them off
// and `under` on, the tiles are built for the row alone. A run that ends or is
// stopped marks its row done. A /clear or resume forgets rows and thumbnails.
//
// Before sending (0.4.0): `prompt.edit` and `prompt.change` are observed
// (`next(e)` first, its answer returned unchanged). The box's tags are compared
// in memory at once; a tag that was not there before, from a change that may
// be a paste (a prompt.edit with no key; a prompt.change from any origin but
// history, undo, plugin, clear and app), takes a ticket, and from a $.clock
// timer each new tag in turn has its picture read from the clipboard
// (pipeline.ts) into $.state `images.pending`, shown in the same row. Not read:
// a new tag at or below the highest tag seen in this conversation (a draft the
// engine put back; only a change that may be a paste and a sent prompt raise
// it), the new tags of a keyless edit that inserts text of its own, and those
// an engine write brings within 2 seconds after a keyless edit whose inserted
// text looks like a file path (a dragged file, a pasted path). A tag that
// leaves the box loses its tile; an empty box, a sent prompt, /img clear and
// /img preview off drop them all.
// Option `preview` and /img preview on|off (kept in the store); off, the
// clipboard is never read.
//
// True pictures (0.4.0): option `draw` and /img draw auto|picture|blocks (kept
// in the store), resolved into $.state `images.pictures`; `auto` reads
// CLAUDE_CODE_FORCE_TERMINAL_IMAGES and TERM_PROGRAM once, at session.start.
// With pictures on each tile built also gets a small PNG, a file of its own
// per build; a picture file is emptied once no tile, thumbnail or tile of the
// box holds it, every one the mod holds at any session end, and a killed
// session's at a later session's start, once the files are a day old and a day
// has passed since its last sign of life (`<session>.alive`, written at the
// start and every hour; the plugin API has no delete). With two builds of one
// tag at once, a tile older than the newest already written for its tag is
// not written: its file is released.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, PromptSubmitInput, Register, Timer } from 'claude-code'

import type { ImageTile } from '../types'
import {
  ALIVE_EVERY_MS,
  COMMAND,
  DELAY_MS,
  LINGER_MS,
  PLACE_PREFIX,
  STORE_BAND,
  STORE_DRAW,
  STORE_PREVIEW,
  STORE_UNDER,
  USAGE,
  canDrawPictures,
  captionOf,
  PATH_INSERT_WINDOW_MS,
  drawModeOf,
  filesOf,
  isAutoOn,
  freshTags,
  isPathInsert,
  isPictures,
  isPreviewOn,
  isTextInsert,
  isUnderOn,
  lingerOf,
  mayBePaste,
  parseArgs,
  pastedTags,
  prePngPathOf,
  sameTags,
  sizeOf,
  tagText,
  tagsOf,
  thumbOf,
  unheldOf,
  withDone,
  withPlaced,
  withThumb,
  withTile,
} from './kit'
import type { DrawMode } from './kit'
import { buildTile, markAlive, pipelineOf, staleFiles, tileFromClipboard } from './pipeline'
import type { Pipeline } from './pipeline'
import { drawRow } from './row'
import { onPlaced } from './under'

const tiles = atom({ plugin: 'images', key: 'tiles' } as const, [])
const shown = atom({ plugin: 'images', key: 'shown' } as const, false)
const band = atom({ plugin: 'images', key: 'band' } as const, '')
const under = atom({ plugin: 'images', key: 'under' } as const, '')
const placed = atom({ plugin: 'images', key: 'placed' } as const, {})
const thumbs = atom({ plugin: 'images', key: 'thumbs' } as const, {})
const boxTiles = atom({ plugin: 'images', key: 'pending' } as const, [])
const preview = atom({ plugin: 'images', key: 'preview' } as const, '')
const draw = atom({ plugin: 'images', key: 'draw' } as const, '')
const pictures = atom({ plugin: 'images', key: 'pictures' } as const, false)

/** A sent prompt's tags and who wants them: the band above the prompt, the row under it. */
type Batch = { tags: number[]; band: boolean; under: boolean }
/** A row under a sent prompt: its place id and tags; isPlaced once it is placed, isDone once its run ended or stopped. */
type Row = { id: string; tags: number[]; isPlaced: boolean; isDone: boolean; isHeld?: boolean }

// The tags of the last sent prompt, waiting for its main-loop turn.start.
let pending: Batch | null = null
// The rows of prompts typed over a running turn, oldest first, placed at the
// next main-loop turn.start, else at the running turn's end.
let waiting: Row[] = []
// This load's session.start in base 36, in every place id: a hot reload
// restarts the row count while older rows still stand in the transcript.
let stamp: string | null = null
let rowCount = 0
// Bumped by every sent prompt, new batch, /img off, /img clear and session change: a run
// that started under an older value stops and writes nothing.
let generation = 0
// linger=2min: the timer that clears the row.
let lingerTimer: Timer | null = null
// The tags the prompt box held at the last change seen, kept here so a hook
// compares them at once with no await.
let boxTags: number[] = []
// Bumped when the box empties, a prompt is sent, /img clear, /img preview off
// and a session change: a clipboard run started under an older value writes no tile.
let pasteGen = 0
// Bumped for each new tag a possible paste brings, in the order seen: the
// clipboard holds only the latest picture, so a tag whose ticket is no longer
// the newest gets a note instead of the clipboard's picture.
let pasteTicket = 0
// The clipboard runs, one after another.
let chain: Promise<void> = Promise.resolve()
// What the environment said at session.start: the terminal can draw true pictures.
let canPicture = false
// The highest tag seen in this conversation: raised by the new tags of a
// change that may be a paste (a keyless edit, a write from an origin that may
// be one) and by a sent prompt's tags; never by a history recall, an undo, a
// plugin's fill, a clear, the app's write or an edit made with a key. The
// engine numbers pasted images upward: a new tag not above it was put back (a
// queued prompt pulled back, a prompt put back after an interrupt, a stash
// restored), not pasted, so the clipboard is not read for it.
let highTag = 0
// True for PATH_INSERT_WINDOW_MS after a keyless edit inserted text that looks
// like a file path (a dragged file, a pasted path): a new tag an engine write
// brings meanwhile is that path's, not the clipboard's.
let isAfterPathInsert = false
let pathInsertTimer: Timer | null = null
// The sign of life (`<session>.alive`) written every hour. A module variable:
// a reload drops it with the module; session.start starts it, and a session.end
// that ends the process's work stops it. A /clear or an in-process resume keeps
// it going: the process goes on under a new session id, no session.start fires
// for it, and the timer reads the id each time it writes.
let aliveTimer: Timer | null = null
// The newest content number (a small PNG's `gen`) written into the state for
// each tag, one record for the band's tiles and the thumbnails together: a
// build older than it that comes later is written to neither (its file is
// released), so no tile or thumbnail ever holds a file that a newer build's
// release already emptied, also when the newer build wrote only one of the two.
const newestBuild = new Map<number, number>()

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const stopLinger = () => {
  lingerTimer?.cancel()
  lingerTimer = null
}

/** The row hides; the tiles stay for /img. */
async function hide($: EngineInterface): Promise<void> {
  stopLinger()
  await update($, shown, () => false)
}

/** The row shows; with linger=2min it clears two minutes later. */
async function show($: EngineInterface, options: PluginOptions): Promise<void> {
  stopLinger()
  await update($, shown, () => true)
  if (lingerOf(options.linger) === '2min') {
    lingerTimer = $.clock.after(LINGER_MS, () => {
      lingerTimer = null
      void update($, shown, () => false).catch(() => {})
    })
  }
}

/** A conversation starts or ends: no tag seen yet, no path insertion pending, no build written. */
function forgetTags(): void {
  highTag = 0
  pathInsertTimer?.cancel()
  pathInsertTimer = null
  isAfterPathInsert = false
  newestBuild.clear()
}

/** Tags a change that may be a paste brought, or a sent prompt's, raise the highest. */
const noteTags = (tags: readonly number[]): void => {
  for (const n of tags) if (n > highTag) highTag = n
}

/** A keyless edit inserted what looks like a file path: engine writes for the next 2 seconds (the session's clock) are not pastes. */
function markPathInsert($: EngineInterface): void {
  pathInsertTimer?.cancel()
  isAfterPathInsert = true
  pathInsertTimer = $.clock.after(PATH_INSERT_WINDOW_MS, () => {
    pathInsertTimer = null
    isAfterPathInsert = false
  })
}

/** The hourly sign of life stops (a session.end other than a /clear or a resume); a reload drops it with the module. */
function stopAlive(): void {
  aliveTimer?.cancel()
  aliveTimer = null
}

/** The hourly sign of life starts (session.start), one timer at most. */
function startAlive($: EngineInterface): void {
  stopAlive()
  aliveTimer = $.clock.every(ALIVE_EVERY_MS, () => {
    void markAlive($).catch(() => {})
  })
}

/**
 * Whether `tile` is older than the newest build already written for its tag
 * in `newest`; when it is not, it becomes the newest. Asked inside the state's
 * updater, so the check and the write go together. A tile with no content
 * number (half-blocks) is always written.
 */
function isOlderBuild(newest: Map<number, number>, tile: ImageTile): boolean {
  if (typeof tile.gen !== 'number') return false
  const seen = newest.get(tile.n)
  if (seen !== undefined && tile.gen < seen) return true
  newest.set(tile.n, tile.gen)
  return false
}

/** The small PNGs `before` held that `after` no longer holds. */
const goneFiles = (before: readonly ImageTile[], after: readonly ImageTile[]): string[] => {
  const kept = filesOf(after)
  return filesOf(before).filter(f => !kept.includes(f))
}

/**
 * Each of `candidates` that no tile, thumbnail or tile of the box holds any
 * more is emptied (the plugin API has no delete).
 */
async function release($: EngineInterface, candidates: readonly string[]): Promise<void> {
  if (candidates.length === 0) return
  const held = await heldFiles($)
  for (const file of unheldOf(candidates, held)) await $.fs.write(file, '').catch(() => {})
}

/** Every picture file a tile, a thumbnail or a tile of the box holds. */
async function heldFiles($: EngineInterface): Promise<string[]> {
  return filesOf([...(await read($, tiles)), ...Object.values(await read($, thumbs)), ...(await read($, boxTiles))])
}

/**
 * A built tile into the state: a hidden row's tiles are replaced, a shown
 * row's added to (at most 6, newest last). False when it was not written (a
 * newer build of its tag came first): its file is then the caller's stray.
 */
async function addTile($: EngineInterface, tile: ImageTile, options: PluginOptions): Promise<boolean> {
  const isShown = await read($, shown)
  let gone: string[] = []
  let isWritten = false
  await update($, tiles, list => {
    gone = []
    isWritten = !isOlderBuild(newestBuild, tile)
    if (!isWritten) return list
    const next = isShown ? withTile(list, tile) : [tile]
    gone = goneFiles(list, next)
    return next
  })
  if (!isWritten) return false
  if (!isShown) await show($, options)
  await release($, gone)
  return true
}

/** A built tile, drawn small, kept for the rows under the sent prompts; false, as addTile, when a newer build of its tag came first. */
async function keepThumb($: EngineInterface, tile: ImageTile): Promise<boolean> {
  const small = thumbOf(tile)
  let gone: string[] = []
  let isWritten = false
  await update($, thumbs, all => {
    gone = []
    isWritten = !isOlderBuild(newestBuild, small)
    if (!isWritten) return all
    const next = withThumb(all, small)
    gone = goneFiles(Object.values(all), Object.values(next))
    return next
  })
  if (!isWritten) return false
  await release($, gone)
  return true
}

/** Whether tiles built now get a small PNG for true pictures. */
const isPicturesNow = async ($: EngineInterface): Promise<boolean> => (await read($, pictures)) === true

// --- before you send

/** A new tag and the ticket it was given when seen. */
type Fresh = { n: number; ticket: number }

/** The box's tiles whose tag `keep` refuses are dropped, their small PNGs released. */
async function dropBoxTiles($: EngineInterface, keep: (n: number) => boolean = () => false): Promise<void> {
  const list = await read($, boxTiles)
  if (list.length === 0 || list.every(t => keep(t.n))) return
  let gone: string[] = []
  await update($, boxTiles, all => {
    const next = all.filter(t => keep(t.n))
    gone = goneFiles(all, next)
    return next
  })
  await release($, gone)
}

/**
 * One new tag: its picture from the clipboard, unless the box moved on
 * meanwhile (asked again inside the state's updater, so a send or the tag's
 * removal in between writes no tile). Whatever the run wrote that no tile
 * keeps is released.
 */
async function grab($: EngineInterface, f: Fresh, gen: number, options: PluginOptions): Promise<void> {
  const isLive = () => gen === pasteGen && boxTags.includes(f.n)
  if (!isLive()) return
  const p = await pipelineOf($, isLive, await isPicturesNow($))
  try {
    // osascript writes over the tag's PNG: never while a tile holds it.
    if (p.home && (await heldFiles($)).includes(prePngPathOf(p.home, p.fileId, f.n))) return
    const tile = await tileFromClipboard($, f.n, sizeOf(options.size), p, () => f.ticket === pasteTicket)
    if (tile === null) return
    let isWritten = false
    let gone: string[] = []
    await update($, boxTiles, list => {
      isWritten = isLive()
      gone = []
      if (!isWritten) return list
      const next = withTile(list, tile)
      gone = goneFiles(list, next)
      return next
    })
    if (!isWritten && tile.file) p.strays.push(tile.file)
    await release($, gone)
  } finally {
    await release($, p.strays).catch(() => {})
  }
}

/** From the timer: the box's tiles follow its tags, and each new tag is queued for the clipboard (preview on only). */
async function settleBox($: EngineInterface, fresh: readonly Fresh[], gen: number, options: PluginOptions): Promise<void> {
  // The box as it stands when the timer runs (a later change may have come since).
  await dropBoxTiles($, n => boxTags.includes(n))
  if (fresh.length === 0 || !isPreviewOn(await read($, preview), options.preview)) return
  for (const f of fresh) {
    chain = chain.then(() => grab($, f, gen, options)).catch(() => {})
  }
}

/**
 * The box as it stands after a change: its tags compared with the last ones in
 * memory and, when they changed, the work handed to a timer. Tickets are taken
 * here, at once, so they follow the order the tags appeared in.
 */
function observe($: EngineInterface, text: string, isPaste: boolean, mayRaise: boolean, options: PluginOptions): void {
  const now = tagsOf(text)
  if (sameTags(now, boxTags)) return
  const before = boxTags
  boxTags = now
  if (now.length === 0) pasteGen++
  // Only tags above the highest seen so far are pasted.
  const fresh: Fresh[] = isPaste ? pastedTags(before, now, highTag).map(n => ({ n, ticket: ++pasteTicket })) : []
  // The new tags of a change that may be a paste count as seen (even when not
  // read, as a path's); a recall, an undo, a fill, a clear, the app's write or
  // an edit with a key leaves the highest as it was.
  if (mayRaise) noteTags(freshTags(before, now))
  const gen = pasteGen
  $.clock.after(DELAY_MS, () => {
    void settleBox($, fresh, gen, options).catch(() => {})
  })
}

/** The box was sent: any clipboard run stops, and its tiles are dropped from a timer. */
function forgetBox($: EngineInterface): void {
  pasteGen++
  boxTags = []
  $.clock.after(DELAY_MS, () => {
    void dropBoxTiles($).catch(() => {})
  })
}

/** The words for a draw mode, as /img draw answers. */
const drawWords = (mode: DrawMode): string =>
  mode === 'picture'
    ? 'true pictures (a tile with no small PNG stays in half-blocks)'
    : mode === 'blocks'
      ? 'half-blocks'
      : `auto: ${canPicture ? 'true pictures' : 'half-blocks'} in this terminal`

/** This load's stamp: set at session.start, or read here at first use. */
async function stampOf($: EngineInterface): Promise<string> {
  if (stamp === null) stamp = Math.floor(await $.clock.now()).toString(36)
  return stamp
}

/** A new row for `tags`, not placed yet: `img-<stamp>-<run>`, never an id of an earlier load. */
async function newRow($: EngineInterface, tags: readonly number[]): Promise<Row> {
  const id = `${PLACE_PREFIX}${await stampOf($)}-${++rowCount}`
  return { id, tags: [...tags], isPlaced: false, isDone: false }
}

/** The row under the sent prompt: placed at the transcript's end (the prompt has just joined it), its id recorded with the tags. */
async function placeRow($: EngineInterface, row: Row): Promise<void> {
  row.isPlaced = true
  try {
    await $.ui.place({ id: row.id })
    const at = await $.clock.now()
    await update($, placed, rows => withPlaced(rows, row.id, row.tags, at, row.isDone))
    // The run may have ended while the row was being recorded.
    if (row.isDone) await update($, placed, rows => withDone(rows, row.id))
  } catch {
    // No row under the prompt; the band row still draws.
  }
}

/** The row's run ended or stopped: a tag with no thumbnail stops reading as loading. */
async function markDone($: EngineInterface, row: Row): Promise<void> {
  row.isDone = true
  if (row.isPlaced) await update($, placed, rows => withDone(rows, row.id))
}

/**
 * A sent prompt's images, one after another; stops when a newer prompt, batch
 * or clear comes. With `under`, the row is placed first (unless `row` is one
 * waiting for its turn) and each tile is kept small for it; with `band`, each
 * tile is added to the band. However the run ends, its row is marked done.
 */
async function runBatch($: EngineInterface, batch: Batch, options: PluginOptions, waitingRow?: Row): Promise<void> {
  const mine = ++generation
  let row = waitingRow ?? null
  let p: Pipeline | null = null
  try {
    if (batch.under && row === null) {
      row = await newRow($, batch.tags)
      await placeRow($, row)
    }
    p = await pipelineOf($, () => mine === generation, await isPicturesNow($))
    for (const n of batch.tags) {
      const tile = await buildTile($, n, sizeOf(options.size), p)
      if (tile === null) return
      if (mine !== generation) {
        if (tile.file) p.strays.push(tile.file)
        return
      }
      // A tile a newer build of its tag beat into the state: its file is a stray.
      const isThumbKept = batch.under && (await keepThumb($, tile))
      const isTileKept = batch.band && (await addTile($, tile, options))
      if (!isThumbKept && !isTileKept && tile.file) p.strays.push(tile.file)
    }
  } finally {
    if (row !== null) await markDone($, row).catch(() => {})
    if (p !== null) await release($, p.strays).catch(() => {})
  }
}

/** At a main-loop turn.start: the waiting rows of `due` still waiting, each placed once, in order; then `batch`'s run. */
async function startTurn($: EngineInterface, due: readonly Row[], batch: Batch | null, options: PluginOptions): Promise<void> {
  for (const row of due) {
    const i = waiting.indexOf(row)
    if (i < 0) continue
    waiting.splice(i, 1)
    await placeRow($, row)
  }
  if (batch !== null) await runBatch($, batch, options)
}

/** After a main-loop turn ends, the next main-loop turn.start gets this long to place the waiting rows itself. */
const END_GRACE_MS = 1500

/**
 * At a main-loop turn.complete: the rows waiting now, placed after a grace,
 * each once, in order. A prompt held for a turn of its own starts that turn
 * right after this one ends; its turn.start places the row under the prompt
 * and this timer then finds the row gone. Only a prompt that was delivered
 * into the turn that just ended is still waiting after the grace. A prompt the
 * person asked to wait its turn (`wait`) always starts one, so its row is left
 * to that turn.start however late it comes.
 */
function placeWaiting($: EngineInterface, options: PluginOptions): void {
  const due = waiting.filter(row => row.isHeld !== true)
  if (due.length === 0) return
  $.clock.after(END_GRACE_MS, () => {
    void startTurn($, due, null, options).catch(() => {})
  })
}

/** /img <n>: that image of this session; a toast when only its tag could be drawn. */
async function runOne($: EngineInterface, n: number, options: PluginOptions): Promise<void> {
  const mine = generation
  const p = await pipelineOf($, () => mine === generation, await isPicturesNow($))
  let tile: ImageTile | null = null
  try {
    tile = await buildTile($, n, sizeOf(options.size), p)
    if (tile === null) return
    if (mine !== generation) {
      if (tile.file) p.strays.push(tile.file)
      return
    }
    const isThumbKept = await keepThumb($, tile)
    const isTileKept = await addTile($, tile, options)
    if (!isThumbKept && !isTileKept && tile.file) p.strays.push(tile.file)
  } finally {
    await release($, p.strays).catch(() => {})
  }
  if (!tile.cells) await $.ui.toast(`${tagText(n)}: no thumbnail (not in this session's images folder, or no sips) (/${COMMAND} ${n})`)
}

/** /img clear and the clear button: no tiles (the box's too), no row, any run stopped; small PNGs no thumbnail holds are emptied. */
async function clearAll($: EngineInterface): Promise<void> {
  generation++
  pasteGen++
  pending = null
  stopLinger()
  const gone = filesOf(await read($, tiles))
  await update($, tiles, () => [])
  await update($, shown, () => false)
  await release($, gone)
  await dropBoxTiles($)
}

/** Writes a switch (/img on|off, under, preview, draw) to the store; the words to add to the reply when it could not be kept. */
async function persist($: EngineInterface, value: string, key: string = STORE_BAND): Promise<string> {
  try {
    await $.store.set(key, value)
    return ''
  } catch {
    return ' (not saved for the next session)'
  }
}

/** A prompt the person sent: typed or from the bridge, not a slash command, not one they do not see. */
const isPersonPrompt = (e: PromptSubmitInput): boolean =>
  !e.command && !e.isMeta && (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge')

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    pending = null
    generation++
    pasteGen++
    boxTags = []
    forgetTags()
    stopLinger()
    // This session's sign of life now and every hour; then a killed session's
    // picture files, once a day old with no sign of life within the day, are
    // emptied (never one this session holds).
    startAlive($)
    $.clock.after(DELAY_MS, () => {
      void markAlive($)
        .catch(() => {})
        .then(() => staleFiles($))
        .then(files => release($, files))
        .catch(() => {})
    })
    try {
      stamp = Math.floor(await $.clock.now()).toString(36)
    } catch {
      // The stamp is read at the first row instead.
    }
    await $.command.register({
      name: 'img',
      description:
        'IMAGES row: show the last image tiles again, draw [Image #n] of this session, turn the automatic tiles on or off, clear them, turn the thumbnails under the sent prompt or the preview before sending on or off, or choose true pictures or half-blocks',
      argumentHint: '<n> | on | off | clear | under on | under off | preview on | preview off | draw auto | draw picture | draw blocks',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the auto option applies.
    }
    try {
      const stored = await $.store.get(STORE_UNDER)
      await update($, under, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the under option applies.
    }
    try {
      const stored = await $.store.get(STORE_PREVIEW)
      await update($, preview, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the preview option applies.
    }
    // Whether the terminal can draw true pictures, read once: unset or unreadable is no.
    try {
      const [force, term] = await Promise.all([$.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'), $.env.get('TERM_PROGRAM')])
      canPicture = canDrawPictures(force, term)
    } catch {
      canPicture = false
    }
    let storedDraw: '' | DrawMode = ''
    try {
      const value = await $.store.get(STORE_DRAW)
      storedDraw = value === 'auto' || value === 'picture' || value === 'blocks' ? value : ''
    } catch {
      // No store: the draw option applies.
    }
    try {
      const kept = storedDraw
      await update($, draw, () => kept)
      await update($, pictures, () => isPictures(drawModeOf(kept, options.draw), canPicture))
      // A reload forgets the box's tags, so its tiles go too.
      await dropBoxTiles($)
    } catch {
      // Half-blocks; the box's tiles go at its next change.
    }
    return started
  })

  // A write to the prompt box no prompt.edit carried (history, clear, a plugin's fill, the engine's).
  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    try {
      const kind = typeof e.origin?.kind === 'string' ? e.origin.kind : 'engine'
      // Right after a dragged file or a pasted path, the engine's write of its tag is not a paste.
      observe($, e.text, mayBePaste(kind) && !isAfterPathInsert, mayBePaste(kind), options)
    } catch {
      // Observe only.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // An edit of the person's: a paste or a burst has no key, and only those may
  // read the clipboard; not one that inserts text of its own, whose tags are
  // that text's. Only text that looks like a file path (a dragged file, a
  // pasted path) opens the 2 seconds in which an engine write is not a paste.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    try {
      const isKeyless = e.key === undefined
      if (isKeyless && isPathInsert(e.inputText)) markPathInsert($)
      const isText = isKeyless && isTextInsert(e.inputText)
      if (r && typeof r.text === 'string') observe($, r.text, isKeyless && !isText, isKeyless, options)
    } catch {
      // Observe only.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A sent prompt clears the row (unless linger=until-cleared) and leaves its
  // tags for its turn. Done before next: the main loop's turn.start runs inside it.
  // The band's switches (/img off, auto) and `under` are each asked on their own.
  on('prompt.submit', async ($, e, next) => {
    let mine: Batch | null = null
    try {
      // A sent prompt's tags count as seen: a draft that brings them back is no paste.
      noteTags(tagsOf(e.text))
    } catch {
      // Nothing seen.
    }
    try {
      // The box's images are sent (or the box is taken by a command): its tiles go.
      if (e.origin?.kind === 'composer') forgetBox($)
    } catch {
      // The tiles go at the box's next change.
    }
    try {
      if (isPersonPrompt(e)) {
        generation++
        pending = null
        if (lingerOf(options.linger) !== 'until-cleared') await hide($)
        const isBand = isAutoOn(await read($, band), options.auto)
        const isUnder = isUnderOn(await read($, under), options.under)
        const tags = isBand || isUnder ? tagsOf(e.text) : []
        if (tags.length > 0) mine = { tags, band: isBand, under: isUnder }
        pending = mine
      }
    } catch {
      // The row keeps what it shows; the next prompt tries again.
    }
    const r = await next(e)
    try {
      if (mine !== null && pending === mine) {
        const batch = mine
        if (r.drop !== undefined) {
          pending = null
        } else if (e.turnId !== undefined) {
          // Typed over a running turn: no turn.start of its own may come soon, so
          // the band's run starts now; the row under it waits for the next
          // main-loop turn.start, or for this turn's end.
          pending = null
          const row = batch.under ? await newRow($, batch.tags) : undefined
          if (row) {
            row.isHeld = e.wait === true
            waiting.push(row)
          }
          $.clock.after(DELAY_MS, () => {
            void runBatch($, batch, options, row).catch(() => {})
          })
        }
      }
    } catch {
      // The tags wait for the next turn.start.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The main loop's turn: the rows of prompts typed over the last turn, then
  // the sent prompt's images, from a timer.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    try {
      if (e.agentId === undefined && (pending !== null || waiting.length > 0)) {
        const batch = pending
        const due = [...waiting]
        pending = null
        $.clock.after(DELAY_MS, () => {
          void startTurn($, due, batch, options).catch(() => {})
        })
      }
    } catch {
      // Nothing drawn for this prompt; /img <n> draws one.
    }
    return started
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The main loop's turn ends with rows still waiting: unless a turn of their
  // prompt's own starts within the grace, they are placed then, so none is left
  // for the person's next prompt.
  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    try {
      if (e.agentId === undefined) placeWaiting($, options)
    } catch {
      // Nothing more to do.
    }
    return ended
  }).catch(($, e, next) => next(e))

  // Every session end empties every picture file the mod holds; a /clear or an
  // in-process resume (another conversation in this process) also forgets the
  // tiles, rows and thumbnails, and the tags seen.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    // Runs in flight write no tile.
    generation++
    pasteGen++
    if (e.reason === 'clear' || e.reason === 'resume') {
      // The process goes on under a new session id and no session.start fires
      // for it: the hourly sign of life keeps running (the id is read at each
      // write), and the new id gets its file at once, from a timer.
      if (aliveTimer === null) startAlive($)
      $.clock.after(DELAY_MS, () => {
        void markAlive($).catch(() => {})
      })
      waiting = []
      boxTags = []
      forgetTags()
      try {
        const all = await heldFiles($)
        await clearAll($)
        await update($, placed, () => ({}))
        await update($, thumbs, () => ({}))
        await release($, all)
      } catch {
        // Nothing more to do.
      }
    } else {
      // No more signs of life until the next start.
      stopAlive()
      try {
        for (const file of await heldFiles($)) await $.fs.write(file, '').catch(() => {})
      } catch {
        // Left for a later session's sweep, once a day old and a day past this session's last sign of life.
      }
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'img' }, async ($, e) => {
    const asked = parseArgs(e.args)
    try {
      switch (asked.kind) {
        case 'show': {
          const list = await read($, tiles)
          if (list.length === 0) return { text: `No image tiles yet: send a prompt with a pasted image, or /${COMMAND} <n> for [Image #n] of this session.` }
          await show($, options)
          return { text: `Showing ${list.map(captionOf).join(', ')}.` }
        }
        case 'draw': {
          const n = asked.n
          $.clock.after(DELAY_MS, () => {
            void runOne($, n, options).catch(err => $.ui.toast(`/${COMMAND} ${n}: ${whyOf(err)}`))
          })
          return { text: `Drawing ${tagText(n)} of this session above the prompt.` }
        }
        case 'on': {
          await update($, band, () => 'on')
          return { text: `Image tiles on: a sent prompt's images are drawn above the prompt.${await persist($, 'on')}` }
        }
        case 'off': {
          await update($, band, () => 'off')
          // A run in flight stops before its next tile, so the row stays hidden.
          generation++
          pending = null
          await hide($)
          return { text: `Image tiles off: /${COMMAND} on turns them on again; /${COMMAND} <n> still draws one.${await persist($, 'off')}` }
        }
        case 'clear':
          await clearAll($)
          return { text: 'Image tiles cleared.' }
        case 'under': {
          const value = asked.value
          await update($, under, () => value)
          return value === 'on'
            ? { text: `Image thumbnails under the sent prompt on: a sent prompt's images are drawn under it in the transcript.${await persist($, 'on', STORE_UNDER)}` }
            : { text: `Image thumbnails under the sent prompt off: /${COMMAND} under on turns them on again.${await persist($, 'off', STORE_UNDER)}` }
        }
        case 'preview': {
          const value = asked.value
          await update($, preview, () => value)
          if (value === 'on') return { text: `Image preview on: a pasted image is shown above the prompt before you send it.${await persist($, 'on', STORE_PREVIEW)}` }
          // A clipboard run in flight writes nothing; the box's tiles go.
          pasteGen++
          await dropBoxTiles($)
          return { text: `Image preview off: the clipboard is not read; /${COMMAND} preview on turns it on again.${await persist($, 'off', STORE_PREVIEW)}` }
        }
        case 'draw-mode': {
          const mode = asked.value
          await update($, draw, () => mode)
          await update($, pictures, () => isPictures(mode, canPicture))
          return { text: `Image tiles drawn as ${drawWords(mode)}.${await persist($, mode, STORE_DRAW)}` }
        }
        default:
          return { text: USAGE }
      }
    } catch (err) {
      return { text: `/${COMMAND}: ${whyOf(err)}` }
    }
  })

  // The row under the sent prompt (under.tsx).
  onPlaced(on)

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) =>
    drawRow(
      $,
      e,
      () => next(e),
      {
        // The press's work runs from a timer, never inside the press; the toast names the command twin.
        clear: () =>
          $.clock.after(DELAY_MS, () => {
            void clearAll($)
              .then(() => $.ui.toast(`Image tiles cleared (/${COMMAND} clear).`))
              .catch(err => $.ui.toast(`/${COMMAND} clear: ${whyOf(err)}`))
          }),
      },
      { size: sizeOf(options.size) },
    ),
  )
}
