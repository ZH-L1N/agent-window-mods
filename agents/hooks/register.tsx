// The agents mod: one run record per subagent and per background shell, the
// /agents-info pane and the AGENTS band above the prompt. This file keeps the
// books and raises the finish toasts; skin.tsx draws the pane and band.tsx the band.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { AgentRun, CodeTouch } from '../types'
import { drawBand } from './band'
import { EDITING_MS, EDIT_TOOLS, FILE_TOOLS, NUMSTAT_TIMEOUT_MS, addTouch, bashTouches, dirOf, parseNumstat, toolTouches } from './codemap'
import type { Touch } from './codemap'
import {
  ALL_DONE,
  CAFFEINATE,
  SOUND_DONE,
  closePane,
  diffQueue,
  isCaffeinateOn,
  isInFlight,
  isSoundOn,
  setView,
  LINGER_MS,
  MAX_RUNS,
  keepEndedOf,
  pruneEnded,
  MESSAGES_STUB,
  PANE,
  PULSE_MS,
  TAIL_MAX_BYTES,
  batchOf,
  clip,
  costOf,
  isBandOn,
  isShell,
  isToastsOn,
  openPane,
  toastText,
  togglePane,
  tokensOf,
  windowOf,
} from './kit'
import type { Usage } from './kit'
import { labelOf, lastLineOf, notesOf, outputFileOf, textOfContent } from './shells'
import type { TaskNote } from './shells'
import { nodePath } from './code'
import { NEEDS_HERDR, herdrIds, noteEnvelopes, pollPeers, tickPeers } from './peers'
import { drawPane } from './skin'
import { DONE_RECENT_MS, cronNext, eventsOf, targetOf } from './watch'

const runs = atom({ plugin: 'agents', key: 'runs' } as const, [])
const skills = atom({ plugin: 'agents', key: 'skills' } as const, {})
const main = atom({ plugin: 'agents', key: 'main' } as const, { model: '', isRunning: false, startedAt: 0 })
const now = atom({ plugin: 'agents', key: 'now' } as const, 0)
const dismissedAt = atom({ plugin: 'agents', key: 'dismissedAt' } as const, 0)
const isStill = atom({ plugin: 'agents', key: 'isStill' } as const, false)
const tails = atom({ plugin: 'agents', key: 'tails' } as const, {})
const isCaffeinated = atom({ plugin: 'agents', key: 'isCaffeinated' } as const, false)
const code = atom({ plugin: 'agents', key: 'code' } as const, [])
const turn = atom({ plugin: 'agents', key: 'turn' } as const, 0)
const codeScope = atom({ plugin: 'agents', key: 'codeScope' } as const, 'turn')
const view = atom({ plugin: 'agents', key: 'view' } as const, 'who')

// A shell's command and task text as kept in its run record (drawings clip further).
const COMMAND_MAX = 2_000
const DESCRIPTION_MAX = 200

// A caffeinate hold that ends sooner than this after its start is retried only this much later.
const AWAKE_RETRY_MS = 60_000

// The tick re-reads prefersReducedMotion every this many slow ticks.
const MOTION_EVERY = 10

// What the Agent call said that its spawn does not carry, by tool_use_id.
const pending = new Map<string, { effort?: string }>()

// Timers and the tick's memory: a reload drops them with the environment, and
// session.start (raised again for a fresh load) starts them over.
let slow: Timer | null = null
let fast: Timer | null = null
let wasActive = false
let ticks = 0
// Background task ids already ended, so a notification seen twice ends and toasts once.
const endedTasks = new Set<string>()
// Each shell's output file as last read (size and mtime), so an unchanged file is not read again.
const tailSeen = new Map<string, string>()
// Whether a subagent, shell or watch was in flight at the last tick: ALL DONE when it goes false.
let wasInFlight = false
// The caffeinate hold's child while it runs (spawned and stopped by the tick only).
let awake: ReturnType<EngineInterface['process']['spawn']> | null = null
// A hold that ended within a minute of its start (no caffeinate here, or it failed): not re-armed before this time.
let awakeRetryAt = 0
// The session's working directory: relative paths in the code map resolve against it.
let cwd = ''
// Folders already asked whether they sit in a git work tree.
const repoDirs = new Map<string, boolean>()
// Watch events already seen (task id and line): the queue record and the row of one event count once.
const seenEvents = new Set<string>()

const updateRun = ($: EngineInterface, agentId: string, change: (a: AgentRun) => AgentRun) =>
  update($, runs, list => (list.some(a => a.agentId === agentId) ? list.map(a => (a.agentId === agentId ? change(a) : a)) : list))

async function readMotion($: EngineInterface): Promise<void> {
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    const still = settings.prefersReducedMotion === true
    if ((await read($, isStill)) !== still) await update($, isStill, () => still)
  } catch {
    // No settings: keep what was read last.
  }
}

async function readModel($: EngineInterface): Promise<string> {
  try {
    return await $.session.model()
  } catch {
    return ''
  }
}

async function readSessionId($: EngineInterface): Promise<string> {
  try {
    return await $.session.id()
  } catch {
    return ''
  }
}

/** One toast for a run that ended, unless the `toasts` option is off; never for the main loop. */
function toastEnd($: EngineInterface, run: AgentRun, options: PluginOptions): void {
  if (!isToastsOn(options.toasts)) return
  try {
    $.ui.toast(toastText(run))
  } catch {
    // A toast is a courtesy.
  }
}

/**
 * True when another watch on `run`'s target ended done within DONE_RECENT_MS
 * of `at`: a notification of this one greys its entry instead of toasting again.
 */
const isTargetDone = (list: readonly AgentRun[], run: AgentRun, at: number): boolean =>
  run.kind === 'watch' &&
  run.target !== undefined &&
  list.some(
    o =>
      o.kind === 'watch' &&
      o.id !== run.id &&
      o.target === run.target &&
      o.status === 'finished' &&
      o.endedAt !== undefined &&
      at - o.endedAt <= DONE_RECENT_MS,
  )

/**
 * Ends a running shell or watch as a notification (or its subagent's end)
 * reports, and toasts it once; a watch whose target is already done ends grey,
 * without a toast.
 */
async function endShell($: EngineInterface, note: TaskNote, options: PluginOptions): Promise<void> {
  // Claimed before the first await, so a second row for the task (its queue
  // record) finds it taken; released unless the shell is ended, so that row retries.
  if (endedTasks.has(note.id)) return
  endedTasks.add(note.id)
  if (endedTasks.size > 256) endedTasks.delete(endedTasks.values().next().value ?? '')
  let isEnded = false
  try {
    const list = await read($, runs)
    const run = list.find(a => (isShell(a) || a.kind === 'watch') && a.taskId === note.id && a.status === 'running')
    if (!run) return
    const at = await $.clock.now()
    const isDone = note.status === 'completed'
    const isStaleEnd = isTargetDone(list, run, at)
    const ended: AgentRun = {
      ...run,
      ...(isStaleEnd ? { staleAt: at } : {}),
      status: isDone ? 'finished' : 'error',
      endedAt: at,
      ...(isDone ? {} : { endWord: note.status === 'killed' ? 'killed' : 'failed' }),
      ...(note.exitCode !== undefined ? { exitCode: note.exitCode } : {}),
      ...(note.outputFile && !run.outputFile ? { outputFile: note.outputFile } : {}),
    }
    await update($, runs, l => l.map(a => (a.id === run.id ? ended : a)))
    isEnded = true
    await update($, now, () => at)
    if (!isStaleEnd) toastEnd($, ended, options)
    await pruneAfterEnd($, options)
  } finally {
    if (!isEnded) endedTasks.delete(note.id)
  }
}

/**
 * Each shell's last output line, read through $.fs.read while the pane is open:
 * for the shells running or ended within the linger, a file read only when its
 * size or mtime moved, and never one over TAIL_MAX_BYTES.
 */
async function pollTails($: EngineInterface, list: readonly AgentRun[], at: number): Promise<void> {
  const shells = list.filter(
    a => isShell(a) && a.outputFile && (a.status === 'running' || (a.endedAt !== undefined && at - a.endedAt <= LINGER_MS)),
  )
  for (const a of shells) {
    const file = a.outputFile ?? ''
    try {
      const stat = await $.fs.stat(file)
      const seen = `${stat.size}:${stat.mtimeMs}`
      if (tailSeen.get(a.id) === seen) continue
      tailSeen.set(a.id, seen)
      if (tailSeen.size > 64) tailSeen.delete(tailSeen.keys().next().value ?? '')
      if (stat.size > TAIL_MAX_BYTES) continue
      const line = lastLineOf(await $.fs.read(file))
      if (line === undefined || (await read($, tails))[a.id] === line) continue
      const ids = new Set(list.map(r => r.id))
      await update($, tails, t => ({ ...Object.fromEntries(Object.entries(t).filter(([id]) => ids.has(id))), [a.id]: line }))
    } catch {
      // No file yet, or none to read: the card keeps the line it had.
    }
  }
}

/**
 * A watch's event notification: its last event line, and for a watch already
 * ended (or whose target another watch already saw done) a grey entry for 10 s.
 */
async function noteEvent($: EngineInterface, id: string, event: string): Promise<void> {
  const seen = `${id}\n${event}`
  if (seenEvents.has(seen)) return
  seenEvents.add(seen)
  if (seenEvents.size > 256) seenEvents.delete(seenEvents.values().next().value ?? '')
  const list = await read($, runs)
  const run = list.find(a => a.kind === 'watch' && a.taskId === id)
  if (!run) return
  const at = await $.clock.now()
  const isStale = run.status !== 'running' || isTargetDone(list, run, at)
  await update($, runs, l =>
    l.map(a => (a.id === run.id ? { ...a, ...(event ? { lastEvent: event } : {}), ...(isStale ? { staleAt: at } : {}) } : a)),
  )
  if (isStale) await update($, now, () => at)
}

/** A cron's stored prompt fired: a one-shot cron ends ✓, a recurring one moves to its next fire time. */
async function cronFired($: EngineInterface, text: string): Promise<void> {
  const body = text.trim()
  if (!body) return
  const list = await read($, runs)
  const run = list.find(a => a.kind === 'cron' && a.status === 'running' && a.description && body.startsWith(a.description.replace(/…$/, '').slice(0, 120)))
  if (!run) return
  const at = await $.clock.now()
  const fired: AgentRun = run.isRecurring
    ? { ...run, nextAt: run.cron ? cronNext(run.cron, at) : undefined }
    : { ...run, status: 'finished', endedAt: at, nextAt: undefined }
  await update($, runs, l => l.map(a => (a.id === run.id ? fired : a)))
  await update($, now, () => at)
}

/**
 * Lines added and removed for an edited file, from `git diff --numstat -- <file>`
 * run in its folder (only inside a git work tree, 5 s at most); a new file
 * git does not know yet counts the lines written. Best effort, never awaited by a tool call.
 */
async function readNumstat($: EngineInterface, path: string, turnOf: number, newLines?: number): Promise<void> {
  try {
    const dir = dirOf(path)
    let isRepo = repoDirs.get(dir)
    if (isRepo === undefined) {
      const probe = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd: dir, timeoutMs: NUMSTAT_TIMEOUT_MS })
      isRepo = probe.exitCode === 0 && probe.stdout.trim() === 'true'
      repoDirs.set(dir, isRepo)
      if (repoDirs.size > 64) repoDirs.delete(repoDirs.keys().next().value ?? '')
    }
    if (!isRepo) return
    const out = await $.process.run(['git', 'diff', '--numstat', '--', path], { cwd: dir, timeoutMs: NUMSTAT_TIMEOUT_MS })
    const counts = parseNumstat(out.stdout) ?? (newLines !== undefined ? { plus: newLines, minus: 0 } : undefined)
    if (!counts) return
    // The file's record for the turn the edit was made in.
    await update($, code, list => list.map(c => (c.path === path && c.turn === turnOf ? { ...c, ...counts } : c)))
  } catch {
    // No git, a timeout, or no state: the node keeps no counts.
  }
}

/** Records what one tool call touched in the code map, then reads the numstat of each file it edited. */
async function recordTouches($: EngineInterface, touches: readonly Touch[], by: string, isError: boolean, newLines?: number): Promise<void> {
  if (touches.length === 0) return
  const at = await $.clock.now()
  const t = await read($, turn)
  await update($, code, list => touches.reduce<CodeTouch[]>((l, x) => addTouch(l, { ...x, turn: t, at, by, isError }), [...list]))
  if (isError) return
  // git runs only under the session's folder: a repo elsewhere (its .git/config) is never entered.
  const root = cwd.replace(/\/+$/, '') + '/'
  for (const x of touches) if (x.isEdit && cwd !== '' && x.path.startsWith(root)) void readNumstat($, x.path, t, x.tool === 'Write' ? newLines : undefined)
}

/**
 * The caffeinate hold: while `want`, one `caffeinate -i -t 600` child runs
 * (spawned again once it ends while work is still in flight); stopped as soon
 * as the in-flight set empties. Spawned and stopped from the tick only.
 */
async function holdAwake($: EngineInterface, want: boolean, at: number): Promise<void> {
  if (want && awake === null && at >= awakeRetryAt) {
    const child = $.process.spawn({ argv: CAFFEINATE })
    awake = child
    await update($, isCaffeinated, () => true)
    void (async () => {
      try {
        for await (const _piece of child) {
          // caffeinate writes nothing; the loop is the child's life.
        }
      } catch {
        // It could not start, or it was stopped.
      }
      if (awake === child) {
        awake = null
        // Ended within a minute (it could not run): wait a minute before the next try.
        const end = await $.clock.now().catch(() => at)
        if (end - at < AWAKE_RETRY_MS) awakeRetryAt = end + AWAKE_RETRY_MS
        await update($, isCaffeinated, () => false).catch(() => {})
      }
    })()
  } else if (!want && awake !== null) {
    const child = awake
    awake = null
    void child.return({ code: null, signal: 'SIGTERM' }).catch(() => {})
    await update($, isCaffeinated, () => false)
  }
}

/** ALL DONE: one toast, and the chime when the `sound` option is on, both only with `toasts` on. */
function allDone($: EngineInterface, options: PluginOptions): void {
  if (!isToastsOn(options.toasts)) return
  try {
    $.ui.toast(ALL_DONE)
  } catch {
    // A toast is a courtesy.
  }
  if (isSoundOn(options.sound)) void $.audio.play({ asset: SOUND_DONE }).catch(() => {})
}

/** The /diff runs the Code view asked for, one by one through $.command.run. */
async function runDiffs($: EngineInterface): Promise<void> {
  while (diffQueue.length > 0) {
    const path = diffQueue.shift() ?? ''
    try {
      await $.command.run({ command: 'diff', args: path })
    } catch {
      // No /diff to run: nothing more to do.
    }
  }
}

/**
 * True while the code map changes on its own: a node turns from editing to
 * changed 30 s after its edit, and the ages count while the Code view is open.
 */
async function isCodeMoving($: EngineInterface, at: number): Promise<boolean> {
  if ((await read($, code)).some(c => c.lastEditAt !== undefined && at - c.lastEditAt <= EDITING_MS + 1_000)) return true
  if ((await read($, view)) !== 'code') return false
  try {
    return (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    return false
  }
}

const stopFast = () => {
  fast?.cancel()
  fast = null
}

/**
 * Once a second: while any run runs, the band shows (or lingers), or a finish
 * flash or error pulse is still on, move `now` so the clocks and spinners redraw;
 * one last move once all that is over, which hides the band and clears its
 * skills. A 100 ms tick runs beside it while the pane is open or the band shows,
 * unless motion is reduced, so the spinner and the flashes move smoothly.
 */
/** Drops ended runs past the `keepEnded` option, newest kept; called right after a run ends. */
async function pruneAfterEnd($: EngineInterface, options: PluginOptions): Promise<void> {
  const keep = keepEndedOf(options.keepEnded)
  await update($, runs, list => pruneEnded(list, keep))
}

async function tick($: EngineInterface, options: PluginOptions): Promise<void> {
  // Not awaited: a /diff that holds the screen must not hold the tick.
  if (diffQueue.length > 0) void runDiffs($)
  const list = await read($, runs)
  const at = await $.clock.now()
  // The Peers view reads herdr every 30 s, only while the pane shows it; not awaited, so a slow herdr never holds the tick.
  void tickPeers($, at).catch(() => {})
  // ALL DONE and the caffeinate hold follow the in-flight set: subagents, shells and watches.
  const inFlight = list.some(isInFlight)
  if (wasInFlight && !inFlight) allDone($, options)
  wasInFlight = inFlight
  await holdAwake($, inFlight && isCaffeinateOn(options.caffeinate), at)
  const isBand = isBandOn(options.band) && batchOf(list, at, await read($, dismissedAt)).length > 0
  const isLive = inFlight
  const isFlashing = list.some(a => a.endedAt !== undefined && at - a.endedAt < PULSE_MS)
  if (!isLive && !isBand && !isFlashing) {
    stopFast()
    if (await isCodeMoving($, at)) {
      await update($, now, () => at)
      return
    }
    if (wasActive) {
      wasActive = false
      await update($, now, () => at)
      await update($, skills, () => ({}))
    }
    return
  }
  wasActive = true
  if (ticks++ % MOTION_EVERY === 0) await readMotion($)
  await update($, now, () => at)
  let isPaneOpen = false
  try {
    isPaneOpen = (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    // No surface to ask: the band alone decides.
  }
  if (isPaneOpen) await pollTails($, list, at)
  // The 100 ms tick turns spinners: not for a band that shows only a cron waiting to fire.
  const wantsFast = !(await read($, isStill)) && (isPaneOpen || isBand) && (isLive || isFlashing || isPaneOpen)
  if (!wantsFast) stopFast()
  else if (fast === null) {
    fast = $.clock.every(100, () => {
      void $.clock
        .now()
        .then(t => update($, now, () => t))
        .catch(() => {})
    })
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = typeof e.cwd === 'string' ? e.cwd : ''
    // A reload ended the last module's caffeinate child with it: no ☕ until the tick holds again.
    await update($, isCaffeinated, () => false)
    await $.command.register({
      name: 'agents-info',
      description:
        'Show or hide the agents pane: subagents, shells, watches and crons (`who`), the files touched (`code`, `scope`, `diff <n>`), the herdr peers (`peers`); `clear` drops the ended ones, `close` closes it',
    })
    const model = await readModel($)
    if (model) await update($, main, m => ({ ...m, model }))
    // The hub card's pose is picked by the session's id: one pose for the session.
    const sessionId = await readSessionId($)
    if (sessionId) await update($, main, m => ({ ...m, id: sessionId }))
    await readMotion($)
    // A reload re-runs session.start: trim the ended runs then too, not only when a run ends.
    await pruneAfterEnd($, options)
    slow?.cancel()
    stopFast()
    slow = $.clock.every(1000, () => {
      void tick($, options).catch(() => {})
    })
    return started
  })

  on('command.run', { command: 'agents-info' }, async ($, e) => {
    const [verb, card] = e.args.trim().split(/\s+/)
    // `/agents-info code` and `/agents-info who`: the pane in that view, the twins of `c` and `w`.
    if (verb === 'code' || verb === 'who') {
      await openPane($, verb)
      return { text: `Agents pane: ${verb === 'code' ? 'Code' : 'Who'} view.` }
    }
    // `/agents-info peers`: the pane in the Peers view, herdr read now; the twin of `p` and of `r`.
    if (verb === 'peers') {
      await openPane($, 'peers')
      await pollPeers($)
      return { text: (await herdrIds($)) ? 'Agents pane: Peers view (read every 30 s while shown; r reads now).' : NEEDS_HERDR }
    }
    // `/agents-info close`: the twin of `q`.
    if (verb === 'close') return { text: (await closePane($)) ? 'Agents pane closed.' : 'The agents pane is not open.' }
    // `/agents-info scope`: the code map's turn or session scope, the twin of `a`.
    if (verb === 'scope') {
      await update($, codeScope, s => (s === 'turn' ? 'session' : 'turn'))
      return { text: `Code map scope: ${(await read($, codeScope)) === 'session' ? 'the whole session' : 'this turn'}.` }
    }
    // `/agents-info diff <n>`: /diff on the code map's node n, the twin of `d` + n.
    if (verb === 'diff') {
      const path = card ? await nodePath($, Number(card)) : undefined
      if (!path) return { text: card ? `No file ${card} in the code map.` : 'Name the node: /agents-info diff <n>.' }
      diffQueue.push(path)
      return { text: `Diff of ${path} coming up.` }
    }
    // `/agents-info clear`: drop every finished or failed run (subagents and shells); running ones stay.
    if (verb === 'clear') {
      const before = (await read($, runs)).length
      await update($, runs, list => pruneEnded(list, 0))
      const after = (await read($, runs)).length
      return { text: `Cleared ${before - after} ended run${before - after === 1 ? '' : 's'}.` }
    }
    // `/agents-info open <n>`: the numbered card's messages, the twin of its button; a stub until E3.
    if (verb === 'open' && card) return { text: `Card ${card}: ${MESSAGES_STUB}.` }
    // `/agents-info open` opens the pane, or brings it forward, without toggling it.
    if (verb === 'open') {
      await openPane($)
      return { text: 'Agents pane opened.' }
    }
    return { text: (await togglePane($)) ? 'Agents pane opened.' : 'Agents pane closed.' }
  })

  // The Agent call carries the effort its spawn does not; the spawn reads it by tool_use_id.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    if (e.tool === 'Agent' && e.tool_use_id) {
      pending.set(e.tool_use_id, { effort: e.effort })
      if (pending.size > 64) pending.delete(pending.keys().next().value ?? '')
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A Bash call that resolves with a background task id (run_in_background, or
  // moved there by ctrl+b or its timeout) starts a shell run; its notification ends it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    let startedAt = 0
    try {
      startedAt = await $.clock.now()
    } catch {
      // Stamped after the call instead.
    }
    const result = await next(e)
    try {
      if (e.tool !== 'Bash' || result.deny !== undefined) return result
      // The files the command names, for the code map (foreground or background alike).
      // A non-zero exit says nothing about its `>` target (`grep x f > hits.txt` wrote hits.txt): never drawn ✗.
      if (typeof e.command === 'string') await recordTouches($, bashTouches(e.command, cwd), e.agentId ?? 'main', false)
    } catch {
      // The code map is best effort.
    }
    try {
      if (e.tool !== 'Bash' || result.deny !== undefined) return result
      const out = result.result as { backgroundTaskId?: unknown; backgroundEndsWithFinalResponse?: unknown } | undefined
      const taskId = typeof out?.backgroundTaskId === 'string' ? out.backgroundTaskId : ''
      if (!taskId) return result
      const command = typeof e.command === 'string' ? e.command : ''
      const at = startedAt || (await $.clock.now())
      const parsed = labelOf(command)
      const outputFile = outputFileOf(result.text)
      const id = `sh-${taskId}`
      const run: AgentRun = {
        id,
        kind: 'shell',
        taskId,
        // Clipped as recorded (labelOf read the whole command): a long heredoc is not held twice per run.
        command: clip(command, COMMAND_MAX),
        type: parsed.label ?? 'sh',
        ...(parsed.label ? { label: parsed.label } : {}),
        description: clip(parsed.task, DESCRIPTION_MAX),
        model: parsed.model ?? '',
        ...(outputFile ? { outputFile } : {}),
        ...(e.agentId ? { parentAgentId: e.agentId } : {}),
        ...(out?.backgroundEndsWithFinalResponse === true ? { endsWithParent: true } : {}),
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: 0,
        tokens: 0,
        costUsd: 0,
        steps: 0,
      }
      await update($, runs, list => [...list.filter(a => a.id !== id), run].slice(-MAX_RUNS))
      await update($, now, () => at)
    } catch {
      // The books are best effort: the command goes on whatever happens here.
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A background task's notification row ends its shell: ✓ completed, ✗ failed or killed.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    const kind = (e.origin as { kind?: string }).kind
    if (kind === 'scheduled-trigger') {
      try {
        await cronFired($, textOfContent(e.message.content))
      } catch {
        // Best effort.
      }
      return stored
    }
    if (kind !== 'task-notification') return stored
    try {
      const text = textOfContent(e.message.content)
      for (const ev of eventsOf(text)) await noteEvent($, ev.id, ev.event)
      for (const note of notesOf(text)) await endShell($, note, options)
    } catch {
      // Best effort: the row is kept whatever happens here.
    }
    return stored
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A Monitor call starts a watch: its description, the target its command
  // names and its deadline; its task notification ends it, as a shell's does.
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.tool !== 'Monitor' || result.deny !== undefined || result.isError) return result
      const out = result.result as { taskId?: unknown; timeoutMs?: unknown; persistent?: unknown } | undefined
      const taskId = typeof out?.taskId === 'string' ? out.taskId : ''
      if (!taskId) return result
      const at = await $.clock.now()
      const command = typeof e.command === 'string' ? e.command : ''
      const timeoutMs = typeof out?.timeoutMs === 'number' ? out.timeoutMs : 0
      const target = targetOf(command)
      const id = `w-${taskId}`
      const run: AgentRun = {
        id,
        kind: 'watch',
        taskId,
        type: 'watch',
        command: clip(command, COMMAND_MAX),
        description: clip(typeof e.description === 'string' ? e.description : '', DESCRIPTION_MAX),
        model: '',
        ...(target ? { target } : {}),
        ...(out?.persistent !== true && timeoutMs > 0 ? { nextAt: at + timeoutMs } : {}),
        ...(e.agentId ? { parentAgentId: e.agentId } : {}),
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: 0,
        tokens: 0,
        costUsd: 0,
        steps: 0,
      }
      await update($, runs, list => [...list.filter(a => a.id !== id), run].slice(-MAX_RUNS))
      await update($, now, () => at)
    } catch {
      // Best effort: the watch runs whatever happens here.
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A CronCreate call starts a cron entry (next fire time, schedule, prompt); it
  // ends when it fires once (a one-shot) or when CronDelete removes it.
  on('tool.call', { tool: 'CronCreate' }, async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.tool !== 'CronCreate' || result.deny !== undefined || result.isError) return result
      const out = result.result as { id?: unknown; humanSchedule?: unknown; recurring?: unknown; nextFireAt?: unknown } | undefined
      const job = typeof out?.id === 'string' ? out.id : ''
      if (!job) return result
      const at = await $.clock.now()
      const expr = typeof e.cron === 'string' ? e.cron : ''
      const nextAt = typeof out?.nextFireAt === 'number' ? out.nextFireAt : cronNext(expr, at)
      const id = `cron-${job}`
      const run: AgentRun = {
        id,
        kind: 'cron',
        type: 'cron',
        target: job,
        cron: expr,
        schedule: typeof out?.humanSchedule === 'string' ? out.humanSchedule : expr,
        isRecurring: out?.recurring !== false && e.recurring !== false,
        description: clip(typeof e.prompt === 'string' ? e.prompt.trim() : '', DESCRIPTION_MAX),
        model: '',
        ...(nextAt !== undefined ? { nextAt } : {}),
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: 0,
        tokens: 0,
        costUsd: 0,
        steps: 0,
      }
      await update($, runs, list => [...list.filter(a => a.id !== id), run].slice(-MAX_RUNS))
      await update($, now, () => at)
    } catch {
      // Best effort.
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('tool.call', { tool: 'CronDelete' }, async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.tool !== 'CronDelete' || result.deny !== undefined || result.isError) return result
      const id = `cron-${typeof e.id === 'string' ? e.id : ''}`
      const at = await $.clock.now()
      await update($, runs, list =>
        list.map(a => (a.id === id && a.status === 'running' ? { ...a, status: 'finished' as const, endedAt: at, nextAt: undefined } : a)),
      )
      await update($, now, () => at)
      await pruneAfterEnd($, options)
    } catch {
      // Best effort.
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The code map: each file tool's call (main loop and subagents) records the file it touched.
  // One hook for them all (MultiEdit, Grep and Glob are matched by name though this engine may not ship them).
  const fileTools = new RegExp(`^(?:${FILE_TOOLS.join('|')})$`)
  on('tool.call', { tool: fileTools }, async ($, e, next) => {
    const result = await next(e)
    const tool = e.tool
    try {
      // A refused call touched nothing; a failed read neither (a failed edit is drawn ✗).
      if (result.deny !== undefined || (result.isError === true && !EDIT_TOOLS.has(tool))) return result
      const input = e as unknown as Record<string, unknown>
      const touches = toolTouches(tool, input, cwd)
      const content = typeof input.content === 'string' ? input.content : ''
      const created = (result.result as { type?: unknown } | undefined)?.type === 'create'
      // A new file's lines, for its + count while git does not know it yet.
      const newLines = tool === 'Write' && created ? (content === '' ? 0 : content.replace(/\n$/, '').split('\n').length) : undefined
      await recordTouches($, touches, e.agentId ?? 'main', result.isError === true && EDIT_TOOLS.has(tool), newLines)
    } catch {
      // The code map is best effort: the call goes on whatever happens here.
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    // Only a run with a local loop is kept: one with no agentId (a workflow's
    // remote agent) never gets a step or an end here, so it would run for good.
    const agentId = started.agentId
    if (!agentId) {
      pending.delete(e.tool_use_id)
      return started
    }
    try {
      const at = await $.clock.now()
      const id = agentId
      const call = pending.get(e.tool_use_id)
      pending.delete(e.tool_use_id)
      await update($, runs, list => {
        const prev = list.find(a => a.id === id)
        const run: AgentRun = {
          id,
          agentId,
          type: e.subagentType || prev?.type || 'agent',
          name: e.name ?? prev?.name,
          description: e.description || prev?.description || '',
          model: started.model,
          effort: call?.effort ?? prev?.effort,
          status: 'running',
          startedAt: at,
          contextTokens: prev?.contextTokens ?? 0,
          contextMax: windowOf(started.model),
          tokens: prev?.tokens ?? 0,
          costUsd: prev?.costUsd ?? 0,
          isUnpriced: prev?.isUnpriced,
          steps: prev?.steps ?? 0,
        }
        return [...list.filter(a => a.id !== id), run].slice(-MAX_RUNS)
      })
      await update($, now, () => at)
    } catch {
      // The books are best effort: the spawn goes on whatever happens here.
    }
    return started
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The main loop's turn: its model and whether it runs. A woken subagent runs again.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    try {
      const at = await $.clock.now()
      if (e.agentId === undefined) {
        const model = await readModel($)
        // No session id read: the first main turn's id picks the hub pose instead, kept after.
        await update($, main, m => ({ ...m, model: model || m.model, isRunning: true, startedAt: at, id: m.id || e.turnId }))
        // A new main-loop turn: the code map's turn scope moves on (the turn before kept once).
        await update($, turn, n => n + 1)
      } else {
        const agentId = e.agentId
        if ((await read($, runs)).some(a => a.agentId === agentId && a.status !== 'running')) {
          await updateRun($, agentId, a => ({ ...a, status: 'running', endedAt: undefined }))
        }
      }
    } catch {
      // Best effort.
    }
    return started
  })

  // Each model request of a subagent: one step, its context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    const effort = typeof e.effort === 'string' ? e.effort : typeof e.effort === 'number' ? String(e.effort) : undefined
    if (agentId) {
      try {
        const at = await $.clock.now()
        await updateRun($, agentId, a => {
          const cycle = a.stepStartedAt !== undefined ? Math.max(0, at - a.stepStartedAt) : undefined
          return {
            ...a,
            effort: effort ?? a.effort,
            stepStartedAt: at,
            awaitingSince: undefined,
            stepMsTotal: (a.stepMsTotal ?? 0) + (cycle ?? 0),
            stepCycles: (a.stepCycles ?? 0) + (cycle === undefined ? 0 : 1),
          }
        })
      } catch {
        // Best effort.
      }
    }
    const result = yield* next(e)
    if (!agentId) return result
    try {
      const at = await $.clock.now()
      const usage: Usage | null = result.usage
      const model = result.usage?.model || e.model
      await updateRun($, agentId, a => {
        const cost = usage ? costOf(model, usage) : 0
        return {
          ...a,
          model,
          steps: a.steps + 1,
          awaitingSince: result.toolUses.length > 0 ? at : undefined,
          ...(usage
            ? {
                contextTokens: tokensOf(usage),
                contextMax: windowOf(model),
                tokens: a.tokens + tokensOf(usage),
                costUsd: a.costUsd + (cost ?? 0),
                isUnpriced: a.isUnpriced || cost === null || undefined,
              }
            : {}),
        }
      })
    } catch {
      // Best effort.
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const at = await $.clock.now()
      const agentId = e.agentId
      if (agentId === undefined) {
        await update($, main, m => ({ ...m, isRunning: false }))
      } else {
        const before = (await read($, runs)).find(a => a.agentId === agentId)
        await updateRun($, agentId, a => {
          // A run whose steps went unseen still gets the turn's own sum.
          const usage = a.steps === 0 ? e.usage : undefined
          const cost = usage ? costOf(usage.model || a.model, usage) : 0
          return {
            ...a,
            status: e.reason === 'answer' ? 'finished' : 'error',
            endedAt: at,
            stepStartedAt: undefined,
            awaitingSince: undefined,
            ...(usage
              ? {
                  model: usage.model || a.model,
                  tokens: tokensOf(usage),
                  costUsd: cost ?? 0,
                  isUnpriced: cost === null || undefined,
                }
              : {}),
          }
        })
        await update($, now, () => at)
        if (before?.status === 'running') {
          const ended = (await read($, runs)).find(a => a.agentId === agentId)
          if (ended) toastEnd($, ended, options)
        }
        // Its shells that end with its final answer get no notification: they end here.
        for (const sh of (await read($, runs)).filter(a => a.parentAgentId === agentId && a.endsWithParent && a.status === 'running')) {
          if (sh.taskId) await endShell($, { id: sh.taskId, status: 'killed' }, options)
        }
        await pruneAfterEnd($, options)
      }
    } catch {
      // Best effort.
    }
    return next(e)
  })

  // The Peers view's requests: the HERDR-ORCH envelope headers in this session's
  // prompts (typed, pasted, a peer's message), kept once the prompt entered. Nothing is changed.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.command && r.drop === undefined) await noteEnvelopes($, e.text)
    } catch {
      // A failed note keeps the requests as they were.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // Skills fired, for the band: counted once per expansion while its batch is
  // live (a skill fired with no band up belongs to no batch), cleared when the band hides.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try {
      const at = await $.clock.now()
      if (batchOf(await read($, runs), at, await read($, dismissedAt)).length === 0) return result
      await update($, skills, s => ({ ...s, [e.skill]: (Object.hasOwn(s, e.skill) ? (s[e.skill] ?? 0) : 0) + 1 }))
    } catch {
      // Best effort.
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: 'agents' }, ($, e) => drawPane($, e, options))
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawBand($, e, () => next(e), options))
}
