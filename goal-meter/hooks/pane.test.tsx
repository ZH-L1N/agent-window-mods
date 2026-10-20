import { expect, test } from 'claude-code/testing'

import { hhmm } from './kit'
import { MIN, T0, mountPane, world } from './test-kit'

test('pane: /goals opens it; every task with ▶ ✓ ○ and its minutes, then the last goals', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // An earlier goal, finished in 2 minutes.
  await w.prompt('Warm up')
  await w.todo([['Stretch', 'in_progress']])
  await w.clock.advance(2 * MIN)
  await w.todo([['Stretch', 'completed']])
  // The goal now: one done in 5m, one running 3m, one open.
  await w.prompt('Build the mods')
  await w.todo([
    ['Write the plan', 'in_progress'],
    ['Write the row', 'pending'],
    ['Test it', 'pending'],
  ])
  await w.clock.advance(5 * MIN)
  await w.todo([
    ['Write the plan', 'completed'],
    ['Write the row', 'in_progress'],
    ['Test it', 'pending'],
  ])
  await w.clock.advance(3 * MIN)

  expect(await w.command('')).toBe('Goals pane opened.')
  expect(w.opened).toEqual(['goals'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountPane($, 80, surface)
    const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(lines).toContain('◆ Build the mods')
    expect(lines).toContain('1/3 · 33% · 8m · ETA ~10m')
    expect(lines).toContain('✓ Write the plan  5m')
    expect(lines).toContain('▶ Write the row  3m')
    expect(lines).toContain('○ Test it')
    expect(lines.indexOf('✓ Write the plan  5m')).toBeLessThan(lines.indexOf('○ Test it'))
    expect(lines.some(l => /^Last goals ─+$/.test(l))).toBe(true)
    expect(lines).toContain(`✓ Warm up · 1 task · 2m · ${hhmm(T0)}`)
    // The goal now is not listed again among the last goals.
    expect(lines.filter(l => l.includes('Build the mods ·'))).toEqual([])
    expect((await ui.find({ type: 'Text', text: /^✓ $/ }))?.props.color).toBe('#22c55e')
    expect((await ui.find({ type: 'Text', text: /^▶ $/ }))?.props.color).toBe('#f59e0b')
    await ui.unmount()
  }
})

test('pane: no goal yet and no history say so', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const ui = await mountPane($)
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(lines).toContain('No goal yet. The GOAL row appears when Claude writes a task list.')
  expect(lines).toContain('No earlier goals.')
  await ui.unmount()
})

test('pane: a stopped goal reads its count and stopped', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Half done')
  await w.todo([
    ['A', 'completed'],
    ['B', 'pending'],
  ])
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  const ui = await mountPane($)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain(`○ Half done · 1/2 · stopped · ${hhmm(T0)}`)
  await ui.unmount()
})
