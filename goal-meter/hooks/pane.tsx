// The /goals pane: the goal's figures, every task (▶ running, ✓ done,
// ○ open) with its minutes, then the last five goals. Box and Text only, so
// every surface draws it the same.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { Goal, GoalRecord, GoalTask } from '../types'
import { AMBER, CHIP_BG, GREEN, fmtEta, fmtMin, hhmm, spanOf, viewOf } from './kit'

const goal = atom({ plugin: 'goal-meter', key: 'goal' } as const, null)
const history = atom({ plugin: 'goal-meter', key: 'history' } as const, [])
const now = atom({ plugin: 'goal-meter', key: 'now' } as const, 0)

/** One task's line: its glyph and colour, its title and its minutes. */
export function taskLine(t: GoalTask, g: Goal, at: number): { glyph: string; color?: string; text: string } {
  if (t.status === 'completed') {
    const ms = spanOf(t, g)
    return { glyph: '✓', color: GREEN, text: `${t.title}${ms !== null ? `  ${fmtMin(ms)}` : ''}` }
  }
  if (t.status === 'in_progress') {
    const ms = t.startedAt !== undefined ? Math.max(0, at - t.startedAt) : null
    return { glyph: '▶', color: AMBER, text: `${t.title}${ms !== null ? `  ${fmtMin(ms)}` : ''}` }
  }
  return { glyph: '○', text: t.title }
}

/** One earlier goal's line. */
export const recordLine = (r: GoalRecord): string =>
  r.doneAt !== undefined
    ? `✓ ${r.name} · ${r.total} ${r.total === 1 ? 'task' : 'tasks'} · ${fmtMin(r.doneAt - r.startedAt)} · ${hhmm(r.startedAt)}`
    : `○ ${r.name} · ${r.done}/${r.total} · stopped · ${hhmm(r.startedAt)}`

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const g = await read($, goal)
  const past = (await read($, history)).filter(r => !g || r.startedAt !== g.startedAt)
  const at = Math.max(await read($, now), g?.startedAt ?? 0)
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 40
  const { Box, Text } = $.ui.resolve(e)
  const v = g && g.tasks.length > 0 ? viewOf(g, at) : null
  const summary = v
    ? v.isDone
      ? `${v.done}/${v.total} · done ✓ in ${fmtMin(v.elapsedMs)}`
      : `${v.done}/${v.total} · ${v.pct}% · ${fmtMin(v.elapsedMs)}${v.etaMs !== null ? ` · ETA ${fmtEta(v.etaMs)}` : ''}`
    : ''
  const rule = (title: string) => `${title} ${'─'.repeat(Math.max(3, Math.min(40, cols - title.length - 1)))}`

  return (
    <Box flexDirection="column">
      {g && v ? (
        <Box key="goal" flexDirection="column">
          <Text wrap="truncate-end">
            <Text color={CHIP_BG} bold>
              {'◆ '}
            </Text>
            <Text bold>{g.name}</Text>
          </Text>
          <Text key="goal-summary" dimColor>
            {summary}
          </Text>
          {g.tasks.map(t => {
            const line = taskLine(t, g, at)
            return (
              <Text key={`task-${t.id}`} wrap="truncate-end">
                <Text {...(line.color ? { color: line.color } : { dimColor: true })}>{`${line.glyph} `}</Text>
                <Text {...(t.status === 'pending' ? { dimColor: true } : {})}>{line.text}</Text>
              </Text>
            )
          })}
        </Box>
      ) : (
        <Text key="goal-none" dimColor>
          No goal yet. The GOAL row appears when Claude writes a task list.
        </Text>
      )}
      <Text key="history-head" bold>
        {rule('Last goals')}
      </Text>
      {past.length === 0 ? (
        <Text key="history-none" dimColor>
          No earlier goals.
        </Text>
      ) : (
        past.map(r => (
          <Text key={`goal-${r.startedAt}`} wrap="truncate-end" {...(r.doneAt === undefined ? { dimColor: true } : {})}>
            {recordLine(r)}
          </Text>
        ))
      )}
    </Box>
  )
}
