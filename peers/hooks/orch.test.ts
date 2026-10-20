import { expect, test } from 'claude-code/testing'

import type { OrchRequest } from '../types'
import {
  DEFAULT_DEADLINE_MS,
  MAX_REQUESTS,
  boardRows,
  deadlineOf,
  isSafeReq,
  orchText,
  parseEnvelopes,
  recordEnvelopes,
  requestsByPane,
  resultPath,
  resultStatus,
  roundOf,
  sortedRows,
  stateText,
} from './orch'
import { TICK_MS } from './kit'
import { envelope } from './test-kit'

test('orch: a brief this pane sends names its spoke, round, ceiling and deadline', () => {
  const text = [
    'herdr agent prompt w1:p6 "',
    envelope('apr-alp-r4', 'hub@w1:p2', 'request'),
    '',
    'You are the reviewer for round 4 of 5. DEADLINE: 45 minutes."',
  ].join('\n')
  expect(parseEnvelopes(text, 'w1:p2')).toEqual([
    { req: 'apr-alp-r4', fromAgent: 'hub', fromPane: 'w1:p2', type: 'request', target: 'w1:p6', round: 4, ceiling: 5, deadlineMs: 45 * 60_000 },
  ])
})

test('orch: a spoke\'s report names the spoke by its from=; a to= on the header wins', () => {
  const report = parseEnvelopes(`${envelope('dd-skin', 'codex@w1:p7', 'completed')}\nresult written`, 'w1:p2')
  expect(report.map(e => [e.req, e.target, e.type])).toEqual([['dd-skin', 'w1:p7', 'completed']])
  const to = parseEnvelopes(`${envelope('x1', 'hub@w1:p2', 'handoff')} to=w1:p9\nsee w1:p6`, 'w1:p2')
  expect(to[0]?.target).toBe('w1:p9')
  // No pane but this one: the target stays unknown.
  expect(parseEnvelopes(envelope('x2', 'hub@w1:p2', 'request'), 'w1:p2')[0]?.target).toBe('')
})

test('orch: in a spoke, a brief it receives and a report it sends name no spoke', () => {
  // The hub's brief reaching this spoke (w1:p6): this pane is the spoke, not the hub.
  expect(parseEnvelopes(`${envelope('apr-x', 'hub@w1:p2', 'request')}\nround 4/5`, 'w1:p6')).toEqual([])
  expect(parseEnvelopes(`herdr agent prompt w1:p6 "${envelope('h1', 'hub@w1:p2', 'handoff')}"`, 'w1:p6')).toEqual([])
  expect(parseEnvelopes(envelope('f1', 'hub@w1:p2', 'followup'), 'w1:p6')).toEqual([])
  // This spoke's own report to its hub.
  expect(parseEnvelopes(`herdr agent prompt w1:p2 "${envelope('apr-x', 'codex@w1:p6', 'completed')}"`, 'w1:p6')).toEqual([])
  // A brief this pane receives that names another spoke still maps that spoke.
  expect(parseEnvelopes(`${envelope('x3', 'hub@w1:p2', 'request')} to=w1:p9`, 'w1:p6')[0]?.target).toBe('w1:p9')
})

test('orch: a hub follow-up updates a kept request only; a closing quote ends no type', () => {
  const kept = recordEnvelopes({}, parseEnvelopes(`herdr agent prompt w1:p6 "${envelope('site', 'hub@w1:p2', 'request')}"`, 'w1:p2'), 1_000)
  expect(kept.site).toMatchObject({ pane: 'w1:p6', type: 'request', deadlineAt: 1_000 + DEFAULT_DEADLINE_MS })
  const text = `herdr agent prompt w1:p6 "${envelope('site', 'hub@w1:p2', 'followup')}\nRound 2/3. Deadline: 20 minutes."`
  const after = recordEnvelopes(kept, parseEnvelopes(text, 'w1:p2'), 50_000)
  expect(after.site).toMatchObject({ pane: 'w1:p6', type: 'followup', round: 2, ceiling: 3, sentAt: 1_000, deadlineAt: 50_000 + 20 * 60_000 })
  // A follow-up of a request never seen here starts nothing.
  expect(recordEnvelopes({}, parseEnvelopes(text.replace('site', 'other'), 'w1:p2'), 5)).toEqual({})
  // `herdr agent prompt w1:p6 "[HERDR-ORCH v0] ... type=request"` on one line.
  expect(parseEnvelopes(`herdr agent prompt w1:p6 "${envelope('one', 'hub@w1:p2', 'request')}"`, 'w1:p2')[0]).toMatchObject({ type: 'request', target: 'w1:p6' })
})

test('orch: only POLICY headers count: known types, a safe req, at a line start', () => {
  expect(parseEnvelopes(envelope('ok', 'a@w1:p6', 'gossip'), 'w1:p2')).toEqual([])
  expect(parseEnvelopes(envelope('../etc', 'a@w1:p6', 'request'), 'w1:p2')).toEqual([])
  expect(parseEnvelopes(`quoted: ${envelope('ok', 'a@w1:p6', 'request')}`, 'w1:p2')).toEqual([])
  expect(parseEnvelopes('[HERDR-ORCH v1] req=ok from=a@w1:p6 type=request', 'w1:p2')).toEqual([])
  expect(isSafeReq('apr-alp-r4')).toBe(true)
  expect(isSafeReq('..')).toBe(false)
  expect(isSafeReq('a/b')).toBe(false)
})

test('orch: rounds from the text or a -rN suffix, ceilings, and deadlines in minutes or hours', () => {
  expect(roundOf('round 2/3', 'x')).toEqual({ round: 2, ceiling: 3 })
  expect(roundOf('Round=2, ceiling 6', 'x')).toEqual({ round: 2, ceiling: 6 })
  expect(roundOf('no words', 'apr-sta-r3')).toEqual({ round: 3, ceiling: null })
  expect(roundOf('max rounds: 5', 'plain')).toEqual({ round: null, ceiling: 5 })
  expect(deadlineOf('Deadline: 25 minutes. Write it')).toBe(25 * 60_000)
  expect(deadlineOf('DEADLINE: 2 hours')).toBe(2 * 3_600_000)
  expect(deadlineOf('deadline 90 min')).toBe(90 * 60_000)
  expect(deadlineOf('no limit')).toBeNull()
})

test('orch: a request starts its clock once; follow-ups fill the pane and keep the start', () => {
  const brief = parseEnvelopes(envelope('r1', 'hub@w1:p2', 'request'), 'w1:p2')
  const a = recordEnvelopes({}, brief, 1_000)
  expect(a.r1).toEqual({ req: 'r1', pane: '', type: 'request', round: null, ceiling: null, sentAt: 1_000, deadlineAt: 1_000 + DEFAULT_DEADLINE_MS, result: null })
  const b = recordEnvelopes(a, parseEnvelopes(`${envelope('r1', 'codex@w1:p6', 'progress')}\nhalf way`, 'w1:p2'), 9_000)
  expect(b.r1).toMatchObject({ pane: 'w1:p6', type: 'progress', sentAt: 1_000, deadlineAt: 1_000 + DEFAULT_DEADLINE_MS })
  // A report of a request this session never saw: no deadline is made up.
  expect(recordEnvelopes({}, parseEnvelopes(envelope('r9', 'codex@w1:p6', 'completed'), 'w1:p2'), 5)['r9']?.deadlineAt).toBeNull()
  // Only the newest MAX_REQUESTS are kept.
  let many: Record<string, OrchRequest> = {}
  for (let i = 0; i < MAX_REQUESTS + 5; i++) many = recordEnvelopes(many, parseEnvelopes(envelope(`q${i}`, 'h@w1:p2', 'request'), 'w1:p2'), i)
  expect(Object.keys(many).length).toBe(MAX_REQUESTS)
  expect(many.q0).toBeUndefined()
})

test('orch: a result file is valid only with req and status first; its path is under the home folder', () => {
  expect(resultStatus('req: r1\nstatus: completed\n\nDone.', 'r1')).toBe('completed')
  expect(resultStatus('req: r1\nstatus: blocked\nneeds a key', 'r1')).toBe('blocked')
  expect(resultStatus('req: r2\nstatus: completed', 'r1')).toBe('')
  expect(resultStatus('status: completed\nreq: r1', 'r1')).toBe('')
  expect(resultStatus('req: r1\nstatus: progress\nwhy', 'r1')).toBe('')
  // POLICY's lines are exact (a CRLF file still reads), and a status needs a non-blank line after it.
  expect(resultStatus('req: r1\r\nstatus: failed\r\nno build', 'r1')).toBe('failed')
  expect(resultStatus(' req: r1\nstatus: completed\nDone.', 'r1')).toBe('')
  expect(resultStatus('req: r1\nstatus: completed  \nDone.', 'r1')).toBe('')
  expect(resultStatus('req: r1\nstatus: completed', 'r1')).toBe('')
  expect(resultStatus('req: r1\nstatus: completed\n\n  \n', 'r1')).toBe('')
  expect(resultPath('/Users/me/', 'r1')).toBe('/Users/me/.local/state/herdr-orch/r1/result.md')
})

test('orch: board rows keep their time in state, blocked sort first, and the spoke line reads in order', () => {
  const peers = [
    { pane: 'w1:p6', agent: 'claude', status: 'working' as const, title: 'A' },
    { pane: 'w1:p7', agent: 'codex', status: 'blocked' as const, title: '' },
  ]
  const first = boardRows(peers, null, null, 100)
  expect(first.map(r => stateText(r, 100))).toEqual(['● working', '▲ blocked'])
  // The last board was read a tick ago and carried each row's start since 100.
  const tickAgo = { at: 100 + 4 * 60_000 - TICK_MS, workspace: 'w1', rows: first }
  const later = boardRows(peers, null, tickAgo, 100 + 4 * 60_000)
  expect(sortedRows(later).map(r => stateText(r, 100 + 4 * 60_000))).toEqual(['▲ blocked 4m', '● working 4m'])
  // A board last read an hour ago (closed since) may have missed changes: the time starts again.
  const stale = boardRows(peers, null, { at: 100, workspace: 'w1', rows: first }, 100 + 3_600_000)
  expect(stale.map(r => stateText(r, 100 + 3_600_000))).toEqual(['● working', '▲ blocked'])
  const r: OrchRequest = { req: 'apr-alp-r4', pane: 'w1:p6', type: 'request', round: 4, ceiling: 5, sentAt: 0, deadlineAt: 30 * 60_000, result: null }
  expect(orchText(r, 4 * 60_000)).toBe('req apr-alp-r4 · round 4/5 · ⏳ 26m left · no result.md')
  expect(orchText({ ...r, round: null }, 34 * 60_000)).toBe('req apr-alp-r4 · overdue 4m · no result.md')
  expect(orchText({ ...r, result: 'completed' }, 34 * 60_000)).toBe('req apr-alp-r4 · round 4/5 · result.md ✓ completed')
  expect(orchText({ ...r, result: '' }, 0)).toBe('req apr-alp-r4 · round 4/5 · ⏳ 30m left · result.md (no status)')
  // The newest request of a pane is the one shown.
  expect(requestsByPane({ a: { ...r, req: 'a', sentAt: 1 }, b: { ...r, req: 'b', sentAt: 2 } }).get('w1:p6')?.req).toBe('b')
})
