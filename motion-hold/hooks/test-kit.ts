// Shared setup for the motion-hold mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'motion-hold'
export const PANE = 'motion-hold'
export const ROW_KEY = 'zm-01-motion'
export const T0 = Date.parse('2026-11-16T12:00:00Z')
export const HOME = '/home/op'
export const CONFIG_PATH = `${HOME}/.claude/motion-hold.json`

/** The neutral example config, as examples/motion-hold.example.json holds it. */
export const EXAMPLE = JSON.stringify({
  hosts: ['rig-1.local', '10.0.0.*'],
  hold: ['\\bctl\\s+(move|jog|home|drive)\\b', '\\bbench/[\\w-]+\\.sh\\b'],
  stop: ['\\bctl\\s+stop\\b'],
  stopCommand: ['ssh', '{host}', 'ctl stop all'],
})
/** The same without a stop command. */
export const NO_STOP = JSON.stringify({
  hosts: ['rig-1.local', '10.0.0.*'],
  hold: ['\\bctl\\s+(move|jog|home|drive)\\b'],
  stop: ['\\bctl\\s+stop\\b'],
})

/** How long a dialog nobody answers stays open before the kit dismisses it; a test that leaves one open advances past it. */
export const NEVER_MS = 600_000

export type Origin = 'composer' | 'bridge' | 'plugin' | 'sdk' | 'peer'

export type BashRun = {
  /** Whether the tool beneath ran. */
  isRun: boolean
  deny?: string
  result?: unknown
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  /** Every $.ui.notify: its text and title. */
  notified: { text: string; title?: string }[]
  /** Every pane opened, as asked. */
  opened: Record<string, unknown>[]
  closed: string[]
  /** Every question the dialog was asked. */
  asked: { question: string; header: string; options: string[] }[]
  /** Every process run that is not a wait: its argv. */
  runs: string[][]
  /** The commands that reached the tool beneath, in order (Bash and Monitor alike). */
  ran: string[]
  /** The Monitor calls that reached the tool beneath, as they arrived. */
  watched: Record<string, unknown>[]
  /** Every path read from the file system. */
  reads: string[]
  state: (key: string) => unknown
  start: () => Promise<void>
  end: (reason: string) => Promise<void>
  /** Raises a tool.call for Bash; resolves when the call settles. */
  bash: (command: string, extra?: Record<string, unknown>) => Promise<BashRun>
  /** Raises a tool.call for Monitor with these arguments (a description and a time limit are filled in); resolves when the call settles. */
  monitor: (input: Record<string, unknown>) => Promise<BashRun>
  /** /motion <args>, from the composer unless another origin is named. */
  command: (args: string, origin?: Origin) => Promise<string>
  /** The tool beneath waits until the function this returns is called. */
  hang: () => () => void
  setConfig: (text: string | null) => void
  setAnswer: (answer: string) => void
}

export type WorldShape = {
  /** The config file's text; left out or null, there is no file. */
  configText?: string | null
  /** What $.ui.open answers; true when left out. */
  isPlaced?: boolean
  /** The dialog's answer: a label, 'dismiss' to dismiss it, 'never' to leave it open. 'never' when left out. */
  answer?: string
  /** While this answers true, every state read of the plugin throws. */
  isStateDown?: () => boolean
  /** While this answers true, the config file cannot be read. */
  isFsDown?: () => boolean
  /** HOME is unset. */
  isHomeless?: boolean
  /** What a stop command exits with; 'reject' when it cannot start. */
  stop?: { exitCode: number; stderr: string } | 'reject'
}

const ok = (stdout = '', exitCode = 0, stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

/**
 * The world beneath the plugin: a mocked clock, HOME, the config file from
 * `shape.configText`, a wait (`sleep`) that takes 250 ms of the mocked clock,
 * every other process recorded, panes placed or not, the question dialog
 * answered as the shape says, toasts and notifications recorded, and a Bash
 * tool that records what reached it.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.isHomeless ? {} : { HOME })
  const toasts: string[] = []
  const notified: World['notified'] = []
  const opened: Record<string, unknown>[] = []
  const closed: string[] = []
  const asked: World['asked'] = []
  const runs: string[][] = []
  const ran: string[] = []
  const watched: Record<string, unknown>[] = []
  const reads: string[] = []
  const latest = new Map<string, unknown>()
  let configText: string | null = shape.configText ?? null
  let answer = shape.answer ?? 'never'
  let latch: Promise<void> | null = null

  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string }
    // A refusal, not a throw: a test hook that throws is skipped and the kit's own state answers.
    if (a.plugin === PLUGIN && shape.isStateDown?.()) return { deny: 'state is down' } as never
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('fs.exists', (_$, e) => {
    if (shape.isFsDown?.()) throw new Error('fs is down')
    return { value: (e as { path: string }).path === CONFIG_PATH && configText !== null } as never
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    reads.push(path)
    if (shape.isFsDown?.()) throw new Error('fs is down')
    return (path === CONFIG_PATH && configText !== null ? { value: configText } : { deny: 'ENOENT' }) as never
  })
  on('process.run', async (_$, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    if (argv[0] === 'sleep') {
      await clock.sleep(250)
      return { value: ok() } as never
    }
    if (argv[0] === 'test-interrupt') {
      // The hook above a held call (INTERRUPTER in the tests) waits here before it settles.
      await clock.sleep(1_000)
      return { value: ok() } as never
    }
    runs.push(argv)
    if (shape.stop === 'reject') throw new Error('spawn ENOENT')
    return { value: ok('', shape.stop?.exitCode ?? 0, shape.stop?.stderr ?? '') } as never
  })
  on('ui.open', (_$, e) => {
    opened.push(JSON.parse(JSON.stringify(e)) as Record<string, unknown>)
    return { value: shape.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    closed.push((e as { id: string }).id)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.notify', (_$, e) => {
    const n = e as { text: string; title?: string; options?: { title?: string } }
    const title = n.title ?? n.options?.title
    notified.push({ text: n.text, ...(title !== undefined ? { title } : {}) })
    return { value: { isSent: true, channel: 'terminal' } } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as unknown as { questions: { question: string; header: string; options: { label: string }[] }[] }).questions[0]!
    asked.push({ question: q.question, header: q.header, options: q.options.map(o => o.label) })
    if (answer === 'never') await clock.sleep(NEVER_MS)
    if (answer === 'dismiss' || answer === 'never') return { deny: 'dismissed' } as never
    return { result: { questions: [q], answers: { [q.question]: answer } } } as never
  })
  on('tool.call', { tool: 'Bash' }, async (_$, e) => {
    ran.push(String((e as { command?: unknown }).command))
    if (latch) await latch
    return { result: { stdout: 'ok', stderr: '', interrupted: false } } as never
  })
  on('tool.call', { tool: 'Monitor' }, async (_$, e) => {
    const input = e as unknown as Record<string, unknown>
    watched.push(JSON.parse(JSON.stringify(input)) as Record<string, unknown>)
    if (typeof input.command === 'string') ran.push(input.command)
    if (latch) await latch
    return { result: { taskId: 'watch-1' } } as never
  })

  return {
    clock,
    toasts,
    notified,
    opened,
    closed,
    asked,
    runs,
    ran,
    watched,
    reads,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
      await clock.advance(20)
    },
    end: async reason => {
      await $.session.end({ reason, sessionId: 's1', resume: {} } as never)
      await clock.advance(20)
    },
    bash: async (command, extra = {}) => {
      const before = ran.length
      const out = (await $.tool.call({ tool: 'Bash', command, ...extra } as never)) as { deny?: string; result?: unknown }
      return { isRun: ran.length > before, ...(out.deny !== undefined ? { deny: out.deny } : {}), ...(out.result !== undefined ? { result: out.result } : {}) }
    },
    monitor: async input => {
      const before = watched.length
      const out = (await $.tool.call({ tool: 'Monitor', description: 'watch', timeout_ms: 300_000, ...input } as never)) as { deny?: string; result?: unknown }
      return { isRun: watched.length > before, ...(out.deny !== undefined ? { deny: out.deny } : {}), ...(out.result !== undefined ? { result: out.result } : {}) }
    },
    command: async (args, origin = 'composer') => {
      const from = origin === 'plugin' ? { kind: 'plugin', name: 'other' } : { kind: origin }
      return ((await $.command.run({ command: 'motion', args, origin: from } as never)) as { text?: string }).text ?? ''
    },
    hang: () => {
      let release: () => void = () => {}
      latch = new Promise<void>(resolve => {
        release = resolve
      })
      return () => {
        latch = null
        release()
      }
    },
    setConfig: text => {
      configText = text
    },
    setAnswer: a => {
      answer = a
    },
  }
}

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 100) =>
  ({ title: 'Motion Hold', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

export const mountCard = ($: Engine, cols = 100, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(cols) })

/** The whole shown text of the STOP row; '' when the row is not drawn. */
export async function rowText($: Engine, cols = 160): Promise<string> {
  const ui = await mountRow($, cols)
  const row = await ui.find({ key: ROW_KEY })
  await ui.unmount()
  return row?.text ?? ''
}

/** The whole shown text of the card pane. */
export async function cardText($: Engine): Promise<string> {
  const ui = await mountCard($)
  const all = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return all.map(t => t.text).join('\n')
}

/** Presses a button of the card, as the person does. */
export async function pressCard($: Engine, key: 'hold-run' | 'hold-cancel'): Promise<void> {
  const ui = await mountCard($)
  await ui.press({ key })
  await ui.unmount()
}
