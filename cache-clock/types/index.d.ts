// The cache-clock mod's state contract.

/** The last main-loop request that read or wrote the prompt cache. */
export type CacheStep = {
  /** The model that answered, by the id the API reports. */
  model: string
  /** cache_read_input_tokens. */
  reads: number
  /** cache_creation_input_tokens. */
  writes: number
  /** input_tokens: the uncached part of the prompt. */
  input: number
}

/** Prompt-cache tokens summed over a session's requests. */
export type CacheBucket = {
  reads: number
  writes: number
  input: number
  /** Requests counted. */
  steps: number
  /** Estimated USD the reads saved: reads x (write price - read price). */
  savedUsd: number
  /** Cache reads on models the price table does not know (not in savedUsd). */
  unpricedReads: number
}

export type CacheTotals = {
  /** The main loop's requests. */
  main: CacheBucket
  /** Every subagent's requests (never shown on the row). */
  agents: CacheBucket
}

declare module 'claude-code' {
  interface PluginState {
    'cache-clock': {
      /** When the last main-loop request that touched the cache started; 0: none yet. */
      lastCacheAt: number
      /** That request's cache figures; null until one is seen (and after a compaction or /clear). */
      last: CacheStep | null
      totals: CacheTotals
      /** The tick's last time, so the row redraws as the countdown moves. */
      now: number
      /** The lastCacheAt the five-minutes-left toast was shown for. */
      warnedFor: number
      /** /cache-clock on|off as kept in the store; '' while the plugin option applies. */
      band: '' | 'on' | 'off'
    }
  }
}
