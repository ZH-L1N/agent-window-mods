// The Files pane: a head line with framed `r: refresh` and `c: close`
// Buttons, the files touched this turn (writes first), then the tree: a
// folder is a plain Button that opens and closes it, a file a Text with its
// git mark. Terminal only (register.tsx passes every other surface on).
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import { COMMAND, baseName, changedText, clean, touchedList, visibleRows } from './tree'
import type { Touch } from './tree'

const root = atom({ plugin: 'filetree', key: 'root' } as const, '')
const open = atom({ plugin: 'filetree', key: 'open' } as const, [])
const listed = atom({ plugin: 'filetree', key: 'listed' } as const, {})
const git = atom({ plugin: 'filetree', key: 'git' } as const, {})
const touched = atom({ plugin: 'filetree', key: 'touched' } as const, {})

/** Catppuccin Mocha, as the strip draws. */
export const C = {
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  red: '#f38ba8',
  sapphire: '#74c7ec',
} as const

/** A git code's colour: `M` yellow, `A` and `??` green, `D` red. */
export function markColor(code: string): string {
  if (code.includes('D') || code.includes('U')) return C.red
  if (code === '??' || code.includes('A')) return C.green
  return C.yellow
}

/** How a touched file is drawn: written peach and bold, read sapphire. */
const touchLook = (t: '' | Touch): { color?: string; bold?: boolean } =>
  t === 'write' ? { color: C.peach, bold: true } : t === 'read' ? { color: C.sapphire } : {}

export type PaneActions = {
  /** `r`, the twin of `/tree refresh`. */
  refresh: () => void
  /** `c`, the twin of `/tree close`. */
  close: () => void
  /** A folder's press, the twin of `/tree toggle <path>`. */
  toggle: (path: string) => void
}

export const headText = (rootPath: string, changed: string, touchedCount: number): string =>
  `Files · ${clean(baseName(rootPath))} · ${changed} · ${touchedCount} touched this turn`

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>, act: PaneActions) {
  const [r, opened, lists, marks, touches] = await Promise.all([read($, root), read($, open), read($, listed), read($, git), read($, touched)])
  const { Box, Text, Button } = $.ui.resolve(e)
  const rows = visibleRows(lists, opened, marks, touches)
  const recent = touchedList(touches)
  const isListed = lists[''] !== undefined

  // A folder's `… N more` goes after its last shown entry's own subtree.
  const body: unknown[] = []
  const pending: { depth: number; more: number; key: string }[] = []
  const flush = (depth: number) => {
    while (pending.length > 0 && pending[pending.length - 1]!.depth >= depth) {
      const p = pending.pop()!
      body.push(
        <Box key={`more-${p.key}`} paddingLeft={p.depth * 2 + 2}>
          <Text dimColor>{`… ${p.more} more`}</Text>
        </Box>,
      )
    }
  }
  for (const row of rows) {
    flush(row.depth)
    const name = clean(row.name)
    if (row.kind === 'dir') {
      body.push(
        <Box key={`row-${row.path}`} flexDirection="row" gap={1} paddingLeft={row.depth * 2}>
          <Button key={`ft-${row.path}`} plain label={`${row.isOpen ? '▾' : '▸'} ${name}/`} onPress={() => act.toggle(row.path)} />
          {row.mark ? <Text color={C.yellow}>{row.mark}</Text> : null}
        </Box>,
      )
    } else {
      body.push(
        <Box key={`row-${row.path}`} flexDirection="row" gap={1} paddingLeft={row.depth * 2 + 2}>
          <Text wrap="truncate-end" {...touchLook(row.touch)}>
            {name}
          </Text>
          {row.mark ? <Text color={markColor(row.mark)}>{row.mark}</Text> : null}
        </Box>,
      )
    }
    if (row.more > 0) pending.push({ depth: row.depth, more: row.more, key: row.path })
  }
  flush(0)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Box key="tree-head" flexGrow={1} flexShrink={1}>
          <Text bold wrap="truncate-end">
            {headText(r, changedText(marks), Object.keys(touches).length)}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Button key="tree-refresh" label="r: refresh" hotkey="r" onPress={() => act.refresh()} />
          <Button key="tree-close" label="c: close" hotkey="c" onPress={() => act.close()} />
        </Box>
      </Box>
      {recent.length > 0 ? (
        <Box key="touched" flexDirection="column">
          <Text bold>Touched this turn</Text>
          {recent.map(t => (
            <Box key={`touched-${t.path}`} flexDirection="row" gap={2} paddingLeft={2}>
              <Text wrap="truncate-end" {...touchLook(t.kind)}>
                {clean(t.path)}
              </Text>
              <Text dimColor>{t.kind === 'write' ? 'written' : 'read'}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {!isListed ? (
        <Text key="tree-unlisted" dimColor>{`Not listed yet: /${COMMAND} refresh reads it.`}</Text>
      ) : rows.length === 0 ? (
        <Text key="tree-empty" dimColor>
          No files here.
        </Text>
      ) : null}
      {body as never}
      <Text key="tree-twins" dimColor wrap="truncate-end">
        {`/${COMMAND} refresh · /${COMMAND} close · /${COMMAND} toggle <path>`}
      </Text>
    </Box>
  )
}
