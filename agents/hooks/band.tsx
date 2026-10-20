// The AGENTS band above the prompt, in the shape of the "Claude Code Mods"
// deck (slide 15): a pink chip, the main loop's model while a turn runs, one
// entry per run of the current batch (a subagent, or a background shell with
// its elapsed time), the skills fired, then ×N (opens the pane) and ✕ (hides
// the band until a new run starts). Its row sits in the zehui-mods stack at
// AGENTS 50 (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import type { AgentRun } from '../types'
import {
  MODEL_COLOR,
  batchOf,
  clip,
  dismissBand,
  elapsed,
  familyOf,
  fmtTime,
  isBandOn,
  isShell,
  isStale,
  isWatching,
  modelTag,
  openPane,
  readRuns,
  shellWords,
  stackKey,
  stackRow,
  watchTime,
} from './kit'

const main = atom({ plugin: 'agents', key: 'main' } as const, { model: '', isRunning: false, startedAt: 0 })
const skills = atom({ plugin: 'agents', key: 'skills' } as const, {})
const dismissedAt = atom({ plugin: 'agents', key: 'dismissedAt' } as const, 0)
const isCaffeinated = atom({ plugin: 'agents', key: 'isCaffeinated' } as const, false)

export const CHIP = ' ◎ AGENTS  ' // padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up
const CHIP_FG = '#0b0b0f'
const CHIP_BG = '#f472b6'
const RUNNING = '#f59e0b'
const DONE = '#22c55e'
const FAILED = '#ef4444'
const SKILL = '#a3e635'
/** A shell's words (`sh`, `codex gpt-5.4`): grey, so they never read as a Claude model. */
export const SHELL_WORD = '#9a9a96'
/** A stale entry's grey: a notification for a target already done. */
export const STALE_GREY = '#6b7280'
/** The caffeinate hold's mark at the end of the row. */
export const CAFFEINE = '☕'
/** The task text's cut. */
export const TASK_MAX = 22
/** Under this many columns the band takes its short form. */
export const SHORT_BELOW = 40
export const BAND_BAR = 6

/** One run of text in the band's line: its words and how they are drawn. */
type Seg = { text: string; color?: string; isDim?: boolean; isBold?: boolean; bg?: string }

const glyphOf = (a: AgentRun): Seg =>
  a.status === 'finished' ? { text: '✓', color: DONE } : a.status === 'error' ? { text: '✗', color: FAILED } : { text: '⟳', color: RUNNING }

const modelSeg = (model: string, text: string): Seg => {
  const color = MODEL_COLOR[familyOf(model)]
  return color ? { text, color } : { text, isDim: true }
}

/** The words an entry starts with, the part the narrowest band cuts. */
const labelOf = (a: AgentRun): string => (isWatching(a) ? (a.kind ?? 'watch') : isShell(a) ? shellWords(a) : a.name || a.type)

/**
 * One entry: type or name (cut to `labelMax`), model word, the task in quotes
 * (unless dropped), the status glyph. A shell's: its grey words (`sh`, or the
 * agent and model), the command or prompt in quotes, its elapsed time, the glyph.
 */
const entrySegs = (a: AgentRun, isTask: boolean, at: number, labelMax = Number.POSITIVE_INFINITY): Seg[] => {
  if (isWatching(a)) {
    // `watch deploy a15f4e9 ⏳ 12m`, `cron 20:30 in 41m`; ✓ or ✗ once ended; all grey while stale.
    const segs: Seg[] = [{ text: clip(labelOf(a), labelMax), color: SHELL_WORD }]
    if (a.kind === 'watch' && isTask && a.description) segs.push({ text: ' ' + clip(a.description, TASK_MAX), isDim: true })
    if (a.kind === 'watch' && a.target) segs.push({ text: ' ' + a.target, isDim: true })
    if (a.status === 'running') segs.push({ text: ' ' + watchTime(a, at) })
    else segs.push({ text: ' ' }, glyphOf(a))
    return isStale(a, at) ? segs.map(s => ({ text: s.text, color: STALE_GREY })) : segs
  }
  const task: Seg[] = isTask && a.description ? [{ text: ` "${clip(a.description, TASK_MAX)}"`, isDim: true }] : []
  if (isShell(a)) {
    return [{ text: clip(labelOf(a), labelMax), color: SHELL_WORD }, ...task, { text: ` ${fmtTime(elapsed(a, at))} ` }, glyphOf(a)]
  }
  return [{ text: clip(labelOf(a), labelMax) + ' ' }, modelSeg(a.model, familyOf(a.model) || 'model'), ...task, { text: ' ' }, glyphOf(a)]
}

const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + [...s.text].length, 0)

export type BandParts = {
  batch: readonly AgentRun[]
  mainModel: string | null
  skills: readonly [name: string, count: number][]
  /** The time the shells' elapsed times are drawn at. */
  at?: number
}

/**
 * The full line fitted to `room` columns: task texts are dropped oldest first,
 * then the skills down to one, then the tail of the entries folds into
 * `+N more`, then the main segment shrinks to `main ⟳` and goes; last, the
 * kept skill's name and the first entry's label are cut with `…`. The first
 * entry and one skill always stay (at a very narrow room the line may still
 * overrun, and the Text's truncate-end cuts its tail).
 */
export function fitLine(p: BandParts, room: number): Seg[] {
  const n = p.batch.length
  const hasTask = p.batch.map(() => true)
  let skillCount = p.skills.length
  let shown = n
  let mainForm: 'full' | 'short' | 'none' = 'full'
  let skillMax = Number.POSITIVE_INFINITY
  let labelMax = Number.POSITIVE_INFINITY
  const build = (): Seg[] => {
    const segs: Seg[] = [{ text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true }, { text: ' ' }]
    if (p.mainModel !== null && mainForm !== 'none') {
      segs.push({ text: 'main ' })
      if (mainForm === 'full') segs.push(modelSeg(p.mainModel, modelTag(p.mainModel)), { text: ' ' })
      segs.push({ text: '⟳', color: RUNNING }, { text: ' │ ', isDim: true })
    }
    p.batch.slice(0, shown).forEach((a, i) => {
      if (i) segs.push({ text: ' · ', isDim: true })
      segs.push(...entrySegs(a, hasTask[i] ?? false, p.at ?? 0, i === 0 ? labelMax : undefined))
    })
    if (shown < n) segs.push({ text: ` +${n - shown} more`, isDim: true })
    if (skillCount > 0) {
      const list = p.skills
        .slice(0, skillCount)
        .map(([name, count]) => `${clip(name, skillMax)} ×${count}`)
        .join(', ')
      segs.push({ text: ' │ ', isDim: true }, { text: `skills: ${list}`, color: SKILL })
    }
    return segs
  }
  const over = (): number => widthOf(build()) - room
  for (let i = 0; i < n && over() > 0; i++) hasTask[i] = false
  if (over() > 0) skillCount = Math.min(skillCount, 1)
  while (shown > 1 && over() > 0) shown--
  if (p.mainModel !== null && over() > 0) mainForm = 'short'
  if (p.mainModel !== null && over() > 0) mainForm = 'none'
  const skill = p.skills[0]?.[0]
  if (skillCount > 0 && skill !== undefined && over() > 0) skillMax = Math.max(2, skill.length - over())
  const first = p.batch[0]
  if (first && over() > 0) labelMax = Math.max(2, labelOf(first).length - over())
  return build()
}

/** The short form's bar: `width` cells, filled by the share of the batch that ended. */
export const shortBar = (batch: readonly AgentRun[], width = BAND_BAR): [filled: string, empty: string] => {
  const ended = batch.filter(a => a.status !== 'running').length
  const n = batch.length ? Math.round((ended / batch.length) * width) : 0
  return ['▰'.repeat(n), '▱'.repeat(width - n)]
}

export async function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, pass: () => Promise<RenderElement>, options: PluginOptions) {
  if (e.props.hasSurvey || !isBandOn(options.band) || e.surface !== 'terminal') return pass()
  const { list, at } = await readRuns($)
  const batch = batchOf(list, at, await read($, dismissedAt))
  if (batch.length === 0) return pass()
  const ordered = [...batch].sort((a, b) => a.startedAt - b.startedAt)
  const m = await read($, main)
  const fired = Object.entries(await read($, skills))
  const isAwake = await read($, isCaffeinated)

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const { Box, Text, Button } = $.ui.resolve(e)
  const n = ordered.length
  const crew = `×${n}`
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
  // Framed buttons: `[ ×N ]` and `[ ✕ ]`, each after a one-column gap; ☕ (two cells) after them while held.
  const buttonsW = crew.length + 4 + 1 + 5 + 1 + (isAwake ? 3 : 0)
  const isLive = ordered.some(a => a.status === 'running')

  let line: JSX.Element
  if (cols < SHORT_BELOW) {
    const [filled, empty] = shortBar(ordered)
    // Shells count too: with any in the batch, the word is `tasks`.
    const noun = ordered.some(a => isShell(a) || isWatching(a)) ? (n === 1 ? 'task' : 'tasks') : n === 1 ? 'agent' : 'agents'
    line = (
      <Text wrap="truncate-end">
        <Text color={isLive ? RUNNING : DONE}>{`● ${n} ${noun} `}</Text>
        <Text color={DONE}>{filled}</Text>
        <Text dimColor>{empty}</Text>
      </Text>
    )
  } else {
    const segs = fitLine({ batch: ordered, mainModel: m.isRunning ? m.model || 'main' : null, skills: fired, at }, cols - buttonsW)
    line = (
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
    )
  }

  const row = (
    <Box key={stackKey('agents')} flexDirection="row" gap={1}>
      <Box key="agents-line" flexGrow={1} flexShrink={1}>
        {line}
      </Box>
      <Box flexShrink={0}>
        <Button key="agents-crew" label={crew} onPress={() => void openPane($)} />
      </Box>
      <Box flexShrink={0}>
        <Button key="agents-dismiss" label="✕" role="dismiss" onPress={() => void dismissBand($)} />
      </Box>
      {isAwake ? (
        <Box key="agents-awake" flexShrink={0}>
          <Text>{CAFFEINE}</Text>
        </Box>
      ) : null}
    </Box>
  )
  return stackRow(row, below)
}
