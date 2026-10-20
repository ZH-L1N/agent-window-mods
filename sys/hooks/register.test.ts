import { expect, test } from 'claude-code/testing'

import { MACHINE, T0, mountRow, readerRuns, world } from './test-kit'

const READER = [
  ['sysctl', '-n', 'vm.loadavg'],
  ['sysctl', '-n', 'hw.ncpu'],
  ['sysctl', '-n', 'hw.memsize'],
  ['vm_stat'],
  ['pmset', '-g', 'batt'],
]

test('register: the first reading at the start, then one every 5 s, each command with a 2 s limit', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(readerRuns(w)).toEqual(READER)
  expect(w.inits.every(i => (i as { timeoutMs?: number }).timeoutMs === 2_000)).toBe(true)
  expect(w.state('reading')).toEqual({
    cpu: 6,
    ram: { used: 21_299_200_000, total: 64 * 1024 ** 3 },
    battery: { percent: 64, isCharging: false },
    readAt: T0 + 10,
  })
  await w.clock.advance(4_000)
  expect(readerRuns(w).length).toBe(5)
  await w.clock.advance(1_000)
  expect(readerRuns(w).length).toBe(10)
  await w.clock.advance(10_000)
  expect(readerRuns(w).length).toBe(20)
})

test('register: the timer stops when the row is off, and starts again when it is on', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.clock.advance(5_000)
  const before = readerRuns(w).length
  expect(await w.command('off')).toBe('SYS line off (no row, no reading; /sys now and btop still work).')
  expect(w.store.get('sys.band')).toBe('off')
  await w.clock.advance(60_000)
  expect(readerRuns(w).length).toBe(before)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'sys-line' })).toBeUndefined()
  await ui.unmount()
  expect(await w.command('on')).toBe('SYS line on.')
  await w.clock.advance(10)
  expect(readerRuns(w).length).toBe(before + 5)
  await w.clock.advance(5_000)
  expect(readerRuns(w).length).toBe(before + 10)
})

test('register: two overlapping starts leave one timer, and off stops it for good', async ($, on) => {
  // The surfaces answer late, so the start's reader and /sys on's wait at once.
  const w = await world($, on, { surfacesDelayMs: 100 })
  const started = $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  const turnedOn = w.command('on')
  await w.clock.advance(100)
  await started
  expect(await turnedOn).toBe('SYS line on.')
  await w.clock.advance(10)
  // Each live timer's tick asks the surfaces once: one timer, one ask per 5 s.
  const before = w.surfaceReads()
  await w.clock.advance(5_000)
  expect(w.surfaceReads() - before).toBe(1)
  expect(await w.command('off')).toBe('SYS line off (no row, no reading; /sys now and btop still work).')
  await w.clock.advance(60_000)
  // Back on with a single start: still one ask per tick, so nothing orphaned survived the off.
  const onAgain = w.command('on')
  await w.clock.advance(110)
  expect(await onAgain).toBe('SYS line on.')
  const again = w.surfaceReads()
  await w.clock.advance(5_000)
  expect(w.surfaceReads() - again).toBe(1)
})

test('register: the store\'s off wins over the option at the start: no reading at all', async ($, on) => {
  const w = await world($, on, { store: { 'sys.band': 'off' } })
  await w.start()
  await w.clock.advance(30_000)
  expect(readerRuns(w)).toEqual([])
})

test('register: the option off keeps the reader stopped', { options: { band: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.clock.advance(30_000)
  expect(readerRuns(w)).toEqual([])
})

test('register: no terminal surface, no reading; the timer stops when the terminal goes', async ($, on) => {
  const w = await world($, on, { surfaces: [] })
  await w.start()
  await w.clock.advance(30_000)
  expect(readerRuns(w)).toEqual([])

  w.setSurfaces(['terminal'])
  await w.command('on')
  await w.clock.advance(5_010)
  const running = readerRuns(w).length
  expect(running).toBe(10)
  w.setSurfaces(['desktop'])
  await w.clock.advance(30_000)
  expect(readerRuns(w).length).toBe(running)
})

test('register: /sys now reads at once and answers the figures', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('now')).toBe('CPU 6% · RAM 19.8/64G (31%) · ⚡ 64% (not charging)')
  expect(await w.command('')).toBe('CPU 6% · RAM 19.8/64G (31%) · ⚡ 64% (not charging)')
  expect(await w.command('help')).toBe('Usage: /sys on | off | now | btop')
})

test('register: /sys btop outside herdr answers that it needs a herdr pane and runs nothing', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('btop')).toBe('btop needs a herdr pane (/sys btop)')
  expect(w.runs.filter(a => a[0] === 'herdr')).toEqual([])
})

test('register: /sys btop in herdr splits a pane below and runs btop in it', async ($, on) => {
  const w = await world($, on, { env: { HERDR_ENV: '1' } })
  await w.start()
  expect(await w.command('btop')).toBe('btop opened in pane w1:p9 below (/sys btop)')
  expect(w.runs.filter(a => a[0] === 'herdr')).toEqual([
    ['herdr', 'pane', 'split', '--current', '--direction', 'down', '--no-focus', '--cwd', '/repo'],
    ['herdr', 'pane', 'run', 'w1:p9', 'XDG_CONFIG_HOME=$HOME/.config/btop-mini btop'],
  ])
})

test('register: a split with no pane in its answer runs nothing more', async ($, on) => {
  const w = await world($, on, { env: { HERDR_ENV: '1' }, machine: { ...MACHINE, split: '{"result":{}}' } })
  await w.start()
  expect(await w.command('btop')).toBe('btop: herdr pane split gave no pane (/sys btop)')
  expect(w.runs.filter(a => a[0] === 'herdr').length).toBe(1)
})

test('register: the btop button opens it from a timer and toasts, naming the command', async ($, on) => {
  const w = await world($, on, { env: { HERDR_ENV: '1' } })
  await w.start()
  const ui = await mountRow($)
  await ui.press({ key: 'sys-btop' })
  // From a timer, not inside the press.
  expect(w.runs.filter(a => a[0] === 'herdr')).toEqual([])
  await w.clock.advance(100)
  expect(w.runs.filter(a => a[0] === 'herdr').length).toBe(2)
  expect(w.toasts).toEqual(['btop opened in pane w1:p9 below (/sys btop)'])
  await ui.unmount()
})

test('register: a second btop press while one is opening splits no second pane', async ($, on) => {
  const w = await world($, on, { env: { HERDR_ENV: '1' }, splitDelayMs: 1_000 })
  await w.start()
  const ui = await mountRow($)
  await ui.press({ key: 'sys-btop' })
  await ui.press({ key: 'sys-btop' })
  await w.clock.advance(100)
  expect(await w.command('btop')).toBe('btop is already opening (/sys btop)')
  await w.clock.advance(1_000)
  expect(w.runs.filter(a => a[0] === 'herdr' && a[2] === 'split').length).toBe(1)
  expect(w.toasts).toEqual(['btop is already opening (/sys btop)', 'btop opened in pane w1:p9 below (/sys btop)'])
  await ui.unmount()
})

test('register: the btop button outside herdr toasts that it needs a herdr pane', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const ui = await mountRow($)
  await ui.press({ key: 'sys-btop' })
  await w.clock.advance(100)
  expect(w.toasts).toEqual(['btop needs a herdr pane (/sys btop)'])
  await ui.unmount()
})

test('register: a failed command leaves only its part out of the reading', async ($, on) => {
  const { vmStat: _gone, ...rest } = MACHINE
  const w = await world($, on, { machine: rest })
  await w.start()
  expect(w.state('reading')).toMatchObject({ cpu: 6, ram: null, battery: { percent: 64 } })
})
