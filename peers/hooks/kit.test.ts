import { expect, test } from 'claude-code/testing'

import { durationText, isSoundOn, parsePeers, quoted, step } from './kit'
import { agentList } from './test-kit'

test('kit: parsePeers keeps this workspace, drops this pane, and reads unknown states as unknown', () => {
  const out = agentList([
    { pane: 'w1:p6', status: 'working', title: 'A' },
    { pane: 'w1:p2', status: 'idle' },
    { pane: 'w2:p1', status: 'blocked' },
    { pane: 'w1:p7', status: 'sleeping' as never, agent: 'codex' },
  ])
  expect(parsePeers(out, 'w1', 'w1:p2')).toEqual([
    { pane: 'w1:p6', agent: 'claude', status: 'working', title: 'A' },
    { pane: 'w1:p7', agent: 'codex', status: 'unknown', title: '' },
  ])
  expect(parsePeers('not json', 'w1', 'w1:p2')).toBeNull()
  expect(parsePeers('{"result":{}}', 'w1', 'w1:p2')).toBeNull()
})

test('kit: step takes a baseline without alerts, arming when a peer works', () => {
  const r = step(null, [{ pane: 'w1:p6', agent: 'claude', status: 'blocked', title: '' }], 100, false)
  expect(r.alerts).toEqual([])
  expect(r.isArmed).toBe(false)
  expect(step(null, [{ pane: 'w1:p6', agent: 'claude', status: 'working', title: '' }], 100, false).isArmed).toBe(true)
})

test('kit: a pane that first appears blocked after the baseline is an alert; one that appears idle is not', () => {
  const base = step(null, [], 0, false)
  const r = step(
    base.seen,
    [
      { pane: 'w1:p8', agent: 'claude', status: 'blocked', title: 'x' },
      { pane: 'w1:p9', agent: 'claude', status: 'idle', title: '' },
    ],
    30_000,
    base.isArmed,
  )
  expect(r.alerts.map(a => a.text)).toEqual(['▲ w1:p8 "x" is blocked'])
})

test('kit: since stays while the state stays, and moves with a change', () => {
  const p = { pane: 'w1:p6', agent: 'claude', title: '' }
  const a = step(null, [{ ...p, status: 'working' }], 100, false)
  const b = step(a.seen, [{ ...p, status: 'working' }], 200, a.isArmed)
  expect(b.seen['w1:p6']?.since).toBe(100)
  const c = step(b.seen, [{ ...p, status: 'idle' }], 300, b.isArmed)
  expect(c.seen['w1:p6']?.since).toBe(300)
})

test('kit: titles are cut with an ellipsis; durations read as s, m, h', () => {
  expect(quoted('')).toBe('')
  expect(quoted('a'.repeat(60))).toBe(` "${'a'.repeat(47)}…"`)
  expect(durationText(45_000)).toBe('45s')
  expect(durationText(12 * 60_000)).toBe('12m')
  expect(durationText(65 * 60_000)).toBe('1h 05m')
})

test('kit: sound is the stored choice, else the option; only on plays', () => {
  expect(isSoundOn(undefined, 'off')).toBe(false)
  expect(isSoundOn(undefined, undefined)).toBe(false)
  expect(isSoundOn(undefined, 'on')).toBe(true)
  expect(isSoundOn('off', 'on')).toBe(false)
  expect(isSoundOn('on', 'off')).toBe(true)
})
