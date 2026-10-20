// The ⇄ HANDOFF row above the prompt: the context bar stacked by /context
// category, the fill against the compaction point in traffic-light colours,
// the top three categories, and what to do about it (save now, clear &
// continue, resume). Its row sits in the zehui-mods stack
// by its order (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import {
  BAR_CELLS,
  CHIP,
  CHIP_BG,
  CHIP_FG,
  GREEN,
  AMBER,
  barRuns,
  clip,
  fillColor,
  fillOf,
  hhmm,
  newest,
  settingsOf,
  topThree,
  stackKey,
  stackRow,
} from './kit'

const context = atom({ plugin: 'handoff', key: 'context' } as const, null)
const save = atom({ plugin: 'handoff', key: 'save' } as const, { phase: 'idle', requestedAt: 0, baseMtime: 0, savedAt: 0, via: '' })
const offer = atom({ plugin: 'handoff', key: 'offer' } as const, null)
const isOver = atom({ plugin: 'handoff', key: 'isOver' } as const, false)
const clearedAt = atom({ plugin: 'handoff', key: 'clearedAt' } as const, 0)
const SETTINGS = { plugin: 'handoff', key: 'settings' } as const
const TW_CONTEXT = { plugin: 'token-weather', key: 'context' } as const

/** What the row's buttons do: the same as `/handoff-line now`, `/clear` then `resume`, and `resume`. */
export type RowActions = {
  save: () => void
  clearAndContinue: () => void
  resume: () => void
}

/** One run of text in the row: its words and how they are drawn. */
type Seg = { text: string; color?: string; bg?: string; isBold?: boolean; isDim?: boolean }
type Btn = { key: string; label: string; hotkey: string; onPress: () => void }

/** The shortest the objective is cut to before anything else gives. */
const OBJECTIVE_MIN = 12

const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + [...s.text].length, 0)

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  options: PluginOptions,
  act: RowActions,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  const settings = (await $.state.get(SETTINGS)).value ?? settingsOf(options)
  if (settings.band === 'off') return pass()
  const tw = (await $.state.get(TW_CONTEXT)).value
  const r = newest(tw, await read($, context), await read($, clearedAt))
  const s = await read($, save)
  const o = await read($, offer)
  const over = await read($, isOver)
  if (!r && !o && s.phase === 'idle') return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const head: Seg[] = [{ text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true }, { text: ' ' }]
  let tops: Seg[][] = []
  if (r) {
    const fill = fillOf(r)
    const color = fillColor(fill, settings.threshold)
    head.push(...barRuns(r, color, BAR_CELLS), { text: ` ${fill}%`, color, isBold: true })
    tops = topThree(r.categories).map((c, i) => [{ text: i === 0 ? '  ' : ' · ', isDim: true }, { text: c.text, color: c.color }])
  }

  const tail: Seg[] = []
  const buttons: Btn[] = []
  let objective = ''
  if (s.phase === 'saved') {
    tail.push({ text: `  ✓ saved ${hhmm(s.savedAt)}`, color: GREEN, isBold: true })
    buttons.push({ key: 'handoff-clear', label: 'c: clear & continue', hotkey: 'c', onPress: act.clearAndContinue })
  } else if (s.phase === 'saving') {
    tail.push({ text: '  writing HANDOFF.md…', color: AMBER })
  } else if (o) {
    objective = o.objective
    buttons.push({ key: 'handoff-resume', label: 'r: resume', hotkey: 'r', onPress: act.resume })
  }
  if (over && s.phase === 'idle') {
    buttons.push({ key: 'handoff-save', label: 'h: save now', hotkey: 'h', onPress: act.save })
  }

  // Fit: the top three go first (third first), then the objective is cut;
  // past that the Text's truncate-end cuts the tail.
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  const room = cols - buttons.reduce((w, b) => w + b.label.length + 4 + 1, 0)
  const offerSegs = (max: number): Seg[] =>
    o && s.phase === 'idle' ? [{ text: `  from ${o.age}: `, isDim: true }, { text: clip(objective, max) }] : []
  let objectiveMax = Math.max(objective.length, 1)
  const build = (): Seg[] => [...head, ...tops.flat(), ...tail, ...offerSegs(objectiveMax)]
  while (tops.length > 0 && widthOf(build()) > room) tops = tops.slice(0, -1)
  const over2 = widthOf(build()) - room
  if (over2 > 0 && objective) objectiveMax = Math.max(OBJECTIVE_MIN, objective.length - over2)
  const segs = build()

  const { Box, Text, Button } = $.ui.resolve(e)
  const row = (
    <Box key={stackKey('handoff')} flexDirection="row" gap={1}>
      <Box key="handoff-line" flexGrow={1} flexShrink={1}>
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
      {buttons.map(b => (
        <Box key={`${b.key}-box`} flexShrink={0}>
          <Button key={b.key} label={b.label} hotkey={b.hotkey} onPress={() => b.onPress()} />
        </Box>
      ))}
    </Box>
  )
  return stackRow(row, below)
}
