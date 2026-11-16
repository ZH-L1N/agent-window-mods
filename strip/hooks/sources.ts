// Where each pill's value comes from. Any plugin reads another plugin's
// $.state value by its literal { plugin, key }; its owner alone writes it. A
// value whose plugin is not loaded reads as undefined, and a read can fail
// while an owner reloads: either way the pill falls back to the next source
// or draws dim, and nothing here throws. Each source is said in words, for
// /strip sources. The refs are consts of this file: the engine reads a state
// source only from a const of the calling file.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { noControls } from './diff'
import { healthText } from './health'
import type { ContextData, SystemData } from './panes'
import type { Facts, PillId } from './pills'

// The strip's own values.
const usage = atom({ plugin: 'strip', key: 'usage' } as const, null)
const steps = atom({ plugin: 'strip', key: 'steps' } as const, [])
const last = atom({ plugin: 'strip', key: 'last' } as const, [])
const turnAt = atom({ plugin: 'strip', key: 'turnAt' } as const, null)
const now = atom({ plugin: 'strip', key: 'now' } as const, 0)
const clearedAt = atom({ plugin: 'strip', key: 'clearedAt' } as const, 0)
const health = atom({ plugin: 'strip', key: 'health' } as const, { kind: 'ok' })
const cacheMinutes = atom({ plugin: 'strip', key: 'cacheMinutes' } as const, 60)

// Other mods' values, each optional.
const TW_CONTEXT = { plugin: 'token-weather', key: 'context' } as const
const TW_TOTALS = { plugin: 'token-weather', key: 'totals' } as const
const HANDOFF_CONTEXT = { plugin: 'handoff', key: 'context' } as const
const HANDOFF_CLEARED_AT = { plugin: 'handoff', key: 'clearedAt' } as const
const HANDOFF_IS_OVER = { plugin: 'handoff', key: 'isOver' } as const
const HANDOFF_SAVE = { plugin: 'handoff', key: 'save' } as const
const HANDOFF_OFFER = { plugin: 'handoff', key: 'offer' } as const
const CACHE_LAST_AT = { plugin: 'cache-clock', key: 'lastCacheAt' } as const
const CACHE_NOW = { plugin: 'cache-clock', key: 'now' } as const
const AGENT_RUNS = { plugin: 'agents', key: 'runs' } as const
const QUEUE = { plugin: 'queue', key: 'queue' } as const
const SYS_READING = { plugin: 'sys', key: 'reading' } as const
const PEERS_SEEN = { plugin: 'peers', key: 'seen' } as const
const TEST_RUNS = { plugin: 'redgreen', key: 'runs' } as const
const MOTION_ACTIVE = { plugin: 'motion-hold', key: 'active' } as const

/** One read of another mod's value: `undefined` when its owner is not loaded, `isBroken` when the read itself failed. */
type Got<T> = { value: T | undefined; isBroken: boolean }
const got = <T>(reading: Promise<{ value: T }>): Promise<Got<T>> =>
  reading.then(
    r => ({ value: r.value as T | undefined, isBroken: false }),
    () => ({ value: undefined, isBroken: true }),
  )

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** A text safe to draw on one line: no control characters but tab, at most `max` characters. */
const tidy = (v: unknown, max = 120): string => noControls(String(v ?? '')).slice(0, max)
/** Why a source has nothing: its read failed, or nothing was written. An unwritten value reads the same whether its mod is absent or only has nothing to say yet, so the text names both. */
const absent = (ref: string, mod: string, isBroken: boolean): string => (isBroken ? `none: ${ref} could not be read` : `none: the ${mod} mod has written no value yet, or is not loaded`)

/** A context reading as token-weather publishes it and handoff keeps its own. */
type ContextLike = {
  totalTokens: number
  maxTokens: number
  autoCompactThreshold?: number
  readAt: number
  categories?: readonly { name: string; tokens: number; color: string }[]
}

type Picked = {
  /** Where the reading came from, in words; `none` with no reading. */
  from: string
  used: number
  limit: number
  isThreshold: boolean
  pct: number | null
  categories: { name: string; tokens: number; color: string }[]
}

/** Against the auto-compact threshold when the reading has one, else against the window; null when neither is known. */
function measure(c: ContextLike): { used: number; limit: number; isThreshold: boolean } | null {
  if (!isNum(c.totalTokens)) return null
  const threshold = isNum(c.autoCompactThreshold) && c.autoCompactThreshold > 0 ? c.autoCompactThreshold : 0
  const limit = threshold > 0 ? threshold : isNum(c.maxTokens) ? c.maxTokens : 0
  if (!(limit > 0)) return null
  return { used: Math.max(0, c.totalTokens), limit, isThreshold: threshold > 0 }
}

const categoriesOf = (c: ContextLike): Picked['categories'] =>
  Array.isArray(c.categories)
    ? c.categories
        .filter(k => isObj(k) && isNum(k.tokens))
        .slice(0, 40)
        .map(k => ({ name: tidy(k.name, 60), tokens: k.tokens, color: typeof k.color === 'string' && k.color !== '' ? tidy(k.color, 40) : '#9a9a96' }))
    : []

/**
 * The context reading: token-weather's, else handoff's own, else the strip's.
 * A reading taken before the last /clear (the strip's record of it or
 * handoff's) is stale and skipped: token-weather does not reset on /clear.
 */
async function pickContext($: EngineInterface): Promise<Picked> {
  const handoffCleared = (await got($.state.get(HANDOFF_CLEARED_AT))).value
  const cutoff = Math.max(await read($, clearedAt), isNum(handoffCleared) ? handoffCleared : 0)
  const isFresh = (readAt: unknown): boolean => (isNum(readAt) ? readAt >= cutoff : cutoff === 0)
  const others: [string, Got<ContextLike | null | undefined>][] = [
    ['token-weather.context', await got<ContextLike | null | undefined>($.state.get(TW_CONTEXT))],
    ['handoff.context', await got<ContextLike | null | undefined>($.state.get(HANDOFF_CONTEXT))],
  ]
  for (const [from, g] of others) {
    const c = g.value
    if (!isObj(c) || !isFresh(c.readAt)) continue
    const m = measure(c)
    if (m) return { from, ...m, pct: Math.round((m.used / m.limit) * 100), categories: categoriesOf(c) }
  }
  const own = await read($, usage)
  if (own && isFresh(own.readAt) && own.limit > 0) {
    return {
      from: 'own $.session.usage reading',
      used: own.used,
      limit: own.limit,
      isThreshold: own.isThreshold,
      pct: Math.round((own.used / own.limit) * 100),
      categories: [],
    }
  }
  return { from: 'none', used: 0, limit: 0, isThreshold: false, pct: null, categories: [] }
}

/**
 * Whether the HANDOFF row has something to act on (its threshold was crossed,
 * a save is under way or done, a resume offer stands), and so stays although
 * the strip replaces it. Also true when that cannot be told: a read failed.
 * Only a row that is there is ever kept, so "cannot tell" errs on the side of
 * showing it. A value that reads undefined was never written and counts as its
 * owner's initial value: handoff writes isOver only once its threshold is
 * crossed or after a clear, so an ordinary session never has it.
 */
export async function readKeepHandoff($: EngineInterface): Promise<boolean> {
  const isOver = await got($.state.get(HANDOFF_IS_OVER))
  const save = await got($.state.get(HANDOFF_SAVE))
  const offer = await got($.state.get(HANDOFF_OFFER))
  if (isOver.isBroken || save.isBroken || offer.isBroken) return true
  if (isOver.value === true) return true
  const phase = isObj(save.value) ? save.value.phase : undefined
  if (phase !== undefined && phase !== 'idle') return true
  return offer.value !== null && offer.value !== undefined
}

/** One reading of the strip's own into state: the fallback when token-weather and handoff publish none. */
export async function refreshUsage($: EngineInterface): Promise<void> {
  const u = await $.session.usage({ breakdown: 'summary' })
  const at = await $.clock.now()
  const bd = u.context.breakdown
  if (bd && bd.rawMaxTokens > 0) {
    const threshold = bd.isAutoCompactEnabled && isNum(bd.autoCompactThreshold) && bd.autoCompactThreshold > 0 ? bd.autoCompactThreshold : 0
    await update($, usage, () => ({ used: bd.totalTokens, limit: threshold || bd.rawMaxTokens, isThreshold: threshold > 0, readAt: at }))
    return
  }
  await update($, usage, () => ({ used: u.context.tokens ?? 0, limit: u.context.window, isThreshold: false, readAt: at }))
}

/** The pills' facts, where each came from, and whether the HANDOFF row stays. */
export async function readFacts($: EngineInterface): Promise<{ facts: Facts; sources: Record<PillId, string>; keepHandoff: boolean }> {
  // The tick is read whatever else is, so the drawing redraws as it moves.
  const tick = await read($, now)

  const motion = await got($.state.get(MOTION_ACTIVE))
  const stop: Facts['stop'] = isObj(motion.value) ? { summary: tidy(motion.value.summary) } : null

  const ctx = await pickContext($)
  const context: Facts['context'] = ctx.pct === null ? null : { pct: ctx.pct }

  // Cache: what is left of cache-clock's window since the last request that touched the cache.
  const lastAt = await got($.state.get(CACHE_LAST_AT))
  const theirNow = (await got($.state.get(CACHE_NOW))).value
  const minutes = await read($, cacheMinutes)
  let cacheLeftMs: number | null = null
  let cacheSource = absent('cache-clock.lastCacheAt', 'cache-clock', lastAt.isBroken)
  if (isNum(lastAt.value) && lastAt.value > 0) {
    const at = Math.max(await $.clock.now().catch(() => 0), isNum(theirNow) ? theirNow : 0, tick)
    cacheLeftMs = lastAt.value + minutes * 60_000 - at
    cacheSource = `cache-clock.lastCacheAt, ${cacheLeftMs > 0 ? `${Math.ceil(cacheLeftMs / 60_000)}m left` : 'cold'} of a ${minutes}-minute window`
  } else if (isNum(lastAt.value)) {
    cacheSource = 'cache-clock.lastCacheAt is 0: no cache request yet'
  }

  // Diff: the strip's own recorder; the running turn's count once it has one, else the last turn's.
  const isTurn = (await read($, turnAt)) !== null
  const running = (await read($, steps)).length
  const isRunningShown = isTurn && running > 0
  const diff = isRunningShown ? running : (await read($, last)).length

  const runs = await got($.state.get(TEST_RUNS))
  const lastRun = Array.isArray(runs.value) ? runs.value[runs.value.length - 1] : undefined
  const tests: Facts['tests'] =
    isObj(lastRun) && isNum(lastRun.passed) && isNum(lastRun.failed) ? { failed: lastRun.failed, total: lastRun.passed + lastRun.failed } : null

  const agentRuns = await got($.state.get(AGENT_RUNS))
  const agentList = Array.isArray(agentRuns.value) ? agentRuns.value : null
  const agents = agentList ? agentList.filter(r => isObj(r) && r.status === 'running' && (r.kind === undefined || r.kind === 'agent')).length : 0

  const q = await got($.state.get(QUEUE))
  const items = isObj(q.value) && Array.isArray(q.value.items) ? q.value.items.length : 0
  const queue: Facts['queue'] = { count: items, isPaused: isObj(q.value) && q.value.isPaused === true }

  const reading = await got($.state.get(SYS_READING))
  const r = isObj(reading.value) ? reading.value : null
  const ram = r && isObj(r.ram) && isNum(r.ram.used) && isNum(r.ram.total) && r.ram.total > 0 ? Math.round((r.ram.used / r.ram.total) * 100) : null
  const sys: Facts['sys'] = r ? { ram, cpu: isNum(r.cpu) ? r.cpu : null } : null

  const seen = await got($.state.get(PEERS_SEEN))
  const panes = isObj(seen.value) ? Object.values(seen.value) : []
  const peers: Facts['peers'] = { count: panes.length, waiting: panes.filter(p => isObj(p) && p.status === 'blocked').length }

  const h = await read($, health)
  const words = healthText(h)

  return {
    facts: { stop, context, cacheLeftMs, diff, tests, agents, queue, sys, peers, health: words === null ? null : { text: words } },
    sources: {
      stop: stop
        ? `motion-hold.active: ${stop.summary || 'a held motion is running'}`
        : motion.value === null
          ? 'motion-hold.active: nothing is moving (no pill)'
          : `${absent('motion-hold.active', 'motion-hold', motion.isBroken)} (no pill)`,
      context: ctx.pct === null ? 'none: no reading yet' : `${ctx.from}, ${ctx.pct}% of the ${ctx.isThreshold ? 'auto-compact threshold' : 'window'}`,
      cache: cacheSource,
      diff: `own recorder, ${diff} edit${diff === 1 ? '' : 's'} in the ${isRunningShown ? 'running' : 'last'} turn`,
      tests: tests
        ? `redgreen.runs, the last run: ${tests.total - tests.failed} passed, ${tests.failed} failed`
        : Array.isArray(runs.value)
          ? 'redgreen.runs: no run yet'
          : absent('redgreen.runs', 'redgreen', runs.isBroken),
      agents: agentList ? `agents.runs, ${agents} running subagent${agents === 1 ? '' : 's'} of ${agentList.length} runs` : absent('agents.runs', 'agents', agentRuns.isBroken),
      queue: isObj(q.value) ? `queue.queue, ${items} waiting${queue.isPaused ? ', paused' : ''}` : absent('queue.queue', 'queue', q.isBroken),
      system: r
        ? `sys.reading, RAM ${ram ?? '?'}% CPU ${sys?.cpu ?? '?'}%`
        : reading.value === null
          ? 'sys.reading: no reading yet'
          : absent('sys.reading', 'sys', reading.isBroken),
      peers: isObj(seen.value)
        ? `peers.seen, ${peers.count} other pane${peers.count === 1 ? '' : 's'}, ${peers.waiting} waiting`
        : seen.value === null
          ? 'peers.seen: no poll yet'
          : absent('peers.seen', 'peers', seen.isBroken),
      health: h.kind === 'ok' ? 'own record: nothing is wrong (no pill)' : `own record: ${words} (${tidy(h.detail)})`,
    },
    keepHandoff: await readKeepHandoff($),
  }
}

/** The local day of a moment, `YYYY-MM-DD`, in the form token-weather writes `today.ymd`. */
function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The context pane's data: the same reading the pill shows, by category, and
 * token-weather's totals. Its `today` is kept only while it is the clock's own
 * day: totals published before midnight and not since are yesterday's sum.
 */
export async function readContextData($: EngineInterface): Promise<ContextData> {
  const ctx = await pickContext($)
  const t = (await got($.state.get(TW_TOTALS))).value
  const day = dayOf(await $.clock.now())
  const today =
    isObj(t) && isObj(t.today) && isNum(t.today.tokens) && t.today.ymd === day ? { ymd: tidy(t.today.ymd, 10), tokens: t.today.tokens } : null
  const month =
    isObj(t) && isObj(t.month) && isNum(t.month.usd) && isNum(t.month.tokens) ? { ym: tidy(t.month.ym, 7), usd: t.month.usd, tokens: t.month.tokens } : null
  return {
    pct: ctx.pct,
    used: ctx.used,
    limit: ctx.limit,
    isThreshold: ctx.isThreshold,
    categories: ctx.categories,
    totals: isObj(t) ? { costUsd: isNum(t.costUsd) ? t.costUsd : null, today, month } : null,
  }
}

/** The system pane's data: the sys mod's latest reading. */
export async function readSystemData($: EngineInterface): Promise<SystemData> {
  const r = (await got($.state.get(SYS_READING))).value
  if (!isObj(r)) return { reading: null }
  const ram = isObj(r.ram) && isNum(r.ram.used) && isNum(r.ram.total) ? { used: r.ram.used, total: r.ram.total } : null
  const battery = isObj(r.battery) && isNum(r.battery.percent) ? { percent: r.battery.percent, isCharging: r.battery.isCharging === true } : null
  return { reading: { cpu: isNum(r.cpu) ? r.cpu : null, ram, battery } }
}
