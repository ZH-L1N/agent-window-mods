// The motion-hold mod: a gate on every Bash call and on every Monitor call that
// runs a command (a watch). A command that would move, energise or restart lab
// hardware (match.ts) is held until the person approves that one call
// (hold.ts: a card in a pane, or the question dialog), and a STOP row shows
// while an approved call runs (card.tsx). The gate fails closed: an error, a
// timeout, a dismissed dialog, an interrupted turn and an unreadable config
// all refuse.
//
// The site's hosts and command patterns come from a local JSON file outside
// the repo (`<HOME>/.claude/motion-hold.json`, or the `config` option).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { MotionActive, MotionConfig, MotionSeen } from '../types'
import { PANE, cardOf, drawCard, drawRow, hhmmss } from './card'
import { canApprove, createHolder, whyOf } from './hold'
import type { HoldEngine } from './hold'
import { classify, clean, hostOf, parseConfig } from './match'
import type { ConfigRead, Verdict } from './match'

const NO_CONFIG: MotionConfig = { status: 'none', path: '', hosts: 0, rules: 0, hasStop: false, error: '' }

const active = atom({ plugin: 'motion-hold', key: 'active' } as const, null)
const recent = atom({ plugin: 'motion-hold', key: 'recent' } as const, [])
const config = atom({ plugin: 'motion-hold', key: 'config' } as const, NO_CONFIG)

const RECENT_KEPT = 30
const RECENT_SHOWN = 20
const COMMAND_KEPT = 160
const DEFAULT_TIMEOUT_S = 120

const FAILED = 'Motion Hold failed while checking this call and refused it. Do not retry it unless the user asks you to.'
const BROKEN_TOAST = 'motion-hold: the site config is broken, remote commands are held (/motion status)'
const NO_STOP = 'No stop command is configured (stopCommand in the config file).'
const PERSON_ONLY = 'Only the person can answer a hold.'
const JUST_APPEARED = 'A new hold just appeared: read it, then answer again.'
const HINT = 'status | recent | test <command> | run | cancel | stop | clear | reload'
const USAGE = `Usage: /motion [${HINT}]`

// One holder for the module: one hold is asked at a time.
const holder = createHolder()
// The config as last read; null until the first read (a fresh load reads it on the first call).
let site: ConfigRead | null = null
let isBrokenToasted = false
let fallbackIds = 0

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

/** The config file's absolute path: the `config` option (a leading `~/` is the home folder), else `<HOME>/.claude/motion-hold.json`. */
async function pathOf($: EngineInterface, options: PluginOptions): Promise<string> {
  const named = typeof options.config === 'string' ? options.config.trim() : ''
  if (named.startsWith('/')) return named
  if (named !== '' && !named.startsWith('~/')) throw new Error('the config option must be an absolute path')
  const home = await $.env.get('HOME')
  if (!home) throw new Error('HOME is not set, so the config file cannot be found')
  const base = home.replace(/\/+$/, '')
  return named !== '' ? `${base}/${named.slice(2)}` : `${base}/.claude/motion-hold.json`
}

function summaryOf(r: ConfigRead, path: string): MotionConfig {
  if (r.status === 'ok') {
    return {
      status: 'ok',
      path,
      hosts: r.config.hosts.length,
      rules: r.config.hold.length + r.config.stop.length,
      hasStop: r.config.stopCommand !== null,
      error: r.warnings.length > 0 ? clean(`warning: ${r.warnings.join('; ')}`, 300) : '',
    }
  }
  return { status: r.status, path, hosts: 0, rules: 0, hasStop: false, error: r.status === 'broken' ? r.error : '' }
}

/** Reads the config file. Whatever goes wrong is a broken read, which holds every remote command. */
async function loadConfig($: EngineInterface, options: PluginOptions): Promise<ConfigRead> {
  let path = ''
  let r: ConfigRead
  try {
    path = await pathOf($, options)
    if (!(await $.fs.exists(path))) r = { status: 'none' }
    else {
      const text = await $.fs.read(path)
      r = typeof text === 'string' ? parseConfig(text) : { status: 'broken', error: 'the file is not text' }
    }
  } catch (err) {
    r = { status: 'broken', error: clean(`the file could not be read (${err instanceof Error ? err.message : 'error'})`, 200) }
  }
  site = r
  try {
    const summary = summaryOf(r, path)
    await update($, config, () => summary)
  } catch {
    // The gate reads the module's copy; the summary is for /motion status and the row.
  }
  if (r.status !== 'broken') isBrokenToasted = false
  else if (!isBrokenToasted) {
    isBrokenToasted = true
    $.ui.toast(BROKEN_TOAST)
  }
  return r
}

/** One line of the recent list. */
async function note($: EngineInterface, seen: Omit<MotionSeen, 'at' | 'command'> & { command: string }): Promise<void> {
  const at = await $.clock.now()
  const entry: MotionSeen = { at, verdict: seen.verdict, why: clean(seen.why, 200), host: seen.host, command: clean(seen.command, COMMAND_KEPT) }
  await update($, recent, list => [entry, ...list].slice(0, RECENT_KEPT))
}

function denyText(why: string, verdict: Extract<Verdict, { hold: true }>, isWatch: boolean): string {
  const isUnreadable = verdict.reasons.some(r => r.kind === 'unreadable')
  return (
    `Motion Hold held this command${isWatch ? ' (a Monitor watch)' : ''} and did not run it: ${why}. It would: ${verdict.summary}. ` +
    'Do not retry it unless the user asks you to. Reading state is not held: status, logs and searches run as usual.' +
    (isUnreadable ? ' Sending the same input to the host another way, such as copying it over and running it there, counts as a retry.' : '')
  )
}

const firstLine = (text: string): string => clean((text.split('\n').find(l => l.trim() !== '') ?? '').trim(), 160)

/**
 * STOP: the configured argv, `{host}` replaced by the active entry's host,
 * run from a timer. Never held: it is a plugin's own process, not a tool
 * call. Returns what the command answers; the outcome follows as a toast.
 */
async function stop($: EngineInterface): Promise<string> {
  const template = site !== null && site.status === 'ok' ? site.config.stopCommand : null
  if (template === null) {
    $.ui.toast(NO_STOP)
    return NO_STOP
  }
  let host: string | null = null
  try {
    host = (await read($, active))?.host ?? null
  } catch {
    // No state: an argv that needs no host still runs.
  }
  const needsHost = template.some(word => word.includes('{host}'))
  if (needsHost && (host === null || host.startsWith('-'))) {
    const text = 'STOP needs a host and none is known: no approved motion is active (/motion stop).'
    $.ui.toast(text)
    return text
  }
  const argv = template.map(word => word.split('{host}').join(host ?? ''))
  $.clock.after(10, () => {
    void $.process
      .run(argv, { timeoutMs: 10_000 })
      .then(ran => {
        if (ran.exitCode === 0) $.ui.toast('STOP sent (exit 0) · /motion stop')
        else $.ui.toast(`STOP failed: ${firstLine(ran.stderr) || `exit ${ran.exitCode}`} · /motion stop`)
      })
      .catch((err: unknown) => {
        $.ui.toast(`STOP failed: ${firstLine(err instanceof Error ? err.message : 'it could not start') || 'it could not start'} · /motion stop`)
      })
  })
  return `STOP requested: ${clean(argv.join(' '), 200)}`
}

async function clearActive($: EngineInterface): Promise<void> {
  await update($, active, () => null)
}

function configLine(c: MotionConfig): string {
  const where = c.path || '(no path)'
  if (c.status === 'broken') return `Config: BROKEN · ${where} · ${c.error} · every remote shell command and class A match is held`
  if (c.status === 'none') return `Config: none (no file at ${where}) · only the built-in class A rules apply`
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  return `Config: ok · ${where} · ${plural(c.hosts, 'host')} · ${plural(c.rules, 'rule')} · ${c.hasStop ? 'stop command set' : 'no stop command'}${c.error ? ` · ${c.error}` : ''}`
}

function activeLine(a: MotionActive | null): string {
  if (a === null) return 'No motion is active.'
  return `Active: ${a.summary} · since ${hhmmss(a.startedAt)}${a.isBackground ? ' · background' : ''} · ${a.command}`
}

function seenLine(s: MotionSeen): string {
  return `${hhmmss(s.at)}  ${s.verdict.padEnd(6)}  ${s.host ?? '-'}  ${s.command}  (${s.why})`
}

function verdictLine(v: Verdict): string {
  if (!v.hold) return `would pass (${v.why})`
  const kinds = [...new Set(v.reasons.map(r => r.kind))].join(', ')
  return `would hold: ${kinds} · ${v.summary}${v.host !== null ? ` · host ${v.host}` : ''} · ${v.isCertain ? 'certain' : 'not certain'}`
}

/** `/motion test "<command>"`: one pair of quotes around the whole text is the person's, not the command's. */
function unwrap(text: string): string {
  const q = text.charAt(0)
  if (text.length >= 2 && (q === '"' || q === "'") && text.endsWith(q) && !text.slice(1, -1).includes(q)) return text.slice(1, -1)
  return text
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'motion',
      description: 'Motion Hold: the config and what is held or running, recent commands, test a command, answer a hold (run, cancel), stop, clear, reload',
      argumentHint: HINT,
      immediate: true,
    })
    await loadConfig($, options)
    try {
      // A row left by a call that is gone; a background launch may still be running.
      await update($, active, a => (a !== null && a.isBackground ? a : null))
      // A card left open by a module that was reloaded mid-hold.
      if (holder.slot() === null) await $.ui.close({ id: PANE })
    } catch {
      // Best effort.
    }
    return started
  }).catch(($, e, next) => next(e))

  // A /clear or a resume puts another conversation in this process: no row of the old one stays.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') await clearActive($).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  // The gate. It judges before it calls next, and its catch refuses where next was not called.
  // Monitor runs a shell command too (a watch whose output lines are events), so
  // its command is judged exactly as a Bash command is; a Monitor that opens a
  // WebSocket and runs no command passes untouched.
  on('tool.call', { tool: ['Bash', 'Monitor'] }, async ($, e, next) => {
    const isWatch = e.tool === 'Monitor'
    if (isWatch && typeof e.command !== 'string') return next(e)
    const text = String(e.command ?? '')
    const cfg = site ?? (await loadConfig($, options))
    const verdict = classify(text, cfg)

    if (!verdict.hold) {
      const host = cfg.status === 'ok' ? hostOf(text, cfg.config.hosts) : null
      // What passed on a configured host is listed, so a gap can be found; the list never blocks a read.
      if (host !== null) await note($, { verdict: 'passed', why: verdict.why, host, command: text }).catch(() => {})
      return next(e)
    }

    const timeoutMs = timeoutOf(options)
    const decision = await holder.request(holdEngine($), next.signal, cardOf(verdict, text, e.agentId !== undefined, timeoutMs, isWatch))
    if (decision !== 'run') {
      const why = whyOf(decision, timeoutMs)
      await note($, { verdict: 'denied', why: `${why}; would ${verdict.summary}`, host: verdict.host, command: text }).catch(() => {})
      return { deny: denyText(why, verdict, isWatch) }
    }

    // Approved, this one call. The row must be up before it runs: a failure here refuses.
    const id = typeof e.tool_use_id === 'string' && e.tool_use_id !== '' ? e.tool_use_id : `hold-${++fallbackIds}`
    // A Monitor watch outlives the call that starts it, as a background Bash launch does.
    const isBackground = isWatch || (e.tool === 'Bash' && e.run_in_background === true)
    const startedAt = await $.clock.now()
    const entry: MotionActive = {
      id,
      kinds: [...new Set(verdict.reasons.map(r => r.kind))],
      summary: verdict.summary,
      host: verdict.host,
      command: clean(text, COMMAND_KEPT),
      startedAt,
      isBackground,
      ...(e.agentId !== undefined ? { agentId: e.agentId } : {}),
    }
    await update($, active, () => entry)
    await note($, { verdict: 'ran', why: verdict.summary, host: verdict.host, command: text }).catch(() => {})
    $.ui.toast('Motion Hold: running it')
    try {
      return await next(e)
    } finally {
      if (!isBackground) {
        try {
          await update($, active, a => (a !== null && a.id === id ? null : a))
        } catch {
          // The row stays; /motion clear removes it.
        }
      }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: FAILED }))

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'motion' }, async ($, e) => {
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
            configLine(await read($, config)),
            slot !== null ? `Hold pending: ${slot.card.what} (/motion run, /motion cancel)` : 'No hold is pending.',
            activeLine(await read($, active)),
          ].join('\n'),
        }
      }
      case 'recent': {
        const list = (await read($, recent)).slice(0, RECENT_SHOWN)
        return { text: list.length > 0 ? list.map(seenLine).join('\n') : 'Nothing yet: no held command, and none that named a configured host.' }
      }
      case 'test': {
        if (rest === '') return { text: `${USAGE}\n/motion test <command> shows the verdict for that text and runs nothing.` }
        return { text: verdictLine(classify(unwrap(rest), site ?? (await loadConfig($, options)))) }
      }
      case 'run':
      case 'cancel': {
        if (!isPerson) return { text: PERSON_ONLY }
        const slot = holder.slot()
        if (slot === null) return { text: 'No hold is pending.' }
        // The slot may have just passed to a hold the person has not read: a
        // typed approval waits until the card has been on screen a while.
        // Cancel only refuses, so it answers at once.
        if (verb === 'run' && slot.decision === null && !canApprove(slot, await $.clock.now())) return { text: JUST_APPEARED }
        if (!holder.decide(slot.id, verb)) return { text: 'That hold is already answered.' }
        $.ui.invalidate('ui.render')
        return { text: verb === 'run' ? 'Running it once.' : 'Cancelled: the command is refused.' }
      }
      case 'stop': {
        if (!isPerson) return { text: 'Only the person can send STOP.' }
        return { text: await stop($) }
      }
      case 'clear': {
        await clearActive($)
        return { text: 'Motion row cleared.' }
      }
      case 'reload': {
        await loadConfig($, options)
        return { text: `Reloaded. ${configLine(await read($, config))}` }
      }
      case 'help':
        return {
          text: [
            USAGE,
            '  /motion              the config, a pending hold, the running motion',
            '  /motion recent       the newest 20 commands that were held or that named a configured host',
            '  /motion test <cmd>   the verdict for that text; it runs nothing',
            '  /motion run|cancel   answer the pending hold (the card\'s buttons)',
            '  /motion stop         run the configured stop command (the row\'s s button)',
            '  /motion clear        remove the STOP row (the row\'s x button)',
            '  /motion reload       read the config file again',
          ].join('\n'),
        }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'motion-hold' }, ($, e, next) =>
    drawCard($, e, () => next(e), holder.slot(), {
      decide: (id, d) => {
        holder.decide(id, d)
        $.ui.invalidate('ui.render')
      },
    }),
  ).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const a = (await $.state.get({ plugin: 'motion-hold', key: 'active' } as const).catch(() => null))?.value ?? null
    if (a === null) return next(e)
    const c = (await $.state.get({ plugin: 'motion-hold', key: 'config' } as const).catch(() => null))?.value ?? NO_CONFIG
    return drawRow($, e, () => next(e), a, c, {
      stop: () => {
        void stop($).catch(() => {})
      },
      clear: () => {
        void clearActive($)
          .then(() => $.ui.toast('Motion row cleared (/motion clear)'))
          .catch(() => {})
      },
    })
  }).catch(($, e, next) => next(e))
}
