// The strip mod's state contract. The values of other mods it reads are typed
// in peer.d.ts beside this file, kept out of this contract so it names only
// the strip's own state.

/** The strip's own context reading, taken from $.session.usage. */
export type StripUsage = {
  /** Tokens in use. */
  used: number
  /** What the percent is measured against: the auto-compact threshold when known, else the window. */
  limit: number
  /** True when `limit` is the auto-compact threshold. */
  isThreshold: boolean
  /** When it was read, `$.clock.now()` milliseconds. */
  readAt: number
}

/** One line of a recorded diff: a hunk header, a kept, added or removed line (its marker kept in `text`), or a note. */
export type DiffLine = { kind: 'hunk' | 'ctx' | 'add' | 'del' | 'note'; text: string }

/** One applied Edit or Write, as the diff pane shows it. */
export type DiffStep = {
  /** The path as the tool's result named it. */
  file: string
  tool: 'Edit' | 'Write'
  /** At most 400 lines and a closing note; each line cut to 300 characters. */
  lines: DiffLine[]
  /** Lines added and removed, counted before the cut. */
  adds: number
  dels: number
}

/**
 * The session's health: fine, or the last thing that went wrong (`login`:
 * the login no longer works; `limit`: a rate or spend limit was reached;
 * `error`: the last turn died on an API error), when, and the engine's word.
 */
export type Health = { kind: 'ok' } | { kind: 'login' | 'limit' | 'error'; at: number; detail: string }

declare module 'claude-code' {
  interface PluginState {
    strip: {
      /** The fallback context reading; null until the first. */
      usage: StripUsage | null
      /** Applied edits (Edit, Write) of the running main-loop turn, the newest 50. */
      steps: DiffStep[]
      /** The edits of the last main-loop turn that made any. */
      last: DiffStep[]
      /** The step the diff pane shows, 0-based. */
      sel: number
      /** When the running main-loop turn started; null between turns. */
      turnAt: number | null
      /** The tick's last time, so the cache minutes redraw. */
      now: number
      /** When the last /clear (or in-process resume) was seen; readings older than it are stale. */
      clearedAt: number
      health: Health
      /** True: the SYS, PLAN, HANDOFF and CACHE rows are drawn again (/strip rows show). */
      isShowingRows: boolean
      /** True: panes opened without a background colour get none painted (/strip panes clear). */
      isPanesClear: boolean
      /** The cache-clock mod's prompt-cache lifetime option, as read at the session's start: 5 or 60. */
      cacheMinutes: number
    }
  }
}
