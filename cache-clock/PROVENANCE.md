# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.300 types, checked on 2.1.303/304);
no third-party code is copied.

- `hooks/prices.ts` is the same price table as in Zehui's agents mod
  (`~/.claude/mods/agents/hooks/kit.ts`), duplicated because plugins cannot
  import across mod folders; the 1-hour cache-write multiplier (2x input) was
  added here. The prices come from the claude-api skill bundled with Claude
  Code 2.1.303 (model table cached 2026-10-06, read 2026-10-19).
- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey) and the test-kit shape follow
  Zehui's own agents and handoff mods.

## Look

The ` ● CACHE ` chip, the `▰▱` bar and the traffic-light colours follow the
"Claude Code Mods" deck by Leverage School (slide 9 for the cache row; slides
13 and 17 are the handoff and goal rows of the same plan). Look only; no code
came from the deck.

2026-10-20 (0.1.1), stack order (plan 2026-10-20-boards-codemap-recap, section 0), with Claude: the row is keyed `zm-40-cache` and the AbovePrompt hook returns `stackRow(row, below)`, which sorts the zehui-mods rows beneath by their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80) and keeps other bands after them. `stackRow` in hooks/kit.ts is copied unchanged from the canonical `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; ours, no third-party code.
