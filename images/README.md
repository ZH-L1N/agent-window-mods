# images

After you send a prompt with pasted images, a ▣ IMAGES row above the prompt
draws each `[Image #n]` as a small half-block thumbnail, with `[Image #n] WxH`
(the image's own size in pixels) beneath it. The row clears when you send
the next prompt.

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
- **Drawn with** `Raster` half-block cells only, never `Image` (in herdr an
  `Image` draws only its alt text). Terminal only; hidden while a survey is
  up.
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

## Why not before you send

While the tag sits in the prompt box, a user-scope mod gets no pasted
image's bytes: `$.prompt.media` answers only a managed-settings install,
and only inside its `prompt.submit` hook. No PNG is on disk yet, and the
hooks environment has no zlib or `DecompressionStream` to inflate a PNG with.
After you send, the engine writes each pasted image to the session's images
folder, and sips turns it into a BMP, which needs no decoder. (images 0.1.0
drew placeholder tiles in the box; that is gone.)

## Options

| Option | Values | Default | What it does |
| --- | --- | --- | --- |
| `size` | `12`, `16`, `24`, `32` | `24` | Tile width in columns; the height follows the image, at most 24 rows. |
| `auto` | `on`, `off` | `on` | Draw a sent prompt's images on their own. `/img on` and `/img off` override it. |
| `linger` | `turn`, `2min`, `until-cleared` | `turn` | `turn`: until the next prompt is sent. `2min`: two minutes after it showed, or the next prompt if sooner. `until-cleared`: until `/img clear`; new images are added to the row. |
| `under` | `on`, `off` | `on` | Place a labelled thumbnail row in the transcript under the sent prompt. `/img under on` and `/img under off` override it. |

## Commands

`/img [<n> | on | off | clear | under on | under off]`

- `/img`: show the last tiles again (after the next prompt cleared them).
- `/img <n>`: draw `[Image #n]` of this session (works with `auto` off too).
- `/img off`: stop drawing a sent prompt's images on their own and hide the
  row; kept for the next session.
- `/img on`: draw them again.
- `/img clear`: drop the tiles.
- `/img under off`: place no thumbnail row under the next sent prompts (rows
  already placed stay); kept for the next session. `/img under on`: place
  them again.

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

- No network, no model calls. The only processes are `sips` (convert, and
  read the size), each with a 3-second limit.
- Reads `HOME` for the scratch folder; with no `HOME`, tiles are text only.

See `PROVENANCE.md` for where it came from.
