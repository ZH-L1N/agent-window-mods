# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-19-sys-zh-web-peers.md` (section 5). It is written from the
Claude Code plugin API's declarations (Claude Code 2.1.300 types:
`$.process.run`, `$.clock`, `$.env.get`, `$.audio.play`, `$.ui.toast`,
`$.store`, `$.state`); no third-party code is copied.

- **Design reference**: the idea of watching herdr agents' states and
  alerting on blocked and done follows Zehui's own herdr monitor,
  `herdr-setup/monitor/` (ZH-L1N/herdr-setup). No monitor code is used; the
  transition step in `hooks/kit.ts` is new here.
- The `herdr agent list` JSON shape (`.result.agents[]` with `pane_id`,
  `workspace_id`, `agent`, `agent_status` idle|working|blocked|done|unknown,
  `terminal_title_stripped`) was read from herdr's own output, run read-only
  on 2026-10-19; none of it is copied.
- The timer with a generation guard, the command with a store-backed switch
  and the test-kit shape follow Zehui's own sys, web and cache-clock mods.

## Board (0.2.0)

The board pane (`hooks/pane.tsx`), the envelope parser and request records
(`hooks/orch.ts`) and their tests are Zehui Lin's own, written on 2026-10-20
with Claude (Claude Code), under the MIT license, to the plan
`plans/2026-10-20-boards-codemap-recap.md` (section 2), from the Claude Code
2.1.300 plugin API's declarations (`prompt.submit`, `$.fs.stat`, `$.fs.read`,
`$.ui.open`, `$.ui.panes`, `$.ui.close`, the `Pane` component, `Button`
hotkeys). No third-party code is copied.

- **Design reference**: the board's look (one row per agent, state first, a
  view of who needs you) follows the idea of hamzafer's mission-control, read
  for its look only (the plan's other references, hamzafer's where-am-i and
  next-steps and jarrodwatts' image-view, belong to other mods); no code is
  taken from any of them.
- The envelope header (`[HERDR-ORCH v0] req=<id> from=<agent-name>@<pane-id>
  type=<type>` and its seven types), the result path
  (`~/.local/state/herdr-orch/<req-id>/result.md`), the result file's valid
  first two lines and the 30-minute default deadline are Zehui's own
  herdr-setup `POLICY.md` (sections 2 and 4), read on 2026-10-20.

## Sounds

`assets/blocked.wav` (two low 330 Hz beeps, 0.4 s) and `assets/done.wav`
(C5-E5-G5 rising chime, 0.6 s) are synthesised by `tools/make-sounds.py`
(ours, standard library only, same date and licence). No sample or
third-party audio is used.
