# strip 0.1.1: one background behind the band

**Status: implemented 2026-11-17 12:59.** Approved by the owner 2026-11-17 12:33 (the owner asked for a
background that sets the strip and the rows apart from the conversation,
tried ten shades in a live probe and picked `moss`).

## Goal

The rows above the prompt (the strip and every other mod's row) get one
background colour, so it is plain where the conversation ends.

## Why here

The strip already holds the band's one `AbovePromptList` hook, which arranges
every row. That hook may also answer around what `next(e)` returns, so one
wrapper there colours the whole band. No other mod changes, and the band
takes no extra row.

## What the probe showed (2026-11-17, engine 2.1.326, a throwaway mod)

- A `Box` with only `backgroundColor` around the list's answer is accepted
  and fills every row to the full width. The engine's own `[-]` mark at the
  right end of the first row (3 cells) stays on the terminal's background.
- A wrapper that also sets `width` is refused (`engine node under a Box with
  prop "width"`), and the band is then drawn without it. So the wrapper
  carries the colour and nothing else.
- The pills' caps and the gaps between pills take the band's colour. The
  working pill, drawn by a client module, does too. Framed buttons and other
  mods' chips keep their own colours.
- A band of the pills' own grey (`#313244`) swallows the pills, so that
  shade is not offered by name.

## Changes (all in `strip/`)

1. `hooks/band.ts` (new, pure): the named shades, the default (`moss`,
   `#18271d`), and `bandColorOf(choice)`, which reads a shade's name,
   `#rrggbb` or `off` and answers the colour, `off`, or null.
2. `hooks/register.tsx`: a `bandColor` state value (`#rrggbb` or `off`),
   loaded at the session's start from the store (`band`), else the
   `bandColor` option, else the default. The list hook arranges as before and
   then wraps the answer in `<Box backgroundColor>` unless the colour is
   `off`, there is no row, a survey holds the band or the surface is not the
   terminal. It wraps also when the strip drew no row. `/strip band
   [<shade> | #rrggbb | off]` sets it and keeps the choice in the store;
   `/strip sources` says it.
3. `types/index.d.ts`: `bandColor` in the state contract.
4. `.claude-plugin/plugin.json`: version 0.1.1, the `bandColor` option.
5. Tests: `hooks/band.test.ts` for the reading of a choice; in
   `hooks/register.test.tsx` the wrapper by default, each way it is left out,
   the command, the store over the option, and the old list tests unchanged.
6. `README.md`, `PROVENANCE.md`.

## Success criteria

1. With no setting, every row of the band has the moss background at the
   full width, in a session's real band.
2. `/strip band off` removes it at once; `/strip band <shade | #rrggbb>`
   changes it at once; the choice is still there in the next session.
3. The band's order and the hidden rows are as before (the old tests pass
   unchanged).
4. A wrapper the engine refuses outright never blanks the band. This rests
   on the engine: it passes such an answer over, as the probe showed. The
   test kit cannot refuse an answer, so no unit test pins it. The wrapper
   counts toward the size the engine allows the band's tree, which the
   README says.

## Not in scope

The prompt box, the status line, panes, other surfaces, and lighter pills
for a lighter band.

## Review (2026-11-17)

One independent check of the finished change: two lenses (correctness;
tests and documents), each finding tested by a skeptic. 8 raised, 4
confirmed (all low, all in documents), 4 set aside. Fixed before landing:
the README's sentence on a refused wrapper said more than was seen, and
now names the tree limit; criterion 4 above says how it is checked; the
repo README's row and the marketplace entry name the background and the
`band` verb. The correctness lens found the rewritten list hook handles
every case of 0.1.0 as before when the background is off, and calls
`next` exactly once on every path that does not throw.

## Ledger

| Step | Commit | Note |
| --- | --- | --- |
