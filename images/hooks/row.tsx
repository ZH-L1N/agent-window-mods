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
import { CHIP, CHIP_BG, CHIP_FG, ROW_KEY, captionOf, cellsOf, rowsOf, stackRow, tileWidth } from './kit'

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
  const drawn = tilesThatFit(list, room)
  const more = list.length - drawn.length
  // The tallest tile and its caption beside the rows beneath must fit the band, or only the captions show.
  const tallest = Math.max(0, ...drawn.map(t => (t.cells ? t.rows : 0)))
  const hasRoom = e.props.maxRows <= 0 || tallest + 1 + rowsOf(below) <= e.props.maxRows
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
