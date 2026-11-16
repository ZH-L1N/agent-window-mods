// Local change 3 (zehui-mods): the engine's test kit (claude-code/testing) instead of bun's runner.
import { describe, expect, test } from 'claude-code/testing'
// Local change 1 (zehui-mods): RANDOM_POOL is imported for the pool test.
import { ART_ROWS, RANDOM_POOL, STYLES, boxWidth, centre, frame, pickStyle, scaledHalf } from '../hooks/breath/shapes.ts'

const width = (line: string) => [...line].length

describe('shapes', () => {
  test('the box is the band less a margin, at most 60', () => {
    expect(boxWidth(80)).toBe(60)
    expect(boxWidth(40)).toBe(36)
    expect(boxWidth(2)).toBe(4)
  })

  test('a breath just begun still shows one cell', () => {
    expect(scaledHalf(0, 80)).toBe(0)
    expect(scaledHalf(1, 80)).toBe(1)
    expect(scaledHalf(1000, 80)).toBe(30)
  })

  // Local change 3 (zehui-mods): the kit has no test.each, so a loop declares one test per style.
  for (const style of STYLES) test(`${style}: empty at 0, within the box at 1000, rows as asked`, () => {
    const empty = frame(style, 0, 80)
    expect(empty).toHaveLength(ART_ROWS)
    expect(empty.every(line => line.trim() === '')).toBe(true)

    const full = frame(style, 1000, 80)
    expect(full).toHaveLength(ART_ROWS)
    expect(full.some(line => line.trim() !== '')).toBe(true)
    for (const line of full) {
      expect(width(line)).toBeLessThanOrEqual(80)
      // centred: at least the margin of blank cells on the left
      if (line.trim()) expect(line.length - line.trimStart().length).toBeGreaterThanOrEqual(10)
    }
  })

  test('pulse grows with the breath and mirrors', () => {
    const half = frame('pulse', 500, 80)
    const full = frame('pulse', 1000, 80)
    const mid = (f: string[]) => f[3]!.trim()
    expect(width(mid(half))).toBeLessThan(width(mid(full)))
    expect(width(mid(full))).toBe(60)
    expect(mid(full)).toBe([...mid(full)].reverse().join(''))
    expect(mid(full).startsWith('░▒▓█')).toBe(true)
  })

  test('ripples: the middle row is the widest, dashed rows fade outwards', () => {
    const f = frame('ripples', 1000, 80)
    expect(width(f[3]!.trim())).toBe(60)
    expect(f[3]!.trim()).toMatch(/^━+$/)
    expect(f[0]!.trim()).toMatch(/^┈+$/)
    expect(width(f[0]!.trim())).toBeLessThan(width(f[2]!.trim()))
  })

  test('dots: the centre star shows first, the far ones last', () => {
    const early = frame('dots', 100, 80).join('\n')
    const late = frame('dots', 1000, 80).join('\n')
    expect(early).toContain('✦')
    expect(early).not.toContain('·')
    expect(late).toContain('·')
  })

  test('wave: three rows of blocks, the peak in the middle', () => {
    const f = frame('wave', 1000, 80)
    expect(f[5]!.trim()).toMatch(/^[▁▂▃▄▅▆▇█]+$/)
    expect(f[3]!.trim()).toContain('█')
    expect(f[3]!.trim().length).toBeLessThan(f[5]!.trim().length)
  })

  test('sine: a braille wave above and below the middle, blank at 0', () => {
    const f = frame('sine', 1000, 80)
    expect(f.join('')).toMatch(/[⠀-⣿]/)
    expect(f.filter(line => line.trim() !== '').length).toBeGreaterThan(1)
    expect(frame('sine', 0, 80).every(line => line.trim() === '')).toBe(true)
  })

  test('sine and bloom grow with the breath', () => {
    const ink = (style: 'sine' | 'bloom', progress: number) =>
      frame(style, progress, 80).join('').replace(/ /g, '').length
    expect(ink('sine', 500)).toBeLessThan(ink('sine', 1000))
    expect(ink('bloom', 500)).toBeLessThan(ink('bloom', 1000))
  })

  test('the time-driven styles move with time', () => {
    for (const style of [
      'bubble',
      'heartbeat',
      'orbit',
      'spiral',
      'lissajous',
      'rain',
      'equalizer',
      'aurora',
      'circuit',
      'snow',
      'melody',
    ] as const) {
      expect(frame(style, 1000, 80, 7, 0)).not.toEqual(frame(style, 1000, 80, 7, 300))
    }
  })

  test('fewer rows show the middle of the picture; more pad it', () => {
    const three = frame('pulse', 1000, 80, 3)
    expect(three).toHaveLength(3)
    expect(three[1]!.trim()).toBe(frame('pulse', 1000, 80)[3]!.trim())
    const eleven = frame('pulse', 1000, 80, 11)
    expect(eleven).toHaveLength(11)
    expect(eleven[0]).toBe(' ')
  })

  test('a narrow band clips instead of throwing', () => {
    for (const style of STYLES) {
      const f = frame(style, 1000, 6)
      expect(f.every(line => width(line) <= 6)).toBe(true)
    }
  })

  // Local change 1 (zehui-mods): random draws only from RANDOM_POOL; `last` rotates through every style.
  test('random picks a style from the pool, other than the last', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const last = STYLES[i % STYLES.length]!
      const pick = pickStyle('random', last, Math.random)
      expect(RANDOM_POOL).toContain(pick)
      expect(pick).not.toBe(last)
      seen.add(pick)
    }
    expect(seen.size).toBe(3)
    expect(pickStyle('wave', 'wave')).toBe('wave')
  })

  test('centre pads on the left only', () => {
    expect(centre('ab', 10)).toBe('    ab')
    expect(centre('abc', 2)).toBe('abc')
  })
})
