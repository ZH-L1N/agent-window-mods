// The agents pane's Code view: the files this turn (or the session) touched,
// drawn as a map of round-bordered nodes 22 wide in edit order with ──▶
// between them, wrapping by the pane's width; the read-only files in an
// ALSO READ chip row; the subagents that touched them with their numbered
// buttons. Under 60 columns a tree list instead; plain text off the terminal.
// Keys while the pane has the focus: w Who, a turn/session, d then a number
// /diff on that file (run from the tick), p Peers, q close.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, RenderInput } from 'claude-code'

import type { AgentRun, CodeScope } from '../types'
import { ARROW, NODE_W, TREE_BELOW, namesOf, nodesPerRow, scopeOf, shownState, summariesOf, toolMarks } from './codemap'
import type { MapFile, ScopeView, ShownState } from './codemap'
import { MESSAGES_STUB, cardNumbers, clip, closePane, diffQueue, setView } from './kit'
import { showPeers } from './peers'
import { fmtLeft } from './watch'

const code = atom({ plugin: 'agents', key: 'code' } as const, [])
const turn = atom({ plugin: 'agents', key: 'turn' } as const, 0)
const codeScope = atom({ plugin: 'agents', key: 'codeScope' } as const, 'turn')
const isDiffArmed = atom({ plugin: 'agents', key: 'isDiffArmed' } as const, false)

/** The state colours: read blue, editing amber, changed green, failed red. */
export const STATE_COLOR: Record<ShownState, string> = {
  read: '#60a5fa',
  editing: '#f59e0b',
  changed: '#22c55e',
  failed: '#ef4444',
}
/** The state glyphs, as the plan words them: `◌ read`, `● editing`, `✓ changed`, `✗ failed`. */
export const STATE_GLYPH: Record<ShownState, string> = { read: '◌', editing: '●', changed: '✓', failed: '✗' }
const CHIP_FG = '#0b0b0f'
const ALSO_BG = '#9ca3af'
/** Nodes numbered for `d` + number: one digit each. */
export const MAX_DIFF = 9

/** The edited files in scope, in the map's order: node n is the n-th. */
const editedOf = (v: ScopeView): MapFile[] => v.files.filter(f => f.editedAt !== undefined)

async function readScope($: EngineInterface): Promise<ScopeView> {
  return scopeOf(await read($, code), await read($, turn), await read($, codeScope))
}

/** The path of the code map's node `n` (1 up) in the current scope, or undefined. */
export async function nodePath($: EngineInterface, n: number): Promise<string | undefined> {
  if (!Number.isInteger(n) || n < 1) return undefined
  return editedOf(await readScope($))[n - 1]?.path
}

/** Queues /diff for a node's file (the tick runs it) and drops the pick. */
async function pickDiff($: EngineInterface, path: string): Promise<void> {
  diffQueue.push(path)
  await update($, isDiffArmed, () => false)
}

export type CodeData = {
  list: readonly AgentRun[]
  at: number
  cols: number
  options: PluginOptions
}

/** `+12 −3`, or '' with no counts. */
const countsOf = (f: MapFile): string => (f.plus !== undefined ? `+${f.plus} −${f.minus ?? 0}` : '')

/** A folder's last two parts (`agents/hooks`), for the tree list and the plain view. */
const shortDir = (path: string): string => path.split('/').slice(-3, -1).join('/')

/** The words after the counts: tools, time since the last touch, turn tags (session), subagent numbers. */
function metaOf(f: MapFile, at: number, scope: CodeScope, numbers: ReadonlyMap<string, number>): string {
  const subs = f.by.filter(b => b !== 'main').map(b => numbers.get(b))
  return [
    countsOf(f),
    toolMarks(f.tools),
    fmtLeft(at - f.lastAt),
    ...(scope === 'session' ? [f.turns.map(t => `t${t}`).join(',')] : []),
    ...(subs.length ? [subs.map(n => (n ? `@${n}` : '@')).join('')] : []),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The header's words: `Code map (11 files) (2 changed)`, and the file being edited. */
function headOf(v: ScopeView, at: number): { counts: string; editing?: string; scope: string } {
  const changed = v.files.filter(f => f.state === 'changed').length
  const editing = [...v.files].filter(f => shownState(f, at) === 'editing').sort((a, b) => (b.lastEditAt ?? 0) - (a.lastEditAt ?? 0))[0]
  const names = namesOf(v.files.map(f => f.path))
  return {
    counts: `(${v.files.length} file${v.files.length === 1 ? '' : 's'}) (${changed} changed)`,
    ...(editing ? { editing: names.get(editing.path) ?? editing.path } : {}),
    scope: v.scope === 'session' ? 'session' : v.isPrevious ? `turn ${v.turn} (previous)` : `turn ${v.turn}`,
  }
}

export async function drawCode($: EngineInterface, e: RenderInput<'Pane'>, d: CodeData) {
  const v = await readScope($)
  const isArmed = await read($, isDiffArmed)
  if (e.surface === 'terminal') return codeTerminal($, $.ui.resolve(e), v, isArmed, d)
  return codePlain($.ui.resolve(e), v, d)
}

/** The two elements every surface's table has, the plain view's whole need. */
type Shared = { Box: Elements['mobile']['Box']; Text: Elements['mobile']['Text'] }

// --- plain text, for the desktop and the other remote surfaces

function codePlain(ui: Shared, v: ScopeView, d: CodeData) {
  const { Box, Text } = ui
  const head = headOf(v, d.at)
  const names = namesOf(v.files.map(f => f.path))
  const edited = editedOf(v)
  const read = v.files.filter(f => f.editedAt === undefined)
  return (
    <Box flexDirection="column">
      <Text bold>{`Code map ${head.counts} · ${head.scope}${head.editing ? ` · editing ${head.editing}` : ''}`}</Text>
      {v.files.length === 0 && <Text dimColor>No files touched yet.</Text>}
      {edited.map((f, i) => (
        <Text key={`plain-${f.path}`}>
          {`${i + 1} ${STATE_GLYPH[shownState(f, d.at)]} ${names.get(f.path) ?? f.path} ${countsOf(f)}${f.summary ? ' · ' + clip(f.summary, 60) : ''}`}
        </Text>
      ))}
      {read.length > 0 && <Text dimColor>{`Also read: ${read.map(f => names.get(f.path) ?? f.path).join(', ')}`}</Text>}
    </Box>
  )
}

// --- the terminal

function codeTerminal($: EngineInterface, ui: Elements['terminal'], v: ScopeView, isArmed: boolean, d: CodeData) {
  const { Box, Text, Button } = ui
  const { at, cols } = d
  const summaries = summariesOf(d.options.summaries)
  const head = headOf(v, at)
  const names = namesOf(v.files.map(f => f.path))
  const edited = editedOf(v)
  const alsoRead = v.files.filter(f => f.editedAt === undefined)
  const numbers = cardNumbers(d.list)
  const isTree = cols < TREE_BELOW

  const header = (
    <Box key="code-head">
      <Text wrap="truncate-end">
        <Text bold>Code map</Text>
        <Text dimColor>{` ${head.counts} · ${head.scope}`}</Text>
        {head.editing ? <Text color={STATE_COLOR.editing}>{` ● editing ${head.editing}`}</Text> : null}
      </Text>
    </Box>
  )

  // The view's keys: framed buttons, each with its /agents-info twin.
  const keys = (
    <Box key="code-keys" flexDirection="row" flexWrap="wrap" gap={1}>
      <Button key="view-who" label="w: who" hotkey="w" onPress={() => void setView($, 'who')} />
      <Button
        key="code-scope"
        label={v.scope === 'session' ? 'a: this turn' : 'a: session'}
        hotkey="a"
        onPress={() => void update($, codeScope, s => (s === 'turn' ? 'session' : 'turn'))}
      />
      {edited.length > 0 ? (
        <Button key="code-diff" label={isArmed ? 'd: cancel' : 'd: diff'} hotkey="d" onPress={() => void update($, isDiffArmed, x => !x)} />
      ) : null}
      <Button key="view-peers" label="p: peers" hotkey="p" onPress={() => void showPeers($).catch(() => {})} />
      <Button key="pane-close" label="q: close" hotkey="q" onPress={() => void closePane($)} />
    </Box>
  )

  // After `d`: one framed button per numbered node; its digit runs /diff on that file.
  const picks = isArmed ? (
    <Box key="diff-picks" flexDirection="row" flexWrap="wrap" gap={1}>
      <Text color={STATE_COLOR.editing}>diff which file?</Text>
      {edited.slice(0, MAX_DIFF).map((f, i) => (
        <Button key={`diff-${i + 1}`} label={String(i + 1)} hotkey={String(i + 1)} onPress={() => void pickDiff($, f.path)} />
      ))}
    </Box>
  ) : null

  const node = (f: MapFile, i: number) => {
    const state = shownState(f, at)
    const line3 = summaries === 'off' || !f.summary ? shortDir(f.path) : f.summary
    return (
      <Box key={`node-${i + 1}`} width={NODE_W} flexShrink={0} flexDirection="column" borderStyle="round" borderColor={STATE_COLOR[state]} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              {i < MAX_DIFF ? <Text dimColor>{`${i + 1} `}</Text> : null}
              <Text bold>{names.get(f.path) ?? f.path}</Text>
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={STATE_COLOR[state]}>{' ' + STATE_GLYPH[state]}</Text>
          </Box>
        </Box>
        <Text dimColor wrap="truncate-end">
          {metaOf(f, at, v.scope, numbers) || ' '}
        </Text>
        <Text dimColor={state !== 'failed'} {...(state === 'failed' ? { color: STATE_COLOR.failed } : {})} wrap="truncate-end">
          {state === 'failed' ? 'edit failed' : line3}
        </Text>
      </Box>
    )
  }
  const arrow = (key: string) => (
    <Box key={key} flexShrink={0} marginTop={2}>
      <Text dimColor>{ARROW}</Text>
    </Box>
  )

  // Nodes in edit order, `perRow` to a row; a wrapped row starts with the arrow from the row above.
  const fitsOne = edited.length <= nodesPerRow(cols)
  const perRow = fitsOne ? Math.max(1, edited.length) : Math.max(1, Math.floor(cols / (NODE_W + ARROW.length)))
  const rows: MapFile[][] = []
  for (let i = 0; i < edited.length; i += perRow) rows.push(edited.slice(i, i + perRow))
  const map = (
    <Box key="code-map" flexDirection="column">
      {rows.map((row, r) => (
        <Box key={`code-row-${r}`} flexDirection="row">
          {row.flatMap((f, j) => {
            const i = r * perRow + j
            return [...(i > 0 ? [arrow(`arrow-${i}`)] : []), node(f, i)]
          })}
        </Box>
      ))}
    </Box>
  )

  // Under 60 columns: the edited files as a tree by folder.
  const tree = () => {
    const groups = new Map<string, { f: MapFile; i: number }[]>()
    edited.forEach((f, i) => {
      const dir = shortDir(f.path)
      groups.set(dir, [...(groups.get(dir) ?? []), { f, i }])
    })
    return (
      <Box key="code-tree" flexDirection="column">
        {[...groups.entries()].map(([dir, items]) => (
          <Box key={`tree-${dir}`} flexDirection="column">
            <Text dimColor wrap="truncate-end">
              {dir || '/'}
            </Text>
            {items.map(({ f, i }, k) => {
              const state = shownState(f, at)
              return (
                <Box key={`tree-${i + 1}`}>
                  <Text wrap="truncate-end">
                    <Text dimColor>{`${k === items.length - 1 ? '└' : '├'} ${i < MAX_DIFF ? i + 1 : ' '} `}</Text>
                    <Text color={STATE_COLOR[state]}>{STATE_GLYPH[state] + ' '}</Text>
                    <Text bold>{names.get(f.path) ?? f.path}</Text>
                    <Text dimColor>{countsOf(f) ? ' ' + countsOf(f) : ''}</Text>
                  </Text>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  }

  const also =
    alsoRead.length > 0 ? (
      <Box key="code-also">
        <Text wrap="wrap">
          <Text bold color={CHIP_FG} backgroundColor={ALSO_BG}>
            {' ALSO READ '}
          </Text>
          {alsoRead.map((f, i) => (
            <Text key={`also-${i}`} dimColor>{`  ${names.get(f.path) ?? f.path}`}</Text>
          ))}
        </Text>
      </Box>
    ) : null

  // The subagents that touched these files, with the Who view's numbered buttons (stubs until E3).
  const subIds = new Set(v.files.flatMap(f => f.by).filter(b => b !== 'main'))
  const subs = d.list.filter(a => a.agentId !== undefined && subIds.has(a.agentId) && (numbers.get(a.id) ?? 0) > 0)
  const subRow =
    subs.length > 0 ? (
      <Box key="code-subs" flexDirection="row" flexWrap="wrap" gap={1}>
        <Text dimColor>subagents</Text>
        {subs.map(a => {
          const n = numbers.get(a.id) ?? 0
          const isKeyed = !isArmed && n <= MAX_DIFF
          return (
            <Box key={`sub-${a.id}`} flexDirection="row" gap={1} flexShrink={0}>
              <Button
                key={`sub-num-${a.id}`}
                label={String(n)}
                {...(isKeyed ? { hotkey: String(n) } : {})}
                onPress={() => $.ui.toast(MESSAGES_STUB)}
              />
              <Text>{clip(a.name || a.type, 16)}</Text>
            </Box>
          )
        })}
      </Box>
    ) : null

  return (
    <Box flexDirection="column">
      {header}
      {keys}
      {picks}
      <Box flexDirection="column" marginTop={1}>
        {v.files.length === 0 ? <Text dimColor>No files touched yet.</Text> : null}
        {edited.length > 0 ? (isTree ? tree() : map) : null}
        {also}
        {subRow}
      </Box>
    </Box>
  )
}
