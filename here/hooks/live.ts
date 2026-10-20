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
}
