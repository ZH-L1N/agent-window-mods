// 0.4.0: true pictures: the draw mode, the picture box, the Image in the band
// row and in the row under a sent prompt, the small PNGs and when they are emptied.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { ImageTile } from '../types'
import {
  NO_PICTURE,
  SUPERSEDED,
  USAGE,
  canDrawPictures,
  drawModeOf,
  drawOf,
  isPictures,
  isPreviewOn,
  isScriptSafePath,
  mayBePaste,
  osascriptArgv,
  parseArgs,
  pendingCaptionOf,
  pictureBox,
  previewOf,
  safeName,
  smallPngArgv,
  staleOf,
  textTile,
} from './kit'
import { CACHE, IMAGES, PLUGIN, SESSION, T0, mountRow, rowView, world } from './test-kit'
import type { WorldShape } from './test-kit'

const FORCE = { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' }
/** The small PNGs sips was asked to write for tag n after sending, oldest first: one file of its own per build. */
const builds = (w: { runs: string[][] }, n: number): string[] =>
  w.runs.filter(a => a[0] === 'sips' && a[3] === 'png' && a[6] === `${IMAGES}/${n}.png`).map(a => a[8]!)
/** The newest build's small PNG of tag n. */
const small = (w: { runs: string[][] }, n: number): string => builds(w, n).at(-1) ?? `(no build of ${n})`
const tilesOf = (w: { state: (k: string) => unknown }): ImageTile[] => (w.state('tiles') as ImageTile[] | undefined) ?? []

/** The pictures and rasters a mounted drawing holds. */
async function elementsOf(ui: Awaited<ReturnType<typeof mountRow>>) {
  const images = (await ui.findAll({ type: 'Image' })).map(i => i.props as { key?: string; source: { file: string; format: string; generation?: number }; columns: number; rows: number; alt: string })
  const rasters = (await ui.findAll({ type: 'Raster' })).map(r => (r.props as { key?: string }).key)
  const captions = (await ui.findAll({ type: 'Text', text: /^\[Image #/ })).map(t => t.text)
  return { images, rasters, captions }
}

async function bandOf($: Engine, cols = 160, maxRows = 40) {
  const ui = await mountRow($, cols, { maxRows })
  const out = await elementsOf(ui)
  await ui.unmount()
  return out
}

async function underOf($: Engine, id: string) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Placed', props: { id, plugin: PLUGIN } })
  // Read through the band's handle type: the finders are the same on both.
  const out = await elementsOf(ui as unknown as Awaited<ReturnType<typeof mountRow>>)
  await ui.unmount()
  return out
}

// --- kit

test('kit: the preview and draw options are held to their listed values; the store wins', async () => {
  expect(previewOf(undefined)).toBe('on')
  expect(previewOf('off')).toBe('off')
  expect(previewOf('maybe')).toBe('on')
  expect(isPreviewOn('', 'off')).toBe(false)
  expect(isPreviewOn('on', 'off')).toBe(true)
  expect(isPreviewOn('off', 'on')).toBe(false)
  expect(drawOf(undefined)).toBe('auto')
  expect(drawOf('picture')).toBe('picture')
  expect(drawOf('blocks')).toBe('blocks')
  expect(drawOf('sixel')).toBe('auto')
  expect(drawModeOf('', 'blocks')).toBe('blocks')
  expect(drawModeOf('picture', 'blocks')).toBe('picture')
  expect(drawModeOf('nonsense', 'picture')).toBe('picture')
})

test('kit: auto draws pictures where the environment says the terminal can', async () => {
  expect(canDrawPictures('1', undefined)).toBe(true)
  expect(canDrawPictures(undefined, 'ghostty')).toBe(true)
  expect(canDrawPictures(undefined, 'kitty')).toBe(true)
  expect(canDrawPictures(undefined, 'Ghostty')).toBe(true)
  expect(canDrawPictures('0', 'Apple_Terminal')).toBe(false)
  expect(canDrawPictures('true', undefined)).toBe(false)
  expect(canDrawPictures(undefined, undefined)).toBe(false)
  expect(isPictures('auto', true)).toBe(true)
  expect(isPictures('auto', false)).toBe(false)
  expect(isPictures('picture', false)).toBe(true)
  expect(isPictures('blocks', true)).toBe(false)
})

test('kit: a change may be a paste unless it is a history recall, an undo, a plugin fill, a clear or the app', async () => {
  for (const kind of ['history', 'undo', 'plugin', 'clear', 'app']) expect(mayBePaste(kind)).toBe(false)
  for (const kind of ['engine', 'something-new']) expect(mayBePaste(kind)).toBe(true)
})

test('kit: the osascript argv (no shell) and the path checks', async () => {
  expect(osascriptArgv('/Users/me/.cache/zehui-mods/images/s-1-pre.png')).toEqual([
    '/usr/bin/osascript',
    '-e',
    'set png_data to (the clipboard as «class PNGf»)',
    '-e',
    'set fp to open for access POSIX file "/Users/me/.cache/zehui-mods/images/s-1-pre.png" with write permission',
    '-e',
    'set eof of fp to 0',
    '-e',
    'write png_data to fp',
    '-e',
    'close access fp',
  ])
  expect(isScriptSafePath('/Users/me/a b/c.png')).toBe(true)
  expect(isScriptSafePath('relative/c.png')).toBe(false)
  expect(isScriptSafePath('/Users/o"brien/c.png')).toBe(false)
  expect(isScriptSafePath('/Users/me\\x/c.png')).toBe(false)
  expect(isScriptSafePath('/Users/me/a\nb.png')).toBe(false)
  expect(isScriptSafePath('/Users/me/a\u007fb.png')).toBe(false)
  expect(safeName('6f1c-AB_9')).toBe('6f1c-AB_9')
  expect(safeName('../x')).toBe('session')
  expect(safeName('')).toBe('session')
  expect(smallPngArgv('/a/1.png', '/c/s-1.png')).toEqual(['sips', '-s', 'format', 'png', '-Z', '512', '/a/1.png', '--out', '/c/s-1.png'])
})

test('kit: the caption of a tile not sent yet', async () => {
  expect(pendingCaptionOf({ n: 2, w: 800, h: 600, columns: 24, rows: 9, cells: 'x' })).toBe('[Image #2] 800x600 · not sent yet')
  expect(pendingCaptionOf(textTile(3))).toBe('[Image #3] · not sent yet')
  expect(pendingCaptionOf({ ...textTile(4), note: NO_PICTURE })).toBe('[Image #4] · no picture on the clipboard')
  expect(pendingCaptionOf({ ...textTile(5), note: SUPERSEDED })).toBe('[Image #5] · a later paste replaced it on the clipboard')
})

test("kit: the picture box: the size's columns, rows from the shape, at most the rows given (narrower then)", async () => {
  const t = (w: number, h: number): ImageTile => ({ n: 1, w, h, columns: 0, rows: 0, cells: '' })
  expect(pictureBox(t(1376, 688), 24, 24)).toEqual({ columns: 24, rows: 6 })
  expect(pictureBox(t(1376, 1584), 24, 24)).toEqual({ columns: 24, rows: 14 })
  expect(pictureBox(t(100, 100), 32, 24)).toEqual({ columns: 32, rows: 16 })
  // Tall: 24 × 4.8 / 2 = 58 rows, capped at 24 and 10 columns.
  expect(pictureBox(t(300, 1440), 24, 24)).toEqual({ columns: 10, rows: 24 })
  // A band with 4 rows: 4 rows, 16 columns.
  expect(pictureBox(t(1376, 688), 24, 4)).toEqual({ columns: 16, rows: 4 })
  // The thumbnail under a sent prompt: at most 12 by 6.
  expect(pictureBox(t(1376, 688), 12, 6)).toEqual({ columns: 12, rows: 3 })
  expect(pictureBox(t(600, 1000), 12, 6)).toEqual({ columns: 7, rows: 6 })
  // No size known: the Raster's shape, else square.
  expect(pictureBox({ n: 1, w: 0, h: 0, columns: 24, rows: 6, cells: 'x' }, 12, 6)).toEqual({ columns: 12, rows: 3 })
  expect(pictureBox(t(0, 0), 12, 24)).toEqual({ columns: 12, rows: 6 })
})

test('kit: /img preview and /img draw words', async () => {
  expect(parseArgs('preview on')).toEqual({ kind: 'preview', value: 'on' })
  expect(parseArgs('PREVIEW off')).toEqual({ kind: 'preview', value: 'off' })
  expect(parseArgs('preview')).toEqual({ kind: 'usage' })
  expect(parseArgs('draw auto')).toEqual({ kind: 'draw-mode', value: 'auto' })
  expect(parseArgs('draw Picture')).toEqual({ kind: 'draw-mode', value: 'picture' })
  expect(parseArgs('draw blocks')).toEqual({ kind: 'draw-mode', value: 'blocks' })
  expect(parseArgs('draw sixel')).toEqual({ kind: 'usage' })
  expect(parseArgs('draw')).toEqual({ kind: 'usage' })
  expect(USAGE).toContain('preview on | preview off | draw auto | draw picture | draw blocks')
})

// --- the draw mode in a session

for (const [name, env, options, stored, want] of [
  ['nothing set: half-blocks', {}, {}, {}, false],
  ['CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1', FORCE, {}, {}, true],
  ['TERM_PROGRAM ghostty', { TERM_PROGRAM: 'ghostty' }, {}, {}, true],
  ['TERM_PROGRAM kitty', { TERM_PROGRAM: 'kitty' }, {}, {}, true],
  ['another terminal', { TERM_PROGRAM: 'Apple_Terminal' }, {}, {}, false],
  ['the option picture', {}, { draw: 'picture' }, {}, true],
  ['the option blocks over a terminal that can', FORCE, { draw: 'blocks' }, {}, false],
  ['a stored blocks over the option picture', {}, { draw: 'picture' }, { draw: 'blocks' }, false],
  ['a stored picture over the option blocks', {}, { draw: 'blocks' }, { draw: 'picture' }, true],
] as const) {
  test(`draw: the mode at session start (${name})`, { options }, async ($, on) => {
    const w = await world($, on, { env, stored })
    await w.start()
    expect(w.state('pictures')).toBe(want)
  })
}

test('draw: /img draw picture | blocks | auto, kept in the store', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(w.state('pictures')).toBe(false)
  expect(await w.command('draw picture')).toBe('Image tiles drawn as true pictures (a tile with no small PNG stays in half-blocks).')
  expect(w.store.get('draw')).toBe('picture')
  expect(w.state('draw')).toBe('picture')
  expect(w.state('pictures')).toBe(true)
  expect(await w.command('draw blocks')).toBe('Image tiles drawn as half-blocks.')
  expect(w.state('pictures')).toBe(false)
  expect(await w.command('draw auto')).toBe('Image tiles drawn as auto: half-blocks in this terminal.')
  expect(w.store.get('draw')).toBe('auto')
})

// --- the band row

test('draw: picture mode: a sent tile gets a small PNG and the row draws an Image of `size` columns, its caption beneath', async ($, on) => {
  const w = await world($, on, { env: FORCE })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const [tile] = tilesOf(w)
  expect(typeof tile?.gen).toBe('number')
  // The build's own file, named by its content number.
  const file = `${CACHE}/${SESSION}-1-${tile!.gen}.png`
  expect(w.runs.filter(a => a[3] === 'png')).toEqual([['sips', '-s', 'format', 'png', '-Z', '512', `/private/tmp/claude-501/-Users-me-repo/${SESSION}/images/1.png`, '--out', file]])
  expect(tile?.file).toBe(file)
  const band = await bandOf($)
  expect(band.rasters).toEqual([])
  expect(band.images).toEqual([{ key: 'images-picture-1', source: { file, format: 'png', generation: tile!.gen }, columns: 24, rows: 6, alt: '[Image #1]' }])
  expect(band.captions).toEqual(['[Image #1] 1376x688'])
  // A short band (5 rows, less the caption): 4 rows, narrower in the same shape; under 3 rows, the caption alone.
  expect((await bandOf($, 160, 5)).images.map(i => [i.columns, i.rows])).toEqual([[16, 4]])
  expect((await bandOf($, 160, 2)).images).toEqual([])
})

test('draw: size option 12 makes a picture 12 columns wide', { options: { size: '12', draw: 'picture' } }, async ($, on) => {
  const w = await world($, on, { pngSize: { w: 800, h: 800 } })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect((await bandOf($)).images.map(i => [i.columns, i.rows])).toEqual([[12, 6]])
})

test('draw: blocks mode: no small PNG is made, the row draws a Raster and no Image', { options: { draw: 'blocks' } }, async ($, on) => {
  const w = await world($, on, { env: FORCE })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.runs.filter(a => a[3] === 'png')).toEqual([])
  expect(tilesOf(w)[0]?.file).toBeUndefined()
  const band = await bandOf($)
  expect(band.images).toEqual([])
  expect(band.rasters).toEqual(['images-tile-1'])
  expect(band.captions).toEqual(['[Image #1] 1376x688'])
})

test('draw: picture mode with no small PNG (sips failed on it): half-blocks', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on, { isNoSmallPng: true })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(tilesOf(w)[0]?.file).toBeUndefined()
  // What sips may have written there is released: nothing holds it.
  expect(w.files.get(small(w, 1))).toBe('')
  const band = await bandOf($)
  expect(band.images).toEqual([])
  expect(band.rasters).toEqual(['images-tile-1'])
})

test('draw: switching to blocks draws a tile that has a small PNG as half-blocks', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect((await bandOf($)).images.length).toBe(1)
  await w.command('draw blocks')
  const band = await bandOf($)
  expect(band.images).toEqual([])
  expect(band.rasters).toEqual(['images-tile-1'])
})

test('draw: picture mode before sending: the tile of the box is an Image with "not sent yet"', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #4]')
  await w.settle()
  const band = await bandOf($)
  expect(band.images.map(i => [i.key, i.source.file, i.columns, i.rows])).toEqual([['images-picture-4', `${CACHE}/${SESSION}-4-pre.png`, 24, 6]])
  expect(band.captions).toEqual(['[Image #4] 1376x688 · not sent yet'])
})

// --- the row under a sent prompt

test('draw: picture mode: the row under the sent prompt draws an Image, at most 12 by 6', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on, { pngSize: { w: 600, h: 1000 } })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const under = await underOf($, w.places[0]!)
  expect(under.rasters).toEqual([])
  expect(under.images.map(i => [i.key, i.source.file, i.source.format, i.columns, i.rows, i.alt])).toEqual([['img-under-picture-1', small(w, 1), 'png', 7, 6, '[Image #1]']])
  expect(under.captions).toEqual(['[Image #1] 600x1000'])
})

test('draw: blocks mode: the row under the sent prompt keeps its Raster', { options: { draw: 'blocks' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const under = await underOf($, w.places[0]!)
  expect(under.images).toEqual([])
  expect(under.rasters).toEqual(['img-under-1'])
})

// --- the small PNGs

test('draw: a small PNG is emptied once neither its tile nor its thumbnail holds it', { options: { draw: 'picture', under: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  for (let n = 1; n <= 8; n++) w.paste(n)
  await w.send([1, 2, 3, 4, 5, 6, 7, 8].map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([3, 4, 5, 6, 7, 8])
  // The two tiles dropped by the cap (no thumbnail with `under` off): emptied.
  expect([1, 2].map(n => w.files.get(small(w, n)))).toEqual(['', ''])
  expect([3, 4, 5, 6, 7, 8].map(n => w.files.get(small(w, n)))).toEqual(Array(6).fill('small-png'))
  // /img clear empties the band's.
  await w.command('clear')
  expect([3, 4, 5, 6, 7, 8].map(n => w.files.get(small(w, n)))).toEqual(Array(6).fill(''))
})

test('draw: a thumbnail keeps its small PNG past /img clear; a /clear empties every one', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  w.paste(2)
  await w.send('[Image #1] [Image #2]')
  await w.settle()
  await w.command('clear')
  // The row under the sent prompt still draws them.
  expect([1, 2].map(n => w.files.get(small(w, n)))).toEqual(['small-png', 'small-png'])
  expect((await underOf($, w.places[0]!)).images.length).toBe(2)
  // The next prompt replaces the hidden band's tiles; the thumbnails still hold theirs.
  w.paste(3)
  await w.edit('[Image #5]')
  await w.settle()
  expect(w.files.get(`${CACHE}/${SESSION}-5-pre.png`)).toBe('small-png')
  await w.send('[Image #3]')
  await w.settle()
  // The send emptied the box's file.
  expect(w.files.get(`${CACHE}/${SESSION}-5-pre.png`)).toBe('')
  expect([1, 2, 3].map(n => w.files.get(small(w, n)))).toEqual(['small-png', 'small-png', 'small-png'])
  // A fresh tile of the box after the send: the /clear below must empty it.
  await w.edit('[Image #6]')
  await w.settle()
  expect(w.files.get(`${CACHE}/${SESSION}-6-pre.png`)).toBe('small-png')
  await w.sessionEnd('clear')
  expect([1, 2, 3].map(n => w.files.get(small(w, n)))).toEqual(['', '', ''])
  expect(w.files.get(`${CACHE}/${SESSION}-6-pre.png`)).toBe('')
})

test('draw: a resume empties the small PNGs and the box\'s tiles', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.edit('[Image #2]')
  await w.settle()
  await w.sessionEnd('resume')
  expect(w.files.get(small(w, 1))).toBe('')
  expect(w.files.get(`${CACHE}/${SESSION}-2-pre.png`)).toBe('')
  expect(w.state('pending')).toEqual([])
  expect(await rowView($)).toBeNull()
})

// --- review fixes: what stays on disk

const DAY_MS = 24 * 60 * 60 * 1000

test('draw: an ordinary exit empties every picture file the mod holds; the state stays', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.edit('[Image #2]')
  await w.settle()
  const held = [small(w, 1), `${CACHE}/${SESSION}-2-pre.png`]
  expect(held.map(f => w.files.get(f))).toEqual(['small-png', 'small-png'])
  await w.sessionEnd('prompt_input_exit')
  expect(held.map(f => w.files.get(f))).toEqual(['', ''])
  // Only a /clear or a resume forgets the tiles.
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
  expect(Object.keys((w.state('thumbs') as Record<string, ImageTile>) ?? {})).toEqual(['1'])
  expect((w.state('pending') as ImageTile[]).map(t => t.n)).toEqual([2])
})

test("draw: a session start empties a killed session's picture files once a day old, and nothing else", async ($, on) => {
  const w = await world($, on)
  const old = T0 - DAY_MS - 1
  const seed = (name: string, content: string, at: number) => {
    w.files.set(`${CACHE}/${name}`, content)
    w.mtimes.set(`${CACHE}/${name}`, at)
  }
  seed('gone-1-123.png', 'small-png', old)
  seed('gone-2-pre.png', 'clipboard-png', old)
  seed('gone-1.bmp', 'bmp', old)
  seed('alive-1-456.png', 'small-png', T0 - DAY_MS + 60_000)
  seed('gone-3-789.png', '', old)
  await w.start()
  // Nothing inside the hook: the sweep runs from a timer.
  expect(w.files.get(`${CACHE}/gone-1-123.png`)).toBe('small-png')
  await w.settle()
  expect(w.files.get(`${CACHE}/gone-1-123.png`)).toBe('')
  expect(w.files.get(`${CACHE}/gone-2-pre.png`)).toBe('')
  // Not a PNG, another session's fresh file, and an empty one: untouched.
  expect(w.files.get(`${CACHE}/gone-1.bmp`)).toBe('bmp')
  expect(w.files.get(`${CACHE}/alive-1-456.png`)).toBe('small-png')
  expect(w.mtimes.get(`${CACHE}/gone-3-789.png`)).toBe(old)
})

test('draw: the sweep leaves a linked PNG alone', async ($, on) => {
  const w = await world($, on, { isPngLinked: true })
  w.files.set(`${CACHE}/gone-1-123.png`, 'small-png')
  w.mtimes.set(`${CACHE}/gone-1-123.png`, T0 - 2 * DAY_MS)
  await w.start()
  await w.settle()
  expect(w.files.get(`${CACHE}/gone-1-123.png`)).toBe('small-png')
})

test('draw: the sweep looks at most at 200 files a start', async ($, on) => {
  const w = await world($, on)
  const names = Array.from({ length: 205 }, (_, i) => `${CACHE}/gone-${String(i).padStart(3, '0')}-1.png`)
  for (const f of names) {
    w.files.set(f, 'small-png')
    w.mtimes.set(f, T0 - 2 * DAY_MS)
  }
  await w.start()
  await w.settle()
  expect(names.filter(f => w.files.get(f) === '').length).toBe(200)
})

test('draw: the sweep never empties a day-old file this session still holds', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const file = small(w, 1)
  await w.clock.advance(DAY_MS + 60_000)
  // A reload: session.start again, the thumbnail still held.
  await w.start()
  await w.settle()
  expect(w.files.get(file)).toBe('small-png')
})

// --- review fixes: a file of its own per build

test('draw: a rebuild writes a file of its own; the older one is released once nothing holds it', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const first = small(w, 1)
  await w.command('1')
  await w.settle()
  const second = small(w, 1)
  expect(builds(w, 1)).toEqual([first, second])
  expect(second).not.toBe(first)
  expect(w.files.get(first)).toBe('')
  expect(w.files.get(second)).toBe('small-png')
  expect(tilesOf(w).map(t => t.file)).toEqual([second])
})

test('draw: a stopped rebuild never empties or writes over the small PNG a thumbnail holds', { options: { draw: 'picture' } }, async ($, on) => {
  const shape: WorldShape = {}
  const w = await world($, on, shape)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.command('clear')
  const first = small(w, 1)
  expect(w.files.get(first)).toBe('small-png')
  // The rebuild's sips is slow; /img clear stops the run while it writes.
  shape.smallPngDelayMs = 500
  await w.command('1')
  await w.settle()
  await w.command('clear')
  await w.clock.advance(1_000)
  const [, second] = builds(w, 1)
  expect(second).not.toBe(first)
  expect(w.files.get(second!)).toBe('')
  expect(w.files.get(first)).toBe('small-png')
  expect((await underOf($, w.places[0]!)).images.map(i => i.source.file)).toEqual([first])
})

// --- re-check fixes: a sign of life, and the newest build wins

const HOUR_MS = 60 * 60 * 1000

test('kit: staleOf: a fresh .alive file protects its whole prefix; .alive files are never listed', async () => {
  const now = 10 * DAY_MS
  const f = (name: string, mtimeMs: number, size = 3, kind = 'file', isLink = false) => ({ name, kind, size, mtimeMs, isLink })
  const old = now - DAY_MS - 1
  expect(
    staleOf(
      [
        f('a-b.alive', now - HOUR_MS, 0),
        f('a-b-1-1.png', old),
        f('a-bc-1-1.png', old),
        f('a-1-1.png', old),
        f('dead.alive', old, 0),
        f('dead-1-1.png', old),
        f('link.alive', now, 0, 'other', true),
        f('link-1-1.png', old),
        f('fresh-1-1.png', now - 1),
      ],
      '/c',
      now,
    ),
  ).toEqual(['/c/a-bc-1-1.png', '/c/a-1-1.png', '/c/dead-1-1.png', '/c/link-1-1.png'])
})

test("draw: the sweep spares a running session's day-old pictures while its .alive file is fresh", async ($, on) => {
  const w = await world($, on)
  const old = T0 - DAY_MS - 1
  const seed = (name: string, content: string, at: number) => {
    w.files.set(`${CACHE}/${name}`, content)
    w.mtimes.set(`${CACHE}/${name}`, at)
  }
  // A session open for two days, its sign of life written an hour ago; its name holds a '-'.
  seed('long-run.alive', '', T0 - HOUR_MS)
  seed('long-run-1-123.png', 'small-png', old)
  seed('long-run-2-pre.png', 'clipboard-png', old)
  // Another session whose name is only the start of it: not protected.
  seed('long-1-5.png', 'small-png', old)
  // A killed session: its last sign of life more than a day ago.
  seed('dead.alive', '', old)
  seed('dead-1-7.png', 'small-png', old)
  // A killed session that never wrote one.
  seed('gone-1-8.png', 'small-png', old)
  await w.start()
  await w.settle()
  expect(w.files.get(`${CACHE}/long-run-1-123.png`)).toBe('small-png')
  expect(w.files.get(`${CACHE}/long-run-2-pre.png`)).toBe('clipboard-png')
  expect(w.files.get(`${CACHE}/long-1-5.png`)).toBe('')
  expect(w.files.get(`${CACHE}/dead-1-7.png`)).toBe('')
  expect(w.files.get(`${CACHE}/gone-1-8.png`)).toBe('')
  // The .alive files are never written by the sweep.
  expect([w.mtimes.get(`${CACHE}/long-run.alive`), w.mtimes.get(`${CACHE}/dead.alive`)]).toEqual([T0 - HOUR_MS, old])
})

test('draw: the .alive files are not counted in the 200 a sweep looks at', async ($, on) => {
  const w = await world($, on)
  for (let i = 0; i < 20; i++) {
    w.files.set(`${CACHE}/a${String(i).padStart(2, '0')}.alive`, '')
    w.mtimes.set(`${CACHE}/a${String(i).padStart(2, '0')}.alive`, T0 - 2 * DAY_MS)
  }
  const names = Array.from({ length: 205 }, (_, i) => `${CACHE}/gone-${String(i).padStart(3, '0')}-1.png`)
  for (const f of names) {
    w.files.set(f, 'small-png')
    w.mtimes.set(f, T0 - 2 * DAY_MS)
  }
  await w.start()
  await w.settle()
  expect(names.filter(f => w.files.get(f) === '').length).toBe(200)
})

test('draw: a session writes its .alive file at its start and every hour; the hourly timer stops at its end and starts again at its start', async ($, on) => {
  const w = await world($, on, { sessionId: 'long-run' })
  const alive = `${CACHE}/long-run.alive`
  const writesOf = () => w.writes.filter(f => f === alive).length
  await w.start()
  // Nothing inside the hook: the first one comes from the start's timer.
  expect(writesOf()).toBe(0)
  await w.settle()
  expect([writesOf(), w.files.get(alive), w.mtimes.get(alive)]).toEqual([1, '', T0 + 10])
  await w.clock.advance(25 * HOUR_MS)
  expect(writesOf()).toBe(26)
  expect(w.clock.now() - w.mtimes.get(alive)!).toBeLessThan(HOUR_MS)
  // A reload's start again: still one timer.
  await w.start()
  await w.settle()
  await w.clock.advance(2 * HOUR_MS)
  expect(writesOf()).toBe(29)
  await w.sessionEnd('prompt_input_exit')
  await w.clock.advance(3 * HOUR_MS)
  expect(writesOf()).toBe(29)
  await w.start()
  await w.settle()
  await w.clock.advance(HOUR_MS)
  expect(writesOf()).toBe(31)
})

test('draw: a /clear or a resume keeps the sign of life going: the process goes on and no session start follows', async ($, on) => {
  const w = await world($, on, { sessionId: 'long-run' })
  const alive = `${CACHE}/long-run.alive`
  const writesOf = () => w.writes.filter(f => f === alive).length
  await w.start()
  await w.settle()
  expect(writesOf()).toBe(1)
  // A /clear: one write at once (from a timer), then every hour as before.
  await w.sessionEnd('clear')
  await w.settle()
  expect(writesOf()).toBe(2)
  await w.clock.advance(3 * HOUR_MS)
  expect(writesOf()).toBe(5)
  expect(w.clock.now() - w.mtimes.get(alive)!).toBeLessThan(HOUR_MS)
  // An in-process resume: the same.
  await w.sessionEnd('resume')
  await w.settle()
  expect(writesOf()).toBe(6)
  await w.clock.advance(2 * HOUR_MS)
  expect(writesOf()).toBe(8)
  // An end that ends the session stops it.
  await w.sessionEnd('other')
  await w.clock.advance(3 * HOUR_MS)
  expect(writesOf()).toBe(8)
})

test('draw: an older build that reaches the band after a newer one is not written; its file is emptied, the newer kept', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  let isArmed = true
  // The sent prompt's run, about to add its tile to the band: /img 1 runs whole meanwhile.
  on('state.get', async (_$, e, next) => {
    const g = e as { plugin?: string; key?: string }
    if (isArmed && g.plugin === 'images' && g.key === 'shown' && builds(w, 1).length === 1) {
      isArmed = false
      await w.command('1')
      await w.clock.sleep(200)
    }
    return next(e)
  })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.clock.advance(1_000)
  expect(isArmed).toBe(false)
  const [first, second] = builds(w, 1)
  expect(tilesOf(w).map(t => t.file)).toEqual([second])
  expect((w.state('thumbs') as Record<string, ImageTile>)['1']?.file).toBe(second)
  expect(w.files.get(second!)).toBe('small-png')
  expect(w.files.get(first!)).toBe('')
})

test('draw: an older build that reaches the thumbnails after a newer one is not written', { options: { draw: 'picture' } }, async ($, on) => {
  const w = await world($, on)
  let isArmed = true
  // The sent prompt's run, about to keep its thumbnail: /img 1 runs whole meanwhile.
  on('state.get', async (_$, e, next) => {
    const g = e as { plugin?: string; key?: string }
    if (isArmed && g.plugin === 'images' && g.key === 'thumbs' && builds(w, 1).length === 1) {
      isArmed = false
      await w.command('1')
      await w.clock.sleep(200)
    }
    return next(e)
  })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.clock.advance(1_000)
  expect(isArmed).toBe(false)
  const [first, second] = builds(w, 1)
  expect((w.state('thumbs') as Record<string, ImageTile>)['1']?.file).toBe(second)
  expect(tilesOf(w).map(t => t.file)).toEqual([second])
  expect(w.files.get(second!)).toBe('small-png')
  expect(w.files.get(first!)).toBe('')
})
