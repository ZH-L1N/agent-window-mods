# images

A ▣ IMAGES row above the prompt with a tile for each `[Image #n]` tag in the
prompt box, the tag and the tile's size beneath it. A tile leaves when its tag
leaves the box.

```
 ▣ IMAGES   ╭──────────────────────────────────────────────╮ [ hide ]
            │  (grey checkerboard, 24 rows in all)         │
            │                  no preview                  │
            ╰──────────────────────────────────────────────╯
            [Image #1] · 48×24
```

- **No preview yet**: each tile is a placeholder (a grey frame round a
  checkerboard, `no preview` in the middle). The engine hands a plugin no
  pasted image's bytes while the tag sits in the box: `$.prompt.media` answers
  only a managed settings install, and only inside its `prompt.submit` hook;
  no image cache is written to disk; and the hooks environment has no zlib or
  `DecompressionStream` to inflate a PNG with. The tile shows that an image is
  attached and which tag it is.
- **Tags**: followed through `prompt.edit` (typing and pastes) and
  `prompt.change` (history recall, a clear, an undo, a plugin's fill); each
  tag once, in order of first appearance. A sent prompt or a `/clear` empties
  the list.
- **Size**: the `size` option sets the tile's height in rows, twice as many
  columns wide (48 by 24 by default); shrunk to fit the band's height (less
  the caption and the rows the bands stacked beneath it take, so the whole
  band shows without scrolling) and the width beside the chip, never under 4
  rows; with no room for a 4-row tile the row stands aside. When not all
  tiles fit on one line, the first ones and `+n more`.
- **Drawn with** `Raster` half-block cells only, never `Image` (in herdr an
  `Image` draws only its alt text).
- **Hidden** on a survey, off the terminal, when turned off, and with no tag
  in the box.
- **Stack**: the row is keyed `zm-90-images`, under NEXT 80 (SYS 10, PLAN 20,
  HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80, IMAGES 90);
  other bands follow.

The button works only while the band has focus (ctrl+x tab; herdr passes no
clicks), so it has a command:

| Button | Command |
| --- | --- |
| `hide` | `/images off` |

## Command

`/images [on | off]`

- `/images`: list the tags in the prompt box and whether the tiles show.
- `/images off` (or `hide`): hide the tiles; kept for the next session.
- `/images on`: show them again.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `size` | `16`, `24`, `32` | `24` |

## Install (local)

```bash
claude plugin install images@zehui-mods --scope user
```

## Notes

- No network, no processes, no model calls.

See `PROVENANCE.md` for where it came from.
