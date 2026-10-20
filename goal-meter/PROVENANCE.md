# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.300 types, checked on
2.1.303/304), including the task-list tools' input and result types
(`TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`); no third-party code is
copied.

- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the store-backed `on | off` switch
  and the test-kit shape follow Zehui's own agents and cache-clock mods.

## Look

The ` ◆ GOAL ` chip, the `▰▱` bar and the traffic-light colours follow the
"Claude Code Mods" deck by Leverage School (slide 17 for the goal row; slides
13 and 9 are the handoff and cache rows of the same plan). Look only; no code
came from the deck.

2026-10-20 (0.1.1), stack order (plan 2026-10-20-boards-codemap-recap, section 0), with Claude: the row is keyed `zm-60-goal` and the AbovePrompt hook returns `stackRow(row, below)`, which sorts the zehui-mods rows beneath by their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80) and keeps other bands after them. `stackRow` in hooks/kit.ts is copied unchanged from the canonical `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; ours, no third-party code.
