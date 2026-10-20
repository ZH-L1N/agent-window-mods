# agents

Live subagents, background shells, Monitor watches and cron timers in Claude
Code, in two places, a toast when one ends and ALL DONE when the last one
does; and a code map of the files the tools touched:

- **The AGENTS band** above the prompt, while subagents or background shells
  run and for 10 s after the last one ends:

  ```
   ◎ AGENTS  main fable·5.1 ⟳ │ Explore haiku "find the hooks" ✓ · checker sonnet "check the prices" ⟳ │ skills: plugin-authoring ×2   [ ×2 ] [ ✕ ]
  ```

  The main loop's model while a turn runs; one entry per run of the current
  batch (type or name, model, the task cut to 22 characters, ⟳ running,
  ✓ finished, ✗ error); the skills fired. On a narrow band the task texts go
  first (oldest first), then all skills but one, then the tail folds into
  `+N more`. Under 40 columns it is `● 2 agents ▰▰▰▱▱▱`. `×N` opens the pane;
  `✕` hides the band until a new run starts. The row is keyed `zm-50-agents`
  and takes its slot in the zehui-mods stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80); other
  mods' bands follow, and a survey takes the band's place while it is up.

  A background shell (a Bash call run in the background, or moved there with
  ctrl+b or by its timeout) is an entry of its own: `sh`, the command cut to
  22 characters, its elapsed time and ⟳, then ✓ when it completes or ✗ when it
  fails or is killed, after which it leaves with its batch like a subagent.
  A command that runs a coding agent's CLI (`codex exec`, `codex "<prompt>"`,
  `codex review`, `codex exec resume`, `opencode run`, `claude -p`) is
  labelled with the agent and the model `-m`/`--model` names, wherever it sits
  in a pipeline or list (`git diff | codex exec "review the diff"`), and shows
  the prompt instead of the command (the command when the prompt comes on stdin):

  ```
   ◎ AGENTS  Explore haiku "find the hooks" ⟳ · sh "pytest -q tests/" 0:42 ⟳ · codex gpt-5.4 "review the diff" 2:10 ✓   [ ×3 ] [ ✕ ]
  ```

  The shell's words (`sh`, `codex gpt-5.4`) are grey, never a Claude model's
  colour. `×N` counts shells too, and the short form says `● 3 tasks` once
  a shell is among them.
- **The agents pane**, `/agents-info` (or `/agents-info open`): cost, tokens
  and time tiles, then Running, Finished and Error, one card per run with a
  pixel mascot, a 10-cell `▰▱` bar (context fill, tier colour while running,
  amber on a slow step, green when finished, red on error) and
  `ctx n% · tokens · ≈$cost · m:ss`. While two or more runs are going, a
  main-loop card tops Running (`2 subagents running`, or `2 tasks running`
  once shells are among them). **Collapse** switches to one line per run.

  A background shell's card has a grey mascot instead of a coral one (a grey
  bot with a terminal face; a grey bot in a blue cap for a coding agent's
  CLI), a grey spinner, the bold title `sh · <command>` (`codex · <prompt>`),
  its status word (running, finished, failed, killed), then
  `background shell · m:ss` (with the agent and model first for codex, and
  `exit n` once it failed) and the last line of its output, read from the
  task's output file once a second while the pane is open, and once on opening
  for a shell that ended while it was closed (colour codes stripped, the line
  cut to 240 characters; a file over 1 MiB is not read).

  Every card, a subagent's or a shell's, starts with a framed button
  numbered 1 to 9 in pane order (Running, Finished, Error). The buttons are
  stubs for now: a press, or its digit while the pane has the focus, toasts
  "messages view comes with E3", as does `/agents-info open <n>`. The
  messages view itself comes in a later round (E3).

The mascots move: a one-pixel bob each second while running, a braille
spinner, a bright flash on finish and an amber pulse on error; a run waiting
on a tool's result for over 20 s sleeps. A shell's mascot bobs while it runs
and turns red when it fails. All of it holds still under Claude Code's
reduced-motion setting.

**Mascot pools (0.4.0)**: every state has a pool of poses from the mascot
pack, and a card shows the pose its run id hashes to (FNV-1a), so it never
changes pose within a state while two runs in one state seldom look alike:

| State | Poses |
| --- | --- |
| running | 14: `repairing-with-tools`, `writing-software-code`, `building-colorful-blocks`, `debugging-system-bugs`, `reading-data-document`, `thinking-in-code`, `examining-green-globe`, `lab-science-testing`, `holding-ancient-scroll`, `visualizing-tree-data`, `managing-server-rack`, `processing-logic-symbols`, `planting-small-trees`, `user-profile-settings` |
| waiting (over 20 s on a tool) | 4: `sleeping-soundly`, `thinking-pixel-bubble`, `in-constant-loop`, `it-depends-sign` |
| finished | 7: `with-success-checkmark`, `success-achievement-milestone`, `happy-pixel-celebrating`, `rocket-launch-success`, `api-success-pixel`, `in-glowing-aura`, `love-cloud-pixel` |
| error | 10: `confusion-spiral-pixel`, `dizzy-failed-state`, `error-state-pixel`, `failed-process-error`, `system-error-alert`, `marking-critical-error`, `crying-sad-reaction`, `angry-at-laptop`, `broken-heart-sad`, `disconnected-plug-pixel` |
| main loop (hub card) | 3: `artboard-25cla`, `multi-window-workflow`, `developer-pair-programming-scene`, picked by the session's id (else its first main turn's) |

Before 0.4.0 every finished card showed the one checkmark pose (and every
error card the one spiral), which is why finished runs all looked the same.
Poses are 18 to 30 pixels wide and 10 to 23 tall; the mascot column is as
wide as the widest pose, and a card is as tall as its pose (or its text).
Shells keep their own grey mascots and codex fuzzies.

## Watches and crons (0.3.0)

A `Monitor` call is a **watch** and a `CronCreate` call a **cron**, each an
entry of the band and a row of the pane under a `Watching` head (no mascot,
no number):

```
 ◎ AGENTS  Explore haiku "find the hooks" ⟳ · watch deploy a15f4e9 ⏳ 12m · cron 20:30 in 41m   [ ×3 ] [ ✕ ] ☕
```

- A watch reads `watch <description> <target> ⏳ <time left>`: the target is
  the herdr pane (`w1:p6`), commit (`a15f4e9`) or run id its command names,
  if any; the time left runs to its deadline (a persistent watch shows its
  elapsed time instead). Its event notifications set the line under its pane
  row; it ends on its end notification (`✓ watch "deploy" ended after 12:00`).
- A cron reads `cron <next fire, local> in <time left>`, its prompt in the
  pane. A one-shot cron ends when its prompt fires; a recurring one moves to
  its next fire time; CronDelete ends either, with no toast.
- **Stale greying**: a notification for a watch whose target another watch
  saw done within the last minute (or a new event for a watch already ended)
  turns its entry grey for 10 s instead of toasting again. A wait on that
  target that ends later (a second round, a re-armed Monitor) toasts as usual.
- **Caffeinate hold** (`caffeinate` option, on by default): while any
  subagent, shell or watch runs, one `caffeinate -i -t 600` child (through
  `$.process.spawn`) holds idle sleep, spawned again once its 600 s run out
  while work still runs, and stopped as soon as the last one ends; `☕` sits
  at the end of the AGENTS row while it is held. A cron waiting to fire holds
  nothing. A child that ends within a minute (no `caffeinate` on the machine)
  is retried a minute later, not every second.
- **ALL DONE**: when the last subagent, shell or watch in flight ends, one
  toast `★ all background work done`, and with the `sound` option on a rising
  chime (`assets/done.wav`, the peers mod's). Both need `toasts` on.

## Code view (0.3.0)

The pane's second view: `c` (or `/agents-info code`) shows it, `w` (or
`/agents-info who`) goes back to the cards, `p` (or `/agents-info peers`)
shows the Peers view (0.4.0), `q` (or `/agents-info close`) closes the pane.
The keys work while the pane has the focus (ctrl+x tab).

```
Code map (11 files) (2 changed) · turn 4 ● editing kit.ts
[ w: who ] [ a: session ] [ d: diff ] [ q: close ]

╭────────────────────╮   ╭────────────────────╮   ╭────────────────────╮
│ 1 band.tsx       ✓ │──▶│ 2 register.tsx   ✓ │──▶│ 3 kit.ts         ● │
│ +2 −2 · RE · 4m    │   │ +9 −1 · E · 2m @1  │   │ +12 −3 · RE · 5s   │
│ Padded chip        │   │ Prune ended runs…  │   │ pruneEnded, keep…  │
╰────────────────────╯   ╰────────────────────╯   ╰────────────────────╯
 ALSO READ   token-weather.mjs  TIMELINE.md  mascots.ts
subagents [ 1 ] savvy-careful
```

- **What is read**: the calls of Read, Edit, Write, MultiEdit, NotebookEdit,
  Grep and Glob, and the paths a Bash command names (`cat` reads, `sed -i`
  edits, `>` and `>>` write, `git add` reads, `git checkout -- <file>` and
  `git restore` rewrite, `cp` reads its sources and writes its target, `mv`
  writes its target), in the main loop and in subagents (by agentId, `@n` in
  the node is the subagent's card number). Relative paths resolve against the
  session's directory. A heredoc's body and a quoted `>` (`grep -c '>' f`)
  name no file; a `[` in an edited or read path (`app/[id]/page.tsx`) is
  literal. A Bash command's exit code never marks its `>` target `✗`.
- **Node**: round border 22 wide, three lines: its number (for `d`), name and
  state glyph; `+plus −minus · tools · time since the last touch` (and the
  turn tags `t3` in session scope); one line from the edit itself (the Edit's
  first changed line, the Write's first line, kept to 80 characters). States: `◌ read` blue,
  `● editing` amber for 30 s after an edit, `✓ changed` green, `✗ failed` red
  when the edit tool returned an error.
- **Counts**: after each edit that did not fail, `git diff --numstat -- <file>`
  runs in the file's folder (`$.process.run`, 5 s timeout), only when
  `git rev-parse --is-inside-work-tree` says the folder is in a repo (asked
  once per folder), and only for a file under the session's directory: git
  never runs in a folder elsewhere (a cloned repo's `.git/config` stays
  unread), so those nodes carry no counts. A new file git does not know yet
  counts the lines written.
- **Layout**: edited files in edit order, `──▶` between consecutive ones,
  as many to a row as the pane width holds (a wrapped row starts with the
  arrow); read-only files in the `ALSO READ` chip row; the subagents that
  touched the files with their numbered buttons (stubs until E3, as in the
  Who view). Under 60 columns a tree list by folder instead.
- **Scope**: this main-loop turn by default (the turn before while this one
  touched nothing yet); `a` (or `/agents-info scope`) toggles the whole
  session, the nodes then tagged with their turns.
- **Diff**: `d` then a number (or `/agents-info diff <n>`) runs `/diff` on that
  node's file through `$.command.run`, from the 1 s tick rather than the press.
  While `d` is armed the digits belong to the diff pick, not the subagents row.

In the Who view the clear button is now `x: clear done` (`c` opens the Code view).

## Peers view (0.4.0)

The pane's third view: `p` (or `/agents-info peers`) shows it from the Who or
Code view; `w`, `c` and `q` work as before, and `r` reads herdr again. It draws
what the peers mod's board draws, read by this mod itself (the code is ported,
not imported across mod folders):

```
Peers · 4 in w1 · 1 blocked · read every 30 s
[ w: who ] [ c: code ] [ r: refresh ] [ q: close ]

hub · this pane  ● working 12m  w1:p2  claude  "Orchestrate the review"
req skin · ⏳ 21m left · no result.md
   ▲ blocked 4m  w1:p7  codex  "Compare skills"
   ● working 4m  w1:p9  claude  "Skin, second half"
req rev-r4 · round 4/5 · result.md ✓ completed
   ● working 12m  w1:p6  claude  "Review round 4"
other peers
○ idle 3m  w1:p8  claude  "Not ours"
```

- **Rows**: one per agent of this herdr workspace (`HERDR_WORKSPACE_ID`),
  this pane left out: the state's glyph and word (`▲ blocked`, `● working`,
  `○ idle`, `✓ done`, `? unknown`) with the time in that state, the pane id,
  the agent and the title. Blocked rows are amber and come first. The time
  counts from the first read that saw the pane in that state (none on the
  first read); a read more than a minute old is not carried over.
- **Hub row first**: this pane's own row (`hub · this pane`) when this
  session sent HERDR-ORCH requests; else, when a brief from another pane made
  this session a spoke, that pane's row (`hub`).
- **Spokes grouped under their request id**: each request this session sent
  heads a group, `req <id>` with its round (`round 4/5`), its deadline
  countdown (`⏳ 21m left`, `overdue 4m`; gone once a result file is there)
  and its result file (`result.md ✓ completed`, `✗ failed`, `▲ blocked`,
  `result.md (no status)`, `no result.md`), then its spokes. A group with a
  blocked spoke comes first, then the newest. A spoke is drawn under the
  newest request that names it. Peers no request names follow under
  `other peers`.
- **Requests**: read from the envelope headers in this session's prompts
  (`prompt.submit`), the peers mod's rule (POLICY.md section 2):
  `[HERDR-ORCH v0] req=<id> from=<agent>@<pane> type=<type>` at a line's start
  or after `herdr agent prompt <pane> "`; the spoke is the pane of that
  `herdr agent prompt` line (so a fan-out of one request to several panes
  groups them all), else `to=<pane>`, else the first `herdr agent prompt`
  pane in the text that is not the sender's, else the sender of a report,
  else the first other pane id in the prompt. A brief or follow-up that
  another pane sent to this session takes its target from its header line
  only; when that names no other pane it is no request of ours, and a
  brief's sender becomes the hub. Round, ceiling and deadline as the peers
  mod reads them (30 minutes for a brief that names none). The newest 40
  requests are kept.
- **Reads**: `herdr agent list` (5 s limit) through `$.process.run`, only
  while the pane is open in this view: every 30 s from the existing 1 s tick,
  and at once on `p`, `r` or `/agents-info peers`. The result files
  (`~/.local/state/herdr-orch/<req>/result.md`, 64 KiB at most) through `$.fs`
  in the same read, and only when the file, with every symbolic link
  followed, lands at its own place in that folder. A failed read keeps the
  last rows; with no good read yet the head says why
  (`herdr agent list failed (exit 1)`).
- **Outside herdr** (no `HERDR_ENV=1` with a workspace and pane id) the view
  says `The Peers view needs a herdr pane` and nothing runs.

**Toasts**: one toast when a subagent or a background shell ends, never for
the main loop: `✓ Explore "survey the mods" finished in 0:31`,
`✗ sh "pytest -q tests/" exit 1 after 0:42` (or `killed after`, or
`failed after` when no exit code is known). The `toasts` option turns them off.

## Install

At the prompt of a terminal session:

```
/plugin install agents@zehui-mods
```

From the local marketplace folder (`~/.claude/mods`, added with
`claude plugin marketplace add ~/.claude/mods`):

```bash
claude plugin install agents@zehui-mods --scope user
```

The install is a copy of the mod at that moment (under
`~/.claude/plugins/cache/zehui-mods/agents/<version>/`), so `/reload-plugins`
reloads that copy, not this folder. After a version bump, refresh the copy
and restart the session:

```bash
claude plugin marketplace update zehui-mods
claude plugin update agents@zehui-mods --scope user
```

## Options

| Option | Values | Default | What it does |
| --- | --- | --- | --- |
| `band` | `on`, `off` | `on` | `off` hides the AGENTS band; the pane stays. |
| `toasts` | `on`, `off` | `on` | `off` drops the toast for a subagent or shell that ends. |
| `keepEnded` | `0`, `5`, `10`, `25`, `50` | `10` | How many ended runs (finished or failed) the pane keeps, newest first; older ones are dropped as runs end. The pane's `x: clear done` button and `/agents-info clear` drop them all. |
| `caffeinate` | `on`, `off` | `on` | `on` holds idle sleep (`caffeinate -i -t 600`, re-armed) while any subagent, shell or watch runs; `☕` on the AGENTS row while held. |
| `sound` | `off`, `on` | `off` | `on` plays the rising chime with the ALL DONE toast (needs `toasts` on). |
| `summaries` | `edit`, `haiku`, `off` | `edit` | The code map node's third line: from the edit itself (`edit`); `haiku` is reserved and drawn as `edit` for now (no model call in this mod); `off` shows the file's folder. |

## Notes

- Costs are estimates from the token counts the engine reports and a price
  table in `hooks/kit.ts` (from the claude-api skill bundled with Claude Code
  2.1.303). Cache writes are priced at the 5-minute rate (1.25x input), since
  the engine reports one write count. A model the table does not know shows
  `≈ ?`.
- A shell ends on the task notification the engine writes into the
  conversation (`<task-notification>`, status `completed`, `failed` or
  `killed`). A shell started by a synchronous subagent, which the engine
  stops with the subagent's final answer, ends (as killed) when that
  subagent ends.
- The shell mascots are ours, not from the pack: four grey candidates drawn
  on 2026-10-19 (A `shell-terminal-face`, B `codex-hex-badge`, C
  `shell-window`, D `codex-blue-cap`, in `SHELL_POSES` in `hooks/mascots.ts`).
  A is wired for plain shells and D for a coding agent's CLI; change
  `SHELL_POSE` or `CODEX_POSE` there to pick B or C instead.
- The Code view's `d` + number passes the file to `/diff` as its argument;
  the plugin API does not say whether `/diff` narrows to it, so it may open
  the whole working-tree diff instead.
- The watch, cron, notification and CronCreate result formats were read from
  Zehui's own session transcripts (Claude Code 2.1.30x): a Monitor's events
  are `<task-notification>` rows with an `<event>` and no `<status>`; its end
  is one with `<status>`; a cron's fire is a row of origin `scheduled-trigger`
  holding its prompt.
- Processes: `git` (the code map's counts), `caffeinate` (the hold) and, from 0.4.0, `herdr agent list` (the Peers view, only while it is shown); nothing else, no network and no model.
- Terminal only for the band; the pane is plain text on the desktop app.
  English only.
