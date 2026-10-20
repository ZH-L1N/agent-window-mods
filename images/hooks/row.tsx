// The ▣ IMAGES row above the prompt: the chip, then one tile per `[Image #n]`
// tag in the prompt box (a half-block Raster, never `Image`: in herdr an
// `Image` draws only its alt text), the tag and the tile's size beneath each,
// `+n more` when not all fit, and a framed `hide` Button (twin: /images off).
// Each tile is a placeholder: the engine hands a plugin no pasted image's
// bytes before the prompt is sent (claude-code.d.ts: `$.prompt.media` answers
// only a managed settings install, only inside its `prompt.submit` hook).
// Hidden on a survey, off the terminal, when turned off, and with no tag in
// the box. The row sits in the zehui-mods stack as IMAGES 90 (stackRow), under
// NEXT; other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import { CHIP, CHIP_BG, CHIP_FG, ROW_KEY, captionOf, hasRoom, isBandOn, placeholderCells, rowsOf, sizeOf, stackRow, tileBox, tilesThatFit } from './kit'

const tags = atom({ plugin: 'images', key: 'tags' } as const, [])
const band = atom({ plugin: 'images', key: 'band' } as const, '')

/** What the row's button does: the same as `/images off`. */
export type RowActions = { hide: () => void }

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  options: PluginOptions,
  act: RowActions,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!isBandOn(await read($, band))) return pass()
  const list = await read($, tags)
  if (list.length === 0) return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)
  // The rows those bands take share the band's maxRows with this row (stackRow
  // puts them in one column): the tile leaves them room, so the whole tree
  // shows without scrolling, and with no room for the smallest tile the row
  // stands aside. Only the bands beneath are known here, not those drawn after.
  const under = rowsOf(below)
  if (below && !hasRoom(e.props.maxRows, under)) return below

  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  const box = tileBox(sizeOf(options.size), e.props.maxRows, cols, under)
  const shown = list.slice(0, tilesThatFit(list.length, box.columns, cols))
  const more = list.length - shown.length
  const cells = placeholderCells(box.columns, box.rows)
  const { Box, Text, Button, Raster } = $.ui.resolve(e)
  const row = (
    <Box key={ROW_KEY} flexDirection="row" gap={1}>
      <Box key="images-chip" flexShrink={0}>
        <Text bold color={CHIP_FG} backgroundColor={CHIP_BG}>
          {CHIP}
        </Text>
      </Box>
      {shown.map(n => (
        <Box key={`images-tile-${n}-box`} flexDirection="column" flexShrink={0}>
          <Raster key={`images-tile-${n}`} columns={box.columns} rows={box.rows} cells={cells} />
          <Text key={`images-caption-${n}`} dimColor wrap="truncate-end">
            {captionOf(n, box.columns, box.rows)}
          </Text>
        </Box>
      ))}
      {more > 0 ? (
        <Box key="images-more-box" flexShrink={0}>
          <Text key="images-more" dimColor>{`+${more} more`}</Text>
        </Box>
      ) : null}
      <Box key="images-hide-box" flexShrink={0}>
        <Button key="images-hide" label="hide" role="dismiss" dimColor onPress={() => act.hide()} />
      </Box>
    </Box>
  )
  return stackRow(row, below)
}
