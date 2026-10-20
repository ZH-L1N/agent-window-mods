// The agents pane's Peers view (`p`, `/agents-info peers`): the head and its
// framed keys, the hub's row first, then this session's HERDR-ORCH requests,
// each with its spokes beneath, then the other peers of the herdr workspace.
// A row is the state's glyph and word with the time in it, the pane id, the
// agent and the title; blocked rows come first and are amber. Box, Text and
// Button only; the plain surfaces get the same rows as text.
import { atom, read } from 'claude-code'
import type { Elements, EngineInterface, RenderInput } from 'claude-code'

import type { PeerBoard, PeerRow } from '../types'
import { closePane, setView } from './kit'
import { NEEDS_HERDR, STATE_COLOR, layoutOf, peersHead, pollPeers, requestText, stateText, titleText } from './peers'
import type { PeerLayout } from './peers'

const peerBoard = atom({ plugin: 'agents', key: 'peerBoard' } as const, null)
const peerRequests = atom({ plugin: 'agents', key: 'peerRequests' } as const, {})
const peerHub = atom({ plugin: 'agents', key: 'peerHub' } as const, '')

const AMBER = STATE_COLOR.blocked

/** One row as plain words: `▲ blocked 4m  w1:p7  codex  "title"`. */
const rowWords = (r: PeerRow, at: number): string => [stateText(r, at), r.pane, r.agent, titleText(r.title)].filter(Boolean).join('  ')

export async function drawPeers($: EngineInterface, e: RenderInput<'Pane'>) {
  const board = await read($, peerBoard)
  const layout = board?.isHerdr ? layoutOf(board, await read($, peerRequests), await read($, peerHub)) : null
  if (e.surface === 'terminal') return peersTerminal($, $.ui.resolve(e), board, layout)
  return peersPlain($.ui.resolve(e), board, layout)
}

/** The two elements every surface's table has, the plain view's whole need. */
type Shared = { Box: Elements['mobile']['Box']; Text: Elements['mobile']['Text'] }

function peersPlain(ui: Shared, board: PeerBoard | null, layout: PeerLayout | null) {
  const { Box, Text } = ui
  const at = board?.at ?? 0
  return (
    <Box flexDirection="column">
      <Text bold>{peersHead(board)}</Text>
      {board && !board.isHerdr ? <Text dimColor>{NEEDS_HERDR}</Text> : null}
      {layout?.hub ? <Text key="plain-hub">{`${layout.isSelfHub ? 'hub · this pane' : 'hub'}  ${rowWords(layout.hub, at)}`}</Text> : null}
      {layout?.groups.map(g => (
        <Box key={`plain-req-${g.request.req}`} flexDirection="column">
          <Text dimColor>{requestText(g.request, at)}</Text>
          {g.rows.map(r => (
            <Text key={`plain-${r.pane}`}>{'  ' + rowWords(r, at)}</Text>
          ))}
        </Box>
      ))}
      {layout?.others.map(r => (
        <Text key={`plain-${r.pane}`}>{rowWords(r, at)}</Text>
      ))}
    </Box>
  )
}

function peersTerminal($: EngineInterface, ui: Elements['terminal'], board: PeerBoard | null, layout: PeerLayout | null) {
  const { Box, Text, Button } = ui
  // The view moves on its reads: times and countdowns are as of the last one.
  const at = board?.at ?? 0

  // One peer's row; `lead` is the words before it (`hub`, or an indent under a request).
  const row = (r: PeerRow, lead: string, key: string) => {
    const isBlocked = r.status === 'blocked'
    const amber = isBlocked ? { color: AMBER } : {}
    return (
      <Box key={key} flexDirection="row" gap={1}>
        {lead ? (
          <Box key={`lead-${r.pane}`} flexShrink={0}>
            <Text bold={lead.trim() !== ''}>{lead}</Text>
          </Box>
        ) : null}
        <Box key={`state-${r.pane}`} flexShrink={0}>
          <Text color={STATE_COLOR[r.status]} bold={isBlocked}>
            {stateText(r, at)}
          </Text>
        </Box>
        <Box key={`pane-${r.pane}`} flexShrink={0}>
          <Text {...amber}>{r.pane}</Text>
        </Box>
        <Box key={`agent-${r.pane}`} flexShrink={0}>
          <Text dimColor={!isBlocked} {...amber}>
            {r.agent}
          </Text>
        </Box>
        {r.title ? (
          <Box key={`title-${r.pane}`} flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end" {...amber}>
              {titleText(r.title)}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  // The view's keys: framed buttons, each with its /agents-info twin.
  const keys = (
    <Box key="peers-keys" flexDirection="row" flexWrap="wrap" gap={1}>
      <Button key="view-who" label="w: who" hotkey="w" onPress={() => void setView($, 'who')} />
      <Button key="view-code" label="c: code" hotkey="c" onPress={() => void setView($, 'code')} />
      <Button key="peers-refresh" label="r: refresh" hotkey="r" onPress={() => void pollPeers($).catch(() => {})} />
      <Button key="pane-close" label="q: close" hotkey="q" onPress={() => void closePane($)} />
    </Box>
  )

  const isEmpty = layout !== null && !layout.hub && layout.groups.length === 0 && layout.others.length === 0
  return (
    <Box flexDirection="column">
      <Box key="peers-head">
        <Text bold wrap="truncate-end">
          {peersHead(board)}
        </Text>
      </Box>
      {keys}
      <Box flexDirection="column" marginTop={1}>
        {board && !board.isHerdr ? (
          <Text key="peers-needs-herdr" dimColor>
            {NEEDS_HERDR}
          </Text>
        ) : null}
        {isEmpty ? <Text dimColor>{`No other agents in herdr workspace ${board?.workspace ?? ''}.`}</Text> : null}
        {layout?.hub ? row(layout.hub, layout.isSelfHub ? 'hub · this pane' : 'hub', 'peer-hub') : null}
        {layout?.groups.map(g => (
          <Box key={`req-${g.request.req}`} flexDirection="column">
            <Box key={`req-head-${g.request.req}`}>
              <Text dimColor wrap="truncate-end">
                {requestText(g.request, at)}
              </Text>
            </Box>
            {g.rows.map(r => row(r, ' ', `peer-${r.pane}`))}
          </Box>
        ))}
        {layout && layout.others.length > 0 && (layout.hub || layout.groups.length > 0) ? (
          <Text key="peers-others" dimColor>
            other peers
          </Text>
        ) : null}
        {layout?.others.map(r => row(r, '', `peer-${r.pane}`))}
      </Box>
    </Box>
  )
}
