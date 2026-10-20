import { expect, test } from 'claude-code/testing'

import type { ImageTile } from '../types'
import { USAGE } from './kit'
import { CACHE, HOME, IMAGES, SESSION, makeBmp, rowView, world } from './test-kit'

const tilesOf = (w: { state: (k: string) => unknown }): ImageTile[] => (w.state('tiles') as ImageTile[] | undefined) ?? []
const sipsRuns = (w: { runs: string[][] }) => w.runs.filter(a => a[0] === 'sips' && a[1] === '-s')

test('pipeline: a sent prompt with two tags draws both after its turn starts: sips to a BMP, parsed, emptied', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  w.paste(2)
  await w.send('compare [Image #1] with [Image #2]', { isTurn: false })
  // Nothing before the main loop's turn starts.
  await w.settle()
  expect(w.runs).toEqual([])
  await w.turn()
  await w.settle()
  expect(sipsRuns(w)).toEqual([
    ['sips', '-s', 'format', 'bmp', '-Z', '48', `${IMAGES}/1.png`, '--out', `${CACHE}/${SESSION}-1.bmp`],
    ['sips', '-s', 'format', 'bmp', '-Z', '48', `${IMAGES}/2.png`, '--out', `${CACHE}/${SESSION}-2.bmp`],
  ])
  expect(w.inits.every(i => (i as { timeoutMs?: number }).timeoutMs === 3_000)).toBe(true)
  // Every process is sips.
  expect(w.runs.every(a => a[0] === 'sips')).toBe(true)
  // The cache folder is made before sips writes into it; the BMPs are emptied after reading.
  expect(w.files.get(`${CACHE}/.keep`)).toBe('')
  expect(w.files.get(`${CACHE}/${SESSION}-1.bmp`)).toBe('')
  expect(w.files.get(`${CACHE}/${SESSION}-2.bmp`)).toBe('')
  const tiles = tilesOf(w)
  expect(tiles.map(t => [t.n, t.w, t.h, t.columns, t.rows])).toEqual([
    [1, 1376, 688, 24, 6],
    [2, 1376, 688, 24, 6],
  ])
  expect(tiles[0]!.cells.length).toBeGreaterThan(0)
  expect(w.state('shown')).toBe(true)
  expect((await rowView($))?.captions).toEqual(['[Image #1] 1376x688', '[Image #2] 1376x688'])
})

test('pipeline: waits for the PNG every 250 ms, and gives up at 5 s with the tag alone', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(3, 1_200)
  await w.send('[Image #3]')
  await w.clock.advance(1_000)
  expect(sipsRuns(w)).toEqual([])
  await w.clock.advance(500)
  expect(sipsRuns(w).length).toBe(1)
  expect(tilesOf(w).map(t => t.n)).toEqual([3])
  expect(tilesOf(w)[0]!.cells).not.toBe('')

  // Never there: 21 looks over 5 s, no sips, a text-only tile.
  await w.send('[Image #4]')
  const before = w.existsCalls()
  await w.clock.advance(4_900)
  expect(tilesOf(w).map(t => t.n)).toEqual([3])
  await w.clock.advance(200)
  expect(w.existsCalls() - before).toBe(21)
  expect(sipsRuns(w).length).toBe(1)
  expect(tilesOf(w)).toEqual([{ n: 4, w: 0, h: 0, columns: 0, rows: 0, cells: '' }])
  expect(await rowView($)).toEqual({ tiles: [], captions: ['[Image #4]'], more: '' })
})

test('pipeline: the folder is found under the claude-<uid> that holds the session, by the cwd slug, a dotted path included', async ($, on) => {
  const w = await world($, on, {
    cwd: '/Users/me/.claude/mods',
    tmp: [
      { name: 'claude-0', kind: 'file' },
      { name: 'claude-501', kind: 'dir' },
    ],
  })
  await w.start()
  w.paste(7)
  await w.send('[Image #7]')
  await w.settle()
  expect(sipsRuns(w)[0]?.[6]).toBe(`/private/tmp/claude-501/-Users-me--claude-mods/${SESSION}/images/7.png`)
  expect(tilesOf(w).map(t => t.n)).toEqual([7])
})

test('pipeline: the tile follows the image: a tall one is capped at 24 rows; size 12 option', { options: { size: '12' } }, async ($, on) => {
  const w = await world($, on, { bmps: { 1: makeBmp(10, 48, 24, false, () => [0, 0, 0]) }, pngSize: { w: 300, h: 1440 } })
  await w.start()
  w.paste(1)
  w.paste(2)
  await w.send('[Image #1] [Image #2]')
  await w.settle()
  // 10 by 48 at 12 columns: 29 rows, capped at 24 and round(48 × 10 / 48) = 10 columns.
  expect(tilesOf(w).map(t => [t.n, t.columns, t.rows])).toEqual([
    [1, 10, 24],
    [2, 12, 3],
  ])
  expect((await rowView($))?.tiles).toEqual([
    { key: 'images-tile-1', columns: 10, rows: 24 },
    { key: 'images-tile-2', columns: 12, rows: 3 },
  ])
})

test('pipeline: eight tags keep the newest six', async ($, on) => {
  const w = await world($, on)
  await w.start()
  for (let n = 1; n <= 8; n++) w.paste(n)
  await w.send([1, 2, 3, 4, 5, 6, 7, 8].map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([3, 4, 5, 6, 7, 8])
})

test('pipeline: a subagent turn, a slash command and a plugin prompt start nothing', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]', { isTurn: false })
  await w.turn('agent-1')
  await w.settle()
  expect(w.runs).toEqual([])
  await w.turn()
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
  // A slash command and a plugin's prompt neither clear the row nor note tags.
  await w.send('/review [Image #1]', { command: { name: 'review', args: '[Image #1]' } })
  await w.send('[Image #1]', { origin: 'plugin' })
  await w.settle()
  expect(w.state('shown')).toBe(true)
  expect(sipsRuns(w).length).toBe(1)
})

test('pipeline: a prompt typed over a running turn starts at once', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running' })
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([2])
})

test('linger turn: the next prompt clears the row; /img shows the last tiles again', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(await rowView($)).not.toBeNull()
  await w.send('thanks')
  expect(w.state('shown')).toBe(false)
  expect(await rowView($)).toBeNull()
  expect(await w.command('')).toBe('Showing [Image #1] 1376x688.')
  expect((await rowView($))?.captions).toEqual(['[Image #1] 1376x688'])
  // A new prompt's images replace the hidden ones.
  w.paste(2)
  await w.send('[Image #2]')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([2])
})

test('linger 2min: the row clears two minutes after it showed, or at the next prompt', { options: { linger: '2min' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.clock.advance(119_000)
  expect(w.state('shown')).toBe(true)
  await w.clock.advance(1_000)
  expect(w.state('shown')).toBe(false)
  expect(await rowView($)).toBeNull()
  await w.command('')
  expect(w.state('shown')).toBe(true)
  await w.send('next')
  expect(w.state('shown')).toBe(false)
})

test('linger until-cleared: the next prompt keeps the row; new images are added; /img clear drops them', { options: { linger: 'until-cleared' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.send('thanks')
  expect(w.state('shown')).toBe(true)
  w.paste(2)
  await w.send('[Image #2]')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([1, 2])
  expect(await w.command('clear')).toBe('Image tiles cleared.')
  expect(tilesOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
  expect(await w.command('')).toBe('No image tiles yet: send a prompt with a pasted image, or /img <n> for [Image #n] of this session.')
})

test('command: /img n draws that image of this session from a timer; a missing one toasts', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(5)
  expect(await w.command('5')).toBe('Drawing [Image #5] of this session above the prompt.')
  expect(w.runs).toEqual([])
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([5])
  expect(w.state('shown')).toBe(true)
  expect(w.toasts).toEqual([])
  await w.command('9')
  await w.clock.advance(5_100)
  // The shown row is added to.
  expect(tilesOf(w).map(t => t.n)).toEqual([5, 9])
  expect(w.toasts).toEqual(["[Image #9]: no thumbnail (not in this session's images folder, or no sips) (/img 9)"])
  expect(await w.command('maybe')).toBe(USAGE)
})

test('command: /img off stops the automatic tiles (kept in the store), /img n still draws; /img on again', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  expect(await w.command('off')).toBe('Image tiles off: /img on turns them on again; /img <n> still draws one.')
  expect(w.store.get('band')).toBe('off')
  await w.send('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(await rowView($)).toBeNull()
  await w.command('1')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
  expect(await w.command('on')).toBe("Image tiles on: a sent prompt's images are drawn above the prompt.")
  expect(w.store.get('band')).toBe('on')
  w.paste(2)
  await w.send('[Image #2]')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([2])
})

test('command: /img off during a run stops it before its next tile; the row stays hidden', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  w.paste(2, 3_000)
  await w.send('[Image #1] [Image #2]')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
  expect(w.state('shown')).toBe(true)
  await w.command('off')
  expect(w.state('shown')).toBe(false)
  await w.clock.advance(6_000)
  expect(sipsRuns(w).length).toBe(1)
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
  expect(w.state('shown')).toBe(false)
  expect(await rowView($)).toBeNull()
})

test('options: auto off draws nothing on its own; a stored on wins', { options: { auto: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  await w.command('on')
  await w.send('[Image #1]')
  await w.settle()
  expect(tilesOf(w).map(t => t.n)).toEqual([1])
})

test('command: a stored off holds in the next session', async ($, on) => {
  const w = await world($, on, { stored: { band: 'off' } })
  await w.start()
  expect(w.state('band')).toBe('off')
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
})

test('no sips (not macOS): the row shows the tag as text only', async ($, on) => {
  const w = await world($, on, { isNoSips: true })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(sipsRuns(w).length).toBe(1)
  expect(tilesOf(w)).toEqual([{ n: 1, w: 0, h: 0, columns: 0, rows: 0, cells: '' }])
  expect(await rowView($)).toEqual({ tiles: [], captions: ['[Image #1]'], more: '' })
})

for (const how of ['exit', 'timeout'] as const) {
  test(`sips breaks (${how}): the part it wrote is emptied, the tag as text only`, async ($, on) => {
    const w = await world($, on, { sipsBreaks: how })
    await w.start()
    w.paste(1)
    await w.send('[Image #1]')
    await w.settle()
    expect(sipsRuns(w).length).toBe(1)
    expect(w.files.get(`${CACHE}/${SESSION}-1.bmp`)).toBe('')
    expect(tilesOf(w)).toEqual([{ n: 1, w: 0, h: 0, columns: 0, rows: 0, cells: '' }])
  })
}

test('another claude-<uid> holding this session: nothing is read from either folder, the tag as text only', async ($, on) => {
  const w = await world($, on, {
    tmp: [
      { name: 'claude-1000', kind: 'dir' },
      { name: 'claude-501', kind: 'dir' },
    ],
  })
  await w.start()
  w.files.set(`/private/tmp/claude-1000/-Users-me-repo/${SESSION}/images/1.png`, 'planted')
  w.paste(1)
  await w.send('[Image #1]')
  await w.clock.advance(5_100)
  expect(w.runs).toEqual([])
  expect(tilesOf(w)).toEqual([{ n: 1, w: 0, h: 0, columns: 0, rows: 0, cells: '' }])
})

test('a PNG that is a symbolic link is not read: the tag as text only', async ($, on) => {
  const w = await world($, on, { isPngLinked: true })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.clock.advance(5_100)
  expect(w.runs).toEqual([])
  expect(tilesOf(w)).toEqual([{ n: 1, w: 0, h: 0, columns: 0, rows: 0, cells: '' }])
})

test('no HOME: no scratch folder, the tag as text only', async ($, on) => {
  const w = await world($, on, { isNoHome: true })
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(tilesOf(w)[0]?.cells).toBe('')
  expect(HOME).toBe('/Users/me')
})

test('a newer prompt stops the run of an older one', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.send('[Image #1]')
  await w.clock.advance(1_000)
  w.paste(2)
  await w.send('[Image #2]')
  await w.clock.advance(6_000)
  expect(tilesOf(w).map(t => t.n)).toEqual([2])
})

test('a /clear empties the tiles', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  await w.sessionEnd('other')
  expect(tilesOf(w).length).toBe(1)
  await w.sessionEnd('clear')
  expect(tilesOf(w)).toEqual([])
  expect(w.state('shown')).toBe(false)
})
