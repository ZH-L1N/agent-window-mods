import { expect, test } from 'claude-code/testing'

import {
  AMBER,
  GREEN,
  RED,
  barCells,
  batteryColor,
  cpuPercent,
  levelColor,
  memUsedBytes,
  paneIdOf,
  parseBattery,
  parseLoad,
  parsePositiveInt,
  ramText,
  readingSegs,
  readingText,
  stackKey,
  stackOrderOf,
  stackRow,
  widthOf,
} from './kit'
import { GIB, MACHINE, PMSET_DISCHARGING, PMSET_NO_BATTERY, vmStat } from './test-kit'

test('kit: load over cores, truncated as the monitor does', () => {
  expect(parseLoad('{ 2.12 1.59 1.46 }')).toBe(2.12)
  expect(parseLoad('')).toBeNull()
  expect(parsePositiveInt('18\n')).toBe(18)
  expect(parsePositiveInt('0')).toBeNull()
  expect(parsePositiveInt('x')).toBeNull()
  expect(cpuPercent(2.12, 18)).toBe(11)
  expect(cpuPercent(0.6, 10)).toBe(6)
  expect(cpuPercent(8.5, 10)).toBe(85)
  expect(cpuPercent(9.7, 10)).toBe(97)
  expect(cpuPercent(24, 10)).toBe(240)
})

test('kit: RAM is active + wired + compressor pages times the header page size, over hw.memsize', () => {
  // (1,000,000 + 200,000 + 100,000) x 16384 = 21,299,200,000 bytes = 19.8 GiB.
  expect(memUsedBytes(vmStat(1_000_000, 200_000, 100_000))).toBe(21_299_200_000)
  expect(ramText({ used: 21_299_200_000, total: 64 * GIB })).toBe('19.8/64G')
  // No header: 4096-byte pages.
  const bare = 'Pages active: 10.\nPages wired down: 5.\nPages occupied by compressor: 1.\n'
  expect(memUsedBytes(bare)).toBe(16 * 4096)
  // A line missing: no figure, as the monitor gives none.
  expect(memUsedBytes('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages active: 10.\n')).toBeNull()
})

test('kit: the battery from pmset; none without a percent; discharging is not charging', () => {
  expect(parseBattery(PMSET_DISCHARGING)).toEqual({ percent: 64, isCharging: false })
  expect(parseBattery(" -InternalBattery-0 (id=1)\t80%; charging; 1:00 remaining present: true")).toEqual({ percent: 80, isCharging: true })
  expect(parseBattery(" -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true")).toEqual({ percent: 100, isCharging: true })
  expect(parseBattery(" -InternalBattery-0 (id=1)\t90%; AC attached; not charging present: true")).toEqual({ percent: 90, isCharging: false })
  expect(parseBattery(PMSET_NO_BATTERY)).toBeNull()
})

test('kit: green under 80%, amber from 80%, red from 95%; battery red under 15% only when not charging', () => {
  expect(levelColor(6)).toBe(GREEN)
  expect(levelColor(79.9)).toBe(GREEN)
  expect(levelColor(80)).toBe(AMBER)
  expect(levelColor(85)).toBe(AMBER)
  expect(levelColor(95)).toBe(RED)
  expect(levelColor(97)).toBe(RED)
  expect(batteryColor({ percent: 14, isCharging: false })).toBe(RED)
  expect(batteryColor({ percent: 14, isCharging: true })).toBeUndefined()
  expect(batteryColor({ percent: 15, isCharging: false })).toBeUndefined()
})

test('kit: the 6-cell bar has one cell above 0% and six from 100%', () => {
  expect(barCells(0)).toBe(0)
  expect(barCells(6)).toBe(1)
  expect(barCells(45)).toBe(3)
  expect(barCells(85)).toBe(5)
  expect(barCells(97)).toBe(6)
  expect(barCells(240)).toBe(6)
})

test('kit: segments drop the bars, then the battery, when the columns are short', () => {
  const r = { cpu: 6, ram: { used: 21_299_200_000, total: 64 * GIB }, battery: { percent: 64, isCharging: false }, readAt: 0 }
  const text = (room: number) => readingSegs(r, room).map(s => s.text).join('')
  expect(text(200)).toBe(' CPU 6% ▰▱▱▱▱▱ · RAM 19.8/64G ▰▰▱▱▱▱ · ⚡ 64%')
  expect(text(40)).toBe(' CPU 6% · RAM 19.8/64G · ⚡ 64%')
  expect(text(26)).toBe(' CPU 6% · RAM 19.8/64G')
  expect(widthOf(readingSegs(r, 26))).toBeLessThanOrEqual(26)
  expect(readingSegs(null, 200)).toEqual([])
  expect(readingSegs({ cpu: null, ram: null, battery: null, readAt: 0 }, 200)).toEqual([])
  expect(readingText(r)).toBe('CPU 6% · RAM 19.8/64G (31%) · ⚡ 64% (not charging)')
})

test('kit: the pane id from herdr pane split\'s JSON', () => {
  expect(paneIdOf(MACHINE.split!)).toBe('w1:p9')
  expect(paneIdOf('{"result":{}}')).toBeNull()
  expect(paneIdOf('not json')).toBeNull()
})

// The stack-order helper (canonical copy in the building-claude-code-mods skill).
const box = (key: string, extra: Record<string, unknown> = {}) => ({ type: 'Box', props: { key }, children: [], ...extra }) as never
const keysOf = (tree: unknown): string[] =>
  (((tree as { children?: unknown[] }).children ?? []) as { props?: { key?: string } }[]).map(c => c.props?.key ?? '')

test('kit: stackKey and stackOrderOf read the zm-<order>-<name> keys', () => {
  expect(stackKey('sys')).toBe('zm-10-sys')
  expect(stackKey('next')).toBe('zm-80-next')
  expect(stackOrderOf(box('zm-40-cache'))).toBe(40)
  expect(stackOrderOf(box('zm-stack'))).toBeNull()
  expect(stackOrderOf(box('other'))).toBeNull()
  expect(stackOrderOf('text')).toBeNull()
})

test('kit: stackRow: nothing beneath, a failed next or the engine placeholder: the row alone', () => {
  const row = box('zm-10-sys')
  expect(stackRow(row, null)).toBe(row)
  expect(stackRow(row, { type: 'engine', ref: 0 })).toBe(row)
})

test('kit: stackRow: one zm row beneath (not in a column) is sorted with this one', () => {
  const tree = stackRow(box('zm-30-handoff'), box('zm-10-sys'))
  expect(keysOf(tree)).toEqual(['zm-10-sys', 'zm-30-handoff'])
  expect(tree).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } })
})

test('kit: stackRow: another mod\'s Box with its own props is kept whole, after the row', () => {
  const framed = { type: 'Box', props: { flexDirection: 'column', borderStyle: 'round' }, children: [box('zm-60-goal')] } as never
  expect(keysOf(stackRow(box('zm-10-sys'), framed))).toEqual(['zm-10-sys', ''])
})

test('kit: stackRow: the column\'s mark moves to its one unmarked row, never copied', () => {
  const below = {
    type: 'Box',
    props: { flexDirection: 'column' },
    part: { plugin: 'goal-meter' },
    children: [box('zm-10-sys', { part: { plugin: 'sys' } }), box('zm-60-goal'), box('other', { part: { plugin: 'x' } })],
  }
  const tree = stackRow(box('zm-50-agents'), below) as unknown as { children: { props: { key: string }; part?: { plugin: string } }[] }
  expect(tree.children.map(c => [c.props.key, c.part?.plugin])).toEqual([
    ['zm-10-sys', 'sys'],
    ['zm-50-agents', undefined],
    ['zm-60-goal', 'goal-meter'],
    ['other', 'x'],
  ])
})
