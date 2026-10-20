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

## Commands

`/img [<n> | on | off | clear]`

- `/img`: show the last tiles again (after the next prompt cleared them).
- `/img <n>`: draw `[Image #n]` of this session (works with `auto` off too).
- `/img off`: stop drawing a sent prompt's images on their own and hide the
  row; kept for the next session.
- `/img on`: draw them again.
- `/img clear`: drop the tiles.

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
