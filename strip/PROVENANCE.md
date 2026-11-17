# Provenance

## Code

All code in this mod is the repo owner's own, written on 2026-11-16 with
Claude (Claude Code), under the MIT license, to the plan
`plans/2026-11-16-strip-forks-safety.md` (Phase 3, Tasks 9 to 12). It is
written from the Claude Code plugin API's declarations (Claude Code 2.1.325
types: `AbovePrompt`, `AbovePromptList`, `Pane`, `Client` and `ClientModule`,
`$.state`, `$.store`, `$.clock`, `$.config.list`, `$.session.usage`,
`$.command`, `$.ui.open`, the `Edit` and `Write` result types). No third-party
code is copied, and no outside mod's source was opened to write it.

- It grows out of two throwaway prototypes of the owner's own, built and
  tried live before the plan was written: a pill strip that read other mods'
  state and hid the old rows through the band's list, and a band with a meter,
  launchers,
  fit levels, a diff pane and a working glyph. The pills, the cell-width
  count, the cross-mod reads, the launcher fallback, the line diff and the
  test-kit shape were carried over and reworked; the prototypes' fake scenes
  were dropped.
- The old diff showed hunk headers that started at line 1, because it diffed
  an Edit's two snippets. Here a step is built from the tool's own result (its
  `structuredPatch`, else the whole file before and after), so the headers
  carry the file's true line numbers.
- The state it reads belongs to the owner's other mods in this repo
  (token-weather, handoff, cache-clock, agents, sys, peers, queue,
  motion-hold) and to the redgreen fork; only the fields read are typed, in
  `types/peer.d.ts`.
- The command with store-backed switches, the framed pane buttons with
  command twins and the README and test-kit shape follow the owner's sys,
  handoff, peers and here mods.
- Version 0.1.1 (2026-11-17, plan `plans/2026-11-17-strip-band-background.md`):
  the band's background, one wrapper around the list hook's answer. It was
  tried first in a throwaway mod of the owner's own, with the shades side by
  side in a live session (Claude Code 2.1.326). That probe also showed that
  the engine refuses a wrapper that sets a width, so the wrapper carries a
  colour and nothing else.

## Look

The pill colours are the Catppuccin Mocha palette (MIT), by value only:
green `#a6e3a1`, yellow `#f9e2af`, peach `#fab387`, red `#f38ba8`, teal
`#94e2d5`, mauve `#cba6f7`, sapphire `#74c7ec`, lavender `#b4befe`, overlay
`#6c7086` for dim text, surface `#313244` for an idle pill and crust
`#11111b` for the text of an attention pill. The rounded caps and the icons
are code points of a Nerd Font's private use area, named by number in
`hooks/pills.ts`; no font file is part of this mod.

The band's shades (`hooks/band.ts`), by value only: `crust` `#11111b` and
`mantle` `#181825` are Catppuccin Mocha's, and `raised` `#24273a` is
Catppuccin Macchiato's base. `black`, `navy`, `plum`, `teal`, `moss` and
`cocoa` are the owner's own picks.

## Ideas

These were seen in other people's mods and status bars while the plan's spec
was written (`docs/superpowers/specs/2026-11-16-strip-forks-safety.md`). They
are taken as ideas only: each is built here from the API's declarations, and
no code, text or art was copied.

- A row of pills that open panes: the pane opens at once, and when that
  cannot be placed the slash command runs instead and a toast says it is
  queued.
- Fit levels: the row gets plainer as the terminal narrows, instead of
  dropping whole blocks.
- A context meter measured against the auto-compact window, with colour steps
  at 30, 60 and 80 percent.
- A diff pane for each turn's edits.
- Animation on the drawing thread through a Client module, shown only after a
  delay.
- A context pane by category with cost totals, and panes without a
  background fill.

## Choices the plan left open

- A peers pill with panes and none waiting is green (as in the prototype);
  with one waiting the whole text is peach.
- At the plainest level the system pill keeps the percent signs (`92% 95%`),
  as the context pill keeps its own.
- Old rows kept after the strip stand in their old order: SYS, PLAN, HANDOFF,
  CACHE.
- The system pane's battery bar runs the other way from a load: yellow under
  30 and red under 15 while not charging, since a full battery is not a
  warning.
- The context pane's categories come from the token-weather or the handoff
  reading; the strip's own fallback reading has none, and the pane says so.
- A recorded diff line is cut to 300 characters, and a file path to 1,000, so
  the session state stays small.
- When the surface refuses the added `"transparent"`, the open goes on as it
  came.
