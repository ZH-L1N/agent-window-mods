// The hold kit: one held tool call at a time, shown as a card in a pane when
// the pane can be placed and asked in the engine's question dialog when it
// cannot, with a time limit either way. Only an explicit approval answers
// 'run'; a timeout, a dismissed dialog, an interrupted turn and any error
// are refusals.
//
// The same file serves the motion-hold and send-gate mods, copied byte for
// byte: nothing in it names either gate. The mod draws the card from
// `holder.slot()` and answers through `holder.decide`.
import type { EngineInterface } from 'claude-code'

export type Decision = 'run' | 'cancel' | 'timeout' | 'interrupted' | 'error'

export type Card = {
  /** The pane the card is drawn in: 'motion-hold' or 'send-gate'. */
  paneId: string
  /** The pane's title: 'Motion Hold' or 'Send Gate'. */
  title: string
  /** The dialog's chip, at most 12 characters. */
  header: string
  /** The approving answer: 'Run once' or 'Send once'. */
  runLabel: string
  /** One line: what would happen. */
  what: string
  /** The rest of the card, already cleaned and cut. */
  lines: string[]
  /** Pane rows wanted. */
  rows: number
  timeoutMs: number
}

export type Slot = {
  id: number
  card: Card
  decision: Decision | null
  where: 'waiting' | 'pane' | 'dialog'
  /** The engine clock time when `where` became 'pane' or 'dialog'; null while waiting. */
  shownAt: number | null
}

export type Holder = {
  /** The hold being asked now; null when none is. */
  slot(): Slot | null
  /** Answers the held slot; false when `id` is not the held slot or it is already answered. */
  decide(id: number, d: 'run' | 'cancel'): boolean
  /** Holds until the person answers, the time runs out or the turn is interrupted. Never rejects. */
  request($: HoldEngine, signal: AbortSignal | undefined, card: Card): Promise<Decision>
}

/** The part of `$` the kit uses, so a test can hand in a stub. */
export type HoldEngine = {
  ui: Pick<EngineInterface['ui'], 'open' | 'close' | 'ask' | 'notify' | 'invalidate'>
  process: Pick<EngineInterface['process'], 'run'>
  clock: Pick<EngineInterface['clock'], 'now'>
}

export const CANCEL_LABEL = 'Cancel'

/** How long a card must have been on screen before a typed approval counts. */
export const READ_MS = 1500

/**
 * Whether a typed approval (the approving slash twin) may answer this slot:
 * only a card the person can have read, on screen for at least READ_MS by
 * `now`. A hold that only just took the slot is not one. Cancelling needs no
 * such check: it only refuses.
 */
export function canApprove(slot: Slot | null, now: number): boolean {
  if (slot === null || (slot.where !== 'pane' && slot.where !== 'dialog') || slot.shownAt === null) return false
  const shown = now - slot.shownAt
  return Number.isFinite(shown) && shown >= READ_MS
}

/** The dialog shows at most this many of the card's lines, each cut to this length. */
const QUESTION_LINES = 8
const QUESTION_LINE_MAX = 300

/** Why a hold was refused, for the text the model reads. */
export function whyOf(d: Exclude<Decision, 'run'>, timeoutMs: number): string {
  switch (d) {
    case 'cancel':
      return 'the user chose Cancel (or dismissed the dialog)'
    case 'timeout':
      return `no answer within ${Math.round(timeoutMs / 1000)} seconds`
    case 'interrupted':
      return 'the turn was interrupted'
    default:
      return 'the hold failed'
  }
}

/** The card as the question the dialog asks. Lines past the limit are never left out silently: the question says how many it does not show. */
export function questionOf(card: Card): string {
  const cut = (line: string): string => (line.length > QUESTION_LINE_MAX ? `${line.slice(0, QUESTION_LINE_MAX - 1)}…` : line)
  const shown = card.lines.slice(0, QUESTION_LINES).map(cut)
  const left = card.lines.length - shown.length
  const more = left > 0 ? [`… ${left} more ${left === 1 ? 'line' : 'lines'} not shown here: ${CANCEL_LABEL}, then widen the terminal to read the full card`] : []
  return [`${card.title}: ${cut(card.what)}`, ...shown, ...more, `${card.runLabel}?`].join('\n')
}

export function createHolder(): Holder {
  let held: Slot | null = null
  let ids = 0

  return {
    slot: () => held,

    decide(id, d) {
      if (held === null || held.id !== id || held.decision !== null) return false
      if (d !== 'run' && d !== 'cancel') return false
      held.decision = d
      return true
    },

    async request($, signal, card) {
      const isAborted = (): boolean => signal?.aborted === true
      // The wait is a `$` call, which a hook's own time does not count; a
      // clock sleep would. A sleep that does not sleep would spin the loop,
      // so it ends the hold as an error.
      const poll = async (): Promise<void> => {
        const ran = await $.process.run(['sleep', '0.25'], { timeoutMs: 5000 })
        if (ran.exitCode !== 0 && !isAborted()) throw new Error('the wait could not sleep')
      }

      // 1. One hold at a time: wait for the slot.
      try {
        if (isAborted()) return 'interrupted'
        while (held !== null) {
          await poll()
          if (isAborted()) return 'interrupted'
        }
      } catch {
        return isAborted() ? 'interrupted' : 'error'
      }

      // 2. Claim it. Nothing is awaited between the check above and here.
      const mine: Slot = { id: ++ids, card, decision: null, where: 'waiting', shownAt: null }
      held = mine
      const settle = (d: Decision): void => {
        if (mine.decision === null) mine.decision = d
      }
      const limit = Number.isFinite(card.timeoutMs) && card.timeoutMs > 0 ? card.timeoutMs : 0
      // Opened, placed or not: a pane that is not placed waits undrawn for a
      // wider terminal, so it is closed as surely as one that is drawn.
      let isOpened = false
      try {
        const startedAt = await $.clock.now()
        try {
          await $.ui.notify(card.what, { title: `${card.title}: holding` })
        } catch {
          // A notification is a courtesy: the card or the dialog still asks.
        }

        // 3. The card in a pane, when the pane can be placed.
        const opened = await $.ui.open({ id: card.paneId, title: card.title, focus: true, rows: card.rows })
        isOpened = true
        const isPlaced = opened.isPlaced === true
        const shownAt = await $.clock.now()
        $.ui.invalidate('ui.render')

        if (isPlaced) {
          // 4. The card's buttons, or their slash twins, answer through decide().
          mine.where = 'pane'
          mine.shownAt = shownAt
        } else {
          // 5. The engine's own dialog. Only the run label, to the letter, approves.
          mine.where = 'dialog'
          mine.shownAt = shownAt
          void $.ui.ask(questionOf(card), { options: [CANCEL_LABEL, card.runLabel], header: card.header }).then(
            answer => settle(answer === card.runLabel ? 'run' : 'cancel'),
            () => settle(isAborted() ? 'interrupted' : 'cancel'),
          )
        }

        while (mine.decision === null) {
          if (isAborted()) {
            settle('interrupted')
            break
          }
          const now = await $.clock.now()
          if (mine.decision !== null) break
          if (now - startedAt > limit) {
            settle('timeout')
            break
          }
          await poll()
        }
      } catch {
        // 6. Any throw is a refusal, whatever was answered before it.
        mine.decision = isAborted() ? 'interrupted' : 'error'
      } finally {
        if (isOpened) {
          try {
            await $.ui.close({ id: card.paneId })
          } catch {
            // The pane stays; the card in it reads "no hold pending".
          }
        }
        if (held === mine) held = null
        try {
          $.ui.invalidate('ui.render')
        } catch {
          // Nothing to redraw.
        }
      }
      return mine.decision ?? 'error'
    },
  }
}
