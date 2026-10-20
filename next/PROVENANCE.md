# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-20 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-20-boards-codemap-recap.md` (section 5, and section 0 for the
stack order). It is written from the Claude Code plugin API's declarations
(Claude Code 2.1.300 types: `turn.start`, `turn.complete`, `prompt.submit`,
`session.start`, `session.end`, `command.run`, the `AbovePrompt` component
and its `isWorking` prop, framed `Button`s, `$.model.complete`,
`$.prompt.fill` with `PromptFillArgs`, `$.agent.list`, `$.session.messages`,
`$.state.get` of another plugin, `$.clock.after`); no third-party code is
copied.

- **Design reference** (by name only): hamzafer's mission-control,
  where-am-i and next-steps, and jarrodwatts' image-view. They were looked at
  for their idea and look; no code was taken from them.
- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the framed Buttons with
  command twins and the test-kit shape follow Zehui's own handoff, sys and
  here mods; the cross-plugin read of `goal-meter.goal` (typed in
  `types/peer.d.ts`) follows the here mod's.
- The model call and the fill run from a `$.clock` timer, never inside a
  hook, as in Zehui's own zh mod; the mocked `model.complete` beneath the
  plugin in the tests follows zh's test kit.
- `stackRow` in `hooks/kit.ts` is copied unchanged from the canonical
  `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`;
  ours, no third-party code.

## Look

The ` ➜ NEXT ` chip on lime `#a3e635`, padded to the zehui-mods chip width,
follows the other zehui-mods rows (HERE, GOAL, CACHE, HANDOFF).
