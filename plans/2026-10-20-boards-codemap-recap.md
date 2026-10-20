# Plan: in-flight board, herdr peer board, code map, HERE row, /next, image thumbnails

**Status: implemented 2026-10-20 03:00, live-verified 03:40** (images built but NOT installed: the engine exposes no pasted-image bytes before send and no decompressor, so only a placeholder tile was possible; next has no digit hotkeys, see below) (nodes 22 wide; HERE always in the stack; caffeinate on; /next auto on; stack order option 2 with the sorted-row convention below)

Decisions already taken by Zehui: finish the two boards from the session
sweep; add the mission-control-style code map as a third view of the agents
pane, drawn with boxes and arrows (the `Image` element shows only alt text in
herdr, probe 2026-10-20); where-am-i without a model by default; next-steps
on demand; image thumbnails at 48 cells; pixel-pulse skipped. Everything
written by us; the five mods named were read for their look only.

## 1. agents 0.3: in-flight board extras

- **Monitor watchers and cron timers** join the band and the pane: a
  `tool.call` hook on Monitor and CronCreate records `{ kind: 'watch' |
  'cron', label, target, nextAt }` runs; the band entry reads `watch deploy
  a15f4e9 ⏳ 12m` or `cron 20:30 in 41m`; the pane lists them under a
  "Watching" head without mascots. They end on their task-notification row
  (watch) or when the cron is deleted (CronDelete) or fires.
- **Stale notification greying:** a task-notification row for a watch whose
  target the band already marked done turns the entry grey for 10 s instead
  of toasting again.
- **Caffeinate hold** (on by default): while any subagent, shell or watch runs,
  `$.process.spawn(['caffeinate', '-i', '-w', <pid>])` once (checked in the
  d.ts; if `spawn` is absent, `caffeinate -i -t 600` re-armed by the tick),
  stopped when the set empties. Option `caffeinate: on | off`, default on.
- **ALL DONE chime** when the in-flight set goes from non-empty to empty:
  one toast `★ all background work done` plus `$.audio.play` of the peers
  mod's rising chime when `toasts` is on and the agents `sound` option (new,
  default off) is on.

## 2. peers 0.2: herdr peer board pane

- `/peer-alarm board` (and a framed `[board]` on the first blocked toast's
  command twin) opens pane `peers`: one row per peer in this workspace:
  pane id, agent, state glyph and word with time in state, title, and when
  the pane is a HERDR-ORCH spoke of this session: request id, round n/ceiling,
  deadline countdown, `result.md` present or not (from
  `~/.local/state/herdr-orch/<req>/`, read with `$.fs` on the 30 s poll only
  while the pane is open).
- Blocked peers sort first and draw amber; `q` closes, `r` polls now.
- Request mapping: the envelope this session sent carries the request id and
  the target pane (read from the main-loop prompt text on `prompt.submit`
  when it matches the POLICY envelope header), kept in `$.state`
  `peers.requests`.

## 3. agents: Code view

Third view of the agents pane: `w` Who, `c` Code, `q` close; `/agents-info
code` opens it.

- **Data.** `tool.call` on Read, Edit, Write, MultiEdit, NotebookEdit, Grep,
  Glob and Bash (paths parsed from `cat`, `sed -i`, `>>`, `git add/checkout`,
  `cp`, `mv`), main loop and subagents (attributed by agentId). Per file:
  state `◌ read` blue, `● editing` amber for 30 s after an Edit or Write,
  `✓ changed` green when `git diff --numstat -- <file>` (run after each Edit
  or Write, inside a repo only, 5 s timeout) reports lines, `✗ failed` red
  when the edit tool returned an error; plus and minus counts, the tools
  used, time since the last touch, and a one-line summary from the edit
  itself: the Edit's first changed line or the Write's first line, cut to the
  box width. No model call; option `summaries: edit | haiku | off`, default
  `edit`.
- **Layout.** Header `Code map (11 files) (2 changed) ● editing kit.ts`,
  then nodes as round-bordered Boxes 22 wide and 3 lines tall, laid out in
  edit order left to right, wrapping to the next row every N nodes by pane
  width, arrows `──▶` between consecutive edited files; read-only files in an
  `ALSO READ` chip row; a `subagents` row with the numbered buttons (E3
  later). Under 60 columns, the tree list instead. `d` plus a number runs
  `/diff` on that file through `$.command.run` from a timer.
- **Scope.** Per turn by default; `a` toggles the whole session with turn
  tags; the previous turn's map is kept once.

## 4. `here` mod: ◉ HERE row (where-am-i, zero model)

- ` ◉ HERE    goal <name> · now <doing> · you: "<question>"`, orange chip
  `#fb923c`. `goal` = the goal-meter goal name read from `$.state`
  `goal-meter.goal` when present, else the first line of the prompt that
  started the longest-running task list, else blank; `now` = the last tool
  call's verb and path (Editing agents/hooks/kit.ts, Running pytest, Reading
  README.md) or the spinner word while the model is thinking; `you` = the
  question lines of the last reply (lines ending in `?`, numbered questions,
  "say go" lines), cut to 60 characters, dropped when the next prompt is
  sent.
- `/here` prints the three lines; `/here off | on`. Option `rewrite: off |
  haiku` (default off): with haiku, one call per turn rewrites the three
  parts from the last reply and the task list, as where-am-i does.

## 5. `next` mod: ➜ NEXT row (next-steps, on demand)

- `/next`: one Haiku call (`$.model.complete`, system: suggest 2 or 3 short
  prompts the person would likely send next, each under 60 characters, as a
  JSON array; keep paths and names) over the last reply and the task list;
  draws ` ➜ NEXT    1 … · 2 … · 3 … · 0 dismiss` (lime chip `#a3e635`).
  Keys 1 to 3 (framed Buttons, band focused) and `/next 2` put that text in
  the prompt box through `$.prompt.fill`; nothing sends. Hidden while a turn
  runs; cleared when a prompt is sent.
- Option `auto: on | off` (default on, Zehui's choice): on, the call runs after every turn
  whose reply is over 300 characters and no subagent is still running, as
  next-steps does.

## 6. `images` mod: thumbnails of pasted images

- A `prompt.change` hook finds `[Image #n]` tags in the box; for each new
  tag the PNG is read from the session's image cache (locate the path the
  engine uses: grep the d.ts for the image cache or the paste event; if the
  mod cannot reach the bytes, `prompt.attachment` may carry them), decoded
  once (the pack decoder from `tools/pixgrid.py` ported to TS), box-averaged
  to 48 columns by 24 rows, and drawn as half-block `Raster` thumbnails in
  a band row with the tag and size beneath; thumbnails leave when the tag
  leaves the box. Option `size: 16 | 24 | 32` rows (default 24). Non-PNG
  pastes: skipped with the tag shown as text (no `sips`).

## 0. Stack order convention (all band mods)

Top to bottom: SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60,
HERE 70, NEXT 80 (NEXT touches the prompt box). Mechanism: every zehui-mods
row is a Box with key `zm-<order>-<name>`. Each band hook takes the tree from
`next(e)` (skipping `{type:'engine'}`), collects the direct children whose
keys start with `zm-`, inserts its own row, sorts by the number, and puts any
other children (other mods, the engine) after them in their original order.
A helper `stackRow(row, below)` in each mod's kit does it (same code copied,
plugins cannot import across folders; the skill holds the canonical copy).
token-weather (JavaScript) gets it as local change 11; agents, cache-clock,
handoff, goal-meter, sys are edited in place; here and next are born with it.
Test in each mod: a fake lower tree with two zm rows out of order comes back
sorted with this row in its slot, and a non-zm row stays last.

## Order

1 and 2 (the boards), 3 (code map), 4 (HERE), 5 (/next), 6 (images). Each:
validate, test, tsc, review, reload, live look; marketplace rows; PROVENANCE;
TIMELINE; memory.

## Review questions

Answered 2026-10-20 01:05: nodes 22 wide; HERE stays in the stack whenever it
has anything (goal, now or you); caffeinate on; /next auto on; order option 2.

## Deviations accepted 2026-10-20 03:00

- images: placeholder tiles only (no bytes, no zlib in the hooks environment); built, not installed, kept for a future engine that exposes the paste.
- next: digit hotkeys removed (a bare digit in an empty composer would press a button); use the band focused + Enter, or `/next <n>`.
- agents: `c` is the Code view, clear-done moved to `x`; `summaries: haiku` is accepted but draws as `edit` (no model call in agents).
- peers: the blocked toast does not name `/peer-alarm board`; `/peer-alarm help` text unchanged.
