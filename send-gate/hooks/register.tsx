// The send-gate mod: a gate on every MCP tool call. In a session that runs
// without permission prompts (or whose mode is not known), a call that would
// send a message or an email, notify people, or that the local config names
// (rules.ts) is held until the person lets that one call through (hold.ts: a
// card in a pane, or the question dialog). The gate fails closed: an error, a
// timeout, a dismissed dialog and an interrupted turn all refuse.
//
// The site's tool names come from a local JSON file outside the repo
// (`<HOME>/.claude/send-gate.json`, or the `config` option).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Mode, SendConfig, SendSeen } from '../types'
import { KIND_WORD, PANE, cardOf, drawCard } from './card'
import { canApprove, createHolder, whyOf } from './hold'
import type { HoldEngine } from './hold'
import { clean, isReadName, kindOf, modeOf, parseGateConfig, previewOf, shouldGate } from './rules'
import type { GateRead, SendKind } from './rules'

const NO_CONFIG: SendConfig = { status: 'none', path: '', gate: 0, error: '' }

const modeAtom = atom({ plugin: 'send-gate', key: 'mode' } as const, 'unknown')
const modeFromAtom = atom({ plugin: 'send-gate', key: 'modeFrom' } as const, 'none')
const recent = atom({ plugin: 'send-gate', key: 'recent' } as const, [])
const config = atom({ plugin: 'send-gate', key: 'config' } as const, NO_CONFIG)

const RECENT_KEPT = 30
const RECENT_SHOWN = 20
const DEFAULT_TIMEOUT_S = 120

const FAILED = 'Send Gate failed while checking this call and refused it. Do not retry it unless the user asks you to.'
const BROKEN_TOAST = 'send-gate: the config is broken; while gated, every MCP tool that is not a read is held (/send-gate status)'
const PERSON_ONLY = 'Only the person can answer a hold.'
const JUST_APPEARED = 'A new hold just appeared: read it, then answer again.'
const HINT = 'status | recent | test <tool name> | tools | send | cancel | reload'
const USAGE = `Usage: /send-gate [${HINT}]`

/** Envelope keys of a tool call that are not the tool's arguments. */
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])

// One holder for the module: one hold is asked at a time.
const holder = createHolder()
// The config as last read; null until the first read (a fresh load reads it on the first call).
let site: GateRead | null = null
let isBrokenToasted = false
// The gate reads the module's copy of the mode; the state is for /send-gate status and other readers.
// A fresh load knows nothing yet, which is gated.
let mode: Mode = 'unknown'
let modeFrom: 'event' | 'env' | 'settings' | 'none' = 'none'
// Counts the events that set the mode, so a session start whose reads were overtaken by one writes nothing.
let modeEvents = 0

/**
 * The part of `$` the hold kit uses, each call spelled out here: the engine
 * hands `$` to this module's own functions only, never to a method of an object.
 */
function holdEngine($: EngineInterface): HoldEngine {
  return {
    ui: {
      open: pane => $.ui.open(pane),
      close: pane => $.ui.close(pane),
      ask: (question, options) => $.ui.ask(question, options),
      notify: (text, options) => $.ui.notify(text, options),
      invalidate: event => $.ui.invalidate(event),
    },
    process: { run: (argv, init) => $.process.run(argv, init) },
    clock: { now: () => $.clock.now() },
  }
}

/** The hold's time limit from the `timeoutSeconds` option: 5 to 3600 seconds, else the default. */
function timeoutOf(options: PluginOptions): number {
  const n = Number(options.timeoutSeconds)
  const seconds = Number.isFinite(n) && n > 0 ? Math.min(3600, Math.max(5, Math.round(n))) : DEFAULT_TIMEOUT_S
  return seconds * 1000
}

/** The config file's absolute path: the `config` option (a leading `~/` is the home folder), else `<HOME>/.claude/send-gate.json`. */
async function pathOf($: EngineInterface, options: PluginOptions): Promise<string> {
  const named = typeof options.config === 'string' ? options.config.trim() : ''
  if (named.startsWith('/')) return named
  if (named !== '' && !named.startsWith('~/')) throw new Error('the config option must be an absolute path')
  const home = await $.env.get('HOME')
  if (!home) throw new Error('HOME is not set, so the config file cannot be found')
  const base = home.replace(/\/+$/, '')
  return named !== '' ? `${base}/${named.slice(2)}` : `${base}/.claude/send-gate.json`
}

function summaryOf(r: GateRead, path: string): SendConfig {
  if (r.status === 'ok') {
    return { status: 'ok', path, gate: r.config.gate.length, error: r.warnings.length > 0 ? clean(`warning: ${r.warnings.join('; ')}`, 300) : '' }
  }
  return { status: r.status, path, gate: 0, error: r.status === 'broken' ? r.error : '' }
}

/** Reads the config file. Whatever goes wrong is a broken read, which holds every MCP tool that is not a read. */
async function loadConfig($: EngineInterface, options: PluginOptions): Promise<GateRead> {
  let path = ''
  let r: GateRead
  try {
    path = await pathOf($, options)
    if (!(await $.fs.exists(path))) r = { status: 'none' }
    else {
      const text = await $.fs.read(path)
      r = typeof text === 'string' ? parseGateConfig(text) : { status: 'broken', error: 'the file is not text' }
    }
  } catch (err) {
    r = { status: 'broken', error: clean(`the file could not be read (${err instanceof Error ? err.message : 'error'})`, 200) }
  }
  site = r
  try {
    const summary = summaryOf(r, path)
    await update($, config, () => summary)
  } catch {
    // The gate reads the module's copy; the summary is for /send-gate status.
  }
  if (r.status !== 'broken') isBrokenToasted = false
  else if (!isBrokenToasted) {
    isBrokenToasted = true
    $.ui.toast(BROKEN_TOAST)
  }
  return r
}

/** Sets the mode the gate reads, and its record. */
async function setMode($: EngineInterface, next: Mode, from: 'event' | 'env' | 'settings' | 'none'): Promise<void> {
  mode = next
  modeFrom = from
  try {
    await update($, modeAtom, () => next)
    await update($, modeFromAtom, () => from)
  } catch {
    // The gate reads the module's copy.
  }
}

/**
 * The mode a launcher states in SEND_GATE_MODE, trimmed, when it is a known
 * mode name; null when the variable is absent, holds anything else, or cannot
 * be read. Nothing sets it by default.
 */
async function launcherMode($: EngineInterface): Promise<Mode | null> {
  let value: string | undefined
  try {
    value = await $.env.get('SEND_GATE_MODE')
  } catch {
    return null
  }
  const m = modeOf(typeof value === 'string' ? value.trim() : undefined)
  return m === 'unknown' ? null : m
}

/**
 * The mode at a session start, which also fires on a reload, an enable or a
 * worker respawn. The stored mode outlives a reload: when an event named it,
 * it is restored and nothing else is read, since the settings never see a
 * mode set on the command line or with shift+tab. A stored mode that is gated
 * stays gated whatever its stored source says: the mode and its source are two
 * writes, and a reload between them must not open the gate. A stored state
 * that cannot be read leaves the mode unknown (gated). Otherwise the
 * launcher's SEND_GATE_MODE counts, and only without it the settings'
 * `permissions.defaultMode`; anything but an object with a string defaultMode
 * leaves it unknown.
 */
async function startMode($: EngineInterface): Promise<void> {
  const seen = modeEvents
  let stored: { mode: Mode; from: 'event' | 'env' | 'settings' | 'none' }
  try {
    stored = { mode: modeOf(await read($, modeAtom)), from: await read($, modeFromAtom) }
  } catch {
    if (modeEvents === seen) {
      mode = 'unknown'
      modeFrom = 'none'
    }
    return
  }
  if (modeEvents !== seen) return
  if (stored.from === 'event') {
    mode = stored.mode
    modeFrom = 'event'
    return
  }
  // Unknown with no source is what a store that holds nothing reads as.
  if (shouldGate(stored.mode) && !(stored.mode === 'unknown' && stored.from === 'none')) {
    mode = stored.mode
    modeFrom = stored.from
    return
  }
  const launched = await launcherMode($)
  if (modeEvents !== seen) return
  if (launched !== null) {
    await setMode($, launched, 'env')
    return
  }
  let permissions: unknown
  try {
    permissions = await $.settings.read({ key: 'permissions' })
  } catch {
    permissions = undefined
  }
  if (modeEvents !== seen) return
  const defaultMode = typeof permissions === 'object' && permissions !== null ? (permissions as { defaultMode?: unknown }).defaultMode : undefined
  if (typeof defaultMode === 'string') await setMode($, modeOf(defaultMode), 'settings')
  else await setMode($, 'unknown', 'none')
}

/** A classic event's mode, from the main thread only. */
async function observeMode($: EngineInterface, e: { permission_mode?: string; agent_id?: string }): Promise<void> {
  if (e.agent_id !== undefined || e.permission_mode === undefined) return
  modeEvents += 1
  await setMode($, modeOf(e.permission_mode), 'event')
}

/** One line of the recent list. A failure here throws: the caller decides whether it matters. */
async function note($: EngineInterface, seen: Omit<SendSeen, 'at'>): Promise<void> {
  const at = await $.clock.now()
  const entry: SendSeen = { at, tool: clean(seen.tool, 160), kind: seen.kind, verdict: seen.verdict, why: clean(seen.why, 200), target: clean(seen.target, 200) }
  await update($, recent, list => [entry, ...list].slice(0, RECENT_KEPT))
}

/** The tool's arguments: the call's envelope keys left out. */
function argsOf(e: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(e)) if (!RESERVED.has(k)) args[k] = v
  return args
}

const denyText = (kind: SendKind, why: string): string =>
  `Send Gate held this ${KIND_WORD[kind]} and did not send it: ${why}. Do not retry it unless the user asks you to.`

function hhmmss(ms: number): string {
  const d = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

function modeLine(m: Mode, from: 'event' | 'env' | 'settings' | 'none'): string {
  const where =
    from === 'event'
      ? 'from a session event'
      : from === 'env'
        ? "from the launcher's SEND_GATE_MODE"
        : from === 'settings'
          ? 'from the settings'
          : 'no event yet, no setting'
  return `Mode: ${m} (${where}) · ${shouldGate(m) ? 'gated' : 'not gated'}`
}

function configLine(c: SendConfig): string {
  const where = c.path || '(no path)'
  if (c.status === 'broken') return `Config: BROKEN · ${where} · ${c.error} · while gated, every MCP tool that is not a read is held`
  if (c.status === 'none') return `Config: none (no file at ${where}) · only the built-in rules apply`
  return `Config: ok · ${where} · ${c.gate} gate glob${c.gate === 1 ? '' : 's'}${c.error ? ` · ${c.error}` : ''}`
}

function seenLine(s: SendSeen): string {
  return `${hhmmss(s.at)}  ${s.verdict}  ${s.kind}  ${s.tool}  ${s.target || '-'}  (${s.why})`
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'send-gate',
      description: 'Send Gate: the mode and the config, recent sends, test a tool name, list tools that are neither gated nor a read, answer a hold (send, cancel), reload',
      argumentHint: HINT,
      immediate: true,
    })
    await startMode($)
    await loadConfig($, options)
    try {
      // A card left open by a module that was reloaded mid-hold.
      if (holder.slot() === null) await $.ui.close({ id: PANE })
    } catch {
      // Best effort.
    }
    return started
  }).catch(($, e, next) => next(e))

  // The live mode, from the main thread's classic events. Observe only.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await observeMode($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    await observeMode($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    await observeMode($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The gate. It judges before it calls next, and its catch refuses where next was not called.
  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    const tool = String(e.tool)
    const cfg = site ?? (await loadConfig($, options))
    const kind = kindOf(tool, cfg)
    if (kind === null) return next(e)

    const args = argsOf(e as unknown as Record<string, unknown>)
    if (!shouldGate(mode)) {
      // Listed so /send-gate recent shows what went out unasked; the list never blocks a call.
      await (async () => note($, { tool, kind, verdict: 'not-gated', why: `mode ${mode}`, target: previewOf(kind, tool, args).target }))().catch(() => {})
      return next(e)
    }

    const preview = previewOf(kind, tool, args)

    const timeoutMs = timeoutOf(options)
    const decision = await holder.request(holdEngine($), next.signal, cardOf(preview, e.agentId !== undefined, timeoutMs))
    if (decision !== 'run') {
      const why = whyOf(decision, timeoutMs)
      await note($, { tool, kind, verdict: 'denied', why, target: preview.target }).catch(() => {})
      return { deny: denyText(kind, why) }
    }

    // Approved, this one call. The record is written before it goes out: a failure here refuses.
    await note($, { tool, kind, verdict: 'sent', why: 'the user chose Send once', target: preview.target })
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: FAILED }))

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'send-gate' }, async ($, e) => {
    const args = e.args.trim()
    const verb = (args.split(/\s+/)[0] ?? '').toLowerCase()
    const rest = args.slice(verb.length).trim()
    const kind = e.origin?.kind
    const isPerson = kind === 'composer' || kind === 'bridge'
    switch (verb) {
      case '':
      case 'status': {
        const slot = holder.slot()
        return {
          text: [
            modeLine(mode, modeFrom),
            configLine(await read($, config)),
            slot !== null ? `Hold pending: ${slot.card.what} (/send-gate send, /send-gate cancel)` : 'No hold is pending.',
          ].join('\n'),
        }
      }
      case 'recent': {
        const list = (await read($, recent)).slice(0, RECENT_SHOWN)
        return { text: list.length > 0 ? list.map(seenLine).join('\n') : 'Nothing yet: no sending call was seen.' }
      }
      case 'test': {
        if (rest === '') return { text: `${USAGE}\n/send-gate test <tool name> shows its kind, or not gated; it calls nothing.` }
        const name = clean(rest, 200)
        const k = kindOf(name, site ?? (await loadConfig($, options)))
        return { text: `${name}: ${k ?? 'not gated'}` }
      }
      case 'tools': {
        let tools: { name: string; mcp: boolean }[]
        try {
          tools = await $.tool.list()
        } catch {
          return { text: 'The tool list could not be read.' }
        }
        const cfg = site ?? (await loadConfig($, options))
        const open = tools.filter(t => t.mcp && kindOf(t.name, cfg) === null && !isReadName(t.name)).map(t => clean(t.name, 200))
        if (open.length === 0) return { text: 'Every MCP tool is gated or a read.' }
        return {
          text: [
            `MCP tools that are neither gated nor a read (${open.length}); name one in "gate" of the config file to hold it:`,
            ...open.map(n => `  ${n}`),
          ].join('\n'),
        }
      }
      case 'send':
      case 'cancel': {
        if (!isPerson) return { text: PERSON_ONLY }
        const slot = holder.slot()
        if (slot === null) return { text: 'No hold is pending.' }
        // The slot may have just passed to a hold the person has not read: a
        // typed approval waits until the card has been on screen a while.
        // Cancel only refuses, so it answers at once.
        if (verb === 'send' && slot.decision === null && !canApprove(slot, await $.clock.now())) return { text: JUST_APPEARED }
        if (!holder.decide(slot.id, verb === 'send' ? 'run' : 'cancel')) return { text: 'That hold is already answered.' }
        $.ui.invalidate('ui.render')
        return { text: verb === 'send' ? 'Sending it once.' : 'Cancelled: the call is refused.' }
      }
      case 'reload': {
        await loadConfig($, options)
        return { text: `Reloaded. ${configLine(await read($, config))}` }
      }
      case 'help':
        return {
          text: [
            USAGE,
            '  /send-gate              the mode and where it came from, the config, a pending hold',
            '  /send-gate recent       the newest 20 sending calls: sent, denied or not-gated',
            '  /send-gate test <tool>  the kind of that tool name, or not gated; it calls nothing',
            '  /send-gate tools        MCP tools that are neither gated nor a read',
            '  /send-gate send|cancel  answer the pending hold (the card\'s buttons)',
            '  /send-gate reload       read the config file again',
          ].join('\n'),
        }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'send-gate' }, ($, e, next) =>
    drawCard($, e, () => next(e), holder.slot(), {
      decide: (id, d) => {
        holder.decide(id, d)
        $.ui.invalidate('ui.render')
      },
    }),
  ).catch(($, e, next) => next(e))
}
