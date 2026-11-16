import { expect, test } from 'claude-code/testing'

import { CHIP } from './kit'
import { decodeCells, mountRow, rowView, world } from './test-kit'

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

/** Every `zm-` row key in a drawn tree, outermost first. */
const zmKeys = (node: unknown): string[] => {
  if (!node || typeof node !== 'object') return []
  const n = node as { props?: { key?: unknown }; children?: unknown }
  const key = n.props?.key
  const kids = Array.isArray(n.children) ? n.children : []
  return [...(typeof key === 'string' && key.startsWith('zm-') ? [key] : []), ...kids.flatMap(zmKeys)]
}

// Since engine 2.1.325 a band hook draws only its own plugin's row; the order
// across mods belongs to one AbovePromptList hook.
test("row: the hook draws this plugin's own row", async ($, on) => {
  await drawn($, on, [1], { isEngineBeneath: true })
  const ui = await mountRow($)
  const tree = await ui.drawn()
  expect((tree as { props?: { key?: unknown } }).props?.key).toBe('zm-90-images')
  expect(zmKeys(tree)).toEqual(['zm-90-images'])
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
  // The band is this plugin's own row (the engine's placeholder beneath): the
  // room is counted from maxRows alone, not from rows beneath.
  await drawn($, on, [1], { isEngineBeneath: true })
  // 6 rows of tile and a caption: 7, the tile whole.
  expect((await rowView($, 160, { maxRows: 7 }))?.tiles).toEqual([{ key: 'images-tile-1', columns: 24, rows: 6 }])
  // 4 rows: 3 left for the tile, so it is drawn at 3 rows, narrower in the same shape (24 x 6 -> 12 x 3).
  const small = await rowView($, 160, { maxRows: 4 })
  expect(small?.tiles).toEqual([{ key: 'images-tile-1', columns: 12, rows: 3 }])
  expect(small?.captions).toEqual(['[Image #1] 1376x688'])
  // 2 rows: 1 left, under the 3-row floor: captions only.
  expect(await rowView($, 160, { maxRows: 2 })).toEqual({ tiles: [], captions: ['[Image #1] 1376x688'], more: '' })
})

test('row: a narrow band draws the newest tiles that fit and `+n more`', async ($, on) => {
  await drawn($, on, [1, 2, 3, 4])
  // 80 less the chip (11), two gaps and clear (9): 58, less `+n more` and its gap: 50; a tile is 24 columns, 25 with its gap: two.
  const v = await rowView($, 80)
  expect(v?.tiles.map(t => t.key)).toEqual(['images-tile-3', 'images-tile-4'])
  expect(v?.more).toBe('+2 more')
  expect((await rowView($, 200))?.more).toBe('')
})
