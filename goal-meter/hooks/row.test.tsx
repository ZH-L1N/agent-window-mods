import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CHIP, cellsOf } from './kit'
import { MIN, childKeys, lineRuns, lineText, mountRow, world } from './test-kit'
import type { WorldShape } from './test-kit'

// Four tasks made with TaskCreate; the first two take 5 minutes each, the third runs.
async function halfway($: Engine, on: On, shape: WorldShape = {}) {
  const w = await world($, on, shape)
  await w.start()
  await w.prompt('Build the mods\nthe GOAL row and its pane')
  const ids = [await w.create('Write the plan'), await w.create('Write the row'), await w.create('Write the deck'), await w.create('Test it')]
  await w.set(ids[0]!, 'in_progress')
  await w.clock.advance(5 * MIN)
  await w.set(ids[0]!, 'completed')
  await w.set(ids[1]!, 'in_progress')
  await w.clock.advance(5 * MIN)
  await w.set(ids[1]!, 'completed')
  await w.set(ids[2]!, 'in_progress')
  return { w, ids }
}

test('row: 4 tasks, 2 finished: 2/4 · 50%, ETA from the average, the running task, above another mod\'s line', async ($, on) => {
  await halfway($, on)
  const runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} Build the mods ▰▰▰▱▱▱ 2/4 · 50% · 10m · ETA ~10m │ ▶ Write the deck`)
  expect(runs[0]).toEqual({ text: CHIP, color: '#0b0b0f', bg: '#facc15', bold: true, dim: false })
  expect(runs.find(r => r.text === '▰▰▰')?.color).toBe('#22c55e')
  expect(runs.find(r => r.text === '▱▱▱')?.dim).toBe(true)
  // Composition: the row first, the band beneath once, under it.
  const ui = await mountRow($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: no ETA before the first finish; the first pending task when none runs', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Tidy the docs')
  await w.todo([
    ['Read the docs', 'pending'],
    ['Fix the links', 'pending'],
  ])
  await w.clock.advance(3 * MIN)
  expect(lineText(await lineRuns($))).toBe(`${CHIP} Tidy the docs ▱▱▱▱▱▱ 0/2 · 0% · 3m │ ▶ Read the docs`)
})

test('row: amber when the running task has taken twice the average, its minutes after it', async ($, on) => {
  const { w } = await halfway($, on)
  // Average 5m: at 9m the running task is still green.
  await w.clock.advance(9 * MIN)
  let runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} Build the mods ▰▰▰▱▱▱ 2/4 · 50% · 19m · ETA ~10m │ ▶ Write the deck`)
  expect(runs.find(r => r.text === '▰▰▰')?.color).toBe('#22c55e')
  await w.clock.advance(1 * MIN)
  runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} Build the mods ▰▰▰▱▱▱ 2/4 · 50% · 20m · ETA ~10m │ ▶ Write the deck 10m`)
  expect(runs.find(r => r.text === '▰▰▰')?.color).toBe('#f59e0b')
  expect(runs.find(r => r.text === '▶ Write the deck')?.color).toBe('#f59e0b')
  expect(runs.find(r => r.text === ' 10m')).toMatchObject({ color: '#f59e0b', bold: true })
})

test('row: all done reads done ✓ in green for two minutes, then hides', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Ship it')
  await w.todo([
    ['Build', 'in_progress'],
    ['Release', 'pending'],
  ])
  await w.clock.advance(4 * MIN)
  await w.todo([
    ['Build', 'completed'],
    ['Release', 'in_progress'],
  ])
  await w.clock.advance(8 * MIN)
  await w.todo([
    ['Build', 'completed'],
    ['Release', 'completed'],
  ])
  const runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} Ship it ▰▰▰▰▰▰ 2/2 · done ✓ in 12m`)
  expect(runs.find(r => r.text === 'done ✓ in 12m')).toMatchObject({ color: '#22c55e', bold: true })
  expect(runs.find(r => r.text === '▰▰▰▰▰▰')?.color).toBe('#22c55e')
  await w.clock.advance(2 * MIN - 1_000)
  expect(lineText(await lineRuns($))).toContain('done ✓ in 12m')
  await w.clock.advance(1_000)
  expect(await lineRuns($)).toEqual([])
  const ui = await mountRow($)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: a long first line is cut to 50 characters', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('  \nPlease build the goal meter mod with a row, a pane and a history of goals\nmore')
  await w.todo([['One', 'pending']])
  const name = (await lineRuns($)).find(r => r.text.startsWith('Please'))?.text ?? ''
  expect([...name]).toHaveLength(50)
  expect(name).toBe('Please build the goal meter mod with a row, a pan…')
})

test('row: a narrow band shortens the name, and the line truncates at its end', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Please build the goal meter mod with a row and a pane')
  await w.todo([['One', 'in_progress']])
  const runs = await lineRuns($, 60)
  expect(runs.find(r => r.bold && r.text.startsWith('Please'))?.text).toBe('Please build the goal m…')
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  await halfway($, on)
  const survey = await mountRow($, 160, true)
  expect(await survey.find({ key: 'goal-line' })).toBeUndefined()
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
  const desktop = await mountRow($, 160, false, 'desktop')
  expect(await desktop.find({ key: 'goal-line' })).toBeUndefined()
  await desktop.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws, handed on when it has nothing', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(await empty.find({ key: 'goal-line' })).toBeUndefined()
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  await w.todo([['One', 'pending']])
  const ui = await mountRow($)
  expect(await ui.find({ key: 'goal-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: band=off draws nothing of its own', { options: { band: 'off' } }, async ($, on) => {
  await halfway($, on)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'goal-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: a Chinese name is measured in terminal columns, so the running task still fits', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('目标进度条模组'.repeat(6))
  await w.todo([['Write it', 'in_progress']])
  // The stored name is cut to 50 columns: 24 wide characters and the ellipsis.
  const name = (w.state('goal') as { name: string }).name
  expect(cellsOf(name)).toBeLessThanOrEqual(50)
  expect(name).toBe(`${'目标进度条模组'.repeat(4).slice(0, 24)}…`)
  // At 80 columns the short name is used and the whole row fits, '▶ Write it' included.
  const runs = await lineRuns($, 80)
  expect(runs.find(r => r.text === '▶ Write it')).toBeDefined()
  expect(cellsOf(lineText(runs))).toBeLessThanOrEqual(80)
  expect(runs.find(r => r.bold && r.text.startsWith('目标'))?.text).toBe('目标进度条模组目标进度…')
})

test('row: stack order: the row takes GOAL 60 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  await halfway($, on, { stackBeneath: ['zm-80-next', 'zm-10-sys'] })
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-60-goal', 'zm-80-next', 'other-band'])
  expect(await ui.find({ key: 'goal-line' })).toBeDefined()
  await ui.unmount()
})
