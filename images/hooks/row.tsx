// The ▣ IMAGES row above the prompt: the chip, then the last sent prompt's
// images side by side, each a half-block Raster (never `Image`: in herdr an
// `Image` draws only its alt text) with `[Image #n] WxH` beneath, dim; a tile
// without a thumbnail (no sips, the file never came) is its tag alone. The
// newest tiles that fit the width, `+n more` for the rest; captions only when
// the tallest tile would not fit the band's height beside the rows beneath.
// A framed `clear` Button (twin: /img clear). Hidden on a survey, off the
// terminal, and with nothing shown. The row sits in the zehui-mods stack as
// IMAGES 90 (stackRow), under NEXT; other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ImageTile } from '../types'
import { CHIP, CHIP_BG, CHIP_FG, ROW_KEY, captionOf, cellsOf, rowsOf, shrinkTile, stackRow, tileWidth } from './kit'

const tiles = atom({ plugin: 'images', key: 'tiles' } as const, [])
const shown = atom({ plugin: 'images', key: 'shown' } as const, false)

/** What the row's button does: the same as `/img clear`. */
export type RowActions = { clear: () => void }

/** Columns between two tiles, and between the chip and the first. */
const GAP = 1
/** `[ clear ]`, the framed Button at the row's end. */
const CLEAR_WIDTH = 9
/** `+6 more`, the dim note when not all tiles fit. */
const MORE_WIDTH = 7

/** The newest tiles that fit `room` columns, oldest first, room kept for `+n more` when not all fit; at least one. */
export function tilesThatFit(list: readonly ImageTile[], room: number): ImageTile[] {
  const fit = (width: number): ImageTile[] => {
    const out: ImageTile[] = []
    let used = 0
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!
      const w = tileWidth(t) + (out.length > 0 ? GAP : 0)
      if (out.length > 0 && used + w > width) break
      out.unshift(t)
      used += w
    }
    return out
  }
  const all = fit(room)
  return all.length === list.length ? all : fit(room - MORE_WIDTH - GAP)
}

/** A tile drawn in fewer rows than this is no picture: captions only. */
const MIN_TILE_ROWS = 3

export async function drawRow($: EngineInterface, e: RenderInput<'AbovePrompt'>, pass: () => Promise<RenderElement>, act: RowActions) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!(await read($, shown))) return pass()
  const list = await read($, tiles)
  if (list.length === 0) return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  const room = cols - cellsOf(CHIP) - GAP - CLEAR_WIDTH - GAP
  // The rows the band has left for a tile beside the rows beneath and the caption:
  // a tile taller than that is drawn smaller (its shape kept); under MIN_TILE_ROWS only the captions show.
  const free = e.props.maxRows <= 0 ? Number.POSITIVE_INFINITY : e.props.maxRows - 1 - rowsOf(below)
  const fitted = list.map(t => (t.cells && t.rows > free ? shrinkTile(t, Math.max(0, Math.floor(free))) : t))
  const drawn = tilesThatFit(fitted, room)
  const more = fitted.length - drawn.length
  const hasRoom = free >= MIN_TILE_ROWS
  const { Box, Text, Button, Raster } = $.ui.resolve(e)
  const row = (
    <Box key={ROW_KEY} flexDirection="row" gap={GAP}>
      <Box key="images-chip" flexShrink={0}>
        <Text bold color={CHIP_FG} backgroundColor={CHIP_BG}>
          {CHIP}
        </Text>
      </Box>
      {more > 0 ? (
        <Box key="images-more-box" flexShrink={0}>
          <Text key="images-more" dimColor>{`+${more} more`}</Text>
        </Box>
      ) : null}
      {drawn.map(t => (
        <Box key={`images-tile-${t.n}-box`} flexDirection="column" flexShrink={0}>
          {hasRoom && t.cells ? <Raster key={`images-tile-${t.n}`} columns={t.columns} rows={t.rows} cells={t.cells} /> : null}
          <Text key={`images-caption-${t.n}`} dimColor wrap="truncate-end">
            {captionOf(t)}
          </Text>
        </Box>
      ))}
      <Box key="images-clear-box" flexShrink={0}>
        <Button key="images-clear" label="clear" role="dismiss" dimColor onPress={() => act.clear()} />
      </Box>
    </Box>
  )
  return stackRow(row, below)
}
