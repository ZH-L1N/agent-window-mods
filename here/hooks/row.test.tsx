import { expect, test } from 'claude-code/testing'

import { CHIP, cellsOf } from './kit'
import { lineRuns, lineText, mountRow, world } from './test-kit'

test('row: goal, now and you in one line, the chip orange, the question quoted in orange; above another mod\'s band', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setGoal({ name: 'Build the mods', tasks: [{ title: 'Row', status: 'in_progress' }] })
  await w.turnStart()
  await w.tool({ tool: 'Edit', file_path: '/repo/agents/hooks/kit.ts', old_string: 'a', new_string: 'b' })
  await w.turnEnd('Done.\nShould I ship it?\nOr wait for review?')
  const runs = await lineRuns($)
  expect(lineText(runs)).toBe(`${CHIP} goal Build the mods · now Editing agents/hooks/kit.ts · you: "Should I ship it?" +1`)
  expect(runs[0]).toEqual({ text: CHIP, color: '#0b0b0f', bg: '#fb923c', bold: true, dim: false })
  expect(runs.find(r => r.text === 'goal ')?.dim).toBe(true)
  expect(runs.find(r => r.text === '"Should I ship it?"')).toMatchObject({ color: '#fb923c', bold: true })
  expect(runs.find(r => r.text === ' +1')?.dim).toBe(true)
  const ui = await mountRow($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: shows with any one part; hidden with none', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await lineRuns($)).toEqual([])
  await w.turnStart()
  await w.spin('Sauteing')
  // In a turn the row waits delaySeconds (default 5).
  await w.clock.advance(5_000)
  expect(lineText(await lineRuns($))).toBe(`${CHIP} now Sauteing…`)
  await w.turnEnd('No questions here.')
  expect(await lineRuns($)).toEqual([])
  w.setGoal({ name: 'Only a goal', tasks: [{ title: 'a', status: 'pending' }] })
  expect(lineText(await lineRuns($))).toBe(`${CHIP} goal Only a goal`)
  w.setGoal(null)
  await w.turnStart()
  await w.turnEnd('Ready to go?')
  expect(lineText(await lineRuns($))).toBe(`${CHIP} you: "Ready to go?"`)
  await w.submit('yes')
  expect(await lineRuns($)).toEqual([])
})

test('row: a long question is cut to 60 columns', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd(`Do you want me to ${'really '.repeat(20)}ship it?`)
  const q = (await lineRuns($)).find(r => r.text.startsWith('"'))?.text ?? ''
  expect(cellsOf(q)).toBe(62)
  expect(q.endsWith('…"')).toBe(true)
})

test('row: a narrow band cuts the goal first, then now; the line truncates at its end', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setGoal({ name: 'Please build the where-am-i row for the mods', tasks: [{ title: 'a', status: 'pending' }] })
  await w.turnStart()
  await w.tool({ tool: 'Read', file_path: '/repo/some/deeply/nested/folder/with/a/long/name.ts' })
  await w.turnEnd('Merge?')
  const wide = await lineRuns($, 160)
  expect(wide.find(r => r.bold && r.text.startsWith('Please'))?.text).toBe('Please build the where-am-i row for the…')
  // 128 columns at full length: the goal gives first.
  const runs = await lineRuns($, 110)
  expect(runs.find(r => r.bold && r.text.startsWith('Please'))?.text).toBe('Please build the wh…')
  expect(runs.find(r => r.text.startsWith('Reading'))?.text).toBe('Reading some/deeply/nested/folder/with/a/long/n…')
  // Still too wide: now gives next; the question is kept whole.
  const narrow = await lineRuns($, 90)
  expect(narrow.find(r => r.text.startsWith('Reading'))?.text).toBe('Reading some/deeply/nested/…')
  expect(narrow.find(r => r.text === '"Merge?"')).toBeDefined()
})

test('row: rewrite=haiku draws the rewritten parts', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Merge now?')
  await w.settle()
  expect(lineText(await lineRuns($))).toBe(`${CHIP} goal Ship HERE · now Writing tests · you: "Merge now?"`)
})

test('row: /here off draws nothing of its own', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Ship?')
  await w.command('off')
  const ui = await mountRow($)
  expect(await ui.find({ key: 'here-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Ship?')
  const survey = await mountRow($, 160, true)
  expect(await survey.find({ key: 'here-line' })).toBeUndefined()
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
  const desktop = await mountRow($, 160, false, 'desktop')
  expect(await desktop.find({ key: 'here-line' })).toBeUndefined()
  await desktop.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws, handed on when it has nothing', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(await empty.find({ key: 'here-line' })).toBeUndefined()
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  await w.turnStart()
  await w.turnEnd('Ship?')
  const ui = await mountRow($)
  expect(await ui.find({ key: 'here-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
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
  await w.turnStart()
  await w.turnEnd('Ship?')
  const ui = await mountRow($)
  const tree = await ui.drawn()
  expect((tree as { props?: { key?: unknown } }).props?.key).toBe('zm-70-here')
  expect(zmKeys(tree)).toEqual(['zm-70-here'])
  expect(await ui.find({ key: 'here-line' })).toBeDefined()
  await ui.unmount()
})
