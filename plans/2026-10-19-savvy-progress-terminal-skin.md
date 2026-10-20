# Plan: savvy-progress terminal skin

**Status: superseded 2026-10-19 19:45** (built and live-checked 16:30; Image crabs failed in herdr; the skin was carried into the own `agents` mod by `2026-10-19-deck-style-bands.md` and savvy-progress was retired)

## Why

The screenshots Zehui liked are savvy-progress on the Claude Code desktop
surface, where it draws SVG. On the terminal it falls back to plain rows:
`▣ title ✓` / `tier · model` / `████░░ ctx 4% · 38k ≈$0.05 0:26`. The look
can get much closer in the terminal with elements the terminal table
already has and the desktop lacks: `Raster` (a cell grid with true-colour
foreground and background per cell) and `Image` (a PNG drawn through the
Kitty graphics protocol, which Ghostty supports and herdr passes through,
verified 2026-09-09).

## What is doable, and what is not

| Desktop element | Terminal rendering | Feasible |
| --- | --- | --- |
| Cost / Tokens / Time stat tiles | three `Box borderStyle="round"` side by side, dim label, bold value | yes |
| Section headers Running · 1 / Finished · 2 / Planned · 1 | dim text with a thin rule, collapsible Finished (exists) | yes |
| Per-agent card: title, tier-coloured label, model · effort, steps, ctx, cost, time | two text rows plus a `Raster` bar in the tier colour (true RGB, not the 16-colour `█░` of today) | yes |
| Pixel crab per tier, animated | `Image` with a PNG sprite per tier (static, or 2 frames swapped with `$.ui.blit` once a second while running); `Raster` half-block fallback where Kitty graphics is absent; `alt` text elsewhere | yes, with caveats below |
| Band above the prompt: dotted pixel bar, "Tasks 2/4" pill, 50 %, crab, ×4, ✕ | `Raster` row for the dotted bar, `Text backgroundColor` pill, `Image` crab, existing Buttons; composes under token-weather | yes |
| Smooth SVG animation (floating astronaut, sweeping magnifier) | no; at most 2-frame sprite swaps | partial |

Caveats:
- `Image` needs Kitty graphics in the terminal. Ghostty and herdr: yes.
  Remote Control phone, VS Code terminal without images: the `alt` text draws
  instead. The `Raster` bar and tiles work everywhere.
- The band today only appears when savvy-flow's `progress` tool is called,
  which never happens without savvy-flow. Phase 3 adds an "any subagents
  running" mode so the band earns its row in Zehui's sessions.
- Upstream rebase: all drawing lives in a new file `hooks/terminal-skin.tsx`;
  `register.tsx` gets one import and a two-line branch in the terminal path,
  so a future upstream pull is a small re-apply.

## Phases (each shippable alone)

1. **Tiles, headers, Raster bars** (hours). New `terminal-skin.tsx` exporting
   `paneTerminal(ui, model)` used by the terminal branch of the Pane hook. No
   images yet. Keeps the compact mode and the RTL branch untouched (RTL stays
   on the upstream drawing).
2. **Crab sprites** (about a day). Six 16×12 pixel-art crabs (one per tier,
   body clay, accent in the tier colour) authored as a tiny palette array in
   `sprites.ts`, encoded to PNG once at load with a minimal PNG encoder (zlib
   store blocks, no dependency), drawn with `Image columns=4 rows=2`. A
   2-frame walk for running rows via `$.ui.blit`, respecting the existing
   `prefers-reduced-motion` option. Where `Image` is refused, a `Raster`
   half-block version of the same pixels.
3. **Band for any subagents** (hours). When no flow is active but at least one
   subagent runs, draw a slim row: `● 2 agents` dotted Raster bar coloured by
   the share finished, `×2` crew button (opens the pane), auto-hides 10 s after
   the last agent finishes. Composes with token-weather beneath. Off by a new
   `band: savvy | any | off` option, default `any`.

## Steps

1. Read the upstream terminal branch (`register.tsx:1030-1203`), `TIER_COLOR`,
   `fmtCost/fmtTokens/fmtTime`, `tierOf/colorOf` and reuse them; do not fork
   the data model.
2. Write `hooks/terminal-skin.tsx`; wire the branch; `claude plugin validate`.
3. Live check in this herdr pane: spawn two Explore agents, `/agents-info`,
   compare against the desktop screenshots. Then over Remote Control: tiles
   and bars draw, crabs fall back to alt text.
4. PROVENANCE: add the skin as local change 2; TIMELINE ledger line.

## Decisions for review

- Phase 2 crabs: worth a day, or stop after phase 1 (tiles, headers, colour bars)?
- Phase 3 band for any subagents: want it, and should it be on by default?
- Keep the panel's English UI strings, or add zh labels alongside (the mod
  already has an i18n table: en, ru, he)?
