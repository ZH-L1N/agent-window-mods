# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-20 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-20-boards-codemap-recap.md` (section 6, and section 0 for the
stack order). It is written from the Claude Code plugin API's declarations
(Claude Code 2.1.300 types: `prompt.edit`, `prompt.change`, `prompt.submit`,
`session.start`, `session.end`, `command.run`, the `AbovePrompt` component and
its `maxRows` and `bodyColumns` props, `Raster` and its cell encoding, framed
`Button`s, `$.store`, `$.clock.after`); no third-party code is copied.

- **Design reference** (by name only): hamzafer's mission-control,
  where-am-i and next-steps, and jarrodwatts' image-view. They were looked at
  for their idea and look; no code was taken from them.
- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the framed Button with a command
  twin, the store-kept on/off and the test-kit shape follow Zehui's own here
  and next mods; the half-block `Raster` cell encoding follows the agents
  mod's mascots.
- `stackRow` in `hooks/kit.ts` is copied unchanged from the canonical
  `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; the
  row's key `zm-90-images` is spelled beside it (`ROW_KEY`) instead of being
  added to the copied `STACK`, so the copy stays identical. Ours, no
  third-party code.
- The plan's PNG decoder port (from `tools/pixgrid.py`) was not written: the
  engine hands a plugin no pasted image's bytes while the tag is in the box
  (`$.prompt.media` answers only a managed settings install, only inside its
  `prompt.submit` hook; no image cache exists on disk), and the hooks
  environment has no zlib or `DecompressionStream`. Each tile is a
  placeholder; see the README.

## Look

The ` ▣ IMAGES ` chip on pink `#f472b6`, padded to the zehui-mods chip width,
follows the other zehui-mods rows (HERE, NEXT, GOAL, CACHE, HANDOFF). The
placeholder tile (a round grey frame round a two-grey checkerboard with
`no preview` across the middle) is ours.
