# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-20 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-20-boards-codemap-recap.md` (section 4, and section 0 for the
stack order). It is written from the Claude Code plugin API's declarations
(Claude Code 2.1.300 types: `tool.call`, `turn.start`, `turn.complete`,
`prompt.submit`, `session.start`, `session.end`, `command.run`, the
`Spinner` and `AbovePrompt` components, `$.state.get` of another plugin,
`$.store`, `$.clock.after`, `$.ui.invalidate`, `$.model.complete`); no
third-party code is copied.

- **Design reference** (by name only): hamzafer's mission-control,
  where-am-i and next-steps, and jarrodwatts' image-view. They were looked at
  for their idea and look; no code was taken from them.
- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the store-backed `on | off` switch,
  the terminal-column measure and the test-kit shape follow Zehui's own
  goal-meter and handoff mods; the cross-plugin state read
  (`goal-meter.goal`, typed in `types/peer.d.ts`) follows handoff's read of
  `token-weather.context`.
- The Haiku call runs from a `$.clock` timer, never inside a hook, as in
  Zehui's own zh mod.
- `stackRow` in `hooks/kit.ts` is copied unchanged from the canonical
  `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`;
  ours, no third-party code.

## Look

The ` ◉ HERE ` chip on orange `#fb923c`, padded to the zehui-mods chip width,
follows the other zehui-mods rows (GOAL, CACHE, HANDOFF).

2026-11-16, tests only (plan 2026-11-16-strip-forks-safety, Task 0b), with Claude: the stack-order test asserted that the row hook sorts the other mods' rows, which engine 2.1.325 no longer hands it (each plugin is asked for its own row). It is replaced by "row: the hook draws this plugin's own row". No runtime change; order across mods is the strip mod's list hook.

2026-11-16, 0.1.1 (plan 2026-11-16-strip-forks-safety, Task 12b), with Claude: the row waits while a main-loop turn runs until the turn has run `delaySeconds` (new option, default 5; 0 shows at once). `live.turnStartedAt` is set from `$.clock.now()` at a main-loop `turn.start` and reset at `session.start`, `turn.complete` and a clearing `session.end`; a `$.clock.after` timer armed at the turn start asks for the redraw at the mark. Between turns the row shows as before. The row test "shows with any one part" advances its clock past the delay before drawing the spinner word; its expectations are unchanged.
