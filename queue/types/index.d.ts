// The queue mod's state contract: the strip reads it for its queue pill.

/** The queue: the prompts waiting, whether sending is paused, the pane's selection, a send in flight. */
export type QueueState = {
  /** The prompts waiting, first sent first; each at most 4,000 characters, at most 50. */
  items: string[]
  /** True: a turn's end sends nothing (set by /q pause and by a turn that did not finish). */
  isPaused: boolean
  /** The pane's selected item, 0-based; 0 when the queue is empty. */
  selected: number
  /**
   * True from the moment this mod submits a prompt until a main-loop turn
   * starts (or the session starts): a turn's end sends nothing more meanwhile.
   * Kept in state, not in the module, so a hot reload cannot send twice.
   */
  isSending: boolean
  /**
   * What the automatic send of item 1 is waiting on: a running subagent, a
   * survey holding the band, or '' for nothing.
   */
  waitingOn: '' | 'agents' | 'survey'
}

declare module 'claude-code' {
  interface PluginState {
    queue: {
      /** The whole queue in one value, so every change is one versioned write. */
      queue: QueueState
    }
  }
}
