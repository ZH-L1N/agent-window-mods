// The agents pane (/agents-info): stat tiles, ruled section heads and one card
// per run, a half-block Raster mascot at the left of each (a grey one for a
// background shell) and a numbered button (1 to 9, a stub until the messages
// view of E3). Adapted from Zehui's terminal skin for savvy-progress
// (terminal-skin.tsx, 2026-10-19), with text ▰▱ bars in place of Raster bars.
// Other surfaces get plain text.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, RenderInput } from 'claude-code'

import type { AgentRun, MainLoop } from '../types'
import { drawCode } from './code'
import { showPeers } from './peers'
import { drawPeers } from './peerview'
import {
  FLASH_MS,
  cardNumbers,
  closePane,
  isStale,
  isWatching,
  setView,
  watchTime,
  MESSAGES_STUB,
  PULSE_MS,
  SPINNER,
  colorOf,
  costText,
  ctxPct,
  elapsed,
  fmtCost,
  fmtTime,
  fmtTokens,
  isShell,
  isSlowStep,
  isWaiting,
  modelName,
  poseOf,
  readRuns,
  readTails,
  shellWords,
  tierOf,
  pruneEnded,
  mainPoseId,
} from './kit'
import { boxOf, hubPose, mascotCells, mascotWidth } from './mascots'
import type { Pose } from './mascots'

const main = atom({ plugin: 'agents', key: 'main' } as const, { model: '', isRunning: false, startedAt: 0 })
const isCompact = atom({ plugin: 'agents', key: 'isCompact' } as const, false)
const isStill = atom({ plugin: 'agents', key: 'isStill' } as const, false)
const runs = atom({ plugin: 'agents', key: 'runs' } as const, [])
const view = atom({ plugin: 'agents', key: 'view' } as const, 'who')

export const CARD_BAR = 10
const AMBER = '#f59e0b'
const GREEN = '#22c55e'
const FLASH = '#86efac'
const RED = '#ef4444'
const AMBER_RGB = 0xf59e0b
const RED_RGB = 0xef4444
/** A shell card's spinner and words: grey, never a tier's colour. */
const SHELL_GREY = '#9a9a96'
/** Cards numbered 1 to this; the rest get a blank of the button's width. */
export const MAX_NUMBERED = 9
/** A framed button's width, `[ 1 ]`. */
const NUM_W = 5
/** Narrower than this, the cards draw without mascots. */
export const MASCOT_MIN_COLS = 56

/** `filled` of `width` cells: at least one while the run is live. */
export const barFill = (a: AgentRun): number =>
  a.status === 'finished' ? CARD_BAR : Math.max(1, Math.min(CARD_BAR, Math.round(ctxPct(a) / 10)))

/** The bar's colour: tier while running (amber on a slow step), green, a bright flash on finish, red on error. */
export const barColor = (a: AgentRun, at: number, still: boolean): string => {
  if (a.status === 'error') return RED
  if (a.status === 'finished') return !still && a.endedAt !== undefined && at - a.endedAt < FLASH_MS ? FLASH : GREEN
  return isSlowStep(a, at) ? AMBER : colorOf(tierOf(a))
}

/** The status glyph: the spinner in the tier colour while running, ✓ green, ✗ red. */
const glyphOf = (a: AgentRun, at: number, still: boolean): [glyph: string, color: string] =>
  a.status === 'finished'
    ? ['✓', GREEN]
    : a.status === 'error'
      ? ['✗', RED]
      : [still ? '●' : (SPINNER[Math.floor(at / 100) % SPINNER.length] ?? '●'), colorOf(tierOf(a))]

const statusWord = (a: AgentRun, at: number): string =>
  a.status === 'finished'
    ? 'finished'
    : a.status === 'error'
      ? isShell(a)
        ? (a.endWord ?? 'failed')
        : 'error'
      : isWaiting(a, at)
        ? 'waiting'
        : 'running'

/** A card's bold title: the task; a shell's `sh · <command>` (`codex · <prompt>`). */
const titleOf = (a: AgentRun): string => (isShell(a) ? `${a.label ?? 'sh'} · ${a.description}` : a.description || a.name || a.type)

/** A card's dim detail: context, tokens, cost and time; a shell's `background shell · <elapsed>`. */
const detailOf = (a: AgentRun, at: number): string =>
  isShell(a)
    ? `${a.label ? shellWords(a) + ' · ' : ''}background shell · ${fmtTime(elapsed(a, at))}${a.exitCode !== undefined && a.exitCode !== 0 ? ` · exit ${a.exitCode}` : ''}`
    : `ctx ${ctxPct(a)}% · ${fmtTokens(a.tokens)} · ${costText(a)} · ${fmtTime(elapsed(a, at))}`

type Totals = { cost: string; tokens: string; time: string }

const totalsOf = (all: readonly AgentRun[], at: number): Totals => {
  // Watches and crons cost nothing and can wait for hours: the tiles count the cards only.
  const list = all.filter(a => !isWatching(a))
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const isUnpriced = list.some(a => a.isUnpriced)
  const from = Math.min(...list.map(a => a.startedAt))
  const to = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return {
    cost: '≈' + fmtCost(cost) + (isUnpriced ? '+?' : ''),
    tokens: fmtTokens(list.reduce((s, a) => s + a.tokens, 0)),
    time: list.length ? fmtTime(to - from) : '0:00',
  }
}

type PaneData = {
  list: readonly AgentRun[]
  at: number
  main: MainLoop
  isCompact: boolean
  still: boolean
  cols: number
  /** Each shell's last output line, by run id. */
  tails: Readonly<Record<string, string>>
}

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>, options: PluginOptions = {}) {
  const { list, at } = await readRuns($)
  // The Code view (`c`, `/agents-info code`) draws the code map instead of the cards.
  if ((await read($, view)) === 'code') return drawCode($, e, { list, at, cols: e.props.bodyColumns > 0 ? e.props.bodyColumns : 40, options })
  // The Peers view (`p`, `/agents-info peers`) draws this herdr workspace's agents instead.
  if ((await read($, view)) === 'peers') return drawPeers($, e)
  const d: PaneData = {
    list,
    at,
    main: await read($, main),
    isCompact: await read($, isCompact),
    still: await read($, isStill),
    cols: e.props.bodyColumns > 0 ? e.props.bodyColumns : 40,
    tails: await readTails($),
  }
  if (e.surface === 'terminal') return paneTerminal($, $.ui.resolve(e), d)
  return panePlain($.ui.resolve(e), d)
}

/** The two elements every surface's table has, the plain pane's whole need. */
type Shared = { Box: Elements['mobile']['Box']; Text: Elements['mobile']['Text'] }

/** A watch's or cron's line: `watch deploy a15f4e9 · ⏳ 12m`, `cron 20:30 in 41m · "<prompt>"`. */
const watchWords = (a: AgentRun, at: number): string =>
  a.kind === 'cron'
    ? `cron ${a.status === 'running' ? watchTime(a, at) : (a.schedule ?? '')}${a.description ? ` · "${a.description}"` : ''}`
    : `watch ${a.description || 'monitor'}${a.target ? ' ' + a.target : ''}${a.status === 'running' ? ' · ' + watchTime(a, at) : ''}`

// --- plain text, for the desktop and the other remote surfaces

function panePlain(ui: Shared, d: PaneData) {
  const { Box, Text } = ui
  const t = totalsOf(d.list, d.at)
  return (
    <Box flexDirection="column">
      <Text bold>Agents</Text>
      <Text dimColor>{`Cost ${t.cost} · Tokens ${t.tokens} · Time ${t.time}`}</Text>
      {d.list.length === 0 && <Text dimColor>No subagents yet.</Text>}
      {d.list.map(a => (
        <Text key={`row-${a.id}`}>
          {isWatching(a)
            ? `${a.status === 'finished' ? '✓' : a.status === 'error' ? '✗' : '◷'} ${watchWords(a, d.at)}`
            : `${a.status === 'finished' ? '✓' : a.status === 'error' ? '✗' : '●'} ${titleOf(a)} · ${isShell(a) ? '' : modelName(a.model) + ' · '}${detailOf(a, d.at)}`}
        </Text>
      ))}
    </Box>
  )
}

// --- the terminal

function paneTerminal($: EngineInterface, ui: Elements['terminal'], d: PaneData) {
  const { Box, Text, Button, Raster } = ui
  const { list, at, still } = d
  const cols = d.cols
  const cards = list.filter(a => !isWatching(a))
  const watching = list.filter(isWatching)
  const running = cards.filter(a => a.status === 'running')
  const finished = cards.filter(a => a.status === 'finished')
  const failed = cards.filter(a => a.status === 'error')
  const isHub = running.length >= 2
  const isMascots = !d.isCompact && cols >= MASCOT_MIN_COLS
  const mascotCol = mascotWidth()
  const t = totalsOf(list, at)
  // Every card's number, in pane order: Running, Finished, Error.
  const numberOf = cardNumbers(list)

  // The card's numbered button: a stub until the messages view (E3) lands. Hotkeys work while the pane has focus.
  const numButton = (a: AgentRun) => {
    const n = numberOf.get(a.id) ?? 0
    if (n < 1 || n > MAX_NUMBERED) return <Box key={`num-${a.id}`} flexShrink={0} width={NUM_W} />
    return (
      <Box key={`num-box-${a.id}`} flexShrink={0}>
        <Button key={`num-${a.id}`} label={String(n)} hotkey={String(n)} onPress={() => $.ui.toast(MESSAGES_STUB)} />
      </Box>
    )
  }

  const toggle = (
    <Button key="compact" label={d.isCompact ? 'Expand' : 'Collapse'} onPress={() => void update($, isCompact, v => !v)} />
  )
  // `x: clear done` drops every ended run; the twin of `/agents-info clear`. Drawn only when there is something to clear.
  const ended = list.filter(a => a.status !== 'running').length
  const clear =
    ended > 0 ? (
      <Box key="clear-box" flexShrink={0}>
        <Button key="clear" label="x: clear done" hotkey="x" onPress={() => void update($, runs, l => pruneEnded(l, 0))} />
      </Box>
    ) : null
  // The view keys: `c` the code map (`/agents-info code`), `p` the herdr peers (`/agents-info peers`), `q` close (`/agents-info close`).
  const viewKeys = [
    <Box key="view-code-box" flexShrink={0}>
      <Button key="view-code" label="c: code" hotkey="c" onPress={() => void setView($, 'code')} />
    </Box>,
    <Box key="view-peers-box" flexShrink={0}>
      <Button key="view-peers" label="p: peers" hotkey="p" onPress={() => void showPeers($).catch(() => {})} />
    </Box>,
    <Box key="pane-close-box" flexShrink={0}>
      <Button key="pane-close" label="q: close" hotkey="q" onPress={() => void closePane($)} />
    </Box>,
  ]

  // Three round tiles, a one-column gap between; one line when the longest label or value does not fit.
  const tiles: [label: string, value: string][] = [
    ['Cost', t.cost],
    ['Tokens', t.tokens],
    ['Time', t.time],
  ]
  const tileW = Math.floor((Math.max(24, cols) - 2) / 3)
  const longest = Math.max(...tiles.flat().map(s => s.length))
  const stats =
    tileW - 4 < longest || d.isCompact ? (
      <Text key="stats" wrap="truncate-end">
        {tiles.map(([k, v], i) => (
          <Text key={`stat-${i}`}>
            {i ? <Text dimColor>{' · '}</Text> : null}
            <Text dimColor>{k + ' '}</Text>
            <Text bold>{v}</Text>
          </Text>
        ))}
      </Text>
    ) : (
      <Box key="stats" flexDirection="row" gap={1}>
        {tiles.map(([k, v], i) => (
          <Box key={`tile-${i}`} width={tileW} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor wrap="truncate-end">
              {k}
            </Text>
            <Text bold wrap="truncate-end">
              {v}
            </Text>
          </Box>
        ))}
      </Box>
    )

  // A section head with a thin rule to the body's right edge.
  const head = (key: string, text: string) => (
    <Text key={key} dimColor wrap="truncate-end">
      {`${text} ${'─'.repeat(Math.max(0, cols - text.length - 1))}`}
    </Text>
  )

  const mascot = (key: string, pose: Pose, isBobbed: boolean, tint?: number) => {
    const box = boxOf(pose)
    return (
      <Box flexShrink={0} width={mascotCol}>
        <Raster key={`mascot-${key}`} columns={box.columns} rows={box.rows} cells={mascotCells(pose, { isBobbed, tint })} />
      </Box>
    )
  }
  const isOddSecond = Math.floor(at / 1000) % 2 === 1

  const bar = (a: AgentRun) => {
    const n = barFill(a)
    return (
      <Box key={`bar-${a.id}`} flexShrink={0} paddingLeft={2}>
        <Text>
          <Text color={barColor(a, at, still)}>{'▰'.repeat(n)}</Text>
          <Text dimColor>{'▱'.repeat(CARD_BAR - n)}</Text>
        </Text>
      </Box>
    )
  }

  // A background shell's card: its grey mascot, ✓ ✗ or a grey spinner, `sh · <command>`,
  // `background shell · <elapsed>` and the last line of its output.
  const shellCard = (a: AgentRun) => {
    const [glyph, glyphColor] = a.status === 'running' ? [still ? '●' : (SPINNER[Math.floor(at / 100) % SPINNER.length] ?? '●'), SHELL_GREY] : glyphOf(a, at, still)
    const word = statusWord(a, at)
    const wordColor = a.status === 'finished' ? GREEN : a.status === 'error' ? RED : SHELL_GREY
    const tail = d.tails[a.id]
    if (d.isCompact) {
      return (
        <Box key={a.id} flexDirection="row" gap={1}>
          {numButton(a)}
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text color={glyphColor}>{glyph + ' '}</Text>
              <Text bold>{titleOf(a)}</Text>
              <Text dimColor>{` · ${detailOf(a, at)}`}</Text>
            </Text>
          </Box>
        </Box>
      )
    }
    const rows = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexDirection="row" gap={1}>
          {numButton(a)}
          <Box flexShrink={0}>
            <Text color={glyphColor}>{glyph}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              {titleOf(a)}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={wordColor}>{word}</Text>
          </Box>
        </Box>
        <Box key={`detail-${a.id}`}>
          <Text dimColor wrap="truncate-end">
            {'  ' + detailOf(a, at)}
          </Text>
        </Box>
        <Box key={`tail-${a.id}`}>
          <Text dimColor wrap="truncate-end">
            {'  ' + (tail ?? '…')}
          </Text>
        </Box>
      </Box>
    )
    return (
      <Box key={a.id} flexDirection="row" gap={1} marginBottom={1}>
        {isMascots &&
          mascot(a.id, poseOf(a, at), a.status === 'running' && !still && isOddSecond, a.status === 'error' ? RED_RGB : undefined)}
        {rows}
      </Box>
    )
  }

  const card = (a: AgentRun) => {
    if (isShell(a)) return shellCard(a)
    const tier = tierOf(a)
    const [glyph, glyphColor] = glyphOf(a, at, still)
    const word = statusWord(a, at)
    const wordColor = a.status === 'finished' ? GREEN : a.status === 'error' ? RED : word === 'waiting' ? AMBER : colorOf(tier)
    const meta = [a.type, modelName(a.model), ...(a.effort ? [a.effort] : [])]
    if (d.isCompact) {
      return (
        <Box key={a.id} flexDirection="row" gap={1}>
          {numButton(a)}
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text color={glyphColor}>{glyph + ' '}</Text>
              <Text bold>{titleOf(a)}</Text>
              <Text dimColor>{` · ${modelName(a.model)} · ${detailOf(a, at)}`}</Text>
            </Text>
          </Box>
        </Box>
      )
    }
    const isPulse = a.status === 'error' && !still && a.endedAt !== undefined && at - a.endedAt < PULSE_MS && Math.floor(at / 250) % 2 === 0
    const rows = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexDirection="row" gap={1}>
          {numButton(a)}
          <Box flexShrink={0}>
            <Text color={glyphColor}>{glyph}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              {titleOf(a)}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={wordColor}>{word}</Text>
          </Box>
        </Box>
        <Text wrap="truncate-end">
          {'  '}
          <Text color={colorOf(tier)}>{tier}</Text>
          <Text dimColor>{' · ' + meta.join(' · ')}</Text>
        </Text>
        <Box flexDirection="row">
          {bar(a)}
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {' ' + detailOf(a, at)}
            </Text>
          </Box>
        </Box>
      </Box>
    )
    return (
      <Box key={a.id} flexDirection="row" gap={1} marginBottom={1}>
        {isMascots && mascot(a.id, poseOf(a, at), a.status === 'running' && !still && isOddSecond && !isWaiting(a, at), isPulse ? AMBER_RGB : undefined)}
        {rows}
      </Box>
    )
  }

  // A watch's or cron's row under Watching, no mascot: its glyph, words and time; a watch's last event beneath.
  const watchRow = (a: AgentRun) => {
    const [glyph, glyphColor] = a.status === 'running' ? ['◷', AMBER] : glyphOf(a, at, still)
    const isGrey = isStale(a, at)
    return (
      <Box key={a.id} flexDirection="column">
        <Text wrap="truncate-end" {...(isGrey ? { dimColor: true } : {})}>
          <Text {...(isGrey ? {} : { color: glyphColor })}>{glyph + ' '}</Text>
          <Text bold={!isGrey}>{watchWords(a, at)}</Text>
        </Text>
        {a.lastEvent ? (
          <Text dimColor wrap="truncate-end">
            {'  ' + a.lastEvent}
          </Text>
        ) : null}
      </Box>
    )
  }

  // The main loop's card, at the top of Running while two or more subagents run.
  // `N subagents running`, or `N tasks running` once shells are among them.
  const runningText = `${running.length} ${running.some(isShell) ? 'tasks' : 'subagents'} running`
  const hubCard = () => {
    const m = d.main
    const tier = tierOf({ type: 'main', model: m.model, effort: undefined })
    const glyph = m.isRunning ? (still ? '●' : (SPINNER[Math.floor(at / 100) % SPINNER.length] ?? '●')) : '·'
    const rows = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexDirection="row" gap={1}>
          <Box flexShrink={0}>
            <Text color={colorOf(tier)}>{glyph}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              main loop
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={colorOf(tier)}>{m.isRunning ? 'running' : 'idle'}</Text>
          </Box>
        </Box>
        <Text wrap="truncate-end">
          {'  '}
          <Text color={colorOf(tier)}>{tier}</Text>
          <Text dimColor>{` · main · ${modelName(m.model || 'unknown')}`}</Text>
        </Text>
        <Text dimColor wrap="truncate-end">
          {`  ${runningText}${m.isRunning && m.startedAt ? ` · turn ${fmtTime(at - m.startedAt)}` : ''}`}
        </Text>
      </Box>
    )
    if (d.isCompact) {
      return (
        <Text key="main-loop" wrap="truncate-end">
          <Text color={colorOf(tier)}>{glyph + ' '}</Text>
          <Text bold>main loop</Text>
          <Text dimColor>{` · ${modelName(m.model || 'unknown')} · ${runningText}`}</Text>
        </Text>
      )
    }
    return (
      <Box key="main-loop" flexDirection="row" gap={1} marginBottom={1}>
        {isMascots && mascot('main', hubPose(mainPoseId(m)), m.isRunning && !still && isOddSecond)}
        {rows}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexShrink={1}>
          <Text bold wrap="truncate-end">
            Agents
          </Text>
        </Box>
        <Box flexShrink={1} flexDirection="row" flexWrap="wrap" justifyContent="flex-end" gap={1}>
          {clear}
          {toggle}
          {viewKeys}
        </Box>
      </Box>
      {stats}
      <Box flexDirection="column" marginTop={1}>
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {running.length > 0 && head('h-run', `Running · ${running.length}`)}
        {isHub && hubCard()}
        {running.map(card)}
        {finished.length > 0 && head('h-done', `Finished · ${finished.length}`)}
        {finished.map(card)}
        {failed.length > 0 && head('h-error', `Error · ${failed.length}`)}
        {failed.map(card)}
        {watching.length > 0 && head('h-watch', `Watching · ${watching.filter(a => a.status === 'running').length}`)}
        {watching.map(watchRow)}
      </Box>
    </Box>
  )
}
