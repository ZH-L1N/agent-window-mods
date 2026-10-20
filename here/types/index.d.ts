// The here mod's state contract. The one value of goal-meter's it reads is
// typed in peer.d.ts beside this file, kept out of this contract so the
// contract names only here's own state.

/**
 * What Claude is doing now: the main loop's last tool call. (The spinner word,
 * shown before a turn's first tool call, is not state: it is seen only while
 * the Spinner is drawn, when no state may be written; see hooks/live.ts.)
 */
export type HereNow = {
  /** `Editing agents/hooks/kit.ts`, `Running pytest`. */
  text: string
  /** When it was recorded, `$.clock.now()` milliseconds. */
  at: number
}

/** The three parts as one Haiku call rewrote them (option rewrite=haiku); empty strings fall back to the plain parts. */
export type HereRewrite = {
  goal: string
  now: string
  you: string
  /** The main-loop turn whose answer it was made from. */
  turnId: string
}

/**
 * The goal when goal-meter has none: the first line of the prompt that started
 * the main loop's open task list, kept while any of its items is open.
 */
export type HereGoal = {
  /** That prompt's first line, cut to 200 characters; '' when no prompt was seen. */
  text: string
  /** TodoWrite items not completed, as the last TodoWrite listed them. */
  todos: number
  /** Ids of TaskCreate tasks not yet completed or deleted. */
  tasks: string[]
}

declare module 'claude-code' {
  interface PluginState {
    here: {
      /** The last tool call of the main loop; null before any, and from a main-loop turn's start to its first tool call. */
      now: HereNow | null
      /** The question lines of the last main-loop reply, each cut to 200 characters; [] once the next prompt is sent. */
      you: string[]
      /** /here on|off as kept in the store; '' while the default (on) applies. */
      band: '' | 'on' | 'off'
      /** The Haiku rewrite of the last answer; null without one, and once the next prompt is sent. */
      rewrite: HereRewrite | null
      /** The fallback goal (goal-meter has none): null while no main-loop task list is open. */
      goal: HereGoal | null
    }
  }
}
