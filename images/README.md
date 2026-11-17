# images

A ▣ IMAGES row above the prompt draws each pasted `[Image #n]` as a small
thumbnail: before you send, as soon as the tag appears in the prompt box
(`[Image #n] WxH · not sent yet`), and after you send, with `[Image #n] WxH`
(the image's own size in pixels) beneath it. The row clears when you send
the next prompt. Where the terminal can draw pictures the thumbnails are
true pictures, scaled by the terminal; elsewhere half-blocks.

```
 ▣ IMAGES   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ [ clear ]
            ▀▀▀▀ (24 columns, rows  ▀▀▀▀ from the image's shape)
            [Image #1] 1376x1584     [Image #2] 1920x1080
```

## What it does

- `prompt.submit` notes the `[Image #n]` tags of the prompt you sent. The
  main loop's next `turn.start` starts the work from a timer, one image after
  another:
  1. Wait for `<n>.png` in the session's images folder,
     `/private/tmp/claude-<uid>/<cwd with every / as ->/<session id>/images/`
     (looked for every 250 ms, up to 5 s). /private/tmp is shared by every
     user and the hooks cannot read their uid, so the session's folder must
     be the only one of that name under any `claude-<uid>`, and the PNG must
     be a plain file with no symbolic link on its path; otherwise only the
     tag is shown.
  2. `sips -s format bmp -Z 48 <png> --out ~/.cache/zehui-mods/images/<session>-<n>.bmp`
     (3 s limit) turns it into an uncompressed BMP no wider or taller than 48
     pixels; `sips -g pixelWidth -g pixelHeight <png>` reads its own size.
  3. The BMP is read and parsed (24 or 32 bits, BI_RGB or BI_BITFIELDS,
     bottom-up or top-down, rows padded to 4 bytes), box-averaged to `size`
     columns by round(size × height / width / 2) half-block rows (at most 24
     rows; a taller image gets a narrower tile so it keeps its shape), and
     packed as `Raster` cells: `▀`, the upper pixel as the foreground, the
     lower as the background.
  4. The BMP is emptied (the plugin API has no delete; one zero-byte file per
     session and tag stays in `~/.cache/zehui-mods/images/`).
- At most 6 tiles are kept, newest last. Tiles sit side by side; when not all
  fit the width, the newest that fit and `+n more`. When the tallest tile and
  its caption do not fit the band's height beside the other bands, only the
  captions show.
- **No sips** (not macOS, or sips fails), the file never came, or the BMP
  would not parse: the tile is its `[Image #n]` tag as text only.
- **Drawn as** a true picture (see "True pictures" below) or as `Raster`
  half-block cells. Terminal only; hidden while a survey is up.
- **Stack**: the row is keyed `zm-90-images`, under NEXT 80 (SYS 10, PLAN 20,
  HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80, IMAGES 90);
  other bands follow.

## The row under the sent prompt

With `under` on (the default), the prompt's images also get a small labelled
row in the transcript, right under the prompt that carried them:

```
> compare [Image #1] with [Image #2]
  ▀▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀
  [Image #1] 1376x688  [Image #2] 1920x1080
```

- When the run for a sent prompt starts (from the same timer, after its turn
  starts), it places a transcript row with
  `$.ui.place({ id: 'img-<stamp>-<run>' })` (`<stamp>`: the clock at this
  load's session start, in base 36, so a row placed after a reload never
  takes the id of an older row still in the transcript) and records the id
  with the prompt's tags (the newest 12 rows are remembered; an older one is
  passed on and draws nothing).
- A prompt typed while a turn is running: the band starts at once as before,
  but its row waits for the next main-loop turn start, when that prompt
  joins the transcript as a turn of its own. When the running turn ends and
  no turn starts within 1.5 seconds (the prompt was delivered into the turn
  that ended), the row is placed then, so it is never left for the person's
  next prompt; a prompt sent with "wait its turn" (`ctrl+x enter`) is always
  left to its own turn. Each waiting row is placed once, in order. The mod
  does not hook the model's stream to place the row sooner: such a hook
  would stand in every response of every session.
  Thumbnails built meanwhile show as soon as it is placed. A `/clear` or a
  resume drops a row still waiting.
- Each tile the pipeline builds is also kept drawn small: at most 12 columns
  by 6 rows, in the same shape (the newest 24 are kept, by tag).
- With true pictures on, the thumbnail is an `Image` of the tile's small PNG
  (at most 12 columns by 6 rows, in the picture's shape); otherwise its
  half-blocks. The engine's test kit accepts an `Image` in this placed row;
  whether the terminal draws it there is unverified in a live session. If it
  does not, `/img draw blocks` draws this row (and the band) in half-blocks.
- The row's hook draws, for each tag, the thumbnail and a dim caption
  `[Image #n] WxH`; `[Image #n] …` while the tile is not built yet. Once the
  row's run has ended or was stopped (a newer prompt, `/img off`,
  `/img clear`), a tag with no thumbnail (never built, or dropped from the
  newest 24 since) reads `[Image #n]`, so a row never claims to be loading
  for good. It draws only rows this plugin placed (every plugin's hook hears
  every placed row), and only in the terminal.
- `UserMessage` carries no attachments, and another mod may redraw the
  prompt's row, so the thumbnails sit in a row of their own instead.
- It uses the band's pipeline but not its switches: with `/img off` or the
  `auto` option off and `under` on, a sent prompt's tiles are still built,
  for this row only, and nothing is added to the band. `/img off` and the
  `auto` option keep their meaning for the band row only, and
  `/img under on | off` does not change the band row. `/img under off` places
  no new rows; rows already placed stay.
- Unverified in a live session: where the row lands on screen (tested only
  against the engine's test kit). To check it, paste an image, send the
  prompt, and look for the row right under it; also try a prompt typed while
  a turn is running, both while the model is using tools (the prompt is then
  likely delivered into the running turn, and the row placed at that turn's
  end, below its answer) and while it writes its last answer (the prompt then
  likely waits for a turn of its own; if the row lands above that prompt, it
  was placed at the earlier turn's end, before the prompt joined).
- Display only: the model and the transcript file never read the row, and a
  `--resume` brings none back. A `/clear` or a resume forgets the rows and
  the thumbnails.

## Before you send

While the tag sits in the prompt box, a user-scope mod gets no pasted
image's bytes (`$.prompt.media` answers only a managed-settings install,
inside its `prompt.submit` hook), and no PNG is on disk yet. But at the
moment the `[Image #n]` tag appears, the picture is still on the macOS
clipboard, and the built-in `/usr/bin/osascript` can write it to a PNG; that
is the mod's route.

- **When**: the mod observes `prompt.edit` (an edit of yours) and
  `prompt.change` (a write no edit carried); each hook passes the event on
  first and returns its answer unchanged. The box's tags are compared in
  memory at once; all work starts from a timer. A tag in the box that was not
  there before is a new paste only when the change may be one: an edit with
  no single key (a paste, a burst), or a write from any origin but a history
  recall, an undo, another plugin's fill, a clear or the app. A tag you type
  by hand, or one a history recall brings back, is not read.
- **Put back, not pasted**: the mod keeps the highest tag number seen in this
  conversation. Only two things raise it: a new tag that a change which may
  be a paste brings into the box (an edit with no single key, or a write from
  any origin but a history recall, an undo, another plugin's fill, a clear or
  the app), and the tags of a sent prompt. A history recall (even of another
  conversation's prompt), a tag you type by hand and the other origins named
  never raise it. The engine numbers pasted images upward, so a new tag whose
  number is not above it was put back by the engine (a queued prompt pulled
  back, a prompt put back after an early interrupt, a stash restored), and
  the clipboard is not read for it. The number starts again at a session
  start, a `/clear` and a resume.
- **What is read**: for each new tag, one after another,
  `/usr/bin/osascript -e 'set png_data to (the clipboard as «class PNGf»)' ...`
  (argv, no shell, 3 s limit) writes the clipboard's picture to
  `~/.cache/zehui-mods/images/<session>-<n>-pre.png`. The path is refused when
  it holds a quote, a backslash or a control character, and the session id
  is used in a file name only when it is plain (letters, digits, `_`, `-`;
  otherwise `session`). The tile is then built from that file as any tile is
  (the BMP, its size, and with true pictures on the small PNG, written over
  the same file).
- **One picture**: the clipboard holds one picture. Each new tag takes a
  ticket when it is seen; a tag whose ticket is no longer the newest when its
  turn comes, or when osascript returns, is not given the clipboard's
  picture: its tile is the tag with the note
  `a later paste replaced it on the clipboard`.
- **A dragged file or a pasted path**: it arrives as inserted text, which the
  engine turns into a tag, while the clipboard may still hold an older
  picture. Two rules follow. First, the new tags of an edit with no single
  key that inserts text of its own (anything but `[Image #n]` tags and white
  space) are not read. Second, when that inserted text, trimmed, looks like
  a file path or a list of them (no line break, and it starts with `/`, `~`,
  `file://` or a quote followed by `/` or `~`, or it ends, a closing quote
  aside, with `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tif`,
  `.tiff` or `.heic` in any letter case), a new tag an engine write brings
  within 2 seconds after it is not read either. No clipboard read and no
  tile for them; a picture attached from a file shows after you send, as any
  sent image does. Typed text, an input-method commit, dictated text and a
  pasted link to a web page open no such window: an image pasted right after
  them is read.
- **No picture** on the clipboard when a pasted tag is read (not macOS, the
  clipboard emptied since): the tile is the tag with the note
  `no picture on the clipboard`; the image still shows after you send.
- **What shows before you send, and what does not**: shown, a tag that a
  paste brings into the box (a keyless edit of tags only, or a write that
  may be a paste and is not within 2 seconds after an inserted path), whose
  number is above every tag seen so far, while `preview` is on, with the
  clipboard's picture, or a note when there is none or a later paste took
  its place. Not shown: a tag you type by hand; one a history recall, an
  undo, another plugin's fill, a clear or the app brings; a tag put back by
  the engine; a dragged file or a pasted path; a tag that came while
  `preview` was off.
- **In the row**: while the box holds such tiles, the IMAGES row shows them,
  captioned `[Image #n] WxH · not sent yet`, and not the last sent prompt's.
  A tag that leaves the box loses its tile; an empty box clears them;
  `/img clear` and the row's clear button drop them. When you send, they are
  dropped, their files emptied, and the run after sending goes on as above.
- **Off**: option `preview` off, or `/img preview off` (kept for the next
  session): the clipboard is never read.
- **Limits**: macOS only; the clipboard is read only when a new tag appears;
  a picture is read only from the clipboard as it stands then. Nothing leaves
  the machine; files are written only under `~/.cache/zehui-mods/images/`.
- Unverified in a live session beyond the owner's probe of 2026-11-17 (a
  paste seen, the clipboard read, the picture drawn): how the engine brings
  a dragged file's tag into the box (in the edit itself, or by a write of
  its own soon after; both are handled), and whether a picture pasted within
  2 seconds after a pasted path arrives as an edit (shown) or as an engine
  write (not shown before sending).

## True pictures

- Every tile built (before and after sending) also gets a small PNG while
  pictures are on: `sips -s format png -Z 512 <picture> --out
  ~/.cache/zehui-mods/images/<session>-<n>-<gen>.png`, `<gen>` the build's
  content number, so each build after sending has a file of its own and a
  rebuild never writes over a file a tile or a thumbnail still holds; before
  sending, `<session>-<n>-pre.png`, the clipboard's PNG scaled in place
  (never while a tile holds that file). A tile holds its path and that
  number. With pictures off, no small PNG is made, so a tile built then stays
  in half-blocks after `/img draw picture`; tiles built after the switch are
  pictures.
- The row draws such a tile as an `Image` of that file: the terminal reads
  and scales the PNG itself. It is the `size` option's columns wide, its rows
  from the picture's shape (a cell is about twice as tall as wide), at most
  24 rows and at most the rows the band has (narrower then, so it keeps its
  shape).
- **When**: option `draw` (`auto`, the default, `picture` or `blocks`) and
  `/img draw auto | picture | blocks` (kept for the next session). `auto`
  draws pictures when, at the session's start, `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`
  is `1` or `TERM_PROGRAM` is `ghostty` or `kitty`; otherwise half-blocks.
  A tile with no small PNG is drawn in half-blocks in every mode.
- **herdr**: inside herdr the engine draws an `Image` only when the session
  starts with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` in its environment
  (without it, the engine shows the `alt` text, `[Image #n]`). A session
  started without it keeps half-blocks under `auto` until it is started
  again.
- **Files**: a picture file is kept while a tile, a thumbnail (the row under
  the sent prompt) or a tile of the box holds it, and emptied when none does
  (a newer build of the same tag released the older one, `/img clear`, a
  send, a tag leaving the box); a run that fails or stops empties what it
  wrote that nothing holds. Every session end (an exit, a `/clear`, a
  resume, a logout, a signal the engine sees) empties every picture file the
  mod still holds; a `/clear` or a resume also forgets the tiles. When two
  builds of one tag run at once (`/img <n>` beside a sent prompt's run), a
  tile older than the newest already written for that tag is not written
  and its file is emptied. Each session writes an empty
  `~/.cache/zehui-mods/images/<session>.alive` at its start and every hour
  (stopped when the session ends; a `/clear` or a resume keeps it going
  under the new session's name): that sign of life is what protects a running
  session's pictures, however long it has been open. A session that was
  killed leaves its files: a later session's start empties every non-empty
  `.png` there last written more than 24 hours ago whose name does not start
  with `<session>-` for a session whose `.alive` file was written within the
  last 24 hours (a plain file, no link on its path, at most 200 a start, never
  one that session holds). So a killed session's pictures are emptied by
  another session's start once a day has passed since its last sign of life.
  The `.alive` files are never emptied (they are empty). The plugin API has
  no delete: a zero-byte file per build, and one `.alive` file per session,
  stay in that folder.

## Options

| Option | Values | Default | What it does |
| --- | --- | --- | --- |
| `size` | `12`, `16`, `24`, `32` | `24` | Tile width in columns; the height follows the image, at most 24 rows. |
| `auto` | `on`, `off` | `on` | Draw a sent prompt's images on their own. `/img on` and `/img off` override it. |
| `linger` | `turn`, `2min`, `until-cleared` | `turn` | `turn`: until the next prompt is sent. `2min`: two minutes after it showed, or the next prompt if sooner. `until-cleared`: until `/img clear`; new images are added to the row. |
| `under` | `on`, `off` | `on` | Place a labelled thumbnail row in the transcript under the sent prompt. `/img under on` and `/img under off` override it. |
| `preview` | `on`, `off` | `on` | Show a pasted image above the prompt before you send it (reads the clipboard when a new tag appears). `/img preview on` and `/img preview off` override it. |
| `draw` | `auto`, `picture`, `blocks` | `auto` | True pictures or half-blocks; `auto` by the terminal at the session's start. `/img draw ...` overrides it. |

## Commands

`/img [<n> | on | off | clear | under on | under off | preview on | preview off | draw auto | draw picture | draw blocks]`

- `/img`: show the last tiles again (after the next prompt cleared them).
- `/img <n>`: draw `[Image #n]` of this session (works with `auto` off too).
- `/img off`: stop drawing a sent prompt's images on their own and hide the
  row; kept for the next session.
- `/img on`: draw them again.
- `/img clear`: drop the tiles, the ones not sent yet too.
- `/img under off`: place no thumbnail row under the next sent prompts (rows
  already placed stay); kept for the next session. `/img under on`: place
  them again.
- `/img preview off`: never read the clipboard, and drop the tiles not sent
  yet; kept for the next session. `/img preview on`: images pasted from then
  on are shown; tags already in the box are not read again.
- `/img draw picture | blocks | auto`: true pictures, half-blocks, or by the
  terminal; kept for the next session.

The button works only while the band has focus (ctrl+x tab, or a click in
Claude Code's fullscreen renderer; the classic renderer reports no clicks), so
it has a command:

| Button | Command |
| --- | --- |
| `clear` | `/img clear` |

## Install (local)

```bash
claude plugin install images@zehui-mods --scope user
```

After an edit: bump `version` in `.claude-plugin/plugin.json`, then
`claude plugin update images@zehui-mods` and `/reload-plugins`.

## Notes

- No network, no model calls. The only processes are `sips` (convert, read
  the size, make the small PNG) and, before you send, `/usr/bin/osascript`
  (write the clipboard's picture to a file), each with a 3-second limit.
- Reads `HOME` for the scratch folder (with no `HOME`, tiles are text only),
  and `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` and `TERM_PROGRAM` once at the
  session's start for `draw auto`.

See `PROVENANCE.md` for where it came from.
