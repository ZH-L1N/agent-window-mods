export type AgentStatus = 'running' | 'finished' | 'error'

/**
 * A subagent's run, a background shell's (a Bash call moved to the background),
 * a Monitor watcher's (`watch`) or a CronCreate timer's (`cron`).
 */
export type RunKind = 'agent' | 'shell' | 'watch' | 'cron'

/** One run, a subagent's or a background shell's, as register.tsx records it. */
export type AgentRun = {
  id: string
  /** Absent on runs recorded before shells were: an agent. */
  kind?: RunKind
  agentId?: string
  /**
   * The agent type (`Explore`, `general-purpose`, a plugin's agent); for a
   * shell, `sh` or the coding agent its command runs (`codex`, `opencode`, `claude`).
   */
  type: string
  /** A shell's command as the Bash call gave it, clipped to 2,000 characters. */
  command?: string
  /** A shell's background task id, as the Bash result and its notification name it. */
  taskId?: string
  /** The coding agent a shell's command runs (`codex`); absent for a plain shell. */
  label?: string
  /** The file the shell's output is written to, from the Bash result. */
  outputFile?: string
  /** The subagent whose Bash call started the shell; absent for main. */
  parentAgentId?: string
  /** True when the shell ends with its subagent's final answer (no notification follows). */
  endsWithParent?: boolean
  /** A failed shell's exit code, when its notification says. */
  exitCode?: number
  /** How a shell that did not complete ended: `failed` or `killed`. */
  endWord?: 'failed' | 'killed'
  /** The Agent call's `name`, when it gave one. */
  name?: string
  /** The Agent call's short description of the task. */
  description: string
  /** The model id the run answers on. */
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  /** The context of the run's last request: input, cache read and write, output. */
  contextTokens: number
  contextMax: number
  /**
   * A watch's target (the pane, commit or run id its command names), or a
   * cron's job id; absent when the command names none.
   */
  target?: string
  /** When a watch times out, or a cron fires next; absent for a persistent watch or an unknown fire time. */
  nextAt?: number
  /** A cron's schedule as the engine words it (`11 18 26 9 *`). */
  schedule?: string
  /** A cron's five-field expression, for its next fire time once it fired. */
  cron?: string
  /** True for a recurring cron; a one-shot one ends when it fires. */
  isRecurring?: boolean
  /** A watch's last event line, from its event notifications. */
  lastEvent?: string
  /** When a notification for a target already done came in: the entry greys for 10 s instead of toasting again. */
  staleAt?: number
  /** Every token the run's requests counted. */
  tokens: number
  costUsd: number
  /** True once a request came from a model the price table does not know. */
  isUnpriced?: boolean
  /** Model requests seen. */
  steps: number
  /** When the request in flight started. */
  stepStartedAt?: number
  /** The summed length of the finished step cycles (request to next request). */
  stepMsTotal?: number
  /** How many step cycles that sum covers. */
  stepCycles?: number
  /** When the last request ended asking for tools; cleared when the next starts. */
  awaitingSince?: number
}

/** A file's state in the code map: read only, changed by an edit, or its last edit failed. */
export type CodeState = 'read' | 'changed' | 'failed'

/** One file as one main-loop turn touched it, for the code map (the agents pane's Code view). */
export type CodeTouch = {
  /** The path as the tool named it, a relative one resolved against the session's directory. */
  path: string
  /** The main-loop turn (the `turn` counter) it was touched in. */
  turn: number
  /** The first edit in this turn: the edit order the map lays nodes in; absent while only read. */
  editedAt?: number
  /** The last edit, successful or not: `editing` for 30 s after it. */
  lastEditAt?: number
  /** The last touch of any kind. */
  lastAt: number
  state: CodeState
  /** Lines added and removed, as `git diff --numstat` reports them (or a new file's lines). */
  plus?: number
  minus?: number
  /** The tools used on it, in first-use order (`Read`, `Edit`, `Bash`). */
  tools: string[]
  /** One line from the edit itself: the Edit's first changed line or the Write's first line. */
  summary?: string
  /** Who touched it: `main`, or a subagent's agentId. */
  by: string[]
}

/** The agents pane's view: the run cards (Who), the code map (Code) or the herdr peers (Peers). */
export type PaneView = 'who' | 'code' | 'peers'

/** A herdr agent's state as `herdr agent list` reports it (`agent_status`). */
export type PeerStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

/** One agent of this herdr workspace as the Peers view's last read saw it. */
export type PeerRow = {
  /** The herdr pane id (`w1:p6`). */
  pane: string
  /** The agent herdr names (`claude`, `codex`). */
  agent: string
  status: PeerStatus
  /** The pane's terminal title without its spinner; '' when none. */
  title: string
  /**
   * When a read first saw the pane in this state (`$.clock.now()` ms), carried
   * from the read before when that one is recent; the read's own time otherwise.
   */
  since: number
}

/** The Peers view's last read of herdr. */
export type PeerBoard = {
  /** When herdr was read, `$.clock.now()` milliseconds. */
  at: number
  /** The herdr workspace read; '' outside herdr. */
  workspace: string
  /** False outside a herdr pane: the view says it needs one, and nothing is read. */
  isHerdr: boolean
  /** This pane's own row (the hub row when this session sent requests); null when herdr does not list it. */
  self: PeerRow | null
  /** The other agents of the workspace, in herdr's order. */
  rows: PeerRow[]
  /** Why the read failed, set only while no read has succeeded yet (the rows are then empty). */
  error?: string
}

/**
 * A HERDR-ORCH request this session sent or took part in, from the envelope
 * headers (`[HERDR-ORCH v0] req=<id> from=<agent>@<pane> type=<type>`) in its prompts.
 */
export type PeerRequest = {
  /** The request id (`req=`), also the folder under `~/.local/state/herdr-orch/`. */
  req: string
  /** The spoke panes the envelopes named, in the order first named. */
  panes: string[]
  /** The type of the last envelope seen. */
  type: string
  /** The round, from `round 4/5`, `round 4 of 5`, `round 4` or a `-r4` req suffix; null when none. */
  round: number | null
  /** The round ceiling, from `round 4/5`, `ceiling 5`, `max rounds 5`; null when none. */
  ceiling: number | null
  /** When the first envelope of the request was submitted here, `$.clock.now()` milliseconds. */
  sentAt: number
  /** When the deadline passes; null when unknown. */
  deadlineAt: number | null
  /** The result file as last read: null when missing or not read, '' without a valid status, else its status. */
  result: string | null
}

/** The code map's scope: this main-loop turn, or the whole session with turn tags. */
export type CodeScope = 'turn' | 'session'

/** The main loop: its model and whether a turn of it runs. */
export type MainLoop = {
  model: string
  isRunning: boolean
  startedAt: number
  /**
   * The session's id (`$.session.id()`), else the first main-loop turn's id:
   * the hub card's pose is picked by it, so it keeps one pose for the session.
   */
  id?: string
}

declare module 'claude-code' {
  interface PluginState {
    agents: {
      runs: AgentRun[]
      /** Skills fired since the band last hid: name to count. */
      skills: Record<string, number>
      main: MainLoop
      /** The tick's last time. */
      now: number
      /** When the person last dismissed the band. */
      dismissedAt: number
      /** The pane's one-line-per-agent view. */
      isCompact: boolean
      /** Claude Code's prefersReducedMotion setting, as last read. */
      isStill: boolean
      /** Each shell's last output line, by run id, read while the pane is open. */
      tails: Record<string, string>
      /** True while the caffeinate hold runs (the band's ☕). */
      isCaffeinated: boolean
      /** The pane's view: `who` (the cards) or `code` (the code map). */
      view: PaneView
      /** The files touched, one record per file and main-loop turn. */
      code: CodeTouch[]
      /** The main-loop turn counter: one more at each main turn start. */
      turn: number
      /** The code map's scope. */
      codeScope: CodeScope
      /** True after `d` in the Code view: the next digit runs /diff on that node's file. */
      isDiffArmed: boolean
      /** The Peers view's last read of herdr; null until the view first reads. */
      peerBoard: PeerBoard | null
      /** The HERDR-ORCH requests seen in this session's prompts, by request id (the newest 40). */
      peerRequests: Record<string, PeerRequest>
      /** The pane whose brief made this session a spoke (its hub); '' when none. */
      peerHub: string
    }
  }
}
