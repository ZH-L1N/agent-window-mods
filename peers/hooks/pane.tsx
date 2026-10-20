// The peers board pane (/peer-alarm board): a dim head with framed `r: refresh`
// and `q: close` buttons, then one row per peer of this herdr workspace (state
// glyph and word with the time in that state, pane id, agent, title), blocked
// peers first and amber; under a spoke of this session, its HERDR-ORCH request,
// round, deadline countdown and result file. Box, Text and Button only, so
// every surface draws it the same.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import { STATE_COLOR, headText, orchText, requestsByPane, sortedRows, stateText, titleText } from './orch'

const board = atom({ plugin: 'peers', key: 'board' } as const, null)
const requests = atom({ plugin: 'peers', key: 'requests' } as const, {})

export type PaneActions = {
  /** `r`, the twin of `/peer-alarm board`: polls herdr now. */
  refresh: () => void
  /** `q`, the twin of `/peer-alarm board close`. */
  close: () => void
}

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>, act: PaneActions) {
  const b = await read($, board)
  const byPane = requestsByPane(await read($, requests))
  const { Box, Text, Button } = $.ui.resolve(e)
  // The board moves on its reads: times and countdowns are as of the last one.
  const at = b?.at ?? 0
  const rows = b ? sortedRows(b.rows) : []

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Box key="peers-head" flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {headText(b)}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Button key="peers-refresh" label="r: refresh" hotkey="r" onPress={() => act.refresh()} />
          <Button key="peers-close" label="q: close" hotkey="q" onPress={() => act.close()} />
        </Box>
      </Box>
      {b && rows.length === 0 ? <Text dimColor>{`No other agents in herdr workspace ${b.workspace}.`}</Text> : null}
      {rows.map(r => {
        const req = byPane.get(r.pane)
        const isBlocked = r.status === 'blocked'
        return (
          <Box key={`peer-${r.pane}`} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Box key={`state-${r.pane}`} flexShrink={0}>
                <Text color={STATE_COLOR[r.status]} bold={isBlocked}>
                  {stateText(r, at)}
                </Text>
              </Box>
              <Box key={`pane-${r.pane}`} flexShrink={0}>
                <Text {...(isBlocked ? { color: STATE_COLOR.blocked } : {})}>
                  {r.pane}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text dimColor={!isBlocked} {...(isBlocked ? { color: STATE_COLOR.blocked } : {})}>
                  {r.agent}
                </Text>
              </Box>
              {r.title ? (
                <Box key={`title-${r.pane}`} flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" {...(isBlocked ? { color: STATE_COLOR.blocked } : {})}>
                    {titleText(r.title)}
                  </Text>
                </Box>
              ) : null}
            </Box>
            {req ? (
              <Box key={`orch-${r.pane}`} paddingLeft={2}>
                <Text dimColor wrap="truncate-end">
                  {orchText(req, at)}
                </Text>
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}
