// The one value of another plugin this mod reads: goal-meter's goal (its
// `goal-meter.goal` state). Any plugin may read another's state; only its
// owner writes it. Declared here for the type checker only, in the few
// fields this mod reads: plugin.json names index.d.ts as the contract, not this.

/** goal-meter's goal, as far as this mod reads it. */
export type PeerGoal = {
  name: string
  tasks: { title: string; status: string }[]
  /** Set once every task is done. */
  doneAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'goal-meter': {
      goal: PeerGoal | null
    }
  }
}
