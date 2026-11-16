// The values of other mods the strip reads, in the few fields it reads. Any
// plugin may read another's state; only its owner writes it. A missing owner
// reads `undefined`, whatever the type here says, and the strip then draws
// "no data". Declared for the type checker only: plugin.json names index.d.ts
// as the strip's contract, not this file.
//
// One block for each owner, under a line `// peer: <owner>`, each
// self-contained (inline object types, no import), so a block can be lifted
// out on its own as a stand-in for an owner that is not in the repo yet.
export {}

// peer: token-weather
declare module 'claude-code' {
  interface PluginState {
    'token-weather': {
      /** The latest context reading of the main loop. */
      context: {
        categories: { name: string; tokens: number; color: string }[]
        totalTokens: number
        maxTokens: number
        /** Absent when auto-compact is off or not reported. */
        autoCompactThreshold?: number
        /** When it was read, `$.clock.now()` milliseconds. */
        readAt: number
      }
      /** The session cost, today's tokens and the month's total, as its row shows them. */
      totals: {
        costUsd: number | null
        today: { ymd: string; tokens: number } | null
        month: { ym: string; usd: number; tokens: number } | null
        readAt: number
      }
    }
  }
}

// peer: handoff
declare module 'claude-code' {
  interface PluginState {
    handoff: {
      /** Its own reading, taken only while token-weather publishes none. */
      context: {
        categories: { name: string; tokens: number; color: string }[]
        totalTokens: number
        maxTokens: number
        autoCompactThreshold?: number
        readAt: number
      } | null
      /** When /clear last ran: a reading older than this is stale. */
      clearedAt: number
      /** True from a crossing of its threshold until the fill drops under it. */
      isOver: boolean
      save: { phase: string }
      /** The resume offer; null: none. */
      offer: { objective: string } | null
    }
  }
}

// peer: cache-clock
declare module 'claude-code' {
  interface PluginState {
    'cache-clock': {
      /** When the last main-loop request that touched the cache started; 0: none yet. */
      lastCacheAt: number
      /** Its tick's last time. */
      now: number
    }
  }
}

// peer: agents
declare module 'claude-code' {
  interface PluginState {
    agents: {
      /** `kind` absent or `agent`: a subagent; `shell`, `watch` and `cron` are not counted. */
      runs: { status: string; kind?: string }[]
    }
  }
}

// peer: queue
declare module 'claude-code' {
  interface PluginState {
    queue: {
      queue: { items: string[]; isPaused: boolean }
    }
  }
}

// peer: sys
declare module 'claude-code' {
  interface PluginState {
    sys: {
      reading: {
        cpu: number | null
        ram: { used: number; total: number } | null
        battery: { percent: number; isCharging: boolean } | null
      } | null
    }
  }
}

// peer: peers
declare module 'claude-code' {
  interface PluginState {
    peers: {
      /** The other panes by pane id; `blocked` is a pane waiting for its person. */
      seen: Record<string, { status: string }> | null
    }
  }
}

// peer: redgreen
declare module 'claude-code' {
  interface PluginState {
    redgreen: {
      /** The parsed test runs, newest last. */
      runs: { passed: number; failed: number }[]
    }
  }
}

// peer: motion-hold
declare module 'claude-code' {
  interface PluginState {
    'motion-hold': {
      /** The held motion that is running now; null: none. */
      active: { summary: string } | null
    }
  }
}
