# Plan: agents mod follow-up, background shells, numbered cards, finish toasts

**Status: implemented 2026-10-19 21:35 (0.2.0), live-verified 21:45** (Zehui: "do E1, E2, E4 now, E3 later"; shell and codex mascots drawn by us, defaults A and D pending his pick)

Source of the ideas: hamzafer/claude-code-mods `agent-radar`, look only. No code
from it; the engine already reports what it polls `lsof` for.

## E1. Band: a line per background shell

- A Bash `tool.call` with `run_in_background` resolves with a `taskId`; from
  then on the AGENTS band shows an entry `sh "pytest -q tests/" 0:42 ⟳`: the
  command cut to 22 characters, elapsed time, ⟳ amber.
- The entry ends when the engine appends the task's notification row
  (`session.append`, origin kind `task-notification`, task `id`, `status`
  completed | failed | killed, `duration`): ✓ green for completed, ✗ red for
  failed or killed, then it leaves with the batch rule like a subagent.
- A command that starts with `codex exec`, `codex` (any subcommand that runs a
  prompt), `opencode run` or `claude -p` is labelled with that agent name and
  the model named by `-m`/`--model` when present: `codex gpt-5.4 "review the
  diff" 2:10 ⟳`. Agent words in grey `#9a9a96`.
- The crew count `×N` includes shells. The short form counts them too.
- Shells are a kind of run in `agents.runs`: `{ kind: 'shell' | 'agent',
  command?, taskId?, label? }` added to the record; everything else reuses
  the batch, linger and dismiss rules.

## E2. Pane: shell cards and numbered buttons

- Shell cards under Running without a coral mascot: a grey mascot instead
  (candidate A, the grey bot with a terminal face; codex: candidate D, the
  grey bot with a blue cap), authored by us in `hooks/mascots.ts` as palette
  rows in the pack's proportions. Rows: numbered framed Button + spinner +
  bold `sh · <command>` + status word; `background shell · <elapsed>`; the
  last output line, read from the task's output file named by the Bash
  result through `$.fs.read` on the one-second tick while the pane is open,
  cut to the row.
- Every card (agents and shells) gets a framed Button numbered 1 to 9 in
  pane order; pressing it is reserved for E3 (the messages view) and for
  now toasts "messages view comes with E3". The button exists so the layout
  settles now. Hotkeys work only while the pane has focus; `/agents-info
  open <n>` is the command twin, likewise a stub until E3.
- The main-loop card counts shells among "N subagents running" as "N tasks".

## E4. Toasts

- One toast when a subagent or shell finishes: `✓ Explore "survey the mods"
  finished in 0:31`; `✗ sh "pytest -q tests/" exit 1 after 0:42` (failed or
  killed). Option `toasts: on | off`, default on. Never for the main loop.

## Not in this round

E3 messages view (`$.session.messages({ agentId })`, `b` back, `m` more).

## Steps

1. register.tsx: Bash tool.call hook (with `.catch`), task-notification end,
   label parsing; types for the shell fields. band.tsx: shell entries and
   grey agent words. skin.tsx: shell cards, numbered buttons, task wording.
   mascots.ts: candidates A to D as data, A and D wired. Toasts.
2. Tests: a background Bash call draws a band entry and a card; its
   notification ends it with ✓ or ✗ and toasts once; codex label and model
   parsing; numbered buttons present and stub toast; crew count; a
   foreground Bash call draws nothing.
3. Validate, test, tsc, reload, live check with one background `sleep 90`
   shell, one `codex exec` dry run if the CLI is present, and a subagent.
4. PROVENANCE, TIMELINE, memory.

## Addendum 2026-10-19 21:10, codex mascots

Zehui wants the Codex "fuzzies" rather than a grey bot for codex shells: five
shapes, pink round with headphones, blue cloud with a beret, yellow triangle
with glasses and a bow tie, green rounded square with big eyes, purple heart
with round glasses (20 x 12 px each, drawn by us in
`~/.cache/zehui-mods/tools/demo11.py`). A codex shell picks one by a hash of
its task id. Plain shells keep candidate A (grey bot). Applied after the E1,
E2, E4 build lands.
Decision 21:15: plain shells use candidate C (the terminal window), not the
grey bot; codex shells use the five fuzzies.
