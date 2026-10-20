// Section 1 of plan 2026-10-20-boards-codemap-recap: Monitor watchers and cron
// timers as runs, stale-notification greying, the caffeinate hold and ALL DONE.
// Nothing runs for real: $.process, $.audio and the tools are the test kit's fakes.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CAFFEINE, STALE_GREY } from './band'
import { ALL_DONE } from './kit'
import { T0, bandProps, paneProps, PLUGIN, world } from './test-kit'
import { cronNext, eventsOf, fmtClock, fmtLeft, targetOf } from './watch'

const mountBand = ($: Engine, cols = 160) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(cols) })
const mountPane = ($: Engine, cols = 80) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'agents', props: paneProps(cols) })
const lineOf = async (ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }) => (await ui.find({ key: 'agents-line' }))?.text

test('watch: helpers read targets, time left, cron fire times and event rows', () => {
  expect(targetOf('herdr agent wait w1:p6 --timeout 1700000')).toBe('w1:p6')
  expect(targetOf('gh run watch 18234567890 --exit-status')).toBe('18234567890')
  expect(targetOf('until curl -s deploy/a15f4e9c2b | grep ok; do sleep 5; done')).toBeUndefined()
  expect(targetOf('scripts/wait-deploy.sh a15f4e9c2b')).toBe('a15f4e9')
  expect(targetOf('tail -f build.log')).toBeUndefined()
  expect([fmtLeft(45_000), fmtLeft(12 * 60_000), fmtLeft(65 * 60_000), fmtLeft(50 * 3_600_000)]).toEqual(['45s', '12m', '1h05m', '2d'])
  // 20:30 local on the day of `from`, then the next day for a time already past.
  const from = new Date(2026, 9, 20, 19, 49, 10).getTime()
  expect(cronNext('30 20 * * *', from)).toBe(new Date(2026, 9, 20, 20, 30).getTime())
  expect(cronNext('*/15 * * * *', from)).toBe(new Date(2026, 9, 20, 20, 0).getTime())
  expect(cronNext('0 9 * * 1-5', from)).toBe(new Date(2026, 9, 21, 9, 0).getTime())
  expect(cronNext('0 9 * * 7', from)).toBe(new Date(2026, 9, 25, 9, 0).getTime())
  expect(cronNext('not a cron', from)).toBeUndefined()
  const text = '<task-notification>\n<task-id>m1</task-id>\n<summary>Monitor event: "x"</summary>\n<event>reviewer settled: done\nresult.md present</event>\n</task-notification>'
  expect(eventsOf(text)).toEqual([{ id: 'm1', event: 'reviewer settled: done' }])
  expect(eventsOf('<task-notification><task-id>m1</task-id><status>completed</status></task-notification>')).toEqual([])
})

test('watch: a Monitor call is a watch run: band entry with target and time left, Watching in the pane, toast on end', async ($, on) => {
  const w = await world($, on, true)
  await w.monitor('deploy', 'scripts/wait-deploy.sh a15f4e9c2b', 'm1', { timeoutMs: 15 * 60_000 })
  expect(await w.runs()).toMatchObject([
    { id: 'w-m1', kind: 'watch', taskId: 'm1', type: 'watch', target: 'a15f4e9', description: 'deploy', nextAt: T0 + 15 * 60_000, status: 'running' },
  ])
  await w.clock.advance(3 * 60_000)
  const band = await mountBand($)
  expect(await lineOf(band)).toMatch(/◎ AGENTS {2} watch deploy a15f4e9 ⏳ 12m$/)
  // `×1` counts it; the short form calls it a task.
  expect((await band.find({ key: 'agents-crew' }))?.props.label).toBe('×1')
  await band.unmount()
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /^Watching · 1 ─+$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^watch deploy a15f4e9 · ⏳ 12m$/ })).toBeDefined()
  // No mascot and no number for a watch.
  expect(await pane.find({ key: 'mascot-w-m1' })).toBeUndefined()
  expect(await pane.find({ key: 'num-w-m1' })).toBeUndefined()
  await pane.unmount()
  await w.event('m1', 'build 3/4 passed')
  expect((await w.runs())[0]?.lastEvent).toBe('build 3/4 passed')
  await w.notify('m1', { status: 'completed' })
  expect(await w.runs()).toMatchObject([{ status: 'finished', endedAt: T0 + 3 * 60_000 }])
  expect(w.toasts).toEqual(['✓ watch "deploy" ended after 3:00'])
})

test('watch: a persistent watch shows its elapsed time', async ($, on) => {
  const w = await world($, on, true)
  await w.monitor('tail the log', 'tail -f build.log', 'm2', { persistent: true })
  await w.clock.advance(42_000)
  const band = await mountBand($)
  expect(await lineOf(band)).toMatch(/watch tail the log ⏳ 0:42$/)
  await band.unmount()
})

test('watch: a second watch on a target already done greys for 10 s instead of toasting again', async ($, on) => {
  const w = await world($, on)
  await w.monitor('reviewer finishing', 'herdr agent wait w1:p6', 'm1')
  await w.notify('m1', { status: 'completed' })
  expect(w.toasts).toHaveLength(1)
  await w.clock.advance(30_000)
  await w.monitor('reviewer finishing, second wait', 'herdr agent wait w1:p6', 'm2')
  await w.clock.advance(5_000)
  await w.notify('m2', { status: 'completed' })
  // No second toast; the entry is grey while it lingers.
  expect(w.toasts).toHaveLength(1)
  const second = (await w.runs()).find(a => a.id === 'w-m2')
  expect(second).toMatchObject({ status: 'finished', staleAt: T0 + 35_000 })
  const band = await mountBand($)
  const words = (await band.findAll({ type: 'Text', text: /reviewer finishing, s/ })).filter(el => el.props.color !== undefined)
  expect(words.map(el => el.props.color)).toEqual([STALE_GREY])
  expect((await band.find({ type: 'Text', text: /^watch$/ }))?.props.color).toBe(STALE_GREY)
  await band.unmount()
})

test('watch: a later wait on a target done minutes ago is fresh: its events update and its end toasts', async ($, on) => {
  const w = await world($, on)
  await w.monitor('reviewer round 1', 'herdr agent wait w1:p6', 'm1')
  await w.notify('m1', { status: 'completed' })
  await w.clock.advance(30_000)
  await w.monitor('reviewer round 2', 'herdr agent wait w1:p6', 'm2')
  await w.clock.advance(4 * 60_000)
  await w.event('m2', 'still working')
  await w.notify('m2', { status: 'completed' })
  const second = (await w.runs()).find(a => a.id === 'w-m2')
  expect(second).toMatchObject({ status: 'finished', lastEvent: 'still working' })
  expect(second?.staleAt).toBeUndefined()
  expect(w.toasts).toHaveLength(2)
})

test('watch: an event for a watch that already ended greys its entry back into the band for 10 s', async ($, on) => {
  const w = await world($, on, true)
  await w.monitor('deploy', 'scripts/wait-deploy.sh a15f4e9c2b', 'm1')
  await w.notify('m1', { status: 'completed' })
  await w.clock.advance(60_000)
  let band = await mountBand($)
  expect(await lineOf(band)).toBeUndefined()
  await band.unmount()
  await w.event('m1', 'late line')
  band = await mountBand($)
  expect(await lineOf(band)).toMatch(/watch deploy a15f4e9 ✓$/)
  expect((await band.find({ type: 'Text', text: /^watch$/ }))?.props.color).toBe(STALE_GREY)
  await band.unmount()
  await w.clock.advance(11_000)
  band = await mountBand($)
  expect(await lineOf(band)).toBeUndefined()
  await band.unmount()
  expect(w.toasts).toEqual(['✓ watch "deploy" ended after 0:00'])
})

test('watch: a cron is an entry `cron 20:30 in 41m`; CronDelete ends it silently', async ($, on) => {
  const w = await world($, on)
  const fire = T0 + 41 * 60_000
  await w.cronCreate('30 20 * * *', 'check the deploy', 'c1', { nextFireAt: fire })
  expect(await w.runs()).toMatchObject([{ id: 'cron-c1', kind: 'cron', target: 'c1', isRecurring: true, nextAt: fire, description: 'check the deploy' }])
  const band = await mountBand($)
  expect(await lineOf(band)).toMatch(new RegExp(`cron ${fmtClock(fire)} in 41m$`))
  await band.unmount()
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: `cron ${fmtClock(fire)} in 41m · "check the deploy"` })).toBeDefined()
  await pane.unmount()
  await w.cronDelete('c1')
  expect(await w.runs()).toMatchObject([{ status: 'finished' }])
  expect(w.toasts).toEqual([])
})

test('watch: a one-shot cron ends when it fires; a recurring one moves to its next fire time', async ($, on) => {
  const w = await world($, on)
  await w.cronCreate('7 5 26 9 *', 'Scheduled check of the backfill', 'c1', { recurring: false })
  await w.cronCreate('*/30 * * * *', 'Poll the PR', 'c2')
  const recurring = (await w.runs()).find(a => a.id === 'cron-c2')
  expect(recurring?.nextAt).toBe(cronNext('*/30 * * * *', T0))
  await w.cronFire('Scheduled check of the backfill')
  await w.clock.advance(31 * 60_000)
  await w.cronFire('Poll the PR')
  const [once, again] = await w.runs()
  expect(once).toMatchObject({ status: 'finished' })
  expect(again).toMatchObject({ status: 'running', nextAt: cronNext('*/30 * * * *', T0 + 31 * 60_000) })
})

test('watch: the caffeinate hold runs while work is in flight, re-arms after a minute when it ends early, stops when the set empties; ☕ on the row', async ($, on) => {
  const w = await world($, on, true, {}, { isChildHeld: true })
  await w.spawn('scout')
  await w.clock.advance(1_000)
  expect(w.spawns).toEqual([['caffeinate', '-i', '-t', '600']])
  expect(w.live()).toBe(1)
  expect(w.state('isCaffeinated')).toBe(true)
  const band = await mountBand($)
  expect(await band.find({ type: 'Text', text: CAFFEINE })).toBeDefined()
  await band.unmount()
  // The child ended within a minute of its start (it could not run): no new one for a minute,
  // then the tick spawns another while work still runs (as it does once -t 600 runs out).
  w.exitChildren()
  await w.clock.advance(1_000)
  expect(w.spawns).toHaveLength(1)
  expect(w.state('isCaffeinated')).toBe(false)
  await w.clock.advance(60_000)
  expect(w.spawns).toHaveLength(2)
  expect(w.live()).toBe(1)
  await w.finish('a1')
  await w.clock.advance(1_000)
  expect(w.live()).toBe(0)
  expect(w.state('isCaffeinated')).toBe(false)
  expect(w.spawns).toHaveLength(2)
})

test('watch: caffeinate=off holds nothing', { options: { caffeinate: 'off' } }, async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('scout')
  await w.clock.advance(3_000)
  expect(w.spawns).toEqual([])
})

test('watch: a cron waiting to fire holds nothing and does not keep ALL DONE back', async ($, on) => {
  const w = await world($, on, true, {}, { isChildHeld: true })
  await w.cronCreate('30 20 * * *', 'check the deploy', 'c1')
  await w.bash('sleep 5')
  await w.clock.advance(1_000)
  expect(w.spawns).toHaveLength(1)
  await w.notify('b1', { status: 'completed' })
  await w.clock.advance(1_000)
  expect(w.live()).toBe(0)
  expect(w.toasts).toEqual(['✓ sh "sleep 5" finished in 0:01', ALL_DONE])
})

test('watch: ALL DONE toasts once when the last subagent, shell or watch ends; silent chime by default', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('one')
  await w.monitor('deploy', 'scripts/wait-deploy.sh a15f4e9c2b', 'm1')
  await w.clock.advance(2_000)
  await w.finish('a1')
  await w.clock.advance(2_000)
  expect(w.toasts.filter(t => t === ALL_DONE)).toHaveLength(0)
  await w.notify('m1', { status: 'completed' })
  await w.clock.advance(3_000)
  expect(w.toasts.filter(t => t === ALL_DONE)).toHaveLength(1)
  expect(w.plays).toEqual([])
})

test('watch: sound=on plays the chime with ALL DONE', { options: { sound: 'on' } }, async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('one')
  await w.clock.advance(1_000)
  await w.finish('a1')
  await w.clock.advance(1_000)
  expect(w.toasts).toContain(ALL_DONE)
  expect(w.plays).toEqual(['assets/done.wav'])
})

test('watch: toasts=off raises no ALL DONE and plays nothing, even with sound on', { options: { toasts: 'off', sound: 'on' } }, async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('one')
  await w.clock.advance(1_000)
  await w.finish('a1')
  await w.clock.advance(1_000)
  expect(w.toasts).toEqual([])
  expect(w.plays).toEqual([])
})

test('watch: an event seen again (its queue record, then its row) after the watch ended does not grey it', async ($, on) => {
  const w = await world($, on)
  await w.monitor('reviewer finishing', 'herdr agent wait w1:p6', 'm1')
  await w.event('m1', 'reviewer settled: done')
  await w.notify('m1', { status: 'completed', door: 'queue' })
  await w.event('m1', 'reviewer settled: done')
  await w.notify('m1', { status: 'completed' })
  const [run] = await w.runs()
  expect(run).toMatchObject({ status: 'finished', lastEvent: 'reviewer settled: done' })
  expect(run?.staleAt).toBeUndefined()
  expect(w.toasts).toEqual(['✓ watch "reviewer finishing" ended after 0:00'])
})
