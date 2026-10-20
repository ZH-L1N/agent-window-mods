import { expect, test } from 'claude-code/testing'

import { CHIP, ROW_KEY, captionOf, cellsOf, hasRoom, listText, parseArgs, placeholderCells, rowsOf, sizeOf, stackOrderOf, tagsOf, tileBox, tilesThatFit } from './kit'

test('kit: the chip is padded like the other zehui-mods chips (the word to 7 letters)', async () => {
  expect(CHIP).toBe(' ▣ IMAGES  ')
  expect(cellsOf(CHIP)).toBe(cellsOf(' ➜ NEXT    '))
})

test('kit: the size option is held to its listed values', async () => {
  expect(sizeOf(undefined)).toBe(24)
  expect(sizeOf('16')).toBe(16)
  expect(sizeOf('24')).toBe(24)
  expect(sizeOf('32')).toBe(32)
  expect(sizeOf(32)).toBe(32)
  expect(sizeOf('20')).toBe(24)
  expect(sizeOf('32 ')).toBe(24)
  expect(sizeOf('big')).toBe(24)
})

test('kit: tagsOf reads every [Image #n] once, in order of first appearance', async () => {
  expect(tagsOf('')).toEqual([])
  expect(tagsOf('look at [Image #2] and [Image #1], then [Image #2] again')).toEqual([2, 1])
  expect(tagsOf('[Image #] [image #3] [Image #4')).toEqual([])
  expect(tagsOf('[Pasted text #1 +12 lines] [Image #7]')).toEqual([7])
})

test('kit: the tile is size rows by twice the columns, shrunk to the band, never under 4 rows', async () => {
  expect(tileBox(24, 40, 160)).toEqual({ columns: 48, rows: 24 })
  expect(tileBox(16, 40, 160)).toEqual({ columns: 32, rows: 16 })
  expect(tileBox(32, 40, 160)).toEqual({ columns: 64, rows: 32 })
  // The band's height less the caption.
  expect(tileBox(24, 12, 160)).toEqual({ columns: 22, rows: 11 })
  // ... and less the rows the bands stacked with it take: fullscreen, 20 rows, SYS, GOAL, NEXT and another band.
  expect(tileBox(32, 20, 160, 4)).toEqual({ columns: 30, rows: 15 })
  expect(tileBox(24, 12, 160, 3)).toEqual({ columns: 16, rows: 8 })
  // 60 columns less the chip (11), two gaps and the hide button (8): 39, so 19 rows.
  expect(tileBox(24, 40, 60)).toEqual({ columns: 38, rows: 19 })
  expect(tileBox(24, 3, 20)).toEqual({ columns: 8, rows: 4 })
})

test('kit: hasRoom: the smallest tile and its caption beside the rows beneath', async () => {
  expect(hasRoom(12, 3)).toBe(true)
  expect(hasRoom(8, 3)).toBe(true)
  expect(hasRoom(8, 4)).toBe(false)
  expect(hasRoom(4, 0)).toBe(false)
  expect(hasRoom(0, 9)).toBe(true)
})

test('kit: rowsOf measures a drawn tree', async () => {
  const text = (s: string) => ({ type: 'Text', props: {}, children: [s] })
  expect(rowsOf(null)).toBe(0)
  expect(rowsOf({ type: 'engine', ref: 0 })).toBe(0)
  expect(rowsOf(text('one'))).toBe(1)
  expect(rowsOf(text('one\ntwo'))).toBe(2)
  expect(rowsOf({ type: 'Raster', props: { columns: 10, rows: 5 } })).toBe(5)
  // A row Box: its tallest child; a column: the sum, with the gaps.
  expect(rowsOf({ type: 'Box', props: {}, children: [text('a'), { type: 'Raster', props: { rows: 6 } }] })).toBe(6)
  expect(rowsOf({ type: 'Box', props: { flexDirection: 'column', gap: 1 }, children: [text('a'), text('b'), text('c')] })).toBe(5)
  // A border and padding add their rows; a height wins over the children.
  expect(rowsOf({ type: 'Box', props: { borderStyle: 'round', paddingY: 1 }, children: [text('a')] })).toBe(5)
  expect(rowsOf({ type: 'Box', props: { height: 3 }, children: [text('a')] })).toBe(3)
  expect(rowsOf({ type: 'Box', props: { display: 'none' }, children: [text('a')] })).toBe(0)
})

test('kit: tilesThatFit keeps room for `+n more` only when not all fit; at least one', async () => {
  // 160 less the chip (11), a gap and hide (8): 140; a 48-column tile and its gap take 49.
  expect(tilesThatFit(2, 48, 160)).toBe(2)
  expect(tilesThatFit(3, 48, 160)).toBe(2)
  expect(tilesThatFit(5, 32, 160)).toBe(3)
  expect(tilesThatFit(4, 32, 160)).toBe(4)
  expect(tilesThatFit(3, 48, 40)).toBe(1)
})

test('kit: placeholder cells: a round frame, the checkerboard, `no preview` in the middle row', async () => {
  const cells = placeholderCells(20, 6)
  // The hooks environment has the web's Uint8Array.fromBase64; the es2023 lib does not type it.
  const bytes = (Uint8Array as unknown as { fromBase64: (s: string) => Uint8Array }).fromBase64(cells)
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  expect(words.length).toBe(20 * 6 * 3)
  const at = (x: number, y: number) => [...words.slice((y * 20 + x) * 3, (y * 20 + x) * 3 + 3)]
  expect(String.fromCodePoint(at(0, 0)[0]!, at(19, 0)[0]!, at(0, 5)[0]!, at(19, 5)[0]!)).toBe('╭╮╰╯')
  expect(String.fromCodePoint(at(5, 0)[0]!, at(0, 3)[0]!)).toBe('─│')
  // Middle row (2): `no preview` centred in 20 columns starts at 5.
  expect(Array.from({ length: 10 }, (_, i) => String.fromCodePoint(at(5 + i, 2)[0]!)).join('')).toBe('no preview')
  // The checkerboard alternates every two columns.
  expect(at(1, 1)[2]).not.toBe(at(3, 1)[2])
  expect(at(2, 1)[2]).toBe(at(3, 1)[2])
  // Every code point is a printable width-1 BMP character.
  for (let i = 0; i < words.length; i += 3) expect(words[i]! >= 0x20 && words[i]! <= 0xffff).toBe(true)
  // Kept per size: the same string again.
  expect(placeholderCells(20, 6)).toBe(cells)
})

test('kit: the caption is the tag and the tile size, cut to the tile', async () => {
  expect(captionOf(2, 48, 24)).toBe('[Image #2] · 48×24')
  expect(captionOf(12, 8, 4)).toBe('[Image…')
})

test('kit: the command words', async () => {
  expect(parseArgs('')).toEqual({ kind: 'list' })
  expect(parseArgs(' ON ')).toEqual({ kind: 'on' })
  expect(parseArgs('off')).toEqual({ kind: 'off' })
  expect(parseArgs('hide')).toEqual({ kind: 'off' })
  expect(parseArgs('on now')).toEqual({ kind: 'usage' })
  expect(parseArgs('2')).toEqual({ kind: 'usage' })
  expect(listText([], true)).toBe('No image tags in the prompt box; tiles on.')
  expect(listText([1, 3], false)).toContain('[Image #1], [Image #3]; tiles off (/images on shows them).')
})

test('kit: the row key sits at 90 in the stack, under NEXT 80', async () => {
  expect(ROW_KEY).toBe('zm-90-images')
  expect(stackOrderOf({ type: 'Box', props: { key: ROW_KEY } })).toBe(90)
})
