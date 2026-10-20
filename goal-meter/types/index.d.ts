// The goal-meter mod's state contract.

export type GoalTaskStatus = 'pending' | 'in_progress' | 'completed'

/** One task of the main loop's task list, as the goal keeps it. */
export type GoalTask = {
  /** TaskCreate's id, or one minted for a TodoWrite item. */
  id: string
  title: string
  status: GoalTaskStatus
  /** When it went in_progress; absent while pending, or when it went straight to completed. */
  startedAt?: number
  /** When it was completed. */
  doneAt?: number
}

/** The goal: one task list of the main loop, from its first task to its last finish. */
export type Goal = {
  /** The first line of the prompt that started the turn the list was made in, cut to 50 characters. */
  name: string
  startedAt: number
  tasks: GoalTask[]
  /** When the last task was completed; absent while any is open. */
  doneAt?: number
}

/** A goal as the history keeps it ($.store 'goal-meter.history', the last five). */
export type GoalRecord = {
  name: string
  startedAt: number
  doneAt?: number
  total: number
  done: number
}

declare module 'claude-code' {
  interface PluginState {
    'goal-meter': {
      /** The goal in this conversation; null before the first task list, after /goals clear or a /clear. */
      goal: Goal | null
      /** The last five goals, newest first (a mirror of the store, so the pane redraws). */
      history: GoalRecord[]
      /** The tick's last time, so the row's minutes move. */
      now: number
      /** The first line of the last main-loop prompt that started a turn. */
      prompt: string
      /** /goals on|off as kept in the store; '' while the plugin option applies. */
      band: '' | 'on' | 'off'
    }
  }
}
