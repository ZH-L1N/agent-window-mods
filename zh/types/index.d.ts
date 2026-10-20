// The zh mod's state contract.

/** The translation model, as the `model` option names it. */
export type ZhModel = 'haiku' | 'sonnet'

/** One kept translation of an assistant reply. */
export type ZhItem = {
  /** The source's hash and the model: a second /zh of the same reply with the same model reuses it. */
  id: string
  /** The source reply's hash (FNV-1a of its text), to find the reply again as the conversation grows. */
  sourceHash: string
  /** Which reply back it was when last placed: 1 is the last assistant reply with text. */
  back: number
  /** How many assistant replies with text there were when `back` was taken: shifts `back` as the conversation grows. */
  total: number
  model: ZhModel
  /** The translation, as the model wrote it (the halves joined when the source was split). */
  text: string
  /** How long the call(s) took, in milliseconds. */
  ms: number
  /** Tokens the call(s) read and wrote, summed. */
  inputTokens: number
  outputTokens: number
  /** Estimated USD at list prices; null when the model has no price here. */
  costUsd: number | null
  /** 1, or 2 when the source was split at a paragraph boundary into two calls. */
  parts: number
  /** When it was made, `$.clock.now()` milliseconds. */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    zh: {
      /** The last three translations, newest first. */
      items: ZhItem[]
      /** The index into `items` the pane shows. */
      shown: number
      /** The reply being translated now (its `back`); null when no call runs. */
      busy: number | null
    }
  }
}
