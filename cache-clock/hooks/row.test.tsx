import { expect, test } from 'claude-code/testing'

import { CHIP } from './kit'
import { MIN, childKeys, lineRuns, lineText, mountRow, usage, world } from './test-kit'

// Opus 5.5, 180k cached (169.2k read, 10.8k written), no fresh input: 94% reused.
const OPUS = usage('claude-opus-5-5', 0, 169_200, 10_800)

test('row: the deck\'s line at 52 minutes left, chip in cyan, bar green, framed Compact button', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(8 * MIN)
  const runs = await lineRuns($)
  // Opus 5.5 1-hour cache write $8/MTok: 180k x 8 / 1e6 = $1.44.
  expect(lineText(runs)).toBe(`${CHIP} warm 52m ▰▰▰▰▰▱ 94% reused · 180k cached · rewrite ≈ $1.44`)
  expect(runs[0]).toEqual({ text: CHIP, color: '#0b0b0f', bg: '#22d3ee', bold: true, dim: false })
  expect(runs.find(r => r.text === 'warm 52m')?.color).toBe('#22c55e')
  expect(runs.find(r => r.text === '▰▰▰▰▰')?.color).toBe('#22c55e')
  expect(runs.find(r => r.text === '▱')?.dim).toBe(true)
  const ui = await mountRow($)
  const button = await ui.find({ key: 'cache-compact' })
  expect(button?.props.label).toBe('Compact')
  expect(button?.props.hotkey).toBeUndefined()
  expect(button?.props.plain).toBeUndefined()
  await ui.unmount()
})

test('row: green at 16 minutes left, amber at 15, red and cold at 0', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(44 * MIN)
  let runs = await lineRuns($)
  expect(runs.find(r => r.text.startsWith('warm'))).toMatchObject({ text: 'warm 16m', color: '#22c55e' })
  expect(runs.find(r => r.text === '▰▰')?.color).toBe('#22c55e')
  await w.clock.advance(1 * MIN)
  runs = await lineRuns($)
  expect(runs.find(r => r.text.startsWith('warm'))).toMatchObject({ text: 'warm 15m', color: '#f59e0b' })
  expect(runs.find(r => r.text === '▰▰')?.color).toBe('#f59e0b')
  await w.clock.advance(15 * MIN)
  runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} COLD ▱▱▱▱▱▱ 180k to rewrite ≈ $1.44 on next send`)
  expect(runs.find(r => r.text === 'COLD')).toMatchObject({ color: '#ef4444', bold: true })
  expect(runs.find(r => r.text === '▱▱▱▱▱▱')?.dim).toBe(true)
  expect(runs.find(r => r.text.endsWith('on next send'))?.color).toBe('#ef4444')
})

test('row: an unknown model\'s rewrite reads ≈ ?', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(usage('claude-mystery-9', 20_000, 60_000, 20_000))
  // 60k / (60k + 20k + 20k) = 60% reused; 80k cached.
  expect(lineText(await lineRuns($))).toBe(`${CHIP} warm 60m ▰▰▰▰▰▰ 60% reused · 80k cached · rewrite ≈ ?`)
})

test('row: the 5-minute window: the bar is the time left of 5 minutes, the 5-minute write price', { options: { cacheMinutes: '5' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(2 * MIN + 30_000)
  const runs = await lineRuns($)
  // Opus 5.5 5-minute write $5/MTok: 180k x 5 / 1e6 = $0.90; 2m30s left of 5 is 3 cells, amber at 2m or under only.
  expect(lineText(runs)).toBe(`${CHIP} warm 3m ▰▰▰▱▱▱ 94% reused · 180k cached · rewrite ≈ $0.90`)
  expect(runs.find(r => r.text === 'warm 3m')?.color).toBe('#22c55e')
  await w.clock.advance(3 * MIN)
  expect(lineText(await lineRuns($))).toMatch(/COLD ▱▱▱▱▱▱ 180k to rewrite ≈ \$0\.90 on next send$/)
})

test('row: a narrow band drops % reused, then cached; the rewrite cost stays', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  const full = lineText(await lineRuns($, 200))
  const button = 'Compact'.length + 4 + 1
  const short = lineText(await lineRuns($, [...full].length + button - 1))
  expect(short).toBe(`${CHIP} warm 60m ▰▰▰▰▰▰ 180k cached · rewrite ≈ $1.44`)
  const shorter = lineText(await lineRuns($, [...short].length + button - 1))
  expect(shorter).toBe(`${CHIP} warm 60m ▰▰▰▰▰▰ rewrite ≈ $1.44`)
})

test('row: a narrow band shortens the cold line; the rewrite cost stays', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(61 * MIN)
  const button = 'Compact'.length + 4 + 1
  const full = lineText(await lineRuns($, 200))
  expect(full).toBe(`${CHIP} COLD ▱▱▱▱▱▱ 180k to rewrite ≈ $1.44 on next send`)
  const short = lineText(await lineRuns($, [...full].length + button - 1))
  expect(short).toBe(`${CHIP} COLD ▱▱▱▱▱▱ 180k to rewrite ≈ $1.44`)
  const shorter = lineText(await lineRuns($, [...short].length + button - 1))
  expect(shorter).toBe(`${CHIP} COLD ▱▱▱▱▱▱ rewrite ≈ $1.44`)
  // About 50 columns, a herdr split: the cost still fits.
  expect(lineText(await lineRuns($, 50))).toBe(`${CHIP} COLD ▱▱▱▱▱▱ rewrite ≈ $1.44`)
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  const survey = await mountRow($, 160, true)
  expect(await survey.find({ key: 'cache-line' })).toBeUndefined()
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
  const desktop = await mountRow($, 160, false, 'desktop')
  expect(await desktop.find({ key: 'cache-line' })).toBeUndefined()
  await desktop.unmount()
})

test('row: composes: another band draws beneath it, once', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  const ui = await mountRow($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws, handed on when it has nothing', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(await empty.find({ key: 'cache-line' })).toBeUndefined()
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  await w.step(OPUS)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'cache-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: band=off draws nothing of its own', { options: { band: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'cache-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: stack order: the row takes CACHE 40 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-60-goal', 'zm-10-sys'] })
  await w.start()
  await w.step(OPUS)
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-40-cache', 'zm-60-goal', 'other-band'])
  expect(await ui.find({ key: 'cache-line' })).toBeDefined()
  await ui.unmount()
})
