// Shared setup for the send-gate mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'send-gate'
export const PANE = 'send-gate'
export const T0 = Date.parse('2026-11-16T12:00:00Z')
export const HOME = '/home/op'
export const CONFIG_PATH = `${HOME}/.claude/send-gate.json`

/** The neutral example config, as examples/send-gate.example.json holds it. */
export const EXAMPLE = JSON.stringify({ gate: ['mcp__deploy__set_env'], pass: [] })

/** How long a dialog nobody answers stays open in these tests. */
export const NEVER_MS = 600_000

export const SLACK_SEND = 'mcp__claude_ai_Slack__slack_send_message'
export const SLACK_DRAFT = 'mcp__claude_ai_Slack__slack_send_message_draft'

export type Origin = 'composer' | 'bridge' | 'plugin' | 'sdk' | 'peer'

export type SendRun = {
  /** Whether the tool beneath ran. */
  isRun: boolean
  deny?: string
  result?: unknown
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  notified: { text: string; title?: string }[]
  /** Every pane opened, as asked. */
  opened: Record<string, unknown>[]
  closed: string[]
  /** Every question the dialog was asked. */
  asked: { question: string; header: string; options: string[] }[]
  /** The MCP calls that reached the tool beneath: the tool name and its arguments. */
  sent: { tool: string; args: Record<string, unknown> }[]
  state: (key: string) => unknown
  start: () => Promise<void>
  /** Raises a tool.call for an MCP tool; resolves when the call settles. */
  call: (tool: string, args?: Record<string, unknown>, extra?: Record<string, unknown>) => Promise<SendRun>
  /** A main-thread prompt (or, with an agent id, a subagent's) carrying this permission mode. */
  prompt: (mode: string, agentId?: string) => Promise<void>
  /** /send-gate <args>, from the composer unless another origin is named. */
  command: (args: string, origin?: Origin) => Promise<string>
  setAnswer: (answer: string) => void
}

export type WorldShape = {
  /** The config file's text; left out or null, there is no file. */
  configText?: string | null
  /** What $.ui.open answers; true when left out. */
  isPlaced?: boolean
  /** What $.ui.open does: throw instead of answering. */
  isOpenBroken?: boolean
  /** The dialog's answer: a label, 'dismiss' to dismiss it, 'never' to leave it open. 'never' when left out. */
  answer?: string
  /** The settings' `permissions` object; 'throw' makes the settings read fail. Left out: no permissions key. */
  permissions?: unknown
  /** While this answers true, every state read of the plugin fails. */
  isStateDown?: () => boolean
  /** What $.tool.list answers; 'throw' makes it fail. */
  tools?: { name: string; description: string; mcp: boolean }[] | 'throw'
  /** Variables of the environment beside HOME (SEND_GATE_MODE, for example). */
  env?: Record<string, string>
  /** While this answers true for a key, every state write of the plugin to that key is refused. */
  isStateWriteDown?: (key: string) => boolean
}

const ok = (stdout = '', exitCode = 0, stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])

/**
 * The world beneath the plugin: a mocked clock, HOME, the config file from
 * `shape.configText`, the settings from `shape.permissions`, a wait (`sleep`)
 * that takes 250 ms of the mocked clock, panes placed or not, the question
 * dialog answered as the shape says, toasts and notifications recorded, and
 * MCP tools that record what reached them.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, { HOME, ...(shape.env ?? {}) })
  const toasts: string[] = []
  const notified: World['notified'] = []
  const opened: Record<string, unknown>[] = []
  const closed: string[] = []
  const asked: World['asked'] = []
  const sent: World['sent'] = []
  const latest = new Map<string, unknown>()
  let answer = shape.answer ?? 'never'

  on('state.get', async (_$, e, next) => {
    const a = e as { plugin?: string }
    // A refusal, not a throw: a test hook that throws is skipped and the kit's own state answers.
    if (a.plugin === PLUGIN && shape.isStateDown?.()) return { deny: 'state is down' } as never
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key !== undefined && shape.isStateWriteDown?.(w.key)) return { deny: 'state write is down' } as never
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('fs.exists', (_$, e) => ({ value: (e as { path: string }).path === CONFIG_PATH && shape.configText != null }) as never)
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    return (path === CONFIG_PATH && shape.configText != null ? { value: shape.configText } : { deny: 'ENOENT' }) as never
  })
  on('settings.read', async () => {
    if (shape.permissions === 'throw') return { deny: 'settings are down' } as never
    return { value: shape.permissions === undefined ? {} : { permissions: shape.permissions } } as never
  })
  on('tool.list', async () => {
    if (shape.tools === 'throw') return { deny: 'no list' } as never
    return { value: shape.tools ?? [] } as never
  })
  on('process.run', async (_$, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    if (argv[0] === 'sleep') {
      await clock.sleep(250)
      return { value: ok() } as never
    }
    return { value: ok('', 1, 'not in this test') } as never
  })
  on('ui.open', (_$, e) => {
    opened.push(JSON.parse(JSON.stringify(e)) as Record<string, unknown>)
    if (shape.isOpenBroken) throw new Error('open is broken')
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
  on('classic.UserPromptSubmit', async () => ({}) as never)
  on('classic.PostToolUse', async () => ({}) as never)
  on('classic.Stop', async () => ({}) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as unknown as { questions: { question: string; header: string; options: { label: string }[] }[] }).questions[0]!
    asked.push({ question: q.question, header: q.header, options: q.options.map(o => o.label) })
    if (answer === 'never') await clock.sleep(NEVER_MS)
    if (answer === 'dismiss' || answer === 'never') return { deny: 'dismissed' } as never
    return { result: { questions: [q], answers: { [q.question]: answer } } } as never
  })
  on('tool.call', { tool: /^mcp__/ }, async (_$, e) => {
    const all = e as unknown as Record<string, unknown>
    const args: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(all)) if (!RESERVED.has(k)) args[k] = v
    sent.push({ tool: String(all.tool), args })
    return { result: { ok: true }, text: 'ok' } as never
  })

  return {
    clock,
    toasts,
    notified,
    opened,
    closed,
    asked,
    sent,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
      await clock.advance(20)
    },
    call: async (tool, args = {}, extra = {}) => {
      const before = sent.length
      const out = (await $.tool.call({ tool, ...args, ...extra } as never)) as { deny?: string; result?: unknown }
      return { isRun: sent.length > before, ...(out.deny !== undefined ? { deny: out.deny } : {}), ...(out.result !== undefined ? { result: out.result } : {}) }
    },
    prompt: async (mode, agentId) => {
      await $.classic.UserPromptSubmit({ permission_mode: mode, prompt: 'hi', ...(agentId !== undefined ? { agent_id: agentId } : {}) } as never)
    },
    command: async (args, origin = 'composer') => {
      const from = origin === 'plugin' ? { kind: 'plugin', name: 'other' } : { kind: origin }
      return ((await $.command.run({ command: 'send-gate', args, origin: from } as never)) as { text?: string }).text ?? ''
    },
    setAnswer: a => {
      answer = a
    },
  }
}

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns = 100) =>
  ({ title: 'Send Gate', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as never

export const mountCard = ($: Engine, cols = 100, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: paneProps(cols) })

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
