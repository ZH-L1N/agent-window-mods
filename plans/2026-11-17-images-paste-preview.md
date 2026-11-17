# images 0.4.0: the picture before you send, and true pictures

**Status: implemented 2026-11-17 15:01.** Approved by the owner 2026-11-17 13:50 (the owner tried a live
probe: a pasted image shown above the prompt before sending, drawn as a
true picture, "very clear"; "go ahead").

## Goal

1. A pasted image shows above the prompt at once, before the prompt is sent.
2. Tiles are drawn as true pictures, scaled down by the terminal, where the
   terminal can draw them; half-blocks stay as the fallback.

## Why it can work now

- Before a prompt is sent the engine gives a user mod no bytes of a pasted
  image, and no file is on disk yet. But at the moment the `[Image #n]` tag
  appears in the prompt box the picture is still on the macOS clipboard, and
  the built-in `/usr/bin/osascript` writes it to a PNG. Claude Code reads a
  pasted image the same way.
- The engine's `Image` element takes `{ file, format: 'png' }`: the terminal
  reads and scales the PNG itself.

## What the probe showed (2026-11-17, engine 2.1.326, herdr 0.9.5, Ghostty 1.4.0)

The probe is a throwaway mod of the owner's own, kept in
`.scratch/paste-preview-probe/` (not in git). Port its working parts.

- A mod is told when the box changes: `prompt.edit` (an edit of the
  person's; a paste or a burst has no `key`) and `prompt.change` (a write no
  `prompt.edit` carried). The organization plugin guard passes both on.
- `$.process.run` may start `/usr/bin/osascript` from a timer, and a
  `$.state` write from a timer redraws the band before the prompt is sent.
- An `Image` in an `AbovePrompt` row is accepted and drawn. Inside herdr the
  engine draws it only when the session's environment holds
  `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` (without it the engine refuses on
  herdr's terminal name and draws the `alt` text). The owner saw the true
  picture on screen and pasted real images.
- Not tried: an `Image` in a row placed in the transcript (`Placed`).

## Changes (all in `images/`)

### 1. The picture before you send

- `prompt.edit` and `prompt.change` are observed (always `next(e)` first,
  its answer returned unchanged; the tags are compared in memory at once and
  all work starts from a `$.clock` timer). A tag in the box now that was not
  there before is a new paste, when the change may be one: for
  `prompt.change`, an origin kind other than `history`, `undo`, `plugin`,
  `clear` and `app`; for `prompt.edit`, no `key`.
- For each new tag, one after another: `/usr/bin/osascript` (argv, no shell,
  3 s) writes the clipboard's picture to
  `<home>/.cache/zehui-mods/images/<session>-<n>-pre.png`; the tile is then
  built from that file as any tile is. The path is refused when it holds a
  quote, a backslash or a control character; the session id is used as a
  file name only when it is a plain one.
- The clipboard holds one picture. Each new tag takes a ticket when it is
  seen; a tag whose ticket is no longer the newest when its turn comes, or
  when osascript returns, is not given the clipboard's picture: its tile is
  the tag with the note `a later paste replaced it on the clipboard`.
- No picture on the clipboard (a dragged file, a pasted path, not macOS):
  the tile is the tag with the note `no picture on the clipboard`.
- The tiles show in the IMAGES row with the caption
  `[Image #n] WxH · not sent yet`. A tag that leaves the box loses its tile;
  an empty box clears them. When the prompt is sent they are dropped, their
  files emptied, and the run after sending goes on as in 0.3.0.
- Option `preview` (`on`, the default, or `off`) and `/img preview on | off`,
  kept in the store. Off: the clipboard is never read.

### 2. True pictures

- A tile built while pictures are on (before and after sending) also gets a
  small PNG:
  `sips -s format png -Z 512 <picture> --out <home>/.cache/zehui-mods/images/<session>-<n>-<gen>.png`,
  `<gen>` the build's content number, so each build after sending has a
  file name of its own and a rebuild never writes over a file a tile or a
  thumbnail holds (before sending, `<session>-<n>-pre.png`, the clipboard's
  PNG scaled in place, never while a tile holds it). A tile holds its path
  and that number. With pictures off no small PNG is made: a tile built in
  half-blocks stays in half-blocks after a switch to pictures; tiles built
  after the switch are pictures.
- How a tile is drawn: option `draw` (`auto`, the default, `picture` or
  `blocks`) and `/img draw auto | picture | blocks`, kept in the store.
  `auto` draws pictures when, at the session's start,
  `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` is `1` or `TERM_PROGRAM` is `ghostty`
  or `kitty`; otherwise half-blocks. A tile with no small PNG is drawn as
  half-blocks in every mode.
- A picture tile is the `size` option's columns wide; its rows follow the
  picture's shape (a cell is about twice as tall as wide), at most 24 and at
  most the rows the band has.
- The row under a sent prompt draws a picture too (at most 12 columns by 6
  rows) when the engine accepts an `Image` in a placed row; if it refuses
  one there, that row keeps its half-blocks and the README says so.
- A small PNG is kept while its tile, its thumbnail or a tile of the box
  holds it, and emptied when none does (a newer build released the older
  one, `/img clear` for the band's tiles); the pipeline never empties one
  itself, it hands a stray one to the caller's release. Every session end
  empties every picture file the mod holds (a `/clear` or a resume also
  forgets the tiles), and a session start empties a killed session's PNGs
  once they are more than a day old and a day has passed since its last
  sign of life, a `<session>.alive` file each session writes at its start
  and every hour (the plugin API has no delete).

### 3. Documents and manifest

`README.md` (the section "Why not before you send" becomes "Before you
send", with what is read, when, and the limits), `PROVENANCE.md`,
`.claude-plugin/plugin.json` (0.4.0, the two options, the description),
the marketplace entry, the repo README's row.

## Outside the repo

Inside herdr a session draws pictures only when it starts with
`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`. The owner's fish config sets it for
shells inside herdr. Sessions already running keep half-blocks until they
are started again.

## Success criteria

1. Pasting an image into the prompt box shows its picture above the prompt
   before sending; deleting the tag removes it; sending hands over to the
   run after sending.
2. With pictures on, the band's tiles and the row under a sent prompt are
   true pictures; with `draw` on `blocks`, or where the terminal cannot draw
   pictures, everything looks as in 0.3.0.
3. With `preview` off the clipboard is never read.
4. The clipboard is read only when a new tag appears in the box. Nothing
   leaves the machine; files are written only under
   `<home>/.cache/zehui-mods/images/`.
5. The 73 tests of 0.3.0 pass unchanged.

## Not in scope

Images attached by dragging a file or pasting a path (no clipboard picture:
they show after sending, as before); other systems than macOS for the
preview; lighter chips or other looks.

## Review (2026-11-17)

- One implementing agent built the plan with tests (117 passing: the 73 of
  0.3.0 unchanged, 44 new).
- First check, three lenses (correctness; safety and privacy; tests and
  documents), each finding tested by a skeptic: 12 raised, 10 confirmed (3
  medium, 7 low), 2 set aside. Fixed in a first round, all eight fixes
  held at the re-check: a restored draft taken for a paste; a dragged file
  or a pasted path shown with an older clipboard picture; picture files
  kept after an ordinary exit (now emptied at every session end, with a
  sweep at a session start for a killed session); a tile written just
  after a send; a rebuild that emptied a file still held (now a file for
  each build); two sentences and one test.
- That re-check found four defects in what the round added (3 medium, 1
  low), fixed in a second round: the 2 second window opened on any
  inserted text (now only on what looks like a file path); a history
  recall raised the highest tag seen; the sweep could empty a picture a
  session open for more than a day still showed (now each session writes
  a sign of life every hour, and the sweep spares its files); two builds
  of one tag at once.
- The second re-check found three of the four held and one gap rated
  high: after a `/clear` or a resume the sign of life stopped. Fixed by
  the orchestrator with a test that fails on the code before the fix,
  together with one low finding (one record of the newest build for both
  the band and the thumbnails). That last fix was not reviewed again.
- 141 tests at the end; the four test files of 0.3.0 are unchanged.
- Live, by the owner in a new session inside herdr (2026-11-17): a pasted
  image showed as a true picture before sending, and after sending.

## Ledger

| Step | Commit | Note |
| --- | --- | --- |
| images 0.4.0 | 3855dd6 | Landed 2026-11-17 15:01, pushed and installed (0.3.0 to 0.4.0). 141 tests. Three review lenses, two fix rounds, each re-checked; tried live by the owner in a new session. |
