import { expect, test } from 'claude-code/testing'

import { HERDR, listRuns, world } from './test-kit'

test('register: no timer and no herdr call without HERDR_ENV', async ($, on) => {
  const w = await world($, on, { agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  await w.clock.advance(5 * 60_000)
  expect(w.runs).toEqual([])
  expect(await w.command('list')).toBe('The peer alarm needs a herdr pane (HERDR_ENV=1 with a workspace and pane id) (/peer-alarm list)')
  expect(await w.command('on')).toBe(
    'Peer alarm on, but idle here: The peer alarm needs a herdr pane (HERDR_ENV=1 with a workspace and pane id) (/peer-alarm list)',
  )
  await w.clock.advance(60_000)
  expect(w.runs).toEqual([])
})

test('register: in herdr, a baseline poll at the start, then one every 30 s with a 5 s limit', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'idle', title: 'Explore ML platforms' }] })
  await w.start()
  expect(listRuns(w)).toBe(1)
  expect(w.inits.every(i => (i as { timeoutMs?: number }).timeoutMs === 5_000)).toBe(true)
  expect(w.state('seen')).toEqual({ 'w1:p6': { status: 'idle', since: Date.parse('2026-10-19T12:00:00Z') + 10, agent: 'claude', title: 'Explore ML platforms' } })
  await w.clock.advance(29_000)
  expect(listRuns(w)).toBe(1)
  await w.clock.advance(1_000)
  expect(listRuns(w)).toBe(2)
  await w.clock.advance(60_000)
  expect(listRuns(w)).toBe(4)
  expect(w.toasts).toEqual([])
})

test('register: a working peer turning blocked toasts once', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' }] })
  await w.start()
  expect(w.toasts).toEqual([])
  w.setAgents([{ pane: 'w1:p6', status: 'blocked', title: 'Explore ML platforms' }])
  await w.nextPoll()
  await w.nextPoll()
  await w.nextPoll()
  expect(w.toasts).toEqual(['▲ w1:p6 "Explore ML platforms" is blocked'])
})

test('register: a peer that finishes toasts; a quiet start never chimes ALL DONE', async ($, on) => {
  const w = await world($, on, {
    env: HERDR,
    agents: [
      { pane: 'w1:p6', status: 'idle', title: 'Explore ML platforms' },
      { pane: 'w1:p7', status: 'done', agent: 'codex' },
    ],
  })
  await w.start()
  await w.nextPoll()
  await w.nextPoll()
  // Every peer idle or done from the start, none ever seen working: nothing.
  expect(w.toasts).toEqual([])

  w.setAgents([
    { pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' },
    { pane: 'w1:p7', status: 'done', agent: 'codex' },
  ])
  await w.nextPoll()
  expect(w.toasts).toEqual([])
  w.setAgents([
    { pane: 'w1:p6', status: 'idle', title: 'Explore ML platforms' },
    { pane: 'w1:p7', status: 'done', agent: 'codex' },
  ])
  await w.nextPoll()
  expect(w.toasts).toEqual(['✓ w1:p6 "Explore ML platforms" finished', '★ ALL DONE · 2 peers idle'])
  // It fires once, then waits for work again.
  await w.nextPoll()
  expect(w.toasts.length).toBe(2)
})

test('register: ALL DONE waits for every peer, and re-arms when one works again', async ($, on) => {
  const w = await world($, on, {
    env: HERDR,
    agents: [
      { pane: 'w1:p6', status: 'working' },
      { pane: 'w1:p7', status: 'working', title: 'Second' },
    ],
  })
  await w.start()
  w.setAgents([
    { pane: 'w1:p6', status: 'done' },
    { pane: 'w1:p7', status: 'working', title: 'Second' },
  ])
  await w.nextPoll()
  expect(w.toasts).toEqual(['✓ w1:p6 finished'])
  w.setAgents([
    { pane: 'w1:p6', status: 'done' },
    { pane: 'w1:p7', status: 'idle', title: 'Second' },
  ])
  await w.nextPoll()
  expect(w.toasts).toEqual(['✓ w1:p6 finished', '✓ w1:p7 "Second" finished', '★ ALL DONE · 2 peers idle'])
  w.setAgents([
    { pane: 'w1:p6', status: 'working' },
    { pane: 'w1:p7', status: 'idle', title: 'Second' },
  ])
  await w.nextPoll()
  w.setAgents([
    { pane: 'w1:p6', status: 'idle' },
    { pane: 'w1:p7', status: 'idle', title: 'Second' },
  ])
  await w.nextPoll()
  expect(w.toasts.slice(3)).toEqual(['✓ w1:p6 finished', '★ ALL DONE · 2 peers idle'])
})

test('register: other workspaces and this pane are ignored', async ($, on) => {
  const w = await world($, on, {
    env: HERDR,
    agents: [
      { pane: 'w1:p6', status: 'idle' },
      { pane: 'w1:p2', status: 'working', title: 'this pane' },
      { pane: 'w2:p1', status: 'working', title: 'elsewhere' },
    ],
  })
  await w.start()
  expect(Object.keys(w.state('seen') as object)).toEqual(['w1:p6'])
  w.setAgents([
    { pane: 'w1:p6', status: 'idle' },
    { pane: 'w1:p2', status: 'blocked', title: 'this pane' },
    { pane: 'w2:p1', status: 'blocked', title: 'elsewhere' },
  ])
  await w.nextPoll()
  w.setAgents([
    { pane: 'w1:p6', status: 'idle' },
    { pane: 'w1:p2', status: 'idle', title: 'this pane' },
    { pane: 'w2:p1', status: 'idle', title: 'elsewhere' },
  ])
  await w.nextPoll()
  expect(w.toasts).toEqual([])
})

test('register: silent by default: toasts but no clip', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  w.setAgents([{ pane: 'w1:p6', status: 'working' }])
  await w.nextPoll()
  w.setAgents([{ pane: 'w1:p6', status: 'idle' }])
  await w.nextPoll()
  expect(w.toasts).toEqual(['▲ w1:p6 is blocked', '✓ w1:p6 finished', '★ ALL DONE · 1 peer idle'])
  expect(w.plays).toEqual([])
  expect(await w.command('sound')).toBe('Peer alarm sound is off (/peer-alarm sound on|off).')
})

test('register: /peer-alarm sound on plays the beeps when blocked and the chime at ALL DONE; off silences them', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  expect(await w.command('sound on')).toBe('Peer alarm sound on.')
  expect(w.store.get('peers.sound')).toBe('on')
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  expect(w.plays).toEqual(['assets/blocked.wav'])
  w.setAgents([{ pane: 'w1:p6', status: 'working' }])
  await w.nextPoll()
  w.setAgents([{ pane: 'w1:p6', status: 'done' }])
  await w.nextPoll()
  // ✓ finished has no clip of its own; ALL DONE chimes.
  expect(w.plays).toEqual(['assets/blocked.wav', 'assets/done.wav'])
  expect(await w.command('sound off')).toBe('Peer alarm sound off.')
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  expect(w.toasts.at(-1)).toBe('▲ w1:p6 is blocked')
  expect(w.plays.length).toBe(2)
})

test('register: the sound option on plays without the command', { options: { sound: 'on' } }, async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'idle' }] })
  await w.start()
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  expect(w.plays).toEqual(['assets/blocked.wav'])
})

test('register: /peer-alarm off stops polling; /peer-alarm on starts again with a fresh baseline', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  expect(await w.command('off')).toBe('Peer alarm off (/peer-alarm on to watch again).')
  expect(w.store.get('peers.watch')).toBe('off')
  const before = listRuns(w)
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.clock.advance(5 * 60_000)
  expect(listRuns(w)).toBe(before)
  expect(await w.command('on')).toBe('Peer alarm on: this herdr workspace is read every 30 s.')
  await w.clock.advance(10)
  expect(listRuns(w)).toBe(before + 1)
  // The baseline after on raises nothing, though the peer is blocked now.
  await w.nextPoll()
  expect(w.toasts).toEqual([])
})

test('register: the store\'s off wins at the start: no polling', async ($, on) => {
  const w = await world($, on, { env: HERDR, store: { 'peers.watch': 'off' }, agents: [{ pane: 'w1:p6', status: 'idle' }] })
  await w.start()
  await w.clock.advance(5 * 60_000)
  expect(w.runs).toEqual([])
})

test('register: a failed herdr read changes nothing', async ($, on) => {
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  w.setAgents(null)
  await w.nextPoll()
  expect(w.state('seen')).toMatchObject({ 'w1:p6': { status: 'working' } })
  w.setAgents([{ pane: 'w1:p6', status: 'idle' }])
  await w.nextPoll()
  expect(w.toasts).toEqual(['✓ w1:p6 finished', '★ ALL DONE · 1 peer idle'])
})

test('register: /peer-alarm list answers each peer\'s pane, agent, state and time in state', async ($, on) => {
  const w = await world($, on, {
    env: HERDR,
    agents: [
      { pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' },
      { pane: 'w1:p7', status: 'done', agent: 'codex' },
      { pane: 'w2:p1', status: 'working' },
    ],
  })
  await w.start()
  await w.clock.advance(12 * 60_000)
  w.setAgents([
    { pane: 'w1:p6', status: 'working', title: 'Explore ML platforms' },
    { pane: 'w1:p7', status: 'done', agent: 'codex' },
    { pane: 'w1:p9', status: 'idle', title: 'New one' },
  ])
  expect(await w.command('list')).toBe(
    [
      '3 peers in herdr workspace w1:',
      'w1:p6  claude  working 12m "Explore ML platforms"',
      'w1:p7  codex  done 12m',
      'w1:p9  claude  idle "New one"',
    ].join('\n'),
  )
  expect(await w.command('')).toContain('3 peers in herdr workspace w1:')
  expect(await w.command('help')).toBe('Usage: /peer-alarm list | on | off | sound on|off')
})

test('register: off from another pane pauses this watcher, and on from another pane wakes it with a fresh baseline', async ($, on) => {
  // The store is the one thing every session of the plugin shares: writing it
  // here is what /peer-alarm off and on typed in another pane do to this one.
  const w = await world($, on, { env: HERDR, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  w.store.set('peers.watch', 'off')
  await w.nextPoll()
  const before = listRuns(w)
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.clock.advance(5 * 60_000)
  expect(listRuns(w)).toBe(before)
  expect(w.state('seen')).toBe(null)
  w.store.set('peers.watch', 'on')
  await w.nextPoll()
  expect(listRuns(w)).toBe(before + 1)
  // The first poll after on is a baseline: the block seen while off raises nothing.
  expect(w.toasts).toEqual([])
  w.setAgents([{ pane: 'w1:p6', status: 'working' }])
  await w.nextPoll()
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  await w.nextPoll()
  expect(w.toasts).toEqual(['▲ w1:p6 is blocked'])
})

test('register: a headless -p session in a herdr pane never polls', async ($, on) => {
  const w = await world($, on, { env: HERDR, surfaces: [], agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start({ surface: null, isInteractive: false })
  await w.clock.advance(5 * 60_000)
  expect(w.runs).toEqual([])
  expect(await w.command('on')).toContain('Peer alarm on, but idle here')
  await w.clock.advance(5 * 60_000)
  expect(w.runs).toEqual([])
})

test('register: a poll in flight at /peer-alarm off keeps nothing and raises nothing', async ($, on) => {
  const w = await world($, on, { env: HERDR, herdrDelayMs: 1_000, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  await w.clock.advance(1_000)
  expect(w.state('seen')).toMatchObject({ 'w1:p6': { status: 'working' } })
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  // Just past the 30 s tick (the clock stands at 1 010 ms): herdr has not answered yet.
  await w.clock.advance(28_995)
  expect(await w.command('off')).toBe('Peer alarm off (/peer-alarm on to watch again).')
  await w.clock.advance(1_000)
  expect(w.toasts).toEqual([])
  expect(w.state('seen')).toBe(null)
})

test('register: a poll in flight at /peer-alarm on cannot undo its fresh baseline', async ($, on) => {
  const w = await world($, on, { env: HERDR, herdrDelayMs: 1_000, agents: [{ pane: 'w1:p6', status: 'working' }] })
  await w.start()
  await w.clock.advance(1_000)
  w.setAgents([{ pane: 'w1:p6', status: 'blocked' }])
  // Just past the 30 s tick (the clock stands at 1 010 ms): herdr has not answered yet.
  await w.clock.advance(28_995)
  expect(await w.command('on')).toBe('Peer alarm on: this herdr workspace is read every 30 s.')
  await w.clock.advance(1_000)
  // The old poll's blocked is dropped, and the next poll is a baseline.
  expect(w.toasts).toEqual([])
  await w.nextPoll()
  await w.clock.advance(1_000)
  expect(w.toasts).toEqual([])
  expect(w.state('seen')).toMatchObject({ 'w1:p6': { status: 'blocked' } })
})
