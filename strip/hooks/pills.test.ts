import { describe, expect, test } from 'claude-code/testing'

import { C, CAP_L, CAP_R, ICON, PILL_IDS, WORK_W, cellWidth, fitStrip, pillsAt, stripText, stripWidth } from './pills'
import type { Facts, Level, Pill, PillId } from './pills'

const QUIET: Facts = {
  stop: null,
  context: { pct: 12 },
  cacheLeftMs: null,
  diff: 0,
  tests: null,
  agents: 0,
  queue: { count: 0, isPaused: false },
  sys: { ram: 50, cpu: 10 },
  peers: { count: 0, waiting: 0 },
  health: null,
}

/** Something on every pill, so each level has something to shorten. */
const BUSY: Facts = {
  stop: { summary: 'ctl move --axis 1 on rig-1.local' },
  context: { pct: 71 },
  cacheLeftMs: 4 * 60_000,
  diff: 6,
  tests: { failed: 2, total: 14 },
  agents: 3,
  queue: { count: 2, isPaused: true },
  sys: { ram: 92, cpu: 95 },
  peers: { count: 4, waiting: 1 },
  health: { text: 'login expired' },
}

const by = (pills: readonly Pill[], id: PillId): Pill => {
  const p = pills.find(x => x.id === id)
  if (!p) throw new Error(`no ${id} pill`)
  return p
}
/** A pill's text after its icon. */
const words = (p: Pill): string =>
  p.segs
    .slice(1)
    .map(s => s.text)
    .join('')
const one = (f: Partial<Facts>, id: PillId, level: Level = 0): Pill => by(pillsAt({ ...QUIET, ...f }, level), id)

describe('pills', () => {
  test('a quiet session', async () => {
    const pills = pillsAt(QUIET, 0)
    expect(pills.map(p => p.id)).toEqual(['context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers'])
    expect(by(pills, 'context').color).toBe(C.green)
    for (const id of ['cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers'] as const) {
      expect(by(pills, id).color).toBe(C.dim)
    }
    expect(pills.some(p => p.isAttention)).toBe(false)
    expect(stripText(pills)).toBe(
      [
        `${CAP_L}${ICON.context}\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1 12%${CAP_R}`,
        `${CAP_L}${ICON.cache}\u2013${CAP_R}`,
        `${CAP_L}${ICON.diff}0${CAP_R}`,
        `${CAP_L}${ICON.tests}\u2013${CAP_R}`,
        `${CAP_L}${ICON.agents}0${CAP_R}`,
        `${CAP_L}${ICON.queue}0${CAP_R}`,
        `${CAP_L}${ICON.system}${CAP_R}`,
        `${CAP_L}${ICON.peers}0${CAP_R}`,
      ].join(' '),
    )
    // The bar's empty cells are dim on an idle pill.
    expect(by(pills, 'context').segs.some(s => s.text.includes('\u25b1') && s.color === C.dim)).toBe(true)
  })

  test('the pill ids, in their order', async () => {
    expect([...PILL_IDS]).toEqual(['stop', 'context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers', 'health'])
    expect(pillsAt(BUSY, 0).map(p => p.id)).toEqual([...PILL_IDS])
  })

  test('thresholds', async () => {
    const want: [number, string, boolean][] = [
      [29, C.green, false],
      [30, C.yellow, false],
      [59, C.yellow, false],
      [60, C.peach, false],
      [79, C.peach, false],
      [80, C.red, true],
    ]
    for (const [pct, color, isAttention] of want) {
      const p = one({ context: { pct } }, 'context')
      expect(p.color).toBe(color)
      expect(p.isAttention).toBe(isAttention)
    }
    // At least one filled cell above 0, none at 0, the bar gone from level 1.
    expect(words(one({ context: { pct: 1 } }, 'context'))).toBe('\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1 1%')
    expect(words(one({ context: { pct: 0 } }, 'context'))).toBe('\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1 0%')
    expect(words(one({ context: { pct: 42 } }, 'context', 1))).toBe('42%')
    expect(words(one({ context: { pct: 42 } }, 'context', 3))).toBe('42%')
    const none = one({ context: null }, 'context')
    expect(words(none)).toBe('\u2013')
    expect(none.color).toBe(C.dim)
  })

  test('cache', async () => {
    const warm = one({ cacheLeftMs: 59 * 60_000 + 10_000 }, 'cache')
    expect(words(warm)).toBe('60m')
    expect(warm.color).toBe(C.teal)
    const low = one({ cacheLeftMs: 9 * 60_000 }, 'cache')
    expect(words(low)).toBe('9m')
    expect(low.color).toBe(C.yellow)
    const cold = one({ cacheLeftMs: 0 }, 'cache')
    expect(words(cold)).toBe('cold')
    expect(cold.color).toBe(C.dim)
    const none = one({ cacheLeftMs: null }, 'cache')
    expect(words(none)).toBe('\u2013')
    expect(none.color).toBe(C.dim)
  })

  test('tests', async () => {
    const none = one({ tests: null }, 'tests')
    expect(words(none)).toBe('\u2013')
    expect(none.color).toBe(C.dim)
    const green = one({ tests: { failed: 0, total: 14 } }, 'tests')
    expect(words(green)).toBe('14')
    expect(green.color).toBe(C.green)
    expect(green.isAttention).toBe(false)
    expect(green.segs[0]?.text).toBe(ICON.tests)
    const red = one({ tests: { failed: 2, total: 14 } }, 'tests')
    expect(words(red)).toBe('tests 2/14')
    expect(red.color).toBe(C.red)
    expect(red.isAttention).toBe(true)
    expect(red.segs[0]?.text).toBe(ICON.testsFailing)
    expect(words(one({ tests: { failed: 2, total: 14 } }, 'tests', 2))).toBe('2/14')
  })

  test('counts: diff, agents and queue take their colour above 0', async () => {
    expect(one({ diff: 3 }, 'diff').color).toBe(C.mauve)
    expect(words(one({ diff: 3 }, 'diff'))).toBe('3')
    expect(one({ agents: 2 }, 'agents').color).toBe(C.sapphire)
    expect(one({ queue: { count: 3, isPaused: false } }, 'queue').color).toBe(C.lavender)
    expect(words(one({ queue: { count: 3, isPaused: false } }, 'queue'))).toBe('3')
  })

  test('queue paused', async () => {
    const p = one({ queue: { count: 2, isPaused: true } }, 'queue')
    expect(words(p)).toBe('2 paused')
    expect(p.color).toBe(C.yellow)
    expect(p.isAttention).toBe(false)
    expect(words(one({ queue: { count: 2, isPaused: true } }, 'queue', 2))).toBe('2')
    expect(one({ queue: { count: 2, isPaused: true } }, 'queue', 2).color).toBe(C.yellow)
    // Paused with nothing in it is an empty queue.
    const empty = one({ queue: { count: 0, isPaused: true } }, 'queue')
    expect(words(empty)).toBe('0')
    expect(empty.color).toBe(C.dim)
  })

  test('system both at once', async () => {
    const both = one({ sys: { ram: 92, cpu: 95 } }, 'system')
    expect(words(both)).toBe('RAM 92% CPU 95%')
    expect(both.color).toBe(C.red)
    expect(both.isAttention).toBe(true)
    expect(words(one({ sys: { ram: 92, cpu: 40 } }, 'system'))).toBe('RAM 92%')
    expect(words(one({ sys: { ram: 10, cpu: 90 } }, 'system'))).toBe('CPU 90%')
    expect(words(one({ sys: { ram: 92, cpu: 95 } }, 'system', 3))).toBe('92% 95%')
    // Fine, or no reading: the icon alone, dim.
    for (const sys of [{ ram: 89, cpu: 89 }, { ram: null, cpu: null }, null]) {
      const p = one({ sys }, 'system')
      expect(words(p)).toBe('')
      expect(p.color).toBe(C.dim)
      expect(p.isAttention).toBe(false)
    }
  })

  test('peers waiting', async () => {
    const p = one({ peers: { count: 4, waiting: 1 } }, 'peers')
    expect(words(p)).toBe('4 \xb7 1 waiting')
    expect(p.color).toBe(C.peach)
    expect(p.isAttention).toBe(false)
    expect(words(one({ peers: { count: 4, waiting: 1 } }, 'peers', 2))).toBe('4\xb71')
    expect(words(one({ peers: { count: 4, waiting: 0 } }, 'peers'))).toBe('4')
    expect(one({ peers: { count: 0, waiting: 0 } }, 'peers').color).toBe(C.dim)
  })

  test('health', async () => {
    const p = one({ health: { text: 'login expired' } }, 'health')
    expect(words(p)).toBe('login expired')
    expect(p.color).toBe(C.red)
    expect(p.isAttention).toBe(true)
    expect(words(one({ health: { text: 'login expired' } }, 'health', 3))).toBe('login')
    expect(pillsAt(QUIET, 0).some(x => x.id === 'health')).toBe(false)
  })

  test('stop first', async () => {
    const pills = pillsAt({ ...QUIET, stop: { summary: 'ctl move on rig-1.local' } }, 0)
    expect(pills[0]?.id).toBe('stop')
    expect(words(pills[0]!)).toBe('STOP')
    expect(pills[0]?.color).toBe(C.red)
    expect(pills[0]?.isAttention).toBe(true)
    expect(words(by(pillsAt({ ...QUIET, stop: { summary: 'x' } }, 3), 'stop'))).toBe('STOP')
  })

  test('fit levels', async () => {
    const widths = ([0, 1, 2, 3] as const).map(l => stripWidth(pillsAt(BUSY, l)))
    for (let i = 1; i < widths.length; i++) expect(widths[i]! < widths[i - 1]!).toBe(true)
    expect(fitStrip(BUSY, 200, 0).level).toBe(0)
    expect(stripText(fitStrip(BUSY, 200, 0).pills)).toContain('\u25b0')
    // Narrowing drops the bar, then the words, then to numbers.
    const l1 = fitStrip(BUSY, widths[0]! - 1, 0)
    expect(l1.level).toBe(1)
    expect(stripText(l1.pills)).not.toContain('\u25b0')
    expect(stripText(l1.pills)).toContain('tests 2/14')
    const l2 = fitStrip(BUSY, widths[1]! - 1, 0)
    expect(l2.level).toBe(2)
    expect(stripText(l2.pills)).not.toContain('tests')
    expect(stripText(l2.pills)).not.toContain('paused')
    expect(stripText(l2.pills)).toContain('RAM 92%')
    const l3 = fitStrip(BUSY, widths[2]! - 1, 0)
    expect(l3.level).toBe(3)
    expect(stripText(l3.pills)).not.toContain('RAM')
    expect(stripText(l3.pills)).not.toContain('expired')
    // Each result fits its columns.
    for (let cols = widths[3]!; cols <= 200; cols++) {
      expect(stripWidth(fitStrip(BUSY, cols, 0).pills) <= cols).toBe(true)
    }
    // The working pill's cells are kept free.
    expect(fitStrip(BUSY, widths[0]!, 0).level).toBe(0)
    expect(fitStrip(BUSY, widths[0]!, WORK_W).level).toBe(1)
    expect(stripWidth(fitStrip(BUSY, widths[0]!, WORK_W).pills) <= widths[0]! - WORK_W).toBe(true)
  })

  test('overflow drops idle pills from the right', async () => {
    const f: Facts = { ...QUIET, tests: { failed: 2, total: 14 }, diff: 3, agents: 1 }
    const full = stripWidth(pillsAt(f, 3))
    const ids = (cols: number): PillId[] => fitStrip(f, cols, 0).pills.map(p => p.id)
    expect(ids(full)).toEqual(['context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system', 'peers'])
    // Peers goes first, then system, queue, agents, diff and cache; the failing tests pill stays.
    expect(ids(full - 1)).toEqual(['context', 'cache', 'diff', 'tests', 'agents', 'queue', 'system'])
    let cols = full - 1
    const gone: PillId[] = []
    let before = ids(cols)
    while (cols > 0) {
      cols -= 1
      const now = ids(cols)
      for (const id of before) if (!now.includes(id)) gone.push(id)
      before = now
    }
    expect(gone).toEqual(['system', 'queue', 'agents', 'diff', 'cache'])
    expect(ids(1)).toEqual(['context', 'tests'])
    for (let c = stripWidth(fitStrip(f, 1, 0).pills); c <= full; c++) {
      expect(stripWidth(fitStrip(f, c, 0).pills) <= c).toBe(true)
    }
    // An idle tests pill is dropped in its turn, after agents.
    const idle: Facts = { ...QUIET, diff: 3 }
    expect(fitStrip(idle, 1, 0).pills.map(p => p.id)).toEqual(['context'])
    // An attention system pill stays while the idle ones to its left go.
    const hot: Facts = { ...QUIET, sys: { ram: 95, cpu: 10 }, stop: { summary: 'x' }, health: { text: 'limit reached' } }
    expect(fitStrip(hot, 1, 0).pills.map(p => p.id)).toEqual(['stop', 'context', 'system', 'health'])
  })

  test('wide characters', async () => {
    expect(cellWidth('\u4e0a\u4e0b\u6587')).toBe(6)
    expect(cellWidth(ICON.context)).toBe(1)
    expect(cellWidth(CAP_L + ICON.testsFailing + CAP_R)).toBe(3)
    expect(cellWidth('\u25b0\u25b1\u2502\u2588')).toBe(4)
    expect(cellWidth('\uff21')).toBe(2)
    expect(cellWidth('e\u0301')).toBe(1)
    expect(cellWidth('\u{1f600}')).toBe(2)
    expect(cellWidth('abc 42%')).toBe(7)
    // A pill's width is its caps and its text; the strip adds one space between pills.
    const pills = pillsAt(QUIET, 1)
    expect(stripWidth(pills)).toBe(cellWidth(stripText(pills)))
  })
})
