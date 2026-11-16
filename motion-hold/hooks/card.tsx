// What the motion-hold mod draws: the card of a held command (pane
// `motion-hold`, from the holder's slot) and the STOP row above the prompt
// while an approved command runs. Box, Text and Button only. Both are drawn
// on the terminal alone; everywhere else the hook passes.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { MotionActive, MotionConfig } from '../types'
import type { Card, Slot } from './hold'
import { clean } from './match'
import type { Verdict } from './match'

export const PANE = 'motion-hold'
export const TITLE = 'Motion Hold'
export const ROW_KEY = 'zm-01-motion'
/** The chip, 11 cells wide like every chip of these mods. */
export const CHIP = ' ■ MOTION  '
export const RED = '#f38ba8'
export const CHIP_FG = '#0b0b0f'

const COMMAND_MAX = 600

/** HH:MM:SS, local time. */
export function hhmmss(ms: number): string {
  const d = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** The card's line for a command the Monitor tool would run: a watch, not a one-off command. */
export const WATCH_LINE = 'Tool Monitor: a watch that keeps running until its command exits or it is stopped'

/** The card of a held command: one line of what it would do, then the lines the pane and the dialog both show. */
export function cardOf(
  verdict: Extract<Verdict, { hold: true }>,
  command: string,
  isSubagent: boolean,
  timeoutMs: number,
  isWatch = false,
): Card {
  const text = clean(command, COMMAND_MAX)
  const lines = [
    ...(verdict.host !== null ? [`Host ${verdict.host}`] : []),
    ...(isSubagent ? ['From a subagent'] : []),
    ...(isWatch ? [WATCH_LINE] : []),
    `Command ${text}`,
    ...(verdict.isCertain ? [] : ['The command could not be read with certainty, so it is held.']),
  ]
  const commandRows = text.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 70)), 0)
  return {
    paneId: PANE,
    title: TITLE,
    header: TITLE,
    runLabel: 'Run once',
    what: `Would ${verdict.summary}`,
    lines,
    rows: Math.min(30, 9 + lines.length + commandRows),
    timeoutMs,
  }
}

export type CardActions = {
  /** The twin of `/motion run` and `/motion cancel`. */
  decide: (id: number, d: 'run' | 'cancel') => void
}

/** The held command's card. Cancel has the focus and the only hotkey; running it takes Tab, then Enter. */
export function drawCard($: EngineInterface, e: RenderInput<'Pane'>, pass: () => Promise<RenderElement>, slot: Slot | null, act: CardActions) {
  if (e.surface !== 'terminal') return pass()
  const { Box, Text, Button } = $.ui.resolve(e)
  if (slot === null) {
    return (
      <Box key="hold-none">
        <Text dimColor>No hold is pending.</Text>
      </Box>
    )
  }
  const card = slot.card
  const seconds = Math.round(card.timeoutMs / 1000)
  return (
    <Box key="hold-card" flexDirection="column" borderStyle="round" borderColor={RED} paddingX={1}>
      <Text key="hold-title" color={RED} bold>
        {`■ ${TITLE}`}
      </Text>
      <Text key="hold-what" color={RED} wrap="wrap">
        {card.what}
      </Text>
      {card.lines.map((line, i) => (
        <Text key={`hold-line-${i}`} wrap="wrap">
          {line}
        </Text>
      ))}
      <Box key="hold-buttons" flexDirection="row" gap={1}>
        <Button key="hold-cancel" label="Cancel" hotkey="2" autoFocus onPress={() => act.decide(slot.id, 'cancel')} />
        <Button key="hold-run" label="Run once" onPress={() => act.decide(slot.id, 'run')} />
      </Box>
      <Text key="hold-hint" dimColor wrap="wrap">
        {`Enter or 2 cancels. Tab then Enter runs it once. Refused after ${seconds} s. Twins: /motion run, /motion cancel.`}
      </Text>
    </Box>
  )
}

export type RowActions = {
  /** `s`, the twin of `/motion stop`. */
  stop: () => void
  /** `x`, the twin of `/motion clear`. */
  clear: () => void
}

/** The STOP row's words after the chip. */
export function rowLine(a: MotionActive, hasStop: boolean): string {
  return `${a.summary} · since ${hhmmss(a.startedAt)}${a.isBackground ? ' · background' : ''}${hasStop ? '' : ' · Esc interrupts here; the hardware may keep moving'}`
}

/** The STOP row: this plugin's own keyed row and nothing else; the strip mod orders the band. */
export function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  a: MotionActive | null,
  config: MotionConfig,
  act: RowActions,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey || a === null) return pass()
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box key={ROW_KEY} flexDirection="row" gap={1}>
      <Box key="motion-line" flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-end">
          <Text color={CHIP_FG} backgroundColor={RED} bold>
            {CHIP}
          </Text>
          <Text color={RED}>{` ${rowLine(a, config.hasStop)}`}</Text>
        </Text>
      </Box>
      {config.hasStop ? (
        <Box key="motion-stop-box" flexShrink={0}>
          <Button key="motion-stop" label="s: STOP" hotkey="s" onPress={() => act.stop()} />
        </Box>
      ) : null}
      {a.isBackground ? (
        <Box key="motion-clear-box" flexShrink={0}>
          <Button key="motion-clear" label="x: clear" hotkey="x" onPress={() => act.clear()} />
        </Box>
      ) : null}
    </Box>
  )
}
