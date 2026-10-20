// The one value of another plugin this mod reads: token-weather's latest
// context reading (local change 6 of token-weather publishes it). Any plugin
// may read another's state; only its owner writes it. Declared here for the
// type checker only: plugin.json names index.d.ts as the contract, not this.
import type { HandoffContext } from './index'

declare module 'claude-code' {
  interface PluginState {
    'token-weather': {
      context: HandoffContext
    }
  }
}
