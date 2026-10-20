import { expect, test } from 'claude-code/testing'

import { CHIP } from './kit'
import { childKeys, decodeCells, mountRow, rowView, world } from './test-kit'

/** A world with `[Image #1]` (and more) sent and drawn. */
async function drawn($: Parameters<typeof world>[0], on: Parameters<typeof world>[1], tags = [1], shape: Parameters<typeof world>[2] = {}) {
  const w = await world($, on, shape)
  await w.start()
  for (const n of tags) w.paste(n)
  await w.send(tags.map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  return w
}

test('row: the fuchsia chip, a half-block Raster per image with its caption dim beneath, a framed clear button; never Image', async ($, on) => {
  await drawn($, on, [2])
  const ui = await mountRow($)
  const chip = await ui.find({ type: 'Text', text: CHIP })
  expect(chip?.props).toMatchObject({ bold: true, color: '#0b0b0f', backgroundColor: '#e879f9' })
  const tile = await ui.find({ key: 'images-tile-2' })
  expect(tile?.type).toBe('Raster')
  expect(tile?.props).toMatchObject({ columns: 24, rows: 6 })
  // The default BMP: red above blue, so the top cells are red over red, the bottom ones blue over blue.
  const cells = decodeCells((tile?.props as { cells: string }).cells)
  expect(cells.length).toBe(24 * 6)
  expect(cells[0]).toEqual([0x2580, 0xff0000, 0xff0000])
  expect(cells[cells.length - 1]).toEqual([0x2580, 0x0000ff, 0x0000ff])
  const caption = await ui.find({ type: 'Text', text: /^\[Image #2\]/ })
  expect(caption?.text).toBe('[Image #2] 1376x688')
  expect(caption?.props).toMatchObject({ dimColor: true })
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
  const clear = await ui.find({ key: 'images-clear' })
  expect(clear?.type).toBe('Button')
  expect(clear?.props).toMatchObject({ label: 'clear' })
  expect((clear?.props as { plain?: boolean }).plain).toBeUndefined()
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: tiles side by side, oldest first', async ($, on) => {
  await drawn($, on, [1, 2, 3])
  expect((await rowView($))?.tiles.map(t => t.key)).toEqual(['images-tile-1', 'images-tile-2', 'images-tile-3'])
})

test('row: stack order: IMAGES 90 under a zm-80 row, before another mod\'s band', async ($, on) => {
  await drawn($, on, [1], { stackBeneath: ['zm-80-next', 'zm-10-sys'] })
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-80-next', 'zm-90-images', 'other-band'])
  await ui.unmount()
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  await drawn($, on)
  expect(await rowView($, 160, { hasSurvey: true })).toBeNull()
  expect(await rowView($, 160, { surface: 'desktop' })).toBeNull()
  const survey = await mountRow($, 160, { hasSurvey: true })
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
})

test('row: nothing to show hands the band beneath on untouched, the engine placeholder included', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'images-chip' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: the clear button runs /img clear from a timer and names the command in its toast', async ($, on) => {
  const w = await drawn($, on)
  const ui = await mountRow($)
  await ui.press({ key: 'images-clear' })
  await ui.unmount()
  expect(w.state('shown')).toBe(true)
  await w.settle()
  expect(w.state('shown')).toBe(false)
  expect(w.state('tiles')).toEqual([])
  expect(w.toasts).toEqual(['Image tiles cleared (/img clear).'])
  expect(await rowView($)).toBeNull()
})

test('row: a band too short for the tile draws it smaller, and captions only under 3 rows', async ($, on) => {
  await drawn($, on, [1], { stackBeneath: ['zm-10-sys', 'zm-80-next'] })
  // 6 rows of tile, a caption, three rows beneath: 10.
  expect((await rowView($, 160, { maxRows: 10 }))?.tiles.length).toBe(1)
  // 9 rows: 5 left for the tile, so it is drawn at 5 rows, narrower in the same shape (24 x 6 -> 20 x 5).
  const small = await rowView($, 160, { maxRows: 9 })
  expect(small?.tiles.length).toBe(1)
  expect(small?.captions).toEqual(['[Image #1] 1376x688'])
  // 6 rows: 2 left, under the 3-row floor: captions only.
  expect(await rowView($, 160, { maxRows: 6 })).toEqual({ tiles: [], captions: ['[Image #1] 1376x688'], more: '' })
})

test('row: a narrow band draws the newest tiles that fit and `+n more`', async ($, on) => {
  await drawn($, on, [1, 2, 3, 4])
  // 80 less the chip (11), two gaps and clear (9): 58, less `+n more` and its gap: 50; a tile is 24 columns, 25 with its gap: two.
  const v = await rowView($, 80)
  expect(v?.tiles.map(t => t.key)).toEqual(['images-tile-3', 'images-tile-4'])
  expect(v?.more).toBe('+2 more')
  expect((await rowView($, 200))?.more).toBe('')
})
