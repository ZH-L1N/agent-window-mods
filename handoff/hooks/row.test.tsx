import { expect, test } from 'claude-code/testing'

import { CHIP, hhmm, objectiveOf, stackBar } from './kit'
import { FILE, T0, barOf, childKeys, ctx, lineRuns, mountRow, pctOf, world } from './test-kit'

test('row: the bar stacks token-weather\'s reading in its order, each used row in its colour', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(250_000))
  await w.start()
  const runs = await lineRuns($)
  expect(runs[0]).toEqual({ text: CHIP, color: '#0b0b0f', bg: '#a78bfa', bold: true, dim: false })
  expect(barOf(runs)).toEqual([
    { text: '▰▰', color: '#888888', dim: false },
    // Memory files (a fifth of a cell) folded into System tools.
    { text: '▰', color: '#999999', dim: false },
    // Messages, 1.8 cells, takes the cell left over by largest remainder.
    { text: '▰▰', color: '#9333ea', dim: false },
    { text: '▱'.repeat(12), dim: true },
    { text: '░░░', dim: true },
  ])
  expect(barOf(runs).reduce((n, r) => n + r.text.length, 0)).toBe(20)
  expect(pctOf(runs)).toMatchObject({ text: ' 25%', color: '#22c55e' })
  // The top three used rows, in their colours, after the percent.
  expect(runs.filter(r => /^[A-Z].* (\d+|<1)%$/.test(r.text)).map(r => [r.text, r.color])).toEqual([
    ['System prompt 10%', '#888888'],
    ['Messages 9%', '#9333ea'],
    ['System tools 5%', '#999999'],
  ])
})

test('row: green under 60% of the compaction point, amber to the threshold, red from it; save now only when red', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(400_000, 800_000))
  await w.start()
  const seen: [string | undefined, string | undefined, boolean][] = []
  for (const tokens of [400_000, 500_000, 640_000]) {
    w.setTw(ctx(tokens, 800_000))
    await w.turn()
    const ui = await mountRow($)
    const runs = await lineRuns($)
    seen.push([pctOf(runs)?.text, pctOf(runs)?.color, (await ui.find({ key: 'handoff-save' })) !== undefined])
    await ui.unmount()
  }
  expect(seen).toEqual([
    [' 50%', '#22c55e', false],
    [' 63%', '#f59e0b', false],
    [' 80%', '#ef4444', true],
  ])
})

test('row: the save button is framed, with hotkey h', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  const ui = await mountRow($)
  const save = await ui.find({ key: 'handoff-save' })
  expect(save?.props).toMatchObject({ label: 'h: save now', hotkey: 'h' })
  expect(save?.props.plain).toBeUndefined()
  await ui.unmount()
})

test('row: a narrow band drops the top three, third first; the bar, percent and button stay', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  const wide = await lineRuns($, 200)
  const full = wide.reduce((n, r) => n + [...r.text].length, 0)
  // Room beside the button: 200 - (11 + 4 + 1); one column short of the whole line drops the third name.
  const cols = full + 16 - 1
  const short = await lineRuns($, cols)
  const names = (rs: { text: string }[]) => rs.filter(r => /^[A-Z].* (\d+|<1)%$/.test(r.text)).map(r => r.text)
  expect(names(wide)).toHaveLength(3)
  expect(names(short)).toEqual(names(wide).slice(0, 2))
  const narrow = await lineRuns($, 50)
  expect(names(narrow)).toEqual([])
  expect(barOf(narrow).reduce((n, r) => n + r.text.length, 0)).toBe(20)
  expect(pctOf(narrow)?.text).toBe(' 88%')
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(250_000))
  await w.start()
  const survey = await mountRow($, 200, true)
  expect(await survey.find({ key: 'handoff-line' })).toBeUndefined()
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
  const desktop = await mountRow($, 200, false, 'desktop')
  expect(await desktop.find({ key: 'handoff-line' })).toBeUndefined()
  await desktop.unmount()
})

test('row: composes: another band draws beneath it, once; the engine placeholder is never nested', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(250_000))
  await w.start()
  const ui = await mountRow($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[texts.length - 1]).toBe('beneath')
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.findIndex(t => t === CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: with nothing to show (no reading, no offer, no save) it hands the band on', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'handoff-line' })).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).toContain('"engine"')
  await ui.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  w.setTw(ctx(250_000))
  await w.start()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'handoff-line' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: band=off draws nothing of its own', { options: { band: 'off' } }, async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  const ui = await mountRow($)
  expect(await ui.find({ key: 'handoff-line' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: without token-weather it reads $.session.usage itself', async ($, on) => {
  const w = await world($, on)
  w.setUsage({
    startedAt: T0,
    rateLimits: [],
    context: {
      tokens: 250_000,
      window: 1_000_000,
      percent: 25,
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 100_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
          { name: 'MCP tools', tokens: 30_000, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: true, kind: 'deferred' },
          { name: 'Messages', tokens: 150_000, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
          { name: 'Free space', tokens: 600_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
          { name: 'Autocompact buffer', tokens: 150_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
        ],
        totalTokens: 250_000,
        maxTokens: 1_000_000,
        rawMaxTokens: 1_000_000,
        autoCompactThreshold: 850_000,
        isAutoCompactEnabled: true,
      },
    },
  })
  await w.start()
  const runs = await lineRuns($)
  expect(barOf(runs)).toEqual([
    { text: '▰▰', color: '#888888', dim: false },
    { text: '▰▰▰', color: '#9333ea', dim: false },
    { text: '▱'.repeat(12), dim: true },
    { text: '░░░', dim: true },
  ])
  // 250k of the 850k compaction point.
  expect(pctOf(runs)?.text).toBe(' 29%')
})

test('kit: the stack rule folds a row under half a cell into the one before it', () => {
  const segs = stackBar([
    { name: 'System prompt', tokens: 600_000, color: '#888888', kind: 'used' },
    { name: 'Messages', tokens: 380_000, color: '#9333ea', kind: 'used' },
    { name: 'Free space', tokens: 20_000, color: '#888888', kind: 'free' },
  ])
  expect(segs.map(s => [s.name, s.cells])).toEqual([
    ['System prompt', 12],
    ['Messages', 8],
  ])
})

test('kit: the objective is the line under its heading, else the first line of prose', () => {
  expect(objectiveOf('# Handoff\n\n## Objective\n\n- Ship the handoff mod\n\n## Done\n')).toBe('Ship the handoff mod')
  expect(objectiveOf('# Handoff\n## Objective: move context to its own row\n')).toBe('move context to its own row')
  expect(objectiveOf('# Handoff\n\nFinish the cache clock\n')).toBe('Finish the cache clock')
  expect(objectiveOf('# Only a title\n')).toBe('Only a title')
})

test('row: a saved handoff shows its time and the framed clear & continue button', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  await $.command.run({ command: 'handoff-line', args: 'now' } as never)
  await w.clock.advance(100)
  const ui = await mountRow($)
  expect((await ui.find({ key: 'handoff-line' }))?.text).toContain('writing HANDOFF.md…')
  expect(await ui.find({ key: 'handoff-save' })).toBeUndefined()
  w.files.set(FILE, { mtimeMs: T0 + 60_000, text: '## Objective\nShip it\n' })
  await w.clock.advance(3_000)
  expect((await ui.find({ key: 'handoff-line' }))?.text).toContain(`✓ saved ${hhmm(T0 + 60_000)}`)
  expect((await ui.find({ key: 'handoff-clear' }))?.props).toMatchObject({ label: 'c: clear & continue', hotkey: 'c' })
  await ui.unmount()
})

test('row: stack order: the row takes HANDOFF 30 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-50-agents', 'zm-20-plan'] })
  w.setTw(ctx(250_000))
  await w.start()
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-20-plan', 'zm-30-handoff', 'zm-50-agents', 'other-band'])
  expect(await ui.find({ key: 'handoff-line' })).toBeDefined()
  await ui.unmount()
})
