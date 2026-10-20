# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-10-19 with Claude
(Claude Code), under the MIT license. It replaces the vendored
`savvy-progress` mod (johnnyvizz/claude-kit, MIT): no code of that upstream is
copied. The run record, the hooks and the band are written fresh from the
Claude Code plugin API's declarations.

- `hooks/skin.tsx` adapts Zehui's own terminal skin for savvy-progress
  (`terminal-skin.tsx`, written the same day), with text `▰▱` bars in place
  of Raster bars and the mascots in place of the crabs.
- The savvy-flow tier colours (`TIER_COLOR` in `hooks/kit.ts`) are the values
  savvy-progress used; colours only.
- The price table in `hooks/kit.ts` is from the claude-api skill bundled
  with Claude Code 2.1.303 (model table cached 2026-10-06).

### 2026-10-19, second round (0.2.0): background shells, numbered cards, toasts

Plan `plans/2026-10-19-agents-shells-toasts.md` (in `~/.claude/mods`), items
E1, E2 and E4; E3 (the messages view) is not in this round. Written by Zehui
Lin with Claude (Claude Code), MIT, from the Claude Code plugin API's
declarations (Claude Code 2.1.303/304):

- `hooks/shells.ts` (new): the command lexer and the coding-agent labels
  (`codex`, `opencode run`, `claude -p`), the `<task-notification>` parser
  and the last-output-line reader. The notification and background-result
  formats were read from Zehui's own session transcripts.
- `hooks/register.tsx`: the Bash `tool.call` hook (background task id and
  output file), the `session.append` hook that ends a shell on its
  notification, the finish toasts and the output-line poll.
- `hooks/band.tsx`, `hooks/skin.tsx`, `hooks/kit.ts`: shell entries and
  cards, the numbered card buttons (stubs until E3), the `N tasks` wording.

Review fixes, same day (2026-10-19), by Zehui Lin with Claude: an agent
found anywhere in a pipeline or list, `codex exec resume` prompts, a
notification's claim released unless its shell ended, the last output line
and the recorded command clipped, and the pane reading ended shells' last
lines once on opening.

The idea of showing background shells came from hamzafer/claude-code-mods
(`agent-radar`), looked at only: no code, text or art came from it.

## Look

The AGENTS band follows the "Claude Code Mods" deck (claude_code_mods.pptx,
slide 15): the pink ` ◎ AGENTS ` chip, the model colours (fable `#d16bff`,
opus `#ff8c1a`, sonnet `#3d9bff`, haiku `#19c3a6`) and the status colours.
Look only; no code came from the deck.

## Mascot art

Pixel art from the "Claude Mascot Pack" by getillustrations.com
(https://getillustrations.com/illustration-pack/claude-mascot-pack),
"Commercial and personal use license", pack downloaded 2026-10-19; the pack
itself is not redistributed, only the pixels of the poses used, extracted
from the pack's 1x PNGs into `hooks/mascots.ts`:

the 38 poses listed under 0.4.0 below (ten until 0.3.0:
`repairing-with-tools`, `writing-software-code`, `building-colorful-blocks`,
`debugging-system-bugs`, `reading-data-document`, `thinking-in-code`
(running), `artboard-25cla` (main loop), `with-success-checkmark` (finished),
`confusion-spiral-pixel` (error), `sleeping-soundly` (waiting)).

The pack is made by the site's designers, not by Anthropic.

### Shell and codex mascots (ours)

The four grey mascots in `SHELL_POSES` at the end of `hooks/mascots.ts`
(A `shell-terminal-face`, B `codex-hex-badge`, C `shell-window`,
D `codex-blue-cap`) are not from the pack: drawn by Zehui/Claude on
2026-10-19 in the pack's proportions (20 pixels wide), as letter grids with
their own palette (`SHELL_PALETTE`), and ours under the code's MIT license.
A is wired for background shells and D for a coding agent's CLI
(`SHELL_POSE`, `CODEX_POSE`); B and C are kept selectable by those constants.

## 0.2.0 addendum, 2026-10-19 21:30

Plain shells use the terminal-window mascot (`shell-window`, Zehui's pick). Codex-style shells show one of five "fuzzies" (`fuzzy-pink-headphones`, `fuzzy-blue-beret`, `fuzzy-yellow-triangle`, `fuzzy-green-square`, `fuzzy-purple-heart`), drawn by Zehui/Claude in the spirit of Codex's own mascots, not copied from any asset; a shell keeps the one its run id hashes to.

## 0.2.1, 2026-10-19 22:10

Ended runs are capped by the new `keepEnded` option (default 10, pruned as runs end); `c: clear done` in the pane and `/agents-info clear` drop them all. Zehui: "there are so many finished subagents now, should we clean them?"

2026-10-20, stack order (plan 2026-10-20-boards-codemap-recap, section 0), with Claude: the row is keyed `zm-50-agents` and the AbovePrompt hook returns `stackRow(row, below)`, which sorts the zehui-mods rows beneath by their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80) and keeps other bands after them. `stackRow` in hooks/kit.ts is copied unchanged from the canonical `~/.claude/skills/building-claude-code-mods/references/stack-row.tsx`; ours, no third-party code.

## 0.3.0, 2026-10-20: watches, crons, caffeinate, ALL DONE, Code view

Plan `plans/2026-10-20-boards-codemap-recap.md` (in `~/.claude/mods`),
sections 1 and 3, approved 2026-10-20 01:05. Written by Zehui Lin with Claude
(Claude Code), MIT, from the Claude Code plugin API's declarations (bundled
`claude-code.d.ts`, Claude Code 2.1.300/303); no third-party code.

- `hooks/watch.ts` (new): a watch's target, the time-left words, a small
  five-field cron reader for the next fire time, and the Monitor event rows.
- `hooks/codemap.ts` (new): the code map's books (the file tools' and Bash
  commands' paths, the edit summaries, `git diff --numstat` parsing, the turn
  and session scopes) and `hooks/code.tsx` (new): the Code view.
- `hooks/register.tsx`: the Monitor, CronCreate and CronDelete hooks, event
  and cron-fire rows, stale greying, the caffeinate hold (`$.process.spawn`
  of `caffeinate -i -t 600`, from the tick only), ALL DONE, the file-tool
  hooks, the numstat reads (`$.process.run` of `git` only, and only for files
  under the session's directory) and the /diff queue run from the tick
  (`$.command.run`).
- Review fixes, 2026-10-20 with Claude: heredoc bodies and quoted `>` no
  longer name files (`withoutHeredocs`, `lexWords` in `hooks/shells.ts`); a
  `[` in an edited or read path is literal; stale greying counts only a
  target seen done in the last minute (`DONE_RECENT_MS`); a Bash exit code
  never marks its target failed; summaries are capped at 80 characters when
  recorded.
- `hooks/band.tsx`, `hooks/skin.tsx`, `hooks/kit.ts`: watch and cron
  entries, the Watching section, the `☕` mark, the view keys (`w`, `c`, `q`;
  the clear button moved from `c` to `x`), shared card numbering.
- `assets/done.wav`: copied unchanged from the peers mod (`peers/assets/done.wav`,
  ours, generated by `peers/tools/make-sounds.py`), the rising ALL DONE chime.
- Tests: `hooks/watch.test.ts`, `hooks/code.test.tsx` (new); the test kit
  fakes `$.process.run`, `$.process.spawn`, `$.audio.play`, `$.command.run`
  and the Monitor, Cron and file tools, so no test runs git or caffeinate.

Design references, looked at by name only (no code, text or art taken):
hamzafer's `mission-control`, `where-am-i` and `next-steps` mods, and
jarrodwatts' `image-view`. The Code view's look follows Zehui's own mock
(`~/.cache/zehui-mods/codemap/map.html`, 2026-10-19).

## 0.4.0, 2026-10-20: Peers view, mascot pools per state

Written by Zehui Lin with Claude (Claude Code), MIT, from the Claude Code
plugin API's declarations (bundled `claude-code.d.ts`, Claude Code 2.1.300).

### Peers view

- `hooks/peers.ts` (new): the reading of `herdr agent list`, the HERDR-ORCH
  envelope rule, the request records, the result-file check, the row words
  and the view's layout (hub row, request groups, other peers), the poll
  (`$.process.run(['herdr', 'agent', 'list'])`, 5 s limit, only while the
  pane shows the view) and the `prompt.submit` note. `hooks/peerview.tsx`
  (new): the drawing.
- Ported from Zehui's own peers mod (`~/.claude/mods/peers`, ours, MIT,
  2026-10-19/20), not imported, since a mod never imports from another's
  folder: `parsePeers` (peers/hooks/kit.ts, here `parseAgents`, keeping this
  pane for the hub row), `parseEnvelopes`, `recordEnvelopes`, `roundOf`,
  `deadlineOf`, `resultStatus`, `isSafeReq`, `resultPath`, `boardRows`,
  `stateText`, `deadlineText`, `resultText`, `orchText` (peers/hooks/orch.ts,
  some renamed). Changed in the port: a request keeps every spoke pane it
  names (`panes`, so a fan-out groups), the spoke of a header that follows
  `herdr agent prompt <pane>` is that line's pane (the peers mod takes the
  text's first such pane), and a brief that makes this session a spoke
  records its sender as the hub (`peerHub`).
- The envelope and result-file formats are herdr-setup POLICY.md sections 2
  and 4 (Zehui's own, ZH-L1N/herdr-setup).
- `hooks/register.tsx`: `/agents-info peers`, the 30 s read from the existing
  1 s tick, the `prompt.submit` hook (gating, with `.catch`).
  `hooks/skin.tsx`, `hooks/code.tsx`: the `p: peers` key.
- Tests: `hooks/peers.test.tsx` (new); the test kit fakes `$.env` (nothing
  set by default), `herdr agent list` (`$.process.run`), the result files
  and open and closed panes, so no test runs herdr.
- Review fixes, 2026-10-20 with Claude: a brief or follow-up from another
  pane takes its target from its header line only, and the text-wide
  `herdr agent prompt` match skips the sender's pane (a brief whose body says
  `herdr agent prompt <hub> "done"` now records that pane as the hub, not as
  a request); a failed first `herdr agent list` read puts its reason in the
  head (`PeerBoard.error`) instead of `reading herdr…`; a result file is
  read only when its real path (`$.fs.stat` with `resolve`) is
  `<resolved herdr-orch folder>/<req>/result.md` (`orchRoot`), else it counts
  as present with no status. Three tests added (110 in all).

### Mascot pools

Every state draws from a pool, picked by the FNV-1a hash of the run id (the
main loop by the session's id, `$.session.id()`, else its first main turn's):
`DONE_POSE`, `ERROR_POSE`, `WAIT_POSE` and `HUB_POSE` became `donePose`,
`errorPose`, `waitPose` and `hubPose`. Pixel art from the "Claude Mascot
Pack" by getillustrations.com
(https://getillustrations.com/illustration-pack/claude-mascot-pack),
"Commercial and personal use license", pack downloaded 2026-10-19; the pack
is not redistributed, only the pixels of these poses, extracted from its 1x
PNGs with `~/.claude/mods/tools/pixgrid.py` (`grid(path, count=46)`) into
`hooks/mascots.ts`, each pose with its own palette (the 38 poses use 145
colours, more than one 62-letter palette holds). The ten poses of 0.3.0 come
out of the same extraction pixel for pixel.

- running (14): `repairing-with-tools`, `writing-software-code`,
  `building-colorful-blocks`, `debugging-system-bugs`, `reading-data-document`,
  `thinking-in-code`, `examining-green-globe`, `lab-science-testing`,
  `holding-ancient-scroll`, `visualizing-tree-data`, `managing-server-rack`,
  `processing-logic-symbols`, `planting-small-trees`, `user-profile-settings`
- waiting (4): `sleeping-soundly`, `thinking-pixel-bubble`, `in-constant-loop`,
  `it-depends-sign`
- finished (7): `with-success-checkmark`, `success-achievement-milestone`,
  `happy-pixel-celebrating`, `rocket-launch-success`, `api-success-pixel`,
  `in-glowing-aura`, `love-cloud-pixel`
- error (10): `confusion-spiral-pixel`, `dizzy-failed-state`,
  `error-state-pixel`, `failed-process-error`, `system-error-alert`,
  `marking-critical-error`, `crying-sad-reaction`, `angry-at-laptop`,
  `broken-heart-sad`, `disconnected-plug-pixel`
- main loop (3): `artboard-25cla`, `multi-window-workflow`,
  `developer-pair-programming-scene`

The pack is made by the site's designers, not by Anthropic. The shell and
codex mascots (ours) are unchanged. The extraction scripts used this round
(`extract.py`, `gen_pools.py`) are kept in `~/.cache/zehui-mods/pools/`;
`~/.claude/mods/tools/gen_mascots.py` still writes the 0.3.0 one-palette
format.
