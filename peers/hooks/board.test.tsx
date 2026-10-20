import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { HERDR, HERDR_HOME, PLUGIN, envelope, listRuns, paneProps, resultFile, world } from './test-kit'

const mountBoard = ($: Engine, cols = 100) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'peers', props: paneProps(cols) })

const AMBER = '#f59e0b'

test('board: outside herdr /peer-alarm board opens nothing and reads nothing', async ($, on) => {
  const w = await world($, on, { agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  expect(await w.command('board')).toBe('The peer alarm needs a herdr pane (HERDR_ENV=1 with a workspace and pane id) (/peer-alarm list)')
  expect(w.opened).toEqual([])
  expect(w.runs).toEqual([])
})

test('board: /peer-alarm board opens the pane, reads herdr now, and draws blocked peers first in amber', async ($, on) => {
  const w = await world($, on, {
    env: HERDR,
    agents: [
      { pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' },
      { pane: 'w1:p7', status: 'blocked', agent: 'codex', title: 'Compare skills' },
      { pane: 'w1:p9', status: 'idle' },
    ],
  })
  await w.start()
  const before = listRuns(w)
  expect(await w.command('board')).toBe('Peers board open: r polls now, q closes (/peer-alarm board close); read every 30 s while open.')
  expect(w.opened).toEqual(['peers'])
  expect(listRuns(w)).toBe(before + 1)
  // The last 30 s read is at 5 min; the peers were first seen at the 10 ms baseline: 4m 59s.
  await w.clock.advance(5 * 60_000)
  const ui = await mountBoard($)
  expect((await ui.find({ key: 'peers-head' }))?.text).toBe('3 peers in w1 · 1 blocked · read every 30 s')
  const states = (await ui.findAll({ type: 'Text' })).filter(el => /^[▲●○✓?] /.test(el.text))
  expect(states.map(el => el.text)).toEqual(['▲ blocked 4m', '● working 4m', '○ idle 4m'])
  expect(states[0]?.props.color).toBe(AMBER)
  // Text carries no key: each keyed Box holds one Text, whose colour is read.
  const color = async (text: string) => (await ui.findAll({ type: 'Text', text })).map(el => el.props.color)[0]
  expect(await color('w1:p7')).toBe(AMBER)
  expect(await color('"Compare skills"')).toBe(AMBER)
  expect((await ui.find({ key: 'title-w1:p7' }))?.text).toBe('"Compare skills"')
  expect(await color('w1:p6')).toBeUndefined()
  expect(await ui.find({ key: 'peers-refresh' })).toBeDefined()
  await ui.unmount()
})

test('board: while open it reads herdr every 30 s even with the alarm off; q closes and the reads stop', async ($, on) => {
  const w = await world($, on, { env: HERDR, store: { 'peers.watch': 'off' }, agents: [{ pane: 'w1:p6', status: 'idle' }] })
  await w.start()
  expect(w.runs).toEqual([])
  await w.command('board')
  expect(listRuns(w)).toBe(1)
  await w.clock.advance(60_000)
  expect(listRuns(w)).toBe(3)
  // The alarm stays off: a peer turning blocked raises no toast, the board shows it.
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  expect(w.toasts).toEqual([])
  expect((w.state('board') as { rows: { status: string }[] }).rows[0]?.status).toBe('blocked')
  const ui = await mountBoard($)
  await ui.press({ key: 'peers-close' })
  expect(w.closed).toEqual(['peers'])
  const after = listRuns(w)
  await w.clock.advance(5 * 60_000)
  expect(listRuns(w)).toBe(after)
  expect(await w.command('board close')).toBe('The peers board is not open.')
  await ui.unmount()
})

test('board: r polls now, as /peer-alarm board does while open', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  await w.command('board')
  const before = listRuns(w)
  const ui = await mountBoard($)
  await ui.press({ key: 'peers-refresh' })
  expect(listRuns(w)).toBe(before + 1)
  expect(await w.command('board')).toBe('Peers board read again.')
  expect(listRuns(w)).toBe(before + 2)
  expect(await w.command('board close')).toBe('Peers board closed.')
  await ui.unmount()
})

test('board: a spoke this session briefed shows its request, round, countdown and result file', async ($, on) => {
  const w = await world($, on, {
    env: HERDR_HOME,
    agents: [
      { pane: 'w1:p6', status: 'working', title: 'Review round 4' },
      { pane: 'w1:p7', status: 'idle', agent: 'codex' },
    ],
  })
  await w.start()
  await w.submit(`herdr agent prompt w1:p6 "${envelope('apr-alp-r4', 'hub@w1:p2', 'request')}\nRound 4 of 5. DEADLINE: 45 minutes."`)
  expect(w.state('requests')).toMatchObject({ 'apr-alp-r4': { pane: 'w1:p6', round: 4, ceiling: 5, result: null } })
  // A result file there while the board is closed is not read.
  w.files.set(resultFile('apr-alp-r4'), 'req: apr-alp-r4\nstatus: completed\n\nNO FINDINGS')
  await w.nextPoll()
  expect(w.state('requests')).toMatchObject({ 'apr-alp-r4': { result: null } })
  w.files.delete(resultFile('apr-alp-r4'))

  await w.clock.advance(10 * 60_000 - 30_000)
  await w.command('board')
  const ui = await mountBoard($)
  expect((await ui.find({ key: 'orch-w1:p6' }))?.text).toBe('req apr-alp-r4 · round 4/5 · ⏳ 35m left · no result.md')
  expect(await ui.find({ key: 'orch-w1:p7' })).toBeUndefined()
  w.files.set(resultFile('apr-alp-r4'), 'req: apr-alp-r4\nstatus: completed\n\nNO FINDINGS')
  await w.nextPoll()
  expect((await ui.find({ key: 'orch-w1:p6' }))?.text).toBe('req apr-alp-r4 · round 4/5 · result.md ✓ completed')
  await ui.unmount()
})

test('board: in a spoke, the hub\'s brief to it does not list the hub as a spoke', async ($, on) => {
  const w = await world($, on, { env: { ...HERDR_HOME, HERDR_PANE_ID: 'w1:p6' }, agents: [{ pane: 'w1:p1', status: 'idle', agent: 'claude' }] })
  await w.start()
  await w.submit(`${envelope('apr-x', 'nebula-hub@w1:p1', 'request')}\nRound 4 of 5. DEADLINE: 45 minutes.`)
  expect(w.state('requests')).toBeUndefined()
  await w.command('board')
  const ui = await mountBoard($)
  expect(await ui.find({ key: 'orch-w1:p1' })).toBeUndefined()
  await ui.unmount()
})

test('board: a spoke\'s own report maps its request to its pane', async ($, on) => {
  const w = await world($, on, { env: HERDR_HOME, agents: [{ pane: 'w1:p7', status: 'blocked', agent: 'codex' }] })
  await w.start()
  await w.submit(`${envelope('dd-skin', 'codex@w1:p7', 'blocked')}\nNeeds an API key.`)
  await w.command('board')
  const ui = await mountBoard($)
  expect((await ui.find({ key: 'orch-w1:p7' }))?.text).toBe('req dd-skin · no result.md')
  await ui.unmount()
})

test('board: envelopes outside herdr are not kept', async ($, on) => {
  const w = await world($, on, { env: {} })
  await w.start()
  await w.submit(envelope('elsewhere', 'codex@w1:p7', 'request'))
  expect(w.state('requests')).toBeUndefined()
})
