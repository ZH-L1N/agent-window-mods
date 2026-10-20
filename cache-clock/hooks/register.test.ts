import { expect, test } from 'claude-code/testing'

import { fmtTokens, hhmm } from './kit'
import { cachePriceOf } from './prices'
import { MIN, T0, lineRuns, lineText, mountRow, usage, world } from './test-kit'

const OPUS = usage('claude-opus-5-5', 0, 169_200, 10_800)
const WARN = '180k cached, rewrite ≈ $1.44. Send anything to keep it warm.'

test('register: a main-loop cache step restarts the countdown; a step with no cache tokens or a subagent\'s does not', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  expect(w.state('lastCacheAt')).toBe(T0)
  await w.clock.advance(20 * MIN)
  // No cache tokens: the countdown goes on.
  await w.step(usage('claude-opus-5-5', 5_000))
  // A subagent's cache step: totals only.
  await w.step(usage('claude-haiku-5-5', 1_000, 50_000, 2_000), 'a1')
  expect(w.state('lastCacheAt')).toBe(T0)
  expect(lineText(await lineRuns($))).toContain('warm 40m')
  // A main cache step: back to the full window, from the request's start.
  await w.clock.advance(10 * MIN)
  await w.step(usage('claude-opus-5-5', 2_000, 178_000, 4_000))
  expect(w.state('lastCacheAt')).toBe(T0 + 30 * MIN)
  expect(w.state('last')).toEqual({ model: 'claude-opus-5-5', reads: 178_000, writes: 4_000, input: 2_000 })
  // 178k / 184k = 97% reused; 182k cached.
  expect(lineText(await lineRuns($))).toContain('warm 60m ▰▰▰▰▰▰ 97% reused · 182k cached')
})

test('register: one toast at 5 minutes left, none again for the same cache', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(54 * MIN + 30_000)
  expect(w.toasts).toEqual([])
  await w.clock.advance(30_000)
  expect(w.toasts).toEqual([WARN])
  await w.clock.advance(4 * MIN)
  expect(w.toasts).toEqual([WARN])
  // A new cache step and its own five-minute mark: one more.
  await w.step(OPUS)
  await w.clock.advance(56 * MIN)
  expect(w.toasts).toEqual([WARN, WARN])
})

test('register: the tick stops once cold', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await w.clock.advance(61 * MIN)
  const coldAt = w.state('now')
  expect(coldAt).toBe(T0 + 60 * MIN)
  await w.clock.advance(30 * MIN)
  expect(w.state('now')).toBe(coldAt)
})

test('register: the Compact button calls $.session.compact and toasts the result', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  const ui = await mountRow($)
  await ui.press({ key: 'cache-compact' })
  // From a timer, not inside the press.
  expect(w.compacts).toHaveLength(0)
  await w.clock.advance(100)
  expect(w.compacts).toHaveLength(1)
  expect(w.toasts).toEqual(['Compacted 412k → 38k; the next send writes a fresh cache (/cache-clock compact)'])
  // The old prefix is gone: the row hides until the next cache step.
  expect(await ui.find({ key: 'cache-line' })).toBeUndefined()
  await ui.unmount()
})

test('register: a skipped or failed compaction says so, naming the command', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  w.setCompact({ skip: 'a hook vetoed it' })
  expect(await w.command('compact')).toBe('Compacting the conversation; the result comes as a toast.')
  await w.clock.advance(100)
  // A compaction that rejects (the engine's while a turn runs; here the mock's failure).
  w.setCompact(new Error('a turn is running'))
  await w.command('compact')
  await w.clock.advance(100)
  expect(w.toasts[0]).toBe('Compact skipped: a hook vetoed it (/cache-clock compact)')
  expect(w.toasts[1]).toMatch(/^Compact did not run: .+ \(\/cache-clock compact, between turns\)$/)
  expect(w.toasts).toHaveLength(2)
  // Neither changed the row's cache.
  expect(w.state('last')).not.toBeNull()
})

test('register: the person\'s /compact or a /clear hides the row until the next cache step', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never)
  expect(w.state('last')).toBeNull()
  expect(w.state('lastCacheAt')).toBe(0)
  await w.step(OPUS)
  expect(w.state('last')).not.toBeNull()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  expect(w.state('last')).toBeNull()
})

test('register: an in-process resume hides the old conversation\'s countdown and stops its toast', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: {} } as never)
  expect(w.state('last')).toBeNull()
  expect(w.state('lastCacheAt')).toBe(0)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'cache-line' })).toBeUndefined()
  await ui.unmount()
  await w.clock.advance(56 * MIN)
  expect(w.toasts).toEqual([])
})

test('register: a /clear or a resume starts the session totals over; a compaction keeps them', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never)
  expect(await w.command('status')).toContain('Session: reads 169k · writes 11k')
  for (const reason of ['clear', 'resume']) {
    await w.step(OPUS)
    await $.session.end({ reason, sessionId: 's1', resume: {} } as never)
    expect(await w.command('status')).toContain('Session: reads 0 · writes 0 · 0% reused · saved ≈ $0.00')
  }
})

test('kit: token counts near a million read 1.0M, never 1000k', () => {
  expect(fmtTokens(999_499)).toBe('999k')
  expect(fmtTokens(999_600)).toBe('1.0M')
  expect(fmtTokens(1_250_000)).toBe('1.3M')
  expect(fmtTokens(950)).toBe('950')
})

test('register: /cache-clock status prints reads, writes, % reused and the dollars saved', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('status')).toBe(
    [
      'CACHE line: on · cache window 60 min (dollar figures are estimates)',
      'Cache: no cache request in the main loop yet',
      'Session: reads 0 · writes 0 · 0% reused · saved ≈ $0.00',
      '  main loop: reads 0 · writes 0 · 0 requests; subagents: reads 0 · writes 0 · 0 requests',
    ].join('\n'),
  )
  await w.step(OPUS)
  await w.step(usage('claude-sonnet-5-5', 10_000, 300_000, 0), 'a1')
  await w.step(usage('claude-mystery-9', 0, 20_000, 0), 'a2')
  await w.clock.advance(8 * MIN)
  // Saved: Opus 5.5 169.2k x (8 - 0.2) + Sonnet 5.5 300k x (4 - 0.2), per million = 1.31976 + 1.14 = $2.46.
  expect(await w.command('status')).toBe(
    [
      'CACHE line: on · cache window 60 min (dollar figures are estimates)',
      `Cache: warm, 52m left (last cache request ${hhmm(T0)})`,
      'Last main request: claude-opus-5-5 · 94% reused · 180k cached · rewrite ≈ $1.44',
      'Session: reads 489k · writes 11k · 96% reused · saved ≈ $2.46 (plus 20k reads on unpriced models)',
      '  main loop: reads 169k · writes 11k · 1 requests; subagents: reads 320k · writes 0 · 2 requests',
    ].join('\n'),
  )
  expect(await w.command('')).toContain('CACHE line: on')
  expect(await w.command('help')).toBe('Usage: /cache-clock on | off | status | compact')
})

test('register: /cache-clock off hides the row and its toast; the store keeps it', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.step(OPUS)
  expect(await w.command('off')).toBe('CACHE line off (no row, no toast; /cache-clock status and compact still work).')
  expect(w.store.get('cache-clock.band')).toBe('off')
  const ui = await mountRow($)
  expect(await ui.find({ key: 'cache-line' })).toBeUndefined()
  await w.clock.advance(56 * MIN)
  expect(w.toasts).toEqual([])
  expect(await w.command('on')).toBe('CACHE line on.')
  expect(await ui.find({ key: 'cache-line' })).toBeDefined()
  await ui.unmount()
})

test('register: the store\'s off wins over the option at the session start', async ($, on) => {
  const w = await world($, on, { store: { 'cache-clock.band': 'off' } })
  await w.start()
  await w.step(OPUS)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'cache-line' })).toBeUndefined()
  await ui.unmount()
})

test('prices: the write price follows the cache window; Haiku 5.5 long prompts use the long card', () => {
  expect(cachePriceOf('claude-opus-5-5', 1_000, 60)).toEqual({ read: 0.2, write: 8 })
  expect(cachePriceOf('claude-opus-5-5', 1_000, 5)).toEqual({ read: 0.2, write: 5 })
  expect(cachePriceOf('claude-fable-5-1', 1_000, 60)).toEqual({ read: 0.25, write: 20 })
  expect(cachePriceOf('claude-sonnet-5-5', 1_000, 60)).toEqual({ read: 0.2, write: 4 })
  expect(cachePriceOf('claude-haiku-5-5', 50_000, 60)).toEqual({ read: 0.01, write: 0.2 })
  expect(cachePriceOf('claude-haiku-5-5', 150_000, 60)).toEqual({ read: 0.05, write: 1 })
  expect(cachePriceOf('claude-mystery-9', 1_000, 60)).toBeNull()
})
