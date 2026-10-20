// Shared setup for the peers mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PeerStatus } from '../types'

export const PLUGIN = 'peers'
export const T0 = Date.parse('2026-10-19T12:00:00Z')

/** This pane, in workspace w1. */
export const HERDR = { HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p2' }
/** HERDR with a home folder, for the board's result files. */
export const HERDR_HOME = { ...HERDR, HOME: '/Users/me' }
/** Where a request's result file lives under HERDR_HOME. */
export const resultFile = (req: string): string => `/Users/me/.local/state/herdr-orch/${req}/result.md`

/** One agent row in the shape `herdr agent list` prints (fields this mod reads, plus a few it ignores). */
export type Agent = { pane: string; status: PeerStatus; title?: string; workspace?: string; agent?: string }

/** `herdr agent list`'s stdout for these agents. */
export function agentList(agents: readonly Agent[]): string {
  return JSON.stringify({
    id: 'cli:agent:list',
    result: {
      agents: agents.map(a => ({
        agent: a.agent ?? 'claude',
        agent_status: a.status,
        cwd: '/repo',
        focused: false,
        pane_id: a.pane,
        tab_id: 'w1:t1',
        terminal_title: `✳ ${a.title ?? ''}`,
        terminal_title_stripped: a.title ?? '',
        workspace_id: a.workspace ?? a.pane.split(':')[0],
      })),
    },
  })
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  /** The asset of every $.audio.play call, in order. */
  plays: string[]
  /** Every argv $.process.run was called with, in order. */
  runs: string[][]
  /** The init of every call, in order. */
  inits: unknown[]
  /** What `herdr agent list` answers from now on; null makes it fail. */
  setAgents: (agents: readonly Agent[] | null) => void
  state: (key: string) => unknown
  /** Starts an interactive terminal session (or the given one) and lets the first (baseline) poll run. */
  start: (input?: { surface: string | null; isInteractive: boolean }) => Promise<void>
  /** Advances to the next 30 s poll. */
  nextPoll: () => Promise<void>
  command: (args: string) => Promise<string>
  /** The ids of the panes $.ui.open opened, in order. */
  opened: string[]
  /** The ids of the panes $.ui.close closed, in order. */
  closed: string[]
  /** Files $.fs.stat and $.fs.read answer from, by absolute path; any other path is missing. */
  files: Map<string, string>
  /** Submits a prompt as typed at the composer; resolves once it entered. */
  submit: (text: string) => Promise<void>
}

export type WorldShape = {
  store?: Record<string, unknown>
  env?: Record<string, string>
  agents?: readonly Agent[]
  /** What $.session.surfaces() answers; the terminal by default ([] is a headless -p run). */
  surfaces?: string[]
  /** `herdr agent list` answers this many ms late (on the mocked clock); at once by default. */
  herdrDelayMs?: number
}

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = () => ({ exitCode: 1, stdout: '', stderr: 'mock: no answer', isStdoutTruncated: false, isStderrTruncated: false })

/**
 * The world beneath the plugin: a mocked clock, store and environment, herdr
 * that answers `agent list` from `setAgents`, toasts and clips recorded. No
 * command runs and no sound plays for real.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.env ?? {})
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const toasts: string[] = []
  const plays: string[] = []
  const runs: string[][] = []
  const inits: unknown[] = []
  const latest = new Map<string, unknown>()
  let agents: readonly Agent[] | null = shape.agents ?? []

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key) latest.set(w.key, w.value)
    return next(e)
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('audio.play', (_$, e) => {
    const clip = (e as { clip: { asset?: string } }).clip
    plays.push(clip.asset ?? '?')
    return { value: undefined } as never
  })
  on('process.run', async (_$, e) => {
    const w = e as { argv: string[]; init?: unknown }
    runs.push([...w.argv])
    inits.push(w.init)
    if (w.argv.join(' ') === 'herdr agent list' && shape.herdrDelayMs) await clock.sleep(shape.herdrDelayMs)
    if (w.argv.join(' ') === 'herdr agent list') return { value: agents === null ? fail() : ok(agentList(agents)) } as never
    return { value: fail() } as never
  })
  // The panes open now, as $.ui.panes() answers.
  const panes = new Set<string>()
  const opened: string[] = []
  const closed: string[] = []
  on('ui.open', (_$, e) => {
    const id = (e as { id: string }).id
    opened.push(id)
    panes.add(id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [...panes].map(id => ({ id, title: id })) }) as never)
  on('ui.close', (_$, e) => {
    const id = (e as { id: string }).id
    closed.push(id)
    panes.delete(id)
    return { value: undefined } as never
  })
  const files = new Map<string, string>()
  on('fs.stat', (_$, e) => {
    const path = (e as { path: string }).path
    const text = files.get(path)
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false } } as never
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    const text = files.get(path)
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: text } as never
  })
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('command.register', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.surfaces', async () => ({ value: shape.surfaces ?? ['terminal'] }) as never)

  return {
    clock,
    store,
    toasts,
    plays,
    runs,
    inits,
    setAgents: a => (agents = a),
    state: key => latest.get(key),
    start: async (input = { surface: 'terminal', isInteractive: true }) => {
      await $.session.start({ cwd: '/repo', ...input } as never)
      // The first (baseline) poll comes from a 10 ms timer.
      await clock.advance(10)
    },
    nextPoll: async () => {
      await clock.advance(30_000)
    },
    command: async args => ((await $.command.run({ command: 'peer-alarm', args } as never)) as { text?: string }).text ?? '',
    opened,
    closed,
    files,
    submit: async text => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
    },
  }
}

/** The `herdr agent list` calls among the runs. */
export const listRuns = (w: World): number => w.runs.filter(a => a.join(' ') === 'herdr agent list').length

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 100) =>
  ({ title: '', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as never

/** The header of a HERDR-ORCH envelope (POLICY.md section 2). */
export const envelope = (req: string, from: string, type: string): string => `[HERDR-ORCH v0] req=${req} from=${from} type=${type}`
