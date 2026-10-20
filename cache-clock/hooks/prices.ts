// Prompt-cache prices per model, for the CACHE row's rewrite estimate and the
// saved-dollars figure of /cache-clock status. Estimates only.
//
// Another copy of this table lives in ~/.claude/mods/agents/hooks/kit.ts (the
// agents mod's run costs). Plugins cannot import across mod folders, so the
// table is duplicated: change both when prices change.

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// From the claude-api skill bundled with Claude Code 2.1.303 (model table
// cached 2026-10-06; read 2026-10-19): cache reads 0.025x input on Fable 5.1 /
// Mythos 5.1, 0.05x on Opus 5.5, 0.1x elsewhere; 5-minute cache writes 1.25x
// input; 1-hour cache writes 2x input (WRITE_1H_X below), e.g. Opus 5.5 $8,
// Sonnet 5.5 $4, Fable 5.1 $20.
type Price = readonly [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: Record<string, Price> = {
  'fable-5.1': [10, 50, 0.25, 12.5],
  'mythos-5.1': [10, 50, 0.25, 12.5],
  'fable-5': [10, 50, 1, 12.5],
  'mythos-5': [10, 50, 1, 12.5],
  'opus-5.5': [4, 20, 0.2, 5],
  'opus-5': [5, 25, 0.5, 6.25],
  'opus-4.8': [5, 25, 0.5, 6.25],
  'opus-4.7': [5, 25, 0.5, 6.25],
  'opus-4.6': [5, 25, 0.5, 6.25],
  'sonnet-5.5': [2, 10, 0.2, 2.5],
  'sonnet-5': [2, 10, 0.2, 2.5],
  'sonnet-4.6': [3, 15, 0.3, 3.75],
  'haiku-5.5': [0.1, 0.5, 0.01, 0.125],
  'haiku-4.5': [1, 5, 0.1, 1.25],
}
// Haiku 5.5 is priced by prompt length: a request whose prompt (input and cache
// reads and writes) is over 100K tokens pays these instead.
const HAIKU_55_LONG: Price = [0.5, 2.5, 0.05, 0.625]
const HAIKU_55_LONG_PROMPT = 100_000

/** A 1-hour cache write costs this many times the input price. */
export const WRITE_1H_X = 2

const MODEL_RE = /(fable|mythos|opus|sonnet|haiku)(?:-(\d+)(?:-(\d{1,2})(?!\d))?)?/i

/** `opus` for `claude-opus-5-5`; '' for an unknown model. */
export const familyOf = (model: string): string => MODEL_RE.exec(model)?.[1]?.toLowerCase() ?? ''

/** `5.5` for `claude-opus-5-5`; '' when the id names no version. */
export const versionOf = (model: string): string => {
  const m = MODEL_RE.exec(model)
  return m?.[2] ? `${m[2]}${m[3] ? '.' + m[3] : ''}` : ''
}

/** The cache prices for one request, USD per million tokens; null for an unknown model. */
export type CachePrice = { read: number; write: number }

/**
 * The cache read and write prices of `model` for a prompt of `promptTokens`,
 * the write at the rate of the cache's TTL (`minutes`: 5 or 60).
 */
export function cachePriceOf(model: string, promptTokens: number, minutes: number): CachePrice | null {
  const key = `${familyOf(model)}-${versionOf(model)}`
  const base = PRICES[key]
  if (!base) return null
  const [input, , read, write5m] = key === 'haiku-5.5' && promptTokens > HAIKU_55_LONG_PROMPT ? HAIKU_55_LONG : base
  return { read, write: minutes >= 60 ? input * WRITE_1H_X : write5m }
}
