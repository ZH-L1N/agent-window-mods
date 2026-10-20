import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { NEEDS_HERDR } from './peers'
import { HERDR, PLUGIN, envelope, paneProps, resultFile, world } from './test-kit'

const mountPane = ($: Engine, cols = 100, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agents', props: paneProps(cols) })

const run = async ($: Engine, args: string) => ((await $.command.run({ command: 'agents-info', args } as never)) as { text?: string }).text ?? ''

const AMBER = '#f59e0b'

/** The pane ids drawn, in order. */
const paneIds = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Text' })).map(el => el.text).filter(t => /^w\d+:p\d+$/.test(t))

test('peers: outside herdr the view says it needs a herdr pane and nothing runs', async ($, on) => {
  const w = await world($, on, true, {}, { isPaneTracked: true, agents: [{ pane: 'w1:p6', status: 'working' }] })
  expect(await run($, 'peers')).toBe(NEEDS_HERDR)
  expect(w.opened).toEqual(['agents'])
  expect(w.state('view')).toBe('peers')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: NEEDS_HERDR })).toBeDefined()
  await w.clock.advance(120_000)
  expect(w.herdrRuns()).toBe(0)
  await ui.unmount()
})

test('peers: the rows of this workspace (this pane and other workspaces left out), blocked first and amber', async ($, on) => {
  const w = await world($, on, true, {}, {
    env: HERDR,
    isPaneTracked: true,
    agents: [
      { pane: 'w1:p2', status: 'working', title: 'The hub itself' },
      { pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' },
      { pane: 'w1:p7', status: 'blocked', agent: 'codex', title: 'Compare skills' },
      { pane: 'w1:p9', status: 'idle' },
      { pane: 'w2:p1', status: 'blocked', title: 'Another workspace' },
    ],
  })
  expect(await run($, 'peers')).toBe('Agents pane: Peers view (read every 30 s while shown; r reads now).')
  expect(w.herdrRuns()).toBe(1)
  // Read again every 30 s while shown: the times count from the first read.
  await w.clock.advance(5 * 60_000)
  expect(w.herdrRuns()).toBe(11)
  const ui = await mountPane($)
  expect((await ui.find({ key: 'peers-head' }))?.text).toBe('Peers · 3 in w1 · 1 blocked · read every 30 s')
  const states = (await ui.findAll({ type: 'Text' })).filter(el => /^[▲●○✓?] /.test(el.text))
  expect(states.map(el => el.text)).toEqual(['▲ blocked 5m', '● working 5m', '○ idle 5m'])
  expect(states[0]?.props.color).toBe(AMBER)
  expect(await paneIds(ui)).toEqual(['w1:p7', 'w1:p6', 'w1:p9'])
  const color = async (text: string) => (await ui.findAll({ type: 'Text', text })).map(el => el.props.color)[0]
  expect(await color('w1:p7')).toBe(AMBER)
  expect(await color('codex')).toBe(AMBER)
  expect((await ui.find({ key: 'title-w1:p7' }))?.text).toBe('"Compare skills"')
  expect(await color('w1:p6')).toBeUndefined()
  // No requests: no hub row, no group heads.
  expect(await ui.find({ type: 'Text', text: /^hub/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^req / })).toBeUndefined()
  // The keys: w, c, r, q, framed with hotkeys.
  for (const [key, label, hotkey] of [
    ['view-who', 'w: who', 'w'],
    ['view-code', 'c: code', 'c'],
    ['peers-refresh', 'r: refresh', 'r'],
    ['pane-close', 'q: close', 'q'],
  ]) {
    expect((await ui.find({ key }))?.props).toMatchObject({ label, hotkey })
  }
  await ui.unmount()
  // The desktop gets the same rows as text.
  const plain = await mountPane($, 100, 'desktop')
  expect(await plain.find({ type: 'Text', text: /^▲ blocked 5m {2}w1:p7 {2}codex {2}"Compare skills"$/ })).toBeDefined()
  await plain.unmount()
})

test('peers: spokes grouped under their request ids, the hub row first, the group with a blocked spoke first, then the other peers', async ($, on) => {
  const w = await world($, on, true, {}, {
    env: HERDR,
    isPaneTracked: true,
    agents: [
      { pane: 'w1:p2', status: 'working', title: 'Hub' },
      { pane: 'w1:p6', status: 'working', title: 'Review round 4' },
      { pane: 'w1:p7', status: 'blocked', agent: 'codex', title: 'Compare skills' },
      { pane: 'w1:p8', status: 'idle', title: 'Not ours' },
      { pane: 'w1:p9', status: 'working', title: 'Skin, second half' },
    ],
  })
  await w.submit(`${envelope('rev-r4', 'hub@w1:p2', 'request')} to=w1:p6\nReview the diff, round 4/5. deadline: 45 minutes`)
  await w.clock.advance(1_000)
  // A fan-out: one request id to two spokes, as the hub's own herdr lines.
  await w.submit(`herdr agent prompt w1:p7 "${envelope('skin', 'hub@w1:p2', 'request')}"\nherdr agent prompt w1:p9 "${envelope('skin', 'hub@w1:p2', 'request')}"`)
  w.files.set(resultFile('rev-r4'), 'req: rev-r4\nstatus: completed\nAll done.\n')
  await run($, 'peers')
  const ui = await mountPane($)
  // The hub (this pane, since it sent the requests), then skin (blocked spoke first), then rev-r4, then the rest.
  expect(await paneIds(ui)).toEqual(['w1:p2', 'w1:p7', 'w1:p9', 'w1:p6', 'w1:p8'])
  expect(await ui.find({ type: 'Text', text: 'hub · this pane' })).toBeDefined()
  const heads = (await ui.findAll({ type: 'Text' })).map(el => el.text).filter(t => /^req /.test(t))
  expect(heads).toEqual(['req skin · ⏳ 30m left · no result.md', 'req rev-r4 · round 4/5 · result.md ✓ completed'])
  expect(await ui.find({ type: 'Text', text: 'other peers' })).toBeDefined()
  // The result file of a request whose spokes are shown was read; the other request's file is missing.
  expect(w.state('peerRequests')).toMatchObject({ 'rev-r4': { panes: ['w1:p6'], round: 4, ceiling: 5, result: 'completed' }, skin: { panes: ['w1:p7', 'w1:p9'], result: null } })
  await ui.unmount()
})

test('peers: a session that is a spoke draws its hub row first', async ($, on) => {
  const w = await world($, on, true, {}, {
    env: HERDR,
    isPaneTracked: true,
    agents: [
      { pane: 'w1:p6', status: 'idle', title: 'Other' },
      { pane: 'w1:p1', status: 'working', title: 'The hub' },
    ],
  })
  await w.submit(`${envelope('task-1', 'hub@w1:p1', 'request')}\nDo the thing.`)
  expect(w.state('peerHub')).toBe('w1:p1')
  await run($, 'peers')
  const ui = await mountPane($)
  expect(await paneIds(ui)).toEqual(['w1:p1', 'w1:p6'])
  expect(await ui.find({ type: 'Text', text: 'hub' })).toBeDefined()
  await ui.unmount()
})

test('peers: herdr is read only while the pane shows the Peers view; p shows it, w and q leave it', async ($, on) => {
  const w = await world($, on, true, {}, { env: HERDR, isPaneTracked: true, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.clock.advance(120_000)
  expect(w.herdrRuns()).toBe(0)
  // The pane open in the Who view: still no read.
  await run($, 'open')
  await w.clock.advance(120_000)
  expect(w.herdrRuns()).toBe(0)
  const ui = await mountPane($)
  expect((await ui.find({ key: 'view-peers' }))?.props).toMatchObject({ label: 'p: peers', hotkey: 'p' })
  await ui.press({ key: 'view-peers' })
  expect(w.state('view')).toBe('peers')
  expect(w.herdrRuns()).toBe(1)
  await w.clock.advance(60_000)
  expect(w.herdrRuns()).toBe(3)
  // Back to Who: the reads stop.
  await ui.press({ key: 'view-who' })
  await w.clock.advance(120_000)
  expect(w.herdrRuns()).toBe(3)
  // The Code view has the p key too.
  await ui.press({ key: 'view-code' })
  expect(w.state('view')).toBe('code')
  expect((await ui.find({ key: 'view-peers' }))?.props.hotkey).toBe('p')
  await ui.press({ key: 'view-peers' })
  expect(w.herdrRuns()).toBe(4)
  // Closed: no more reads, though the view stays Peers for the next opening.
  await ui.press({ key: 'pane-close' })
  expect(w.closed).toEqual(['agents'])
  await w.clock.advance(120_000)
  expect(w.herdrRuns()).toBe(4)
  await ui.unmount()
})

test('peers: r reads now, as /agents-info peers does; a failed read keeps the last rows', async ($, on) => {
  const w = await world($, on, true, {}, { env: HERDR, isPaneTracked: true, agents: [{ pane: 'w1:p6', status: 'working', title: 'First' }] })
  await run($, 'peers')
  expect(w.herdrRuns()).toBe(1)
  const ui = await mountPane($)
  w.setAgents([{ pane: 'w1:p6', status: 'blocked', title: 'First' }])
  await ui.press({ key: 'peers-refresh' })
  expect(w.herdrRuns()).toBe(2)
  expect((await ui.find({ key: 'state-w1:p6' }))?.text).toBe('▲ blocked')
  await run($, 'peers')
  expect(w.herdrRuns()).toBe(3)
  w.setAgents(null)
  await ui.press({ key: 'peers-refresh' })
  expect(w.herdrRuns()).toBe(4)
  expect((await ui.find({ key: 'state-w1:p6' }))?.text).toBe('▲ blocked')
  await ui.unmount()
})

test('peers: a brief whose body says how to wake the hub keeps the hub as the sender, with no request group', async ($, on) => {
  const w = await world($, on, true, {}, {
    env: HERDR,
    isPaneTracked: true,
    agents: [
      { pane: 'w1:p6', status: 'idle', title: 'Other' },
      { pane: 'w1:p3', status: 'working', title: 'The hub' },
    ],
  })
  await w.submit(`${envelope('fix-1', 'hub@w1:p3', 'request')}\nFix it. When done, wake me: herdr agent prompt w1:p3 "done"`)
  expect(w.state('peerHub')).toBe('w1:p3')
  expect(w.state('peerRequests') ?? {}).toEqual({})
  await run($, 'peers')
  const ui = await mountPane($)
  expect(await paneIds(ui)).toEqual(['w1:p3', 'w1:p6'])
  expect(await ui.find({ type: 'Text', text: 'hub · this pane' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).some(el => /^req /.test(el.text))).toBe(false)
  await ui.unmount()
})

test('peers: a failed first read says so; a later good read draws the rows', async ($, on) => {
  const w = await world($, on, true, {}, { env: HERDR, isPaneTracked: true })
  w.setAgents(null)
  await run($, 'peers')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /herdr agent list failed \(exit 1\)/ })).toBeDefined()
  w.setAgents([{ pane: 'w1:p6', status: 'working', title: 'First' }])
  await ui.press({ key: 'peers-refresh' })
  expect(await ui.find({ type: 'Text', text: /failed/ })).toBeUndefined()
  expect(await paneIds(ui)).toEqual(['w1:p6'])
  await ui.unmount()
})

test('peers: a result file that leads outside the result folder is not read', async ($, on) => {
  const w = await world($, on, true, {}, { env: HERDR, isPaneTracked: true, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.submit(`${envelope('out-1', 'hub@w1:p2', 'request')} to=w1:p6\nDo it.`)
  w.files.set(resultFile('out-1'), 'req: out-1\nstatus: completed\nDone.\n')
  w.links.set(resultFile('out-1'), '/etc/elsewhere/result.md')
  await run($, 'peers')
  expect(w.state('peerRequests')).toMatchObject({ 'out-1': { result: '' } })
  w.links.delete(resultFile('out-1'))
  await run($, 'peers')
  expect(w.state('peerRequests')).toMatchObject({ 'out-1': { result: 'completed' } })
})
