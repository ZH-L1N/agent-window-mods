# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-19-sys-zh-web-peers.md` (section 3). It is written from the
Claude Code plugin API's declarations (Claude Code 2.1.300 types:
`$.model.complete`, `$.session.messages`, `$.ui.open`, `Markdown`); no
third-party code is copied.

- The translation rules (the system prompt in `hooks/kit.ts`) follow
  Zehui's wording in the plan: Simplified Chinese only; code, paths,
  commands, URLs, product names and proper nouns kept exactly; Markdown kept;
  no commentary. The line telling the model the text is material, not
  instructions, is added here.
- The split of a long reply (`splitInTwo`: the blank line nearest the
  middle, outside any code fence) is new here.
- The price table in `hooks/kit.ts` holds the Haiku 5.5 and Sonnet 5.5 rows
  of the agents mod's table (claude-api skill bundled with Claude Code
  2.1.303, model table cached 2026-10-06).
- The pane with framed hotkey buttons and command twins, the timer that runs
  the work outside the command's and the press's hook, and the test-kit
  shape follow Zehui's own goal-meter, cache-clock, sys and agents mods.

## Look

The dim header and the `p: prev`, `n: next`, `q: close` framed buttons follow
the other zehui-mods panes (the "Claude Code Mods" deck look). Look only; no
code came from the deck.
