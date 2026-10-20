// The cache-clock mod: the ● CACHE row (row.tsx draws it), the countdown of
// the prompt cache's window, the one toast before it lapses, the Compact
// action and /cache-clock. The figures come from each model request's usage
// (turn.step): the main loop's drive the row; every request, subagents' too,
// adds to the session totals that /cache-clock status prints.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { CacheStep, CacheTotals } from '../types'
import {
  COMMAND,
  STORE_BAND,
  TICK_MS,
  addStep,
  cachedOf,
  dollarText,
  emptyBucket,
  fmtTokens,
  fmtUsd,
  hhmm,
  isBandOn,
  leftMs,
  minutesText,
  reusedPct,
  rewriteUsd,
  warnAtMs,
  warnText,
  windowMinutes,
} from './kit'
import { drawRow } from './row'

const lastCacheAt = atom({ plugin: 'cache-clock', key: 'lastCacheAt' } as const, 0)
const last = atom({ plugin: 'cache-clock', key: 'last' } as const, null)
const totals = atom({ plugin: 'cache-clock', key: 'totals' } as const, { main: emptyBucket(), agents: emptyBucket() })
const now = atom({ plugin: 'cache-clock', key: 'now' } as const, 0)
const warnedFor = atom({ plugin: 'cache-clock', key: 'warnedFor' } as const, 0)
const band = atom({ plugin: 'cache-clock', key: 'band' } as const, '')

// The countdown's tick, running only while the cache is warm. A reload drops
// it with the environment; session.start (raised again for a fresh load)
// starts it again while the cache is still warm.
let ticker: Timer | null = null

const stopTick = () => {
  ticker?.cancel()
  ticker = null
}

function startTick($: EngineInterface, options: PluginOptions): void {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => {
    void tick($, options).catch(() => {})
  })
}

/** Moves `now` so the row redraws; one toast at the warning mark; stops once cold. */
async function tick($: EngineInterface, options: PluginOptions): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  const since = await read($, lastCacheAt)
  const minutes = windowMinutes(options.cacheMinutes)
  const left = leftMs(since, at, minutes)
  if (!since || left <= 0) {
    stopTick()
    return
  }
  if (left > warnAtMs(minutes) || (await read($, warnedFor)) === since) return
  if (!isBandOn(await read($, band), options.band)) return
  const step = await read($, last)
  if (!step) return
  await update($, warnedFor, () => since)
  $.ui.toast(warnText(step, minutes))
}

/** The conversation was compacted or cleared: the cache it held is not the next request's prefix. */
async function resetCache($: EngineInterface): Promise<void> {
  stopTick()
  await update($, last, () => null)
  await update($, lastCacheAt, () => 0)
}

/**
 * Compacts the conversation, from a timer (never inside the press or the
 * command's hook), and toasts the result naming the command.
 */
function compactNow($: EngineInterface): void {
  $.clock.after(10, () => {
    void (async () => {
      try {
        const r = await $.session.compact()
        if (r.skip !== undefined) {
          $.ui.toast(`Compact skipped: ${r.skip} (/${COMMAND} compact)`)
          return
        }
        await resetCache($)
        const sizes = r.tokensBefore && r.tokensAfter ? ` ${fmtTokens(r.tokensBefore)} → ${fmtTokens(r.tokensAfter)}` : ''
        $.ui.toast(`Compacted${sizes}; the next send writes a fresh cache (/${COMMAND} compact)`)
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        $.ui.toast(`Compact did not run: ${why} (/${COMMAND} compact, between turns)`)
      }
    })().catch(() => {})
  })
}

const sum = (t: CacheTotals) => ({
  reads: t.main.reads + t.agents.reads,
  writes: t.main.writes + t.agents.writes,
  input: t.main.input + t.agents.input,
  savedUsd: t.main.savedUsd + t.agents.savedUsd,
  unpricedReads: t.main.unpricedReads + t.agents.unpricedReads,
})

async function statusText($: EngineInterface, options: PluginOptions): Promise<string> {
  const minutes = windowMinutes(options.cacheMinutes)
  const on = isBandOn(await read($, band), options.band)
  const since = await read($, lastCacheAt)
  const step = await read($, last)
  const t = await read($, totals)
  const at = await $.clock.now()
  const lines = [`CACHE line: ${on ? 'on' : 'off'} · cache window ${minutes} min (dollar figures are estimates)`]
  if (!since || !step) {
    lines.push('Cache: no cache request in the main loop yet')
  } else {
    const left = leftMs(since, at, minutes)
    lines.push(
      left > 0
        ? `Cache: warm, ${minutesText(left)} left (last cache request ${hhmm(since)})`
        : `Cache: cold since ${hhmm(since + minutes * 60_000)} (last cache request ${hhmm(since)})`,
    )
    lines.push(
      `Last main request: ${step.model} · ${reusedPct(step.reads, step.writes, step.input)}% reused · ${fmtTokens(cachedOf(step))} cached · rewrite ${dollarText(rewriteUsd(step, minutes))}`,
    )
  }
  const s = sum(t)
  const unpriced = s.unpricedReads > 0 ? ` (plus ${fmtTokens(s.unpricedReads)} reads on unpriced models)` : ''
  lines.push(
    `Session: reads ${fmtTokens(s.reads)} · writes ${fmtTokens(s.writes)} · ${reusedPct(s.reads, s.writes, s.input)}% reused · saved ≈ ${fmtUsd(s.savedUsd)}${unpriced}`,
  )
  lines.push(
    `  main loop: reads ${fmtTokens(t.main.reads)} · writes ${fmtTokens(t.main.writes)} · ${t.main.steps} requests; subagents: reads ${fmtTokens(t.agents.reads)} · writes ${fmtTokens(t.agents.writes)} · ${t.agents.steps} requests`,
  )
  return lines.join('\n')
}

const USAGE = `Usage: /${COMMAND} on | off | status | compact`

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'cache-clock',
      description: 'CACHE row: prompt-cache status (reads, writes, % reused, dollars saved), compact now, or turn the row on or off',
      argumentHint: 'on | off | status | compact',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the option applies.
    }
    const at = await $.clock.now()
    await update($, now, () => at)
    const since = await read($, lastCacheAt)
    stopTick()
    if (since && leftMs(since, at, windowMinutes(options.cacheMinutes)) > 0) startTick($, options)
    return started
  })

  // Each model request: its cache figures into the session totals; a main-loop
  // request that read or wrote the cache restarts the countdown from its start.
  on('turn.step', async function* ($, e, next) {
    let startedAt = 0
    try {
      startedAt = await $.clock.now()
    } catch {
      // Best effort: the row only.
    }
    const result = yield* next(e)
    try {
      const u = result.usage
      if (!u) return result
      const step: CacheStep = {
        model: u.model || e.model,
        reads: u.cache_read_input_tokens || 0,
        writes: u.cache_creation_input_tokens || 0,
        input: u.input_tokens || 0,
      }
      const minutes = windowMinutes(options.cacheMinutes)
      const isMain = e.agentId === undefined
      await update($, totals, t =>
        isMain ? { ...t, main: addStep(t.main, step, minutes) } : { ...t, agents: addStep(t.agents, step, minutes) },
      )
      if (!isMain || cachedOf(step) === 0) return result
      await update($, last, () => step)
      await update($, lastCacheAt, () => startedAt)
      await update($, now, () => startedAt)
      // A fresh interval on each cache step: a refused period ends the old
      // one, and `ticker` would still hold it.
      stopTick()
      startTick($, options)
    } catch {
      // The books are best effort: the step goes on whatever happens here.
    }
    return result
  })

  // A compaction of the main conversation (the person's /compact or the
  // engine's): the cached prefix is gone. Never changes the compaction.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result && result.skip === undefined) {
      await resetCache($).catch(() => {})
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A /clear or an in-process resume puts another conversation in this
  // process (no session.start fires for it): nothing of the old prefix is read
  // again, and the session totals start over. A compaction keeps the totals.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      await resetCache($).catch(() => {})
      await update($, totals, () => ({ main: emptyBucket(), agents: emptyBucket() })).catch(() => {})
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'cache-clock' }, async ($, e) => {
    const [verb = 'status'] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    switch (verb) {
      case 'on':
      case 'off':
        await $.store.set(STORE_BAND, verb)
        await update($, band, () => verb)
        return { text: verb === 'on' ? 'CACHE line on.' : `CACHE line off (no row, no toast; /${COMMAND} status and compact still work).` }
      case 'status':
        return { text: await statusText($, options) }
      case 'compact':
        compactNow($)
        return { text: 'Compacting the conversation; the result comes as a toast.' }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawRow($, e, () => next(e), options, () => compactNow($)))
}
