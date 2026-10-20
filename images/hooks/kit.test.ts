import { expect, test } from 'claude-code/testing'

import {
  CHIP,
  CHIP_BG,
  MAX_TILES,
  autoOf,
  captionOf,
  cellsOf,
  claudeDirsOf,
  sessionDirsOf,
  isAutoOn,
  lingerOf,
  parseArgs,
  parseBmp,
  parseSipsSize,
  rasterCells,
  sipsArgv,
  sizeArgv,
  sizeOf,
  slugsOf,
  tagsOf,
  textTile,
  tileGrid,
  withTile,
  shrinkTile,
  toBase64,
  fromBase64,
} from './kit'
import { decodeCells, makeBmp } from './test-kit'

test('kit: the chip is fuchsia and padded like the other zehui-mods chips (the word to 7 letters)', async () => {
  expect(CHIP).toBe(' ▣ IMAGES  ')
  expect(CHIP_BG).toBe('#e879f9')
  expect(cellsOf(CHIP)).toBe(cellsOf(' ➜ NEXT    '))
})

test('kit: the options are held to their listed values', async () => {
  expect(sizeOf(undefined)).toBe(24)
  expect(sizeOf('12')).toBe(12)
  expect(sizeOf('16')).toBe(16)
  expect(sizeOf('32')).toBe(32)
  expect(sizeOf(32)).toBe(32)
  expect(sizeOf('20')).toBe(24)
  expect(sizeOf('big')).toBe(24)
  expect(autoOf(undefined)).toBe('on')
  expect(autoOf('off')).toBe('off')
  expect(autoOf('maybe')).toBe('on')
  expect(lingerOf(undefined)).toBe('turn')
  expect(lingerOf('2min')).toBe('2min')
  expect(lingerOf('until-cleared')).toBe('until-cleared')
  expect(lingerOf('forever')).toBe('turn')
  // The store's on|off wins over the option.
  expect(isAutoOn('', 'off')).toBe(false)
  expect(isAutoOn('on', 'off')).toBe(true)
  expect(isAutoOn('off', 'on')).toBe(false)
  expect(isAutoOn('', undefined)).toBe(true)
})

test('kit: tagsOf reads every [Image #n] once, in order of first appearance', async () => {
  expect(tagsOf('')).toEqual([])
  expect(tagsOf('look at [Image #2] and [Image #1], then [Image #2] again')).toEqual([2, 1])
  expect(tagsOf('[Image #3][Image #4] [Image #18]')).toEqual([3, 4, 18])
  expect(tagsOf('[Image #] [image #3] [Image #4')).toEqual([])
  expect(tagsOf('[Pasted text #1 +12 lines] [Image #7]')).toEqual([7])
})

test('kit: the session images folder: slug of the cwd, every claude-<uid> folder', async () => {
  expect(slugsOf('/Users/zehui/Documents/GitHub')).toEqual(['-Users-zehui-Documents-GitHub'])
  // A dot: the '/'-only spelling first, then every non-alphanumeric as '-'.
  expect(slugsOf('/Users/me/.claude/mods')).toEqual(['-Users-me-.claude-mods', '-Users-me--claude-mods'])
  const dirs = claudeDirsOf([
    { name: 'cc-socks', kind: 'dir' },
    { name: 'claude-501', kind: 'dir' },
    { name: 'claude-0', kind: 'file' },
    { name: 'claude-x', kind: 'dir' },
  ])
  expect(dirs).toEqual(['claude-501'])
  expect(sessionDirsOf(dirs, '/Users/zehui/Documents/GitHub', 's1')).toEqual(['/private/tmp/claude-501/-Users-zehui-Documents-GitHub/s1'])
})

test('kit: the sips command lines and the size it reports', async () => {
  expect(sipsArgv('/t/1.png', '/c/s-1.bmp')).toEqual(['sips', '-s', 'format', 'bmp', '-Z', '48', '/t/1.png', '--out', '/c/s-1.bmp'])
  expect(sizeArgv('/t/1.png')).toEqual(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '/t/1.png'])
  expect(parseSipsSize('/t/1.png\n  pixelWidth: 1376\n  pixelHeight: 1584\n')).toEqual({ w: 1376, h: 1584 })
  expect(parseSipsSize('Error 4: no file')).toBeNull()
})

test('kit: parseBmp reads a 24-bit bottom-up BMP with padded rows', async () => {
  // 3 by 2: 9 bytes a row padded to 12; the top row red, green, blue, the bottom row grey.
  const top: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ]
  const bmp = makeBmp(3, 2, 24, false, (x, y) => (y === 0 ? top[x]! : [128, 128, 128]))
  expect(bmp.length).toBe(54 + 12 * 2)
  const img = parseBmp(bmp)
  expect(img?.width).toBe(3)
  expect(img?.height).toBe(2)
  expect([...img!.rgb]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128, 128, 128, 128, 128, 128, 128])
})

test('kit: parseBmp reads a 32-bit top-down BI_BITFIELDS BMP (sips: BGRA, pixels at 138)', async () => {
  const bmp = makeBmp(2, 3, 32, true, (x, y) => [10 * y, 100 + x, 200])
  expect(new DataView(bmp.buffer).getUint32(10, true)).toBe(138)
  const img = parseBmp(bmp)
  expect(img?.width).toBe(2)
  expect(img?.height).toBe(3)
  expect([...img!.rgb]).toEqual([0, 100, 200, 0, 101, 200, 10, 100, 200, 10, 101, 200, 20, 100, 200, 20, 101, 200])
})

test('kit: parseBmp refuses what it cannot read', async () => {
  const good = makeBmp(2, 2, 24, false, () => [1, 2, 3])
  expect(parseBmp(new Uint8Array(10))).toBeNull()
  const notBm = good.slice()
  notBm[0] = 0x50
  expect(parseBmp(notBm)).toBeNull()
  const bpp16 = good.slice()
  new DataView(bpp16.buffer).setUint16(28, 16, true)
  expect(parseBmp(bpp16)).toBeNull()
  const rle = good.slice()
  new DataView(rle.buffer).setUint32(30, 1, true)
  expect(parseBmp(rle)).toBeNull()
  expect(parseBmp(good.slice(0, good.length - 4))).toBeNull()
})

test('kit: tileGrid: size columns, rows from the aspect, at most 24 rows', async () => {
  // 2:1 at 24 columns: 24 × 1 / 2 / 2 = 6 rows.
  expect(tileGrid(24, 1376, 688)).toEqual({ columns: 24, rows: 6 })
  // 1376 by 1584: round(24 × 1584 / 1376 / 2) = round(13.8) = 14.
  expect(tileGrid(24, 1376, 1584)).toEqual({ columns: 24, rows: 14 })
  expect(tileGrid(12, 1920, 1080)).toEqual({ columns: 12, rows: 3 })
  expect(tileGrid(32, 1920, 1080)).toEqual({ columns: 32, rows: 9 })
  // A very wide image keeps one row.
  expect(tileGrid(16, 4000, 100)).toEqual({ columns: 16, rows: 1 })
  // Square at 32: 16 rows; tall: capped at 24 rows and narrower, keeping its shape.
  expect(tileGrid(32, 100, 100)).toEqual({ columns: 32, rows: 16 })
  expect(tileGrid(32, 100, 1000)).toEqual({ columns: 5, rows: 24 })
  expect(tileGrid(24, 500, 1000)).toEqual({ columns: 24, rows: 24 })
  expect(tileGrid(32, 600, 1000).rows).toBe(24)
})

test('kit: rasterCells box-averages to columns by rows × 2 pixels, ▀ top as fg and bottom as bg', async () => {
  // 4 by 4: the top-left 2×2 white, top-right black, bottom-left red, bottom-right (0, 0, 100) and (0, 0, 200) mixed.
  const img = parseBmp(
    makeBmp(4, 4, 24, false, (x, y) => {
      if (y < 2) return x < 2 ? [255, 255, 255] : [0, 0, 0]
      if (x < 2) return [255, 0, 0]
      return x === 2 ? [0, 0, 100] : [0, 0, 200]
    }),
  )!
  const cells = decodeCells(rasterCells(img, 2, 1))
  expect(cells).toEqual([
    [0x2580, 0xffffff, 0xff0000],
    [0x2580, 0x000000, 0x000096],
  ])
  // Bigger than the source: pixels repeat.
  expect(decodeCells(rasterCells(img, 8, 4)).length).toBe(32)
})

test('kit: withTile keeps at most 6, newest last, one per tag', async () => {
  let list = [textTile(1)]
  for (let n = 2; n <= 8; n++) list = withTile(list, textTile(n))
  expect(list.map(t => t.n)).toEqual([3, 4, 5, 6, 7, 8])
  expect(list.length).toBe(MAX_TILES)
  expect(withTile(list, textTile(5)).map(t => t.n)).toEqual([3, 4, 6, 7, 8, 5])
})

test('kit: the caption is the tag and the image size, or the tag alone', async () => {
  expect(captionOf({ n: 2, w: 1376, h: 1584, columns: 24, rows: 14, cells: 'x' })).toBe('[Image #2] 1376x1584')
  expect(captionOf(textTile(3))).toBe('[Image #3]')
})

test('kit: /img words', async () => {
  expect(parseArgs('')).toEqual({ kind: 'show' })
  expect(parseArgs('5')).toEqual({ kind: 'draw', n: 5 })
  expect(parseArgs('#12')).toEqual({ kind: 'draw', n: 12 })
  expect(parseArgs('0')).toEqual({ kind: 'usage' })
  expect(parseArgs('ON')).toEqual({ kind: 'on' })
  expect(parseArgs('off')).toEqual({ kind: 'off' })
  expect(parseArgs('clear')).toEqual({ kind: 'clear' })
  expect(parseArgs('1 2')).toEqual({ kind: 'usage' })
  expect(parseArgs('maybe')).toEqual({ kind: 'usage' })
})

test('kit: shrinkTile keeps the shape and samples the nearest cell', () => {
  const words = new Uint32Array(4 * 6 * 3)
  for (let i = 0; i < 4 * 6; i++) { words[i * 3] = 0x2580; words[i * 3 + 1] = i; words[i * 3 + 2] = 100 + i }
  const tile = { n: 1, w: 40, h: 120, columns: 4, rows: 6, cells: toBase64(new Uint8Array(words.buffer)) }
  const small = shrinkTile(tile, 3)
  expect([small.columns, small.rows]).toEqual([2, 3])
  const out = new Uint32Array(fromBase64(small.cells).buffer)
  expect(out.length).toBe(2 * 3 * 3)
  expect(out[0]).toBe(0x2580)
  expect(out[1]).toBe(0) // row 0, col 0 of the source
  expect(out[4]).toBe(2) // row 0, col 2 of the source
  expect(shrinkTile(tile, 6)).toBe(tile)
})
