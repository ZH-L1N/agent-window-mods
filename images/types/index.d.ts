// The images mod's state contract.

/** /img on|off as kept in the store; '' while the `auto` option applies. */
export type ImagesBand = '' | 'on' | 'off'

/**
 * One drawn image: the `[Image #n]` tag's n, the source image's size in pixels
 * (0 by 0 when not known), and its half-block Raster: `columns` by `rows`
 * cells, `cells` the Raster's base64 u32 triplets. A text-only tile (no sips,
 * the file never came, a BMP that would not parse) has `cells` '' and 0 by 0.
 */
export type ImageTile = {
  n: number
  w: number
  h: number
  columns: number
  rows: number
  cells: string
}

declare module 'claude-code' {
  interface PluginState {
    images: {
      /** The last tiles built, at most 6, newest last; [] after /img clear. */
      tiles: ImageTile[]
      /** Whether the row shows the tiles: true once a tile is built, false after the next prompt (linger), /img off and /img clear. */
      shown: boolean
      /** /img on|off as kept in the store; '' while the `auto` option applies. */
      band: ImagesBand
    }
  }
}
