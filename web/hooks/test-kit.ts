// Shared setup for the web mod's tests (imported by *.test.ts files only).
// No command runs for real: herdr and terminal-browser answer from here.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'web'
export const T0 = Date.parse('2026-10-19T12:00:00Z')

export type Msg = { role: 'user' | 'assistant'; text: string }

/** A tab and a browser as `terminal-browser ls --json` prints them. */
export type LsTab = { id: number; active: boolean; title: string; url: string; targetId?: string }
export type LsBrowser = { key: string; pane: { tab: string; pane: string | null }; inCurrentTab: boolean; tabs: LsTab[] }

export const lsJson = (browsers: LsBrowser[]): string => JSON.stringify({ self: { tab: 'w1:t1', pane: 'w1:p1' }, browsers }, null, 2)

export const browser = (key: string, pane: string | null, tabs: LsTab[]): LsBrowser => ({
  key,
  pane: { tab: 'w1:t1', pane },
  inCurrentTab: true,
  tabs,
})

/** A page as the page script would return it. */
export type Page = {
  origin: string
  pathname: string
  title: string
  text: string
  links: { text: string; href: string }[]
  omitted?: string[]
  ready?: string
}

export const PAGE: Page = {
  origin: 'https://docs.example.com',
  pathname: '/guide/intro',
  title: 'Intro - Example Docs',
  text: 'Welcome to the guide.\nIt has two lines.',
  links: [
    { text: 'Next', href: 'https://docs.example.com/guide/next' },
    { text: 'Home', href: 'https://example.com/' },
  ],
}

/** agent-browser's `--json` envelope around the script's JSON string. */
export const evalOut = (p: Page): string =>
  JSON.stringify({
    success: true,
    data: {
      result: JSON.stringify({
        omitted: ['query strings', 'fragments', 'cookies', 'storage', 'form values', 'frames', 'images'],
        ready: 'complete',
        ...p,
      }),
    },
  })

export const SPLIT_OUT = JSON.stringify({ id: 'cli:pane:split', result: { pane: { pane_id: 'w1:p9', tab_id: 'w1:t1' }, type: 'pane_info' } })

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = (stderr = 'mock: no answer') => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false })

export type WorldShape = {
  env?: Record<string, string>
  store?: Record<string, unknown>
  messages?: Msg[]
  /** The browsers ls lists; [] by default. */
  browsers?: LsBrowser[]
  /** What the page script answers (stdout of the eval); PAGE by default. */
  evalStdout?: string
  /** The answer the person picks in the trust dialog; 'dismiss' rejects it. */
  answer?: string
  /** `herdr pane close` fails. */
  isCloseFailing?: boolean
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  runs: string[][]
  inits: unknown[]
  /** Every trust question asked, in order. */
  asked: { question: string; header: string; options: string[] }[]
  /** Every $.tool.register spec that reached the bottom. */
  registered: Record<string, unknown>[]
  setBrowsers: (b: LsBrowser[]) => void
  setEval: (stdout: string) => void
  setAnswer: (a: string) => void
  /** After the next `herdr pane run`, ls lists these browsers (the new pane's browser appearing). */
  afterRun: (b: LsBrowser[]) => void
  /** After the next `action -- open`, ls lists these browsers (the new tab appearing). */
  afterOpen: (b: LsBrowser[]) => void
  /** After the next `action -- eval`, ls lists these browsers (the tab's real address after the read). */
  afterEval: (b: LsBrowser[]) => void
  state: (key: string) => unknown
  start: () => Promise<void>
  command: (args: string) => Promise<string>
  /** Calls the tool as the model would; answers the hook's own `{ result }` or `{ deny }` as the call resolved. */
  read: (input?: Record<string, unknown>) => Promise<{ result?: unknown; deny?: string; text?: string; isError?: boolean }>
}

const isHerdr = (a: string[], verb: string) => a[0] === 'herdr' && a[1] === 'pane' && a[2] === verb

/**
 * The world beneath the plugin: a mocked clock, store, environment and
 * transcript; herdr answering split, run and close; terminal-browser
 * answering `ls --json`, `action -- open` and `action -- eval` from the shape;
 * the trust dialog (an AskUserQuestion tool call) answered with `answer`.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.env ?? {})
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const runs: string[][] = []
  const inits: unknown[] = []
  const asked: World['asked'] = []
  const registered: Record<string, unknown>[] = []
  const latest = new Map<string, unknown>()
  let browsers: LsBrowser[] = shape.browsers ?? []
  let evalStdout = shape.evalStdout ?? evalOut(PAGE)
  let answer = shape.answer ?? 'Allow once'
  let onRun: LsBrowser[] | null = null
  let onOpen: LsBrowser[] | null = null
  let onEval: LsBrowser[] | null = null
  const msgs: Msg[] = shape.messages ?? []

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
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('session.messages', () => ({ value: msgs.map(m => ({ ...m, toolUses: [] })) }) as never)
  on('command.register', async () => ({ value: {} }) as never)
  on('tool.register', async (_$, e) => {
    registered.push(JSON.parse(JSON.stringify(e)) as Record<string, unknown>)
    return { value: { tool: `mcp__web__${(e as { name: string }).name}` } } as never
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as unknown as { questions: { question: string; header: string; options: { label: string }[] }[] }).questions[0]!
    asked.push({ question: q.question, header: q.header, options: q.options.map(o => o.label) })
    if (answer === 'dismiss') return { deny: 'dismissed' } as never
    return { result: { questions: [q], answers: { [q.question]: answer } } } as never
  })
  on('process.run', async (_$, e) => {
    const w = e as { argv: string[]; init?: unknown }
    const a = [...w.argv]
    runs.push(a)
    inits.push(w.init)
    if (isHerdr(a, 'split')) return { value: ok(SPLIT_OUT) } as never
    if (isHerdr(a, 'run')) {
      if (onRun) {
        browsers = onRun
        onRun = null
      }
      return { value: ok('') } as never
    }
    if (isHerdr(a, 'close')) return { value: shape.isCloseFailing ? fail('pane not found') : ok('') } as never
    if (a[0] === 'terminal-browser' && a[1] === 'ls') return { value: ok(lsJson(browsers)) } as never
    if (a[0] === 'terminal-browser' && a[1] === 'action') {
      const cmd = a.slice(a.indexOf('--') + 1)
      if (cmd[0] === 'open') {
        if (onOpen) {
          browsers = onOpen
          onOpen = null
        }
        return { value: ok('{"ok":true}') } as never
      }
      if (cmd[0] === 'eval') {
        if (onEval) {
          browsers = onEval
          onEval = null
        }
        return { value: ok(evalStdout) } as never
      }
    }
    return { value: fail() } as never
  })

  return {
    clock,
    store,
    runs,
    inits,
    asked,
    registered,
    setBrowsers: b => (browsers = b),
    setEval: s => (evalStdout = s),
    setAnswer: s => (answer = s),
    afterRun: b => (onRun = b),
    afterOpen: b => (onOpen = b),
    afterEval: b => (onEval = b),
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    },
    command: async args => ((await $.command.run({ command: 'web', args } as never)) as { text?: string }).text ?? '',
    read: async (input = {}) => {
      const p = $.tool.call({ tool: 'mcp__web__web_read', ...input } as never) as Promise<Record<string, unknown>>
      // Poll sleeps run on the mocked clock.
      let done = false
      void p.finally(() => (done = true)).catch(() => {})
      for (let i = 0; i < 200 && !done; i++) await clock.advance(50)
      return (await p) as { result?: unknown; deny?: string; text?: string; isError?: boolean }
    },
  }
}

export const herdrRuns = (w: World): string[][] => w.runs.filter(a => a[0] === 'herdr')
export const tbRuns = (w: World): string[][] => w.runs.filter(a => a[0] === 'terminal-browser')
export const evalRuns = (w: World): string[][] => tbRuns(w).filter(a => a.includes('eval'))
