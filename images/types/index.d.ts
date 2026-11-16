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

/** /img under on|off as kept in the store; '' while the `under` option applies. */
export type ImagesUnder = '' | 'on' | 'off'

/**
 * A row placed in the transcript after a sent prompt: that prompt's tags, when
 * it was placed ($.clock.now()), and `done` once its run ended or was stopped
 * (a tag with no thumbnail then no longer reads as loading).
 */
export type ImagesPlaced = { tags: number[]; at: number; done?: true }

declare module 'claude-code' {
  interface PluginState {
    images: {
      /** The last tiles built, at most 6, newest last; [] after /img clear. */
      tiles: ImageTile[]
      /** Whether the row shows the tiles: true once a tile is built, false after the next prompt (linger), /img off and /img clear. */
      shown: boolean
      /** /img on|off as kept in the store; '' while the `auto` option applies. */
      band: ImagesBand
      /** The rows placed under sent prompts, by place id (`img-<stamp>-<run>`, the stamp this load's session.start in base 36), at most 12, the newest kept. */
      placed: Record<string, ImagesPlaced>
      /** Each built tile drawn small (at most 12 by 6 cells), by its tag's n, at most 24. */
      thumbs: Record<string, ImageTile>
      /** /img under on|off as kept in the store; '' while the `under` option applies. */
      under: ImagesUnder
    }
  }
}
