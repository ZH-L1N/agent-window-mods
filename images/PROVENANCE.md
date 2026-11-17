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
The thumbnails are the user's own pasted images, drawn in half-blocks, or
since 0.4.0 as true pictures where the terminal can draw them.

## 0.2.1, 2026-10-20

A tile taller than the rows the band has free is drawn smaller in the same shape (nearest cell) instead of being dropped to its caption; under 3 free rows the captions show alone. Found live: a portrait screenshot (580x1302) showed only its caption.

2026-11-16, tests only (plan 2026-11-16-strip-forks-safety, Task 0b), with Claude: the stack-order test and the short-band test assumed rows of other mods beneath this one, which engine 2.1.325 no longer hands a row hook. The first is replaced by "row: the hook draws this plugin's own row"; the second now counts its room from `maxRows` alone. No runtime change; order across mods is the strip mod's list hook.

2026-11-16, 0.3.0 (plan 2026-11-16-strip-forks-safety, Task 15), with Claude: a labelled thumbnail row under the sent prompt. The run places a transcript row (`$.ui.place`, drawn through the `Placed` component in `hooks/under.tsx`, which checks both the row's plugin and its id), keeps each built tile at most 12 by 6 cells (`thumbOf`, via `shrinkTile`) and records the placed rows; option `under` (default on) and `/img under on | off` (store key `under`); a `/clear` or resume forgets them. `shrinkTile` now shares its nearest-cell resampler with `thumbOf`, unchanged in what it draws. Written from the 2.1.325 declarations of `$.ui.place`, `UiPlaceResult`, the `Placed` props and `$.clock.now`; ours, no third-party code. The band row and its options are unchanged.

2026-11-16, 0.3.0 review fixes (same plan, Task 15 as corrected after the phase 6 review), with Claude: `/img off` and the `auto` option no longer stop the row under the prompt (the tiles are built for the row alone; three band tests now set `under` off so they still test the band's own guarantee); the place id is `img-<stamp>-<run>`, the stamp read at this load's `session.start`, so a reload never reuses an id; a row's entry gets `done` once its run ends or is stopped, and a tag with no thumbnail on a done row drops its loading mark; a prompt typed over a running turn has its row placed at the next main-loop `turn.start`. Ours, no third-party code.

2026-11-16, 0.3.0 second review fix (same plan, Task 15), with Claude: a prompt typed over a running turn may be delivered into that turn, with no `turn.start` of its own (`PromptSubmitInput.turnId`: "typed over that turn, or delivered into it"), and its row then waited for the person's next prompt. Its row is now placed at the next main-loop `turn.start`, else at the running turn's `turn.complete`, each row once and in order. A first version of this fix also observed `turn.step` to place the row at the turn's next model request; it was taken out the same day, because a hook on that streaming event stands in every model response of every session, a cost out of proportion to a thumbnail row. After a spot review the same day, the placement at a turn's end waits 1.5 seconds first, so a prompt that was held for a turn of its own is placed by that turn's start (under its prompt, not above it), and a prompt sent with `wait` is left to its own turn however late it starts. Written from the 2.1.325 declarations of `TurnCompleteInput` and `PromptSubmitInput`; ours, no third-party code.

2026-11-17, 0.4.0 (plan `plans/2026-11-17-images-paste-preview.md`), with Claude: the picture before you send, and true pictures. The code is Zehui Lin's own, written with Claude (Claude Code), MIT, ported from the owner's own throwaway probe mod of the same day (kept outside git): `prompt.edit` and `prompt.change` observed (`next(e)` first, its answer returned unchanged), the box's tags compared in memory, a ticket per new tag so an older tag never gets a newer picture, the clipboard written to a PNG by `/usr/bin/osascript` (argv, no shell, 3 s) with the path checks, the small PNG from `sips -s format png -Z 512`, and the `Image` element with `{ file, format: 'png', generation }`. Written from the engine 2.1.326 declarations of `PromptEditInput`, `PromptChangeInput` and `PromptChangeOrigin`, `ImageProps` and `ImageSource`, and `$.env.get`.

- **Idea credit only**: a preview of a pasted image before the prompt is sent was seen as an idea in another person's mod (a paste preview). Only the idea was taken; no code was copied, and this mod works its own way (osascript, sips, the IMAGES row).
- **The osascript lines** (`set png_data to (the clipboard as «class PNGf»)`, `open for access POSIX file ... with write permission`, `set eof`, `write`, `close access`) are the standard AppleScript for writing the clipboard's PNG data to a file.
- The row under a sent prompt draws an `Image` too: the engine's test kit accepts one in a `Placed` row (checked 2026-11-17); whether the terminal draws it there is not yet checked in a live session.
