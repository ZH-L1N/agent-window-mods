# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-11-16 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-11-16-strip-forks-safety.md` (Task 14). No third-party code is
copied.

- It starts from a throwaway prototype of the same author, written the day
  before for this plan and never published: the reducer, the command parser,
  the turn-end rule, the row, the pane and their tests. The prototype's 15
  tests are kept under the new names.
- Changes from the prototype, as the plan lists them:
  1. The names: plugin `queue`, pane id `queue`, state
     `{ plugin: 'queue', key: 'queue' }`. The row is its own Box keyed
     `zm-85-queue`; the old stack-order helper is gone, since the engine now
     asks each plugin for its own band row and the strip orders them.
  2. `isSending` and `waitingOn` live in state, not in the module, so a hot
     reload cannot send twice. `isSending` clears when a main-loop turn
     starts and when a submit is dropped or fails; `session.start` (which
     fires again on a reload) only cancels a pending automatic send and
     clears `waitingOn`.
  3. The automatic send never goes while a subagent runs: it reads the
     agents mod's `agents.runs` (typed in `types/peer.d.ts`) and waits,
     looking again every 5 seconds. Manual sends are not held back. The
     automatic take re-checks inside its state update that it was not
     cancelled and that no prompt of the queue's is on its way, and checks
     the cancel once more after that write has landed: a main-loop
     `turn.start` (which cancels on entry, before the chain beneath
     answers) in that gap puts the item back first in line, unpaused, and
     nothing is sent. A manual send cancels a pending automatic one before
     it takes its item; the two takes run on one promise chain, so they
     never interleave. A manual send takes only the item it named (the text
     `/q` answered, or what a press read): if that item changed meanwhile,
     it takes nothing and toasts `queue: item <n> changed before it was
     sent; /q list`.
  4. The row says `waiting on agents` in yellow while it waits.
  5. Both render hooks and the observers end with the standard `.catch`;
     the command registration sits in try/catch.
  6. `/q add` refuses a text that starts with `/`: a slash command starts
     no model turn, so nothing would clear `isSending`.
- Also new: text from `/q` is cleaned of control characters when added and
  when drawn.
- Written from the Claude Code plugin API's declarations (2.1.325 types:
  `turn.start`, `turn.complete`, `session.start`, `session.end`,
  `command.run`, `prompt.submit`, the `AbovePrompt` and `Pane` components,
  `atom`, `read`, `update`, `$.state.get` of another plugin, `$.clock.after`).

## Look

The ` ≡ QUEUE ` chip on blue `#93c5fd`, padded to the 11-cell zehui-mods
chip width, follows the other zehui-mods rows.
