# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-20 with Claude
(Claude Code), under the MIT license: 0.1.0 to the plan
`plans/2026-10-20-boards-codemap-recap.md` (section 6), 0.2.0 rewritten to
`plans/2026-10-20-images-after-send.md`. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.300 types: `prompt.submit`,
`turn.start`, `session.start`, `session.end`, `command.run`, the
`AbovePrompt` component and its `maxRows` and `bodyColumns` props, `Raster`
and its cell encoding, framed `Button`s, `$.fs.list`, `$.fs.exists`,
`$.fs.stat` with `resolve: true`, `$.fs.read` with `as: 'bytes'`,
`$.fs.write`, `$.process.run`, `$.session.id`, `$.session.cwd`, `$.env.get`,
`$.store`, `$.clock.after`, `$.command.register`, `$.ui.toast`);
no third-party code is copied.

- **Idea credit only**: jarrodwatts' image-view (showing a pasted image in
  the terminal) was looked at for the idea. No code was taken from it, and
  this mod works differently (sips and half-block Raster cells).
- **The sips route** is ours: macOS's `sips -s format bmp -Z 48` turns the
  PNG the engine writes after send into an uncompressed BMP, which needs no
  decoder (verified 2026-10-20: a 1376x1584 screenshot became a 41x48, 32-bit
  BI_BITFIELDS, top-down BMP with its pixels at byte 138). The BMP reader and
  the box-average are ours, written from the BMP file format's public layout.
- The band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the framed Button with a command
  twin, the store-kept on/off, the timer and process patterns and the
  test-kit shape follow Zehui's own here, next and sys mods; the half-block
  `Raster` cell encoding follows the agents mod's mascots.
- `stackRow` in `hooks/kit.ts` is copied unchanged from the canonical
  `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; the
  row's key `zm-90-images` is spelled beside it (`ROW_KEY`) instead of being
  added to the copied `STACK`, so the copy stays identical. Ours, no
  third-party code.

## Look

The ` ▣ IMAGES ` chip on fuchsia `#e879f9`, padded to the zehui-mods chip
width, follows the other zehui-mods rows (HERE, NEXT, GOAL, CACHE, HANDOFF).
The thumbnails are the user's own pasted images, drawn in half-blocks.
