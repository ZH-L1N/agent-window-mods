# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-19-sys-zh-web-peers.md` (section 1). It is written from the
Claude Code plugin API's declarations (Claude Code 2.1.300 types); no
third-party code is copied.

- The parsing in `hooks/kit.ts` (load over cores, truncated; active + wired +
  compressor pages times the vm_stat header's page size; the first `n%` of
  `pmset -g batt`) follows Zehui's own herdr monitor,
  `herdr-setup/monitor/herdr_monitor.py` (`sysinfo_parts`, `_mem_used_bytes`),
  ported to TypeScript. The charging test (`; charging`, `; charged`,
  `; finishing charge`) is new here.
- The btop pane runs btop with Zehui's existing compact config
  (`~/.config/btop-mini`, not part of this mod) through the herdr CLI's
  documented split and run (`.result.pane.pane_id`).
- The row's band composition (draw the row, nest the bands beneath, skip the
  engine placeholder, yield to a survey), the framed button with a command
  twin, the band option with a store override and the test-kit shape follow
  Zehui's own cache-clock, handoff and agents mods.

## Look

The ` ▣ SYS ` chip padded to the shared 7-letter width, the `▰▱` bars and the
traffic-light colours follow the other zehui-mods rows (the "Claude Code Mods"
deck look). Look only; no code came from the deck.

2026-10-20 (0.1.1), stack order (plan 2026-10-20-boards-codemap-recap, section 0), with Claude: the row is keyed `zm-10-sys` and the AbovePrompt hook returns `stackRow(row, below)`, which sorts the zehui-mods rows beneath by their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80) and keeps other bands after them. `stackRow` in hooks/kit.ts is copied unchanged from the canonical `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; ours, no third-party code.
