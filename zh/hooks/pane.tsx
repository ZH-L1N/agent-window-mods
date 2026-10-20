// The zh pane: a dim header (which reply, the model, the seconds, the tokens
// and the estimated cost), framed prev, next and close buttons with hotkeys,
// a dim English line while a call runs, then the translation as Markdown. Box, Text,
// Button and Markdown only, so every surface draws it the same.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { ZhItem } from '../types'
import { busyLine, fmtSeconds, fmtTokens, fmtUsd, replyLabel, shownText } from './kit'

const items = atom({ plugin: 'zh', key: 'items' } as const, [])
const shown = atom({ plugin: 'zh', key: 'shown' } as const, 0)
const busy = atom({ plugin: 'zh', key: 'busy' } as const, null)

/** `<which reply> · haiku · 1.2 s · 1.4k→1.9k tok · ≈$0.001`, and `· 2 parts` for a split source. */
export const headerOf = (it: ZhItem): string =>
  [
    replyLabel(it.back),
    it.model,
    fmtSeconds(it.ms),
    `${fmtTokens(it.inputTokens)}→${fmtTokens(it.outputTokens)} tok`,
    ...(it.costUsd !== null ? [`≈${fmtUsd(it.costUsd)}`] : []),
    ...(it.parts > 1 ? [`${it.parts} parts`] : []),
  ].join(' · ')

export type PaneActions = {
  prev: () => void
  next: () => void
  close: () => void
}

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>, act: PaneActions) {
  const list = await read($, items)
  const at = await read($, shown)
  const running = await read($, busy)
  const it = list[at] ?? list[0] ?? null
  const { Box, Text, Button, Markdown } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Box key="zh-head" flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {it ? headerOf(it) : 'No translation yet.'}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Button key="zh-prev" label="p: prev" hotkey="p" onPress={() => act.prev()} />
          <Button key="zh-next" label="n: next" hotkey="n" onPress={() => act.next()} />
          <Button key="zh-close" label="q: close" hotkey="q" onPress={() => act.close()} />
        </Box>
      </Box>
      {running !== null ? (
        <Text dimColor>
          {busyLine(running)}
        </Text>
      ) : null}
      {it ? <Markdown key="zh-text" text={shownText(it.text)} /> : null}
    </Box>
  )
}
