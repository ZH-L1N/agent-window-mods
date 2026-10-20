// The ▣ SYS row above the prompt: CPU load and RAM in use, each with a 6-cell
// bar in traffic-light colours, and the battery, then a framed btop button.
// Its row sits in the zehui-mods stack
// by its order (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import { CHIP, CHIP_BG, CHIP_FG, isBandOn, readingSegs, stackKey, stackRow } from './kit'
import type { Seg } from './kit'

const reading = atom({ plugin: 'sys', key: 'reading' } as const, null)
const band = atom({ plugin: 'sys', key: 'band' } as const, '')

/** The framed button's width beside the line: `[ btop ]` and a one-column gap. */
const BUTTON_W = 'btop'.length + 4 + 1

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  options: PluginOptions,
  onBtop: () => void,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!isBandOn(await read($, band), options.band)) return pass()
  const room = (e.props.bodyColumns > 0 ? e.props.bodyColumns : 80) - BUTTON_W - [...CHIP].length
  const body = readingSegs(await read($, reading), room)
  if (body.length === 0) return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const segs: Seg[] = [{ text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true }, ...body]
  const { Box, Text, Button } = $.ui.resolve(e)
  const row = (
    <Box key={stackKey('sys')} flexDirection="row" gap={1}>
      <Box key="sys-line" flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-end">
          {segs.map((g, i) => (
            <Text
              key={`seg-${i}`}
              {...(g.color ? { color: g.color } : {})}
              {...(g.bg ? { backgroundColor: g.bg } : {})}
              {...(g.isBold ? { bold: true } : {})}
              {...(g.isDim ? { dimColor: true } : {})}
            >
              {g.text}
            </Text>
          ))}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Button key="sys-btop" label="btop" onPress={() => onBtop()} />
      </Box>
    </Box>
  )
  return stackRow(row, below)
}
