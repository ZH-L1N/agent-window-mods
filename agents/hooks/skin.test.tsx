import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SHELL_POSE, boxOf, codexPose, donePose, hubPose, mascotCells, pixelsOf, runningPose, waitPose } from './mascots'
import { PLUGIN, outputFileFor, paneProps, usage, world } from './test-kit'

const mountPane = ($: Engine, cols = 80, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agents', props: paneProps(cols) })

// An Explore run still going on Opus 5.5 (tier medium), and a savvy-careful run done
// after 26 s with 10k input, 2k output and 26k cache-read tokens on Opus 5.5:
// 38k tokens, (10000 * 4 + 2000 * 20 + 26000 * 0.2) / 1e6 = $0.0852.
async function twoRuns($: Engine, on: On, isStarted = false) {
  const w = await world($, on, isStarted)
  await w.spawn('Scout the parser', 'Explore')
  await w.spawn('Fix the lexer', 'savvy-careful')
  await w.clock.advance(26_000)
  await w.step('a2', usage('claude-opus-5-5', 10_000, 2_000, 26_000))
  await w.finish('a2')
  return w
}

test('pane: stat tiles, section heads and a card per run with a Raster mascot', async ($, on) => {
  await twoRuns($, on)
  const ui = await mountPane($)

  const tiles = (await ui.findAll({ type: 'Box' })).filter(el => el.props.borderStyle === 'round')
  expect(tiles.map(el => el.text)).toEqual(['Cost≈$0.09', 'Tokens38k', 'Time0:26'])
  expect(await ui.find({ type: 'Text', text: /^Running · 1 ─+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Finished · 1 ─+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Scout the parser$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Fix the lexer$/ })).toBeDefined()

  // The finished run: its pose from the finished pool, ✓ green, its tier word in the careful colour.
  const done = await ui.find({ key: 'mascot-a2' })
  expect(done?.type).toBe('Raster')
  expect(done?.props.columns).toBe(pixelsOf(donePose('a2')).w)
  expect(done?.props.cells).toBe(mascotCells(donePose('a2')))
  // The card is as tall as its pose: the Raster's rows follow the picked pose.
  expect(done?.props.rows).toBe(boxOf(donePose('a2')).rows)
  expect((await ui.find({ type: 'Text', text: /^✓$/ }))?.props.color).toBe('#22c55e')
  expect((await ui.find({ type: 'Text', text: /^careful$/ }))?.props.color).toBe('#BA7517')
  expect(await ui.find({ type: 'Text', text: ' ctx 4% · 38k · ≈$0.09 · 0:26' })).toBeDefined()

  // The running run: its pool pose, bobbing on odd seconds only (0:26 is even).
  const live = await ui.find({ key: 'mascot-a1' })
  expect(live?.props.cells).toBe(mascotCells(runningPose('a1')))
  expect(await ui.find({ type: 'Text', text: /^running$/ })).toBeDefined()
  await ui.unmount()
})

test('pane: ▰▱ bars, full green when finished, at least one ▰ while live, red on error', async ($, on) => {
  const w = await twoRuns($, on, true)
  const ui = await mountPane($)
  const fullColor = async () => (await ui.findAll({ type: 'Text', text: /^▰{10}$/ })).map(el => el.props.color).find(Boolean)
  expect((await ui.find({ key: 'bar-a2' }))?.text).toBe('▰'.repeat(10))
  // Just finished: the bar flashes bright green, then settles green once the tick moves past 0.6 s.
  expect(await fullColor()).toBe('#86efac')
  await w.clock.advance(1_000)
  expect(await fullColor()).toBe('#22c55e')
  expect((await ui.find({ key: 'bar-a1' }))?.text).toBe('▰' + '▱'.repeat(9))
  // Running on Opus 5.5 with no effort: tier medium's colour.
  expect((await ui.find({ type: 'Text', text: /^▰$/ }))?.props.color).toBe('#378ADD')

  await w.finish('a1', 'error')
  expect(await ui.find({ type: 'Text', text: /^Error · 1 ─+$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^✗$/ }))?.props.color).toBe('#ef4444')
  expect((await ui.find({ type: 'Text', text: /^▰$/ }))?.props.color).toBe('#ef4444')
  await ui.unmount()
})

test('pane: the spinner turns with the 100 ms tick while the band shows', async ($, on) => {
  const w = await twoRuns($, on, true)
  const ui = await mountPane($)
  const spinner = async () => (await ui.findAll({ type: 'Text' })).find(el => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/.test(el.text))
  const first = await spinner()
  expect(first?.props.color).toBe('#378ADD')
  await w.clock.advance(100)
  const second = await spinner()
  expect(second).toBeDefined()
  expect(second?.text).not.toBe(first?.text)
  await ui.unmount()
})

test('pane: a run awaiting a tool for over 20 s sleeps', async ($, on) => {
  const w = await world($, on)
  await w.spawn('Read the logs')
  await w.step('a1', usage('claude-opus-5-5', 1_000, 100), 1)
  await w.clock.advance(21_000)
  await w.spawn('nudge the clock')
  const ui = await mountPane($)
  expect((await ui.find({ key: 'mascot-a1' }))?.props.cells).toBe(mascotCells(waitPose('a1')))
  expect(await ui.find({ type: 'Text', text: /^waiting$/ })).toBeDefined()
  await ui.unmount()
})

test('pane: a main-loop card tops Running while two subagents run', async ($, on) => {
  const w = await twoRuns($, on)
  await w.mainTurn(true)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^main loop$/ })).toBeUndefined()
  await w.spawn('Write the docs')
  expect(await ui.find({ type: 'Text', text: /^main loop$/ })).toBeDefined()
  const hub = await ui.find({ key: 'mascot-main' })
  expect(hub?.type).toBe('Raster')
  expect(hub?.props.columns).toBe(pixelsOf(hubPose('t-main')).w)
  expect([mascotCells(hubPose('t-main')), mascotCells(hubPose('t-main'), { isBobbed: true })]).toContain(hub?.props.cells)
  expect(await ui.find({ type: 'Text', text: /2 subagents running/ })).toBeDefined()
  await ui.unmount()
})

test('pane: Collapse gives one line per agent and no mascots', async ($, on) => {
  await twoRuns($, on)
  const ui = await mountPane($)
  expect((await ui.find({ key: 'compact' }))?.props.label).toBe('Collapse')
  await ui.press({ key: 'compact' })
  expect((await ui.find({ key: 'compact' }))?.props.label).toBe('Expand')
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /^✓ Fix the lexer · Opus 5\.5 · ctx 4% · 38k · ≈\$0\.09 · 0:26$/ })).toBeDefined()
  await ui.unmount()
})

test('pane: narrow panes drop the mascots; the desktop gets plain text', async ($, on) => {
  await twoRuns($, on)
  const narrow = await mountPane($, 50)
  expect(await narrow.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await narrow.find({ key: 'bar-a2' })).toBeDefined()
  await narrow.unmount()
  const desktop = await mountPane($, 80, 'desktop')
  expect(await desktop.find({ type: 'Text', text: /^✓ Fix the lexer · Opus 5\.5 · ctx 4%/ })).toBeDefined()
  await desktop.unmount()
})

test('pane: a shell card has the grey mascot, `sh · <command>`, `background shell · <elapsed>` and its last output line', async ($, on) => {
  const w = await world($, on, true, {}, { isPaneOpen: true })
  await w.bash('pytest -q tests/')
  w.files.set(outputFileFor('b1'), 'collecting\n12 passed in 0.4s\n')
  await w.clock.advance(42_000)
  const ui = await mountPane($)
  const mascot = await ui.find({ key: 'mascot-sh-b1' })
  expect(mascot?.type).toBe('Raster')
  expect([mascotCells(SHELL_POSE), mascotCells(SHELL_POSE, { isBobbed: true })]).toContain(mascot?.props.cells)
  expect(await ui.find({ type: 'Text', text: /^sh · pytest -q tests\/$/ })).toBeDefined()
  expect((await ui.find({ key: 'detail-sh-b1' }))?.text).toBe('  background shell · 0:42')
  expect((await ui.find({ key: 'tail-sh-b1' }))?.text).toBe('  12 passed in 0.4s')
  expect(await ui.find({ type: 'Text', text: /^running$/ })).toBeDefined()
  await w.notify('b1', { status: 'failed', exitCode: 2 })
  expect(await ui.find({ type: 'Text', text: /^Error · 1 ─+$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^failed$/ }))?.props.color).toBe('#ef4444')
  expect((await ui.find({ key: 'detail-sh-b1' }))?.text).toBe('  background shell · 0:42 · exit 2')
  await ui.unmount()
})

test('pane: a codex shell gets the codex mascot and its agent and model in the detail', async ($, on) => {
  const w = await world($, on)
  await w.bash('codex exec -m gpt-5.4 "review the diff"', 'b2')
  const ui = await mountPane($)
  expect((await ui.find({ key: 'mascot-sh-b2' }))?.props.cells).toBe(mascotCells(codexPose('sh-b2')))
  expect(await ui.find({ type: 'Text', text: /^codex · review the diff$/ })).toBeDefined()
  expect((await ui.find({ key: 'detail-sh-b2' }))?.text).toBe('  codex gpt-5.4 · background shell · 0:00')
  await ui.unmount()
})

test('pane: every card gets a framed button numbered in pane order; pressing it is a stub until E3', async ($, on) => {
  const w = await twoRuns($, on)
  await w.bash('sleep 90')
  const ui = await mountPane($)
  // Running: a1, then the shell; Finished: a2.
  const one = await ui.find({ key: 'num-a1' })
  expect(one?.props).toMatchObject({ label: '1', hotkey: '1' })
  expect(one?.props.plain).toBeUndefined()
  expect((await ui.find({ key: 'num-sh-b1' }))?.props.label).toBe('2')
  expect((await ui.find({ key: 'num-a2' }))?.props.label).toBe('3')
  const before = w.toasts.length
  await ui.press({ key: 'num-a2' })
  expect(w.toasts.slice(before)).toEqual(['messages view comes with E3'])
  // Collapsed, the buttons stay.
  await ui.press({ key: 'compact' })
  expect((await ui.find({ key: 'num-a1' }))?.props.label).toBe('1')
  await ui.unmount()
})

test('pane: the main-loop card counts shells among the running as tasks', async ($, on) => {
  const w = await twoRuns($, on)
  await w.mainTurn(true)
  await w.bash('sleep 90')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /^main loop$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 tasks running/ })).toBeDefined()
  await ui.unmount()
})

test('pane: the desktop lists shells in plain text', async ($, on) => {
  const w = await world($, on)
  await w.bash('pytest -q tests/')
  const desktop = await mountPane($, 80, 'desktop')
  expect(await desktop.find({ type: 'Text', text: '● sh · pytest -q tests/ · background shell · 0:00' })).toBeDefined()
  await desktop.unmount()
})

test('pane: a c: clear done button drops every ended run, and is absent with nothing to clear', async ($, on) => {
  const w = await world($, on)
  await w.spawn('First', 'Explore')
  await w.spawn('Second', 'Explore')
  await w.finish('a1')
  const ui = await mountPane($)
  expect(await ui.find({ key: 'clear' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Finished · 1 ─+$/ })).toBeDefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: /^Finished · / })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Running · 1 ─+$/ })).toBeDefined()
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  expect((await w.runs()).map(a => a.id)).toEqual(['a2'])
  await ui.unmount()
})

test('register: ended runs past keepEnded are dropped as runs end; /agents-info clear drops them all', { options: { keepEnded: '5' } }, async ($, on) => {
  const w = await world($, on, true)
  for (let i = 1; i <= 8; i++) await w.spawn(`Run ${i}`, 'Explore')
  for (let i = 1; i <= 7; i++) await w.finish(`a${i}`)
  const kept = (await w.runs()).map(a => a.id)
  expect(kept).toContain('a8')
  expect(kept.filter(id => id !== 'a8').length).toBe(5)
  const reply = await $.command.run({ command: 'agents-info', args: 'clear' } as never)
  expect(String((reply as { text?: string }).text)).toMatch(/Cleared 5 ended runs/)
  expect((await w.runs()).map(a => a.id)).toEqual(['a8'])
})
