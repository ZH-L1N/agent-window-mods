import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CHIP, fitLine } from './band'
import { PLUGIN, bandProps, childKeys, usage, world } from './test-kit'

const mountBand = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

const lineOf = async (ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }) => (await ui.find({ key: 'agents-line' }))?.text

test('band: the full form, as the deck draws it', async ($, on) => {
  const w = await world($, on)
  await w.mainTurn(true)
  await w.spawn('find the hooks', 'Explore', 'haiku')
  await w.spawn('check the prices', 'checker', 'sonnet')
  await w.finish('a1')
  await w.skill('plugin-authoring')
  await w.skill('plugin-authoring')
  const ui = await mountBand($)
  expect(await lineOf(ui)).toBe(
    `${CHIP} main fable·5.1 ⟳ │ Explore haiku "find the hooks" ✓ · checker sonnet "check the prices" ⟳ │ skills: plugin-authoring ×2`,
  )
  const chip = (await ui.findAll({ type: 'Text', text: CHIP })).find(el => el.text === CHIP)
  expect(chip?.props).toMatchObject({ color: '#0b0b0f', backgroundColor: '#f472b6', bold: true })
  expect((await ui.find({ type: 'Text', text: /^fable·5\.1$/ }))?.props.color).toBe('#d16bff')
  expect((await ui.find({ type: 'Text', text: /^haiku$/ }))?.props.color).toBe('#19c3a6')
  expect((await ui.find({ type: 'Text', text: /^sonnet$/ }))?.props.color).toBe('#3d9bff')
  expect((await ui.find({ type: 'Text', text: /^✓$/ }))?.props.color).toBe('#22c55e')
  expect((await ui.findAll({ type: 'Text', text: /^⟳$/ })).map(el => el.props.color)).toEqual(['#f59e0b', '#f59e0b'])
  expect((await ui.find({ type: 'Text', text: /^skills:/ }))?.props.color).toBe('#a3e635')
  // Framed buttons: ×N opens the pane, ✕ dismisses.
  const crew = await ui.find({ key: 'agents-crew' })
  expect(crew?.props.label).toBe('×2')
  expect(crew?.props.plain).toBeUndefined()
  expect(crew?.props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'agents-dismiss' }))?.props.role).toBe('dismiss')
  // Composes: the band beneath draws under this row.
  expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  await ui.press({ key: 'agents-crew' })
  expect(w.opened).toEqual(['agents'])
  await ui.unmount()
})

test('band: a long task is cut to 22 characters; a failed run shows ✗', async ($, on) => {
  const w = await world($, on)
  await w.spawn('rewrite the whole price table from scratch', 'general-purpose', 'opus')
  await w.finish('a1', 'error')
  const ui = await mountBand($)
  expect(await lineOf(ui)).toBe(`${CHIP} general-purpose opus "rewrite the whole pri…" ✗`)
  expect((await ui.find({ type: 'Text', text: /^✗$/ }))?.props.color).toBe('#ef4444')
  await ui.unmount()
})

const runs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i + 1}`,
    type: `type${i + 1}`,
    description: `task number ${i + 1}`,
    model: 'claude-haiku-5-5',
    status: 'running' as const,
    startedAt: i,
    contextTokens: 0,
    contextMax: 1,
    tokens: 0,
    costUsd: 0,
    steps: 0,
  }))
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')

test('band: the width rule drops task text oldest first, then skills to one, then folds into +N more', () => {
  const parts = { batch: runs(3), mainModel: null, skills: [['a-skill', 2], ['b-skill', 1]] as [string, number][] }
  const full = text(fitLine(parts, 500))
  expect(full).toBe(
    `${CHIP} type1 haiku "task number 1" ⟳ · type2 haiku "task number 2" ⟳ · type3 haiku "task number 3" ⟳ │ skills: a-skill ×2, b-skill ×1`,
  )
  // Room for all but one task text: the oldest goes first.
  const one = text(fitLine(parts, full.length - 1))
  expect(one).toBe(`${CHIP} type1 haiku ⟳ · type2 haiku "task number 2" ⟳ · type3 haiku "task number 3" ⟳ │ skills: a-skill ×2, b-skill ×1`)
  // No task texts left, then one skill.
  const bare = `${CHIP} type1 haiku ⟳ · type2 haiku ⟳ · type3 haiku ⟳ │ skills: a-skill ×2`
  expect(text(fitLine(parts, bare.length))).toBe(bare)
  // Then the tail folds into +N more; the first entry and one skill stay.
  const folded = `${CHIP} type1 haiku ⟳ · type2 haiku ⟳ +1 more │ skills: a-skill ×2`
  expect(text(fitLine(parts, folded.length))).toBe(folded)
  // Last, the kept skill's name and the first entry's label are cut.
  expect(text(fitLine(parts, 10))).toBe(`${CHIP} t… haiku ⟳ +2 more │ skills: a… ×2`)
})

test('band: with the main loop running, the main segment shrinks and goes before the first entry or the skill', async ($, on) => {
  const w = await world($, on)
  await w.mainTurn(true)
  await w.spawn('find the hooks', 'Explore', 'haiku')
  await w.skill('plugin-authoring')
  await w.skill('plugin-authoring')
  // 80 columns: room 67 beside the buttons; `main fable·5.1 ⟳` would overrun it.
  const wide = await mountBand($, 80)
  expect(await lineOf(wide)).toBe(`${CHIP} main ⟳ │ Explore haiku ⟳ │ skills: plugin-authoring ×2`)
  await wide.unmount()
  // 60 columns: room 47; the main segment goes and the skill's name is cut.
  const narrow = await mountBand($, 60)
  const line = (await lineOf(narrow)) ?? ''
  expect(line).toBe(`${CHIP} Explore haiku ⟳ │ skills: plugi… ×2`) // one column less for the skill: the chip is padded to HANDOFF's width
  expect([...line].length).toBeLessThanOrEqual(60 - (2 + 4 + 1 + 5 + 1))
  await narrow.unmount()
})

test('band: the engine placeholder beneath is skipped, never nested under the band', async ($, on) => {
  const w = await world($, on, false, {}, { isEngineBeneath: true })
  await w.spawn('one')
  const ui = await mountBand($)
  expect(await ui.find({ key: 'agents-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('band: a narrow band drops task text and folds runs into +N more', async ($, on) => {
  const w = await world($, on)
  for (const d of ['one task', 'two task', 'three task', 'four task']) await w.spawn(d, 'Explore', 'haiku')
  const ui = await mountBand($, 70)
  const line = (await lineOf(ui)) ?? ''
  expect(line).toMatch(/^ ◎ AGENTS {3}Explore haiku ⟳/)
  expect(line).toMatch(/\+\d more$/)
  expect(line).not.toContain('"')
  expect([...line].length).toBeLessThanOrEqual(70 - (2 + 4 + 1 + 5 + 1))
  await ui.unmount()
})

test('band: under 40 columns, the short form with a 6-cell bar by share finished', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one', 'Explore', 'haiku')
  await w.spawn('two', 'Explore', 'haiku')
  await w.finish('a1')
  const ui = await mountBand($, 39)
  expect(await lineOf(ui)).toBe('● 2 agents ▰▰▰▱▱▱')
  expect((await ui.find({ key: 'agents-crew' }))?.props.label).toBe('×2')
  expect(await ui.find({ key: 'agents-dismiss' })).toBeDefined()
  await ui.unmount()
})

test('band: a skill fired while no band is up is not shown on the next batch', async ($, on) => {
  const w = await world($, on)
  await w.skill('commit')
  await w.spawn('one')
  await w.skill('plugin-authoring')
  const ui = await mountBand($)
  const line = (await lineOf(ui)) ?? ''
  expect(line).toContain('skills: plugin-authoring ×1')
  expect(line).not.toContain('commit')
  await ui.unmount()
})

test('band: ✕ hides it until a new run starts', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  await w.skill('plugin-authoring')
  const ui = await mountBand($)
  await ui.press({ key: 'agents-dismiss' })
  expect(await ui.find({ key: 'agents-line' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  expect(w.state('skills')).toEqual({})
  await w.clock.advance(1_000)
  await w.spawn('two')
  // Back, with the run still going from before the dismiss.
  expect((await ui.find({ key: 'agents-crew' }))?.props.label).toBe('×2')
  await ui.unmount()
})

test('band: lingers 10 s after the last run, then hides', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('one')
  const ui = await mountBand($)
  await w.clock.advance(2_000)
  await w.step('a1', usage('claude-opus-5-5', 100, 100))
  await w.finish('a1')
  await w.clock.advance(9_000)
  expect(await ui.find({ key: 'agents-line' })).toBeDefined()
  await w.clock.advance(3_000)
  expect(await ui.find({ key: 'agents-line' })).toBeUndefined()
  await ui.unmount()
})

test('band: band=off draws nothing of its own', { options: { band: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  const ui = await mountBand($)
  expect(await ui.find({ key: 'agents-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(el => el.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('band: yields to a survey and stays off the desktop', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  const survey = await mountBand($, 160, true)
  expect(await survey.find({ key: 'agents-line' })).toBeUndefined()
  await survey.unmount()
  const desktop = await mountBand($, 160, false, 'desktop')
  expect(await desktop.find({ key: 'agents-line' })).toBeUndefined()
  await desktop.unmount()
})

test('band: a background shell is an entry with its command, elapsed time and status; ×N counts it', async ($, on) => {
  const w = await world($, on, true)
  await w.bash('pytest -q tests/')
  await w.clock.advance(42_000)
  const ui = await mountBand($)
  expect(await lineOf(ui)).toBe(`${CHIP} sh "pytest -q tests/" 0:42 ⟳`)
  expect((await ui.find({ type: 'Text', text: /^sh$/ }))?.props.color).toBe('#9a9a96')
  expect((await ui.find({ type: 'Text', text: /^⟳$/ }))?.props.color).toBe('#f59e0b')
  expect((await ui.find({ key: 'agents-crew' }))?.props.label).toBe('×1')
  await w.notify('b1', { status: 'failed', exitCode: 1 })
  expect(await lineOf(ui)).toBe(`${CHIP} sh "pytest -q tests/" 0:42 ✗`)
  expect((await ui.find({ type: 'Text', text: /^✗$/ }))?.props.color).toBe('#ef4444')
  await ui.unmount()
})

test('band: a codex shell beside a subagent reads `codex <model> "<prompt>"` in grey; the crew counts both', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('find the hooks', 'Explore', 'haiku')
  await w.clock.advance(1_000)
  await w.bash('codex exec -m gpt-5.4 "review the diff"', 'b2')
  await w.clock.advance(130_000)
  const ui = await mountBand($)
  expect(await lineOf(ui)).toBe(`${CHIP} Explore haiku "find the hooks" ⟳ · codex gpt-5.4 "review the diff" 2:10 ⟳`)
  expect((await ui.find({ type: 'Text', text: /^codex gpt-5\.4$/ }))?.props.color).toBe('#9a9a96')
  expect((await ui.find({ key: 'agents-crew' }))?.props.label).toBe('×2')
  await w.notify('b2', { status: 'completed' })
  expect(await lineOf(ui)).toContain('codex gpt-5.4 "review the diff" 2:10 ✓')
  await ui.unmount()
})

test('band: the short form counts shells as tasks', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one', 'Explore', 'haiku')
  await w.bash('sleep 90')
  await w.finish('a1')
  const ui = await mountBand($, 39)
  expect(await lineOf(ui)).toBe('● 2 tasks ▰▰▰▱▱▱')
  expect((await ui.find({ key: 'agents-crew' }))?.props.label).toBe('×2')
  await ui.unmount()
})

test('band: a foreground Bash call draws nothing', async ($, on) => {
  const w = await world($, on)
  await w.bash('ls', 'b1', { isForeground: true })
  const ui = await mountBand($)
  expect(await ui.find({ key: 'agents-line' })).toBeUndefined()
  await ui.unmount()
})

test('band: stack order: the row takes AGENTS 50 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  const w = await world($, on, false, {}, { stackBeneath: ['zm-60-goal', 'zm-10-sys'] })
  await w.spawn('one')
  const ui = await mountBand($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-50-agents', 'zm-60-goal', 'other-band'])
  expect(await ui.find({ key: 'agents-line' })).toBeDefined()
  await ui.unmount()
})
