# Plan: own agents mod, deck-style bands, month usage, context bar

**Status: implemented 2026-10-19 19:20, live-verified 19:35, savvy-progress retired 19:45** (v3; agents mod 34 tests, token-weather 12 tests; probe and sprite tools kept in `../tools/`)

Decisions taken by Zehui on 2026-10-19:

- `▰▱` bars everywhere; card bars 10 cells, band bars 6.
- The agents band takes the AGENTS shape from the "Claude Code Mods" deck
  (claude_code_mods.pptx, slide 15). Look only; no code from it.
- token-weather gets the deck's ` ◔ PLAN ` chip.
- Enterprise plan: no five-hour or weekly windows. Show the month's usage as
  dollars and tokens, "Oct $412 · 38M tokens".
- Kitty probe: all four squares drew the same size, so herdr ignores the cell
  box in every placement mode. `Image` is unusable for small sprites here;
  the mascot is drawn as half-block `Raster`.
- Mascot art: the free "Claude Mascot Pack" from getillustrations.com (75
  pixel-art pieces, SVG/PNG/AI, "Commercial and personal use license", made
  by the site's designers, not Anthropic). Art only, no code. The pack lives
  in `~/.cache/zehui-mods/downloads/mascot-pack`; the mod carries only the
  extracted pixel grids of the poses it uses, as data.
- Cards grow to the pose's height (7 to 12 rows); Collapse stays for the
  compact view. Animation layers 1, 3 and 4; no bar shimmer.
- No third-party source where avoidable. savvy-progress (johnnyvizz/claude-kit)
  is replaced by an agents mod of our own; the context bar is built from the
  engine's own breakdown, not from hamzafer/claude-code-mods.

## 0. Do we still need savvy-progress? No.

What we use from it is the data model (agent.spawn, turn.step, turn.complete,
the Agent tool call) and the pane and band drawing. The drawing is already
ours (`terminal-skin.tsx`, `sprites.ts`, written today). The savvy-flow
`progress` and `step` tools were never used. A fresh mod `agents` in
`~/.claude/mods/agents` replaces it:

- `hooks/register.tsx` (ours, about 250 lines): one run record per subagent
  `{ id, agentId, type, description, model, effort, status, startedAt,
  endedAt, contextTokens, contextMax, tokens, costUsd, steps }`, kept in
  `$.state` under `agents.runs`; the main loop's model from
  `$.session.model()`; skills fired from `skill.prompt`; `/agents-info` opens
  the pane (same command name, so muscle memory holds); a once-a-second tick
  while anything runs or the band lingers.
- `hooks/skin.tsx`: today's `terminal-skin.tsx` with the Raster bars replaced
  by `▰▱` text and the crabs as half-block Raster (below). Hebrew and the
  desktop fall to a plain text pane; no SVG, no RTL table.
- `hooks/sprites.ts`: unchanged, PNG encoder removed.
- Tests: ported from today's `skin.test.tsx`, `crabs.test.tsx`,
  `agents-band.test.tsx`, plus register tests for the run record.
- Cost per model: a small table of input/output/cache prices, checked
  against the claude-api skill at build time, with "≈ ?" for an unknown model.
- Then `claude plugin uninstall savvy-progress@zehui-mods`, remove the folder
  and the marketplace row. Backup of the vendored copy stays in the session
  scratchpad until the new mod has been live-checked.

## 1. `▰▱` bars

- Card bar 10 cells, band bar 6: `▰` × filled in the bar colour, `▱` × empty
  dim. A live run with no steps shows at least one `▰`.
- Colours: tier colour while running, green when finished, red on error,
  amber only when a reported step takes twice the average of finished steps.
- Mascot: pixel grids extracted from the pack's 1x PNGs (21 px cells on a
  1020 px canvas; poses are 19 to 29 px wide, 13 to 23 px tall), stored as
  `hooks/mascots.ts` (palette-indexed rows, one entry per pose, with the
  pack name and licence line), drawn as half-block `Raster` at one column per
  pixel and one row per two pixels. Pose per status:
  running: one of `repairing-with-tools`, `writing-software-code`,
  `building-colorful-blocks`, `debugging-system-bugs`,
  `reading-data-document`, `thinking-in-code`, picked at spawn by a hash of
  the run id and kept for its lifetime; a main-loop card with
  `artboard-25cla` sits at the top while two or more subagents run;
  finished: `with-success-checkmark`; error: `confusion-spiral-pixel`;
  waiting on a tool or on the person: `sleeping-soundly`.
  Animation: layer 1 a one-pixel bob every second while running (the
  Raster shifts down one pixel row on odd seconds); layer 3 the braille
  spinner in the tier colour in place of `●`; layer 4 on finish the pose
  swaps to the checkmark and the bar flashes bright green for 0.6 s, on
  error the pose swaps to the spiral and the body pulses amber for 2 s.
  All still under the reduced-motion setting.

## 2. AGENTS band in the deck's shape

```
 ◎ AGENTS  main fable·5.1 ⟳ │ Explore haiku "find the hooks" ✓ · checker sonnet "check the prices" ⟳ │ skills: plugin-authoring ×2   ×2 ✕
```

- Chip ` ◎ AGENTS ` bold `#0b0b0f` on pink `#f472b6`.
- `main <model> ⟳` while a turn runs.
- One entry per run in the current batch (overlap rule: runs live now plus
  those that ended after the earliest live start): type or name, model word in
  the deck's colours (fable `#d16bff`, opus `#ff8c1a`, sonnet `#3d9bff`,
  haiku `#19c3a6`), the Agent call's description in quotes cut to 22
  characters, then ⟳ amber `#f59e0b`, ✓ green `#22c55e`, ✗ red `#ef4444`.
- `skills: name ×n` in lime `#a3e635`, cleared when the band hides.
- Width: drop task text oldest first, then fold the tail into `+N more`,
  always keep the first task and one skill; under 40 columns the short form
  `● 2 agents ▰▰▰▱▱▱ ×2 ✕`.
- Lingers 10 s after the last run; `✕` hides it until a new run starts;
  `×N` opens the pane. Composes token-weather beneath; yields to the survey.
- Option `band: on | off`, default on.

## 3. token-weather: chip, month usage, stacked context bar

One line, left to right:

```
 ◔ PLAN  ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱░░ 12%  117k / 1M  last turns ▂▃▂▆▂▁▂  +1.9k  cost $97.53  Oct $412 · 38M tokens
```

- Chip ` ◔ PLAN ` bold `#0b0b0f` on blue `#60a5fa`.
- Stacked context bar, 20 cells: `$.session.usage({ breakdown: 'summary' })`
  gives the categories `/context` draws (system prompt, tools, MCP tools,
  memory, skills, messages, free, compaction buffer), each with tokens and a
  colour. Used categories draw `▰` in their colour in that order, free draws
  dim `▱`, the buffer `░`. A category under half a cell is folded into its
  neighbour. The percent turns yellow at 70% of the compaction point and red
  at 90%, replacing the weather word's colour role; the weather glyph stays.
- The breakdown is read on `turn.complete` and after `session.compact`, never
  on every render. On a build whose usage has no `breakdown`, the bar is a
  plain two-colour fill.
- Month usage: on `turn.complete` and `session.start` write this session's
  `cost.usd` and total tokens to `$.store` under
  `token-weather.month.<YYYY-MM>.<sessionId>`; the band sums the current
  month. Keys older than two months are deleted at `session.start`. A
  `spend_limit` window is still shown if a gateway reports one. README notes
  that the figure starts with this change and covers this machine only.
- The AGENTS band has no `(+$x)` last-turn cost; the `+1.9k` delta and
  the 12-turn chart stay as they are.

## Out of scope

goal-meter and recording-mode get their own plans. cache-clock and
auto-handoff are not planned. blast-radius is untouched.

## Steps

1. `agents` mod from scratch in `~/.claude/mods/agents`: register, skin, band,
   tests; validate, `claude plugin test`, tsc. Marketplace row, install,
   `/reload-plugins`, live check with two slow agents (band, pane, crabs).
2. Uninstall savvy-progress; remove its folder and row; update README.
3. token-weather: chip, stacked bar, month store; validate, test, reload,
   look.
4. PROVENANCE (agents: all ours, deck credited for the look; token-weather:
   local changes 3 to 5), TIMELINE lines, plan status, memory.

## Review questions

- Keep the `/agents-info` command name, or rename to `/agents` (built in,
  so not possible) or `/crew`?
- Context bar 20 cells, or let it take whatever the line has left?
