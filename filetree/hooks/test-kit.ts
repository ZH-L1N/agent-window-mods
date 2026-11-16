// Shared setup for the filetree mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'filetree'
export const PANE = 'filetree'
export const ROOT = '/repo'
export const T0 = Date.parse('2026-11-16T12:00:00Z')

type Kind = 'file' | 'dir' | 'other'

export type Git =
  /** `git status --porcelain` exits 0 with this text. */
  | { stdout: string; exitCode?: number }
  /** The run rejects (git missing, the timeout). */
  | 'throw'

export type WorldShape = {
  /** Each folder's entries by absolute path; a folder not here fails to list. */
  dirs?: Record<string, [string, Kind][]>
  git?: Git
  /** The folders holding a `.git` (default: the root). */
  gitTops?: string[]
  /** The working folder `$.session.cwd()` answers (default ROOT). */
  cwd?: string
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  /** Every `$.fs.list` path, in order. */
  lists: string[]
  /** Every `$.process.run` argv and its init. */
  runs: { argv: string[]; init: unknown }[]
  opened: { id: string; title?: string; focus?: unknown }[]
  closed: string[]
  toasts: string[]
  state: (key: string) => unknown
  setGit: (git: Git) => void
  setDir: (path: string, entries: [string, Kind][]) => void
  start: () => Promise<void>
  /** A turn starting (main loop unless `agentId`). */
  turn: (text?: string, agentId?: string) => Promise<void>
  /** The turn ending (main loop unless `agentId`). */
  complete: (agentId?: string) => Promise<void>
  /** A tool call reaching the bottom; `deny` refuses it there, `isError` fails it. */
  tool: (tool: string, input: Record<string, unknown>, how?: { deny?: string; isError?: boolean; agentId?: string }) => Promise<void>
  command: (args: string) => Promise<string>
}

/**
 * The world beneath the plugin: a mocked clock, folders to list, a git that
 * answers as told, panes recorded as opened and closed, and the tools
 * answering every call.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  const cwd = shape.cwd ?? ROOT
  const dirs = new Map<string, [string, Kind][]>(Object.entries(shape.dirs ?? {}))
  const tops = new Set(shape.gitTops ?? [ROOT])
  let git: Git = shape.git ?? { stdout: '' }
  const lists: string[] = []
  const runs: { argv: string[]; init: unknown }[] = []
  const opened: { id: string; title?: string; focus?: unknown }[] = []
  const closed: string[] = []
  const toasts: string[] = []
  const open = new Set<string>()
  const latest = new Map<string, unknown>()

  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    const w = e as { id: string; title?: string; focus?: unknown }
    opened.push({ id: w.id, ...(w.title !== undefined ? { title: w.title } : {}), ...(w.focus !== undefined ? { focus: w.focus } : {}) })
    open.add(w.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    const id = (e as { id: string }).id
    closed.push(id)
    open.delete(id)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { children: string }) => never }
    return Text({ children: 'beneath' })
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('session.cwd', () => ({ value: cwd }) as never)
  on('session.start', async () => ({ cwd }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('fs.list', (_$, e) => {
    const path = (e as { path: string }).path
    lists.push(path)
    const entries = dirs.get(path)
    if (!entries) return { deny: 'ENOENT' } as never
    return { value: entries.map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: kind === 'other' })) } as never
  })
  on('fs.exists', (_$, e) => {
    const path = (e as { path: string }).path
    return { value: path.endsWith('/.git') && tops.has(path.slice(0, -'/.git'.length) || '/') } as never
  })
  on('process.run', (_$, e) => {
    const w = e as { argv: string[]; init?: unknown }
    runs.push({ argv: [...w.argv], init: w.init })
    if (git === 'throw') return { deny: 'git: command not found' } as never
    return { value: { exitCode: git.exitCode ?? 0, stdout: git.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('tool.call', async (_$, e) => {
    const c = e as Record<string, unknown> & { tool: string }
    if (typeof c.deny === 'string') return { deny: c.deny } as never
    if (c.isError === true) return { isError: true, result: 'failed' } as never
    switch (c.tool) {
      case 'Read':
        return { result: { type: 'text', file: { filePath: c.file_path, content: '', numLines: 0, startLine: 1, totalLines: 0 } } } as never
      case 'Edit':
      case 'Write':
        return { result: { filePath: c.file_path, originalFile: '', structuredPatch: [] } } as never
      default:
        return { result: 'ok' } as never
    }
  })

  let turns = 0
  return {
    clock,
    lists,
    runs,
    opened,
    closed,
    toasts,
    state: key => latest.get(key),
    setGit: g => {
      git = g
    },
    setDir: (path, entries) => {
      dirs.set(path, entries)
    },
    start: async () => {
      await $.session.start({ cwd, surface: 'terminal', isInteractive: true } as never)
    },
    turn: async (text = 'go', agentId) => {
      await $.turn.start({ text, turnId: `t${++turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
    },
    complete: async agentId => {
      await $.turn.complete({
        answer: 'ok',
        durationMs: 1_000,
        isAborted: false,
        turnId: `t${turns}`,
        reason: 'answer',
        ...(agentId !== undefined ? { agentId } : {}),
      } as never)
    },
    tool: async (tool, input, how = {}) => {
      await $.tool.call({
        tool,
        ...input,
        ...(how.deny !== undefined ? { deny: how.deny } : {}),
        ...(how.isError ? { isError: true } : {}),
        ...(how.agentId !== undefined ? { agentId: how.agentId } : {}),
      } as never)
    },
    command: async args => ((await $.command.run({ command: 'tree', args } as never)) as { text?: string }).text ?? '',
  }
}

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 80) =>
  ({ title: 'Files', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} }) as never

export const mountPane = ($: Engine, cols = 80, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(cols) })

/** Every Text's shown words, in document order. */
export async function paneLines($: Engine, cols = 80): Promise<string[]> {
  const ui = await mountPane($, cols)
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return lines
}
