// The live turn, kept in the module and not in $.state: the spinner's word is
// seen only while ui.render draws the Spinner, and drawing is pure (the host
// denies a state write made during a render, probe 2026-10-20), so the word is
// kept here and the HERE row reads it. Reset at session.start; a reload starts
// it afresh with the module.
export const live = {
  /** True from a main-loop turn's start to its end. */
  isTurnRunning: false,
  /** The terminal spinner's word as last drawn; '' after a main-loop turn ends. */
  spinnerWord: '',
  /** When the running main-loop turn started, `$.clock.now()` milliseconds; 0 when no turn runs. */
  turnStartedAt: 0,
}

/** How long a main-loop turn runs before the row shows (option delaySeconds, default 5). */
export const DEFAULT_DELAY_S = 5

/** The option delaySeconds in milliseconds: a number of seconds, 0 or more; anything else is the default. */
export const delayMsOf = (v: unknown): number =>
  Math.round((typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_DELAY_S) * 1000)

