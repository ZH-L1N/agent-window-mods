// The handoff mod's state contract. The one value of token-weather's it reads
// is typed in peer.d.ts beside this file, kept out of this contract so the
// contract names only handoff's own state.

/** One row of the context breakdown, in /context's order. */
export type HandoffCategory = {
  name: string
  tokens: number
  /** Hex colour. */
  color: string
  /** `used`, `free` or `buffer` (deferred rows are left out). */
  kind: string
}

/** A context reading: token-weather's `context`, or this mod's own when token-weather is absent. */
export type HandoffContext = {
  categories: HandoffCategory[]
  /** Tokens in the window. */
  totalTokens: number
  /** The context window, in tokens. */
  maxTokens: number
  /** Where auto-compact fires, in tokens; absent when off or not reported. */
  autoCompactThreshold?: number
  /** `totalTokens` over `maxTokens`, a whole percentage. */
  percent: number
  /** When it was read, `$.clock.now()` milliseconds. */
  readAt: number
}

/** The row's settings: the options, overridden by what /handoff-line wrote to the store. */
export type HandoffSettings = {
  band: 'on' | 'off'
  mode: 'ask' | 'auto'
  /** Percent of the compaction point at which the row turns red. */
  threshold: number
}

/** Where a save stands: none asked, HANDOFF.md being written, or written. */
export type HandoffSave = {
  phase: 'idle' | 'saving' | 'saved'
  /** When the save was asked. */
  requestedAt: number
  /** HANDOFF.md's mtime when the save was asked (0: no file). */
  baseMtime: number
  /** HANDOFF.md's mtime once written. */
  savedAt: number
  /** How it was asked: the person's /handoff command, or a prompt to Claude. */
  via: 'command' | 'prompt' | ''
}

/** The resume offer of a session that starts with a HANDOFF.md in its root. */
export type HandoffOffer = {
  mtimeMs: number
  /** `2d ago`, as of when the offer was made. */
  age: string
  /** The objective's first line. */
  objective: string
}

declare module 'claude-code' {
  interface PluginState {
    handoff: {
      /** This mod's own reading, taken only while token-weather publishes none. */
      context: HandoffContext | null
      settings: HandoffSettings
      save: HandoffSave
      offer: HandoffOffer | null
      /** True from a crossing of the threshold until the fill drops under it. */
      isOver: boolean
      /** When /clear last ran: a reading older than this is stale. */
      clearedAt: number
    }
  }
}
