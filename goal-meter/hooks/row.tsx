// The ◆ GOAL row above the prompt: the goal's name, a 6-cell bar of tasks
// done, `4/6 · 67% · 18m · ETA ~9m` and the task running now. The bar is
// green, amber while the running task drags (twice the finished tasks'
// average, its own minutes after it). Finished: `done ✓ in 12m` in green for
// two minutes, then the row hides. Its row sits in the zehui-mods stack
// by its order (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import {
  AMBER,
  BAR_CELLS,
  CHIP,
  CHIP_BG,
  CHIP_FG,
  GREEN,
  barCells,
  cellsOf,
  fmtEta,
  fmtMin,
  goalName,
  isBandOn,
  isShown,
  viewOf,
  stackKey,
  stackRow,
} from './kit'

const goal = atom({ plugin: 'goal-meter', key: 'goal' } as const, null)
const now = atom({ plugin: 'goal-meter', key: 'now' } as const, 0)
const band = atom({ plugin: 'goal-meter', key: 'band' } as const, '')

/** One run of text in the row: its words and how they are drawn. */
type Seg = { text: string; color?: string; bg?: string; isBold?: boolean; isDim?: boolean }

/** The row's width in terminal columns (a CJK character takes two). */
const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + cellsOf(s.text), 0)

/** A short name when the full row does not fit the band. */
const SHORT_NAME = 24

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  options: PluginOptions,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!isBandOn(await read($, band), options.band)) return pass()
  const g = await read($, goal)
  const at = Math.max(await read($, now), g?.startedAt ?? 0)
  if (!isShown(g, at)) return pass()
  const v = viewOf(g, at)
  const color = v.isSlow ? AMBER : GREEN

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const n = barCells(v.done, v.total)
  const bar: Seg[] = [
    ...(n > 0 ? [{ text: '▰'.repeat(n), color }] : []),
    ...(n < BAR_CELLS ? [{ text: '▱'.repeat(BAR_CELLS - n), isDim: true }] : []),
  ]
  const tail: Seg[] = v.isDone
    ? [{ text: ` ${v.done}/${v.total} · ` }, { text: `done ✓ in ${fmtMin(v.elapsedMs)}`, color: GREEN, isBold: true }]
    : [
        {
          text: ` ${v.done}/${v.total} · ${v.pct}% · ${fmtMin(v.elapsedMs)}${v.etaMs !== null ? ` · ETA ${fmtEta(v.etaMs)}` : ''}`,
        },
        ...(v.current
          ? [
              { text: ' │ ', isDim: true },
              { text: `▶ ${v.current.title}`, ...(v.isSlow ? { color: AMBER } : {}) },
              ...(v.isSlow && v.currentMs !== null ? [{ text: ` ${fmtMin(v.currentMs)}`, color: AMBER, isBold: true }] : []),
            ]
          : []),
      ]
  const build = (name: string): Seg[] => [
    { text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true },
    { text: ' ' },
    { text: name, isBold: true },
    { text: ' ' },
    ...bar,
    ...tail,
  ]
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  let segs = build(g.name)
  if (widthOf(segs) > cols) segs = build(goalName(g.name, SHORT_NAME))

  const { Box, Text } = $.ui.resolve(e)
  const row = (
    <Box key={stackKey('goal')} flexDirection="row">
      <Box key="goal-line" flexDirection="row">
        <Text wrap="truncate-end">
          {segs.map((s, i) => (
            <Text
              key={`seg-${i}`}
              {...(s.color ? { color: s.color } : {})}
              {...(s.bg ? { backgroundColor: s.bg } : {})}
              {...(s.isBold ? { bold: true } : {})}
              {...(s.isDim ? { dimColor: true } : {})}
            >
              {s.text}
            </Text>
          ))}
        </Text>
      </Box>
    </Box>
  )
  return stackRow(row, below)
}
