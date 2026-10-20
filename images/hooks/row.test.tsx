import { expect, test } from 'claude-code/testing'

import { CHIP, placeholderCells } from './kit'
import { childKeys, mountRow, rowView, world } from './test-kit'

test('row: the pink chip, a Raster tile and its caption, a framed hide button; above another mod\'s band', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #2]')
  const ui = await mountRow($)
  const chip = await ui.find({ type: 'Text', text: CHIP })
  expect(chip?.props).toMatchObject({ bold: true, color: '#0b0b0f', backgroundColor: '#f472b6' })
  const tile = await ui.find({ key: 'images-tile-2' })
  expect(tile?.type).toBe('Raster')
  expect(tile?.props).toMatchObject({ columns: 48, rows: 24, cells: placeholderCells(48, 24) })
  // Terminal elements only: never an Image, which draws only its alt text in herdr.
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
  const hide = await ui.find({ key: 'images-hide' })
  expect(hide?.type).toBe('Button')
  expect(hide?.props).toMatchObject({ label: 'hide' })
  expect((hide?.props as { plain?: boolean }).plain).toBeUndefined()
  expect((hide?.props as { hotkey?: string }).hotkey).toBeUndefined()
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: the hide button runs /images off from a timer and names the command in its toast', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  const ui = await mountRow($)
  await ui.press({ key: 'images-hide' })
  await ui.unmount()
  expect(w.state('band')).not.toBe('off')
  await w.settle()
  expect(w.state('band')).toBe('off')
  expect(w.toasts).toEqual(['Image tiles off: /images on shows them again.'])
  expect(await rowView($)).toBeNull()
})

test('row: more tags than fit: the first tiles and `+n more`', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1] [Image #2] [Image #3] [Image #4]')
  const v = await rowView($, 160)
  expect(v?.tiles.map(t => t.key)).toEqual(['images-tile-1', 'images-tile-2'])
  expect(v?.more).toBe('+2 more')
})

test('row: a short band shrinks the tile to fit its height', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  // 12 rows less the caption and the band beneath (one Text row): 10.
  expect((await rowView($, 160, { maxRows: 12 }))?.tiles[0]).toEqual({ key: 'images-tile-1', columns: 20, rows: 10 })
})

test('row: the tile leaves room for the rows stacked with it, so the whole band fits maxRows', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-10-sys', 'zm-60-goal', 'zm-80-next'] })
  await w.start()
  await w.type('[Image #1]')
  // Three 1-row zm rows and another 1-row band beneath: 4 rows.
  const tile = (await rowView($, 160, { maxRows: 12 }))?.tiles[0]
  expect(tile).toEqual({ key: 'images-tile-1', columns: 14, rows: 7 })
  expect(tile!.rows + 1 + 4).toBeLessThanOrEqual(12)
  // Fullscreen, 20 rows, size 24: 15 rows, not 18.
  expect((await rowView($, 160, { maxRows: 20 }))?.tiles[0]?.rows).toBe(15)
})

test('row: no room for the smallest tile beside the rows beneath: the row stands aside, the bands beneath untouched', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-10-sys', 'zm-60-goal', 'zm-80-next'] })
  await w.start()
  await w.type('[Image #1]')
  expect(await rowView($, 160, { maxRows: 8 })).toBeNull()
  const ui = await mountRow($, 160, { maxRows: 8 })
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-60-goal', 'zm-80-next', 'other-band'])
  await ui.unmount()
  expect((await rowView($, 160, { maxRows: 9 }))?.tiles[0]?.rows).toBe(4)
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect(await rowView($, 160, { hasSurvey: true })).toBeNull()
  expect(await rowView($, 160, { surface: 'desktop' })).toBeNull()
  const survey = await mountRow($, 160, { hasSurvey: true })
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
})

test('row: nothing to show hands the band beneath on untouched', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const ui = await mountRow($)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws, handed on when it has nothing', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  await w.type('[Image #1]')
  const ui = await mountRow($)
  expect(await ui.find({ key: 'images-chip' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: stack order: the row takes IMAGES 90 under NEXT 80 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-80-next', 'zm-10-sys', 'zm-60-goal'] })
  await w.start()
  await w.type('[Image #1]')
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-60-goal', 'zm-80-next', 'zm-90-images', 'other-band'])
  await ui.unmount()
})
