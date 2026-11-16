import { expect, test } from 'claude-code/testing'

import { CHIP } from './kit'
import { MACHINE, PMSET_NO_BATTERY, lineRuns, lineText, mountRow, world } from './test-kit'

const at = (load: string) => ({ ...MACHINE, loadavg: `{ ${load} 1.00 1.00 }\n` })

test('row: chip in teal, CPU, RAM and battery with 6-cell bars, framed btop button', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} CPU 6% ▰▱▱▱▱▱ · RAM 19.8/64G ▰▰▱▱▱▱ · ⚡ 64%`)
  expect(runs[0]).toEqual({ text: ' ▣ SYS     ', color: '#0b0b0f', bg: '#2dd4bf', bold: true, dim: false })
  expect(runs.find(r => r.text === '▱▱▱▱▱')?.dim).toBe(true)
  // The battery at 64%, discharging: the default colour.
  expect(runs.find(r => r.text === '⚡ 64%')?.color).toBeUndefined()
  const ui = await mountRow($)
  const button = await ui.find({ key: 'sys-btop' })
  expect(button?.props.label).toBe('btop')
  expect(button?.props.plain).toBeUndefined()
  await ui.unmount()
})

test('row: the CPU bar is green at 6%, amber at 85%, red at 97%', async ($, on) => {
  const w = await world($, on, { machine: at('0.60') })
  await w.start()
  let runs = await lineRuns($)
  expect(runs.find(r => r.text === '6%')?.color).toBe('#22c55e')
  expect(runs.find(r => r.text === '▰')?.color).toBe('#22c55e')

  w.setMachine(at('8.50'))
  await w.clock.advance(5_000)
  runs = await lineRuns($)
  expect(lineText(runs)).toContain('CPU 85% ▰▰▰▰▰▱')
  expect(runs.find(r => r.text === '85%')?.color).toBe('#f59e0b')
  expect(runs.find(r => r.text === '▰▰▰▰▰')?.color).toBe('#f59e0b')

  w.setMachine(at('9.70'))
  await w.clock.advance(5_000)
  runs = await lineRuns($)
  expect(lineText(runs)).toContain('CPU 97% ▰▰▰▰▰▰')
  expect(runs.find(r => r.text === '97%')?.color).toBe('#ef4444')
  expect(runs.find(r => r.text === '▰▰▰▰▰▰')?.color).toBe('#ef4444')
})

test('row: the battery segment is left out when pmset reports no percent', async ($, on) => {
  const w = await world($, on, { machine: { ...MACHINE, pmset: PMSET_NO_BATTERY } })
  await w.start()
  expect(lineText(await lineRuns($))).toBe(`${CHIP} CPU 6% ▰▱▱▱▱▱ · RAM 19.8/64G ▰▰▱▱▱▱`)
})

test('row: the battery is red under 15% while discharging', async ($, on) => {
  const pmset = " -InternalBattery-0 (id=1)\t12%; discharging; 0:40 remaining present: true"
  const w = await world($, on, { machine: { ...MACHINE, pmset } })
  await w.start()
  expect((await lineRuns($)).find(r => r.text === '⚡ 12%')).toMatchObject({ color: '#ef4444', bold: true })
})

test('row: draws above another band and nests it beneath', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'sys-line' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: 'beneath' })).length).toBe(1)
  await ui.unmount()
})

test('row: never nests the engine placeholder', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'sys-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: yields to a survey, to another surface, and before the first reading', async ($, on) => {
  const w = await world($, on)
  // Not started: no reading yet; only the band beneath draws.
  let ui = await mountRow($)
  expect(await ui.find({ key: 'sys-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: 'beneath' })).length).toBe(1)
  await ui.unmount()
  await w.start()
  ui = await mountRow($, 160, true)
  expect(await ui.find({ key: 'sys-line' })).toBeUndefined()
  await ui.unmount()
  ui = await mountRow($, 160, false, 'desktop')
  expect(await ui.find({ key: 'sys-line' })).toBeUndefined()
  await ui.unmount()
})

test('row: a narrow band drops the bars, then the battery', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // 60 columns: 60 - 9 (button) - 11 (chip) = 40 for the figures.
  expect(lineText(await lineRuns($, 60))).toBe(`${CHIP} CPU 6% · RAM 19.8/64G · ⚡ 64%`)
  expect(lineText(await lineRuns($, 46))).toBe(`${CHIP} CPU 6% · RAM 19.8/64G`)
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
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const ui = await mountRow($)
  const tree = await ui.drawn()
  expect((tree as { props?: { key?: unknown } }).props?.key).toBe('zm-10-sys')
  expect(zmKeys(tree)).toEqual(['zm-10-sys'])
  expect(await ui.find({ key: 'sys-line' })).toBeDefined()
  await ui.unmount()
})
