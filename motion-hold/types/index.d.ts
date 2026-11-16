// The motion-hold mod's state contract. The strip mod reads `active` (its
// stop pill); nothing here is read from another mod.

/** The approved call that is running now, or an approved background launch or Monitor watch. */
export type MotionActive = {
  /** The tool call's id. */
  id: string
  /** The kinds of the reasons it was held for (`site`, `power`, ...). */
  kinds: string[]
  /** What it does, in words: "run a site motion command on rig-1.local". */
  summary: string
  host: string | null
  /** The command, cleaned and cut to 160 characters. */
  command: string
  /** When it was approved, in epoch milliseconds. */
  startedAt: number
  /** A background Bash launch or a Monitor watch: the row stays until it is cleared. */
  isBackground: boolean
  /** Set when a subagent made the call. */
  agentId?: string
}

/** One command the gate saw: held, or passed while naming a configured host. */
export type MotionSeen = {
  at: number
  verdict: 'passed' | 'ran' | 'denied'
  /** Why it passed, what it did, or why it was refused. */
  why: string
  host: string | null
  /** The command, cleaned and cut to 160 characters. */
  command: string
}

/** The site config as it was last read. */
export type MotionConfig = {
  status: 'none' | 'ok' | 'broken'
  /** The file's absolute path; '' when it could not be worked out. */
  path: string
  /** How many host globs it lists. */
  hosts: number
  /** How many hold and stop patterns it lists. */
  rules: number
  /** Whether it names a stop command. */
  hasStop: boolean
  /** Why the read is broken; for a read that is ok, its warnings; else ''. */
  error: string
}

declare module 'claude-code' {
  interface PluginState {
    'motion-hold': {
      active: MotionActive | null
      /** The newest 30, newest first. */
      recent: MotionSeen[]
      config: MotionConfig
    }
  }
}
