// Local change 6 (zehui-mods): token-weather's state contract. The latest
// context reading, published after every main-loop turn, at session.start and
// after a compaction, for the handoff mod's ⇄ HANDOFF row.

/** One row of the context breakdown, in /context's order. */
export type TokenWeatherCategory = {
  /** The row's label as /context prints it (`System prompt`, `Messages`, `Free space`). */
  name: string
  /** The row's estimated tokens. */
  tokens: number
  /** The row's colour as hex, from the theme key the breakdown names (grey `#9a9a96` when unknown). */
  color: string
  /** `used`, `free` or `buffer`; deferred rows are left out. */
  kind: string
}

/** The latest context reading of the session's main loop. */
export type TokenWeatherContext = {
  /** The breakdown's rows (deferred left out); empty on a build without a breakdown. */
  categories: TokenWeatherCategory[]
  /** Tokens in the window: the last response's input, or the breakdown's estimate before one. */
  totalTokens: number
  /** The context window, in tokens. */
  maxTokens: number
  /** Where auto-compact fires, in tokens; absent when it is off or not reported. */
  autoCompactThreshold?: number
  /** `totalTokens` over `maxTokens`, a whole percentage. */
  percent: number
  /** When the reading was taken, `$.clock.now()` milliseconds. */
  readAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-weather': {
      context: TokenWeatherContext
    }
  }
}
