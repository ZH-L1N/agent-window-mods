// Shared setup for the agents mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRun } from '../types'

export const PLUGIN = 'agents'
export const T0 = Date.parse('2026-10-19T12:00:00Z')

export type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const usage = (model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

const MODEL_ID: Record<string, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-1',
}

/** How a background shell's notification says it ended. */
export type ShellEnd = { status: 'completed' | 'failed' | 'killed'; exitCode?: number; door?: string }

/** Where the fake background Bash results say a shell writes its output. */
export const outputFileFor = (taskId: string): string => `/tmp/claude-test/tasks/${taskId}.output`

export type World = {
  clock: ReturnType<typeof mock.clock>
  opened: string[]
  /** The ids of the panes `$.ui.close` closed, in order. */
  closed: string[]
  nowWrites: unknown[]
  /** Every toast's text, in order. */
  toasts: string[]
  /** The files `$.fs.read` and `$.fs.stat` answer from, by path; set one to change it. */
  files: Map<string, string>
  /** Where a path lands when it is a symbolic link (`$.fs.stat` with `resolve`), by path. */
  links: Map<string, string>
  /** A Bash call: backgrounded as task `taskId` unless `isForeground`; a foreground one exits 1 (`isError`) with `isError`. */
  bash: (command: string, taskId?: string, opts?: { isForeground?: boolean; agentId?: string; endsWithParent?: boolean; isError?: boolean }) => Promise<unknown>
  /** The engine appends a background task's notification row. */
  notify: (taskId: string, end: ShellEnd) => Promise<void>
  spawn: (description: string, subagentType?: string, model?: string, toolUseId?: string) => Promise<unknown>
  step: (agentId: string, u: Usage | null, toolUses?: number) => Promise<void>
  finish: (agentId: string, reason?: 'answer' | 'error' | 'aborted') => Promise<void>
  mainTurn: (isStart: boolean) => Promise<void>
  skill: (name: string) => Promise<void>
  runs: () => Promise<AgentRun[]>
  state: (key: string) => unknown
  /** Every `$.process.spawn` argv, in order (nothing runs: the children are fakes). */
  spawns: string[][]
  /** The fake children still running. */
  live: () => number
  /** Ends every fake child as if it exited on its own (caffeinate's -t ran out). */
  exitChildren: () => void
  /** Every `$.process.run` argv and its cwd, in order (nothing runs). */
  procRuns: { argv: string[]; cwd?: string }[]
  /** What the fake `git diff --numstat -- <file>` prints, by file; absent: nothing. */
  numstat: Map<string, string>
  /** Folders the fake `git rev-parse` says are outside a work tree. */
  notRepo: Set<string>
  /** The asset of every $.audio.play call, in order. */
  plays: string[]
  /** Every other plugin command $.command.run ran (`diff`), with its args. */
  commands: { command: string; args: string }[]
  /** A file tool's call (Read, Edit, Write, NotebookEdit…), answered ok, or as an error with `isError`. */
  tool: (tool: string, input: Record<string, unknown>, opts?: { isError?: boolean; agentId?: string; result?: unknown }) => Promise<unknown>
  /** A Monitor call: started as task `taskId`. */
  monitor: (description: string, command: string, taskId: string, opts?: { timeoutMs?: number; persistent?: boolean }) => Promise<unknown>
  /** A Monitor event notification (no status). */
  event: (taskId: string, text: string) => Promise<void>
  /** A CronCreate call answered with job `job`. */
  cronCreate: (cron: string, prompt: string, job: string, opts?: { recurring?: boolean; nextFireAt?: number }) => Promise<unknown>
  /** A CronDelete call. */
  cronDelete: (job: string) => Promise<unknown>
  /** A scheduled prompt fires (the row the engine appends). */
  cronFire: (prompt: string) => Promise<void>
  /** What the fake `herdr agent list` answers from now on; null makes it fail. */
  setAgents: (agents: readonly HerdrAgent[] | null) => void
  /** How many times `herdr agent list` ran (as a fake). */
  herdrRuns: () => number
  /** Submits a prompt as typed at the composer; resolves once it entered. */
  submit: (text: string) => Promise<void>
}

/** How the world beneath differs for one test. */
export type WorldShape = {
  /** Beneath the band, the engine's own placeholder instead of another mod's Text. */
  isEngineBeneath?: boolean
  /**
   * Beneath the band, a column of zehui-mods rows keyed as listed (each a Box
   * holding a Text of its key), then another mod's band (a Box keyed `other-band` holding a Text `beneath`).
   */
  stackBeneath?: string[]
  /** Spawns answer no agentId (a workflow's remote agent). */
  isSpawnUnlinked?: boolean
  /** Every state write of the plugin throws. */
  isStateDown?: boolean
  /** The agents pane is open (as `$.ui.panes()` answers). */
  isPaneOpen?: boolean
  /**
   * Spawned fake children run until stopped or `exitChildren` (as caffeinate
   * does); otherwise each exits at once. A child held open slows the test
   * clock's every step, so only the caffeinate tests hold theirs.
   */
  isChildHeld?: boolean
  /** The environment `$.env.get` answers from (nothing is set by default, so no test is in herdr). */
  env?: Record<string, string>
  /** What the fake `herdr agent list` answers; an empty workspace by default. */
  agents?: readonly HerdrAgent[]
  /**
   * The panes `$.ui.panes()` answers follow `$.ui.open` and `$.ui.close`
   * (instead of `isPaneOpen`'s fixed answer).
   */
  isPaneTracked?: boolean
}

/** This pane, w1:p2 in workspace w1, with a home folder for the result files. */
export const HERDR = { HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p2', HOME: '/Users/me' }
/** Where a request's result file lives under HERDR's home. */
export const resultFile = (req: string): string => `/Users/me/.local/state/herdr-orch/${req}/result.md`

/** One agent row as `herdr agent list` prints it (the fields the Peers view reads). */
export type HerdrAgent = { pane: string; status: 'idle' | 'working' | 'blocked' | 'done' | 'unknown'; title?: string; workspace?: string; agent?: string }

/** `herdr agent list`'s stdout for these agents. */
export function agentList(agents: readonly HerdrAgent[]): string {
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
        terminal_title: `* ${a.title ?? ''}`,
        terminal_title_stripped: a.title ?? '',
        workspace_id: a.workspace ?? a.pane.split(':')[0],
      })),
    },
  })
}

/** The header of a HERDR-ORCH envelope (POLICY.md section 2). */
export const envelope = (req: string, from: string, type: string): string => `[HERDR-ORCH v0] req=${req} from=${from} type=${type}`

/**
 * The world beneath the plugin: a mocked clock, panes that open, spawns that
 * answer `a1`, `a2`, ..., steps that answer what the test hands them, and a
 * band of another mod beneath (a Text `beneath`). With `isStarted` the
 * session starts, so the ticks run and the command registers.
 */
export async function world(
  $: Engine,
  on: On,
  isStarted = false,
  settings: Record<string, unknown> = {},
  shape: WorldShape = {},
): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.env ?? {})
  const opened: string[] = []
  const panes = new Set<string>()
  const nowWrites: unknown[] = []
  // A test's $ has no state noun: the last value written under each key, as the writes pass beneath.
  const latest = new Map<string, unknown>()
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (shape.isStateDown && w.plugin === PLUGIN) throw new Error('state is down')
    if (w.plugin === PLUGIN && w.key) latest.set(w.key, w.value)
    if (w.key === 'now') nowWrites.push(w.value)
    return next(e)
  })
  on('ui.open', (_$, e) => {
    opened.push((e as { id: string }).id)
    panes.add((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () =>
    ({
      value: shape.isPaneTracked ? [...panes].map(id => ({ id, title: id })) : shape.isPaneOpen ? [{ id: PLUGIN, title: 'Agents' }] : [],
    }) as never,
  )
  const closed: string[] = []
  on('ui.close', (_$, e) => {
    closed.push((e as { id: string }).id)
    panes.delete((e as { id: string }).id)
    return { value: undefined } as never
  })
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  const files = new Map<string, string>()
  // A file's mtime: a hash of its text, so any change moves it.
  const mtimeOf = (text: string): number => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
  const links = new Map<string, string>()
  on('fs.stat', (_$, e) => {
    const { path, resolve } = e as { path: string; resolve?: boolean }
    const real = resolve ? { realPath: links.get(path) ?? path } : {}
    const isLink = links.has(path)
    const text = files.get(path)
    // A folder: any file below it.
    if (text === undefined && [...files.keys()].some(f => f.startsWith(path + '/'))) {
      return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink, ...real } } as never
    }
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: { kind: 'file', size: text.length, mtimeMs: mtimeOf(text), isLink, ...real } } as never
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    const text = files.get(path)
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: text } as never
  })
  // Bash: a background call answers its task id and output file, as the engine's text says them.
  let nextBash = { id: 'b1', endsWithParent: false }
  on('tool.call', { tool: 'Bash' }, async (_$, e) => {
    const call = e as { tool: string; run_in_background?: boolean; fail?: boolean }
    if (call.fail) return { result: 'Exit code 1', text: 'Exit code 1', isError: true } as never
    if (!call.run_in_background) return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
    const { id, endsWithParent } = nextBash
    return {
      result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id, ...(endsWithParent ? { backgroundEndsWithFinalResponse: true } : {}) },
      text: `Command running in background with ID: ${id}. Output is being written to: ${outputFileFor(id)}. You will be notified when it completes.`,
    } as never
  })
  on('ui.render', async ($$, e) => {
    if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
    if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  // Processes: never run for real in a test. spawn's children wait until stopped or exited.
  const spawns: string[][] = []
  let live = 0
  const exits: (() => void)[] = []
  on('process.spawn', async function* (_$, e, next) {
    spawns.push([...(e as { argv: readonly string[] }).argv])
    if (!shape.isChildHeld) return { value: { code: 0, signal: null } } as never
    live++
    try {
      await new Promise<void>(resolve => {
        exits.push(resolve)
        if (next.signal.aborted) resolve()
        next.signal.addEventListener('abort', () => resolve())
      })
    } finally {
      live--
    }
    // A stand-in for a call on $ answers { value }: the child's end.
    return { value: { code: 0, signal: null } } as never
  })
  const procRuns: { argv: string[]; cwd?: string }[] = []
  const numstat = new Map<string, string>()
  const notRepo = new Set<string>()
  let agents: readonly HerdrAgent[] | null = shape.agents ?? []
  on('process.run', (_$, e) => {
    const { argv, init } = e as unknown as { argv: readonly string[]; init?: { cwd?: string } }
    procRuns.push({ argv: [...argv], ...(init?.cwd ? { cwd: init.cwd } : {}) })
    const ok = (stdout: string, exitCode = 0) =>
      ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never
    if (argv[0] === 'git' && argv[1] === 'rev-parse') return notRepo.has(init?.cwd ?? '') ? ok('', 128) : ok('true\n')
    if (argv[0] === 'git' && argv[1] === 'diff') return ok(numstat.get(argv[argv.length - 1] ?? '') ?? '')
    if (argv.join(' ') === 'herdr agent list') return agents === null ? ok('', 1) : ok(agentList(agents))
    return ok('', 1)
  })
  const plays: string[] = []
  on('audio.play', (_$, e) => {
    plays.push((e as { clip: { asset?: string } }).clip.asset ?? '?')
    return { value: undefined } as never
  })
  const commands: { command: string; args: string }[] = []
  on('command.run', (_$, e) => {
    const c = e as { command: string; args: string }
    commands.push({ command: c.command, args: c.args })
    return { text: '' } as never
  })
  // Monitor, CronCreate, CronDelete and the file tools answer as the engine does.
  on('tool.call', { tool: 'Monitor' }, (_$, e) => {
    const call = e as unknown as { timeout_ms?: number; persistent?: boolean; taskId?: string }
    return { result: { taskId: call.taskId ?? 'm1', timeoutMs: call.timeout_ms ?? 300_000, ...(call.persistent ? { persistent: true } : {}) }, text: 'Monitor started' } as never
  })
  on('tool.call', { tool: 'CronCreate' }, (_$, e) => {
    const call = e as unknown as { cron: string; recurring?: boolean; job?: string; nextFireAt?: number }
    return {
      result: { id: call.job ?? 'c1', humanSchedule: call.cron, recurring: call.recurring !== false, ...(call.nextFireAt ? { nextFireAt: call.nextFireAt } : {}) },
      text: 'Scheduled',
    } as never
  })
  on('tool.call', { tool: 'CronDelete' }, (_$, e) => ({ result: { id: (e as unknown as { id: string }).id }, text: 'Cancelled' }) as never)
  on('tool.call', { tool: /^(?:Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob)$/ }, (_$, e) => {
    const call = e as unknown as { fail?: boolean; answer?: unknown }
    if (call.fail) return { result: 'String to replace not found', text: 'String to replace not found', isError: true } as never
    return { result: call.answer ?? { ok: true }, text: 'ok' } as never
  })
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  on('settings.read', async () => ({ value: settings }) as never)
  let n = 0
  on('agent.spawn', async (_$, e) => {
    const model = MODEL_ID[String((e as { model?: string }).model)] ?? 'claude-opus-5-5'
    return (shape.isSpawnUnlinked ? { model } : { model, agentId: `a${++n}` }) as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('skill.prompt', async (_$, e) => ({ text: (e as { text: string }).text }) as never)
  let pendingStep: { usage: Usage | null; toolUses: number } = { usage: null, toolUses: 0 }
  on('turn.step', async function* (_$, e) {
    const s = e as { turnId: string; index: number }
    const toolUses = Array.from({ length: pendingStep.toolUses }, (_, i) => ({ id: `tu${i}`, name: 'Read', input: {} }))
    return { turnId: s.turnId, index: s.index, answer: '', toolUses, stopReason: toolUses.length ? 'tool_use' : 'end_turn', usage: pendingStep.usage } as never
  })
  if (isStarted) {
    on('command.register', async () => ({ value: {} }) as never)
    on('session.start', async () => ({ cwd: '/repo' }) as never)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  }
  let steps = 0
  let rows = 0
  return {
    clock,
    opened,
    closed,
    nowWrites,
    toasts,
    files,
    links,
    bash: (command, taskId = 'b1', opts = {}) => {
      nextBash = { id: taskId, endsWithParent: opts.endsWithParent === true }
      return $.tool.call({
        tool: 'Bash',
        command,
        description: 'run it',
        ...(opts.isForeground ? {} : { run_in_background: true }),
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
        ...(opts.isError ? { fail: true } : {}),
      } as never)
    },
    notify: async (taskId, end) => {
      const summary =
        end.status === 'completed'
          ? 'Background command "run it" completed (exit code 0)'
          : end.status === 'failed'
            ? `Background command "run it" failed${end.exitCode !== undefined ? ` with exit code ${end.exitCode}` : ''}`
            : 'Background command "run it" was stopped'
      const text = [
        '<task-notification>',
        `<task-id>${taskId}</task-id>`,
        `<tool-use-id>toolu_${taskId}</tool-use-id>`,
        `<output-file>${outputFileFor(taskId)}</output-file>`,
        `<status>${end.status}</status>`,
        `<summary>${summary}</summary>`,
        '</task-notification>',
      ].join('\n')
      await $.session.append({
        message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
        door: end.door ?? 'prompt',
        origin: { kind: 'task-notification' },
        uuid: `row-${++rows}`,
      } as never)
    },
    spawn: (description, subagentType = 'Explore', model, toolUseId) =>
      $.agent.spawn({
        tool_use_id: toolUseId ?? `tu-${description}`,
        prompt: 'go',
        description,
        subagentType,
        ...(model ? { model } : {}),
        provider: { plugin: 'engine', tier: 'core' },
        parentModel: 'claude-fable-5-1',
        background: false,
        fork: false,
      } as never),
    step: async (agentId, u, toolUses = 0) => {
      pendingStep = { usage: u, toolUses }
      const stream = $.turn.step({ turnId: `t-${agentId}`, index: steps++, model: u?.model ?? 'claude-opus-5-5', messageCount: 1, agentId } as never)
      for await (const _chunk of stream) {
        // Drained: the bottom yields no chunks.
      }
      await stream.result
    },
    finish: async (agentId, reason = 'answer') => {
      await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: reason === 'aborted', turnId: `t-${agentId}`, agentId, reason } as never)
    },
    mainTurn: async isStart => {
      if (isStart) await $.turn.start({ text: 'go', turnId: 't-main' } as never)
      else await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: 't-main', reason: 'answer' } as never)
    },
    skill: async name => {
      await $.skill.prompt({ skill: name, text: 'body' } as never)
    },
    runs: async () => (latest.get('runs') as AgentRun[] | undefined) ?? [],
    state: key => latest.get(key),
    spawns,
    live: () => live,
    exitChildren: () => {
      for (const exit of exits.splice(0)) exit()
    },
    procRuns,
    numstat,
    notRepo,
    plays,
    commands,
    tool: (tool, input, opts = {}) =>
      $.tool.call({
        tool,
        ...input,
        ...(opts.isError ? { fail: true } : {}),
        ...(opts.result !== undefined ? { answer: opts.result } : {}),
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
      } as never),
    monitor: (description, command, taskId, opts = {}) =>
      $.tool.call({
        tool: 'Monitor',
        description,
        command,
        timeout_ms: opts.timeoutMs ?? 300_000,
        taskId,
        ...(opts.persistent ? { persistent: true } : {}),
      } as never),
    event: async (taskId, text) => {
      const body = ['<task-notification>', `<task-id>${taskId}</task-id>`, '<summary>Monitor event: "watch"</summary>', `<event>${text}</event>`, '</task-notification>'].join('\n')
      await $.session.append({
        message: { type: 'user', role: 'user', content: [{ type: 'text', text: body }] },
        door: 'prompt',
        origin: { kind: 'task-notification' },
        uuid: `row-${++rows}`,
      } as never)
    },
    cronCreate: (cron, prompt, job, opts = {}) =>
      $.tool.call({
        tool: 'CronCreate',
        cron,
        prompt,
        job,
        ...(opts.recurring === false ? { recurring: false } : {}),
        ...(opts.nextFireAt ? { nextFireAt: opts.nextFireAt } : {}),
      } as never),
    cronDelete: job => $.tool.call({ tool: 'CronDelete', id: job } as never),
    setAgents: a => {
      agents = a
    },
    herdrRuns: () => procRuns.filter(r => r.argv.join(' ') === 'herdr agent list').length,
    submit: async text => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
    },
    cronFire: async prompt => {
      await $.session.append({
        message: { type: 'user', role: 'user', content: [{ type: 'text', text: prompt }] },
        door: 'prompt',
        origin: { kind: 'scheduled-trigger' },
        uuid: `row-${++rows}`,
      } as never)
    },
  }
}

/** The pane's props at `bodyColumns`. */
export const paneProps = (bodyColumns: number) =>
  ({ title: '', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} }) as never

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 120, hasSurvey = false) =>
  ({ hasSurvey, isWorking: true, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

/** Decodes a Raster's cells into its u32 words. */
export const decode = (b64: string): Uint32Array => new Uint32Array(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer)

/** A lower band tree for the stack-order test: zm rows as listed, then a non-zm Text. */
export const stackTree = (keys: readonly string[]) => ({
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [
    ...keys.map(key => ({ type: 'Box', props: { key }, children: [{ type: 'Text', props: {}, children: [key] }] })),
    { type: 'Box', props: { key: 'other-band' }, children: [{ type: 'Text', props: {}, children: ['beneath'] }] },
  ],
})

/** The keys of a drawn tree's direct children, in order. */
export const childKeys = (tree: unknown): string[] =>
  (((tree as { children?: unknown[] }).children ?? []) as { props?: { key?: string } }[]).map(c => c.props?.key ?? '')
