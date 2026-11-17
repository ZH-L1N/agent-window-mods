// The ▣ IMAGES row above the prompt: the chip, then the images side by side,
// each with its caption beneath, dim. While the prompt box holds pasted images
// not sent yet (0.4.0), the row shows those (`[Image #n] WxH · not sent yet`,
// or the tag and why there is no picture) and not the last sent prompt's;
// otherwise the last sent prompt's images (`[Image #n] WxH`). A tile with a
// small PNG is drawn as a true picture (`Image`, the terminal reads the file)
// when pictures are on (option `draw`, /img draw); every other tile as a
// half-block Raster, and a tile without a thumbnail (no sips, the file never
// came) as its tag alone. The newest tiles that fit the width, `+n more` for
// the rest; captions only when the tallest tile would not fit the band's
// height beside the rows beneath. A framed `clear` Button (twin: /img clear).
// Hidden on a survey, off the terminal, and with nothing shown. The row sits
// in the zehui-mods stack as IMAGES 90 (stackRow), under NEXT; other mods'
// bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { ImageTile } from '../types'
import {
  CHIP,
  CHIP_BG,
  CHIP_FG,
  MAX_ROWS,
  ROW_KEY,
  captionOf,
  cellsOf,
  isPictureTile,
  pendingCaptionOf,
  pictureBox,
  rowsOf,
  shrinkTile,
  stackRow,
  tagText,
  tileWidth,
} from './kit'

const tiles = atom({ plugin: 'images', key: 'tiles' } as const, [])
const shown = atom({ plugin: 'images', key: 'shown' } as const, false)
const pending = atom({ plugin: 'images', key: 'pending' } as const, [])
const pictures = atom({ plugin: 'images', key: 'pictures' } as const, false)

/** What the row's button does: the same as `/img clear`. */
export type RowActions = { clear: () => void }

/** How the row draws: a true picture's width in columns (the `size` option). */
export type RowLook = { size: number }

/** Columns between two tiles, and between the chip and the first. */
const GAP = 1
/** `[ clear ]`, the framed Button at the row's end. */
const CLEAR_WIDTH = 9
/** `+6 more`, the dim note when not all tiles fit. */
const MORE_WIDTH = 7

/** The newest tiles that fit `room` columns, oldest first, room kept for `+n more` when not all fit; at least one. */
export function tilesThatFit(list: readonly ImageTile[], room: number, caption: (t: ImageTile) => string = captionOf): ImageTile[] {
  const fit = (width: number): ImageTile[] => {
    const out: ImageTile[] = []
    let used = 0
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!
      const w = tileWidth(t, caption) + (out.length > 0 ? GAP : 0)
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

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  act: RowActions,
  look: RowLook = { size: 24 },
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  // The box's images not sent yet come first; the last sent prompt's are not mixed in.
  const waiting = await read($, pending)
  const isPending = waiting.length > 0
  if (!isPending && !(await read($, shown))) return pass()
  const list = isPending ? waiting : await read($, tiles)
  if (list.length === 0) return pass()
  const caption = isPending ? pendingCaptionOf : captionOf
  const isPictures = (await read($, pictures)) === true

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  const room = cols - cellsOf(CHIP) - GAP - CLEAR_WIDTH - GAP
  // The rows the band has left for a tile beside the rows beneath and the caption:
  // a tile taller than that is drawn smaller (its shape kept); under MIN_TILE_ROWS only the captions show.
  const free = e.props.maxRows <= 0 ? Number.POSITIVE_INFINITY : e.props.maxRows - 1 - rowsOf(below)
  // A true picture: `size` columns wide, its rows from its shape, at most MAX_ROWS and the rows free.
  const pictureRows = Number.isFinite(free) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(free))) : MAX_ROWS
  const fitted = list.map(t => {
    // The box goes in the Raster fields, so the width count below holds for both.
    if (isPictureTile(t, isPictures)) return { ...t, ...pictureBox(t, look.size, pictureRows) }
    return t.cells && t.rows > free ? shrinkTile(t, Math.max(0, Math.floor(free))) : t
  })
  const drawn = tilesThatFit(fitted, room, caption)
  const more = fitted.length - drawn.length
  const hasRoom = free >= MIN_TILE_ROWS
  const { Box, Text, Button, Raster, Image } = $.ui.resolve(e)
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
          {hasRoom && isPictureTile(t, isPictures) ? (
            <Image
              key={`images-picture-${t.n}`}
              source={{ file: t.file ?? '', format: 'png', generation: t.gen ?? 0 }}
              columns={t.columns}
              rows={t.rows}
              alt={tagText(t.n)}
            />
          ) : hasRoom && t.cells ? (
            <Raster key={`images-tile-${t.n}`} columns={t.columns} rows={t.rows} cells={t.cells} />
          ) : null}
          <Text key={`images-caption-${t.n}`} dimColor wrap="truncate-end">
            {caption(t)}
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
