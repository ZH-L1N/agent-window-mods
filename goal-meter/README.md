# goal-meter

A ◆ GOAL row above the prompt that reads Claude's own task list. There is no
goal to set by hand: the row appears when the main loop writes a task list,
and hides two minutes after the last task is done.

```
 ◆ GOAL  Build the mods ▰▰▰▰▱▱ 4/6 · 67% · 18m · ETA ~9m │ ▶ Write the deck
 ◆ GOAL  Build the mods ▰▰▰▰▱▱ 4/6 · 67% · 31m · ETA ~9m │ ▶ Write the deck 10m   (amber: dragging)
 ◆ GOAL  Build the mods ▰▰▰▰▰▰ 6/6 · done ✓ in 34m                                  (green, two minutes)
```

- **Source**: the task-list tools of this build: `TodoWrite` (the whole list
  each call), `TaskCreate` and `TaskUpdate` (one task each call; `deleted`
  removes it) and `TaskList` (brings the goal's own tasks up to date). Only
  the main loop counts: subagents' lists are ignored.
- **Name**: the first line of the prompt that started the turn the list was
  made in, cut to 50 terminal columns (24 on a narrow band; a CJK
  character takes two).
- **Bar**: 6 cells of tasks done out of all. Green; amber when the running
  task has taken twice the finished tasks' average, with its own minutes
  after it.
- **Figures**: `done/total · percent · minutes since the list was made`, then
  `ETA ~9m` once a task has finished: the finished tasks' average time × the
  tasks left. A task that never showed as running counts from the finish
  before it.
- **Task**: the running task, or the first open one when none runs.
- **Done**: `done ✓ in 12m` in green for two minutes, then the row hides, and
  one toast: "Goal done in 12m, 4 tasks". A new list after that starts a new
  goal.
- **History**: the last five goals, finished or stopped (replaced by a new
  list or a `/clear` before they were done), kept in the store across
  sessions.
- **Stack**: the row is keyed `zm-60-goal` and takes its slot in the zehui-mods
  stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80); other bands follow.

## /goals

| Command | What it does |
| --- | --- |
| `/goals` | Opens the pane: every task (`▶` running, `✓` done, `○` open) with its minutes, then the last five goals. |
| `/goals on` / `off` | Shows or hides the row and its done toast (kept across sessions; overrides the `band` option). |
| `/goals clear` | Forgets the current goal and the history. |
| `/goals help` | Explains the row and the arguments. |

The bare `/goal` is built into Claude Code, hence `/goals`. The row has no
buttons, so nothing in it needs the band focused.

## Options

`band`: `on` (default) or `off`.

## Install (local)

```bash
claude plugin install goal-meter@zehui-mods --scope user
```

See `PROVENANCE.md` for where it came from.
