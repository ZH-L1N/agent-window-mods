// The images mod's state contract.

/** /images on|off as kept; '' while the default (on) applies. */
export type ImagesBand = '' | 'on' | 'off'

declare module 'claude-code' {
  interface PluginState {
    images: {
      /** The n of every `[Image #n]` tag in the prompt box, in order of first appearance, each once; [] when none. */
      tags: number[]
      /** /images on|off as kept in the store; '' while the default (on) applies. */
      band: ImagesBand
    }
  }
}
