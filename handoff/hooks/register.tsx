// The handoff mod: the ⇄ HANDOFF row (row.tsx draws it), the save, clear and
// resume flow around HANDOFF.md in the session root, the compaction warning
// and /handoff-line. The context reading is token-weather's (its
// token-weather.context state); while token-weather publishes none, this mod
// reads $.session.usage itself on the same events.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { HandoffContext, HandoffSave, HandoffSettings } from '../types'
import {
  COMMAND,
  FRESH_MS,
  OWN_COMMAND,
  RESUME_PROMPT,
  WATCH_FOR_MS,
  WATCH_MS,
  ageText,
  fillOf,
  fmtTokens,
  handoffPath,
  hhmm,
  isThreshold,
  newest,
  objectiveOf,
  readingOf,
  rootKey,
  savePrompt,
  settingsOf,
} from './kit'
import { drawRow } from './row'

const context = atom({ plugin: 'handoff', key: 'context' } as const, null)
const save = atom({ plugin: 'handoff', key: 'save' } as const, { phase: 'idle', requestedAt: 0, baseMtime: 0, savedAt: 0, via: '' })
const offer = atom({ plugin: 'handoff', key: 'offer' } as const, null)
const isOver = atom({ plugin: 'handoff', key: 'isOver' } as const, false)
const clearedAt = atom({ plugin: 'handoff', key: 'clearedAt' } as const, 0)
const SETTINGS = { plugin: 'handoff', key: 'settings' } as const
const TW_CONTEXT = { plugin: 'token-weather', key: 'context' } as const

const STORE_BAND = 'handoff.band'
const STORE_MODE = 'handoff.mode'
const STORE_THRESHOLD = 'handoff.threshold'
const lastSaveKey = (root: string) => `handoff.lastSave.${rootKey(root)}`

/** After an event, the reading and the crossing are looked at this much later, once every plugin's hook has run. */
const SETTLE_MS = 250
/** After a /clear, the fresh session's reading is taken this much later. */
const CLEAR_SETTLE_MS = 500

// The watch on HANDOFF.md while a save is being written. A reload drops it
// with the environment; session.start (raised again for a fresh load) starts
// it again while a save is still being written.
let watch: Timer | null = null

const stopWatch = () => {
  watch?.cancel()
  watch = null
}

async function settingsNow($: EngineInterface, options: PluginOptions): Promise<HandoffSettings> {
  return (await $.state.get(SETTINGS)).value ?? settingsOf(options)
}

/** The options, overridden by what /handoff-line kept in the store. */
async function loadSettings($: EngineInterface, options: PluginOptions): Promise<HandoffSettings> {
  const stored = { band: await $.store.get(STORE_BAND), mode: await $.store.get(STORE_MODE), threshold: await $.store.get(STORE_THRESHOLD) }
  const next = settingsOf(options, stored)
  await $.state.set(SETTINGS, next)
  return next
}

async function mtimeOf($: EngineInterface, path: string): Promise<number> {
  try {
    const st = await $.fs.stat(path)
    return st.kind === 'file' ? st.mtimeMs : 0
  } catch {
    return 0
  }
}

/** The reading the row draws: token-weather's or this mod's, whichever is newer since the last /clear. */
async function readingNow($: EngineInterface): Promise<HandoffContext | null> {
  return (await pickReading($)).r
}

/** The reading and whether it is token-weather's. */
async function pickReading($: EngineInterface): Promise<{ r: HandoffContext | null; isTw: boolean }> {
  const tw = (await $.state.get(TW_CONTEXT)).value
  const r = newest(tw, await read($, context), await read($, clearedAt))
  return { r, isTw: r !== null && r === tw }
}

/** This mod's own reading; a `summary` breakdown is estimated locally and sends no request. */
async function ownReading($: EngineInterface): Promise<void> {
  try {
    const r = readingOf(await $.session.usage({ breakdown: 'summary' }), await $.clock.now())
    if (r) await update($, context, () => r)
  } catch {
    // The row keeps the last reading it had.
  }
}

/** Takes a reading of its own while token-weather has none since the last /clear, then checks the crossing. */
async function refresh($: EngineInterface, options: PluginOptions): Promise<void> {
  const tw = (await $.state.get(TW_CONTEXT)).value
  if (!tw || tw.readAt < (await read($, clearedAt))) await ownReading($)
  await crossing($, options)
}

/** One toast per crossing of the threshold; in `auto` mode the save starts by itself. */
async function crossing($: EngineInterface, options: PluginOptions): Promise<void> {
  const r = await readingNow($)
  if (!r) return
  const s = await settingsNow($, options)
  const isAbove = fillOf(r) >= s.threshold
  const was = await read($, isOver)
  if (isAbove === was) return
  await update($, isOver, () => isAbove)
  if (!isAbove) return
  // A save from an earlier crossing is done with: the row offers save now
  // again and auto mode saves again. savedAt stays for the record.
  await update($, save, (v): HandoffSave => (v.phase === 'saved' ? { ...v, phase: 'idle' } : v))
  if (s.band === 'off') return
  if (s.mode === 'auto' && (await read($, save)).phase === 'idle') {
    $.ui.toast(`Chat is ${s.threshold}% full, saving a handoff (/handoff-line status)`)
    await requestSave($)
  } else {
    $.ui.toast(`Chat is ${s.threshold}% full, save a handoff (/handoff-line now)`)
  }
}

async function hasOwnCommand($: EngineInterface): Promise<boolean> {
  try {
    return (await $.command.list()).some(c => c.name === OWN_COMMAND)
  } catch {
    return false
  }
}

/**
 * Asks for a handoff: the person's /handoff command when there is one, else a
 * prompt asking Claude to write HANDOFF.md in the session root. The run is
 * made from a timer, never inside a hook; then HANDOFF.md is watched.
 */
async function requestSave($: EngineInterface): Promise<{ via: 'command' | 'prompt'; root: string }> {
  const root = await $.session.root()
  const baseMtime = await mtimeOf($, handoffPath(root))
  const via = (await hasOwnCommand($)) ? 'command' : 'prompt'
  const requestedAt = await $.clock.now()
  await update($, save, () => ({ phase: 'saving', requestedAt, baseMtime, savedAt: 0, via }))
  await update($, offer, () => null)
  $.clock.after(10, () => {
    const run = via === 'command' ? $.command.run({ command: OWN_COMMAND, args: '' }) : $.prompt.submit({ text: savePrompt(root) })
    void Promise.resolve(run).catch(() => {})
  })
  startWatch($)
  return { via, root }
}

function startWatch($: EngineInterface): void {
  stopWatch()
  watch = $.clock.every(WATCH_MS, () => {
    void checkSaved($).catch(() => {})
  })
}

/** While a save is being written: HANDOFF.md newer than when it was asked marks it saved. */
async function checkSaved($: EngineInterface): Promise<void> {
  const s = await read($, save)
  if (s.phase !== 'saving') {
    stopWatch()
    return
  }
  const root = await $.session.root()
  const m = await mtimeOf($, handoffPath(root))
  if (m > s.baseMtime) {
    stopWatch()
    // The watch tick and turn.complete can both get here: only the one whose
    // write moves 'saving' to 'saved' records it and toasts.
    let isMine = false as boolean
    await update($, save, (v): HandoffSave => {
      isMine = v.phase === 'saving'
      return isMine ? { ...v, phase: 'saved', savedAt: m } : v
    })
    if (!isMine) return
    await $.store.set(lastSaveKey(root), m)
    $.ui.toast(`Handoff saved ${hhmm(m)} (clear & continue: /clear, then /handoff-line resume)`)
    return
  }
  if ((await $.clock.now()) - s.requestedAt > WATCH_FOR_MS) {
    stopWatch()
    await update($, save, (v): HandoffSave => ({ ...v, phase: 'idle' }))
    $.ui.toast('No HANDOFF.md was written (/handoff-line now to try again)')
  }
}

/** A handoff saved in the last ten minutes: by this mod's record or by HANDOFF.md's own time. */
async function isFresh($: EngineInterface): Promise<boolean> {
  const root = await $.session.root()
  const recorded = Number(await $.store.get(lastSaveKey(root))) || 0
  const last = Math.max(recorded, await mtimeOf($, handoffPath(root)))
  return last > 0 && (await $.clock.now()) - last < FRESH_MS
}

/** The resume offer from HANDOFF.md in the session root; false when there is none. */
async function makeOffer($: EngineInterface, isToasted: boolean): Promise<boolean> {
  const root = await $.session.root()
  const path = handoffPath(root)
  const mtimeMs = await mtimeOf($, path)
  if (!mtimeMs) {
    await update($, offer, () => null)
    return false
  }
  let objective = ''
  try {
    const text = await $.fs.read(path)
    objective = typeof text === 'string' ? objectiveOf(text) : ''
  } catch {
    // An offer with no objective still resumes.
  }
  const age = ageText((await $.clock.now()) - mtimeMs)
  await update($, offer, () => ({ mtimeMs, age, objective }))
  if (isToasted) $.ui.toast(`Handoff from ${age} available (/handoff-line resume)`)
  return true
}

function resume($: EngineInterface): void {
  void update($, offer, () => null).catch(() => {})
  $.clock.after(10, () => {
    void $.prompt.submit({ text: RESUME_PROMPT }).catch(() => {})
  })
}

function clearAndContinue($: EngineInterface): void {
  // The fresh session's resume offer comes from the session.end hook, as for any /clear.
  $.clock.after(10, () => {
    void $.command.run({ command: 'clear', args: '' }).catch(() => {})
  })
}

/** After a /clear: the old reading is stale, the save is done with, and the new session gets the offer. */
async function afterClear($: EngineInterface, options: PluginOptions): Promise<void> {
  stopWatch()
  const at = await $.clock.now()
  await update($, clearedAt, () => at)
  await update($, isOver, () => false)
  await update($, save, () => ({ phase: 'idle', requestedAt: 0, baseMtime: 0, savedAt: 0, via: '' }))
  await ownReading($)
  const s = await settingsNow($, options)
  if (s.band === 'on') await makeOffer($, true)
}

async function statusText($: EngineInterface, options: PluginOptions): Promise<string> {
  const s = await settingsNow($, options)
  const { r, isTw } = await pickReading($)
  const root = await $.session.root()
  const path = handoffPath(root)
  const m = await mtimeOf($, path)
  const now = await $.clock.now()
  const sv = await read($, save)
  const lines = [`HANDOFF line: ${s.band} · mode ${s.mode} · threshold ${s.threshold}% of the compaction point`]
  if (r) {
    const at = r.autoCompactThreshold && r.autoCompactThreshold > 0 ? r.autoCompactThreshold : r.maxTokens
    const source = isTw ? 'token-weather' : 'its own reading'
    lines.push(
      `Context: ${fillOf(r)}% of the compaction point (${fmtTokens(r.totalTokens)} of ${fmtTokens(at)}; ${r.percent}% of the ${fmtTokens(r.maxTokens)} window), from ${source}`,
    )
  } else {
    lines.push('Context: no reading yet')
  }
  const state = sv.phase === 'saving' ? ' (being written)' : ''
  lines.push(m ? `HANDOFF.md: ${path}, saved ${hhmm(m)} (${ageText(now - m)})${state}` : `HANDOFF.md: none in ${root}${state}`)
  lines.push(`Save now: ${(await hasOwnCommand($)) ? 'runs your /handoff command' : 'asks Claude to write HANDOFF.md'}`)
  return lines.join('\n')
}

const USAGE = `Usage: /${COMMAND} on | off | now | resume | threshold <50-95> | mode auto|ask | status | reset`

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'handoff-line',
      description: 'HANDOFF row: save a handoff to HANDOFF.md now, resume from one, or set the threshold and mode',
      argumentHint: 'on | off | now | resume | threshold <n> | mode auto|ask | status',
    })
    const s = await loadSettings($, options)
    const sv = await read($, save)
    if (sv.phase === 'saving') startWatch($)
    // A fresh session (no prompt yet) with a HANDOFF.md in its root gets the offer.
    if (s.band === 'on' && sv.phase === 'idle' && (await $.session.turns()) === 0) await makeOffer($, true)
    $.clock.after(SETTLE_MS, () => {
      void refresh($, options).catch(() => {})
    })
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    $.clock.after(SETTLE_MS, () => {
      void (async () => {
        if ((await read($, save)).phase === 'saving') await checkSaved($)
        // The person moved on: the offer was for the session's start.
        if ((await read($, offer)) !== null) await update($, offer, () => null)
        await refresh($, options)
      })().catch(() => {})
    })
    return result
  })

  // Before a compaction of the main conversation: a warning when no handoff is fresh. Never a veto.
  on('session.compact', async ($, e, next) => {
    const isMain = e.agentId === undefined && e.trigger !== 'precompute'
    if (isMain && (await settingsNow($, options)).band === 'on' && !(await isFresh($))) {
      $.ui.toast('Compacting without a fresh handoff')
    }
    const result = await next(e)
    if (isMain && result && typeof (result as { skip?: unknown }).skip !== 'string') {
      $.clock.after(SETTLE_MS, () => {
        void refresh($, options).catch(() => {})
      })
    }
    return result
  }).catch(($, e, next) => next(e)) // A failed warning never changes the compaction.

  // A /clear ends the conversation and starts another with no session.start.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') {
      $.clock.after(CLEAR_SETTLE_MS, () => {
        void afterClear($, options).catch(() => {})
      })
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'handoff-line' }, async ($, e) => {
    const [verb = 'status', arg = ''] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const setSettings = async (change: Partial<HandoffSettings>) => {
      const s = await settingsNow($, options)
      await $.state.set(SETTINGS, { ...s, ...change })
    }
    switch (verb) {
      case 'on':
      case 'off':
        await $.store.set(STORE_BAND, verb)
        await setSettings({ band: verb })
        return { text: verb === 'on' ? 'HANDOFF line on.' : 'HANDOFF line off (no row, no toasts; /handoff-line now still saves).' }
      case 'now': {
        // A save still inside its watch window is not asked twice; past it (a
        // stalled save) a new one may be asked.
        const sv = await read($, save)
        if (sv.phase === 'saving' && (await $.clock.now()) - sv.requestedAt <= WATCH_FOR_MS) {
          return { text: 'A handoff is already being written (/handoff-line status).' }
        }
        const { via, root } = await requestSave($)
        return { text: via === 'command' ? 'Saving a handoff: running /handoff.' : `Saving a handoff: asked Claude to write ${handoffPath(root)}.` }
      }
      case 'resume': {
        if (!(await makeOffer($, false))) return { text: `No ${'HANDOFF.md'} in ${await $.session.root()}.` }
        const o = await read($, offer)
        resume($)
        return { text: `Resuming from HANDOFF.md (${o?.age ?? 'saved earlier'}).` }
      }
      case 'threshold': {
        const n = Number(arg)
        if (!isThreshold(n)) return { text: 'Threshold must be a whole number from 50 to 95 (percent of the compaction point).' }
        await $.store.set(STORE_THRESHOLD, n)
        await setSettings({ threshold: n })
        await crossing($, options)
        return { text: `Threshold ${n}% of the compaction point.` }
      }
      case 'mode':
        if (arg !== 'auto' && arg !== 'ask') return { text: 'Mode is auto or ask.' }
        await $.store.set(STORE_MODE, arg)
        await setSettings({ mode: arg })
        return { text: arg === 'auto' ? 'Mode auto: a handoff is saved by itself at the threshold.' : 'Mode ask: the row turns red and offers save now at the threshold.' }
      case 'status':
        return { text: await statusText($, options) }
      case 'reset':
        for (const k of [STORE_BAND, STORE_MODE, STORE_THRESHOLD]) await $.store.delete(k)
        await loadSettings($, options)
        return { text: 'HANDOFF line settings back to the plugin options.' }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) =>
    drawRow($, e, () => next(e), options, {
      save: () => {
        void requestSave($).catch(() => {})
      },
      clearAndContinue: () => clearAndContinue($),
      resume: () => resume($),
    }),
  )
}
