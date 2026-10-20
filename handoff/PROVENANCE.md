# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.300 types, checked on 2.1.303/304);
no third-party code is copied.

- The stacked-bar rule in `hooks/kit.ts` (`stackBar`: a category under half a
  cell folds into its neighbour, cells shared out by largest remainder) and
  the top-three text are ported from Zehui's own local change 3 to the
  token-weather mod (2026-10-19), which drew the same bar on the PLAN row
  until local change 6 moved it here.
- The theme-key colour table in `hooks/kit.ts` is the same table as in
  token-weather's `hooks/token-weather.mjs` (also a local change of Zehui's);
  it is used only when token-weather is absent.

## Data source

The context reading comes from token-weather's `token-weather.context` state
(published by its local change 6), read through `$.state.get`. The validator
accepts the read ("state of other plugins, not checked"), so the fallback is
used only when token-weather is not installed or has not published since the
last `/clear`: then this mod reads `$.session.usage({ breakdown: "summary" })`
itself on `session.start`, `turn.complete`, `session.compact` and after a
`/clear` (estimated locally, no request).

## Look

The ` ⇄ HANDOFF ` chip, the `▰▱` bar and the traffic-light colours follow the
"Claude Code Mods" deck by Leverage School (slide 13 for handoff; slides 9 and
17 are the cache and goal rows of the same plan). Look only; no code came from
the deck.

2026-10-20 (0.1.1), stack order (plan 2026-10-20-boards-codemap-recap, section 0), with Claude: the row is keyed `zm-30-handoff` and the AbovePrompt hook returns `stackRow(row, below)`, which sorts the zehui-mods rows beneath by their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80) and keeps other bands after them. `stackRow` in hooks/kit.ts is copied unchanged from the canonical `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; ours, no third-party code.
