// queue: a prompt queue with no model call.
//
// /q <text> appends a prompt (never a slash command, which starts no turn
// and would leave the send-in-flight flag up). When a main-loop turn ends
// with an answer and the queue is non-empty and not paused, item 1 is taken
// out and submitted through
// $.prompt.submit (asUser), from a $.clock timer, never inside the hook. It is
// never sent while a subagent runs (the agents mod's `agents.runs`): the send
// waits and looks again. A main-loop turn that was interrupted, errored or
// refused pauses the queue with a toast. A ≡ QUEUE row above the prompt
// (zm-85-queue) and a pane (id queue) show and manage it; every button has a
// /q twin.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, Register, Timer } from 'claude-code'

import {
  AGENT_RETRY_MS,
  COMMAND,
  EMPTY,
  PANE,
  PANE_TITLE,
  PAUSE_TOAST,
  USAGE,
  cut,
  isAgentBusy,
  listText,
  normalize,
  oneLine,
  parseArgs,
  putBack,
  reduce,
  take,
  turnVerdict,
} from './queue'
import type { QueueAction } from './queue'
import type { QueueState } from '../types'

const queue = atom({ plugin: 'queue', key: 'queue' } as const, EMPTY)
/** The agents mod's runs: read only, typed in types/peer.d.ts. */
const AGENT_RUNS = { plugin: 'agents', key: 'runs' } as const

/** The row's key: its place in the band order the strip keeps. */
const ROW_KEY = 'zm-85-queue'
const CHIP = ' ≡ QUEUE   ' // the word padded so the chip is 11 cells wide, like every zehui-mods chip
const CHIP_FG = '#0b0b0f'
const CHIP_BG = '#93c5fd'
const PAUSED_COLOR = '#facc15'
const WAITING_TEXT = 'waiting on agents'
/** The delay between a hook and the work it schedules. */
const DELAY_MS = 10
/** While a survey holds the band, a send waits this long and looks again, at most this many times. */
export const SURVEY_RETRY_MS = 2_000
export const SURVEY_RETRIES = 30

// What the last terminal band render said: a survey holds the band. The band
// is drawn again whenever its props change, so this follows the survey
// closely. A drawing may not write state, so this one stays in the module.
let isSurveyUp = false
// The one pending turn-end send (its first wait, a survey retry or an agents
// retry). Only one ever exists: scheduling another cancels it, so retries
// never pile up into two sends, and a new main-loop turn, a pause, an empty
// queue or the session's end cancels it.
let autoTimer: Timer | null = null
// Raised by every cancel: a send whose epoch is gone writes no wait and
// schedules nothing, so a cancelled wait cannot come back.
let epoch = 0

// The take section of every send (a manual send's cancel, the take's state
// update, the automatic send's re-check and any put-back) runs on this one
// chain, so an automatic take and a manual one never interleave. Each link
// is caught, so the chain never rejects; the submit runs outside it.
let takes: Promise<unknown> = Promise.resolve()

function inTakeOrder<T>(fn: () => Promise<T>): Promise<T> {
  const run = takes.then(fn)
  takes = run.catch(() => {})
  return run
}

function cancelAuto(): void {
  autoTimer?.cancel()
  autoTimer = null
  epoch++
}

/** Schedules the turn-end send of item 1 after `ms`, replacing any pending one. */
function scheduleAuto($: EngineInterface, ms: number, tries: number): void {
  cancelAuto()
  const mine = epoch
  autoTimer = $.clock.after(ms, () => {
    autoTimer = null
    void send($, 1, true, tries, mine).catch(() => {})
  })
}

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The queue as this version reads it (fields a reload left out filled in). */
const load = async ($: EngineInterface): Promise<QueueState> => normalize(await read($, queue))

/** Applies one reducer action; answers its note. A paused or empty queue ends any wait. */
async function act($: EngineInterface, a: QueueAction): Promise<string> {
  let note = ''
  let isIdle = false
  await update($, queue, (cur): QueueState => {
    const r = reduce(normalize(cur), a)
    note = r.note
    isIdle = r.state.isPaused || r.state.items.length === 0
    return isIdle ? { ...r.state, waitingOn: '' } : r.state
  })
  if (isIdle) cancelAuto()
  return note
}

/** Clears the send in flight (with `isSending`) and the wait; writes only when something changes. */
async function clearFlags($: EngineInterface, isSendingToo: boolean): Promise<void> {
  const s = await load($)
  if (s.waitingOn === '' && (!isSendingToo || !s.isSending)) return
  await update($, queue, (cur): QueueState => {
    const n = normalize(cur)
    return { ...n, waitingOn: '', isSending: isSendingToo ? false : n.isSending }
  })
}

/**
 * Says what the automatic send waits on, unless its wait was cancelled
 * meanwhile (`mine` no longer the epoch): the check runs inside the
 * compare-and-set, so a cancel's own write and this one never cross.
 */
async function setWaiting($: EngineInterface, waitingOn: QueueState['waitingOn'], mine: number): Promise<void> {
  await update($, queue, cur => {
    const n = normalize(cur)
    return mine !== epoch || n.waitingOn === waitingOn ? n : { ...n, waitingOn }
  })
  // A cancel that read the value before this write landed left it standing,
  // and no retry is pending to own it: clear it.
  if (mine !== epoch && autoTimer === null) await clearFlags($, false)
}

/** Submits `text` as the person's own prompt; a drop puts it back first in line and pauses. */
async function submit($: EngineInterface, text: string): Promise<void> {
  const putItBack = () => update($, queue, (cur): QueueState => ({ ...putBack(normalize(cur), text), isSending: false, waitingOn: '' }))
  try {
    const r = await $.prompt.submit({ text, asUser: true })
    if (r.drop !== undefined) {
      cancelAuto()
      await putItBack()
      $.ui.toast(`queue paused: the prompt was not sent (${r.drop}); /${COMMAND} resume`)
    }
  } catch (err) {
    cancelAuto()
    await putItBack().catch(() => {})
    $.ui.toast(`queue paused: sending failed (${whyOf(err)}); /${COMMAND} resume`)
  }
}

/**
 * Takes item `n` out and submits it, from a timer. `isAuto` is the turn-end
 * send: item 1 only, never while paused, never while a prompt of this mod's
 * is on its way, never while a survey shows or a subagent runs (it waits and
 * looks again). A manual send takes any item at once, but only while item
 * `n` is still `expected` (the text it answered or read): otherwise it takes
 * nothing and says so. Answers the item, or null when nothing was taken.
 */
async function send(
  $: EngineInterface,
  n: number,
  isAuto: boolean,
  tries = 0,
  mine = epoch,
  expected?: string,
): Promise<string | null> {
  if (isAuto) {
    const s = await load($)
    if (mine !== epoch) return null
    // Nothing to send, or a prompt of this mod's already on its way: no wait stands.
    if (s.items.length === 0 || s.isPaused || s.isSending) {
      if (s.waitingOn !== '') await setWaiting($, '', mine)
      return null
    }
    if (isSurveyUp) {
      if (tries < SURVEY_RETRIES) {
        if (s.waitingOn !== 'survey') await setWaiting($, 'survey', mine)
        if (mine === epoch) scheduleAuto($, SURVEY_RETRY_MS, tries + 1)
      } else {
        await setWaiting($, '', mine)
        $.ui.toast(`queue waiting: a survey is showing; /${COMMAND} next sends item 1`)
      }
      return null
    }
    const runs = (await $.state.get(AGENT_RUNS).catch(() => null))?.value
    if (mine !== epoch) return null
    if (isAgentBusy(runs)) {
      // No limit: a subagent may run for an hour. The wait ends when the agent
      // does, or the queue empties or pauses, or a main-loop turn starts.
      if (s.waitingOn !== 'agents') await setWaiting($, 'agents', mine)
      if (mine === epoch) scheduleAuto($, AGENT_RETRY_MS, tries)
      return null
    }
  }
  let isChanged = false
  const item = await inTakeOrder(async (): Promise<string | null> => {
    // A manual send stands in for a waiting automatic one, and cancels it before
    // taking its item; the sent prompt's own end sends next.
    if (!isAuto) cancelAuto()
    let taken: string | null = null
    await update($, queue, (cur): QueueState => {
      const s = normalize(cur)
      taken = null
      isChanged = false
      // The automatic take re-checks inside the compare-and-set: a cancel (a
      // main-loop turn.start, a manual send) or a prompt of the queue's already
      // on its way since its reads means it takes nothing.
      if (isAuto && (mine !== epoch || s.isSending)) return s
      // A manual send whose item moved since it was named (the automatic send
      // took it meanwhile) takes nothing rather than the item now in its place.
      isChanged = !isAuto && expected !== undefined && s.items[n - 1] !== expected
      const r = isChanged ? { state: s, item: null } : take(s, n, isAuto)
      taken = r.item
      if (r.item !== null) return { ...r.state, isSending: true, waitingOn: '' }
      // A manual send that found nothing still ended the automatic wait above.
      return isAuto || s.waitingOn === '' ? s : { ...s, waitingOn: '' }
    })
    const got: string | null = taken
    // A cancel (a main-loop turn.start) that came after the check above but
    // before this write landed: nothing was submitted, so the turn that started
    // is not the queue's. The item goes back first in line, unpaused, quietly.
    if (got !== null && isAuto && mine !== epoch) {
      await update($, queue, (cur): QueueState => {
        const s = normalize(cur)
        return { ...s, items: [got, ...s.items], isSending: false }
      })
      return null
    }
    return got
  })
  if (isChanged) $.ui.toast(`queue: item ${n} changed before it was sent; /${COMMAND} list`)
  if (item === null) return null
  await submit($, item)
  return item
}

/** A manual send of item `n` as it stands now: a press names no text, so it reads it as it runs. */
async function sendByHand($: EngineInterface, n: number, expected?: string): Promise<string | null> {
  return send($, n, false, 0, epoch, expected ?? (await load($)).items[n - 1])
}

/** A press's or a command's work, from a timer: never inside the hook. */
function later($: EngineInterface, run: () => Promise<unknown>): void {
  $.clock.after(DELAY_MS, () => {
    void run().catch(err => $.ui.toast(`/${COMMAND}: ${whyOf(err)}`))
  })
}

async function openPane($: EngineInterface): Promise<string> {
  const r = await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true })
  return r.isPlaced ? 'Queue pane opened.' : `Queue pane opened, waiting undrawn: ${r.reason}`
}

/**
 * The band row: chip, count, item 1 cut to fit, `paused` or `waiting on
 * agents`, then [ next ] [ pause | resume ] [ pane ]; null when the row is
 * not shown.
 */
async function bandRow($: EngineInterface, e: RenderInput<'AbovePrompt'>): Promise<RenderElement | null> {
  const props = e.props
  const s = await load($)
  if (s.items.length === 0) return null

  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = props.bodyColumns > 0 ? props.bodyColumns : 80
  const count = `${s.items.length} queued`
  const toggle = s.isPaused ? 'resume' : 'pause'
  const isWaiting = s.waitingOn === 'agents'
  // chip, the gaps, the count, ` · `, `paused ` or `waiting on agents `, and the three framed buttons.
  const flag = (s.isPaused ? 7 : 0) + (isWaiting ? WAITING_TEXT.length + 1 : 0)
  const fixed = CHIP.length + 1 + count.length + 3 + flag + 3 + ('next'.length + 4) + (toggle.length + 4) + ('pane'.length + 4) + 2
  const first = cut(s.items[0] ?? '', Math.max(8, cols - fixed))
  return (
    <Box key={ROW_KEY} flexDirection="row" gap={1}>
      <Box key="queue-chip" flexShrink={0}>
        <Text bold color={CHIP_FG} backgroundColor={CHIP_BG}>
          {CHIP}
        </Text>
      </Box>
      <Box key="queue-info" flexShrink={1} flexGrow={1} flexDirection="row" gap={1}>
        <Text wrap="truncate-end">
          <Text bold>{count}</Text>
          <Text dimColor>{' · '}</Text>
          {first}
        </Text>
        {s.isPaused ? (
          <Text bold color={PAUSED_COLOR}>
            paused
          </Text>
        ) : null}
        {isWaiting ? (
          <Text bold color={PAUSED_COLOR}>
            {WAITING_TEXT}
          </Text>
        ) : null}
      </Box>
      <Box key="queue-buttons" flexShrink={0} flexDirection="row" gap={1}>
        <Button key="queue-next" label="next" onPress={() => later($, () => sendByHand($, 1))} />
        <Button key={`queue-${toggle}`} label={toggle} onPress={() => later($, () => act($, { type: toggle }))} />
        <Button key="queue-pane" label="pane" onPress={() => later($, () => openPane($))} />
      </Box>
    </Box>
  )
}

/** The pane: a header, the numbered list with the selection highlighted, and the framed buttons. */
async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const s = await load($)
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 60
  const selected = Math.min(s.selected, Math.max(0, s.items.length - 1))
  const header =
    s.items.length === 0
      ? `Empty: /${COMMAND} <text> adds a prompt.`
      : `${s.items.length} queued${s.isPaused ? '' : ' · sends item 1 when a turn ends'}`
  return (
    <Box flexDirection="column">
      <Box key="queue-pane-head" flexDirection="row" gap={1}>
        <Text dimColor wrap="truncate-end">
          {header}
        </Text>
        {s.isPaused ? (
          <Text bold color={PAUSED_COLOR}>
            paused
          </Text>
        ) : null}
        {s.waitingOn === 'agents' && s.items.length > 0 ? (
          <Text bold color={PAUSED_COLOR}>
            {WAITING_TEXT}
          </Text>
        ) : null}
      </Box>
      {s.items.map((t, i) => {
        const label = `${String(i + 1).padStart(2)}. ${cut(t, Math.max(8, cols - 6))}`
        return i === selected ? (
          <Text key={`queue-item-${i + 1}`} bold inverse wrap="truncate-end">
            {`>${label}`}
          </Text>
        ) : (
          <Text key={`queue-item-${i + 1}`} wrap="truncate-end">
            {` ${label}`}
          </Text>
        )
      })}
      <Box key="queue-pane-buttons" flexDirection="row" flexWrap="wrap" gap={1}>
        <Button key="queue-down" label="j: down" hotkey="j" onPress={() => later($, () => act($, { type: 'move', delta: 1 }))} />
        <Button key="queue-upsel" label="k: up" hotkey="k" onPress={() => later($, () => act($, { type: 'move', delta: -1 }))} />
        <Button key="queue-rm" label="x: remove" hotkey="x" onPress={() => later($, () => act($, { type: 'rm', n: selected + 1 }))} />
        <Button key="queue-moveup" label="u: move up" hotkey="u" onPress={() => later($, () => act($, { type: 'up', n: selected + 1 }))} />
        <Button key="queue-send" label="s: send now" hotkey="s" onPress={() => later($, () => sendByHand($, selected + 1))} />
        <Button key="queue-close" label="c: close" hotkey="c" role="dismiss" onPress={() => later($, () => $.ui.close({ id: PANE }))} />
      </Box>
      <Text key="queue-pane-twins" dimColor wrap="truncate-end">
        {`twins: /${COMMAND} sel <n> · rm <n> · up <n> · send <n> · close`}
      </Text>
    </Box>
  )
}

/** Answers one `/q` line. */
async function runCommand($: EngineInterface, args: string): Promise<string> {
  const p = parseArgs(args)
  switch (p.kind) {
    case 'action':
      return act($, p.action)
    case 'list':
      return listText(await load($))
    case 'next':
    case 'send': {
      const n = p.kind === 'next' ? 1 : p.n
      const s = await load($)
      if (s.items.length === 0) return 'The queue is empty.'
      if (n < 1 || n > s.items.length) return `No item ${n}: the queue has ${s.items.length}.`
      const text = s.items[n - 1] ?? ''
      // The work runs later: it sends this text, or nothing if item n changed.
      later($, () => sendByHand($, n, text))
      return `Sending item ${n}: ${cut(oneLine(text), 80)}`
    }
    case 'pane':
      return openPane($)
    case 'close':
      await $.ui.close({ id: PANE })
      return 'Queue pane closed.'
    default:
      return USAGE
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({
        name: 'q',
        description: 'Prompt queue: /q <text> queues a prompt sent when the current turn ends; list, rm, up, clear, pause, resume, next, pane',
        argumentHint: '<text> | add <text> | list | rm <n> | up <n> | clear | pause | resume | next | pane',
        immediate: true,
      })
    } catch {
      // No /q this session; the row and the pane still work.
    }
    // A start, a /clear, a resume or a hot reload: no automatic send waits
    // and nothing waits on agents or a survey. `isSending` stays: this event
    // fires again on exactly the reload that flag must survive; a stale flag
    // heals at the next main-loop turn.start.
    cancelAuto()
    await clearFlags($, false).catch(() => {})
    return started
  }).catch(($, e, next) => next(e))

  // A main-loop turn starting: a prompt this mod submitted has entered, or the
  // person typed one; either way any waiting send stops, and that turn's own
  // end schedules again.
  on('turn.start', async ($, e, next) => {
    // Cancel first, before the chain beneath answers: an automatic take whose
    // write lands meanwhile sees the cancel when it re-checks.
    if (e.agentId === undefined) cancelAuto()
    const started = await next(e)
    if (e.agentId === undefined) await clearFlags($, true).catch(() => {})
    return started
  }).catch(($, e, next) => next(e))

  // A main-loop turn's end: send item 1, or pause on a turn that did not finish.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      const s = await load($)
      const verdict = turnVerdict(e, s)
      if (verdict === 'send' && !s.isSending) {
        scheduleAuto($, DELAY_MS, 0)
      } else if (verdict === 'pause') {
        cancelAuto()
        await act($, { type: 'pause' })
        $.ui.toast(PAUSE_TOAST)
      }
    } catch {
      // The queue stays as it was; /q next sends by hand.
    }
    return done
  }).catch(($, e, next) => next(e))

  // A /clear or a resume puts another conversation here: no send waits for it.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    cancelAuto()
    await clearFlags($, false).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'q' }, async ($, e) => {
    try {
      return { text: await runCommand($, e.args) }
    } catch (err) {
      return { text: `/${COMMAND}: ${whyOf(err)}` }
    }
  })

  // The band: this plugin's own row, or next(e) when it draws none.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    isSurveyUp = e.props.hasSurvey === true
    if (isSurveyUp) return next(e)
    const row = await bandRow($, e)
    return row ?? next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'queue' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    return drawPane($, e)
  }).catch(($, e, next) => next(e))
}
