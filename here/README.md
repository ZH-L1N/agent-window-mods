# here

A ◉ HERE row above the prompt that says where the session is, with no model
call by default:

```
 ◉ HERE     goal Build the mods · now Editing agents/hooks/kit.ts · you: "Should I ship it?" +1
 ◉ HERE     now Sauteing…                                  (thinking, before the turn's first tool call)
 ◉ HERE     you: "Say go and I will merge it."              (only a question left)
```

- **goal**: the goal-meter mod's goal name (its `goal-meter.goal` state)
  while its task list is open; else the first line of the prompt that started
  the main loop's open task list (TodoWrite, or TaskCreate and TaskUpdate),
  kept until every item of it is done; else nothing.
- **now**: the main loop's last tool call as a verb and a path relative to
  the session (`Editing agents/hooks/kit.ts`, `Reading README.md`,
  `Running uv run pytest`, `Searching for "stackRow"`, `Fetching
  docs.example.com`), recorded as the call starts; before a turn's first tool
  call, the terminal spinner's word (`Sauteing…`), which leaves with the turn.
  Subagents' calls are not counted.
- **you**: the question lines of the last main-loop reply: lines ending in
  `?`, numbered items under a "questions" heading, and "say go" lines (code
  blocks skipped, at most five kept). Control characters are dropped from
  every part. The row shows the first, cut to 60
  columns, in orange, with `+n` for the rest. Dropped when you send the next
  prompt (a slash command does not drop them).
- **Shown** whenever any of the three has a value; hidden otherwise. On a
  narrow band the goal is cut first (40, then 20 columns), then now (48, then
  28); the question is kept.
- **Stack**: the row is keyed `zm-70-here` and takes its slot in the
  zehui-mods stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50,
  GOAL 60, HERE 70, NEXT 80); other bands follow. It yields to a survey and
  draws on the terminal only.

## /here

| Command | What it does |
| --- | --- |
| `/here` | Prints the three parts, one line each, every kept question under `you`. |
| `/here on` / `off` | Shows or hides the row (kept in the store across sessions). |

The row has no buttons, so nothing in it needs the band focused.

## Options

`rewrite`: `off` (default) or `haiku`. With `haiku`, one Haiku call
(`$.model.complete`, effort low, 300 tokens, 20 s limit) after each
main-loop answer rewrites the three parts from the reply's last 8,000
characters and goal-meter's task list; the row and `/here` use what it said,
falling back to the plain parts where it said nothing. The call runs from a
timer after the turn, is skipped while the row is off, and its answer is
dropped once you send the next prompt or the next main-loop turn starts.

## Install (local)

```bash
claude plugin install here@zehui-mods --scope user
```

## Notes

- No network and no processes: the mod reads its own hooks' events and
  goal-meter's state. A model is called only with `rewrite=haiku`.
- The spinner word is seen only while the engine draws the Spinner, and a
  render may not write state ("drawing is pure", host check), so the word is
  kept in the module (`hooks/live.ts`) and the Spinner hook asks for one
  redraw when it changes.

See `PROVENANCE.md` for where it came from.
