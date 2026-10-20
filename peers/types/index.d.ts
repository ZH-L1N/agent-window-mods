// The peers mod's state contract.

/** A herdr agent's state as `herdr agent list` reports it (`agent_status`). */
export type PeerStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

/** What this session last saw of one peer pane. */
export type PeerSeen = {
  /** The pane's last state. */
  status: PeerStatus
  /** When this session first saw the pane in that state, `$.clock.now()` milliseconds. */
  since: number
  /** The agent herdr names (`claude`, `codex`). */
  agent: string
  /** The pane's terminal title without its spinner (`terminal_title_stripped`); '' when none. */
  title: string
}

/** One row of the board pane: a peer as the last board read saw it. */
export type BoardRow = {
  pane: string
  agent: string
  status: PeerStatus
  title: string
  /**
   * When the pane was first seen in this state, `$.clock.now()` milliseconds:
   * from the alarm's `seen` when it has the pane so, else from the last board
   * read, else the time of this read (then no time is drawn yet).
   */
  since: number
}

/** The board pane's data, as of its last read of herdr. */
export type Board = {
  /** When herdr was read, `$.clock.now()` milliseconds. */
  at: number
  /** The herdr workspace read. */
  workspace: string
  /** The peers, in herdr's order (the drawing puts blocked ones first). */
  rows: BoardRow[]
}

/**
 * A HERDR-ORCH request this session took part in, from the envelope headers
 * (`[HERDR-ORCH v0] req=<id> from=<agent>@<pane> type=<type>`) in its prompts.
 */
export type OrchRequest = {
  /** The request id (`req=`), also the folder under `~/.local/state/herdr-orch/`. */
  req: string
  /** The spoke's pane id (`w1:p6`); '' while no envelope named it. */
  pane: string
  /** The type of the last envelope seen (`request`, `progress`, `completed`, ...). */
  type: string
  /** The round, from `round 4/5`, `round 4 of 5`, `round 4` or a `-r4` req suffix; null when none. */
  round: number | null
  /** The round ceiling, from `round 4/5`, `ceiling 5`, `max rounds 5`; null when none. */
  ceiling: number | null
  /** When the first envelope of the request was submitted here, `$.clock.now()` milliseconds. */
  sentAt: number
  /** When the deadline passes (the brief's `deadline: N minutes`, else POLICY's 30 minutes for a request or handoff); null when unknown. */
  deadlineAt: number | null
  /**
   * The result file as last read while the board was open: null when not read
   * yet or missing, '' when it is there without a valid `status:` line, else
   * its status (`completed`, `failed`, `blocked`).
   */
  result: string | null
}

declare module 'claude-code' {
  interface PluginState {
    peers: {
      /**
       * The peers of this workspace by pane id (this pane left out), as of the
       * last poll; null until the first poll, which only takes a baseline.
       */
      seen: Record<string, PeerSeen> | null
      /**
       * True once a peer was seen working in this session and ALL DONE has not
       * fired since; ALL DONE fires only while it is true, and a peer going
       * working sets it again.
       */
      isArmed: boolean
      /** The board pane's last read of herdr; null until the board first reads. */
      board: Board | null
      /** The HERDR-ORCH requests seen in this session's prompts, by request id. */
      requests: Record<string, OrchRequest>
    }
  }
}
