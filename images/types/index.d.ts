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
  /** The small PNG (at most 512 pixels a side) the terminal reads to draw the tile as a true picture; absent when none was made. */
  file?: string
  /** A whole number that changes with `file`'s content under the same path. */
  gen?: number
  /** A tile of the box not sent yet without a picture: why (`no picture on the clipboard`, `a later paste replaced it on the clipboard`); absent otherwise. */
  note?: string
}

/** /img under on|off as kept in the store; '' while the `under` option applies. */
export type ImagesUnder = '' | 'on' | 'off'

/** /img preview on|off as kept in the store; '' while the `preview` option applies. */
export type ImagesPreview = '' | 'on' | 'off'

/** /img draw auto|picture|blocks as kept in the store; '' while the `draw` option applies. */
export type ImagesDraw = '' | 'auto' | 'picture' | 'blocks'

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
      /** The tiles of the images in the prompt box, not sent yet, at most 6, newest last; [] once the prompt is sent, the box empties, or /img clear. */
      pending: ImageTile[]
      /** /img preview on|off as kept in the store; '' while the `preview` option applies. */
      preview: ImagesPreview
      /** /img draw auto|picture|blocks as kept in the store; '' while the `draw` option applies. */
      draw: ImagesDraw
      /** Whether tiles with a small PNG are drawn as true pictures: the draw mode as resolved at session start and at /img draw. */
      pictures: boolean
    }
  }
}
