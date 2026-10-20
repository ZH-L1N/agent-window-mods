# Plan: images mod, thumbnails above the stack after send (default on)

**Status: implemented 2026-10-20 10:59** (step 1 done: 0.2.0 built, review findings fixed, final gate passed: validate, 44 tests, tsc; not yet installed)

**Status: approved 2026-10-20 07:45** (size 24 columns default, fuchsia chip, clear on the next prompt) (v1 proposed a browser
pane; Zehui: "I thought this can be rendered just above the stack"; the sips
route makes that possible)

## Why after send, and how the pixels get in

Before send, a user-scope mod gets no pasted-image bytes (`$.prompt.media`
answers only managed-settings plugins) and the hooks environment has no
decompressor for PNG. After send, the engine writes each pasted image to
`/private/tmp/claude-<uid>/<cwd with / as ->/<session id>/images/<n>.png`.
macOS's `sips` converts that to an uncompressed BMP, which needs no decoder:
`sips -s format bmp -Z 96 <png> --out <bmp>` gives a 32-bit BGRA bitmap
(verified 2026-10-20: 83x96 px, 32 KB, parsed and drawn in half-blocks).

## Behaviour

- `prompt.submit` (observing, with `.catch`): note the `[Image #n]` tags in
  the sent text. On the following main-loop `turn.start`, for each tag, from
  a timer: wait for `<n>.png` to exist (`$.fs.exists` every 250 ms, up to
  5 s), run `sips -s format bmp -Z <2*rows> <png> --out
  ~/.cache/zehui-mods/images/<session>-<n>.bmp` (`$.process.run`, 3 s limit),
  read the BMP with `$.fs.read({ as: 'bytes' })`, parse the header (offset,
  width, height, 24 or 32 bpp, bottom-up or top-down rows), box-average to
  `size` columns by the aspect-derived number of half-block rows, and keep the cells in `$.state`
  `images.tiles` (at most 6 tiles, newest last; the BMP files are deleted
  after reading).
- Row ` ▣ IMAGES  ` (order 90, under NEXT, chip fuchsia `#e879f9`): the tiles
  side by side, each a `Raster`, with `[Image #n] WxH` beneath. Drawn only on
  the terminal, composed with the stack, yielding on the survey.
- The row stays until the next prompt is sent (then it clears), or for two
  minutes, whichever comes first (option `linger: turn | 2min | until-cleared`,
  default `turn`).
- Option `size: 12 | 16 | 24 | 32` columns (default 24); the tile's height follows the image's aspect (half-block rows = columns × height / width / 2, at most 24 rows). Option
  `auto: on | off` (default on).
- `/img`: redraw the last tiles; `/img <n>` the given image of this session;
  `/img off | on` for the session (`$.store`); `/img clear`.
- The session folder is found with `$.fs.list('/private/tmp')` for
  `claude-*` dirs, the cwd slug from `$.session.cwd()` and `$.session.id()`.
  Off macOS (no `sips`) the row shows the tag and size as text.
- Replaces images 0.1.0 (placeholder tiles, never installed): version 0.2.0,
  installed this time.

## Steps

1. Rewrite `images/hooks/` (register, kit with the BMP parser and the
   box-average, row, tests with mocked process and fs: tag parsing, folder
   resolution, wait, BMP 24/32-bit top-down and bottom-up, tile size, linger,
   `/img n`, off/on, no-sips fallback). Validate, test, tsc.
2. Install, reload, paste an image, see the row; `/img off`, paste, nothing.
3. PROVENANCE, README, marketplace row, TIMELINE, memory, commit.

## Review questions

Answered 2026-10-20 07:45: fuchsia chip; clear on the next prompt.
