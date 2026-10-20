import { expect, test } from 'claude-code/testing'

import { RESUME_PROMPT, hhmm } from './kit'
import { FILE, T0, ctx, mountRow, world } from './test-kit'

const DAY = 24 * 60 * 60_000
const CROSSING = 'Chat is 80% full, save a handoff (/handoff-line now)'
const text = (r: unknown) => (r as { text?: string }).text

test('register: one toast per crossing of the threshold, again only after the fill dropped under it', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(500_000, 800_000))
  await w.start()
  w.setTw(ctx(650_000, 800_000))
  await w.turn()
  w.setTw(ctx(700_000, 800_000))
  await w.turn()
  expect(w.toasts.filter(t => t === CROSSING)).toHaveLength(1)
  expect(w.state('isOver')).toBe(true)
  // A compaction brings it down; the next crossing toasts again.
  w.setTw(ctx(300_000, 800_000))
  await w.compact()
  expect(w.state('isOver')).toBe(false)
  w.setTw(ctx(660_000, 800_000))
  await w.turn()
  expect(w.toasts.filter(t => t === CROSSING)).toHaveLength(2)
  // Ask mode only asks: nothing was submitted.
  expect(w.prompts).toEqual([])
})

test('register: save now runs the person\'s /handoff command when there is one, from a timer', async ($, on) => {
  const w = await world($, on, { listed: ['handoff'] })
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  const ui = await mountRow($)
  await ui.press({ key: 'handoff-save' })
  // Not inside the press: the run waits for the timer.
  expect(w.commands).toEqual([])
  await w.clock.advance(100)
  expect(w.commands).toEqual(['handoff'])
  expect(w.prompts).toEqual([])
  expect(w.state('save')).toMatchObject({ phase: 'saving', via: 'command', baseMtime: 0 })
  // HANDOFF.md appears: saved, the time recorded per root.
  w.files.set(FILE, { mtimeMs: T0 + 90_000, text: '## Objective\nShip it\n' })
  await w.clock.advance(3_000)
  expect(w.state('save')).toMatchObject({ phase: 'saved', savedAt: T0 + 90_000 })
  expect([...w.store.entries()].find(([k]) => k.startsWith('handoff.lastSave.'))?.[1]).toBe(T0 + 90_000)
  expect(w.toasts).toContain(`Handoff saved ${hhmm(T0 + 90_000)} (clear & continue: /clear, then /handoff-line resume)`)
  // c: clear & continue runs /clear from a timer.
  await ui.press({ key: 'handoff-clear' })
  await w.clock.advance(100)
  expect(w.commands).toEqual(['handoff', 'clear'])
  await ui.unmount()
})

test('register: without a /handoff command, save now asks Claude to write HANDOFF.md in the session root', async ($, on) => {
  const w = await world($, on, { files: { [FILE]: { mtimeMs: T0 - DAY, text: 'old' } } })
  w.setTw(ctx(700_000, 800_000))
  await w.start(3)
  expect(text(await $.command.run({ command: 'handoff-line', args: 'now' } as never))).toBe('Saving a handoff: asked Claude to write /repo/HANDOFF.md.')
  await w.clock.advance(100)
  expect(w.commands).toEqual([])
  expect(w.prompts).toHaveLength(1)
  const prompt = w.prompts[0] ?? ''
  expect(prompt).toContain('/repo/HANDOFF.md')
  for (const part of ['Objective', 'Done', 'In progress', 'Next', 'Decisions and why', 'Open questions', 'Exact next step']) expect(prompt).toContain(part)
  // The old file does not count: only a newer one marks it saved.
  await w.clock.advance(3_000)
  expect(w.state('save')).toMatchObject({ phase: 'saving', baseMtime: T0 - DAY })
  w.files.set(FILE, { mtimeMs: T0 + 5_000, text: 'new' })
  await w.turn()
  expect(w.state('save')).toMatchObject({ phase: 'saved', savedAt: T0 + 5_000 })
})

test('register: mode auto saves by itself at the crossing', { options: { mode: 'auto' } }, async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(500_000, 800_000))
  await w.start()
  w.setTw(ctx(700_000, 800_000))
  await w.turn()
  await w.clock.advance(100)
  expect(w.toasts).toContain('Chat is 80% full, saving a handoff (/handoff-line status)')
  expect(w.prompts).toHaveLength(1)
})

test('register: a save is done with at the next crossing; the row offers save now again', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start()
  const ui = await mountRow($)
  await ui.press({ key: 'handoff-save' })
  await w.clock.advance(100)
  expect(w.prompts).toHaveLength(1)
  w.files.set(FILE, { mtimeMs: T0 + 90_000, text: '## Objective\nShip it\n' })
  // The turn's check and the watch tick both look: one 'saved' toast.
  await w.turn()
  await w.clock.advance(3_000)
  expect(w.state('save')).toMatchObject({ phase: 'saved', savedAt: T0 + 90_000 })
  expect(w.toasts.filter(t => t.startsWith('Handoff saved'))).toHaveLength(1)
  expect(await ui.find({ key: 'handoff-clear' })).toBeDefined()
  // Working on without /clear: a compaction, then the fill crosses again.
  w.setTw(ctx(300_000, 800_000))
  await w.compact('auto')
  w.setTw(ctx(700_000, 800_000))
  await w.turn()
  expect(w.toasts.filter(t => t === CROSSING)).toHaveLength(2)
  expect(w.state('save')).toMatchObject({ phase: 'idle', savedAt: T0 + 90_000 })
  expect(await ui.find({ key: 'handoff-clear' })).toBeUndefined()
  await ui.press({ key: 'handoff-save' })
  await w.clock.advance(100)
  expect(w.prompts).toHaveLength(2)
  await ui.unmount()
})

test('register: mode auto saves again at the next crossing after an earlier save', { options: { mode: 'auto' } }, async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(500_000, 800_000))
  await w.start()
  w.setTw(ctx(700_000, 800_000))
  await w.turn()
  await w.clock.advance(100)
  expect(w.prompts).toHaveLength(1)
  w.files.set(FILE, { mtimeMs: T0 + 5_000, text: 'x' })
  await w.turn()
  expect(w.state('save')).toMatchObject({ phase: 'saved' })
  w.setTw(ctx(300_000, 800_000))
  await w.compact('auto')
  w.setTw(ctx(700_000, 800_000))
  await w.turn()
  await w.clock.advance(100)
  expect(w.toasts.filter(t => t === 'Chat is 80% full, saving a handoff (/handoff-line status)')).toHaveLength(2)
  expect(w.prompts).toHaveLength(2)
})

test('register: /handoff-line now while a save is being written does not ask twice', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start(1)
  await $.command.run({ command: 'handoff-line', args: 'now' } as never)
  await w.clock.advance(100)
  expect(text(await $.command.run({ command: 'handoff-line', args: 'now' } as never))).toBe('A handoff is already being written (/handoff-line status).')
  await w.clock.advance(100)
  expect(w.prompts).toHaveLength(1)
  expect(w.state('save')).toMatchObject({ phase: 'saving', requestedAt: T0 + 300 })
})

test('register: a new session with a HANDOFF.md offers to resume from it', async ($, on) => {
  const w = await world($, on, {
    files: { [FILE]: { mtimeMs: T0 - 2 * DAY, text: '# Handoff\n\n## Objective\nShip the handoff mod\n\n## Exact next step\nRun the tests\n' } },
  })
  w.setTw(ctx(120_000))
  await w.start(0)
  expect(w.toasts).toContain('Handoff from 2d ago available (/handoff-line resume)')
  const ui = await mountRow($)
  expect((await ui.find({ key: 'handoff-line' }))?.text).toContain('from 2d ago: Ship the handoff mod')
  const resume = await ui.find({ key: 'handoff-resume' })
  expect(resume?.props).toMatchObject({ label: 'r: resume', hotkey: 'r' })
  await ui.press({ key: 'handoff-resume' })
  await w.clock.advance(100)
  expect(w.prompts).toEqual([RESUME_PROMPT])
  expect(await ui.find({ key: 'handoff-resume' })).toBeUndefined()
  await ui.unmount()
})

test('register: a resumed session (prompts already sent) gets no offer; /handoff-line resume still works', async ($, on) => {
  const w = await world($, on, { files: { [FILE]: { mtimeMs: T0 - 3 * 60 * 60_000, text: '## Objective\nX\n' } } })
  w.setTw(ctx(120_000))
  await w.start(4)
  expect(w.toasts.some(t => t.startsWith('Handoff from'))).toBe(false)
  expect(text(await $.command.run({ command: 'handoff-line', args: 'resume' } as never))).toBe('Resuming from HANDOFF.md (3h ago).')
  await w.clock.advance(100)
  expect(w.prompts).toEqual([RESUME_PROMPT])
})

test('register: after a /clear the old reading is stale and the new session gets the offer', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(700_000, 800_000))
  await w.start(5)
  expect(w.state('isOver')).toBe(true)
  w.files.set(FILE, { mtimeMs: T0, text: '## Objective\nKeep going\n' })
  await w.clock.advance(60_000)
  await w.clear()
  expect(w.state('isOver')).toBe(false)
  expect(w.toasts).toContain('Handoff from 1m ago available (/handoff-line resume)')
  const ui = await mountRow($)
  const line = (await ui.find({ key: 'handoff-line' }))?.text ?? ''
  // token-weather's reading is older than the clear: not drawn, so no bar until a fresh one.
  expect(line).not.toContain('▰')
  expect(line).toContain('from 1m ago: Keep going')
  await ui.unmount()
})

test('register: a compaction with no fresh handoff warns, never vetoes; a fresh one or a precompute does not warn', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(300_000, 800_000))
  await w.start(2)
  const result = (await w.compact('manual')) as { messages?: unknown[]; skip?: string }
  expect(result.skip).toBeUndefined()
  expect(result.messages).toHaveLength(1)
  expect(w.toasts.filter(t => t === 'Compacting without a fresh handoff')).toHaveLength(1)
  await w.compact('precompute')
  expect(w.toasts.filter(t => t === 'Compacting without a fresh handoff')).toHaveLength(1)
  // Saved five minutes ago: fresh.
  w.files.set(FILE, { mtimeMs: T0 - 5 * 60_000, text: 'x' })
  await w.compact('auto')
  expect(w.toasts.filter(t => t === 'Compacting without a fresh handoff')).toHaveLength(1)
})

test('register: /handoff-line status says the settings, the context, the file and the save path', async ($, on) => {
  const w = await world($, on, { files: { [FILE]: { mtimeMs: T0 - 2 * 60 * 60_000, text: 'x' } } })
  w.setTw(ctx(510_000, 850_000))
  await w.start(1)
  expect(text(await $.command.run({ command: 'handoff-line', args: 'status' } as never))).toBe(
    [
      'HANDOFF line: on · mode ask · threshold 80% of the compaction point',
      'Context: 60% of the compaction point (510k of 850k; 51% of the 1.0M window), from token-weather',
      `HANDOFF.md: /repo/HANDOFF.md, saved ${hhmm(T0 - 2 * 60 * 60_000)} (2h ago)`,
      'Save now: asks Claude to write HANDOFF.md',
    ].join('\n'),
  )
})

test('register: threshold, mode and off are kept in the store and win over the options; reset drops them', async ($, on) => {
  const w = await world($, on)
  w.setTw(ctx(600_000, 800_000))
  await w.start(1)
  expect(text(await $.command.run({ command: 'handoff-line', args: 'threshold 70' } as never))).toBe('Threshold 70% of the compaction point.')
  // 75% now crosses the new threshold: the toast names it.
  expect(w.toasts).toContain('Chat is 70% full, save a handoff (/handoff-line now)')
  expect(text(await $.command.run({ command: 'handoff-line', args: 'threshold 99' } as never))).toMatch(/^Threshold must be/)
  await $.command.run({ command: 'handoff-line', args: 'mode auto' } as never)
  await $.command.run({ command: 'handoff-line', args: 'off' } as never)
  expect(Object.fromEntries([...w.store.entries()].filter(([k]) => !k.startsWith('handoff.lastSave')))).toEqual({
    'handoff.threshold': 70,
    'handoff.mode': 'auto',
    'handoff.band': 'off',
  })
  const ui = await mountRow($)
  expect(await ui.find({ key: 'handoff-line' })).toBeUndefined()
  await ui.unmount()
  expect(text(await $.command.run({ command: 'handoff-line', args: 'reset' } as never))).toBe('HANDOFF line settings back to the plugin options.')
  expect(w.state('settings')).toEqual({ band: 'on', mode: 'ask', threshold: 80 })
  expect(text(await $.command.run({ command: 'handoff-line', args: 'what' } as never))).toMatch(/^Usage: \/handoff-line on \| off/)
})
