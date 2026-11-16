// The send-gate mod's state contract. Nothing here is read from another mod.

/** What a held call would do: post a message, send an email, notify people, or a call the config names. */
export type SendKind = 'message' | 'email' | 'notify' | 'site'

/** The session's permission mode as last seen; `unknown` until a setting or an event names it. */
export type Mode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto' | 'unknown'

/** One sending call the gate saw. */
export type SendSeen = {
  /** When, in epoch milliseconds. */
  at: number
  /** The full tool name. */
  tool: string
  kind: SendKind
  /** `sent`: approved and passed on; `denied`: refused; `not-gated`: passed because the mode is not gated. */
  verdict: 'sent' | 'denied' | 'not-gated'
  /** Why it was refused or passed, in words. */
  why: string
  /** The preview's target, cleaned and cut. */
  target: string
}

/** The config file as it was last read. */
export type SendConfig = {
  status: 'none' | 'ok' | 'broken'
  /** The file's absolute path; '' when it could not be worked out. */
  path: string
  /** How many `gate` globs it lists. */
  gate: number
  /** Why the read is broken; for a read that is ok, its warnings; else ''. */
  error: string
}

declare module 'claude-code' {
  interface PluginState {
    'send-gate': {
      mode: Mode
      /** Where `mode` came from: a session event, the launcher's SEND_GATE_MODE, the settings' defaultMode, or nowhere yet. */
      modeFrom: 'event' | 'env' | 'settings' | 'none'
      /** The newest 30, newest first. */
      recent: SendSeen[]
      config: SendConfig
    }
  }
}
