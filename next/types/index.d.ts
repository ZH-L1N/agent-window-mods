// The next mod's state contract. The one value of goal-meter's it reads is
// typed in peer.d.ts beside this file, kept out of this contract so the
// contract names only next's own state.

/** The suggestion model, as the `model` option names it. */
export type NextModel = 'haiku' | 'sonnet'

declare module 'claude-code' {
  interface PluginState {
    next: {
      /** The suggestions the row shows, at most three, each at most 60 characters; [] when none. */
      suggestions: string[]
      /** The model a call is asking now; '' while no call runs. */
      busy: '' | NextModel
    }
  }
}
