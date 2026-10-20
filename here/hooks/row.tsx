// The ◉ HERE row above the prompt: `goal <name> · now <doing> · you: "<question>"`.
// The goal is goal-meter's goal name while its list is open, else the first
// line of the prompt that started the main loop's open task list; now is the last
// main-loop tool call's verb and path, or the spinner word (live.ts) before the
// turn's first tool call; you is the first question line of the last reply, cut to
// 60 columns, `+n` when it asked more. The row shows whenever any of the
// three has a value. Its row sits in the zehui-mods stack by its order
// (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import type { HereNow } from '../types'

import {
  CHIP,
  CHIP_BG,
  CHIP_FG,
  GOAL_MAX,
  GOAL_SHORT,
  NOW_MAX,
  NOW_SHORT,
  YOU_MAX,
  cellsOf,
  clean,
  cut,
  goalOf,
  isBandOn,
  partsOf,
  rewriteOf,
  stackKey,
  stackRow,
} from './kit'
import { live } from './live'

const now = atom({ plugin: 'here', key: 'now' } as const, null)
const you = atom({ plugin: 'here', key: 'you' } as const, [])
const band = atom({ plugin: 'here', key: 'band' } as const, '')
const rewrite = atom({ plugin: 'here', key: 'rewrite' } as const, null)
const goal = atom({ plugin: 'here', key: 'goal' } as const, null)
const GOAL_METER = { plugin: 'goal-meter', key: 'goal' } as const

/** One run of text in the row: its words and how they are drawn. */
type Seg = { text: string; color?: string; bg?: string; isBold?: boolean; isDim?: boolean }

const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + cellsOf(s.text), 0)

/**
 * goal-meter's goal name and tasks while its list is open; else the fallback
 * goal (the first line of the prompt that started the open task list) with no
 * tasks; else ''.
 */
export async function peerGoal($: EngineInterface): Promise<{ name: string; tasks: { title: string; status: string }[] }> {
  try {
    const g = (await $.state.get(GOAL_METER)).value
    const name = goalOf(g)
    if (name && g) return { name, tasks: g.tasks.filter(t => t && typeof t.title === 'string').map(t => ({ title: clean(t.title), status: String(t.status) })) }
  } catch {
    // goal-meter is absent: the fallback.
  }
  try {
    return { name: (await read($, goal))?.text ?? '', tasks: [] }
  } catch {
    return { name: '', tasks: [] }
  }
}

/** `now` as shown: the last tool call, or the spinner word while a turn has made none. */
export const nowText = (n: HereNow | null): string => n?.text ?? (live.isTurnRunning ? live.spinnerWord : '')

export async function drawRow($: EngineInterface, e: RenderInput<'AbovePrompt'>, pass: () => Promise<RenderElement>, options: PluginOptions) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!isBandOn(await read($, band))) return pass()
  const n = await read($, now)
  const rw = rewriteOf(options.rewrite) === 'haiku' ? await read($, rewrite) : null
  const p = partsOf((await peerGoal($)).name, nowText(n), await read($, you), rw)
  if (!p.goal && !p.now && p.you.length === 0) return pass()

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const isSpinner = n === null && p.now !== '' && p.now === nowText(n)
  const build = (goalMax: number, nowMax: number): Seg[] => {
    const parts: Seg[][] = []
    if (p.goal) parts.push([{ text: 'goal ', isDim: true }, { text: cut(p.goal, goalMax), isBold: true }])
    if (p.now) parts.push([{ text: 'now ', isDim: true }, { text: `${cut(p.now, nowMax)}${isSpinner ? '…' : ''}` }])
    if (p.you.length > 0) {
      parts.push([
        { text: 'you: ', isDim: true },
        { text: `"${cut(p.you[0] ?? '', YOU_MAX)}"`, color: CHIP_BG, isBold: true },
        ...(p.you.length > 1 ? [{ text: ` +${p.you.length - 1}`, isDim: true }] : []),
      ])
    }
    const body = parts.flatMap((segs, i) => (i === 0 ? segs : [{ text: ' · ', isDim: true }, ...segs]))
    return [{ text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true }, { text: ' ' }, ...body]
  }
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  // The question is what the person acts on: on a narrow band the goal gives first, then now.
  let segs = build(GOAL_MAX, NOW_MAX)
  if (widthOf(segs) > cols) segs = build(GOAL_SHORT, NOW_MAX)
  if (widthOf(segs) > cols) segs = build(GOAL_SHORT, NOW_SHORT)

  const { Box, Text } = $.ui.resolve(e)
  const row = (
    <Box key={stackKey('here')} flexDirection="row">
      <Box key="here-line" flexDirection="row">
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
