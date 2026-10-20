# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license, to the plan
`plans/2026-10-19-sys-zh-web-peers.md` (section 4). It is written from the
Claude Code plugin API's declarations (Claude Code 2.1.300 types:
`$.tool.register`, `tool.call`, `$.ui.ask`, `$.process.run`,
`$.session.messages`, `$.store`); no third-party code is copied.

- **Design reference**: the capture web_read returns is shaped after Zehui's
  own ui-selector data contract,
  `~/Documents/GitHub/ui-selector/docs/data-contract.md` (`CaptureV1`): page
  identity is origin + pathname only, the query string, hash, cookies,
  storage and form values have no field to land in, addresses are reduced to
  origin + pathname, and everything left out is named in an explicit list.
  The one-time question per unknown site (Allow once / Always / No) follows
  ui-selector's run-once confirmation. No ui-selector code is used; the page
  script in `hooks/kit.ts` is new here.
- The herdr split and run (`.result.pane.pane_id`) follow Zehui's own sys
  mod's btop button. `herdr pane close <pane_id>` is from `herdr pane --help`
  (herdr as installed on 2026-10-19).
- The `terminal-browser ls --json` shape (`browsers[].key`, `.pane.pane`,
  `.inCurrentTab`, `.tabs[].id/.active/.url/.title`) and the `action -- open`
  and `action -- eval ... --json` envelope (`{ success, data: { result } }`)
  were read from terminal-browser 0.13.4's own help and its CLI's output code,
  run read-only; none of it is copied.
- The command with a store-backed list, the test-kit shape and the gating
  hook's `.catch` follow Zehui's own sys, zh, cache-clock and agents mods.
