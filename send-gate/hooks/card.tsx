// What the send-gate mod draws: the card of a held call (pane `send-gate`,
// from the holder's slot). Box, Text and Button only, on the terminal alone;
// everywhere else the hook passes.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { SendKind } from '../types'
import type { Card, Slot } from './hold'
import { clean, lastPartOf, oneLine } from './rules'
import type { Preview } from './rules'

export const PANE = 'send-gate'
export const TITLE = 'Send Gate'
export const RUN_LABEL = 'Send once'
/** Catppuccin Mocha peach: the card's border and title. */
export const PEACH = '#fab387'
/** The one line that holds every other argument is cut to this many characters. */
const ALSO_MAX = 300

/** The word for a kind in the deny text: exhaustive over SendKind. */
export const KIND_WORD: Record<SendKind, string> = {
  message: 'message',
  email: 'email',
  notify: 'notification',
  site: 'call',
}

/** One line: what the call would do. */
export function whatOf(p: Preview): string {
  switch (p.kind) {
    case 'message':
      return 'Would send a message'
    case 'email':
      return 'Would send an email'
    case 'notify':
      return `Would notify people through ${clean(oneLine(lastPartOf(p.tool)), 120)}`
    case 'site':
      return `Would call ${clean(oneLine(p.tool), 160)}`
  }
}

const listOr = (list: string[]): string => (list.length > 0 ? list.join(', ') : 'none')

/**
 * The card of a held call: the lines the pane and the dialog both show, at
 * most seven (the dialog shows eight), so the text is always among them.
 * Everything in it is already cleaned, and no line holds a line break: a value
 * can never pass for a card line of its own.
 */
export function cardOf(p: Preview, isSubagent: boolean, timeoutMs: number): Card {
  const lines = [
    ...(p.kind !== 'site' ? [`Tool ${clean(oneLine(p.tool), 160)}`] : []),
    ...(isSubagent ? ['From a subagent'] : []),
    `To ${p.target !== '' ? p.target : '(no target named)'}`,
    `Mentions ${listOr(p.mentions)}`,
    `Dates ${listOr(p.dates)}`,
    // A call with no body key at all (a saved draft's send) says its text is elsewhere, not that it has none.
    ...(p.body !== '' ? [`Text ${oneLine(p.body)}`] : p.kind === 'site' ? [] : [p.hasBodyKey ? 'Text none' : 'Text not in this call']),
    // Every other argument, on one line after the text.
    ...(p.fields.length > 0 ? [clean(`Also ${p.fields.map(([k, v]) => `${k}: ${v}`).join(' · ')}`, ALSO_MAX)] : []),
  ]
  const textRows = lines.reduce((rows, line) => rows + line.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 70)), 0), 0)
  return {
    paneId: PANE,
    title: TITLE,
    header: TITLE,
    runLabel: RUN_LABEL,
    what: whatOf(p),
    lines,
    rows: Math.min(30, 8 + textRows),
    timeoutMs,
  }
}

export type CardActions = {
  /** The twin of `/send-gate send` and `/send-gate cancel`. */
  decide: (id: number, d: 'run' | 'cancel') => void
}

/** The held call's card. Cancel has the focus and the only hotkey; sending takes Tab, then Enter. */
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
    <Box key="hold-card" flexDirection="column" borderStyle="round" borderColor={PEACH} paddingX={1}>
      <Text key="hold-title" color={PEACH} bold>
        {`■ ${TITLE}`}
      </Text>
      <Text key="hold-what" color={PEACH} wrap="wrap">
        {card.what}
      </Text>
      {card.lines.map((line, i) => (
        <Text key={`hold-line-${i}`} wrap="wrap">
          {line}
        </Text>
      ))}
      <Box key="hold-buttons" flexDirection="row" gap={1}>
        <Button key="hold-cancel" label="Cancel" hotkey="2" autoFocus onPress={() => act.decide(slot.id, 'cancel')} />
        <Button key="hold-run" label={RUN_LABEL} onPress={() => act.decide(slot.id, 'run')} />
      </Box>
      <Text key="hold-hint" dimColor wrap="wrap">
        {`Enter or 2 cancels. Tab then Enter sends it once. Refused after ${seconds} s. Twins: /send-gate send, /send-gate cancel.`}
      </Text>
    </Box>
  )
}
