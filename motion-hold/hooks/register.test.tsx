import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

import type { MotionActive, MotionConfig, MotionSeen } from '../types'
import { CONFIG_PATH, EXAMPLE, HOME, NEVER_MS, NO_STOP, PANE, ROW_KEY, T0, cardText, mountCard, mountRow, pressCard, rowText, world } from './test-kit'

const MOVE = "ssh rig-1.local 'ctl move x 10'"
const STATUS = "ssh rig-1.local 'ctl status'"
const REBOOT = "ssh rig-1.local 'sudo reboot'"
const UNREADABLE = 'ssh rig-1.local bash < run.sh'
const MOVE_SUMMARY = 'run a site motion command on rig-1.local'
const BROKEN_TOAST = 'motion-hold: the site config is broken, remote commands are held (/motion status)'
const NO_STOP_TEXT = 'No stop command is configured (stopCommand in the config file).'
const PERSON_ONLY = 'Only the person can answer a hold.'
const JUST_APPEARED = 'A new hold just appeared: read it, then answer again.'

/**
 * A hook above the gate that abandons the call while the gate holds it, as an
 * interrupted turn does: the gate's `next.signal` aborts. What the gate then
 * answered is toasted, since the call itself resolves to this hook's deny.
 */
const INTERRUPTER: Plugin = {
  name: 'interrupter',
  tier: 'prepend',
  register(on) {
    on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
      const beneath = next(e)
      void beneath.then(
        r => $.ui.toast(`beneath: ${r.deny ?? 'ran'}`),
        () => $.ui.toast('beneath: rejected'),
      )
      await $.process.run(['test-interrupt'], { timeoutMs: 5000 })
      return { deny: 'abandoned above' }
    })
  },
}

const active = (w: { state: (key: string) => unknown }) => w.state('active') as MotionActive | null | undefined
const recent = (w: { state: (key: string) => unknown }) => (w.state('recent') ?? []) as MotionSeen[]
const config = (w: { state: (key: string) => unknown }) => w.state('config') as MotionConfig

test('register 1: a plain command runs untouched', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const r = await w.bash('ls -la')
  expect(r.isRun).toBe(true)
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['ls -la'])
  expect(w.opened).toEqual([])
  expect(w.asked).toEqual([])
  expect(w.notified).toEqual([])
  expect(recent(w)).toEqual([])
  expect(await rowText($)).toBe('')
})

test('register 2: hold, pane, Run once', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const release = w.hang()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  expect(w.ran).toEqual([])
  expect(w.opened).toHaveLength(1)
  expect(w.opened[0]).toMatchObject({ id: PANE, title: 'Motion Hold', focus: true })
  expect(w.notified).toEqual([{ text: `Would ${MOVE_SUMMARY}`, title: 'Motion Hold: holding' }])
  expect(active(w) ?? null).toBeNull()
  const card = await cardText($)
  expect(card).toContain('■ Motion Hold')
  expect(card).toContain(`Would ${MOVE_SUMMARY}`)
  expect(card).toContain('Host rig-1.local')
  expect(card).toContain(`Command ${MOVE}`)
  expect(card).not.toContain('From a subagent')
  expect(card).not.toContain('could not be read with certainty')
  expect(card).toContain('Enter or 2 cancels. Tab then Enter runs it once. Refused after 120 s. Twins: /motion run, /motion cancel.')

  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  // The tool beneath is running now.
  expect(w.ran).toEqual([MOVE])
  expect(w.toasts).toContain('Motion Hold: running it')
  expect(active(w)).toMatchObject({ summary: MOVE_SUMMARY, host: 'rig-1.local', kinds: ['site'], command: MOVE, isBackground: false })
  // Approved at the press, noticed within one 250 ms poll.
  expect(active(w)?.startedAt).toBeGreaterThanOrEqual(T0 + 500)
  expect(active(w)?.startedAt).toBeLessThanOrEqual(T0 + 1_000)
  expect(active(w)?.id).toMatch(/^toolu_/)
  const ui = await mountRow($)
  const row = await ui.find({ key: ROW_KEY })
  expect(row?.text).toContain(' ■ MOTION  ')
  expect(row?.text).toMatch(/run a site motion command on rig-1\.local · since \d\d:\d\d:\d\d/)
  const chip = await ui.find({ type: 'Text', text: /^ ■ MOTION {2}$/ })
  expect(chip?.props).toMatchObject({ backgroundColor: '#f38ba8', color: '#0b0b0f', bold: true })
  expect(await ui.find({ key: 'motion-stop' })).toBeDefined()
  expect(await ui.find({ key: 'motion-clear' })).toBeUndefined()
  await ui.unmount()

  release()
  const r = await call
  expect(r.isRun).toBe(true)
  expect(r.deny).toBeUndefined()
  expect(r.result).toMatchObject({ stdout: 'ok' })
  expect(active(w)).toBeNull()
  expect(await rowText($)).toBe('')
  expect(w.closed).toContain(PANE)
  expect(recent(w)[0]).toMatchObject({ verdict: 'ran', host: 'rig-1.local', command: MOVE })
})

test('register 3: hold, pane, Cancel', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(w.ran).toEqual([])
  expect(r.deny).toBe(
    `Motion Hold held this command and did not run it: the user chose Cancel (or dismissed the dialog). It would: ${MOVE_SUMMARY}. Do not retry it unless the user asks you to. Reading state is not held: status, logs and searches run as usual.`,
  )
  expect(active(w) ?? null).toBeNull()
  expect(recent(w)[0]).toMatchObject({ verdict: 'denied', host: 'rig-1.local' })
  expect(w.toasts).not.toContain('Motion Hold: running it')
})

test('register 4: hold, no answer', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(119_000)
  expect(w.ran).toEqual([])
  await w.clock.advance(2_000)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toContain('no answer within 120 seconds')
  expect(r.deny).toContain('Do not retry it unless the user asks you to')
  expect(w.asked).toEqual([])
  expect(w.closed).toContain(PANE)
})

test('register 4b: the timeoutSeconds option sets the limit', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  expect(await cardText($)).toContain('Refused after 20 s.')
  await w.clock.advance(20_500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toContain('no answer within 20 seconds')
})

test('register 5: narrow terminal, dialog', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, isPlaced: false, answer: 'Run once' })
  await w.start()
  const first = w.bash(MOVE)
  await w.clock.advance(500)
  const ran = await first
  expect(ran.isRun).toBe(true)
  expect(w.asked).toHaveLength(1)
  expect(w.asked[0]?.options).toEqual(['Cancel', 'Run once'])
  expect(w.asked[0]?.header).toBe('Motion Hold')
  expect(w.asked[0]?.question).toContain(`Would ${MOVE_SUMMARY}`)
  expect(w.asked[0]?.question).toContain(`Command ${MOVE}`)
  // A pane that was opened but not placed is closed by the hold too (the
  // first close is the session start's), so no empty card appears later.
  expect(w.closed.filter(id => id === PANE)).toHaveLength(2)

  for (const answer of ['Cancel', 'dismiss', 'Yes', 'run once']) {
    w.setAnswer(answer)
    const call = w.bash(MOVE)
    await w.clock.advance(500)
    const r = await call
    expect(r.isRun, `answer ${answer}`).toBe(false)
    expect(r.deny, `answer ${answer}`).toContain('the user chose Cancel (or dismissed the dialog)')
  }
  expect(w.ran).toEqual([MOVE])
  expect(w.closed.filter(id => id === PANE)).toHaveLength(6)
})

test('register 5b: a dialog nobody answers is refused at the limit', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, isPlaced: false, answer: 'never' })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(19_000)
  expect(w.asked).toHaveLength(1)
  await w.clock.advance(2_000)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toContain('no answer within 20 seconds')
  // The dialog is still up; when it goes, nothing runs.
  await w.clock.advance(NEVER_MS)
  expect(w.ran).toEqual([])
})

test('register 6: interrupted', { plugins: [INTERRUPTER] }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(3_000)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(w.ran).toEqual([])
  const beneath = w.toasts.find(t => t.startsWith('beneath: ')) ?? ''
  expect(beneath).toContain('Motion Hold held this command and did not run it: the turn was interrupted.')
  expect(beneath).toContain('Do not retry it unless the user asks you to')
  expect(w.closed).toContain(PANE)
})

test('register 7: a failing gate refuses', async ($, on) => {
  let isDown = false
  const w = await world($, on, { configText: EXAMPLE, isStateDown: () => isDown })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  isDown = true
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(w.ran).toEqual([])
  expect(r.deny).toBe('Motion Hold failed while checking this call and refused it. Do not retry it unless the user asks you to.')
  // A command that is not held does not depend on the state: a read still runs.
  const read = await w.bash(STATUS)
  expect(read.isRun).toBe(true)
})

test('register 8: a subagent\'s command is held the same', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE, { agentId: 'a1' })
  await w.clock.advance(500)
  expect(w.ran).toEqual([])
  expect(await cardText($)).toContain('From a subagent')
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(true)
  // A subagent's refused call reads the same deny.
  const again = w.bash(MOVE, { agentId: 'a1' })
  await w.clock.advance(500)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await again).deny).toContain('the user chose Cancel')
})

test('register 9: a background launch keeps the row', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE, { run_in_background: true })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(true)
  expect(active(w)).toMatchObject({ isBackground: true, summary: MOVE_SUMMARY })
  const ui = await mountRow($)
  expect((await ui.find({ key: ROW_KEY }))?.text).toContain(' · background')
  expect((await ui.find({ key: 'motion-clear' }))?.props).toMatchObject({ label: 'x: clear', hotkey: 'x' })
  expect((await ui.find({ key: 'motion-stop' }))?.props).toMatchObject({ label: 's: STOP', hotkey: 's' })
  await ui.unmount()
  // A new session start keeps a background entry; /motion clear removes it.
  await w.start()
  expect(active(w)).toMatchObject({ isBackground: true })
  expect(await w.command('clear')).toContain('cleared')
  expect(active(w)).toBeNull()
  expect(await rowText($)).toBe('')
})

test('register 9b: the x button clears a background row, and /clear clears any', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  for (const how of ['button', 'clear', 'resume'] as const) {
    const call = w.bash(MOVE, { run_in_background: true })
    await w.clock.advance(500)
    await pressCard($, 'hold-run')
    await w.clock.advance(500)
    await call
    expect(active(w), how).toMatchObject({ isBackground: true })
    if (how === 'button') {
      const ui = await mountRow($)
      await ui.press({ key: 'motion-clear' })
      await ui.unmount()
      expect(w.toasts.some(t => t.includes('/motion clear'))).toBe(true)
    } else {
      await w.end(how)
    }
    expect(active(w), how).toBeNull()
  }
})

test('register 10: two holds queue', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const a = w.bash(MOVE)
  await w.clock.advance(250)
  const b = w.bash(REBOOT)
  await w.clock.advance(1_000)
  expect(w.opened).toHaveLength(1)
  let card = await cardText($)
  expect(card).toContain(`Would ${MOVE_SUMMARY}`)
  expect(card).not.toContain('reboot or power off')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(1_000)
  expect((await a).isRun).toBe(false)
  expect(w.opened).toHaveLength(2)
  card = await cardText($)
  expect(card).toContain('Would reboot or power off on rig-1.local')
  expect(card).not.toContain(MOVE_SUMMARY)
  await pressCard($, 'hold-run')
  await w.clock.advance(1_000)
  expect((await b).isRun).toBe(true)
  expect(w.ran).toEqual([REBOOT])
})

test('register 11: a broken config holds remote commands', async ($, on) => {
  const w = await world($, on, { configText: '{' })
  await w.start()
  expect(w.toasts.filter(t => t === BROKEN_TOAST)).toHaveLength(1)
  expect(config(w)).toMatchObject({ status: 'broken', path: CONFIG_PATH, hosts: 0, rules: 0, hasStop: false })
  expect(config(w).error.length).toBeGreaterThan(0)
  const call = w.bash("ssh anywhere 'ls'")
  await w.clock.advance(500)
  expect(w.ran).toEqual([])
  expect(await cardText($)).toContain('Would use hardware while the site config is broken')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toContain('use hardware while the site config is broken')
  expect((await w.bash('ls')).isRun).toBe(true)
  // Still broken on a reload: no second toast. Fixed: remote reads run again.
  expect(await w.command('reload')).toContain('BROKEN')
  expect(w.toasts.filter(t => t === BROKEN_TOAST)).toHaveLength(1)
  w.setConfig(EXAMPLE)
  expect(await w.command('reload')).toContain('ok')
  expect((await w.bash(STATUS)).isRun).toBe(true)
  expect(config(w)).toEqual({ status: 'ok', path: CONFIG_PATH, hosts: 2, rules: 3, hasStop: true, error: '' })
})

test('register 11b: a config that cannot be read, or no HOME, is a broken config', async ($, on) => {
  let isDown = true
  const w = await world($, on, { configText: EXAMPLE, isFsDown: () => isDown })
  await w.start()
  expect(config(w).status).toBe('broken')
  expect(w.toasts).toContain(BROKEN_TOAST)
  const call = w.bash(STATUS)
  await w.clock.advance(500)
  expect(w.ran).toEqual([])
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toContain('use hardware while the site config is broken')
  isDown = false
  await w.command('reload')
  expect(config(w).status).toBe('ok')
})

test('register 11c: with no HOME and no path there is no config to trust', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, isHomeless: true })
  await w.start()
  expect(config(w).status).toBe('broken')
  expect(config(w).error).toContain('HOME')
})

test('register 11d: no config file: only the built-in class A rules apply', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(config(w)).toEqual({ status: 'none', path: CONFIG_PATH, hosts: 0, rules: 0, hasStop: false, error: '' })
  expect(w.toasts).toEqual([])
  expect((await w.bash(REBOOT)).isRun).toBe(true)
  expect((await w.bash(MOVE)).isRun).toBe(true)
  const call = w.bash('echo 1 > /sys/class/gpio/gpio17/value')
  await w.clock.advance(500)
  expect(await cardText($)).toContain('Would set a GPIO line')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 11e: the config option names another file', { options: { config: '~/site/motion.json' } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  // The kit only holds the default file: the option's path does not exist.
  expect(config(w)).toMatchObject({ status: 'none', path: `${HOME}/site/motion.json` })
})

test('register 11f: a config path that is not absolute is refused', { options: { config: 'motion.json' } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  expect(config(w).status).toBe('broken')
  expect(w.reads).toEqual([])
})

test('register 12: /motion run needs the person', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  expect(await w.command('run')).toContain('No hold is pending')
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  for (const origin of ['plugin', 'sdk', 'peer'] as const) {
    expect(await w.command('run', origin), origin).toBe(PERSON_ONLY)
    expect(await w.command('cancel', origin), origin).toBe(PERSON_ONLY)
  }
  await w.clock.advance(1_000)
  expect(w.ran).toEqual([])
  expect(await cardText($)).toContain(`Would ${MOVE_SUMMARY}`)
  expect(await w.command('status')).toContain(`Hold pending: Would ${MOVE_SUMMARY}`)
  expect(await w.command('run', 'composer')).toContain('Running it once')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(true)
  // The bridge is the person too; cancel refuses.
  const again = w.bash(MOVE)
  await w.clock.advance(500)
  expect(await w.command('cancel', 'bridge')).toContain('Cancelled')
  await w.clock.advance(500)
  expect((await again).deny).toContain('the user chose Cancel')
})

test('register 12b: /motion run answers only a hold the person can have read', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(250)
  expect(w.opened).toHaveLength(1)
  // Right after the hold appears: nothing is approved, the hold stays.
  expect(await w.command('run')).toBe(JUST_APPEARED)
  await w.clock.advance(1_000)
  expect(await w.command('run')).toBe(JUST_APPEARED)
  expect(w.ran).toEqual([])
  expect(await w.command('status')).toContain(`Hold pending: Would ${MOVE_SUMMARY}`)
  // 1500 ms after it was shown it runs, once.
  await w.clock.advance(250)
  expect(await w.command('run')).toContain('Running it once')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(true)
  expect(w.ran).toEqual([MOVE])

  // A hold that only just took the slot from an answered one is not approved.
  const a = w.bash(MOVE)
  await w.clock.advance(250)
  const b = w.bash(REBOOT)
  await w.clock.advance(250)
  // Cancel needs no wait: it refuses at once.
  expect(await w.command('cancel')).toContain('Cancelled')
  await w.clock.advance(500)
  expect((await a).isRun).toBe(false)
  expect(await cardText($)).toContain('Would reboot or power off on rig-1.local')
  expect(await w.command('run')).toBe(JUST_APPEARED)
  await w.clock.advance(1_500)
  expect(w.ran).toEqual([MOVE])
  expect(await w.command('run')).toContain('Running it once')
  await w.clock.advance(500)
  expect((await b).isRun).toBe(true)
  expect(w.ran).toEqual([MOVE, REBOOT])
})

test('register 12c: /motion run waits the same on the dialog path', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, isPlaced: false, answer: 'never' })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(250)
  expect(w.asked).toHaveLength(1)
  expect(await w.command('run')).toBe(JUST_APPEARED)
  await w.clock.advance(1_250)
  expect(await w.command('run')).toContain('Running it once')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(true)
  // Cancel at once on the dialog path too.
  const again = w.bash(MOVE)
  await w.clock.advance(250)
  expect(await w.command('cancel')).toContain('Cancelled')
  await w.clock.advance(500)
  expect((await again).deny).toContain('the user chose Cancel')
  await w.clock.advance(NEVER_MS)
  expect(w.ran).toEqual([MOVE])
})

test('register 13: a new session start clears a stale row', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const release = w.hang()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  expect(active(w)).toMatchObject({ isBackground: false })
  await w.start()
  expect(active(w)).toBeNull()
  expect(await rowText($)).toBe('')
  release()
  expect((await call).isRun).toBe(true)
  expect(active(w)).toBeNull()
})

test('register 14: /motion test shows the verdict and runs nothing', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const text = await w.command(`test ${MOVE}`)
  expect(text).toContain('would hold')
  expect(text).toContain('site')
  expect(text).toContain('rig-1.local')
  expect(text).toContain('certain')
  expect(await w.command(`test "${MOVE}"`)).toContain('would hold')
  expect(await w.command("test ssh rig-1.local 'ctl move x 5")).toContain('not certain')
  expect(await w.command(`test ${STATUS}`)).toContain('would pass (no-match)')
  expect(await w.command('test ls -la')).toContain('would pass (read-only)')
  expect(await w.command('test')).toContain('Usage')
  await w.clock.advance(1_000)
  expect(w.ran).toEqual([])
  expect(w.runs).toEqual([])
  expect(w.opened).toEqual([])
  expect(recent(w)).toEqual([])
})

test('register 15: /motion stop', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  // No motion is active: the argv needs a host and there is none.
  expect(await w.command('stop')).toContain('needs a host')
  await w.clock.advance(100)
  expect(w.runs).toEqual([])
  const call = w.bash(MOVE, { run_in_background: true })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  await call
  expect(await w.command('stop', 'plugin')).toBe('Only the person can send STOP.')
  await w.clock.advance(100)
  expect(w.runs).toEqual([])
  await w.command('stop')
  await w.clock.advance(100)
  expect(w.runs).toEqual([['ssh', 'rig-1.local', 'ctl stop all']])
  expect(w.toasts.some(t => t.startsWith('STOP sent (exit 0)'))).toBe(true)
  // The button is the same act.
  const ui = await mountRow($)
  await ui.press({ key: 'motion-stop' })
  await w.clock.advance(100)
  await ui.unmount()
  expect(w.runs).toHaveLength(2)
  // STOP is never held, and never opens a card.
  expect(w.opened).toHaveLength(1)
})

test('register 15b: /motion stop without a stop command', async ($, on) => {
  const w = await world($, on, { configText: NO_STOP })
  await w.start()
  expect(await w.command('stop')).toBe(NO_STOP_TEXT)
  const release = w.hang()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const ui = await mountRow($)
  const row = await ui.find({ key: ROW_KEY })
  expect(row?.text).toMatch(/· Esc interrupts here; the hardware may keep moving$/)
  expect(await ui.find({ key: 'motion-stop' })).toBeUndefined()
  await ui.unmount()
  expect(await w.command('stop')).toBe(NO_STOP_TEXT)
  await w.clock.advance(100)
  expect(w.runs).toEqual([])
  release()
  await call
})

test('register 15c: a stop that fails says so', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, stop: { exitCode: 255, stderr: 'ssh: connect to host rig-1.local: timed out\nmore' } })
  await w.start()
  const call = w.bash(MOVE, { run_in_background: true })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  await call
  await w.command('stop')
  await w.clock.advance(100)
  expect(w.toasts.some(t => t.startsWith('STOP failed: ssh: connect to host rig-1.local: timed out'))).toBe(true)
  expect(w.toasts.some(t => t.includes('more'))).toBe(false)
})

test('register 15d: a stop that cannot start says so', async ($, on) => {
  const w = await world($, on, { configText: JSON.stringify({ hosts: ['rig-1.local'], stopCommand: ['ctl', 'stop', 'all'] }), stop: 'reject' })
  await w.start()
  // No host is needed by this argv, so it runs with no motion active.
  await w.command('stop')
  await w.clock.advance(100)
  expect(w.runs).toEqual([['ctl', 'stop', 'all']])
  expect(w.toasts.some(t => t.startsWith('STOP failed: '))).toBe(true)
})

test('register 16: the row yields', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE, { run_in_background: true })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  await call
  expect(await rowText($)).toContain(' ■ MOTION  ')
  for (const [hasSurvey, surface] of [
    [true, 'terminal'],
    [false, 'desktop'],
  ] as const) {
    const ui = await mountRow($, 160, hasSurvey, surface)
    expect(await ui.find({ key: ROW_KEY }), `${surface} ${hasSurvey}`).toBeUndefined()
    expect(await ui.findAll({ text: 'MOTION' }), `${surface} ${hasSurvey}`).toEqual([])
    expect(await ui.findAll({ type: 'Button' }), `${surface} ${hasSurvey}`).toEqual([])
    expect(await ui.keepsBeneath()).toBe(true)
    await ui.unmount()
  }
  // The row draws its own keyed Box and nothing of another mod's.
  const ui = await mountRow($)
  const drawn = (await ui.drawn()) as { type?: string; props?: { key?: string } }
  expect(drawn.type).toBe('Box')
  expect(drawn.props?.key).toBe(ROW_KEY)
  await ui.unmount()
})

test('register 16b: the card is drawn on the terminal only', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  const ui = await mountCard($, 100, 'desktop')
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  expect(await ui.findAll({ text: 'Motion Hold' })).toEqual([])
  await ui.unmount()
  expect(await w.command('cancel')).toContain('Cancelled')
  await w.clock.advance(500)
  await call
  // With nothing held the pane says so.
  expect(await cardText($)).toContain('No hold is pending')
})

test('register 17: recent keeps what passed on a configured host', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  expect(await w.command('recent')).toContain('Nothing yet')
  expect((await w.bash(STATUS)).isRun).toBe(true)
  expect(recent(w)).toEqual([{ at: T0 + 20, verdict: 'passed', why: 'no-match', host: 'rig-1.local', command: STATUS }])
  const text = await w.command('recent')
  expect(text).toContain('passed')
  expect(text).toContain(STATUS)
  expect(text).toContain('rig-1.local')
  // A command that names no configured host and is not held leaves no line.
  await w.bash('ls -la')
  await w.bash("ssh other.example 'uptime'")
  expect(recent(w)).toHaveLength(1)
  // The newest 30 are kept, the newest 20 listed, newest first.
  for (let i = 0; i < 34; i++) await w.bash(`ssh rig-1.local 'ctl status ${i}'`)
  expect(recent(w)).toHaveLength(30)
  expect(recent(w)[0]?.command).toBe("ssh rig-1.local 'ctl status 33'")
  const lines = (await w.command('recent')).split('\n').filter(l => l.includes('passed'))
  expect(lines).toHaveLength(20)
  expect(lines[0]).toContain('ctl status 33')
})

test('register 18: a refused unreadable input names the workaround', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const call = w.bash(UNREADABLE)
  await w.clock.advance(500)
  expect(await cardText($)).toContain('Would run input that cannot be read on rig-1.local')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toMatch(
    /searches run as usual\. Sending the same input to the host another way, such as copying it over and running it there, counts as a retry\.$/,
  )
  const move = w.bash(MOVE)
  await w.clock.advance(500)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const refused = await move
  expect(refused.deny).not.toContain('counts as a retry')
  expect(refused.deny).toMatch(/searches run as usual\.$/)
})

test('register: the card shows a doubtful read, and cleans and cuts the command', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const doubtful = w.bash("ssh rig-1.local 'ctl move x 5")
  await w.clock.advance(500)
  expect(await cardText($)).toContain('The command could not be read with certainty, so it is held.')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  await doubtful
  const long = `ssh rig-1.local 'ctl move x 1 \u001b[31m\u0007 ${'y'.repeat(900)}'`
  const call = w.bash(long)
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
  expect(card).toContain('ctl move x 1 [31m')
  expect(card).not.toContain('y'.repeat(601))
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  await call
  expect((recent(w)[0]?.command ?? '').length).toBeLessThanOrEqual(160)
})

test('register: /motion status, help and an unknown word', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const status = await w.command('')
  expect(status).toContain('Config: ok')
  expect(status).toContain(CONFIG_PATH)
  expect(status).toContain('2 hosts')
  expect(status).toContain('3 rules')
  expect(status).toContain('No hold is pending')
  expect(status).toContain('No motion is active')
  expect(await w.command('status')).toBe(status)
  expect(await w.command('nonsense')).toContain('Usage: /motion')
  expect(await w.command('help')).toContain('status | recent | test <command> | run | cancel | stop | clear | reload')
  const call = w.bash(MOVE, { run_in_background: true })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  await call
  expect(await w.command('status')).toMatch(/Active: run a site motion command on rig-1\.local · since \d\d:\d\d:\d\d · background/)
})

test('register: a warning in the config is shown, not fatal', async ($, on) => {
  const w = await world($, on, { configText: JSON.stringify({ hosts: ['rig-1.local'], extra: 1 }) })
  await w.start()
  expect(config(w)).toMatchObject({ status: 'ok', hosts: 1, rules: 0, hasStop: false })
  expect(config(w).error).toContain('extra')
  expect(await w.command('status')).toContain('extra')
  expect(w.toasts).toEqual([])
})

test('register: a call before any session start still reads the config', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  const call = w.bash(MOVE)
  await w.clock.advance(500)
  expect(w.ran).toEqual([])
  expect(w.reads).toEqual([CONFIG_PATH])
  await w.command('cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register: an approval covers one call only', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const first = w.bash(MOVE)
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  expect((await first).isRun).toBe(true)
  // The very same command again is held again.
  const second = w.bash(MOVE)
  await w.clock.advance(500)
  expect(w.ran).toEqual([MOVE])
  expect(w.opened).toHaveLength(2)
  await w.clock.advance(21_000)
  expect((await second).isRun).toBe(false)
  expect(w.ran).toEqual([MOVE])
})

test('register: a Monitor command is held like a Bash command', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  // Cancel refuses: the watch never starts.
  const refused = w.monitor({ command: MOVE })
  await w.clock.advance(500)
  expect(w.watched).toEqual([])
  expect(w.opened).toHaveLength(1)
  const card = await cardText($)
  expect(card).toContain(`Would ${MOVE_SUMMARY}`)
  expect(card).toContain(`Command ${MOVE}`)
  expect(card).toContain('Tool Monitor: a watch that keeps running until its command exits or it is stopped')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await refused
  expect(r.isRun).toBe(false)
  expect(w.watched).toEqual([])
  expect(r.deny).toBe(
    `Motion Hold held this command (a Monitor watch) and did not run it: the user chose Cancel (or dismissed the dialog). It would: ${MOVE_SUMMARY}. Do not retry it unless the user asks you to. Reading state is not held: status, logs and searches run as usual.`,
  )
  expect(recent(w)[0]).toMatchObject({ verdict: 'denied', host: 'rig-1.local', command: MOVE })

  // Run once: the watch starts, once, and its row stays as a background entry.
  const approved = w.monitor({ command: MOVE })
  await w.clock.advance(500)
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const ok = await approved
  expect(ok.isRun).toBe(true)
  expect(ok.deny).toBeUndefined()
  expect(w.watched).toHaveLength(1)
  expect(w.watched[0]).toMatchObject({ tool: 'Monitor', command: MOVE })
  expect(active(w)).toMatchObject({ summary: MOVE_SUMMARY, host: 'rig-1.local', isBackground: true, command: MOVE })
  expect(await rowText($)).toContain(' · background')
  expect(recent(w)[0]).toMatchObject({ verdict: 'ran', host: 'rig-1.local' })
  expect(await w.command('clear')).toContain('cleared')
  expect(active(w)).toBeNull()
  // A Bash card does not name a tool.
  const bash = w.bash(MOVE)
  await w.clock.advance(500)
  expect(await cardText($)).not.toContain('Tool Monitor')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await bash).deny).toMatch(/^Motion Hold held this command and did not run it: /)
})

test('register: a Monitor command that is not held passes with no card', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  for (const command of ['tail -f /var/log/app.log', STATUS]) {
    const r = await w.monitor({ command })
    expect(r.isRun, command).toBe(true)
    expect(r.deny, command).toBeUndefined()
  }
  expect(w.ran).toEqual(['tail -f /var/log/app.log', STATUS])
  expect(w.opened).toEqual([])
  expect(w.asked).toEqual([])
  expect(active(w) ?? null).toBeNull()
  // What passed on a configured host is listed, as for Bash.
  expect(recent(w)).toEqual([{ at: T0 + 20, verdict: 'passed', why: 'no-match', host: 'rig-1.local', command: STATUS }])
})

test('register: a Monitor call with a WebSocket and no command passes untouched', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  const ws = { url: 'wss://rig-1.local/events' }
  const r = await w.monitor({ ws })
  expect(r.isRun).toBe(true)
  expect(r.deny).toBeUndefined()
  expect(w.watched).toHaveLength(1)
  expect(w.watched[0]).toMatchObject({ tool: 'Monitor', ws })
  expect(w.watched[0]?.command).toBeUndefined()
  expect(w.opened).toEqual([])
  expect(recent(w)).toEqual([])
  expect(active(w) ?? null).toBeNull()
})

test('register: a failing gate refuses a Monitor call', async ($, on) => {
  let isDown = false
  const w = await world($, on, { configText: EXAMPLE, isStateDown: () => isDown })
  await w.start()
  const call = w.monitor({ command: MOVE })
  await w.clock.advance(500)
  isDown = true
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(w.watched).toEqual([])
  expect(r.deny).toBe('Motion Hold failed while checking this call and refused it. Do not retry it unless the user asks you to.')
})
