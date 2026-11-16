// The thumbnail row under a sent prompt: register.tsx places a transcript row
// (`$.ui.place({ id: 'img-<stamp>-<run>' })`) when it starts a person's prompt's
// images, and records the id with its tags in $.state `images.placed`. This
// hook draws that row when the engine asks for it as `Placed`: for each tag a
// column with a small half-block Raster (`images.thumbs`, at most 12 by 6
// cells) once the tile is built, and a dim caption `[Image #n] WxH`, or
// `[Image #n] …` before; once the row's run is done (`done` in its entry), a
// tag with no thumbnail reads `[Image #n]`. Every plugin's hook hears every placed row, so the
// row's plugin and its id are both checked; anything else, and any surface
// but the terminal, is passed on.
import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { PLUGIN_NAME, bareName, underCaptionOf } from './kit'

const placed = atom({ plugin: 'images', key: 'placed' } as const, {})
const thumbs = atom({ plugin: 'images', key: 'thumbs' } as const, {})

export function onPlaced(on: On): void {
  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || bareName(e.props.plugin) !== PLUGIN_NAME) return next(e)
    const row = (await read($, placed))[e.props.id]
    if (!row || row.tags.length === 0) return next(e)
    const built = await read($, thumbs)
    const { Box, Text, Raster } = $.ui.resolve(e)
    return (
      <Box key="img-under" flexDirection="row" flexWrap="wrap" columnGap={1}>
        {row.tags.map(n => {
          const thumb = built[String(n)]
          return (
            <Box key={`img-under-${n}-box`} flexDirection="column" flexShrink={0}>
              {thumb && thumb.cells ? <Raster key={`img-under-${n}`} columns={thumb.columns} rows={thumb.rows} cells={thumb.cells} /> : null}
              <Text key={`img-under-caption-${n}`} dimColor wrap="truncate-end">
                {underCaptionOf(n, thumb, row.done === true)}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
