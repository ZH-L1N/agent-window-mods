export type Suggestion = {
  // Local change 3 (zehui-mods): 'manual' is an offer the person asked for with /compact-offer.
  source: 'claude' | 'boundary' | 'cache' | 'manual'
  reason: string
  instructions?: string
  percent: number
  // True once the dialog above the prompt holds it; the band stands in otherwise.
  inDialog?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'smart-compact': { suggestion: Suggestion | null }
  }
}
