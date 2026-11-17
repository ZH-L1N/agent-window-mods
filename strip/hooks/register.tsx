// strip: one strip of quiet pills above the prompt in place of the SYS, PLAN,
// HANDOFF and CACHE rows. It reads the other mods' state (sources.ts), draws
// one row (pills.ts), orders the whole band through the one AbovePromptList
// hook (order.ts), records each turn's edits (diff.ts), keeps the session's
// health (health.ts), opens three panes of its own (panes.tsx) and puts one
// background colour behind the whole band (band.ts). Every
// drawing hook and observer falls back to next(e) on any error, so a bug here
// never blanks the band, hides a row or touches a tool call. Twin: /strip.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, RenderElement, RenderInput } from 'claude-code'

import { BAND_DEFAULT, BAND_NAMES, BAND_OFF, BAND_SHADES, bandColorOf, bandLabel } from './band'
import { STEP_CAP, stepOf } from './diff'
import type { DiffStep } from './diff'
import { healthStep, healthText } from './health'
import type { HealthEvent } from './health'
import { arrangeRows, bareName } from './order'
import { PANES, closePane, drawContextPane, drawDiffPane, drawSystemPane, launchPane, moveSel, openPane, runOther } from './panes'
import type { PaneName } from './panes'
import { C, CAP_L, CAP_R, PILL_IDS, WORK_W, fitStrip, stripText } from './pills'
import type { Pill, PillId } from './pills'
import { readContextData, readFacts, readKeepHandoff, readSystemData, refreshUsage } from './sources'

const steps = atom({ plugin: 'strip', key: 'steps' } as const, [])
const last = atom({ plugin: 'strip', key: 'last' } as const, [])
const sel = atom({ plugin: 'strip', key: 'sel' } as const, 0)
const turnAt = atom({ plugin: 'strip', key: 'turnAt' } as const, null)
const now = atom({ plugin: 'strip', key: 'now' } as const, 0)
const clearedAt = atom({ plugin: 'strip', key: 'clearedAt' } as const, 0)
const health = atom({ plugin: 'strip', key: 'health' } as const, { kind: 'ok' })
const isShowingRows = atom({ plugin: 'strip', key: 'isShowingRows' } as const, false)
const isPanesClear = atom({ plugin: 'strip', key: 'isPanesClear' } as const, true)
const cacheMinutes = atom({ plugin: 'strip', key: 'cacheMinutes' } as const, 60)
const bandColor = atom({ plugin: 'strip', key: 'bandColor' } as const, BAND_SHADES[BAND_DEFAULT])

/** The strip's row in the band. */
export const ROW_KEY = 'zm-10-strip'
export const TICK_MS = 30_000
/** After a /clear, the fresh conversation's own reading is taken this much later. */
export const CLEAR_SETTLE_MS = 500
/** The working pill shows once a turn has run this long. */
export const WORK_DELAY_MS = 5_000
export const WORK_FRAME_MS = 150
/** Panes of the engine's own, which keep their look. */
const ENGINE_PANES: readonly string[] = ['settings', 'changes']

const USAGE = 'Usage: /strip sources | context [close] | system [close] | diff [prev | next | <n> | close] | open <pill> | rows [show | hide] | panes [clear | solid] | band [<shade> | #rrggbb | off]'

// The tick that redraws the cache minutes. A module variable: a reload drops
// the timer with it, and the next main-loop turn starts another.
let ticker: { cancel: () => void } | null = null
function startTick($: EngineInterface): void {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => {
    void $.clock
      .now()
      .then(at => update($, now, () => at))
      .catch(() => {})
  })
}
function stopTick(): void {
  ticker?.cancel()
  ticker = null
}

/** Whether a tool.call result applied: not denied, not errored, not held for review. */
export function isApplied(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false
  const r = res as { deny?: unknown; isError?: unknown; result?: unknown }
  if (r.deny !== undefined || r.isError) return false
  const result = r.result as { staged?: unknown } | null | undefined
  return !(result && typeof result === 'object' && result.staged === true)
}

/** Whether a call beneath answered a refusal (`{ deny }`) rather than a value. */
const isRefused = (res: unknown): boolean => !!res && typeof res === 'object' && 'deny' in res

/** One event into the session's health; written only when it changed something. */
async function feedHealth($: EngineInterface, ev: HealthEvent): Promise<void> {
  const cur = await read($, health)
  const after = healthStep(cur, ev)
  if (after !== cur) await update($, health, () => after)
}

/** The options, then what /strip rows, /strip panes and /strip band kept in the store, which wins. */
async function loadChoices($: EngineInterface, options: PluginOptions): Promise<void> {
  const rows = await $.store.get('rows').catch(() => undefined)
  const panes = await $.store.get('panes').catch(() => undefined)
  const isShowing = rows === 'show' || rows === 'hide' ? rows === 'show' : options.rows === 'show'
  const isClear = panes === 'clear' || panes === 'solid' ? panes === 'clear' : options.transparentPanes !== false
  await update($, isShowingRows, () => isShowing)
  await update($, isPanesClear, () => isClear)
  // A stored choice that no longer reads falls through to the option, then to the default.
  const band = await $.store.get('band').catch(() => undefined)
  const color = bandColorOf(band) ?? bandColorOf(options.bandColor) ?? BAND_SHADES[BAND_DEFAULT]
  await update($, bandColor, () => color)
}

/** cache-clock's prompt-cache lifetime, from its row of the config menu: `5` gives 5, anything else or no row 60. */
async function loadCacheMinutes($: EngineInterface): Promise<void> {
  const rows = await $.config.list().catch(() => [])
  const value = rows.find(r => r.key === 'cache-clock.cacheMinutes')?.value
  await update($, cacheMinutes, () => (String(value) === '5' ? 5 : 60))
}

/** What a press on a pill does, and `/strip open <pill>` with it. Answers what it did. */
export async function pressPill($: EngineInterface, id: PillId): Promise<string> {
  const twin = `/strip open ${id}`
  const isListed = async (command: string): Promise<boolean> => (await $.command.list().catch(() => [])).some(c => c.name === command)
  switch (id) {
    case 'stop':
      return runOther($, 'motion', 'status', twin)
    case 'context':
      return launchPane($, 'context')
    case 'cache':
      return (await isListed('compact-offer')) ? runOther($, 'compact-offer', '', twin) : runOther($, 'cache-clock', 'status', twin)
    case 'diff':
      return launchPane($, 'diff')
    case 'tests': {
      if (await isListed('tests')) return runOther($, 'tests', '', twin)
      const text = `tests: the redgreen mod is not loaded (${twin})`
      $.ui.toast(text)
      return text
    }
    case 'agents':
      return runOther($, 'agents-info', 'open', twin)
    case 'queue':
      return runOther($, 'q', 'pane', twin)
    case 'system':
      return launchPane($, 'system')
    case 'peers':
      return runOther($, 'peer-alarm', 'board', twin)
    case 'health': {
      const h = await read($, health)
      const text = h.kind === 'ok' ? `health: nothing is wrong (${twin})` : `${healthText(h)}: ${h.detail} (${twin})`
      $.ui.toast(text)
      return text
    }
  }
}

/** The rows switch in words, as /strip sources and /strip rows say it. */
const rowsSentence = (isShowing: boolean): string =>
  isShowing
    ? 'Old SYS, PLAN, HANDOFF and CACHE rows: shown under the strip (/strip rows hide).'
    : 'Old SYS, PLAN, HANDOFF and CACHE rows: hidden; a HANDOFF row with something to act on still shows (/strip rows show).'

/** The panes switch in words, as /strip sources and /strip panes say it. */
const panesSentence = (isClear: boolean): string =>
  isClear ? 'Panes: no background fill (/strip panes solid).' : 'Panes: solid, as each surface draws them (/strip panes clear).'

/** The band's background in words, as /strip sources and /strip band say it. */
const bandSentence = (color: string): string =>
  color === BAND_OFF ? 'Band background: none (/strip band <shade | #rrggbb>).' : `Band background: ${bandLabel(color)}, behind every row (/strip band off).`

/** /strip sources: the strip as text, where each pill's value came from, and the three switches. */
async function sourcesText($: EngineInterface): Promise<string> {
  const { facts, sources } = await readFacts($)
  const { level, pills } = fitStrip(facts, 1_000, 0)
  const isShowing = await read($, isShowingRows)
  const isClear = await read($, isPanesClear)
  const band = await read($, bandColor)
  return [
    `strip, level ${level} at full width:`,
    `  ${stripText(pills)}`,
    ...PILL_IDS.map(id => `  ${id}: ${sources[id]}`),
    rowsSentence(isShowing),
    panesSentence(isClear),
    bandSentence(band),
    USAGE,
  ].join('\n')
}

/** /strip context | system | diff: opens the pane, or closes it. Typed by the person, so no twin is queued behind it. */
async function paneCommand($: EngineInterface, name: PaneName, arg: string): Promise<string> {
  const title = PANES[name].title
  if (arg === 'close') {
    await closePane($, name)
    return `${title} pane closed.`
  }
  const isPlaced = await openPane($, name)
  if (name === 'context') await refreshUsage($).catch(() => {})
  return isPlaced ? `${title} pane opened.` : `${title} pane is waiting for room: it opens once the terminal is wide enough.`
}

async function runStrip($: EngineInterface, args: string): Promise<string> {
  const [verb = 'sources', arg = ''] = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  switch (verb) {
    case 'sources':
    case 'status':
      return sourcesText($)
    case 'context':
    case 'system':
      if (arg !== '' && arg !== 'close') return `Usage: /strip ${verb} [close]`
      return paneCommand($, verb, arg)
    case 'diff':
      if (arg === 'prev') return moveSel($, { by: -1 })
      if (arg === 'next') return moveSel($, { by: 1 })
      if (/^\d+$/.test(arg)) return moveSel($, { to: Number(arg) })
      if (arg !== '' && arg !== 'close') return 'Usage: /strip diff [prev | next | <n> | close]'
      return paneCommand($, 'diff', arg)
    case 'open': {
      const id = PILL_IDS.find(p => p === arg)
      if (!id) return `Usage: /strip open ${PILL_IDS.join(' | ')}`
      return pressPill($, id)
    }
    case 'rows': {
      if (arg === 'show' || arg === 'hide') {
        await update($, isShowingRows, () => arg === 'show')
        await $.store.set('rows', arg).catch(() => {})
      } else if (arg !== '') {
        return 'Usage: /strip rows [show | hide]'
      }
      return rowsSentence(await read($, isShowingRows))
    }
    case 'panes': {
      if (arg === 'clear' || arg === 'solid') {
        await update($, isPanesClear, () => arg === 'clear')
        await $.store.set('panes', arg).catch(() => {})
      } else if (arg !== '') {
        return 'Usage: /strip panes [clear | solid]'
      }
      return panesSentence(await read($, isPanesClear))
    }
    case 'band': {
      if (arg !== '') {
        const color = bandColorOf(arg)
        if (color === null) return `Usage: /strip band [${BAND_NAMES.join(' | ')} | #rrggbb | off]`
        await update($, bandColor, () => color)
        await $.store.set('band', arg).catch(() => {})
      }
      return bandSentence(await read($, bandColor))
    }
    default:
      return USAGE
  }
}

/** One pill: a plain Button (no frame, no hotkey) whose children are the caps and the body. */
function pillNode($: EngineInterface, e: RenderInput<'AbovePrompt'>, p: Pill): RenderElement {
  const { Button, Text } = $.ui.resolve(e)
  const bg = p.isAttention ? p.color : C.surface
  return (
    <Button key={`sp-${p.id}`} label={p.id} plain onPress={() => void pressPill($, p.id).catch(() => {})}>
      <Text color={bg}>{CAP_L}</Text>
      {p.segs.map(s => (
        <Text color={p.isAttention ? C.ink : (s.color ?? p.color)} backgroundColor={bg} {...(p.isAttention ? { bold: true } : {})}>
          {s.text}
        </Text>
      ))}
      <Text color={bg}>{CAP_R}</Text>
    </Button>
  )
}

/** Moves steps recorded outside a finished turn onto the end of `last` (newest STEP_CAP kept); the selection stays on a valid step. */
async function keepLate($: EngineInterface): Promise<void> {
  let late: DiffStep[] = []
  await update($, steps, s => {
    late = s
    return []
  })
  if (late.length === 0) return
  await update($, last, l => [...l, ...late].slice(-STEP_CAP))
  const kept = (await read($, last)).length
  await update($, sel, i => Math.max(0, Math.min(i, kept - 1)))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Each step by itself: one that fails leaves the others standing.
    await $.command
      .register({
        name: 'strip',
        description: 'The pill strip above the prompt: where each pill reads its value, its three panes, and the old rows',
        argumentHint: 'sources | context | system | diff | open <pill> | rows | panes | band',
        immediate: true,
      })
      .catch(() => {})
    // State lives for the session and survives a reload: no stale working pill, steps or alert.
    await update($, steps, () => []).catch(() => {})
    await update($, turnAt, () => null).catch(() => {})
    await update($, health, () => ({ kind: 'ok' })).catch(() => {})
    await loadChoices($, options).catch(() => {})
    await refreshUsage($).catch(() => {})
    await loadCacheMinutes($).catch(() => {})
    await $.clock
      .now()
      .then(at => update($, now, () => at))
      .catch(() => {})
    stopTick()
    startTick($)
    return started
  }).catch(($, e, next) => next(e))

  // After each main-loop turn and when a rate-limit window moves.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await refreshUsage($).catch(() => {})
    try {
      const at = await $.clock.now()
      await feedHealth($, { type: 'limits', limits: Array.isArray(e.rateLimits) ? e.rateLimits : [], at })
    } catch {
      // Bookkeeping only.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const at = await $.clock.now()
        // Steps still here were recorded outside a finished turn (a turn that never
        // completed, or an edit that raced the last turn's end): they join `last`
        // instead of being dropped. Only then is the turn marked, so an edit that
        // lands between the two writes still sees no turn and joins `last` itself.
        await keepLate($)
        await update($, turnAt, () => at)
        startTick($)
      } catch {
        // Bookkeeping only.
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      // In finally: a rejection beneath must not leave the working pill running.
      if (e.agentId === undefined) {
        try {
          const at = await $.clock.now()
          await feedHealth($, { type: 'turn', reason: e.reason, at })
        } catch {
          // Bookkeeping only.
        }
        try {
          // The turn's steps are taken in one write, so none can slip in between a
          // read and a clear. An edit that lands after it, while the turn is still
          // marked, goes onto `steps` again and is picked up by keepLate below, or by
          // the recorder's own keepLate when its write lands later still; one that
          // lands after the mark is gone joins `last` by itself.
          let done: DiffStep[] = []
          await update($, steps, s => {
            done = s
            return []
          })
          if (done.length > 0) {
            await update($, last, () => done)
            await update($, sel, () => 0)
          }
          await update($, turnAt, () => null)
          await keepLate($)
        } catch {
          // Bookkeeping only.
        }
      }
    }
  }).catch(($, e, next) => next(e))

  // A main-loop turn that died on an API error: the one place the engine names the error. Observe only.
  on('classic.StopFailure', async ($, e, next) => {
    if (e.agent_id === undefined) {
      try {
        const at = await $.clock.now()
        await feedHealth($, { type: 'stop-failure', error: String(e.error), at })
      } catch {
        // Bookkeeping only.
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A /clear (or an in-process resume) ends the conversation and starts another
  // in the same process with no session.start: the old context readings become
  // stale and the diff starts over. Any other end stops the tick.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      $.clock.after(CLEAR_SETTLE_MS, () => {
        void (async () => {
          const at = await $.clock.now()
          await update($, clearedAt, () => at)
          await update($, steps, () => [])
          await update($, last, () => [])
          await update($, sel, () => 0)
          await update($, turnAt, () => null)
          await refreshUsage($)
        })().catch(() => {})
      })
    } else {
      stopTick()
    }
    return result
  }).catch(($, e, next) => next(e))

  // The diff recorder: applied edits only (not denied, errored or held for
  // review), a subagent's too. It observes: the call's result goes on untouched.
  // An edit applied while no main-loop turn runs (a background subagent's)
  // joins the last turn's steps at once, so the next turn.start does not drop it.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const res = await next(e)
    try {
      // Read loosely: with the connected tools' types laid in, the matcher's input is a union whose members do not all name `tool`.
      const tool = (e as { tool?: unknown }).tool === 'Write' ? 'Write' : 'Edit'
      const step = isApplied(res) ? stepOf(tool, (res as { result?: unknown }).result) : null
      if (step && (await read($, turnAt)) === null) {
        await update($, last, l => [...l, step].slice(-STEP_CAP))
        const kept = (await read($, last)).length
        await update($, sel, i => Math.max(0, Math.min(i, kept - 1)))
      } else if (step) {
        await update($, steps, s => [...s, step].slice(-STEP_CAP))
        // The turn may have ended while that write was on its way, after its own
        // keepLate ran: then nothing would move this step before the next turn starts.
        if ((await read($, turnAt)) === null) await keepLate($)
      }
    } catch {
      // Bookkeeping only.
    }
    return res
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'strip' }, async ($, e) => {
    try {
      return { text: await runStrip($, e.args) }
    } catch {
      return { text: `strip: that did not work. ${USAGE}` }
    }
  })

  // The strip's row: its own keyed Box and nothing else. The list hook below places it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const { facts } = await readFacts($)
    const startedAt = await read($, turnAt)
    const columns = e.props.bodyColumns > 0 ? e.props.bodyColumns : 80
    const { pills } = fitStrip(facts, columns, startedAt === null ? 0 : WORK_W)
    const drawnAt = startedAt === null ? 0 : await $.clock.now()
    const { Box, Client } = $.ui.resolve(e)
    return (
      <Box key={ROW_KEY} flexDirection="row" overflow="hidden">
        <Box flexDirection="row" gap={1} flexShrink={0}>
          {pills.map(p => pillNode($, e, p))}
        </Box>
        {startedAt === null ? null : (
          <Client
            key="sp-work"
            module="./spin.tsx"
            props={{ startedAt, now: drawnAt, delayMs: WORK_DELAY_MS, frameMs: WORK_FRAME_MS }}
            width={WORK_W}
            height={1}
          />
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The band's arrangement: only rows it was handed, each at most once and
  // unchanged. Nothing is hidden or moved unless the strip drew its own row.
  // Another plugin's list hook nests with this one: the strip arranges what it
  // is handed and does not undo what a hook above it did.
  //
  // Then the band's background: the answer from beneath, wrapped in one Box
  // that carries a colour and nothing else (the engine refuses a wrapper that
  // sets a width). It wraps whenever the band has a row, also when the strip
  // drew none; never on a survey or another surface.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const rows = e.props.rows
    let arranged: typeof rows = rows
    if (rows.some(r => bareName(r.plugin) === 'strip')) {
      const showOld = await read($, isShowingRows)
      const keepHandoff = showOld ? true : await readKeepHandoff($).catch(() => true)
      arranged = arrangeRows(rows, { showOld, keepHandoff })
    }
    const isSame = arranged.length === rows.length && arranged.every((r, i) => r === rows[i])
    const input = isSame ? e : { ...e, props: { ...e.props, rows: arranged } }
    // A value that is no colour (a read that failed) draws none.
    const color = arranged.length === 0 ? BAND_OFF : (bandColorOf(await read($, bandColor).catch(() => BAND_OFF)) ?? BAND_OFF)
    if (color === BAND_OFF) return next(input)
    const inner = await next(input)
    const { Box } = $.ui.resolve(e)
    return <Box backgroundColor={color}>{inner}</Box>
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'strip-context' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    return drawContextPane($, e, await readContextData($))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'strip-system' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    return drawSystemPane($, e, await readSystemData($))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'strip-diff' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    return drawDiffPane($, e, { steps: await read($, last), sel: await read($, sel), running: (await read($, steps)).length })
  }).catch(($, e, next) => next(e))

  // Panes without a fill: an open that names no background colour gets
  // "transparent". The engine's own panes and an open that chose a colour are
  // left alone. Should the surface refuse the addition (it answers a deny, or
  // the call throws), the open goes on as it came. A deny does not say what it
  // was about, so any deny is asked again without the colour: a hook beneath
  // that refuses an open for its own reasons runs twice for that one open, and
  // its second answer is the one passed on. That is the price of never letting
  // the added colour block another mod's pane. The strip's own opens carry
  // the colour themselves (panes.tsx): a plugin's hook does not hear its own call.
  on('ui.open', async ($, e, next) => {
    if (ENGINE_PANES.includes(e.id) || e.backgroundColor !== undefined) return next(e)
    if (!(await read($, isPanesClear))) return next(e)
    try {
      const res = await next({ ...e, backgroundColor: 'transparent' })
      return isRefused(res) ? next(e) : res
    } catch {
      return next(e)
    }
  }).catch(($, e, next) => next(e))
}
