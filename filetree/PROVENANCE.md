# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-11-16 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-11-16-strip-forks-safety.md` (Task 17). It is written from the
Claude Code plugin API's declarations (Claude Code 2.1.325 types:
`$.fs.list`, `$.fs.exists`, `$.process.run`, `$.session.cwd`, `$.ui.open`,
`$.ui.close`, `$.ui.panes`, the `Pane` component, `Button`, `turn.start`,
`turn.complete`, `tool.call`); no third-party code is copied.

- **The idea** of a small file tree beside the conversation that marks the
  files touched this turn came from a list of mod ideas in another
  marketplace. Only the idea was taken: no code of any outside mod was
  opened, read or copied, and the tree, the porcelain reader and the pane
  are written here from the API's declarations.
- The pane with framed `r` / `c` Buttons and slash-command twins, the
  test-kit shape and the state contract follow Zehui's own peers and
  goal-meter mods.

## Look

The mark and touch colours are Catppuccin Mocha values (green, yellow,
peach, red, sapphire), as the strip mod uses. Values only.
