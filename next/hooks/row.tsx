// The ➜ NEXT row above the prompt: the chip, then one framed Button per
// suggestion (`1: Run the tests`, pressed with the band focused) and
// `0: dismiss`; no digit hotkeys (the engine also arms a band Button's bare
// digit from an empty composer, so a prompt starting with 0 to 3 would press it); a dim `asking haiku for next steps…` while a call runs. Hidden
// while a turn runs, on a survey, off the terminal, and when there is nothing
// to show. The row sits in the zehui-mods stack by its order (stackRow, NEXT
// 80, the last: it touches the prompt box); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { CHIP, CHIP_BG, CHIP_FG, cut, stackKey, stackRow } from './kit'

const suggestions = atom({ plugin: 'next', key: 'suggestions' } as const, [])
const busy = atom({ plugin: 'next', key: 'busy' } as const, '')

/** What the row's buttons do: the same as `/next <n>` and `/next 0`. */
export type RowActions = {
  pick: (n: number) => void
  dismiss: () => void
}

/** A framed Button's chrome around its label: `[ ` and ` ]`. */
const FRAME = 4
/** `1: ` before each suggestion. */
const NUMBER_LEAD = 3

export async function drawRow($: EngineInterface, e: RenderInput<'AbovePrompt'>, pass: () => Promise<RenderElement>, act: RowActions) {
  if (e.surface !== 'terminal' || e.props.hasSurvey || e.props.isWorking) return pass()
  const list = await read($, suggestions)
  const asking = await read($, busy)
  if (list.length === 0 && !asking) return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  // A label is cut only for the row (the box takes the whole text), so one button always fits a line.
  const labelMax = Math.max(12, cols - FRAME - NUMBER_LEAD)
  const { Box, Text, Button } = $.ui.resolve(e)
  const chip = (
    <Box key="next-chip" flexShrink={0}>
      <Text bold color={CHIP_FG} backgroundColor={CHIP_BG}>
        {CHIP}
      </Text>
    </Box>
  )
  const row =
    list.length === 0 ? (
      <Box key={stackKey('next')} flexDirection="row" gap={1}>
        {chip}
        <Box key="next-line" flexShrink={1}>
          <Text wrap="truncate-end" dimColor>{`asking ${asking} for next steps…`}</Text>
        </Box>
      </Box>
    ) : (
      <Box key={stackKey('next')} flexDirection="row" flexWrap="wrap" gap={1}>
        {chip}
        {list.map((s, i) => (
          <Box key={`next-${i + 1}-box`} flexShrink={0}>
            <Button key={`next-${i + 1}`} label={`${i + 1}: ${cut(s, labelMax)}`} onPress={() => act.pick(i + 1)} />
          </Box>
        ))}
        <Box key="next-dismiss-box" flexShrink={0}>
          <Button key="next-dismiss" label="0: dismiss" role="dismiss" dimColor onPress={() => act.dismiss()} />
        </Box>
      </Box>
    )
  return stackRow(row, below)
}
