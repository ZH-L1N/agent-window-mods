# Strip, forks and safety: implementation plan

> Executed by the /ship pipeline: Workflow agents implement each phase, the
> orchestrator owns git. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the four always-on band rows with one strip of pills, bring
four outside mods into this repo as audited forks, add two safety gates
(motion-hold, send-gate), and add a prompt queue, image thumbnails under sent
messages, a mascot behaviour ladder and a small file tree.

**Architecture:** Every piece is one Claude Code mod (a plugin with a hooks
module) in its own folder of this local marketplace. The strip is a new mod
that reads the other mods' `$.state` and orders the band through one
`AbovePromptList` hook; the existing band mods stay as data sources. The two
gates hold a tool call in a fail-closed `tool.call` hook and ask the person in
a pane or the engine's question dialog. Site-specific values live in local
config files outside the repo.

**Tech stack:** TypeScript and TSX hooks modules for Claude Code 2.1.325 or
later, the `claude-code/testing` kit, `claude plugin validate` and
`claude plugin test`, tsc with a scratch tsconfig. No Node, no network, no
packages.

**Spec:** `docs/superpowers/specs/2026-11-16-strip-forks-safety.md`

**Size call:** standard. Plan review ceiling: 5 rounds, by the reviewer pane
the owner named.

**Status: plan review approved 2026-11-16 02:31** (5 rounds, reviewer pane, 15 findings and 3 questions resolved; log in `plans/fixs/`)

**Status: implemented 2026-11-16 16:12.** Phases 0, 1, 3, 5, 6 and 7 landed on 2026-11-16 by 11:28; phases 2
(motion-hold) and 4 (send-gate) landed after a third fix round of the matcher that the owner
approved. See "Held back and deferred" and the phase ledger.

## Success criteria

One line per thing that was asked for. The final report gives evidence per
line.

1. skins is forked into this repo from upstream `hellosverre/claude-skins`
   v0.5.16, with the update check, the star toast and the dark-mode probe
   removed, the `terminal` skin as default, and it is on in every session.
2. redgreen (the test-failure pane) v0.1.0 and smart-compact (the compaction
   offer) v0.3.2 are forked into this repo; smart-compact's transcript backup
   is off by default.
3. The breathing band is forked from `claude-breathe` at `d8cc7b9`, on
   everywhere, with the random pool limited to pulse, wave and melody, a
   10 second delay, and the spinner word left alone.
4. One strip in "style B" replaces the PLAN, HANDOFF, CACHE and SYS rows:
   quiet pills, colour only when something needs attention, pills for
   context, cache, diff, tests, agents, queue, system and peers, and a health
   pill only when unhealthy. Context is always visible; cost and token totals
   move to a pane. The strip is a new mod that reads the existing mods'
   state; those mods keep their data and commands.
5. The seven borrowed ideas are all present: pills open panes (direct open,
   else the slash command with a "queued" toast); fit levels instead of
   dropped blocks; the context meter measured against the auto-compact window
   with steps at 30, 60 and 80 percent; a per-turn diff pane; animation on
   the drawing thread through a Client module; rows that appear only after a
   delay; and the mascot behaviour ladder.
6. From the outside marketplace's list, items 1, 2, 4, 5, 6, 8, 9, 11 and 12
   are covered: skin (fork), band (the strip), transparent pane backgrounds,
   image thumbnails under sent messages with labels, a cut-down file tree, a
   context pane, a prompt queue, the test-failure pane (fork) and the
   compaction offer (fork).
7. Safety batch: motion-hold holds every shell or SSH command that moves,
   energises or restarts lab hardware, one move per approval, with a STOP row
   and pill while it runs; reads, logs and status pass; a stop command always
   passes; the host list stays out of the repo. A session-health pill shows
   Remote Control disconnected, login expired or spend limit reached. An
   outbound-send gate previews a message, an email or an app environment
   change before it goes out, in bypass-mode sessions only.
8. The prompt queue is `/q` with plain subcommands and no model call; a turn
   that was interrupted or failed pauses it; it never sends while an agent is
   running.
9. Build order: the four forks, motion-hold, the strip, then the rest.
10. No company information anywhere in the repo, including the one old test
    fixture name that predates this rule.
11. The plan was reviewed by the reviewer pane with a ceiling of 5 rounds
    before any implementation.

## Global constraints

Every task's requirements include this section.

- **Public, personal repo.** No employer or company information of any kind:
  no company, product, project, person, host, machine or internal tool names,
  no work email, no domain-flavoured example text. This covers code, tests,
  fixtures, docs, plans, review findings, logs and commit messages. Examples
  use neutral names such as `rig-1.local`, `ctl move` and `#general`.
- **Outside code** enters only as one of the four forks in Phase 1, from the
  pinned source named there. Agents building our own mods (Phases 2 to 7)
  never open any other outside mod's source and fetch nothing from the
  network.
- **Engine floor:** Claude Code 2.1.325. No new behaviour may depend on
  `classic.SessionStart`, `prompt.compose`, `session.append`,
  `session.compact` or `skill.prompt`: an organization's policy plugin skips
  user-tier hooks on those events. Nothing works around that guard.
- **Terminal surface only.** Every `ui.render` hook returns `next(e)`
  untouched when `e.surface !== 'terminal'`, and for the band also when
  `e.props.hasSurvey`.
- **Failure handling.** Render hooks and observers end with
  `.catch(($, e, next) => next(e))`. A gate (a `tool.call` hook that can
  refuse) ends with
  `.catch(($, e, next) => next.called ? next(e) : { deny: '<mod> failed while checking this call and refused it. Do not retry it unless the user asks you to.' })`.
  A gate never lets a held action run on an error, a timeout, a dismissed
  dialog or an unreadable config.
- **Waiting inside a hook** uses `$.process.run(['sleep', '0.25'], { timeoutMs: 5000 })`
  or an awaited `$` call, never `$.clock.sleep`: a hook has 10 seconds of its
  own time and a clock sleep counts against it.
- **State.** Every `$.state` key is declared in the mod's `types/index.d.ts`,
  named in `plugin.json` as `"types"`. A value read from another mod is typed
  in `types/peer.d.ts` (only the fields read) and read with a literal ref
  const of the calling file:
  `(await $.state.get(REF).catch(() => null))?.value`. A missing owner reads
  `undefined` and must draw as "no data", never throw. `types/peer.d.ts`
  holds one `declare module 'claude-code'` block per owner, each under a
  line `// peer: <owner>`, so one owner's block can be lifted out on its
  own. A block is self-contained: it declares the fields it reads as
  inline object types and imports nothing. A type that appears
  in a state contract is declared in `types/index.d.ts`, and the modules
  import it from `'../types'`, as the existing mods do.
- **Buttons.** Every button action has a slash-command twin, and a toast that
  results from a press names the twin. Clicks need the fullscreen renderer,
  so nothing depends on a click.
- **Commands** are bare names with no namespace. The names used here are
  `/strip`, `/q`, `/motion`, `/send-gate`, `/tree`, `/compact-offer`, plus the
  forks' `/skin`, `/tests`, `/breathe`. No other new command name.
- **Text.** English only. A `Text` holds no control character other than tab
  and newline; text taken from a command or a tool input is cleaned before it
  is drawn (strip U+0000 to U+001F except tab and newline, and U+007F to
  U+009F). A symbol that can render as emoji carries U+FE0E.
- **No new `$.http`, no `$.model`.** `$.process.run` only where a task names
  the argv. `$.fs` writes only where a task names the path.
- **Tests** use `claude-code/testing` only (`test`, `describe`, `expect`,
  `mock`). There is no `test.each`; loop instead. A test answers every `$`
  call the mod makes with its own `on(...)`.
- **House look for our own rows:** a chip is bold `#0b0b0f` text on a
  background colour, the word padded so the chip is 11 cells wide. The strip
  and anything drawn in its style use the Catppuccin Mocha values in Task 9.
- **Versions.** A fork's version is `<upstream version>-zm.<n>`, `n` starting
  at 1 and rising with each local release. If `claude plugin validate` or the
  plugin cache refuses that form, use `<major>.<minor>.<patch * 100 + n>`
  instead and record it in the fork's `PROVENANCE.md`. Our own new mods start
  at `0.1.0`; a changed existing mod gets a patch or minor bump as its task
  says.

## Review focus

The failure modes the spec implies that are most likely to bite. Each has
tests in the task that owns the code.

1. **A motion command in a form the matcher misreads** (nested quotes, a
   heredoc inside `ssh`, command substitution, a wrapper such as another
   program typing the command into a pane). Expected: when parsing is not
   certain, every pattern is tried on the raw text and the command is held.
   Tests: Task 5.
2. **A hold with nobody present** (timeout, dismissed dialog, an auto-resolved
   dialog, an interrupted turn, a pane that cannot be placed). Expected: the
   action never runs and the model is told not to retry. Tests: Task 6.
3. **A source mod that is missing, broken or mid-reload.** Expected: the strip
   still draws, the pill is dim, the band is never blanked, and no row is
   hidden unless the strip drew its own. A HANDOFF row with something to act
   on is never hidden. Tests: Tasks 9 and 12.
4. **Narrow terminals, wide characters, many pills.** Expected: the strip
   never overflows `bodyColumns`; attention pills are never dropped. Tests:
   Task 9.
5. **`/clear`, resume and hot reload.** Expected: no stale context percent,
   no stuck STOP row, no second send from the queue, no mascot celebration
   on load. Tests: Tasks 7, 12, 14 and 16.

## How this plan ships

The plan is one unit for review and seven phases for delivery. Phases land in
this order, each as its own commits:

| Phase | Tasks | Commits |
| --- | --- | --- |
| 0 Housekeeping | 0, 0b | spec, plan, review log, fixture rename; band-row tests |
| 1 Forks | 1, 2, 3, 4 | one per fork |
| 2 Motion-hold | 5, 6, 7 | one |
| 3 Strip | 8, 9, 10, 11, 12 | token-weather, strip, here |
| 4 Send-gate | 13 | one |
| 5 Queue | 14 | one |
| 6 Comfort | 15, 16 | images, agents |
| 7 File tree | 17 | one |

Agents may build phases in parallel where their folders are disjoint; the
orchestrator commits strictly in the order above. Agents never touch
`README.md`, `ROADMAP.md`, `.claude-plugin/marketplace.json` or
`plans/TIMELINE.md`; the orchestrator edits those at each commit (Task 18).

**Gate for every commit**, run by the orchestrator from the repo root:

1. `claude plugin validate <mod>` passes for each mod the commit touches.
2. `claude plugin test <mod>` passes for each of them.
3. tsc passes with a scratch tsconfig outside the repo that includes the
   engine's types file, the mod's `hooks` (and `tests` for a fork) and its
   `types/index.d.ts`. For each other mod whose state it reads: that mod's
   real `types/index.d.ts` when the mod is in the repo at this commit;
   otherwise a scratch stub holding that owner's block lifted from the
   consumer's `types/peer.d.ts`, under a first line `export {}`.
   `types/peer.d.ts` itself is never included,
   so no key is declared twice. A producer that lands later, or whose phase
   was dropped, therefore never turns a consumer's gate red. In return,
   when a commit adds or changes a mod's `types/index.d.ts`, the gate also
   re-runs tsc for every mod in the repo whose `types/peer.d.ts` has a
   `// peer: <that mod>` block, now against the real contract, so a stub
   that drifted from its owner is caught the day the owner lands.
4. A scan of the staged diff for company terms, against a term list kept
   outside the repo, finds nothing.
5. A live check in a throwaway session started with `--plugin-dir` for the
   touched mods: the smoke steps the task lists, read back as text. What
   needs a person's eyes (colour, look) is reported as unverified.
6. The marketplace entry and the README row exist (Task 18).
7. For a new mod `claude plugin install <mod>@zehui-mods --scope user`, for a
   changed one `claude plugin update <mod>@zehui-mods`; the cache copy is
   checked with a grep.
8. One `plans/TIMELINE.md` line, then commit and push.

**Review and fix budget, per phase:** after implementation, a multi-lens
review of that phase's diff (correctness, security, test coverage,
simplification, plan conformance; for Phase 1 a fork-conformance lens that
diffs each fork against its upstream; for Phases 2 and 4 an extra lens that
hunts for commands or tool calls that slip past the gate). Each finding is
checked by a skeptic. At most three fix rounds per phase: two for review
findings, one for the gate.

**Failure rule.** A phase whose gate is still red after its budget, or that
keeps a confirmed high-impact correctness or security finding, is not
committed. Later phases that do not depend on it still ship; the report says
what was left out and why. Dependencies: Task 13 needs Task 6's kit. Every
other phase stands alone: at run time every cross-mod read tolerates a
missing owner, and at the type gate a missing owner's contract is replaced
by the consumer's own peer block (gate step 3).

**Test counts** in the tasks are baselines measured before the change. An
agent reports the count it gets; it never removes or merges a test to match
a number.

**Outside the repo.** Three things happen outside the repo and are reported:

- the plugin cache install or update in step 7 above, which is how a shipped
  mod becomes active in new sessions;
- two local config files, `~/.claude/motion-hold.json` and
  `~/.claude/send-gate.json`, written by the orchestrator from the machine's
  own session history, holding the site's hosts, command patterns and tool
  names; they never enter the repo;
- the local mods skill, corrected where this plan found it stale (band
  stacking, the types path, the fail-closed gate catch, Client elements).

**Shipping note, 2026-11-16, after the plan review.** For a fork, gate step 3 is read against the pinned
upstream: the fork must add no type error beyond those the untouched upstream has under the same compiler
options and engine types. Three upstreams have such errors against 2.1.325 (20 in the skin's test helper, 2
and 6 around a tool-name matcher for a tool this build does not have). They are listed in each fork's
`PROVENANCE.md` and left as upstream wrote them, in keeping with "upstream code is otherwise left as it is".

## Shared facts for implementers

- **Band rows in 2.1.325.** `AbovePrompt` is asked once per plugin; a hook
  draws its own plugin's row or passes with `next(e)`. `await next(e)` no
  longer returns other mods' rows, so `stackRow` cannot order them. New rows
  return their own keyed `Box` and nothing else. Order and hiding belong to
  one `AbovePromptList` hook, in the strip (Task 12). Its rule: pass on only
  rows from `e.props.rows`, each at most once and unchanged, through
  `next({ ...e, props: { ...e.props, rows } })`.
- **A row object** is `{ plugin: string, tree }`. `plugin` may be a bare name
  or `name@marketplace`; compare the part before `@`.
- **Panes.** `$.ui.open({ id, title, focus: true })`; `focus` takes only
  `true`. A pane opened by a press or a typed command is placed at any width;
  one opened from a timer or a hook needs 144 columns (110 once the person
  opened that id). `{ isPlaced: false }` is a normal answer. A plugin cannot
  open or close another plugin's pane: run the owner's command instead.
- **Running another mod's command:** `$.clock.after(20, () => $.command.run({ command, args }))`,
  never inside the hook. It runs once the session is idle. Look the name up
  in `$.command.list()` first; an absent command is a toast, not an error.
- **Asking the person:** `$.ui.ask(question, { options, header })` resolves to
  the chosen label, rejects when dismissed, and may auto-resolve while the
  person is away. Only an answer equal to the approve label approves.
- **Tool calls.** `tool.call` fires for the main loop, subagents and Workflow
  agents (`e.agentId` set for those), and once for a background Bash launch
  (`e.run_in_background === true`). Arguments are spread flat on `e`
  (`e.command` for Bash; an MCP tool's arguments by name). The result of
  `next(e)` has `deny`, `isError` or `result`. "Applied" means no `deny`, no
  `isError` and `result.staged !== true`.
- **Edit and Write results** carry `originalFile: string | null` and
  `structuredPatch: { oldStart, oldLines, newStart, newLines, lines }[]`.
  There is no MultiEdit tool.
- **Turns.** A main-loop event has no `agentId`. `turn.complete` has
  `reason: 'answer' | 'aborted' | 'refusal' | 'error'` and `isAborted`.
- **Permission mode** has no getter. `classic.UserPromptSubmit`,
  `classic.PostToolUse` and `classic.Stop` carry `e.permission_mode`; cache
  the latest main-thread value (`e.agent_id === undefined`).
- **Files.** `$.fs` takes absolute paths and does not expand `~`. The home
  folder is `await $.env.get('HOME')` (the name must be a string literal).
- **Client modules** draw `Box` and `Text` (no `Raster`, `Image` or
  `Progress`), run a frame clock with `surface.every(ms, fn)` started once
  while `surface.state` is undefined, and are mounted with
  `<Client key module="./file.tsx" props width height />`.
- **Tests** live beside the code as `hooks/*.test.ts(x)` for our mods and
  stay in `tests/` for the forks. `mock.clock(on, { now })` drives time;
  `$.ui.mount` draws a component; `$.ui.press({ plugin, key })` presses a
  button; an `on('tool.call', { tool: 'AskUserQuestion' }, ...)` hook in the
  test answers `$.ui.ask` (`{ result: { questions: [q], answers: { [q.question]: label } } }`,
  or `{ deny: 'dismissed' }`).

---

## Phase 0: housekeeping

### Task 0: neutral fixture name, spec in place

**Files:**
- Modify: `peers/hooks/board.test.tsx:117`
- Create: `docs/superpowers/specs/2026-11-16-strip-forks-safety.md` (the spec,
  moved in by the orchestrator once the plan review passes)

- [ ] **Step 1:** In `peers/hooks/board.test.tsx` line 117, change the hub
  name inside the `envelope(...)` call's `from` argument to `main-hub`
  (keeping the `@w1:p1` part). Grep the file for the old name to confirm no
  assertion repeats it.
- [ ] **Step 2:** Run `claude plugin test peers` before and after the edit.
  Expected: the same count both times, all passing.

No version bump: no runtime file changes.

### Task 0b: the band-row tests follow the engine

Measured before this plan changed anything: on engine 2.1.325 nine mods
each have one failing test, the one named "stack order" (in `sys`,
`token-weather`, `handoff`, `cache-clock`, `agents`, `goal-meter`, `here`,
`next` and `images`), and `images` has a second ("a band too short for the
tile draws it smaller, and captions only under 3 rows"). They assert that
`next(e)` hands a row hook the other mods' rows to sort, which this engine
no longer does (see "Band rows in 2.1.325" above). The rows draw correctly;
only the tests are out of date. Every later gate runs these suites, so they
are brought in line first. Order across mods is now the strip's job and is
tested there (Task 9, `order.test.ts`).

**Files:**
- Modify: the test file that holds the stack-order test in each of the nine
  mods (`hooks/row.test.tsx`, or `hooks/token-weather.test.ts`,
  `hooks/band.test.tsx` where the mod names it so), and
  `images/hooks/row.test.tsx` for its second test; each mod's
  `hooks/test-kit.ts` only if a helper used by nothing else is left behind.

No runtime file changes, so no version bump and no cache update.

- [ ] **Step 1: record the baseline.** Run `claude plugin test <mod>` for the
  nine mods and note each count and its failing test names. Expected: the
  ten failures named above and no others. Any other failure is reported
  and left alone.
- [ ] **Step 2: replace each stack-order test** with "row: the hook draws
  this plugin's own row": mounted as the band of its own plugin, with the
  engine's placeholder beneath, the drawn tree holds exactly one row keyed
  `zm-<order>-<name>` (the mod's existing key) and no row of another mod.
  Keep every other assertion of the old test that still describes the mod's
  own row.
- [ ] **Step 3: rewrite the second images test** for the per-plugin band:
  with `maxRows` 4 the tile is drawn smaller, and with `maxRows` 2 only
  the caption is drawn. The room is counted from `maxRows`, not from rows
  beneath.
- [ ] **Step 4: run** the nine suites. Expected: every suite passes, with
  the same number of tests as in Step 1. If the images row needs a code
  change to count its room from `maxRows` alone, make it in
  `images/hooks/row.tsx`, and say so: Task 15 then carries the version
  bump for it.

---

## Phase 1: the four forks

Each fork is a copy of a pinned upstream source with a short list of local
changes. The rules of "Global constraints" bind the lines a fork changes;
upstream code is otherwise left as it is, so later upstream releases diff
cleanly.

**Pinned sources.** Download with `curl -sSfL -o <file> <url>`, check the
sha256, extract into an empty scratch folder outside the repo, and copy only
the paths a task lists. If a hash differs, stop and report (GitHub may
re-pack an archive; then compare the extracted tree with the commit instead).

| Fork | URL | Commit | sha256 of the archive |
| --- | --- | --- | --- |
| skins | `https://codeload.github.com/hellosverre/claude-skins/tar.gz/refs/tags/v0.5.16` | `cf0d39f3785d5c5a4b6189ecc487b1ac479efea0` | `b816520aa1665aa1d607449ca2d98a76d78a530d3c899eb7dd7ce5aa3aa96211` |
| redgreen | `https://codeload.github.com/hellosverre/redgreen/tar.gz/refs/tags/v0.1.0` | `4aafc775744451c488e35f8c59067d475c0f0824` | `f2710cec03bd69db5fe08700aaa36e9a42e5c11e7b4e764ac7077d791ef5ef6a` |
| smart-compact | `https://codeload.github.com/hellosverre/smart-compact/tar.gz/refs/tags/v0.3.2` | `ccecf5f8c5449573c00122d6c5fc237fa83b23bf` | `95da63165029254ee3047b73adf5b5350e49da2fe684c9510e2b2032395f6b33` |
| breathe | `https://codeload.github.com/linxuan-sys/claude-breathe/tar.gz/d8cc7b98ee52a841c8874139d4ab5ff37005fcfc` | `d8cc7b98ee52a841c8874139d4ab5ff37005fcfc` | `dcf6c068ca4a3a79e6a964d4d13f625b045dc83614da872eaffb8a6d16cafff2` |

**Every fork gets:**

- the upstream `LICENSE`, unchanged;
- `.gitignore` with the single line `.claude-plugin/types/`;
- `tsconfig.json` with `{ "extends": "./.claude-plugin/types/tsconfig.json" }`;
- `README.md`, written fresh and short: what the mod does, its commands, the
  line `Fork of <upstream URL> at <tag or commit> (MIT). Local changes are in
  PROVENANCE.md.`, and the install line
  `claude plugin install <name>@zehui-mods --scope user`;
- `PROVENANCE.md`: source URL, tag, commit, archive sha256, licence and its
  holders, the import date, then the local changes numbered as in the task,
  a version note, and the update recipe: "download the new tag, diff it
  against this folder, read the diff, re-apply the numbered changes, run the
  tests, raise `n`";
- a comment `// Local change N (zehui-mods): <what>` at every changed site;
- a check that it does not order the band:
  `grep -rn AbovePromptList <fork>/hooks` prints nothing. (None of the four
  pinned sources hooks the list; three hook `AbovePrompt` for a row of
  their own, which the strip's order table places.)

Nothing else from upstream is copied: no nested `marketplace.json`, no CI,
no build scripts, no media, no upstream README.

### Task 1: skins fork

**Files:**
- Create: `skins/` from upstream: `hooks/**` except `hooks/updates.ts`,
  `tests/**`, `types/index.d.ts`, `skills/skin-designer/SKILL.md`, `LICENSE`,
  `.claude-plugin/plugin.json`
- Create: `skins/README.md`, `skins/PROVENANCE.md`, `skins/.gitignore`,
  `skins/tsconfig.json`
- Modify (in the copy): `hooks/register.tsx`, `hooks/light.ts`,
  `hooks/command.ts`, `hooks/rows.tsx`, `tests/logic.test.ts`,
  `tests/rows.test.tsx`, `.claude-plugin/plugin.json`,
  `skills/skin-designer/SKILL.md`

**Interfaces:**
- Produces: plugin `skins`, command `/skin`, panes `skins-settings` and
  `skins-gallery`, `$.skins.markdown`. Nothing in this plan consumes them.
- Line numbers below are upstream's, before any edit.

**Local changes:**

1. **No update check and no star notice.** Do not copy `hooks/updates.ts`. In
   `hooks/register.tsx` delete the imports from `./updates` (lines 33 and
   35), `checkForUpdate` with its comment (556-582), `askForStar` (584-594)
   and the call block in the `session.start` hook (678-687, including
   `logDebug`). After this the plugin makes no `$.http`, `$.fs` or
   `$.plugin.root` call.
2. **No system dark-mode probe.** In `hooks/register.tsx` delete
   `APPEARANCE_MS` and its comment (59-60), `PROBES` (138-146), `answering`
   and `systemDark` (157-177), and `appearance` with `followTheme` (202-216).
   `refreshTheme` computes `resolveLight({ override, theme, colorfgbg })`,
   keeps its write-if-changed, and returns nothing. The three former
   `followTheme` call sites (425, 676, 746) call `refreshTheme`. Change the
   import on line 7 to `import { forTheme, resolveLight } from './light'`.
   In `hooks/light.ts` delete line 1 and lines 93-111, drop `systemDark` from
   `ThemeHints`, and end `resolveLight` with `?? false`. Order after the
   change: `SKINS_THEME`, then the Claude Code theme, then `COLORFGBG`, then
   dark. After this the plugin makes no `$.process` call.
3. **Defaults.** `hooks/command.ts` line 5 `skin: 'terminal'`, line 12
   `band: false`.
4. **Compact button.** In `hooks/rows.tsx` delete `COMPACT_HOTKEY` (900) and
   the `hotkey` and `plain` props of the Compact button (944-957), so it
   draws framed and has no bare-digit hotkey. Reword its comment.
5. **Manifest.** `version` `0.5.16-zm.1`; description says "sixteen themes";
   add `"homepage"` and `"repository"` with the upstream URL; author kept.
6. **Bundled skill gated.** Append to the `description` of
   `skills/skin-designer/SKILL.md`: `Third-party skill (vendored): when a task
   matches, suggest it, but invoke only after the user explicitly asks for it
   or confirms.`

- [ ] **Step 1: copy the tree** as listed; add the four created files.
- [ ] **Step 2: adjust the tests first.** In `tests/logic.test.ts`: remove
  `isNewer, starStep, updateNotice` from the line 15 import and
  `gnomeDark, macDark, windowsDark` from line 16; delete the tests at
  1206-1215, 1217-1225 and 1227-1244; in the test at 497-506 delete the two
  lines that use `systemDark`. In `tests/rows.test.tsx`: delete the tests at
  1516-1551 and 1293-1315; reword the comment at 1512 and keep `unawaited`;
  rewrite the test at 1256-1275 as "an auto theme with nothing set is dark,
  and SKINS_THEME overrides it" (no `process.run` stub; with nothing set the
  desktop row is drawn with the dark palette, with `SKINS_THEME=light` with
  the light one); flip the assertion at 1068-1069 to expect the Compact
  button's `hotkey` to be `undefined`.
- [ ] **Step 3: pin the old defaults where upstream tests assume them.** For
  every test that asserts the noir palette on the terminal surface with the
  default skin, or mounts the usage band without switching it on (the
  research list: `rows.test.tsx` 429, 833, 1191, 2333 and the thirteen band
  tests from 1041 to 2220; `highlight.test.tsx` 216; `links.test.tsx` 130;
  `layout.test.tsx` 57), add `await runSkin($, 'noir')` or
  `await runSkin($, 'band on')` before the mount, using the file's existing
  helper. Change `logic.test.ts` 214 to expect `'terminal'`. Do not change
  any other expectation.
- [ ] **Step 4: add three tests** to `tests/rows.test.tsx`:
  - "a fresh store draws the terminal skin": after a session start with an
    empty store, a `ToolUse` row for `Bash` on the terminal surface carries
    the colour `ansi256(3)` (the pattern of the existing test near line 170).
  - "the usage band is off until /skin band on": the `AbovePrompt` site
    draws nothing of skins' before `/skin band on` and the meters after.
  - "a session start makes no network, file or process call": hooks on
    `http.fetch`, `fs.read` and `process.run` record their calls; after
    `session.start` and a settle, all three lists are empty.
- [ ] **Step 5: run** `claude plugin test skins`. Expected: FAIL, in the
  three new tests and the rewritten one.
- [ ] **Step 6: apply local changes 1 to 6.**
- [ ] **Step 7: run** `claude plugin test skins`. Expected: PASS. Upstream
  has 258 tests, all passing on this engine before any change; five are
  deleted and three added here. Report the exact count.
- [ ] **Step 8: verify.** `claude plugin validate skins` passes. tsc passes.
  `grep -rnE '\$\.(http|process|fs)\b|plugin\.root' skins/hooks` prints
  nothing. `grep -rn 'hellosverre' skins/hooks skins/skills skins/types`
  prints nothing. `diff -r <upstream>/hooks skins/hooks` shows only
  `updates.ts` missing and the four changed files.

**Live smoke:** a session with `--plugin-dir skins`: `/skin list` names
`terminal` as current; a prompt that reads a file, runs a command and answers
with a table shows skinned tool rows and a table card; no update toast
appears; `/skin off` returns to stock drawing and `/skin on` to the skin.

### Task 2: redgreen fork

**Files:**
- Create: `redgreen/` from upstream: `.claude-plugin/plugin.json`,
  `hooks/hooks.json`, `hooks/register.tsx`, `hooks/pane.tsx`,
  `hooks/parse.ts`, `hooks/format.ts`, `types/index.d.ts`, `tests/**`,
  `LICENSE`
- Create: `redgreen/README.md`, `redgreen/PROVENANCE.md`,
  `redgreen/.gitignore`, `redgreen/tsconfig.json`

**Interfaces:**
- Produces: plugin `redgreen`; command `/tests` (`/tests clear`); pane id
  `redgreen`; state `{ plugin: 'redgreen', key: 'runs' }` holding `Run[]`,
  newest last, where a `Run` has `passed: number`, `failed: number`,
  `skipped: number`, `at: number`. The strip reads `runs.at(-1)` (Task 9):
  green is `failed === 0`, the total is `passed + failed`.

**Local changes:** one. `version` `0.1.0-zm.1` in the manifest. No code
change.

- [ ] **Step 1: copy the tree** as listed; add the four created files.
- [ ] **Step 2: run** `claude plugin test redgreen`. Expected: PASS, 19
  tests (measured on the pinned source with this engine: the kit finds
  tests under `tests/`).
- [ ] **Step 3: verify.** validate and tsc pass.
  `grep -rnE '\$\.(http|process|model|store)\b' redgreen/hooks` prints
  nothing. `diff -r` against upstream shows only the manifest.

**Live smoke:** a session with `--plugin-dir redgreen` in a scratch project
with one failing test: after the test command runs, `/tests` answers with a
run count of 1 and the pane lists the failing test; after a fix and a rerun
the status line reads `tests ✓`.

### Task 3: smart-compact fork

**Files:**
- Create: `smart-compact/` from upstream: `.claude-plugin/plugin.json`,
  `hooks/hooks.json`, `hooks/register.tsx`, `hooks/signals.ts`,
  `hooks/backup.ts`, `types/index.d.ts`, `tests/smart-compact.test.ts`,
  `LICENSE`
- Create: `smart-compact/README.md`, `smart-compact/PROVENANCE.md`,
  `smart-compact/.gitignore`, `smart-compact/tsconfig.json`
- Modify (in the copy): `.claude-plugin/plugin.json`, `hooks/register.tsx`,
  `types/index.d.ts`, `tests/smart-compact.test.ts`

**Interfaces:**
- Produces: plugin `smart-compact`; pane id `smart-compact`; model tool
  `mcp__smart-compact__request_compact`; and, new in this fork, the command
  `/compact-offer`, which the strip's cache pill runs (Task 12).

**Local changes:**

1. **Backup off by default.** Manifest: the `backup` option's `default`
   becomes `false`. `hooks/register.tsx` line 126 becomes
   `const backup = options.backup === true`.
2. **Separator characters.** `hooks/register.tsx` line 76 holds two U+FFFD
   characters where separators belong; replace each with `·` (U+00B7).
3. **`/compact-offer`.** In the `session.start` hook register
   `{ name: 'compact-offer', description: 'Offer to compact now: shows what would be kept and a Compact button' }`
   inside try/catch. Add
   `on('command.run', { command: 'compact-offer' }, ...)`: it reads the
   context percent with the file's `percentNow`, calls
   `suggest($, { source: 'manual', percent, reason: 'You asked' })` at any
   percent, and returns `{ text: 'Compaction offer shown at <percent>% context.' }`.
   Widen `Suggestion['source']` in `types/index.d.ts` with `'manual'`; the
   lead text for it is `Compact now?`.
4. **Cache lifetime default.** Manifest: `cacheTtlMinutes` default `60`, to
   match the one-hour cache this repo's cache-clock assumes.
5. **Manifest.** `version` `0.3.2-zm.1`; `"homepage"` and `"repository"`
   kept.

- [ ] **Step 1: copy the tree**; add the four created files.
- [ ] **Step 2: tests first.** In `tests/smart-compact.test.ts` give the test
  at line 325 `{ options: { backup: true } }`. Add:
  - "backup is off by default": with no options, raising
    `$.classic.PreCompact(...)` records no `process.run` call.
  - "/compact-offer shows the offer at any fill": at 12 percent,
    `$.command.run({ command: 'compact-offer' })` answers text containing
    `12%`, and state `smart-compact.suggestion` has `source: 'manual'`.
  - "the offer separates its parts with a middle dot": the drawn offer's
    text contains `·` and not U+FFFD.
- [ ] **Step 3: run** `claude plugin test smart-compact`. Expected: FAIL in
  the three new tests.
- [ ] **Step 4: apply local changes 1 to 5.**
- [ ] **Step 5: run** the tests. Expected: PASS: upstream's 27 (measured
  on the pinned source) plus these three.
- [ ] **Step 6: verify.** validate and tsc pass.
  `grep -rn $'\xef\xbf\xbd' smart-compact/hooks` prints nothing.

**Live smoke:** a session with `--plugin-dir smart-compact`: `/compact-offer`
shows the offer with `Compact now` and `Not now`; `Not now` (or Esc) removes
it. Compaction itself is not run in the smoke.

### Task 4: breathe fork

**Files:**
- Create: `breathe/` from upstream: `.claude-plugin/plugin.json`,
  `hooks/hooks.json`, `hooks/register.tsx`, `hooks/breathe.tsx`,
  `hooks/breath/config.ts`, `hooks/breath/exercises.ts`,
  `hooks/breath/shapes.ts`, `tests/config.test.ts`,
  `tests/exercises.test.ts`, `tests/shapes.test.ts`, `LICENSE`
- Create: `breathe/README.md`, `breathe/PROVENANCE.md`, `breathe/.gitignore`,
  `breathe/tsconfig.json`
- Modify (in the copy): `hooks/breath/shapes.ts`, `hooks/breath/config.ts`,
  `hooks/register.tsx`, the three test files, `.claude-plugin/plugin.json`

**Interfaces:**
- Produces: plugin `breathe`; command `/breathe`; a band row while a turn
  runs. The strip orders that row first (Task 12).

**Local changes:**

1. **Random pool.** In `hooks/breath/shapes.ts` add
   `export const RANDOM_POOL: readonly Style[] = ['pulse', 'wave', 'melody']`
   and make `pickStyle` filter `RANDOM_POOL`, not `STYLES`. `STYLES` and
   `isStyle` stay, so all seventeen styles remain selectable by name.
2. **Defaults.** `hooks/breath/config.ts` line 16: `delay: 10`,
   `spinner: false`.
3. **Tests on the engine's kit.** In each test file import `describe`,
   `expect` and `test` from `claude-code/testing`; replace the one
   `test.each(STYLES)` in `tests/shapes.test.ts` with a `for` loop that
   declares one test per style; move the stray mid-file import in
   `tests/exercises.test.ts` to the top.
4. **Safe render hooks.** Add `.catch(($, e, next) => next(e))` to the two
   `ui.render` hooks in `hooks/register.tsx`.
5. **Manifest.** `version` `2.0.0-zm.1`; the description loses its sentence
   about early access.

- [ ] **Step 1: copy the tree**; add the four created files. `legacy/`,
  `docs/`, `.github/`, `.claude/` and the upstream `tsconfig.json` are not
  copied.
- [ ] **Step 2: tests first.** Apply local change 3. In
  `tests/shapes.test.ts` change the pool test to: over 200 random picks with
  `last` rotating, every pick is in `RANDOM_POOL`, a pick never equals
  `last`, and the set of picks has size 3. Add to `tests/config.test.ts`:
  "defaults: delay 10 seconds, spinner off" asserting
  `DEFAULTS.delay === 10` and `DEFAULTS.spinner === false`.
- [ ] **Step 3: run** `claude plugin test breathe`. Expected: FAIL in the
  pool test and the defaults test.
- [ ] **Step 4: apply local changes 1, 2, 4 and 5.**
- [ ] **Step 5: run** the tests. Expected: PASS: upstream's tests, with the
  seventeen-style loop as seventeen tests, plus the new defaults test.
  Report the count.
- [ ] **Step 6: verify.** validate and tsc pass.
  `grep -rn "bun:test" breathe` prints nothing.

**Live smoke:** a session with `--plugin-dir breathe`: `/breathe` answers
`style random · delay 10s · spinner off`; a reply that takes over 10 seconds
shows the band with one of pulse, wave or melody and it goes when the turn
ends; a short turn shows nothing.

---

## Phase 2: motion-hold

A new mod, `motion-hold/`. It holds any Bash call that would move, energise
or restart lab hardware until the person approves that one call, and shows a
STOP row while an approved call runs. It ships generic rules only; the
site's hosts and command patterns come from a local config file.

What it cannot see, stated in its README: motion code inside a script file
that is run by a name no pattern matches; a command put together from
parts at run time (two variables joined, an encoded string decoded on the
rig); and anything sent to a host the config does not list, beyond the
class A rules. `/motion recent` lists what passed on configured hosts so
gaps can be found and closed with a pattern. It is a guard against a
mistaken command, not a sandbox against a determined one.

### Task 5: the matcher (`motion-hold/hooks/match.ts`)

**Files:**
- Create: `motion-hold/hooks/match.ts`
- Test: `motion-hold/hooks/match.test.ts`

**Interfaces (produces):**

```ts
export type HoldKind =
  | 'site' | 'modbus-write' | 'motor-api' | 'gpio-set' | 'serial-write' | 'flash'
  | 'service' | 'power' | 'kill' | 'http-write' | 'unreadable' | 'config-error'
export type Reason = { kind: HoldKind; match: string; host: string | null }
export type Verdict =
  | { hold: false; why: 'no-match' | 'stop' | 'read-only' }
  | { hold: true; reasons: Reason[]; summary: string; host: string | null; isCertain: boolean }
export type HoldConfig = { hosts: string[]; hold: RegExp[]; stop: RegExp[]; stopCommand: string[] | null }
export type ConfigRead =
  | { status: 'none' }
  | { status: 'ok'; config: HoldConfig; warnings: string[] }
  | { status: 'broken'; error: string }
export function parseConfig(text: string | null): ConfigRead   // null = no file
export function classify(command: string, read: ConfigRead): Verdict
export function hostOf(text: string, hosts: readonly string[]): string | null
export function clean(text: string, max: number): string       // control characters out, cut to max
```

**Config file** (JSON; every key optional; an unknown key is a warning, a
wrong type or an invalid regular expression makes the read `broken`):

```json
{
  "hosts": ["rig-1.local", "10.0.0.*"],
  "hold": ["\\bctl\\s+(move|jog|home|drive)\\b", "\\bbench/[\\w-]+\\.sh\\b"],
  "stop": ["\\bctl\\s+stop\\b"],
  "stopCommand": ["ssh", "{host}", "ctl stop all"]
}
```

`hosts` are globs (`*` any run, `?` one character, case-insensitive) matched
against each word of a command after quotes and a leading `user@` are
stripped; a word that is a URL contributes its host name. `hold` and `stop`
are regular expressions, compiled case-insensitive.

**Before anything is matched** the command is normalised: zero-width and
soft-hyphen characters (U+200B to U+200F, U+2060, U+FEFF, U+00AD) are
removed, and a backslash followed by a newline is removed (a line
continuation). Every pattern is tried on a text as written and again with
its quote characters and backslashes removed, so `c'tl' move` matches like
`ctl move`.

**Built-in rules.** Class A applies anywhere, local or remote. Class B
applies only to a segment that names a configured host.

| Kind | Class | Patterns |
| --- | --- | --- |
| `modbus-write` | A | `\bwrite_(register\|registers\|coil\|coils)\s*\(` |
| `motor-api` | A | `\.requested_state\s*=`, `\.input_(pos\|vel\|torque)\s*=` |
| `gpio-set` | A | `\bgpioset\b`, `\bpinctrl\s+set\b`, `\braspi-gpio\s+set\b`, `\bGPIO\.output\s*\(`, `>\s*/sys/class/gpio/`, `\b(tee\|dd)\b[^\|;&]*/sys/class/gpio/` |
| `flash` | A | `\b(esptool(\.py)?\|openocd\|dfu-util\|st-flash\|avrdude)\b`, `\b(pio\|platformio)\s+run\b.*(-t\|--target)\s+upload\b` |
| `service` | B | `\bsystemctl\s+(restart\|stop\|start\|reload\|kill)\b`, `\bdocker\s+(restart\|stop\|kill\|rm)\b`, `\bdocker\s+compose\s+(up\|down\|restart\|stop)\b` |
| `power` | B | `\b(reboot\|shutdown\|poweroff\|halt)\b`, `\bsystemctl\s+(reboot\|poweroff\|halt)\b` |
| `kill` | B | `\b(kill\|pkill\|killall)\b` |
| `serial-write` | A | `>\s*/dev/(tty(USB\|ACM\|AMA\|S)\w*\|cu\.[\w.-]+)`, `\b(tee\|dd)\b[^\|;&]*/dev/(tty(USB\|ACM\|AMA\|S)\|cu\.)`; and code that holds both `\bserial\.Serial\s*\(` and `\.write\s*\(` |
| `http-write` | B | `\b(curl\|wget\|http\|https)\b` together with one of `-X\s*(POST\|PUT\|PATCH\|DELETE)`, `--request`, `-d\b`, `--data`, `--json`, `-F\b`, `--form`, `--post-data`, or the words `POST`, `PUT`, `PATCH`, `DELETE` after `http`/`https` |
| `unreadable` | B | not a pattern: see rule 3a |

**Rules of `classify`:**

1. **Segments and pipelines.** Split the command at top-level `;`, `&&`,
   `||`, `|`, `&` and newlines, respecting single quotes, double quotes,
   backslash escapes, heredocs (`<<WORD`, `<<-WORD`, quoted or not; the body
   runs to a line equal to `WORD` and belongs to the segment that opened it)
   and here-strings (`<<< text`, which belongs to its segment the same way).
   Segments joined by `|` form one pipeline, and each segment knows the
   stages after it. An unclosed quote or heredoc marks the parse uncertain.
2. **The executable.** From each segment strip leading `NAME=value` words and
   the prefixes `sudo`, `nohup`, `time`, `exec`, `command`, `env`, `nice`,
   `timeout`, `stdbuf`, `caffeinate`, `do`, `then`, `else`, `!`, `{` and
   `(`. A prefix's own flags go with it, and these flags take the next word
   as their value: `sudo` `-u -g -h -p -C -D -r -t -U`; `nice` `-n`;
   `timeout` `-s --signal -k --kill-after`, followed by its duration word;
   `stdbuf` `-i -o -e`; `caffeinate` `-t -w`. The basename of the next word
   is the executable. A
   segment that is only assignments has no executable and is matched like
   any other segment (rule 6).
3. **Remote shell.** Executable `ssh` or `mosh`: skip option words (a word
   starting with `-`; these take a value:
   `-o -i -p -l -F -J -E -L -R -D -b -c -m -S -W -w -B -e -I -O -Q`; a bare
   `--` is skipped); the next word is the target; the rest, with one level of quoting removed, is
   the remote text. The segment is then replaced by the classification of
   that remote text as a command of its own: its reasons, its exemptions,
   and the target's host (when `hostOf` matches it) as its host. The outer
   segment's own words are not matched, except under rule 7. The segment
   counts as read-only for rules 5 and 9 exactly when every segment of the
   remote text is exempt, and a stop exemption inside the remote text counts
   as a stop for rule 9. A heredoc body or here-string of the segment is
   remote text too: it is classified the same way, with the target's host,
   so every class applies to it. The one exception: when the remote text
   names an interpreter that is not a shell (`python3 -`, for example), the
   body is that interpreter's code (rule 4). A remote shell with no remote
   text and no body (a login, or a shell fed through a pipe) is never
   read-only. No target found: the parse is uncertain.
3a. **Input that cannot be read.** A reason of kind `unreadable`, with the
   target as host, is added when the target is a configured host and
   either (a) the remote side reads its program from standard input (no
   remote text, or remote text that is a bare shell or interpreter such as
   `bash`, `bash -s`, `sh`, `python3 -`) and that input is a file redirect
   (`< file`) or comes through a pipeline with a stage that is not a
   readable producer; or (b) the remote text is nothing but a variable or a
   command substitution (`"$CMD"`, `"$(cat cmd.txt)"`). A readable producer
   is `echo` or `printf`, or `cat` with a heredoc or here-string and no
   file argument: its text is classified by rule 5a. What a file, a
   decoder or a variable would feed to a shell on the rig cannot be read
   here, so it is held.
   The choice made here, stated once: rule 3a covers input that reaches the
   rig's shell in the same command. Copying a file to the rig and running
   it there by name (`scp run.sh rig-1.local:/tmp/` and then
   `ssh rig-1.local 'bash /tmp/run.sh'`) is not held by this rule, in one
   command or two: it is the ordinary way of working on a rig, a rule that
   tracked it would hold every such run, and a site that wants a script
   held names it in `hold`. The README lists this limit, case 70 pins it,
   and the deny text for an `unreadable` hold closes the workaround in
   words (Task 7).
4. **Shells and interpreters.** A segment that invokes a shell (a word
   whose basename matches `^(bash|sh|zsh|fish)$`) with `-c <string>`, a
   heredoc body or a here-string: that text is a command, classified as a
   command of its own with the segment's host. A segment that invokes
   another interpreter (`^(python[\d.]*|node|ruby|perl)$`) with
   `-c <string>`, `-e <string>`, a heredoc body or a here-string: that text
   is code. Code is tried as raw text, with no exemption inside it, against
   site `hold` and class A. Class B is tried only on the contents of the
   code's string literals (single, double, triple or backtick quoted),
   which is where a shell command handed to the system would be, and only
   when a host is known for the code: the segment's host (rule 6), else
   `hostOf` of the code itself. A method or variable that merely shares a
   class B word (`sock.shutdown()`, `proc.kill()`) is not a reason.
5. **Read-only.** A segment is exempt, giving no reasons, only when all of
   these hold: its executable is in the read-only set; it has no command
   substitution (`$(`, a backtick, `<(`); it has no output redirect other
   than to `/dev/null`, `&1` or `&2`; and every later stage of its pipeline
   is itself read-only by this rule. The set: `cd pwd ls cat head tail less
   more wc grep egrep fgrep rg ag cut sort uniq tr echo printf file stat
   diff cmp whoami uname which type test [ true false sleep ps pgrep
   journalctl dmesg df du free uptime lsusb lsblk ping gpioinfo gpioget`,
   and `git` with one of the subcommands `log show diff status grep blame
   rev-parse ls-files`. Commands that can run or write something through
   their own arguments are deliberately not in the set and are matched like
   any other segment: `awk`, `sed`, `find`, `xargs`, `tee`, `ip`, `date`,
   `hostname`.
   An exempt segment waives every class, site patterns included, on
   purpose: a command in this set that feeds nothing and redirects nowhere
   cannot act on hardware whatever its arguments say, and holding every
   search for a motion word would teach the person to approve holds without
   reading them.
5a. **Text fed to something that can run it.** A segment whose executable
   is in the read-only set, but which is not exempt because a later stage
   of its pipeline is not read-only (a remote shell, a shell, an
   interpreter, `xargs`, anything else), is treated as code: its text,
   heredoc body and here-string are tried against site `hold` and class A
   as raw text, and against class B when the segment has a host (rule 6).
6. **Other segments.** The text is the segment plus its heredoc body and
   here-string. If a `stop` pattern matches it, no site `hold` or class A
   pattern does, and it has no command substitution, the segment is exempt
   (a stop also waives class B). Otherwise collect a
   reason for every site `hold` pattern (kind `site`) and class A pattern
   that matches, and, when the segment's host is not null, every class B
   pattern.
   **A segment's host**, for this rule, rule 4 and rule 5a alike: the rule 3
   target when the segment sits inside remote text; else `hostOf` of its
   own text; else the host of the first later stage of its pipeline that
   has one. So text that any segment feeds toward a configured host is
   tried against class B, whatever produced it.
7. **Fail closed.** When the parse is uncertain at any level, also try site
   `hold`, class A, and (when `hostOf` finds a host in the raw command)
   class B on the whole raw command with no exemption. Any match holds, with
   `isCertain: false`.
8. **Broken config.** With `status: 'broken'`, hold when the raw command
   contains `\b(ssh|mosh)\b` or any class A match, kind `config-error`.
   With `status: 'none'` only class A applies (no hosts are known).
9. **Verdict.** Any reason holds. `host` is the first reason's host.
   `summary` joins one phrase per kind, in this order: "run a site motion
   command", "write Modbus registers", "command a motor", "set a GPIO
   line", "write to a serial device", "flash a device", "start or stop a
   service", "reboot or power off", "kill a process", "send a write
   request", "run input that cannot be read", "use hardware while the site
   config is broken";
   plus " on <host>" when there is one. With no reason: `why` is `'stop'` if
   a stop pattern exempted a segment, else `'read-only'` if every segment
   was exempt, else `'no-match'`.

`classify` never throws: any internal error is treated as an uncertain parse
(rule 7), and when even that fails the verdict is a hold with kind
`config-error`.

- [ ] **Step 1: write the failing tests** in `match.test.ts`. The config in
  every case is the example above unless the row says otherwise.

| # | Command | Expect |
| --- | --- | --- |
| 1 | `ssh rig-1.local 'ctl status'` | pass, `no-match` |
| 2 | `ssh rig-1.local 'ctl move x 10'` | hold, `site`, host `rig-1.local`, certain |
| 3 | `ssh op@10.0.0.7 "cd proj && ./bench/slew-run.sh"` | hold, `site`, host `10.0.0.7` |
| 4 | `ssh rig-1.local 'ctl stop x'` | pass, `stop` |
| 5 | `ssh rig-1.local 'ctl stop x && ctl move x 5'` | hold, `site` |
| 6 | `grep -n "write_register(" src/bus.py` | pass, `read-only` |
| 7 | `ssh rig-1.local 'grep -c shutdown /var/log/app.log'` | pass, and `why` is exactly `read-only` (the class B word in a remote grep's argument is not matched) |
| 8 | `python3 - <<'PY'` / `c.write_register(64, 1)` / `PY` | hold, `modbus-write`, host null |
| 9 | `ssh rig-1.local 'cd app && .venv/bin/python - <<PY` / `c.write_registers(0, [1, 2])` / `PY'` | hold, `modbus-write`, host `rig-1.local` |
| 10 | `ssh rig-1.local 'sudo systemctl restart app'` | hold, `service` |
| 11 | `ssh other.example 'sudo systemctl restart app'` | pass, `no-match` |
| 12 | `ssh rig-1.local 'sudo reboot'` | hold, `power` |
| 13 | `ssh rig-1.local 'pkill -f bench'` | hold, `kill` |
| 14 | `pkill -f vite` | pass, `no-match` |
| 15 | `ssh rig-1.local 'gpioset gpiochip0 17=1'` then `... 'gpioget gpiochip0 17'` | hold `gpio-set`; pass `read-only` |
| 16 | `echo 1 > /sys/class/gpio/gpio17/value` | hold, `gpio-set` |
| 17 | `esptool.py --port /dev/ttyUSB0 write_flash 0x0 fw.bin` | hold, `flash` |
| 18 | `tmux send-keys -t 1 "ssh rig-1.local ctl move x 5" Enter` | hold, `site`, host `rig-1.local` |
| 19 | `ssh rig-1.local 'ctl move x 5` (unclosed quote) | hold, `isCertain: false` |
| 20 | `ssh rig-1.local 'cat > /tmp/p.py <<EOF` / `c.write_register(1, 2)` / `EOF'` | hold, `modbus-write` |
| 21 | `scp fw.bin rig-1.local:/tmp/` | pass, `no-match` |
| 22 | broken config, `ssh anywhere 'ls'`; broken config, `ls -la` | hold `config-error`; pass |
| 23 | no config, `ssh rig-1.local 'sudo reboot'`; no config, case 8 | pass; hold `modbus-write` |
| 24 | `python3 -c "odrv0.axis0.requested_state = 8"` | hold, `motor-api` |
| 25 | 20,000 characters of `echo ok; ` then `ssh rig-1.local 'ctl home'` | hold, `site` |
| 26 | `ssh -o BatchMode=yes -o ConnectTimeout=8 -p 2222 op@rig-1.local 'ctl jog y -3'` | hold, `site`, host `rig-1.local` |
| 27 | `for i in 1 2 3; do ssh rig-1.local "ctl move x $i"; done` | hold, `site` |
| 28 | `ssh rig-1.local 'sed -i s/a/b/ cfg && ctl status'` | pass, `no-match` (not exempt, nothing matches) |
| 29 | `ssh rig-1.local 'R=$(ls -d ~/runs/*); grep -c done $R/log'` | pass, `no-match` |
| 30 | a command holding U+0000 and U+009B | no throw; a verdict comes back |
| 31 | `cat <<EOF \| ssh rig-1.local bash` / `ctl move x 5` / `EOF` | hold, `site`, host `rig-1.local` |
| 32 | `printf 'ctl move x 5\n' \| ssh rig-1.local` | hold, `site`, host `rig-1.local` |
| 33 | `echo 'c.write_register(1, 2)' \| python3` | hold, `modbus-write` |
| 34 | `echo 'sudo reboot' \| ssh rig-1.local` | hold, `power` |
| 35 | `awk 'BEGIN{system("ctl move x 5")}'` | hold, `site` |
| 36 | `bash <<< 'ctl move x 5'` | hold, `site` |
| 37 | `echo 'ctl move x 5' \| xargs -I{} ssh rig-1.local {}` | hold, `site` |
| 38 | `ssh rig-1.local 'journalctl -u app' \| grep -c shutdown` | pass, `read-only` |
| 39 | `echo 1 \| sudo tee /sys/class/gpio/gpio17/value` | hold, `gpio-set` |
| 40 | `find . -name '*.py' -execdir ctl move {} \;` | hold, `site` |
| 41 | `ssh rig-1.local` (a login, no remote text) | pass, `no-match` |
| 42 | `ssh rig-1.local <<< 'sudo reboot'` | hold, `power`, host `rig-1.local` |
| 43 | `ssh rig-1.local <<'EOF'` / `sudo systemctl restart app` / `EOF` | hold, `service`, host `rig-1.local` |
| 44 | `ssh rig-1.local bash -s <<'EOF'` / `pkill -f bench` / `EOF` | hold, `kill` |
| 45 | `ssh rig-1.local <<< 'grep -c shutdown log'` | pass, `read-only` |
| 46 | `awk 'BEGIN{print "sudo reboot"}' \| ssh rig-1.local` | hold, `power`, host `rig-1.local` |
| 47 | `python3 -c 'print("sudo reboot")' \| ssh rig-1.local` | hold, `power`, host `rig-1.local` |
| 48 | `ssh rig-1.local 'echo reboot \| sudo sh'` | hold, `power`, host `rig-1.local` |
| 49 | `bash -c "ssh rig-1.local 'sudo reboot'"` | hold, `power`, host `rig-1.local` |
| 50 | `ssh rig-1.local 'python3 -' <<'PY'` / `import os; os.system("reboot")` / `PY` | hold, `power`, host `rig-1.local` |
| 51 | `ssh rig-1.local 'python3 -' <<'PY'` / `s.shutdown(socket.SHUT_RDWR)` / `PY` | pass, `no-match` |
| 52 | `timeout 10 ssh rig-1.local 'grep -c shutdown log'` | pass, `read-only` |
| 53 | `timeout 10 ssh rig-1.local 'ctl move x 1'` | hold, `site`, host `rig-1.local` |
| 54 | `ssh rig-1.local -- ctl move x 1` | hold, `site` |
| 55 | `ssh rig-1.local "c'tl' mo\"ve\" x 1"` | hold, `site` |
| 56 | `ssh rig-1.local 'ctl \` / `move x 1'` (a line continuation) | hold, `site` |
| 57 | `ssh rig-1.local 'ct` U+200B `l move x 1'` | hold, `site` |
| 58 | `ssh rig-1.local 'ctl stop "$(sudo reboot)"'` | hold, `power` |
| 59 | `ssh rig-1.local bash < run.sh` | hold, `unreadable`, host `rig-1.local` |
| 60 | `cat run.sh \| ssh rig-1.local bash` | hold, `unreadable` |
| 61 | `echo aGk= \| base64 -d \| ssh rig-1.local` | hold, `unreadable` |
| 62 | `ssh rig-1.local "$CMD"` | hold, `unreadable` |
| 63 | `ssh other.example bash < run.sh` | pass, `no-match` |
| 64 | `echo 'ctl status' \| ssh rig-1.local` | pass, `no-match` |
| 65 | `echo G1 X10 > /dev/ttyUSB0` | hold, `serial-write` |
| 66 | `python3 - <<'PY'` / `p = serial.Serial("/dev/ttyUSB0")` / `p.write(b"M3")` / `PY` | hold, `serial-write` |
| 67 | `curl -X POST http://rig-1.local:8080/api/move -d '{"x":1}'` | hold, `http-write`, host `rig-1.local` |
| 68 | `curl -s http://rig-1.local:8080/api/status` | pass, `no-match` |
| 69 | `curl -X POST https://api.example.com/v1/things -d '{}'` | pass, `no-match` |
| 70 | `scp run.sh rig-1.local:/tmp/ && ssh rig-1.local 'bash /tmp/run.sh'` | pass, `no-match` (a stated limit: a script run by a name no pattern matches) |
| 71 | `timeout -s KILL 10 ssh rig-1.local 'grep -c done log'` | pass, `read-only` |
| 72 | `caffeinate -t 600 ssh rig-1.local 'ctl move x 1'` | hold, `site`, host `rig-1.local` |
| 73 | `sudo -u op nice -n 10 ssh rig-1.local 'ctl status'` | pass, `no-match` |

  Also: `parseConfig(null)` is `none`; `parseConfig('{')` is `broken`;
  `parseConfig('{"hold":["("]}')` is `broken` naming the pattern;
  `parseConfig('{"extra":1}')` is `ok` with one warning;
  `hostOf('ssh op@RIG-1.local ls', ['rig-1.local'])` is `'RIG-1.local'`;
  `clean('a\u0000b\u009bc', 10)` is `'abc'`.
- [ ] **Step 2: run** `claude plugin test motion-hold`. Expected: FAIL,
  `classify` is not defined.
- [ ] **Step 3: implement `match.ts`** to the rules above. One scanner
  function produces segments with their heredoc bodies and the uncertain
  flag; `classify` is a pure function of its two arguments.
- [ ] **Step 4: run** the tests. Expected: PASS.

#### Task 5, corrected and extended 2026-11-16 after the phase 2 review

The review ran the matcher against real shell behaviour (stub programs in
a scratch folder, nothing on any host) and found sixteen groups of
commands that the rules above let pass, plus four reads they held. The
rules below are what the matcher now does; where one differs from a rule
above, this one stands. Cases 74 to 165 pin them (` / ` is a line break;
the config is the example unless a case says otherwise).

- Normalisation: only the zero-width and soft-hyphen characters are removed before matching; a backslash-newline is joined by the scanner where the shell joins it (between and inside words, in double quotes, in a heredoc body under an unquoted delimiter; not after a comment, not before a carriage return, not under a quoted delimiter), and every pattern is tried on a text as written, with its continuations joined, and with quotes and backslashes removed.
- Built-in table: a redirect is `>`, `>>`, `>|` or `>&`; `tee|dd ... <path>` and `pio run ... upload` are checks with no limit on the gap (the tee/dd gap may span lines and ends at `|`, `;`, `&`; the pio gap stays on one line); serial paths include `/dev/tty.*`; `.input_(pos|vel|torque)` also holds with `+=`, `-=`, `*=`, `/=`; the upload target may be `--target=upload`; `-T` is a write flag only where the text has `curl`; `kill|pkill|killall` followed at once by `-0`, `-s 0`, `-n 0` or `--signal 0` is not a reason, and a text with both forms still holds.
- Rule 1: the scanner keeps whether a heredoc delimiter was quoted (an unquoted body is expanded: its variables replaced, its `$( )` and backtick texts taken as substitutions of the segment), keeps the inner text of every substitution (`$( )`, backticks, `<( )`, `>( )`, zsh `=( )`), ends a comment at its newline, and notes a top-level `)`.
- Rule 2: after a top-level `)` with words after it in the same segment (`pattern) command`, `name() { command`) the command is judged by its own executable and the text before the `)` is tried as raw text with no exemption; `function` is a prefix that takes the name after it; these prefix flags take a value: `exec -a`, `time -o -f --output --format`, `env -u -C --unset --chdir`.
- Rule 2a (new): a segment that is only `NAME=value` words (after `export` too) carries each literal value forward within its text, replacing `$NAME` and `${NAME}` before the executable, the remote target, redirect targets, bodies and the segment's host are read, when the name is assigned nowhere else in the text, the value holds no variable and is at most 2,000 characters; the text is then read twice (values in place, and as written), every reason of either reading holds and a segment is exempt only when both exempt it, except that a remote-shell target whose carried value names a configured host is certain.
- Rule 3: ssh (not mosh) goes on skipping option words after the target, `-P` takes a value, `-o RemoteCommand` is remote text, `-o ProxyCommand` and `-o LocalCommand` are local commands, `-o HostName` names the host where the target names none; a body is an interpreter's code only when a bare interpreter is what reads standard input, and where an interpreter is named but a bare shell reads the body (or the interpreter has its own script or `-c`) the body is tried both as a command and as code; a target that is a variable with no carried value keeps the parse uncertain, and so does a carried value that names no configured host.
- Rule 3a: also unreadable are a heredoc body or here-string that is nothing but variables or substitutions fed to a remote side that reads its program from standard input (through a jump host too), an executable in remote text that is nothing but a variable, and input fed to a remote shell whose target is an unresolved variable when the raw command names a configured host; not readable producers are a `printf` or `echo` whose arguments (after the format, after the flags) are only variables, a `cat` whose body is only variables, any producer with a substitution, the last command of a parenthesised group and a command after a case pattern or function name; `/dev/stdin`, `/dev/fd/0` and `-` as a shell's or interpreter's operand are standard input.
- Rule 4: a shell's flags before the command are read as the shell reads them (each `o`/`O` of a cluster takes the next word, a `c` in a cluster starts the command string, an `s` means standard input); for an interpreter `-` ends the options whatever follows and `-W -X` (python), `-r --require` (node), `-r -I` (ruby, perl) take a value; the string of `eval` and the action of `trap` are classified as commands of their own, beside rule 6 on the segment.
- Rule 5: the exemption also ends on an assignment in front of the command other than a locale or terminal setting, on `git -c`/`--config-env`/`--exec-path`/`--ext-diff`/`--textconv`/`-O`/`--open-files-in-pager`, and on a file the command writes through its own arguments (`sort -o`, the second file of `uniq`, `--output`), which is tried against class A like a redirect; a substitution in a heredoc body the shell expands counts as a substitution of the segment, and so does `=( )`.
- Rule 5a: where the next stage is a shell reading its standard input, a readable producer's text is also classified as a command of its own.
- Rule 6 (addition): the inner text of every substitution of a segment is classified as a command of its own, beside the segment's verdict and never in place of it, and any reason found ends the segment's exemption.
- Rule 7: a command too long (over 400,000 characters) or nested too deep (over eight texts) to take apart is decided by the raw text, and when it names a configured host it is held as `unreadable`.

Three choices made in this round, stated once:

- **A read inside a case arm or a function body passes** (case 105). The
  command after `pattern)` or `name() {` is judged by its own executable,
  where the first version took the pattern word or the name for it.
- **A carried variable never takes a hold away**, with one exception: a
  remote-shell target whose carried value names a configured host is
  certain, so a read through it passes (case 141). `CMD='grep -c done
  log'; ssh rig-1.local "$CMD"` is still held as unreadable, although its
  text is in plain sight.
- **Two residues stay open.** Options after the ssh host are consumed the
  way ssh consumes them, so a value flag written without its value
  swallows the next word (`ssh rig-1.local -c ctl move x` passes: ssh
  would take `ctl` for the cipher). And `OPTS="-o BatchMode=yes"; ssh
  $OPTS rig-1.local '<a read>'` is still held, as uncertain.

Signal 0 (`kill -0`, `kill -s 0`, `pkill -0`, `killall -0`) is not a kill:
it sends nothing and only asks whether a process exists. This exemption
was added by the orchestrator, not by the review: waiting for a run on a
rig with `while kill -0 $PID; do sleep 5; done` is an everyday read.

```text
74. ssh rig-1.local <<< "$CMD" -> hold, unreadable, host rig-1.local
75. ssh rig-1.local bash <<< "$(cat run.sh)" -> hold, unreadable, host rig-1.local
76. ssh rig-1.local python3 <<< "$CODE" -> hold, unreadable, host rig-1.local
77. ssh rig-1.local <<EOF / $(cat run.sh) / EOF -> hold, unreadable, host rig-1.local
78. ssh rig-1.local bash -s <<EOF / $CMD / EOF -> hold, unreadable, host rig-1.local
79. ssh rig-1.local 'bash -s' <<< "$(cat run.sh)" -> hold, unreadable, host rig-1.local
80. ssh rig-1.local bash -c "$CMD" -> hold, unreadable, host rig-1.local
81. ssh rig-1.local sudo "$CMD" -> hold, unreadable, host rig-1.local
82. ssh rig-1.local "cd app && $CMD" -> hold, unreadable, host rig-1.local
83. ssh rig-1.local "$CMD 2>&1" -> hold, unreadable, host rig-1.local
84. printf '%s\n' "$CMD" | ssh rig-1.local -> hold, unreadable, host rig-1.local
85. echo -n "$CMD" | ssh rig-1.local bash -> hold, unreadable, host rig-1.local
86. cat <<< "$CMD" | ssh rig-1.local -> hold, unreadable, host rig-1.local
87. ssh jump.example ssh rig-1.local <<< "$CMD" -> hold, unreadable, host rig-1.local
88. ssh rig-1.local 'python3 /dev/stdin' < s.py -> hold, unreadable, host rig-1.local
89. ssh rig-1.local 'sh /dev/stdin' < s.sh -> hold, unreadable, host rig-1.local
90. ssh rig-1.local 'GIT_PAGER="sudo reboot" git log' -> hold, power, host rig-1.local
91. GIT_EXTERNAL_DIFF='ssh rig-1.local sudo reboot' git diff -> hold, power, host rig-1.local
92. git -c core.pager='ctl move x 1' log -> hold, site
93. git -c diff.external='ssh rig-1.local sudo reboot' diff -> hold, power, host rig-1.local
94. LESSOPEN='|ctl move x 1 %s' less f -> hold, site
95. ssh rig-1.local 'sort -o /sys/class/gpio/gpio17/value one.txt' -> hold, gpio-set, host rig-1.local
96. uniq g.gcode /dev/ttyUSB0 -> hold, serial-write
97. git log --output=/dev/ttyUSB0 -> hold, serial-write
98. case "$MODE" in /   test) ssh rig-1.local 'ctl move x 1' ;; / esac -> hold, site, host rig-1.local
99. case "$MODE" in true) ssh rig-1.local 'sudo reboot' ;; esac -> hold, power, host rig-1.local
100. test() { ssh rig-1.local 'ctl move x 1'; }; test -> hold, site, host rig-1.local
101. r() { ssh rig-1.local "$@"; }; r sudo reboot -> hold, unreadable, host rig-1.local
102. function r { ssh rig-1.local "$@"; }; r sudo reboot -> hold, unreadable, host rig-1.local
103. (echo 'sudo reboot'; echo exit) | ssh rig-1.local -> hold, unreadable, host rig-1.local
104. ssh rig-1.local 'sudo reboot' *(N) ls -> hold, power, host rig-1.local
105. case "$MODE" in /   status) ssh rig-1.local 'grep -c shutdown log' ;; / esac -> pass, no-match
106. cat <<EOF / Moved: $(ssh rig-1.local 'ctl move x 10') / EOF -> hold, site, host rig-1.local
107. grep -c ok <<EOF / `ssh rig-1.local 'ctl home'` / EOF -> hold, site, host rig-1.local
108. no config: cat <<EOF / $(echo 1 > /sys/class/gpio/gpio17/value) / EOF -> hold, gpio-set
109. ssh rig-1.local 'cat <<EOF / $(sudo reboot) / EOF' -> hold, power, host rig-1.local
110. cat <<EOF | ssh rig-1.local bash / $(cat run.sh) / EOF -> hold, unreadable, host rig-1.local
111. ls =(ssh rig-1.local 'sudo reboot') -> hold, power, host rig-1.local
112. cat <<'EOF' / Moved: $(ssh rig-1.local 'ctl move x 10') / EOF -> pass, read-only
113. ssh rig-1.local 'bash -euo pipefail' < run.sh -> hold, unreadable, host rig-1.local
114. cat run.sh | ssh rig-1.local 'bash -euo pipefail' -> hold, unreadable, host rig-1.local
115. ssh rig-1.local 'python3 - x 10' < move.py -> hold, unreadable, host rig-1.local
116. ssh rig-1.local 'bash -es -- prod' < run.sh -> hold, unreadable, host rig-1.local
117. bash -euo pipefail -c 'ssh rig-1.local bash < run.sh' -> hold, unreadable, host rig-1.local
118. bash -euo pipefail -c "ssh rig-1.local 'grep -c shutdown log'" -> pass, read-only
119. ssh -o RemoteCommand='ctl move x 1' rig-1.local -> hold, site, host rig-1.local
120. ssh -oRemoteCommand='sudo reboot' rig-1.local -> hold, power, host rig-1.local
121. ssh -o ProxyCommand='ssh rig-1.local sudo reboot' other.example ls -> hold, power, host rig-1.local
122. ssh -o HostName=rig-1.local x 'sudo reboot' -> hold, power, host rig-1.local
123. ssh rig-1.local -T < run.sh -> hold, unreadable, host rig-1.local
124. ssh rig-1.local -tt bash < run.sh -> hold, unreadable, host rig-1.local
125. ssh rig-1.local -t "$CMD" -> hold, unreadable, host rig-1.local
126. ssh rig-1.local -t 'grep -c shutdown log' -> pass, read-only
127. ssh -P tag rig-1.local 'cd app; sudo reboot' -> hold, power, host rig-1.local
128. exec -a ls ssh rig-1.local 'sudo reboot' -> hold, power, host rig-1.local
129. /usr/bin/time -o file ssh rig-1.local 'sudo reboot' -> hold, power, host rig-1.local
130. env -u NAME ssh rig-1.local bash < run.sh -> hold, unreadable, host rig-1.local
131. echo 1 >| /sys/class/gpio/gpio17/value -> hold, gpio-set
132. ssh rig-1.local 'ctl status' >| /dev/ttyUSB0 -> hold, serial-write
133. echo 1 | sudo tee -a /tmp/<420 characters> /sys/class/gpio/gpio17/value -> hold, gpio-set
134. pio run --project-dir /tmp/<420 characters> -t upload -> hold, flash
135. no config: python3 - <<'PY' / import subprocess / subprocess.run(['sudo', 'tee', /   '/sys/class/gpio/gpio17/value'], input=b'1') / PY -> hold, gpio-set
136. python3 - <<'PY' / import subprocess / subprocess.run([ /     "dd", /     "if=frame.bin", /     "of=/dev/ttyUSB0", / ]) / PY -> hold, serial-write
137. BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d '{"x":10}' -> hold, http-write, host rig-1.local
138. H=rig-1.local; ssh $H 'bash -s' < run.sh -> hold, unreadable, host rig-1.local
139. H=rig-1.local; ssh "$H" "$CMD" -> hold, unreadable, host rig-1.local
140. SSH="ssh rig-1.local"; $SSH 'sudo reboot' -> hold, power, host rig-1.local
141. H=rig-1.local; ssh $H 'grep -c shutdown log' -> pass, no-match
142. export HOST=rig-1.local; curl -X POST "http://${HOST}:8080/api/move" -d '{}' -> hold, http-write, host rig-1.local
143. for h in rig-1.local 10.0.0.9; do ssh $h bash < run.sh; done -> hold, unreadable, host rig-1.local, isCertain false
144. OUT=$(ssh rig-1.local 'bash -s' < run.sh) -> hold, unreadable, host rig-1.local
145. echo "$(cat run.sh | ssh rig-1.local bash)" -> hold, unreadable, host rig-1.local
146. eval "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
147. echo "ssh rig-1.local bash < run.sh" | bash -> hold, unreadable, host rig-1.local
148. trap "ssh rig-1.local bash < run.sh" EXIT -> hold, unreadable, host rig-1.local
149. diff <(ssh rig-1.local bash < run.sh) expected.txt -> hold, unreadable, host rig-1.local
150. # restart the rig \ / ssh rig-1.local 'sudo reboot' -> hold, power, host rig-1.local
151. echo a \<CR> / ssh rig-1.local 'sudo reboot' -> hold, power, host rig-1.local
152. cat <<'EOF' > /dev/null / note \ / EOF / ssh rig-1.local 'sudo reboot' / cat <<'EOF' / x / EOF -> hold, power, host rig-1.local
153. cd /tmp && \ / # restart the app \ / ssh rig-1.local 'sudo systemctl restart app' -> hold, service, host rig-1.local
154. ssh rig-1.local 'python3 prep.py; bash' <<'EOF' / sudo reboot / EOF -> hold, power, host rig-1.local
155. ssh rig-1.local 'node -v; sh' <<< 'pkill -f bench' -> hold, kill, host rig-1.local
156. 450,000 characters of `echo ok; ` then ssh rig-1.local bash < run.sh -> hold, unreadable, host rig-1.local, isCertain false
157. wget -T 5 http://rig-1.local:8080/api/status -> pass, no-match
158. ssh rig-1.local 'wget -q -T 5 -O- http://localhost:8080/api/status' -> pass, no-match
159. echo G1 X10 > /dev/tty.usbmodem14101 -> hold, serial-write
160. python3 -c "axis.controller.input_pos += 1" -> hold, motor-api
161. pio run --target=upload -> hold, flash
162. ssh rig-1.local 'while kill -0 2186 2>/dev/null; do sleep 5; done; echo done' -> pass, no-match
163. ssh rig-1.local 'kill -0 2186 && kill 2186' -> hold, kill, host rig-1.local
164. ssh rig-1.local 'kill -s 0 2186' -> pass, no-match
165. ssh rig-1.local 'kill -9 2186' -> hold, kill, host rig-1.local
```

#### Task 5, corrected again 2026-11-16 after the phase 2 re-review

The first fix round was re-reviewed in full (three lenses, each finding
checked by a skeptic, both versions of the matcher run over generated
commands). The gate, the Monitor hold and the hold kit came back clean;
the matcher did not: twelve confirmed findings in nine groups, most of
them commands the first version held and the first fix round let pass (a
substitution inside `${...}` in double quotes, a `)` taken for a case
pattern, a line continuation after a redirect sign, bash's long options
written with one dash, signal 0 followed by another signal), plus an
internal error that dropped a hold and a nested `eval` shape that overran
the hook's time. The second and last fix round fixed all nine. The rules
below are what the matcher now does; where one differs from a rule above,
this one stands. Cases 166 to 259 pin them.

- Normalisation: a backslash-newline is also joined after a redirect sign before its target, here-string or heredoc delimiter, inside a redirect sign (`>\`+`|`, `<\`+`<`, `<\`+`(`), between a file descriptor and its sign, between `$` and the `(` or the name behind it, and inside a variable's name; inside `$'...'` the pair is kept for the next shell to join (bash) and the text is also read with the backslash dropped (zsh).
- Built-in table: `kill|pkill|killall` with signal 0 is not a reason only when no later word of the same command, up to the next `;`, `&`, `|` or newline and before a lone `--`, starts with `-`, other than a cluster of pkill's match flags (`-f -x -i -n -o -a -e -l`) and what stands inside a plain substitution; signal 0 is spelled `-0` or `--signal 0` for all three, `-s 0` for `kill` and `killall` only, `-n 0` for `kill` only.
- Rule 1: a `${` runs to the brace that closes it, past a nested `${ }`, `$( )`, backticks and quotes, and a substitution inside its braces is a substitution of the segment inside double quotes too; a pair of parentheses glued into a word, or opening a word behind a command, is part of that word, and what it holds is a substitution of the segment unless it is plain glob text; a process substitution right after a redirect sign is that redirect's target; the scanner follows `case`, `in`, `;;`, `;&`, `;;&` and `esac`; quoted substitutions nested more than 200 deep in one word count as not closed.
- Rule 2: the cut is made only at the `)` that ends a case pattern (where the clause is due one) and at the empty `()` after a function's name; the text before the cut is tried as raw text and also classified as a text of its own, and the segment is exempt only when that text is exempt too; any other top-level `)` ends its group's last command, so a word after it starts a command of its own, and so do zsh's `}` in `{ command }` and `]]` before a word.
- Rule 2a: the assignment may stand behind `{`, `do`, `then`, `else`, `elif`, `if`, `while`, `until`, `!`, a case pattern or a function's name, and may be made with `local`, `declare`, `typeset` or `readonly` (flags `-g -r -x` only); a use of the name glued to a dash does not stop it; the value is also put in place inside the text of a substitution and a process substitution, the strings of `eval` and `trap`, and the `-c` string, here-string and quoted heredoc body of a local shell, each read with the values in place beside the text as written; only a plain or flagless `export` assignment that is the whole of its segment, with its name standing nowhere else, makes a remote-shell target certain.
- Rule 3a: a remote side that reads its program from standard input and is fed a process substitution (`< <(command)`) is unreadable like one fed a file, and the substitution's text is tried against every class with the stage's host.
- Rule 4: a shell's long options written with one dash (`-login -noprofile -norc -posix -restricted -verbose -noediting -debugger`; `-rcfile` and `-init-file` with a value) are options; where no `-c` is found that way, the first `-...c...` word before the first word that is neither an option nor an option's value starts a command string that is classified beside the segment's verdict; the first non-option word after `-c` is classified alone as well as together with the words after it.
- Rule 6 (addition): each distinct substitution, `eval` and `trap` text of a segment is classified once.
- Rule 7: an internal error, a text handed to the reader after the command has had 1,200,000 characters of reading, and a text with a `${...}` in double quotes that two shells close at different braces are decided like a text too deep to take apart: by the raw text, and held as `unreadable` when it names a configured host (past the budget: when the whole command does).
- Two readings (new): where the scanner reads a text differently from the scanner of the first review round, the text is also read that earlier way; every reason of either reading holds, the text is exempt only when both readings exempt it, and the earlier reading's own doubt adds the raw text's reasons without making the verdict uncertain.

Choices made in this round, stated once:

- **No hold of the first fix round is lost, at the price of a few reads.**
  Where the scanner now cuts a text into words differently, the text is
  also read the earlier way and the reasons of both readings hold. So
  `if (ssh rig-1.local 'grep -c shutdown log') then echo ok; fi` is still
  held, although it is a read. The second reading can be taken out later
  if these false holds turn out to matter: over the 4,421 shell commands
  of this machine's own session history, the first fix round and this one
  give the same verdict for every command.
- **A value from the new assignment forms is weak.** An assignment behind
  `{`, `then`, `do`, a case pattern or a function's name, or made with
  `local`, `declare`, `typeset` or `readonly`, adds holds and names a
  host, and never makes a remote target certain: `{ H=rig-1.local; ssh $H
  'grep -c shutdown log'; }` stays held as uncertain.
- **Signal 0 is read per program.** `-s 0` is a signal for `kill` and
  `killall` and a session for `pkill`; `-n 0` is a signal for `kill` only.
  So `pkill -s 0 bench` and `pkill -n 0` are held as the kills they are.
  A cluster of pkill's own match flags after the signal does not end the
  exemption (`pkill -0 -f bench` passes); any other later option does.
- **Two more classes of read pass that the first version held**, beside
  those listed in the first correction: a read after a group's `)`
  (`if ((1)) then ssh rig-1.local 'grep -c shutdown log'; fi`), which the
  first version glued onto the command before it, and case 151's
  backslash before a carriage return.
- **The work budget** of one classify call is 1,200,000 characters handed
  to the reader (three times the parse limit); past it rule 7 decides.

Limits that stay, each listed in the mod's README under "What it cannot
see": input given to a whole group or loop (`{ ssh rig-1.local bash; } <
run.sh`, `while read l; do ssh rig-1.local bash; done < run.sh`), which
needs group-level input tracking and goes on the roadmap; a value used
before its assignment, or set by `${NAME:=value}`; a carried value inside
an interpreter's code; a command put together at run time (brace
expansion, a signal option in a variable); a variable inside remote read
text that is set outside the command (`ssh rig-1.local "ls $X"`); and a
script run by name on the host, also from inside a heredoc. New false
holds, all rare: `kill -0 1 kill -0 1` with no separator, `pkill -0 -u
root -f x` (a flag with a value), two `${...:-it's}` defaults in one
double-quoted string that names a host, and a glob qualifier with a
modifier (`*(N:t)`), which ends the read-only exemption.

Tests added in `hooks/match.test.ts` (347 in the mod after this round):
one per row 166 to 259; "an internal error holds a text that names a
configured host"; "further forms of the second round are held, each for
its kind" (50 commands); "reads in the spellings of the second round
pass" (24 commands); "nested eval and trap strings stay within the time a
hook has" (7 shapes, 600 ms each); "the forms the second round reads take
time proportional to their length" (23 shapes).

The proof kept with the round (outside the repo): the first version, the
first fix round and the second were run side by side over 6,743,926
generated commands. Nothing the first fix round held passes now except
1,370 reads behind a one-dash long option, each of which passed before
once the option is taken out; every command the first version held and
this one passes falls in a class of read named in this plan; a copy whose
error handler rethrows raised no internal error; the slowest command took
296 ms at 375,018 characters.

```text
166. echo "${OUT:-$(ssh rig-1.local 'ctl move x 1')}" -> hold, site, host rig-1.local
167. test -n "${OUT:=$(ssh rig-1.local 'ctl move x 1')}" && echo moved -> hold, site, host rig-1.local
168. ssh rig-1.local 'echo "${OUT:-$(sudo reboot)}"' -> hold, power, host rig-1.local
169. echo "${OUT:-`ssh rig-1.local 'ctl move x 1'`}" -> hold, site, host rig-1.local
170. echo "${X:+$(ssh rig-1.local 'ctl move x 1')}" -> hold, site, host rig-1.local
171. echo "${arr[$(ssh rig-1.local 'ctl move x 1')]}" -> hold, site, host rig-1.local
172. X="${X:-$(ssh rig-1.local bash < run.sh)}" -> hold, unreadable, host rig-1.local
173. ssh rig-1.local 'ctl stop "${X:-$(sudo reboot)}"' -> hold, power, host rig-1.local
174. echo "${V:-$(echo 1 > /sys/class/gpio/gpio17/value)}" -> hold, gpio-set, host null
175. [ "${RESULT:=$(ssh rig-1.local 'ctl home')}" = ok ] && echo homed -> hold, site, host rig-1.local
176. echo "${OUT:-$(ssh rig-1.local 'ctl move x 1' | awk '{print $1}')}" -> hold, site, host rig-1.local, certain
177. ssh rig-1.local 'bash -s' < run.sh *(N) ls -> hold, unreadable, host rig-1.local
178. ssh rig-1.local bash -s *(N) x < run.sh -> hold, unreadable, host rig-1.local
179. ssh rig-1.local bash -s < run.sh x(N) y -> hold, unreadable, host rig-1.local
180. ssh rig-1.local bash -s < run.sh !(x) y -> hold, unreadable, host rig-1.local
181. cat run.sh | ssh rig-1.local 'bash -s' *(N) x -> hold, unreadable, host rig-1.local
182. if (echo 'ctl move x 1' | ssh rig-1.local bash) then echo ok; fi -> hold, site, host rig-1.local
183. if (ssh rig-1.local 'bash -s' < run.sh) then echo ok; fi -> hold, unreadable, host rig-1.local
184. for i in 1 2; do (cat run.sh | ssh rig-1.local bash -s) done -> hold, unreadable, host rig-1.local
185. ssh rig-1.local '{ (bash -s) }' < run.sh -> hold, unreadable, host rig-1.local
186. if (ssh rig-1.local bash <<'EOF') then echo ok; fi / ctl move x 1 / EOF -> hold, site, host rig-1.local
187. if (ssh rig-1.local <<'EOF') then echo ok; fi / sudo reboot / EOF -> hold, power, host rig-1.local
188. ssh rig-1.local bash < run.sh; <5,000 times "$(><5,000 times )"> -> hold, unreadable, host rig-1.local, isCertain false
189. ssh rig-1.local bash < run.sh; <20,000 times "$(><20,000 times )"> -> hold, unreadable, host rig-1.local, isCertain false
190. ssh rig-1.local "$CMD"; echo <20,000 times "$(> -> hold, unreadable, host rig-1.local, isCertain false
191. cat run.sh | ssh rig-1.local bash; echo <20,000 times "$(> -> hold, unreadable, host rig-1.local, isCertain false
192. ssh rig-1.local "$CMD"; echo <16,000 times "$(><16,000 times )"> -> hold, unreadable, host rig-1.local, isCertain false
193. ssh rig-1.local bash < run.sh; bash -n -c '<20,000 times "$(>' -> hold, unreadable, host rig-1.local, isCertain false
194. ssh rig-1.local '<125,000 times $A;>' -> hold, unreadable, host rig-1.local
195. BASE=http://rig-1.local:8080; RESP=$(curl -s -X POST "$BASE/api/move" -d '{"x":10}'); echo "$RESP" -> hold, http-write, host rig-1.local
196. BASE=http://rig-1.local:8080; RESP=`curl -s -X POST "$BASE/api/move" -d 1`; echo "$RESP" -> hold, http-write, host rig-1.local
197. BASE=http://rig-1.local:8080; echo "answer: $(curl -s -X POST "$BASE/api/move" -d 1)" -> hold, http-write, host rig-1.local
198. BASE=http://rig-1.local:8080; if [ "$(curl -s -o /dev/null -X POST "$BASE/api/move" -d 1)" = 200 ]; then echo ok; fi -> hold, http-write, host rig-1.local
199. BASE=http://rig-1.local:8080; diff <(curl -s -X POST "$BASE/api/move" -d 1) expected.json -> hold, http-write, host rig-1.local
200. export HOST=rig-1.local; CODE=$(curl -X POST "http://${HOST}:8080/api/move" -d '{}') -> hold, http-write, host rig-1.local
201. BASE=http://rig-1.local:8080 / RESP=$(curl -s -X POST "$BASE/api/move" -d '{"x":10}') / echo "$RESP" -> hold, http-write, host rig-1.local
202. BASE=http://rig-1.local:8080; ID=$(curl -s -X POST "$BASE/api/jobs" -d 1 | jq -r .id) -> hold, http-write, host rig-1.local
203. SSH="ssh rig-1.local"; OUT=$($SSH 'sudo reboot') -> hold, power, host rig-1.local
204. SSH="ssh rig-1.local"; OUT=$($SSH 'sudo systemctl restart app') -> hold, service, host rig-1.local
205. SSH="ssh rig-1.local"; OUT=$($SSH 'pkill -f bench') -> hold, kill, host rig-1.local
206. SSH="ssh rig-1.local"; OUT=$($SSH 'bash -s' < run.sh) -> hold, unreadable, host rig-1.local
207. RIG=rig-1.local; X=$(docker -H "tcp://$RIG:2375" restart app) -> hold, service, host rig-1.local
208. BASE=http://rig-1.local:8080; eval 'curl -s -X POST "$BASE/api/move" -d 1' -> hold, http-write, host rig-1.local
209. BASE=http://rig-1.local:8080; trap 'curl -s -X POST "$BASE/api/move" -d 1' EXIT -> hold, http-write, host rig-1.local
210. H=rig-1.local; curl -H 'Content-Type: application/json' -X POST "http://$H:8080/api/move" -d '{}' -> hold, http-write, host rig-1.local
211. ssh rig-1.local bash < \ /   run.sh -> hold, unreadable, host rig-1.local
212. cat run.sh | ssh rig-1.local bash > \ /   /dev/null -> hold, unreadable, host rig-1.local
213. cat run.sh | ssh rig-1.local bash &> \ /   out.log -> hold, unreadable, host rig-1.local
214. ssh rig-1.local bash 2> \ /   /dev/null < run.sh -> hold, unreadable, host rig-1.local
215. ssh rig-1.local $'ctl mo\ / ve x 1' -> hold, site, host rig-1.local
216. echo $\ / (ssh rig-1.local 'sudo reboot') -> hold, power, host rig-1.local
217. ssh rig-1.local bash < <(cat run.sh) -> hold, unreadable, host rig-1.local
218. cat run.sh | ssh rig-1.local bash >> \ /   out.log -> hold, unreadable, host rig-1.local
219. ssh rig-1.local <<< \ /   "$CMD" -> hold, unreadable, host rig-1.local
220. ssh rig-1.local bash << \ /   EOF / $CMD / EOF -> hold, unreadable, host rig-1.local
221. diff <\ / (ssh rig-1.local bash < run.sh) expected.txt -> hold, unreadable, host rig-1.local
222. f() { BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d '{"x":10}'; }; f -> hold, http-write, host rig-1.local
223. { BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; } -> hold, http-write, host rig-1.local
224. if true; then BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; fi -> hold, http-write, host rig-1.local
225. for x in 1 2; do BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1; done -> hold, http-write, host rig-1.local
226. case "$1" in go) BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 ;; esac -> hold, http-write, host rig-1.local
227. { DEV=/dev/ttyUSB0; echo G1 X10 > "$DEV"; } -> hold, serial-write, host null
228. local BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local
229. move() { /   local BASE=http://rig-1.local:8080 /   curl -s -X POST "$BASE/api/move" -d 1 / } / move -> hold, http-write, host rig-1.local
230. case "$1" in /   go) BASE=http://rig-1.local:8080 /     curl -s -X POST "$BASE/api/move" -d 1 ;; / esac -> hold, http-write, host rig-1.local
231. readonly BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local
232. declare BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local
233. declare -r BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local
234. typeset BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local
235. while read -r line; do BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move" -d "$line"; done < moves.txt -> hold, http-write, host rig-1.local
236. { PIN=/sys/class/gpio/gpio17/value; echo 1 | sudo tee "$PIN"; } -> hold, gpio-set, host null
237. { SSH="ssh rig-1.local"; $SSH 'sudo reboot'; } -> hold, power, host rig-1.local
238. { RUN="ssh rig-1.local"; $RUN bash < run.sh; } -> hold, unreadable, host rig-1.local
239. bash -login -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
240. bash -noprofile -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
241. bash -posix -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
242. zsh -oshwordsplit -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
243. bash -login -c "ssh rig-1.local 'grep -c shutdown log'" -> pass, read-only
244. bash -verbose -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
245. bash -noediting -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
246. bash -restricted -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
247. bash -rcfile F -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
248. bash -init-file F -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
249. bash -noprofile -norc -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
250. sh -login -c "ssh rig-1.local bash < run.sh" -> hold, unreadable, host rig-1.local
251. ssh rig-1.local bash -login -c "$CMD" -> hold, unreadable, host rig-1.local
252. bash -login -c 'ssh rig-1.local "ctl stop $(sudo reboot)"' -> hold, power, host rig-1.local
253. ssh rig-1.local 'kill -0 -s KILL 2186' -> hold, kill, host rig-1.local
254. ssh rig-1.local 'kill -s 0 -s 9 2186' -> hold, kill, host rig-1.local
255. ssh rig-1.local 'pkill -0 --signal KILL -f bench' -> hold, kill, host rig-1.local
256. ssh rig-1.local 'pkill -0 -f bench --signal 9' -> hold, kill, host rig-1.local
257. ssh rig-1.local 'killall -0 bench -s KILL' -> hold, kill, host rig-1.local
258. ssh rig-1.local 'kill -0 2186' -> pass, no-match
259. ssh rig-1.local 'kill -0 -- -2186' -> pass, no-match
```

Case 25 is now written as the table gives it: 25. 20,007 characters of whole `echo ok; ` commands then ssh rig-1.local 'ctl home' -> hold, site, host rig-1.local, certain.

#### Task 5, third correction 2026-11-16 (one more fix round, approved by the owner)

After the two fix rounds this plan allows, the last check of the matcher
still confirmed twelve findings in nine groups, one of them high, and
phases 2 and 4 were held back (see "Held back and deferred"). The owner
then approved one more, narrow fix round with a stop rule: make every
limit of the matcher end in a hold instead of a pass, fix the subshell
reading and the four smaller defects, run one check of that round against
the three earlier versions of the matcher, and ship unless that check
confirms a high finding; whatever else it finds is documented as a limit.
The round fixed all nine groups. The rules below are what the matcher now
does; where one differs from a rule above, this one stands. Cases 260 to
322 pin them.

- Built-in table: after signal 0 the search for a later word that starts with `-` does not end at the `|` of a `>|` redirect, nor at a `;`, `&`, `|` or newline that stands behind a backslash or inside a quote opened at the start of a word or behind `=`; the `docker compose` verb is found however far along its command it stands.
- Rule 1: a `(` behind `time` (and its `-p`), right behind the empty `()` of a function's name and behind the `)` of a case pattern opens a group, and one that is never closed marks the parse uncertain; a `${` followed by a blank, a newline or `|` (`${ command; }`, `${| command; }`) is a substitution whose text is a command, in a word, in double quotes and in a heredoc body the shell expands; a `<( )` or `>( )` inside the braces of a `${...}` is a substitution of the segment, outside double quotes and inside them.
- Rule 2: `time` is a word behind which a group, an assignment or a `case` may stand.
- Rule 2a: every literal value of at most 2,000 characters is carried, and it is a weak one when its assignment has one of the weak forms, when its name stands anywhere else in the text as a bare word (a second assignment, a loop variable, `read NAME`, a word that merely equals it) or glued to a dash, when some declaring word names it without a value (`local NAME`, `export NAME`, after `-g -r -x` too; such a bare name is not counted as a use), or when the value was put together from a weak one; the room for values is 20,000 characters for every use and, beside it, 20,000 for the words of the commands and 20,000 for the second copies of texts the shell reads again, and a value is put in place while it fits in the first or in the room of its own kind.
- Rule 3a: a weak value never takes a hold away: a remote-shell target known only through one stays an unresolved target (the host is the one the command names), and an executable in remote text that is one stays input that cannot be read.
- Rule 7 (the limits rule, new wording): wherever the reader stops short of reading everything for a reason of its own (a command over 400,000 characters; a text more than eight texts deep; 1,200,000 characters of reading in one call; more than 64 distinct texts read a second time; quoted nesting past 200 counted levels inside one word; the room for carried values spent; a literal value over 2,000 characters; the steps of the closing readers spent, 16 for each character scanned and 100,000 for the call; a `${...}` in double quotes that two shells close at different braces), the whole raw command is decided like a text that cannot be taken apart: every class is tried on the raw text, a serial device or GPIO path it names holds as `serial-write` or `gpio-set`, and a command that names a configured host, in its raw text or through a value a stage was read with, is held as `unreadable`; the verdict is uncertain and the reasons already found are kept; an internal error is decided the same way.
- Two readings: the 64 second readings are 64 distinct texts, and a nested text that is read again inside each reading of the text around it counts once.

Choices made in this round, stated once:

- **One rule for every limit, acted on in one place.** Wherever the reader
  stops short for a reason of its own, it sets one flag for the call, and
  `classify` then decides the whole raw command like a text that cannot be
  taken apart. So a limit can no longer drop a reading quietly, and a limit
  added later cannot forget the rule. The price: a harmless command that
  reaches a limit and names a configured host is held. None of the 63,895
  distinct shell commands in this machine's own session history reaches
  any of the limits.
- **A limit also holds a device path.** Under a limit, a raw command that
  names a serial device or a GPIO path is held for that kind, because a
  write through a command's own arguments or through a carried redirect
  target shows no pattern.
- **A limit with no configured host named decides by the raw text alone.**
  A command that reaches a limit, names no configured host and shows
  neither a pattern nor a device path passes. One consequence is known and
  left: a site command put together from a carried value
  (`M=move; ctl $M x 1`) on a line behind a quoted nest more than 100 deep,
  or once the room for carried values is spent, passes; the version before
  the second fix round held the nest form. Reading on past a nest the
  reader does not follow, or putting values in place in raw text, would be
  a new way of reading, which this round was not to add. A command put
  together at run time (`ctl $(echo move) x 1`) passes by the same limit of
  the design, with no limit reached.
- **The subshell reading gives back what the second round held by
  misreading.** A `(` behind `time`, behind a function's `()` and behind a
  later case pattern now opens a group, so the reads there pass again and
  the held commands there are found by the first reading. A few commands
  that are not reads pass with them: those the second round held only
  because it tried the whole subshell as raw text, and that every version
  passes when the subshell is written as a brace group
  (`time (sudo reboot; ping -c1 rig-1.local)`: the reboot is local). An
  unclosed `(` in these places stays an uncertain parse.
- **A weak value never takes a hold away.** A remote-shell target known
  only through a weak value stays an unresolved target, and a value put
  together from a weak one is weak.
- **A value the one-use guard declines is carried as a weak one**, not
  dropped: `dev=/dev/ttyUSB0; echo G1 X10 > "$dev"` is held. The price: a
  stale value can add a hold (`f=/dev/ttyUSB0`, later `for f in *.txt` with
  a write to `"$f"`). Nothing that was not a certain value became one.
- **A process substitution inside the braces of a reference is read in
  double quotes too**, although bash does not run it there.
- **The 64 second readings are 64 distinct texts.** A nested text read
  again inside each reading of the text around it counts once.
- **Time is bounded by steps.** The closing readers count their steps (16
  for each character scanned and 100,000 for the call), and three searches
  that were repeated at every level are asked once. The slowest input
  found takes about a quarter of a second.
- **One earlier assertion changed.** In the speed test, `H=rig-1.local; `
  and 15,000 times `ssh $H uptime; ` is now held: its values no longer fit
  the room for them, which is a limit, and the command names a configured
  host. Its time bound is unchanged.

The proof of this round: its matcher and the three earlier ones were run
side by side over 6,933,045 distinct generated commands (the earlier
reviewers' generators and three new ones: harmless padding around every
kind of held command, a command for every limit, and every weak form of
assignment). Of the commands the second round held, 2,775 pass now, all
in the subshell class above; of those the first fix round held, 1,514,
all reads behind a one-dash long option of a shell; every command the
first version held and this one passes was already passed after the first
fix round, or is one of those 1,514. No internal error; the slowest classification took 233 ms. Over
the 4,421 shell commands the local config was drawn from, this round and
the second give the same verdict for every command.

The check of this round (three lenses over the round's changes only, the
four versions of the matcher run side by side, each finding checked by a
skeptic) confirmed nine findings in six groups and no high one. Medium: an
assignment that opens a group behind `time -p` is not read as one, so
`time -p (M=move; ctl $M x 1)` passes where the second round held it; the
new step budget runs out at 14 levels of a single quote inside nested
`${...}`, where the second round still read the text, and a hold put
together from a carried value behind it passes; the values newly carried
as weak spend the room for carried values, with the same effect after
20,000 characters of their uses; and the limit without a configured host
named above, which one skeptic confirmed and another set aside as the
rule this round was given. Low: more spellings that hide a later signal
option after signal 0, a `${ command; }` nested in another `${...}`, and
shapes of very long commands that take quadratic time (the call is then
refused, not passed). None is fixed in this version: under the stop rule
the matcher ships as it was checked. They are listed in the mod's README
under "Found by the last review and not fixed yet" and marked in "Held
back and deferred". The check also listed ten gaps that every version
shares, among them a carried value used through `${NAME%/}`, a name given
two literal values, input fed to a remote shell behind `sshpass` and
other wrappers, and a host name with a loop variable in it; they are in
the README under "What it cannot see".

What stays open is listed in the mod's README under "What it cannot see":
the limit without a configured host above; input given to a group over
several lines or handed on by a process substitution
(`echo hi | tee >(ssh rig-1.local bash)`); an assignment on a line of its
own inside a compound command or `( )`, which counts as a plain one; and
`time { (read) }`, which stays held.

Recipes: ARITH(n) = n assignments `x<i>=$(( (a+<i>)*2 ))`, i from 0, joined by `; `. QNEST(k) = `x` wrapped k times in `echo "$(` ... `)"`. BNEST(k) = `x` wrapped k times in `"${a:-` ... `}"`. DEFAULTS(k) = `echo "${a:-${b}}"` wrapped k times in `echo "${a:-${b}}" $(` ... `)`. QUOTED(k) = `x` wrapped k times in `"${a:-''` ... `}"`. LONGY = `Y=` and 1,999 times `y`.

```text
260. 70 lines `n<i>=$(ls /tmp/f<i>*(N) | wc -l)` / f() ( case $1 in a) ssh rig-1.local bash < run.sh;; esac ) -> hold, unreadable, host rig-1.local, isCertain false
261. ARITH(64); time (ssh rig-1.local bash) < run.sh -> hold, unreadable, host rig-1.local, certain
262. time (ssh rig-1.local bash) < run.sh; DEFAULTS(7) -> hold, unreadable, host rig-1.local, certain
263. f() (ssh rig-1.local bash) < run.sh; f; DEFAULTS(7) -> hold, unreadable, host rig-1.local, certain
264. time (ssh rig-1.local bash) <<< "$CMD"; DEFAULTS(7) -> hold, unreadable, host rig-1.local, certain
265. ARITH(70); ssh rig-1.local $'echo a \ / bash' < run.sh -> hold, unreadable, host rig-1.local, isCertain false
266. ARITH(70); CMD='grep -c done log'; ssh rig-1.local "$CMD" -> hold, unreadable, host rig-1.local, isCertain false
267. ARITH(70); ls -la -> pass
268. B=http://rig-1.local:8080/<1,900 times v>; X=$(echo <ten times "$B">); curl -X POST "$B" -d 1 -> hold, http-write, host rig-1.local, certain
269. B=http://rig-1.local:8080; X=$(printf '%s\n' <900 times "$B">); curl -X POST "$B/api/move" -d 1 -> hold, http-write, host rig-1.local, isCertain false
270. LONGY; echo $(echo $Y 0) ... $(echo $Y 9); DEV=/dev/ttyUSB0; echo G1 X10 > "$DEV" -> hold, serial-write, host null, certain
271. LONGY; echo $(echo $Y 0) ... $(echo $Y 9); SSH="ssh rig-1.local"; $SSH bash < run.sh -> hold, unreadable, host rig-1.local, certain
272. LONGY; eval 'echo $Y 0'; ... eval 'echo $Y 9'; BASE=http://rig-1.local:8080; curl -s -X POST "$BASE/api/move" -d 1 -> hold, http-write, host rig-1.local, certain
273. LONGY; trap 'echo $Y 0' EXIT; ... trap 'echo $Y 9' EXIT; SSH="ssh rig-1.local"; $SSH 'sudo reboot' -> hold, power, host rig-1.local, certain
274. B=http://rig-1.local:8080; echo <1,000 times "$B">; curl -X POST "$B/api/move" -d 1 -> hold, http-write, host rig-1.local, isCertain false
275. QNEST(101) / ssh rig-1.local bash < run.sh -> hold, unreadable, host rig-1.local, isCertain false
276. QNEST(105); ssh rig-1.local "$CMD" -> hold, unreadable, host rig-1.local, isCertain false
277. QNEST(107); cat run.sh | ssh rig-1.local bash -> hold, unreadable, host rig-1.local, isCertain false
278. echo BNEST(102); ssh rig-1.local bash < run.sh -> hold, unreadable, host rig-1.local, isCertain false
279. QNEST(101) / ls -> pass
280. time (ssh rig-1.local 'grep -c shutdown log') -> pass, read-only
281. time (ssh rig-1.local 'cat /var/log/reboot.log' | wc -l) -> pass, read-only
282. ssh rig-1.local 'time (grep -c shutdown /var/log/syslog)' -> pass, read-only
283. f() (ssh rig-1.local 'grep -c shutdown log'); f -> pass
284. case "$1" in a) echo a ;; b) (ssh rig-1.local 'grep -c shutdown log') ;; esac -> pass
285. time (ssh rig-1.local bash) < run.sh -> hold, unreadable, host rig-1.local
286. f() (ssh rig-1.local bash) < run.sh; f -> hold, unreadable, host rig-1.local
287. case $1 in a) echo hi ;; b) (ssh rig-1.local bash) < run.sh ;; esac -> hold, unreadable, host rig-1.local
288. f() ( case $1 in a) ssh rig-1.local bash < run.sh;; esac ) -> hold, unreadable, host rig-1.local
289. ssh rig-1.local '{ time (bash -s) }' < run.sh -> hold, unreadable, host rig-1.local
290. ssh rig-1.local 'for i in 1; do time (bash -s) done' < run.sh -> hold, unreadable, host rig-1.local
291. time -p (ssh rig-1.local 'grep -c shutdown log') -> pass, read-only
292. ls (a|b)* -> pass
293. if [ -n "$S" ]; then H=other.example; fi; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
294. f() { local H=other.example; }; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
295. case x in a) H=other.example ;; esac; ssh "$H" "$CMD"; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
296. while false; do H=other.example; done; cat run.sh | ssh ${H} bash; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
297. curl -H 'X: 1' http://x.example; H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
298. if [ "$MODE" = spare ]; then H=spare.example; fi; : "${H:=rig-1.local}"; ssh $H bash < run.sh -> hold, unreadable, host rig-1.local, isCertain false
299. H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local -> pass
300. f() { /   local url /   url=http://rig-1.local:8080/api/move /   curl -X POST "$url" -d 1 / } / f -> hold, http-write, host rig-1.local
301. local B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1 -> hold, http-write, host rig-1.local
302. export B; B=http://rig-1.local:8080; curl -X POST "$B/api/move" -d 1 -> hold, http-write, host rig-1.local
303. B=http://rig-1.local:8080; export B; curl -X POST "$B/api/move" -d 1 -> hold, http-write, host rig-1.local
304. local H; H=other.example; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
305. ssh rig-1.local 'kill -0 >| /tmp/out -s KILL 2186' -> hold, kill, host rig-1.local
306. ssh rig-1.local "kill -0 2186 2>| /dev/null -s KILL" -> hold, kill, host rig-1.local
307. ssh rig-1.local 'pkill -0 -f bench >| /dev/null --signal 9' -> hold, kill, host rig-1.local
308. ssh rig-1.local 'pkill -0 "bench|runner" --signal 9' -> hold, kill, host rig-1.local
309. ssh rig-1.local 'kill -0 2186 >| /dev/null' -> pass, no-match
310. cat ${A:-<(ssh rig-1.local 'ctl move x 1')} -> hold, site, host rig-1.local
311. ssh rig-1.local 'cat ${F:-<(sudo reboot)}' -> hold, power, host rig-1.local
312. bash -c 'cat ${F:-<(ssh rig-1.local bash < run.sh)}' -> hold, unreadable, host rig-1.local
313. ssh rig-1.local 'echo "${ sudo reboot; }"' -> hold, power, host rig-1.local
314. ssh rig-1.local 'echo ${| sudo reboot; }' -> hold, power, host rig-1.local
315. cat ${F:-/dev/null} -> pass, read-only
316. B=http://rig-1.local:8080/<2,001 times v>; curl -X POST "$B" -d 1 -> hold, unreadable, host rig-1.local, isCertain false
317. echo QUOTED(40); ssh rig-1.local 'grep -c done log' -> hold, unreadable, host rig-1.local, isCertain false
318. ssh rig-1.local 'docker compose --project-directory /srv/<300 times a> up -d' -> hold, service, host rig-1.local
319. URL=http://rig-1.local:8080/api/move; curl -X POST "$URL" -d 1; echo URL done -> hold, http-write, host rig-1.local
320. dev=/dev/ttyUSB0; echo G1 X10 > "$dev" -> hold, serial-write, host null
321. { A=other.example; }; H=$A; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
322. H=other.example; echo H; ssh $H bash < run.sh; ping -c 1 rig-1.local -> hold, unreadable, host rig-1.local, isCertain false
```

Cases 261 to 264 are certain because the hold is now found by the first reading and the budget of second readings is not spent.

### Task 6: the hold kit (`motion-hold/hooks/hold.ts`)

One hold at a time, a pane when it can be placed, the engine's question
dialog when not, a time limit either way. Task 13 copies this file byte for
byte; the orchestrator's gate diffs the two copies.

**Files:**
- Create: `motion-hold/hooks/hold.ts`
- Test: `motion-hold/hooks/hold.test.ts`

**Interfaces (produces):**

```ts
export type Decision = 'run' | 'cancel' | 'timeout' | 'interrupted' | 'error'
export type Card = {
  paneId: string        // 'motion-hold' or 'send-gate'
  title: string         // 'Motion Hold' or 'Send Gate'
  header: string        // at most 12 characters, for the dialog
  runLabel: string      // 'Run once' or 'Send once'
  what: string          // one line: what would happen
  lines: string[]       // the rest of the card, already cleaned and cut
  rows: number          // pane rows wanted
  timeoutMs: number
}
export type Slot = { id: number; card: Card; decision: Decision | null; where: 'waiting' | 'pane' | 'dialog' }
export type Holder = {
  slot(): Slot | null
  decide(id: number, d: 'run' | 'cancel'): boolean    // false when id is not the held slot
  request($: HoldEngine, signal: AbortSignal | undefined, card: Card): Promise<Decision>
}
export type HoldEngine = {   // the part of $ the kit uses, so a test can hand in a stub
  ui: { open; close; ask; notify; invalidate }
  process: { run }
  clock: { now }
}
export const CANCEL_LABEL = 'Cancel'
export function createHolder(): Holder
export function whyOf(d: Exclude<Decision, 'run'>, timeoutMs: number): string
export function questionOf(card: Card): string
```

`whyOf` texts: cancel "the user chose Cancel (or dismissed the dialog)";
timeout "no answer within <N> seconds"; interrupted "the turn was
interrupted"; error "the hold failed".

**`request`, step by step:**

1. While another slot is held, wait with the sleep poll; an aborted signal
   answers `'interrupted'`.
2. Claim the slot (`where: 'waiting'`), note the start time from
   `$.clock.now()`, and call `$.ui.notify(card.what, { title: card.title + ': holding' })`
   inside try/catch.
3. `$.ui.open({ id: card.paneId, title: card.title, focus: true, rows: card.rows })`,
   then `$.ui.invalidate('ui.render')`.
4. **Placed:** `where: 'pane'`. Loop until the slot has a decision: aborted
   signal gives `'interrupted'`; more than `timeoutMs` since the start gives
   `'timeout'`; else one sleep poll.
5. **Not placed:** `where: 'dialog'`. Race
   `$.ui.ask(questionOf(card), { options: [CANCEL_LABEL, card.runLabel], header: card.header })`
   against a loop that ends on a decision made through `decide` (the slash
   twins use it), on the time limit, or on an abort. Only an answer
   strictly equal to
   `card.runLabel` is `'run'`; any other answer is `'cancel'`; a rejection is
   `'interrupted'` when the signal aborted, else `'cancel'`.
6. Any throw: `'error'`. In `finally`: close the pane if it was placed (in
   try/catch), free the slot, invalidate.
   *Corrected 2026-11-16 after the phase 2 review:* the pane is closed
   whenever its open resolved, placed or not. A pane opened on a narrow
   terminal waits undrawn, and one left open appeared later as an empty
   card.
7. *Added 2026-11-16 after the reviews of both gates.* A `Slot` also carries
   `shownAt: number | null`, the clock time at which `where` became `pane`
   or `dialog` (null while waiting), and the kit exports `READ_MS = 1500`
   and `canApprove(slot, now)`: true only for a hold that is on screen and
   has been for `READ_MS`. The slash twin that approves uses it (Task 7,
   Task 13), so a typed approval can never land on a hold that took the
   slot a moment ago and that the person has not read. A press of the
   pane's button carries the slot's id and needs no such rule.

- [ ] **Step 1: write the failing tests** in `hold.test.ts`, each with a
  hand-made `HoldEngine` stub whose `process.run` advances a fake clock by
  250 ms per call:
  - "pane: run": open answers placed; `decide(id, 'run')` after two polls;
    result `'run'`; the pane was closed once.
  - "pane: cancel" gives `'cancel'`.
  - "pane: no answer" with `timeoutMs` 120000 gives `'timeout'`; the fake
    clock moved more than 120000 ms and at most 120500 ms; `ask` was never
    called.
  - "dialog: a decision through decide wins": `ask` never settles;
    `decide(id, 'run')` during the wait gives `'run'`.
  - "dialog: the run label runs": open answers not placed; `ask` resolves
    `'Run once'`; result `'run'`.
  - "dialog: anything else cancels": `ask` resolving `'Cancel'`, `''`,
    `'run once'` and `'Yes'` each give `'cancel'`.
  - "dialog: dismissed cancels": `ask` rejects; result `'cancel'`.
  - "dialog: no answer times out": `ask` never settles; result `'timeout'`.
  - "interrupted": the signal aborts during the wait; result
    `'interrupted'`, in both the pane and the dialog path.
  - "an error is not a run": `open` throws; result `'error'`.
  - "one at a time": a second `request` started while the first waits stays
    `where: 'waiting'` and is asked only after the first is decided.
  - "decide ignores a stale id": returns false and changes nothing.
  - `whyOf('timeout', 120000)` is `'no answer within 120 seconds'`.
- [ ] **Step 2: run** the tests. Expected: FAIL.
- [ ] **Step 3: implement `hold.ts`.**
- [ ] **Step 4: run** the tests. Expected: PASS.

### Task 7: the mod (`motion-hold/`)

**Files:**
- Create: `motion-hold/.claude-plugin/plugin.json`,
  `motion-hold/hooks/hooks.json`, `motion-hold/hooks/register.tsx`,
  `motion-hold/hooks/card.tsx`, `motion-hold/types/index.d.ts`,
  `motion-hold/hooks/test-kit.ts`, `motion-hold/README.md`,
  `motion-hold/PROVENANCE.md`, `motion-hold/.gitignore`,
  `motion-hold/tsconfig.json`,
  `motion-hold/examples/motion-hold.example.json` (the neutral example of
  Task 5)
- Test: `motion-hold/hooks/register.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`classify`, `parseConfig`, `clean`), Task 6
  (`createHolder`, `whyOf`).
- Produces: plugin `motion-hold` 0.1.0; command `/motion`; pane id
  `motion-hold`; band row key `zm-01-motion`; and this state, which the
  strip reads (Task 9):

```ts
export type MotionActive = {
  id: string; kinds: string[]; summary: string; host: string | null
  command: string; startedAt: number; isBackground: boolean; agentId?: string
}
export type MotionSeen = {
  at: number; verdict: 'passed' | 'ran' | 'denied'; why: string
  host: string | null; command: string
}
export type MotionConfig = {
  status: 'none' | 'ok' | 'broken'; path: string
  hosts: number; rules: number; hasStop: boolean; error: string
}
declare module 'claude-code' {
  interface PluginState {
    'motion-hold': { active: MotionActive | null; recent: MotionSeen[]; config: MotionConfig }
  }
}
```

- userConfig: `timeoutSeconds` (number, default `120`), `config` (string,
  default `""`: the file is then `<HOME>/.claude/motion-hold.json`).

**Behaviour:**

- **Config.** At `session.start` and on `/motion reload`: resolve the path;
  `$.fs.exists` false gives `none`; else `$.fs.read` and `parseConfig`. A
  read error is `broken`. The parsed config lives in a module variable; its
  summary goes to state `config`. A `broken` read toasts once:
  `motion-hold: the site config is broken, remote commands are held (/motion status)`.
- **The gate:** `on('tool.call', { tool: 'Bash' }, ...)` with the fail-closed
  catch.
  *Corrected 2026-11-16 after the phase 2 review:* the gate stands on
  `Bash` and on `Monitor`. The Monitor tool takes a `command` too (a shell
  command whose output lines are events), and a watch started that way ran
  with no card. A Monitor call with a command is classified and held like
  a Bash command; one with only a WebSocket passes; an approved one is
  recorded as a background entry, since the watch outlives the call.
  1. `verdict = classify(String(e.command ?? ''), read)`.
  2. Record a `MotionSeen` when the verdict holds or `hostOf` finds a host
     in the command (`recent` keeps the newest 30; `command` is
     `clean(text, 160)`).
  3. No hold: `return next(e)`.
  4. Hold: build the card (below) and `await holder.request($, next.signal, card)`.
  5. Not `'run'`: return
     `{ deny: 'Motion Hold held this command and did not run it: <whyOf>. It would: <summary>. Do not retry it unless the user asks you to. Reading state is not held: status, logs and searches run as usual.' }`.
     When the verdict's kinds include `unreadable`, the text ends with one
     more sentence: `Sending the same input to the host another way, such
     as copying it over and running it there, counts as a retry.`
  6. `'run'`: set `active` (id `e.tool_use_id`, `isBackground` from
     `e.run_in_background === true`), toast `Motion Hold: running it`, then
     `try { return await next(e) } finally { ... }`: in `finally`, clear
     `active` when it is still this call's and the call was not a
     background launch.
- **Stale state.** `session.start` clears an `active` that is not a
  background entry; `session.end` with reason `clear` or `resume` clears
  any.
- **The card** (`card.tsx`, pane `motion-hold`, drawn from `holder.slot()`):
  a round red-bordered Box with the title `■ Motion Hold`; `Would <summary>`
  in red; `Host <host>` when there is one; `From a subagent` when
  `e.agentId` is set; `Command` with `clean(text, 600)`, wrapped; `The
  command could not be read with certainty, so it is held.` when
  `isCertain` is false; then two Buttons: key `hold-cancel`, label `Cancel`,
  hotkey `2`, `autoFocus`; key `hold-run`, label `Run once`, no hotkey;
  then the hint `Enter or 2 cancels. Tab then Enter runs it once. Refused
  after <N> s. Twins: /motion run, /motion cancel.` `card.lines` carries the
  same lines for the dialog path.
- **The STOP row** (`AbovePrompt`, key `zm-01-motion`), drawn while `active`
  is not null: chip ` ■ MOTION  ` on `#f38ba8`; then `<summary> · since
  HH:MM:SS` (plus ` · background` for a background entry) in red; then,
  only when a `stopCommand` is configured, a framed Button key
  `motion-stop`, label `s: STOP`, hotkey `s`; and for a background entry a
  framed Button key `motion-clear`, label `x: clear`, hotkey `x`. With no
  `stopCommand` the text ends `· Esc interrupts here; the hardware may keep
  moving`.
- **STOP.** The button and `/motion stop` run the configured argv, `{host}`
  replaced by `active.host` (an argv that needs a host while there is none
  is refused with a toast), from a 10 ms timer:
  `$.process.run(argv, { timeoutMs: 10000 })`; toast `STOP sent (exit <n>)`
  or `STOP failed: <first line of stderr>`. With no `stopCommand`:
  `No stop command is configured (stopCommand in the config file).`
- **`/motion`** (`immediate: true`, hint
  `status | recent | test <command> | run | cancel | stop | clear | reload`):
  - `status` (default): config status and path, host and rule counts, any
    error, whether a hold is pending, the `active` entry.
  - `recent`: the newest 20 `MotionSeen` lines, newest first.
  - `test <command>`: the verdict for that text (hold or pass, kinds, host,
    certain or not). It runs nothing.
  - `run` and `cancel`: answer the pending hold. Honoured only when
    `e.origin.kind` is `composer` or `bridge`; any other origin answers
    `Only the person can answer a hold.` and changes nothing.
    *Corrected 2026-11-16 after the reviews of both gates:* `run` approves
    only a hold the kit's `canApprove` allows (Task 6, step 7); otherwise
    it answers `A new hold just appeared: read it, then answer again.` and
    approves nothing. `cancel` needs no such rule.
  - `stop`, `clear`, `reload` as above; `stop` has the same origin rule.

- [ ] **Step 1: write `test-kit.ts`** in the house shape: `world($, on, shape)`
  with `mock.clock`, a `fs.exists`/`fs.read` pair fed from
  `shape.configText`, an `env.get` answering `HOME`, a `process.run` hook
  that advances the clock 250 ms for `sleep` and records every other argv,
  `ui.open` answering `shape.isPlaced`, an `AskUserQuestion` hook answering
  `shape.answer` (or dismissing), recorders for toasts and `ui.notify`, and
  `bash(command, extra?)` that raises a `tool.call` for Bash and reports
  whether the tool beneath ran.
- [ ] **Step 2: write the failing tests** in `register.test.tsx`:
  1. "a plain command runs untouched": `ls -la`; the tool beneath ran once;
     no pane.
  2. "hold, pane, Run once": case 2 of Task 5; press `hold-run`; the tool
     ran; while it ran `active.summary` was set and the `AbovePrompt` row
     held the chip; after, `active` is null.
  3. "hold, pane, Cancel": press `hold-cancel`; the tool did not run; the
     deny text contains `the user chose Cancel` and
     `Do not retry it unless the user asks you to`.
  4. "hold, no answer": nothing pressed; the tool did not run; the deny text
     contains `no answer within 120 seconds`.
  5. "narrow terminal, dialog": `isPlaced` false; answer `Run once` runs it;
     `Cancel`, a dismissal and the answer `Yes` each refuse.
  6. "interrupted": the signal aborts; refused with `the turn was
     interrupted`.
  7. "a failing gate refuses": the `state.get` hook throws during the gate;
     the tool did not run and the result is a deny.
  8. "a subagent's command is held the same": with `agentId`; the card
     lists `From a subagent`.
  9. "a background launch keeps the row": approved with
     `run_in_background: true`; `active` stays after the call returns;
     `/motion clear` removes it.
  10. "two holds queue": the second card is drawn only after the first is
      answered.
  11. "a broken config holds remote commands": `configText` `{`;
      `ssh anywhere 'ls'` is held with the summary's config phrase; `ls`
      runs.
  12. "/motion run needs the person": origin `composer` approves the
      pending hold; origin `plugin` answers `Only the person can answer a
      hold.` and the hold stays.
  13. "a new session start clears a stale row": `active` set, then
      `session.start`; `active` is null.
  14. "/motion test shows the verdict and runs nothing": the text contains
      `would hold` and `site`; no tool ran.
  15. "/motion stop": with a `stopCommand`, the recorded argv is
      `['ssh', 'rig-1.local', 'ctl stop all']`; without one, the
      no-stop-command text.
  16. "the row yields": nothing of ours is drawn on a survey or on the
      desktop surface.
  17. "recent keeps what passed on a configured host": after case 1 of
      Task 5, `/motion recent` lists it as `passed`.
  18. "a refused unreadable input names the workaround": case 59 of Task 5,
      cancelled; the deny text contains `counts as a retry`. A refused
      case 2 does not contain it.
- [ ] **Step 3: run** `claude plugin test motion-hold`. Expected: FAIL.
- [ ] **Step 4: implement** `plugin.json`, `hooks.json`, `types/index.d.ts`,
  `card.tsx` and `register.tsx`.
- [ ] **Step 5: run** the tests. Expected: PASS (Tasks 5, 6 and 7 together).
- [ ] **Step 6: write README.md** (what is held, the built-in rule table,
  the config file with the neutral example, the commands, the limits named
  at the top of this phase) **and PROVENANCE.md** (ours; the hold flow
  follows this repo's blast-radius guard).
- [ ] **Step 7: verify.** validate and tsc pass.
  `grep -rn '\$\.http\|\$\.model' motion-hold/hooks` prints nothing.

**Live smoke** (it must never reach real hardware): in a scratch project
holding an executable script `fakectl` that prints `moved (fake)`, with the
option `config` pointing at a scratch file whose `hold` is
`["\\bfakectl\\s+move\\b"]` and `timeoutSeconds` 20: the model is asked to
run `./fakectl move x 1`; the hold appears; approving runs it and the row
shows and clears; a second run left unanswered is refused after 20 seconds;
`/motion test "./fakectl move x 1"` says it would hold; `ls` runs with no
hold.

---

## Phase 3: the strip

A new mod, `strip/`, built from the two prototypes the owner approved live
(a pill strip that read other mods' state and hid the old rows; a band with
a meter, launchers, fit levels and a diff pane). It draws one row, orders
the whole band, opens three panes of its own, and reads everything else
from the mods that already own it.

### Task 8: token-weather publishes its totals

The context pane needs the session cost, today's tokens and the month's
total. token-weather keeps them in module variables and its own store,
which no other mod can read.

**Files:**
- Modify: `token-weather/hooks/token-weather.mjs`,
  `token-weather/types/index.d.ts`,
  `token-weather/hooks/token-weather.test.ts`,
  `token-weather/.claude-plugin/plugin.json` (version `0.1.12`),
  `token-weather/PROVENANCE.md` (local change 12)

**Interfaces (produces):** state `{ plugin: 'token-weather', key: 'totals' }`:

```ts
export type TokenWeatherTotals = {
  costUsd: number | null                                  // the session cost the row shows
  today: { ymd: string; tokens: number } | null            // what the row's "today" shows
  month: { ym: string; usd: number; tokens: number } | null // what the row's month part shows
  readAt: number
}
```

A reader shows `today` only while `today.ymd` is the local day of its own
clock, as the row does; totals are published at a session start and after a
main-loop turn, so a session left idle past midnight still holds
yesterday's sum. *(Added 2026-11-16 after the phase 3 review: the strip's
context pane printed it as today's.)*

- [ ] **Step 1: write the failing test** "totals are published for other
  mods": after `session.start` and one main-loop turn with usage, the
  recorded `state.set` for key `totals` has `costUsd` equal to the usage's
  cost, `today.tokens` equal to the turn's token sum, and `month.tokens` at
  least that.
- [ ] **Step 2: run** `claude plugin test token-weather`. Expected: FAIL.
- [ ] **Step 3: implement** `publishTotals($)`, called wherever
  `recordMonth` runs; it writes the same figures the row draws. Mark it
  `Local change 12 (zehui-mods)`. The row itself does not change.
- [ ] **Step 4: run** the tests. Expected: PASS, the existing tests plus
  this one. validate passes.

### Task 9: the strip's model (pure)

**Files:**
- Create: `strip/hooks/pills.ts`, `strip/hooks/order.ts`
- Test: `strip/hooks/pills.test.ts`, `strip/hooks/order.test.ts`

**Interfaces (produces):**

```ts
// pills.ts
export const C = {
  green: '#a6e3a1', yellow: '#f9e2af', peach: '#fab387', red: '#f38ba8',
  teal: '#94e2d5', mauve: '#cba6f7', sapphire: '#74c7ec', lavender: '#b4befe',
  dim: '#6c7086', surface: '#313244', ink: '#11111b',
} as const
export const CAP_L = ''
export const CAP_R = ''
export const ICON = {
  stop: '', context: '', cache: '', diff: '',
  tests: '', testsFailing: '', agents: '', queue: '',
  system: '', peers: '', health: '',
} as const
export type PillId = 'stop' | 'context' | 'cache' | 'diff' | 'tests' | 'agents' | 'queue' | 'system' | 'peers' | 'health'
export const PILL_IDS: readonly PillId[]   // in exactly that order
export type Facts = {
  stop: { summary: string } | null
  context: { pct: number } | null
  cacheLeftMs: number | null
  diff: number
  tests: { failed: number; total: number } | null
  agents: number
  queue: { count: number; isPaused: boolean }
  sys: { ram: number | null; cpu: number | null } | null
  peers: { count: number; waiting: number }
  health: { text: string } | null
}
export type Seg = { text: string; color?: string }
export type Pill = { id: PillId; isAttention: boolean; color: string; segs: Seg[] }
export type Level = 0 | 1 | 2 | 3
export const WORK_W = 4                       // cells kept for the working pill
export function cellWidth(text: string): number
export function pillsAt(f: Facts, level: Level): Pill[]
export function stripWidth(pills: readonly Pill[]): number
export function fitStrip(f: Facts, columns: number, reserve: number): { level: Level; pills: Pill[] }
export function stripText(pills: readonly Pill[]): string

// order.ts
export const REPLACED = ['sys', 'token-weather', 'handoff', 'cache-clock'] as const
export const ORDER = ['motion-hold', 'breathe', 'strip', 'smart-compact', 'agents', 'goal-meter', 'here', 'queue', 'next', 'images'] as const
export const bareName: (plugin: string) => string
export function arrangeRows<T extends { plugin: string }>(
  rows: readonly T[], o: { showOld: boolean; keepHandoff: boolean },
): T[]
```

**Pill rules.** A pill draws as left cap, body, right cap. Idle: body text
in `color` on `C.surface`, caps in `C.surface`. Attention: body text
`C.ink` bold on `color`, caps in `color`. One space between pills.

| Pill | Shown | Text and colour |
| --- | --- | --- |
| stop | only when `f.stop` | attention, red: `STOP` |
| context | always | level 0: a 10-cell bar (`▰` filled, `▱` empty, at least one filled above 0) and `NN%`; level 1 and up: `NN%`. Under 30 green, under 60 yellow, under 80 peach, from 80 red and attention. No reading: dim `–` |
| cache | always | minutes left, rounded up, `Nm`: teal; under 10 minutes yellow; none left: dim `cold`; no reading: dim `–` |
| diff | always | the count: mauve above 0, else dim |
| tests | always | no run: dim `–`; green: green total; failing: attention, red, `tests F/T` with the failing icon (level 2 and up: `F/T`) |
| agents | always | the count: sapphire above 0, else dim |
| queue | always | the count: lavender above 0, else dim; paused with items: yellow `N paused` (level 2 and up: `N`) |
| system | always | fine: the icon alone, dim; RAM or CPU at 90 or more: attention, red, `RAM 92%`, `CPU 95%` or both (level 3: the numbers alone) |
| peers | always | the count: dim at 0; with waiting peers peach `N · M waiting` (level 2 and up: `N·M`) |
| health | only when `f.health` | attention, red: the text (level 3: its first word) |

`cellWidth`: private-use glyphs and box or block characters count 1, CJK
and fullwidth 2, combining marks 0, emoji 2.

`fitStrip`: the richest level whose width is at most `columns - reserve`.
When level 3 still does not fit, drop idle pills from the right, in this
order: peers, system, queue, agents, tests, diff, cache. Context and any
attention pill are never dropped.

**`arrangeRows`:** when no row's bare name is `strip`, return the rows in
the order received (the strip did not draw, so nothing is hidden or moved).
Otherwise drop rows whose bare name is in `REPLACED`, except: all of them
when `showOld`, and `handoff` when `keepHandoff`. Sort what is left by
position in `ORDER`; a kept old row sorts right after `strip`; any other
plugin comes after, in the order received. The result holds the same
objects, each at most once.

- [ ] **Step 1: write the failing tests.**
  `pills.test.ts`:
  - "a quiet session": every pill but context is dim; no stop, no health.
  - "thresholds": pct 29 green, 30 yellow, 59 yellow, 60 peach, 79 peach,
    80 red and attention.
  - "cache": 59 min 10 s left reads `60m` teal; 9 min `9m` yellow; 0 dim
    `cold`; null dim `–`.
  - "tests": null `–`; `{failed: 0, total: 14}` green `14`;
    `{failed: 2, total: 14}` attention `tests 2/14`.
  - "queue paused", "system both at once" (`RAM 92% CPU 95%`), "peers
    waiting", "health", "stop first".
  - "fit levels": at 200 columns level 0; narrowing drops the bar, then
    the words, then to numbers; each result's width is at most the columns.
  - "overflow drops idle pills from the right": at a width where level 3
    does not fit, peers goes first; context and a failing tests pill stay.
  - "wide characters": `cellWidth('上下文')` is 6; a private-use icon is 1.
  `order.test.ts`:
  - "no strip row, nothing changes": the same array order, the same
    objects.
  - "the four old rows are hidden when the strip drew".
  - "a HANDOFF row with something to act on stays", placed right after the
    strip.
  - "showOld keeps all four", after the strip.
  - "the order table": motion-hold, breathe, strip, smart-compact, agents,
    goal-meter, here, queue, next, images; an unknown plugin last.
  - "a marketplace suffix is ignored": `handoff@zehui-mods` is hidden.
  - "rows are passed by identity": every result element is `===` an input
    element.
- [ ] **Step 2: run** `claude plugin test strip`. Expected: FAIL.
- [ ] **Step 3: implement** `pills.ts` and `order.ts`.
- [ ] **Step 4: run** the tests. Expected: PASS.

### Task 10: session health (pure)

**Files:**
- Create: `strip/hooks/health.ts`
- Test: `strip/hooks/health.test.ts`

**Interfaces (produces):**

```ts
export type Health = { kind: 'ok' } | { kind: 'login' | 'limit' | 'error'; at: number; detail: string }
export type HealthEvent =
  | { type: 'stop-failure'; error: string; at: number }
  | { type: 'turn'; reason: 'answer' | 'aborted' | 'refusal' | 'error'; at: number }
  | { type: 'limits'; limits: readonly { kind: string; percentUsed: number }[]; at: number }
export function healthStep(h: Health, ev: HealthEvent): Health
export function healthText(h: Health): string | null   // 'login expired' | 'limit reached' | 'turn failed' | null
```

**Rules:**

- `stop-failure`: an error in `authentication_failed`,
  `oauth_org_not_allowed`, `account_on_hold`, `verification_required`,
  `cloud_credential_error` gives `login`; `rate_limit` or `billing_error`
  gives `limit`; anything else gives `error`. `detail` is the error name.
- `turn` with `answer` gives `ok`. With `error`: a `login` or `limit` set
  within the last 10 seconds stays; otherwise `error` with the detail `the
  last turn ended on an API error`. `aborted` and `refusal` change nothing.
- `limits`: any window at 100 percent or more gives `limit`, detail
  `<kind> at <N>%`. A `limit` that came from `limits` clears to `ok` when no
  window is at 100 any more.

The engine gives no signal for a Remote Control link, so that condition is
not shown. The README says so.

- [ ] **Step 1: write the failing tests:** one per rule above, plus "a
  refusal does not clear a login failure" and "an answered turn clears
  everything".
- [ ] **Step 2: run.** Expected: FAIL.
- [ ] **Step 3: implement `health.ts`.**
- [ ] **Step 4: run.** Expected: PASS.

### Task 11: the diff recorder and the three panes

**Files:**
- Create: `strip/hooks/diff.ts`, `strip/hooks/panes.tsx`
- Test: `strip/hooks/diff.test.ts`

**Interfaces (produces):**

```ts
// diff.ts
export type DiffLine = { kind: 'hunk' | 'ctx' | 'add' | 'del' | 'note'; text: string }
export type DiffStep = { file: string; tool: 'Edit' | 'Write'; lines: DiffLine[]; adds: number; dels: number }
export const STEP_CAP = 50
export const LINE_CAP = 400
export function hunkHeader(h: { oldStart: number; oldLines: number; newStart: number; newLines: number }): string
export function fromPatch(patch: readonly { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }[]): DiffLine[]
export function fromTexts(before: string, after: string, context?: number): DiffLine[]
export function stepOf(tool: 'Edit' | 'Write', result: unknown): DiffStep | null

// panes.tsx
export const CONTEXT_PANE = 'strip-context'   // title 'Context'
export const SYSTEM_PANE = 'strip-system'     // title 'System'
export const DIFF_PANE = 'strip-diff'         // title 'Last turn'
export type ContextData = {
  pct: number | null; used: number; limit: number; isThreshold: boolean
  categories: { name: string; tokens: number; color: string }[]
  totals: { costUsd: number | null; today: { ymd: string; tokens: number } | null; month: { ym: string; usd: number; tokens: number } | null } | null
}
export type SystemData = {
  reading: { cpu: number | null; ram: { used: number; total: number } | null; battery: { percent: number; isCharging: boolean } | null } | null
}
export type DiffData = { steps: DiffStep[]; sel: number; running: number }
export function drawContextPane($, e, data: ContextData): RenderElement
export function drawSystemPane($, e, data: SystemData): RenderElement
export function drawDiffPane($, e, data: DiffData): RenderElement
```

**Rules:**

- `hunkHeader` gives `@@ -<oldStart>,<oldLines> +<newStart>,<newLines> @@`.
- `stepOf` reads the tool's result object. With a non-empty
  `structuredPatch`: `fromPatch` (a patch line starting with a space is
  `ctx`, `-` is `del`, `+` is `add`, anything else `ctx`; the marker is
  kept in `text`). Else, with `originalFile` a string: `fromTexts` against
  the new content (`result.content` for Write; for Edit the original with
  `oldString` replaced by `newString`, every occurrence when `replaceAll`).
  Else one `note` line `no diff available`. More than `LINE_CAP` lines are
  cut with a `note` saying how many are left out. A result that is not an
  object, or has no `filePath`, gives null.
- `fromTexts` is a line LCS with 1 line of context whose hunk headers use
  the file's true line numbers. A side over 2,000 lines gives one `note`,
  `file too large to diff here`.
- **Context pane:** a head line `Context NN% of the compact window ·
  <used> / <limit>` (or `of the window` when no auto-compact threshold is
  known); one line per category with its name, a 20-cell bar in the
  category's colour and its percent; then `Session cost $X.XX · today N
  tok · <Mon> $X, N tok` from `token-weather.totals`, or `Cost and totals
  need the token-weather mod.` when that state is absent; framed Buttons
  key `ctx-refresh` (`r: refresh`, hotkey `r`) and `ctx-close` (`x: close`,
  hotkey `x`); a dim last line `Twins: /strip context, /strip context
  close`.
- **System pane:** `CPU NN%`, `RAM used/total G`, `Battery NN%` (or
  `charging`), each with a 10-cell bar, green, yellow from 80, red from 90;
  `No reading: the sys mod is not loaded.` when absent; Buttons key
  `sys-btop` (`b: btop`, runs `/sys btop`), `sys-refresh` (`r: refresh`,
  runs `/sys now`), `sys-close` (`x: close`).
- **Diff pane:** a strip of steps ` N basename `, the selected one inverse;
  a header `Step i/n · <tool> · <file> · +A −D`; the lines, add in
  `C.green`, del in `C.red`, hunk in `C.teal`, ctx and note dim; `N edits
  in the running turn, shown when it ends.` while the running turn has
  steps; `No edits in the last turn.` when empty; Buttons key `diff-prev`
  (`p: prev`), `diff-next` (`n: next`), `diff-close` (`c: close`).

- [ ] **Step 1: write the failing tests** in `diff.test.ts`:
  - `hunkHeader({ oldStart: 10, oldLines: 1, newStart: 10, newLines: 3 })`
    is `'@@ -10,1 +10,3 @@'`.
  - "an Edit that adds two lines after line 10": a result whose
    `structuredPatch` is that hunk with lines `[' line 10', '+line 11',
    '+line 12']` gives a step with `adds: 2`, `dels: 0`, first line kind
    `hunk` and text `@@ -10,1 +10,3 @@`.
  - "a new file": Write result with `originalFile: null`,
    `structuredPatch` one hunk `0,0 → 1,2`; header `@@ -0,0 +1,2 @@`.
  - "no patch, texts known": Edit result with an empty patch, a 12-line
    `originalFile` and a change on line 10; the fallback's hunk header
    starts at old line 9.
  - "replaceAll replaces every occurrence" in the fallback.
  - "nothing to go on": empty patch and `originalFile: null` on an Edit
    gives one note line.
  - "long diffs are cut": 500 patch lines give `LINE_CAP` lines and a note.
  - "garbage in": `stepOf('Edit', null)` and `stepOf('Edit', {})` are null.
- [ ] **Step 2: run.** Expected: FAIL.
- [ ] **Step 3: implement `diff.ts` and `panes.tsx`.**
- [ ] **Step 4: run.** Expected: PASS. (The panes are tested through the
  hooks in Task 12.)

### Task 12: the strip mod (wiring)

**Files:**
- Create: `strip/.claude-plugin/plugin.json`, `strip/hooks/hooks.json`,
  `strip/hooks/register.tsx`, `strip/hooks/sources.ts`,
  `strip/hooks/spin.tsx`, `strip/hooks/test-kit.ts`,
  `strip/types/index.d.ts`, `strip/types/peer.d.ts`, `strip/README.md`,
  `strip/PROVENANCE.md`, `strip/.gitignore`, `strip/tsconfig.json`
- Test: `strip/hooks/register.test.tsx`

**Interfaces:**
- Consumes: Tasks 9, 10, 11; state of other mods, each optional:

| Ref (`plugin`.`key`) | Used for |
| --- | --- |
| `token-weather.context`, `handoff.context`, `handoff.clearedAt` | context pill and pane |
| `token-weather.totals` (Task 8) | context pane totals |
| `handoff.isOver`, `handoff.save`, `handoff.offer` | whether the HANDOFF row has something to act on |
| `cache-clock.lastCacheAt`, `cache-clock.now` | cache pill |
| `agents.runs` | agents pill: runs with `status === 'running'` and `kind` absent or `'agent'` |
| `queue.queue` (Task 14) | queue pill: `items.length`, `isPaused` |
| `sys.reading` | system pill and pane |
| `peers.seen` | peers pill: the count; waiting is `status === 'blocked'` |
| `redgreen.runs` (Task 2) | tests pill: `runs.at(-1)` |
| `motion-hold.active` (Task 7) | stop pill |

- Produces: plugin `strip` 0.1.0; command `/strip`; panes `strip-context`,
  `strip-system`, `strip-diff`; band row key `zm-10-strip`; state:

```ts
export type StripUsage = { used: number; limit: number; isThreshold: boolean; readAt: number }
declare module 'claude-code' {
  interface PluginState {
    strip: {
      usage: StripUsage | null
      steps: DiffStep[]; last: DiffStep[]; sel: number
      turnAt: number | null; now: number; clearedAt: number
      health: Health
      isShowingRows: boolean; isPanesClear: boolean
      cacheMinutes: number
    }
  }
}
```

- userConfig: `rows` (string, `hide` or `show`, default `hide`),
  `transparentPanes` (boolean, default `true`). `/strip rows` and
  `/strip panes` change the session's values and keep them in `$.store`
  (keys `rows`, `panes`), which wins over the option at the next start.

**`sources.ts`:** `readFacts($): Promise<{ facts: Facts; sources: Record<PillId, string>; keepHandoff: boolean }>`,
plus `readContextData($): Promise<ContextData>` and
`readSystemData($): Promise<SystemData>` for the panes, from the same refs.
Each value comes from the first source that has one; `sources` says in
words where (for `/strip sources`).

- context: `token-weather.context`, else `handoff.context`, else the
  strip's own `usage`. A reading older than the later of the strip's
  `clearedAt` and `handoff.clearedAt` is skipped. Percent is of the
  auto-compact threshold when the reading has one, else of the window.
- cache: `lastCacheAt + cacheMinutes * 60000 - max(now, cache-clock.now,
  strip.now)`; `lastCacheAt` 0 or absent gives null.
- `keepHandoff`: `handoff.isOver === true`, or `handoff.save.phase` is
  defined and not `'idle'`, or `handoff.offer` is neither null nor
  undefined. It is also true when the state cannot be read: any of the
  three reads threw. `arrangeRows` only ever keeps a HANDOFF row that is
  present, so "unreadable" errs on the side of showing it. A value that
  reads `undefined` was never written and counts as its owner's initial
  value (not over, idle, no offer).
  *Corrected 2026-11-16 after the phase 3 review:* this bullet first
  counted an `undefined` `isOver` as unreadable. handoff writes `isOver`
  only when the fill crosses its threshold or after a clear, so in an
  ordinary session the flag is never written, and the row would have stayed
  under the strip from the first prompt on.

**Hooks in `register.tsx`:**

- `session.start`: register `/strip` (`immediate: true`, hint `sources |
  context | system | diff | open <pill> | rows | panes`); reset `steps`,
  `turnAt`, `health`; load the stored `rows` and `panes`; read own usage
  with `$.session.usage({ breakdown: 'summary' })`; read `cacheMinutes`
  from the `$.config.list()` row `cache-clock.cacheMinutes` (`'5'` gives 5,
  anything else or absence 60); start a 30 second tick that writes `now`.
- `session.measure`: refresh own usage; feed `limits` to `healthStep`.
- `turn.start` (main loop): `turnAt = now`, `steps = []`.
- `turn.complete` (main loop): feed `turn` to `healthStep`; in `finally`,
  when `steps` is not empty set `last = steps` and `sel = 0`; then
  `steps = []`, `turnAt = null`.
- `classic.StopFailure` (main thread: `e.agent_id === undefined`): feed
  `stop-failure` to `healthStep`. Observe only.
- `session.end`: on `clear` or `resume`, 500 ms later set `clearedAt`, zero
  the diff state and re-read usage; otherwise stop the tick.
- `tool.call` with `{ tool: ['Edit', 'Write'] }`: after `next(e)`, when the
  call was applied, push `stepOf(e.tool, res.result)` onto `steps` (newest
  `STEP_CAP` kept). Subagent edits count. An edit applied while no
  main-loop turn runs (`turnAt` is null: a background subagent's) is
  appended to `last` instead, newest `STEP_CAP` kept, so the next
  `turn.start` does not drop it. *(Added 2026-11-16 after the phase 3
  review.)*
- `ui.render` `AbovePrompt`: the strip row. `fitStrip(facts,
  e.props.bodyColumns, turnAt === null ? 0 : WORK_W)`. Each pill is a
  `plain` Button with no hotkey, key `sp-<id>`, whose children are the cap
  and body `Text`s. While `turnAt` is not null a `Client` (key `sp-work`,
  module `./spin.tsx`, props `{ startedAt: turnAt, now, delayMs: 5000,
  frameMs: 150 }`, width `WORK_W`, height 1) sits at the right end.
- `ui.render` `AbovePromptList`: `arrangeRows(e.props.rows, { showOld:
  isShowingRows, keepHandoff })` passed through `next`. Untouched when
  `e.surface !== 'terminal'` or `e.props.hasSurvey`. Its `.catch` passes
  `next(e)`. Should another plugin hook the list too, the engine nests the
  hooks: the strip arranges the rows it is handed and does not undo what a
  hook above it does.
- `ui.render` `Pane` for each of the three pane ids (literal `requestId`s).
- `ui.open`: when `isPanesClear`, the opened id is not `settings` or
  `changes`, and `e.backgroundColor === undefined`:
  `next({ ...e, backgroundColor: 'transparent' })`; else `next(e)`. With
  `.catch(($, e, next) => next(e))`. The strip's own opens pass
  `backgroundColor: 'transparent'` themselves, since a plugin's hook does
  not hear its own call.
- `command.run` `strip`.

**`spin.tsx`** (Client module): draws `WORK_W` blank cells until `delayMs`
have passed since `startedAt`, then a lavender braille frame between caps
on the surface colour, advancing every `frameMs`. It starts
`surface.every` once, while `surface.state` is undefined.

**Pill presses** (a press and `/strip open <pill>` do the same):

| Pill | Action |
| --- | --- |
| stop | run `/motion status` |
| context | open `strip-context` |
| cache | run `/compact-offer` when that command is listed, else `/cache-clock status` |
| diff | open `strip-diff` |
| tests | run `/tests` when listed, else toast `tests: the redgreen mod is not loaded (/strip open tests)` |
| agents | run `/agents-info open` |
| queue | run `/q pane` |
| system | open `strip-system` |
| peers | run `/peer-alarm board` |
| health | toast the health detail and `(/strip open health)` |

An own pane: `$.ui.open` first; when it answers not placed, run the twin
(`/strip context`, `/strip system`, `/strip diff`) from a 20 ms timer and
toast `/<twin> queued until the turn ends`. Another mod's command: from a
20 ms timer; while `turnAt` is not null also toast `/<command> queued until
the turn ends`; an unlisted command toasts `<command> is not in this
session (/strip open <pill>)`.

**`/strip` subcommands:** `sources` (the default: the strip as text, one
line per pill naming its source, and whether old rows are hidden);
`context [close]`; `system [close]`; `diff [prev | next | <n> | close]`;
`open <pill>`; `rows [show | hide]`; `panes [clear | solid]`.

- [ ] **Step 1: write `test-kit.ts`**: `world($, on, shape)` with
  `mock.clock`, a `state.get` hook that answers `{ value, version: 1 }`
  from `shape.peers['<plugin>.<key>']` for any plugin but `strip` (and
  throws for keys listed in `shape.broken`), `session.usage`,
  `config.list`, `command.list` from `shape.commands`, recorders for
  `command.run`, `ui.open` (answering `shape.isPlaced`), `ui.close` and
  toasts, a store in a Map, `edit(result, extra?)` and `write(result)`
  that raise the tool calls, and `bandProps(columns)`, `mountBand`,
  `mountList(rows)`, `mountPane(id)`.
- [ ] **Step 2: write the failing tests** in `register.test.tsx`:
  1. "live values from the other mods": with all owners' state set, the
     drawn pills read context `42%`, cache `37m`, agents `2` (a running
     cron and a running shell in `agents.runs` are not counted), queue
     `3`, peers `4 · 1 waiting`, tests `14`.
  2. "no other mod loaded": every ref undefined; the strip draws context
     from its own usage and every other pill dim; nothing throws.
  3. "a broken owner": `shape.broken` lists `sys.reading`; the strip still
     draws, system dim.
  4. "/strip sources" names `token-weather.context` for context and says
     the old rows are hidden.
  5. "diff counts applied edits only": an applied Edit and Write count; a
     denied one, an errored one and a staged one do not; a subagent's
     counts; after the turn ends the pill reads the turn's count.
  6. "a press opens the context pane": `ui.open` was called with id
     `strip-context`, `focus: true` and `backgroundColor: 'transparent'`.
  7. "not placed falls back to the twin": `isPlaced` false; after 20 ms
     `command.run` was called with `strip` and `context`; the toast names
     `/strip context`.
  8. "the cache pill prefers the compaction offer": with `compact-offer`
     listed it runs that; without, `/cache-clock status`.
  9. "the tests pill follows the last run": `redgreen.runs` ending in
     `{ passed: 12, failed: 2 }` draws attention `tests 2/14`; a press
     runs `/tests`.
  10. "the stop pill follows motion-hold": `motion-hold.active` set draws
      `STOP` first.
  11. "health": `$.classic.StopFailure({ error: 'authentication_failed' })`
      draws `login expired`; a later answered main turn removes it; a
      main turn ending `error` with no stop-failure draws `turn failed`.
  12. "the band list": given rows for sys, token-weather, handoff,
      cache-clock, strip, next and agents, `next` receives strip, agents,
      next, as the same objects.
  13. "a HANDOFF row with a save offer stays": `handoff.isOver` true keeps
      the handoff row, right after the strip.
  13b. "a HANDOFF row whose state cannot be read stays": `shape.broken`
      lists `handoff.isOver` and `handoff.offer`; with a handoff row in the
      list it is kept right after the strip. With every handoff value read
      as idle, or never written at all, the row is hidden.
  14. "nothing is hidden when the strip did not draw": a survey, the
      desktop surface, and a list without a strip row each pass the rows
      on unchanged.
  15. "/strip rows show" keeps the old rows and stores the choice.
  16. "/clear": a `token-weather.context` read before the clear is
      skipped, the strip's own fresh reading is used, and diff reads 0.
  17. "transparent panes": another plugin's `ui.open` with no
      `backgroundColor` reaches the bottom with `'transparent'`; one with
      `'#000000'` is unchanged; id `settings` is unchanged; after
      `/strip panes solid` nothing is added.
  18. "the working pill waits five seconds": during a main turn the
      `Client` is mounted with `delayMs: 5000`; with no turn it is absent
      and the fit uses the full width.
  19. "the context pane shows the totals": with `token-weather.totals`
      set, the pane holds `Session cost $1.25`; without it, the
      needs-token-weather line.
  20. "the diff pane": after the Edit of Task 11's second test, the pane
      holds `@@ -10,1 +10,3 @@`; `diff-next` and `/strip diff next` move
      the selection.
  21. "the system pane": `sys.reading` draws CPU and RAM; `sys-btop` runs
      `/sys btop`.
  22. "the row yields": on a survey and on the desktop surface the strip's
      hook returns `next(e)`.
- [ ] **Step 3: run** `claude plugin test strip`. Expected: FAIL.
- [ ] **Step 4: implement** the manifest, the contracts, `sources.ts`,
  `spin.tsx` and `register.tsx`.
- [ ] **Step 5: run** the tests. Expected: PASS (Tasks 9 to 12 together).
- [ ] **Step 6: write README.md** (the pills and what each reads, the
  panes, `/strip`, how to bring the old rows back, what health can and
  cannot show, the Nerd Font the caps and icons need) **and
  PROVENANCE.md** (ours; pill look in the Catppuccin Mocha palette;
  borrowed ideas named as ideas).
- [ ] **Step 7: verify.** validate and tsc pass (the scratch tsconfig lists
  the real contracts of every mod read). Then prove the fallback: a second
  tsc run in which `queue`, `redgreen` and `motion-hold` are given only as
  stubs lifted from `strip/types/peer.d.ts` must pass too, since that is
  how the strip's gate runs before those mods are in the repo.
  `grep -rn '\$\.http\|\$\.model\|\$\.process' strip/hooks` prints nothing.

**Live smoke:** a session with `--plugin-dir strip` beside the installed
mods: the strip is the only one of the five rows drawn; `/strip sources`
names a cross-mod source for context, system and peers; `/strip rows show`
brings the four old rows back and `/strip rows hide` removes them; after an
edit, `/strip diff` shows the hunk; `/strip context` shows categories and
the totals line; a long reply shows the working glyph after five seconds;
another mod's pane opens with no fill (reported as unverified if the read
cannot tell).

### Task 12b: HERE appears only after a delay

**Files:**
- Modify: `here/.claude-plugin/plugin.json` (version `0.1.1`; userConfig
  `delaySeconds`, number, default `5`), `here/hooks/live.ts`,
  `here/hooks/register.tsx`, `here/hooks/row.tsx`,
  `here/hooks/register.test.ts`, `here/hooks/test-kit.ts`,
  `here/PROVENANCE.md`

**Interfaces:** `live.turnStartedAt: number` (0 when no turn runs).

- [ ] **Step 1: write the failing tests** in `register.test.ts`:
  - "the row waits five seconds into a turn": after `turnStart()` and a
    tool call at 1 second the row is not drawn; with the clock at 5
    seconds it is drawn with `now`.
  - "between turns the row shows as before": after `turnEnd`, the last
    `now` text is drawn at once.
  - "delaySeconds 0 shows at once".
- [ ] **Step 2: run** `claude plugin test here`. Expected: FAIL.
- [ ] **Step 3: implement.** `turn.start` (main loop) sets
  `live.turnStartedAt` from `$.clock.now()` and arms
  `$.clock.after(delaySeconds * 1000, () => $.ui.invalidate('ui.render'))`;
  `session.start`, `turn.complete` and `session.end` reset it to 0.
  `drawRow` passes with `pass()` while `live.isTurnRunning` and less than
  the delay has passed.
- [ ] **Step 4: run** the tests. Expected: PASS, the existing tests plus
  these three. validate and tsc pass.

---

## Phase 4: send-gate

### Task 13: the outbound-send gate (`send-gate/`)

A new mod. In a session that runs without permission prompts, it holds a
tool call that would send a message or an email, or that a local config
names (an app environment change, for example), and shows the target, the
mentions and the dates before the person lets that one call through.

**Files:**
- Create: `send-gate/.claude-plugin/plugin.json`,
  `send-gate/hooks/hooks.json`, `send-gate/hooks/register.tsx`,
  `send-gate/hooks/rules.ts`, `send-gate/hooks/card.tsx`,
  `send-gate/hooks/hold.ts` (a byte-for-byte copy of
  `motion-hold/hooks/hold.ts`), `send-gate/hooks/test-kit.ts`,
  `send-gate/types/index.d.ts`, `send-gate/README.md`,
  `send-gate/PROVENANCE.md`, `send-gate/.gitignore`,
  `send-gate/tsconfig.json`,
  `send-gate/examples/send-gate.example.json`
- Test: `send-gate/hooks/rules.test.ts`,
  `send-gate/hooks/register.test.tsx`

**Interfaces:**
- Consumes: Task 6's kit (copied).
- Produces: plugin `send-gate` 0.1.0; command `/send-gate`; pane id
  `send-gate`; no band row.

```ts
// rules.ts
export type SendKind = 'message' | 'email' | 'notify' | 'site'
export type GateConfig = { gate: string[]; pass: string[] }      // globs on the full tool name
export type GateRead =
  | { status: 'none' } | { status: 'ok'; config: GateConfig; warnings: string[] }
  | { status: 'broken'; error: string }
export function parseGateConfig(text: string | null): GateRead
export function kindOf(tool: string, read: GateRead): SendKind | null
export type Preview = {
  kind: SendKind; tool: string; target: string
  mentions: string[]; dates: string[]; body: string; fields: [string, string][]
}
export function previewOf(kind: SendKind, tool: string, input: Record<string, unknown>): Preview
export type Mode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto' | 'unknown'
export function shouldGate(mode: Mode): boolean                   // bypassPermissions, or unknown

// types/index.d.ts
export type SendSeen = { at: number; tool: string; kind: SendKind; verdict: 'sent' | 'denied' | 'not-gated'; why: string; target: string }
declare module 'claude-code' {
  interface PluginState {
    'send-gate': {
      mode: Mode; modeFrom: 'event' | 'env' | 'settings' | 'none'
      recent: SendSeen[]
      config: { status: 'none' | 'ok' | 'broken'; path: string; gate: number; error: string }
    }
  }
}
```

- userConfig: `timeoutSeconds` (number, default `120`), `config` (string,
  default `""`: the file is then `<HOME>/.claude/send-gate.json`).
- Example config: `{ "gate": ["mcp__deploy__set_env"], "pass": [] }`.

**Rules:**

- **`kindOf`.** A name that does not start with `mcp__` is null. A `pass`
  glob match is null. A `gate` glob match is `site`. Otherwise look at the
  part after the last `__`, lowercased: `slack_send_message`,
  `slack_schedule_message`, `post_message`, `chat_post_message` are
  `message`; `send_email`, `send_mail`, `reply`, `forward`, `send_draft`
  are `email`; `send_message` is `email` when the server part of the name
  matches `/mail/i`, else `message`. Then, on that last part with `_` and
  `-` removed: `createevent`, `updateevent`, `deleteevent`,
  `respondtoevent` and `sharefile` are `notify`, and so is a name that
  contains `comment` and starts with `add`, `create`, `post` or `reply`
  (these reach other people as invitations, share notices or comments).
  Any other name is null, and so is a name containing `draft` other than
  `send_draft`. Tools that publish a document (a page, a canvas) are not
  built in: a site that wants them held names them in `gate`.
- **Broken config:** the built-in rules above still apply, and in addition
  every `mcp__` tool whose last part does not start with one of `get list
  read search fetch query describe find lookup check view show download`
  is `site`. So a site tool the unreadable file would have named is held.
- **`previewOf`.** `target` joins, as `name: value`, whichever of these the
  input has: `channel`, `channel_id`, `channelId`, `to`, `recipient`,
  `recipients`, `cc`, `bcc`, `thread_ts`, `thread_id`, `threadId`,
  `subject`, `attendees`, `emails`, `email`, `calendar_id`, `file_id`,
  `issue_key`, `page_id`. `body` is the first present of `text`, `message`, `body`,
  `content`, `markdown_text`, `html`, cleaned and cut to 600 characters.
  `mentions`: every `<@ID>`, `<!here>`, `<!channel>`, `<!everyone>` and
  `@name` (two or more word characters, not after a word character) in the
  body, unique, in order. `dates`: ISO dates, clock times, weekday names,
  month names followed by a day, and `today`, `tomorrow`, `tonight`, `next
  week`, `EOD`, `EOW` in the body, plus the values of `post_at`, `send_at`,
  `scheduled_time`, `start`, `end`, `start_time`, `end_time` and `date`;
  unique, in order. For kind `site`, `fields` holds
  every scalar argument as `[key, value]`, the value cut to 80 characters
  and shown as `••••` when the key matches
  `/key|token|secret|password|credential/i`.
  *Corrected 2026-11-16 after the phase 4 review.* The key lists above
  were written from snake_case names; the connected tools use other names
  (a calendar event has `startTime`, `endTime`, `calendarId`, `summary`,
  `description`; a mail reply `messageId`, `replyAll`, `htmlBody`; a mail
  send may carry only a `draftId`; an issue comment `issueIdOrKey`,
  `commentBody`), so the card said `Dates none` and `Text none` for calls
  that carried both. Three changes: (1) keys are compared with case, `_`
  and `-` ignored, and the lists gain `calendarid`, `issueidorkey`,
  `draftid`, `messageid`, `replythreadid`, `replyall` (targets);
  `htmlbody`, `commentbody`, `description`, `summary` (bodies); `duedate`
  (dates). (2) `body` is every body value present, joined in the lists'
  order, and mentions and dates are read from all of it. (3) For every
  kind, not only `site`, `fields` holds each argument that no target,
  body or date key used: a scalar as it is, an array or an object as
  compact JSON, cut to 80 characters, secrets masked; so an argument the
  lists do not know is still on the card. When the call carries no body
  key at all the card says `Text not in this call` (a saved draft, for
  example) instead of `Text none`.
  *Corrected again 2026-11-16 after the re-review of that fix.* Listing
  every argument pushed the `Text` line past the eight lines the narrow
  terminal's dialog shows. So: the card's lines are, in order, the tool
  (kinds other than `site`), the subagent line when there is one, `To`,
  `Mentions`, `Dates`, `Text`, and then ONE line `Also k: v · k: v` that
  holds every other argument, cut to 300 characters with the mark; the
  kit's dialog says how many lines it leaves out when a card is longer
  than it shows. In every value shown, a line break (`\n`, `\r`, U+2028,
  U+2029) is drawn as `⏎`, so a value cannot forge a card line. The
  secret mask applies at any depth of an object or a list, to keys
  matching the secret pattern or `authorization`, `bearer` or `cookie`.
  A date given as an object shows its `dateTime` (or `date`) followed by
  its `timeZone`; with any other key it shows as compact JSON. An
  argument that cannot be written as JSON (nested too deep) refuses the
  call rather than showing an empty value.
- **Mode.** At `session.start` read
  `$.settings.read({ key: 'permissions' })` in try/catch (the call is in
  the 2.1.325 types: it resolves one top-level settings key, or
  `undefined`). Only an object with a string `defaultMode` sets `mode`,
  with `modeFrom: 'settings'`; anything else leaves `unknown`.
  Hooks on `classic.UserPromptSubmit`, `classic.PostToolUse` and
  `classic.Stop` (main thread only: `e.agent_id === undefined`) set `mode`
  from `e.permission_mode` with `modeFrom: 'event'`. All three observe and
  return `next(e)`.
  *Corrected 2026-11-16 after the phase 4 review.* `session.start` fires
  again on a hot reload, an enable or a worker respawn, and the settings
  never see a mode set on the command line or with shift+tab, so reading
  them again there put `default` back over a live bypass mode and let
  sends through without a card. The settings are therefore read only
  while no event has named the mode: `session.start` first reads the
  stored `mode` and `modeFrom` (the session's state outlives a reload);
  when `modeFrom` is `event`, that mode is restored and the settings are
  not applied; when the stored state cannot be read, the mode stays
  `unknown`, which is gated. A stored mode that is gated is kept gated
  whatever `modeFrom` says (the two values are written one after the
  other, and a reload between the writes must not open the gate).
  *Added 2026-11-16 after the phase 4 live check.* On a machine where a
  guard plugin keeps the classic events from user plugins, no event ever
  names the mode (see "Not possible in this engine"), and the settings'
  default then decides for every session, also for one a launcher started
  in another mode. So a launcher may state the mode: when the environment
  variable `SEND_GATE_MODE` holds a known mode name at `session.start`
  (read with `$.env.get('SEND_GATE_MODE')`), it sets `mode` with
  `modeFrom: 'env'`. An event wins over it; it wins over the settings; any
  other value is ignored. `modeFrom` is then one of `event`, `env`,
  `settings`, `none`, and `/send-gate status` says `from the launcher's
  SEND_GATE_MODE`. Nothing sets the variable by default.
- **The gate:** `on('tool.call', { tool: /^mcp__/ }, ...)` with the
  fail-closed catch. `kindOf` null: `next(e)`. Mode not gated: record
  `not-gated` and `next(e)`. Otherwise build the card and
  `holder.request`. `'run'` (label `Send once`): record `sent`, `next(e)`.
  Anything else: record `denied` and return
  `{ deny: 'Send Gate held this <word> and did not send it: <whyOf>. Do not retry it unless the user asks you to.' }`,
  where the word comes from a map that is exhaustive over `SendKind`:
  `message`, `email`, `notification` (for `notify`) and `call` (for
  `site`).
- **The card** (`card.tsx`, pane `send-gate`): title `Send Gate`; `Would
  send a message` (or `an email`, `notify people through <tool's last
  part>`, or `call <tool>`); `To <target>`;
  `Mentions <list>` or `Mentions none`; `Dates <list>` or `Dates none`;
  for `site` one line per field; `Text` and the body; Buttons key
  `hold-cancel` (`Cancel`, hotkey `2`, `autoFocus`) and `hold-run` (`Send
  once`, no hotkey); the hint with the twins `/send-gate send` and
  `/send-gate cancel`.
- **`/send-gate`** (`immediate: true`): `status` (default: mode and where
  it came from, config status, a pending hold); `recent` (newest 20);
  `test <tool name>` (its kind, or `not gated`); `tools` (from
  `$.tool.list()`, which in the 2.1.325 types resolves to entries with
  `name`, "what the model calls it by", and `mcp: boolean`: every entry
  with `mcp` true that is not gated and whose last name part does not
  start with a read verb, so gaps in the rules can be seen and named in
  the config; a failed read answers `The tool list could not be read.`);
  `send` and `cancel` (answer the
  pending hold; only for origin `composer` or `bridge`); `reload`.
  *Corrected 2026-11-16 after the phase 4 review:* `send` approves only a
  hold the person can have read: one that is on screen (in the pane or the
  dialog, not waiting behind another) and has been for at least 1.5
  seconds; otherwise it answers `A new hold just appeared: read it, then
  answer again.` and approves nothing. `cancel` needs no such rule, since
  it only refuses. The kit (Task 6) carries the time a hold came on
  screen; motion-hold's `/motion run` follows the same rule.

- [ ] **Step 1: write the failing tests.**
  `rules.test.ts`:

| Input | Expect |
| --- | --- |
| `mcp__claude_ai_Slack__slack_send_message` | `message` |
| `mcp__claude_ai_Slack__slack_schedule_message` | `message` |
| `mcp__claude_ai_Slack__slack_send_message_draft` | null |
| `mcp__claude_ai_Gmail__send_message` | `email` |
| `mcp__claude_ai_Gmail__reply`, `..__forward` | `email` |
| `mcp__claude_ai_Gmail__create_draft` | null |
| `mcp__notes__get_page` | null |
| `Bash` | null |
| `mcp__deploy__set_env` with the example config | `site` |
| the same with `pass: ['mcp__deploy__*']` | null |
| broken config: `mcp__deploy__update_app`, `mcp__deploy__list_apps` | `site`, null |
| `mcp__cal__create_event`, `mcp__cal__respond_to_event`, `mcp__cal__list_events` | `notify`, `notify`, null |
| `mcp__drive__share_file` | `notify` |
| `mcp__issues__addCommentToIssue`, `mcp__issues__getIssueComments` | `notify`, null |
| `mcp__wiki__createPage` | null (not built in) |

  plus: a preview of `{ channel: '#general', text: 'Hi <@U123> and @sam,
  ship by 2026-11-20 or Friday 3:30 pm <!here>' }` has target `channel:
  #general`, mentions `['<@U123>', '@sam', '<!here>']` and dates
  `['2026-11-20', 'Friday', '3:30 pm']`; a 900-character body is cut to
  600; a `site` preview of `{ app: 'demo', API_KEY: 'abc', replicas: 2 }`
  has fields `[['app', 'demo'], ['API_KEY', '••••'], ['replicas', '2']]`;
  `shouldGate` is true for `bypassPermissions` and `unknown` and false for
  the other five.
  `register.test.tsx`:
  1. "bypass mode: a message is held, Send once sends it": mode set by
     `$.classic.UserPromptSubmit({ permission_mode: 'bypassPermissions' })`.
  2. "Cancel refuses" with the deny text; "no answer refuses" after 120
     seconds.
  3. "default mode is not gated": the tool runs with no pane, and `recent`
     says `not-gated`.
  4. "an unknown mode is gated": no event, and the settings read throws.
  5. "the configured default counts until an event says otherwise".
  6. "a draft is never held".
  7. "a subagent's send is held"; "a subagent's event does not set the
     mode".
  8. "/send-gate send needs the person".
  9. "a failing gate refuses".
  10. "the card shows the target, mentions and dates".
  11. "a configured tool is held with its fields, secrets masked".
  12. "narrow terminal: the dialog path", with `Send once` and `Cancel`.
  13. "a calendar invitation is held, with its attendees and times": a
      `create_event` call with `attendees` and `start` shows both on the
      card; cancelled, its deny text contains `held this notification`.
  14. "/send-gate tools lists what is neither gated nor a read": with a
      tool list of one send, one read and `mcp__wiki__createPage`, only
      the last is listed.
- [ ] **Step 2: run** `claude plugin test send-gate`. Expected: FAIL.
- [ ] **Step 3: copy `hold.ts`; implement** `rules.ts`, `card.tsx`,
  `register.tsx`, the manifest and the contract.
- [ ] **Step 4: run** the tests. Expected: PASS.
- [ ] **Step 5: README.md and PROVENANCE.md.** validate and tsc pass.
  `cmp motion-hold/hooks/hold.ts send-gate/hooks/hold.ts` is silent.
  `grep -rn '\$\.http\|\$\.model\|\$\.process\.spawn' send-gate/hooks`
  prints nothing.

**Live smoke** (nothing is ever sent): a scratch config gates one read-only
tool by name; in a bypass-mode throwaway session the model is asked to call
it; the hold appears with the tool name; Cancel refuses it; a second try
with Send once runs the read. `/send-gate status` reports the mode and
where it came from.

---

## Phase 5: the prompt queue

### Task 14: `queue/`

Built from the queue prototype (our own code, in the session scratch
folder; its path is given to the agent). What changes is listed here.

**Files:**
- Create: `queue/.claude-plugin/plugin.json`, `queue/hooks/hooks.json`,
  `queue/hooks/register.tsx`, `queue/hooks/queue.ts`,
  `queue/types/index.d.ts`, `queue/types/peer.d.ts`, `queue/README.md`,
  `queue/PROVENANCE.md`, `queue/.gitignore`, `queue/tsconfig.json`
- Test: `queue/hooks/queue.test.ts`, `queue/hooks/register.test.tsx`

**Interfaces (produces):** plugin `queue` 0.1.0; command `/q`; pane id
`queue`; band row key `zm-85-queue`; state read by the strip:

```ts
export type QueueState = {
  items: string[]            // at most 50, each at most 4,000 characters
  isPaused: boolean
  selected: number
  isSending: boolean         // a submitted prompt whose turn has not started
  waitingOn: '' | 'agents' | 'survey'
}
declare module 'claude-code' { interface PluginState { queue: { queue: QueueState } } }

// queue.ts additions
export const AGENT_RETRY_MS = 5000
export function isAgentBusy(runs: unknown): boolean
```

**Behaviour kept from the prototype:** `/q <text>` and `/q add <text>`
append; `list`, `rm <n>`, `up <n>`, `clear`, `pause`, `resume`, `next`,
`send <n>`, `pane`; a main-loop turn that ends with `reason === 'answer'`
and not aborted sends item 1 from a timer with
`$.prompt.submit({ text, asUser: true })`; any other ending pauses the
queue with the toast `queue paused: last turn did not finish; /q resume`;
a dropped submit puts the item back and pauses; a survey delays the send;
the row shows only while the queue is non-empty; the pane has `j`, `k`,
`x`, `u`, `s`, `c`.

**Changes:**

1. Names: plugin `queue`, pane id `queue`, state ref
   `{ plugin: 'queue', key: 'queue' }`; no `stackRow`, the row is its own
   keyed Box.
2. `isSending` and `waitingOn` live in state, so a hot reload cannot send
   twice. `isSending` clears at a main-loop `turn.start`, and when a submit
   is dropped or fails. *Corrected 2026-11-16 after the phase 5 review:*
   it first also cleared at `session.start`, but that event fires again on
   exactly the reload the flag is meant to survive. `session.start` now
   only cancels a pending automatic send and clears `waitingOn`; a stale
   flag heals at the next main-loop turn.
3. **Never send while an agent runs.** `isAgentBusy(runs)` is true when
   `runs` is an array holding an entry with `status === 'running'` and
   `kind` absent or `'agent'`. An automatic send first reads
   `{ plugin: 'agents', key: 'runs' }`; when busy it sets
   `waitingOn: 'agents'` and retries every `AGENT_RETRY_MS` until the
   queue is empty, paused, or a main turn starts. An absent agents mod
   reads as not busy. Manual sends (`/q next`, `/q send <n>`, the row and
   pane buttons) are not held back. The automatic take re-checks inside
   its state update that it was not cancelled and that no prompt of the
   queue's is on its way, and a manual send cancels a pending automatic
   one before it takes its item, so the two can never both send for one
   turn end. *(Added 2026-11-16 after the phase 5 review.)*
4. The row shows `waiting on agents` in yellow while `waitingOn` is
   `agents`.
5. Both render hooks get the standard `.catch`; the command registration
   sits in try/catch.
6. *(Added 2026-11-16 after the phase 5 review.)* `/q add` refuses a text
   that starts with `/`, answering `Slash commands cannot be queued: type
   them directly.` A slash command starts no model turn, so nothing would
   clear `isSending` and the queue would stall without saying why.

- [ ] **Step 1: copy the prototype's files** into `queue/` and rename as in
  change 1. Run `claude plugin test queue`: the prototype's 15 tests pass
  under the new names.
- [ ] **Step 2: write the failing tests.** `queue.test.ts`: `isAgentBusy`
  is false for `undefined`, `[]`, a finished agent, a running `shell`, a
  running `cron`; true for a running entry with `kind: 'agent'` and one
  with no `kind`. `register.test.tsx`:
  - "an automatic send waits while an agent runs": the turn ends with one
    agent running; nothing is submitted, state says `waitingOn: 'agents'`;
    when the agent's run is finished, the next retry submits item 1.
  - "a manual send goes anyway".
  - "no agents mod: sends as before".
  - "a reload does not send twice": `isSending` true in state, then
    `session.start`: the flag is still true and a turn end sends nothing;
    after a main-loop `turn.start` and that turn's end, item 1 is sent;
    one submit in total.
  - Added after the phase 5 review: "a dropped submit puts the item back
    and pauses" and "a failed submit puts the item back and pauses" (items
    restored in order, `isPaused` true, `isSending` false, `waitingOn`
    empty, the toast, and `/q resume` then a turn end sends it once); "a
    cancelled automatic send takes nothing" (a main-loop `turn.start`, or
    a manual send, lands between the automatic send's read of the agents
    and its take: one submit at most); "an older stored value is filled
    in" (`normalize`); "a session end stops a wait" and "a survey that
    stays ends the wait" ; "a slash command is not queued".
- [ ] **Step 3: run.** Expected: FAIL in the new tests.
- [ ] **Step 4: implement changes 2 to 5.**
- [ ] **Step 5: run.** Expected: PASS, the prototype's 15 tests plus the
  new ones. validate and tsc pass.
  README.md (commands, the rules for when it sends, the gap: a permission
  prompt cannot be seen) and PROVENANCE.md.
- [ ] **Step 6: the strip against the real contract.** No file under
  `strip/` changes in this task, and no test in one mod imports from
  another mod's folder. The check is the gate's own: for this commit, gate
  step 3 re-runs the strip's tsc with `queue/types/index.d.ts` in place of
  the stub. Expected: pass. A failure means `QueueState` here and what the
  strip reads have drifted apart; it is fixed on whichever side departed
  from the interface in this plan before the commit. Only in that case
  does a file under `strip/` join this phase's commit, and the report says
  so. Phases 3 and 5 therefore stay disjoint and may be built in parallel.

**Live smoke:** `/q add say hello in one word`, `/q add say goodbye in one
word`, then any prompt: both run in order after the turn, each marked as
sent by the queue plugin; `/q list` is empty at the end; Esc during a turn
with an item queued pauses the queue with the toast.

---

## Phase 6: comfort

### Task 15: image thumbnails under the sent message (`images/`)

The band row stays as it is. In addition, a small labelled thumbnail row is
placed in the transcript right after the prompt that carried the images.
`UserMessage` exposes no attachments and another mod may replace that row,
so the row is placed with `$.ui.place` and drawn through `Placed`.

**Files:**
- Modify: `images/hooks/register.tsx`, `images/hooks/kit.ts`,
  `images/types/index.d.ts`, `images/.claude-plugin/plugin.json` (version
  `0.3.0`; userConfig `under`, `on` or `off`, default `on`),
  `images/README.md`, `images/PROVENANCE.md`
- Create: `images/hooks/under.tsx`
- Test: `images/hooks/under.test.tsx`, `images/hooks/kit.test.ts`

**Interfaces (produces):**

```ts
// kit.ts additions
export const THUMB_COLUMNS = 12
export const THUMB_ROWS = 6
export const THUMBS_KEPT = 24
export const PLACED_KEPT = 12
export function thumbOf(tile: ImageTile): ImageTile     // at most 12 by 6 cells, via shrinkTile
// state additions under `images`
placed: Record<string, { tags: number[]; at: number; done?: true }>   // place id -> its tags; done once its run ended or was stopped
thumbs: Record<string, ImageTile>                         // tag number -> thumbnail
under: '' | 'on' | 'off'
```

**Behaviour:**

- For a person's prompt with `[Image #n]` tags, when `under` is on, the mod
  calls `$.ui.place({ id })` and records the id with its tags in `placed`
  (newest `PLACED_KEPT` kept). *Corrected 2026-11-16 after the phase 6
  review, in four points:*
  - **The id** is `img-<stamp>-<run>`, where `<stamp>` is the clock at this
    load's `session.start` in base 36 and `<run>` the run counter. The
    counter alone restarts at 0 on a hot reload while older rows still
    stand in the transcript, and the same id would answer an old row.
  - **The moment** is where the existing code starts `runBatch`; for a
    prompt typed over a running turn it is the next main-loop
    `turn.start`, when that prompt joins the transcript, not the 10 ms
    timer (which would put the row above its own prompt). When the engine
    delivers such a prompt into the running turn, no turn of its own
    starts: the row is then placed 1.5 seconds after that turn's
    `turn.complete`, below its answer, so it is never left for the
    person's next prompt. The grace is there because a prompt held for a
    turn of its own starts that turn just after the running one ends, and
    its `turn.start` must be the one to place the row; a prompt sent with
    `wait` is left to its own turn however late it starts. The mod
    does not hook `turn.step` to place it at the next model request: a
    hook on that streaming event would stand in every model response of
    every session.
  - **The band's switches do not reach the row:** with `/img off` or the
    `auto` option off and `under` on, the tags are still noted and the
    tiles are built for the row only; nothing is added to the band.
  - **A run that ends or is stopped** (a newer prompt, `/img off`,
    `/img clear`) sets `done` on its `placed` entry.
- Each tile the pipeline builds is also stored as `thumbs[n] =
  thumbOf(tile)` (newest `THUMBS_KEPT` kept).
- `on('ui.render', { component: 'Placed' }, ...)` in `under.tsx`: passes
  with `next(e)` unless the surface is the terminal, the row's plugin
  (bare name) is `images` and its id is in `placed`. It draws a row keyed
  `img-under`: for each tag a column with a `Raster` keyed
  `img-under-<n>` when the thumbnail has cells, and a dim caption `[Image
  #n] WxH`, or `[Image #n] …` while the tile is not built yet. Once the
  row's entry is `done`, a tag with no thumbnail (never built, or dropped
  from `thumbs` since) reads `[Image #n]` with no ellipsis, so a row never
  claims to be loading for good.
- `/img under on | off` sets `under` and stores it (store key `under`).
  `/img off` and the `auto` option keep their meaning for the band row
  only.
- `session.end` with `clear` or `resume` empties `placed` and `thumbs`.

- [ ] **Step 1: write the failing tests.** `kit.test.ts`: `thumbOf` of a
  24 by 12 tile is 12 by 6; of a 10 by 4 tile is unchanged; of a text-only
  tile is itself. `under.test.tsx`:
  - "a person's prompt with an image places a row": `ui.place` was called
    once with an id starting `img-`.
  - "the caption comes first, the picture when it is ready": mounted
    before the tile is built the row holds `[Image #1] …` and no Raster;
    after, a Raster `img-under-1` of at most 12 by 6 and `[Image #1] 800x600`.
  - "under off places nothing"; "a plugin's prompt and a subagent's place
    nothing".
  - "another plugin's placed row is passed on"; "the desktop surface is
    passed on".
  - "old rows are forgotten": after 13 prompts with images, `placed` holds
    12 ids.
  - Added after the phase 6 review: "the band off still places a row"
    (`/img off`, and the `auto` option off, each with `under` on: one
    place, the thumbnail is built, `tiles` and `shown` do not change);
    "an id never repeats after a reload" (13 rows, a second
    `session.start` at a later clock, one more prompt: its id was never
    placed before); "a stopped run stops claiming to load" (two images,
    a second prompt before the second tile: the first row's second
    caption is `[Image #2]`); "a dropped thumbnail stops claiming to
    load"; "a prompt typed over a turn is placed when its turn starts";
    "a prompt typed over a turn that only ends is placed at its end"; "a
    model request of the running turn places nothing"; "under off keeps
    the rows already placed".
- [ ] **Step 2: run** `claude plugin test images`. Expected: FAIL.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run.** Expected: PASS, every existing test and the new
  ones. validate and tsc pass.

**Live smoke:** not possible without a pasted image; the report marks the
on-screen position of the row as unverified and says how to check it
(paste an image, send, look under the prompt).

### Task 16: the mascot behaviour ladder (`agents/`)

Today a card's pose is a pure function of status and time: it changes the
moment the status flips, the bob follows the wall clock, and a finished
card shows a celebration pose for as long as it exists, including after a
reload. The ladder: a reaction cuts in at once and lasts three seconds; an
ambient change waits for the clip to end; the clip clock restarts only
when the pose changes; a reaction is made only by an observed event.

Mascots stay `Raster` sprites drawn by the hooks: a Client module cannot
draw a `Raster`.

**Files:**
- Create: `agents/hooks/ladder.ts`
- Modify: `agents/hooks/register.tsx`, `agents/hooks/skin.tsx`,
  `agents/hooks/kit.ts`, `agents/hooks/mascots.ts`,
  `agents/types/index.d.ts`, `agents/hooks/skin.test.tsx`,
  `agents/hooks/register.test.ts`, `agents/.claude-plugin/plugin.json`
  (version `0.5.0`), `agents/README.md`, `agents/PROVENANCE.md`
- Test: `agents/hooks/ladder.test.ts`

**Interfaces (produces):**

```ts
// ladder.ts
export const CLIP_MS = 2000
export const REACT_MS = 3000
export type ReactionKind = 'finished' | 'error' | 'tool-error'
export type MascotRec = {
  pose: string; clipAt: number
  reaction?: { kind: ReactionKind; pose: string; at: number; until: number }
}
export function settle(rec: MascotRec | undefined, wanted: string, at: number): MascotRec
export function react(rec: MascotRec | undefined, kind: ReactionKind, pose: string, at: number): MascotRec
export function shown(rec: MascotRec, at: number): { pose: string; isBobbed: boolean; isReacting: boolean }
export function isPending(rec: MascotRec, wanted: string, at: number): boolean
// mascots.ts additions
export const REST_DONE = 'with-success-checkmark'
export const REST_ERROR = 'error-state-pixel'
// state addition under `agents`
mascots: Record<string, MascotRec>      // run id -> record; 'main' for the hub card
```

**Rules:**

- `settle`: no record gives `{ pose: wanted, clipAt: at }`. A reaction
  with `at < until` leaves the record as it is. A reaction that is over is
  dropped and the pose becomes `wanted` with `clipAt = reaction.until`.
  With no reaction: the same pose returns the same object; a different
  pose switches only once the current clip has run in full
  (`at - clipAt >= CLIP_MS`), with `clipAt` set to the latest clip
  boundary at or before `at`; before that the record is unchanged.
- `react`: keeps `pose` and `clipAt` (or starts them at `pose` and `at`)
  and sets `reaction` to `{ kind, pose, at, until: at + REACT_MS }`.
- `shown`: during a reaction, the reaction's pose, bobbed on the odd half
  clips counted from `reaction.at`; otherwise the record's pose, bobbed on
  the odd half clips counted from `clipAt`.
- **The wanted ambient pose** (`kit.ts`): running, waiting and shell poses
  as today; a finished run `REST_DONE`; an errored run `REST_ERROR`. The
  celebration and error pools are used by reactions only.
- **Who reacts:** the existing running-to-ended edge in `turn.complete`
  and in `endShell` (`finished` with `donePose(id)`, `error` with
  `errorPose(id)`); and a new `tool.call` observer with the standard
  `.catch`: after `next(e)`, when the result has `isError === true` and no
  `deny`, the running card of `e.agentId` (or `main`) reacts `tool-error`
  with `errorPose(id)`. It returns the result untouched.
- **The tick** settles every card's record once a second and keeps running
  while any record is reacting or pending. `session.start` creates no
  reaction.
- **Drawing** (`skin.tsx`): pose and bob come from `shown`. A rested pose
  never bobs. The amber pulse shows only during an `error` reaction.
  Reduced motion stops every bob and pulse, as today.

- [ ] **Step 1: write the failing tests.** `ladder.test.ts`:
  - "first sight": `settle(undefined, 'a', 1000)` is `{ pose: 'a', clipAt: 1000 }`.
  - "the same pose keeps its clip": `settle(rec, rec.pose, t)` returns
    `rec` itself.
  - "a change waits for the clip": from `{ pose: 'a', clipAt: 0 }`, wanted
    `'b'` at 1500 is unchanged; at 2000 it is `{ pose: 'b', clipAt: 2000 }`;
    at 4300 it is `{ pose: 'b', clipAt: 4000 }`.
  - "a reaction cuts in at once": `shown(react(rec, 'finished', 'c', 500), 500)`
    has pose `'c'` and `isReacting: true`.
  - "a reaction lasts three seconds, then rests": at 3499 still `'c'`;
    `settle` at 3500 with wanted `'r'` is `{ pose: 'r', clipAt: 3500 }`.
  - "the bob follows the clip": not bobbed in the first second after
    `clipAt`, bobbed in the second.
  `skin.test.tsx` and `register.test.ts`:
  - "a finish reacts, then rests": at the finish the card's Raster is
    `donePose(id)`; three seconds later it is `REST_DONE`, not bobbed.
  - "a reload celebrates nothing": with a finished run in state and no
    record, a second `session.start` and a draw give `REST_DONE` and no
    reaction in state.
  - "a tool error reacts on the running card" and the tool's result is
    returned unchanged.
  - "running to waiting switches at a clip boundary".
  - "reduced motion draws no bob".
  Update the existing assertions that expect a finished card to keep its
  `donePose`: they now hold only inside the reaction window.
- [ ] **Step 2: run** `claude plugin test agents`. Expected: FAIL.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run.** Expected: PASS. validate and tsc pass. In the
  README, correct the two passages that name the wrong shell and codex
  poses, and describe the ladder.

**Live smoke:** two slow subagents in a throwaway session with the pane
open: the cards draw; when one ends, `/agents-info` still answers. The
look of the reaction is reported as unverified.

---

## Phase 7: the file tree

### Task 17: `filetree/`

A small tree of the working folder in a pane: folders open and close, git
marks changed files, and the files touched this turn are listed on top. No
preview, no watcher process, no keybinding file.

**Files:**
- Create: `filetree/.claude-plugin/plugin.json`,
  `filetree/hooks/hooks.json`, `filetree/hooks/register.tsx`,
  `filetree/hooks/tree.ts`, `filetree/hooks/pane.tsx`,
  `filetree/hooks/test-kit.ts`, `filetree/types/index.d.ts`,
  `filetree/README.md`, `filetree/PROVENANCE.md`, `filetree/.gitignore`,
  `filetree/tsconfig.json`
- Test: `filetree/hooks/tree.test.ts`, `filetree/hooks/register.test.tsx`

**Interfaces (produces):** plugin `filetree` 0.1.0; command `/tree`; pane
id `filetree`, title `Files`.

```ts
// tree.ts
export type Entry = { name: string; kind: 'file' | 'dir' | 'other' }
export type Row = {
  path: string; name: string; depth: number; kind: 'file' | 'dir'
  isOpen: boolean; mark: string; touch: '' | 'read' | 'write'; more: number
}
export const IGNORE = ['.git', 'node_modules', '.DS_Store', '__pycache__', '.venv', 'dist', 'build', 'target'] as const
export const DIR_CAP = 200
export const ROW_CAP = 400
export const DEPTH_CAP = 8
export function sortEntries(entries: readonly Entry[]): Entry[]
export function visibleRows(listed: Record<string, Entry[]>, open: readonly string[], git: Record<string, string>, touched: Record<string, 'read' | 'write'>): Row[]
export function parsePorcelain(text: string): Record<string, string>
export function touchOf(tool: string, input: Record<string, unknown>, root: string): { path: string; kind: 'read' | 'write' } | null
// state
declare module 'claude-code' {
  interface PluginState {
    filetree: {
      root: string; open: string[]; listed: Record<string, Entry[]>
      git: Record<string, string>; touched: Record<string, 'read' | 'write'>
    }
  }
}
```

Paths in state are relative to `root`, with `''` for the root itself.

**Rules:**

- `sortEntries`: folders first, then by name without regard to case;
  names in `IGNORE` and entries of kind `other` are left out.
- `visibleRows`: the root's entries, and under every open folder its
  listed entries, depth first, to `DEPTH_CAP`. A folder with more than
  `DIR_CAP` entries shows the first `DIR_CAP` and sets `more` on the last
  row. The whole list stops at `ROW_CAP`. A file's `mark` is its git code;
  a folder's is `•` when anything under it has one.
- `parsePorcelain`: one entry per line of `git status --porcelain`, the
  code trimmed (`M`, `A`, `D`, `??`, `R`); a rename keeps the new path; a
  quoted path is unquoted.
- `touchOf`: `Read` is `read`; `Edit`, `Write` and `NotebookEdit` are
  `write`; the path is `file_path` (or `notebook_path`) made relative to
  `root`; a path outside `root` gives null.
- **Hooks:** `session.start` (register `/tree`, set `root` from
  `$.session.cwd()`, clear `touched`); main-loop `turn.start` (clear
  `touched`); `tool.call` with `{ tool: ['Read', 'Edit', 'Write',
  'NotebookEdit'] }`, observing after `next(e)` (a write wins over a
  read); main-loop `turn.complete` (refresh git when the pane is open);
  `command.run`; `ui.render` `Pane`.
- **Listing:** `$.fs.list(<absolute folder>)` when the pane opens (the
  root) and when a folder is opened. A failed listing gives an empty
  folder.
- **Git:** `$.process.run(['git', '-C', root, 'status', '--porcelain'], { timeoutMs: 3000 })`;
  a failure or a non-zero exit gives no marks.
  *Added 2026-11-16 after the phase 7 review, three points:* the run sets
  `env: { GIT_OPTIONAL_LOCKS: '0' }` (the engine lays it over the host's
  environment), so a status read at a turn's end never takes the index
  lock from a `git add` or `git commit` that a background task is running;
  at most `MARK_CAP = 5000` marks are kept, the head line then reading
  `5000+ changed`, and the marks are indexed once per read (the folders
  that hold a change, the untracked folders) instead of being scanned for
  every row drawn; and an untracked folder that is the session folder
  itself or one of its parents marks everything in the tree as untracked.
- **The pane:** a head line `Files · <root's name> · N changed · M touched
  this turn`; when anything was touched, a block `Touched this turn` with
  up to 8 paths, writes first; then the rows: a folder is a `plain` Button
  keyed `ft-<path>`, labelled `▸ name/` or `▾ name/`, pressing it toggles
  it; a file is a `Text`; marks `M` yellow, `A` and `??` green, `D` red; a
  written file peach and bold, a read file sapphire; `… N more` where
  `more` is set; framed Buttons key `tree-refresh` (`r: refresh`) and
  `tree-close` (`c: close`); a dim line of twins.
- **`/tree`:** bare opens the pane (`focus: true`); `close`; `refresh`;
  `toggle <path>`.

- [ ] **Step 1: write the failing tests.** `tree.test.ts`: sorting and
  ignoring; nesting under open folders only; the depth and row caps and
  `more`; a folder mark when a child is changed; `parsePorcelain` of
  `' M a.txt'`, `'?? new/'`, `'R  old.txt -> new.txt'` and
  `'"sp ace.txt"'`; `touchOf` for the four tools, a path outside the root,
  and a tool it does not know. `register.test.tsx`: opening lists the root
  through `fs.list`; pressing a folder Button lists and opens it, pressing
  again closes it; `/tree toggle src` does the same; a Read then a Write of
  one file shows it as written; a new main turn clears the block; git
  marks are drawn and a failing `git` draws none without throwing;
  `tree-refresh` lists again; the desktop surface is passed on.
- [ ] **Step 2: run** `claude plugin test filetree`. Expected: FAIL.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run.** Expected: PASS. validate and tsc pass. README.md and
  PROVENANCE.md (ours; the idea of a tree with touched files named as an
  idea).

**Live smoke:** `/tree` in the scratch project lists its files; after an
edit the file is under `Touched this turn` and carries `M`.

---

## Task 18: repo documents (the orchestrator, at each commit)

- [ ] `.claude-plugin/marketplace.json`: one entry per new mod, in the
  existing shape (`name`, `source`, `description`, `author`, `license`,
  `category: "productivity"`, `tags`, and `repository` for a fork):

| Name | Author | Licence | Repository |
| --- | --- | --- | --- |
| `skins` | hellosverre | MIT | `https://github.com/hellosverre/claude-skins` |
| `redgreen` | hellosverre | MIT | `https://github.com/hellosverre/redgreen` |
| `smart-compact` | hellosverre | MIT | `https://github.com/hellosverre/smart-compact` |
| `breathe` | Linxuan | MIT | `https://github.com/linxuan-sys/claude-breathe` |
| `motion-hold`, `strip`, `send-gate`, `queue`, `filetree` | Zehui Lin | MIT | none |

- [ ] `README.md`: a row in the Mods table for each new mod (forks say
  "Fork of <upstream> at <tag>, MIT; see its PROVENANCE.md"); the "Band
  stack order" section rewritten for the strip's order table and
  `/strip rows`; the sentence that says an edit needs no reinstall
  replaced by the version-bump and `claude plugin update` rule.
- [ ] `ROADMAP.md`: this rework moved to Done as each phase lands; under
  Next: the agents pane's messages view, a stop command for motion-hold's
  local config, and a look at what the organization guard's skipped
  events cost the existing mods; the cross-pane approval alarm moved to
  Not planned.
- [ ] `plans/TIMELINE.md`: one line per shipped mod version.
- [ ] Outside the repo, before the Phase 2 and Phase 4 installs: write
  `~/.claude/motion-hold.json` and `~/.claude/send-gate.json` from the
  machine's own session history (hosts, command patterns, tool names).
  They are never staged; the gate's company-term scan would catch them.
- [ ] Outside the repo, after the last phase: correct the local mods skill
  (band rows are ordered through `AbovePromptList`, not `stackRow`; the
  types path follows the engine version; a gate's catch is fail-closed; a
  Client has no `Raster`).

## Not possible in this engine, or left out on purpose

- **Remote Control link state** for the health pill: the engine has no
  event or field for it.
- **Seeing a permission prompt** (for the queue and for a mascot
  reaction): no event or field.
- **The live permission mode, under a guard plugin.** Found in the phase 4
  live check, 2026-11-16: a guard plugin of a higher tier (an
  organization's security plugin) stands on the classic hook events and
  passes them on past user plugins, so `classic.UserPromptSubmit` and
  `classic.Stop` never reach send-gate, and its mode stays whatever the
  settings' `permissions.defaultMode` says. With a default of
  `bypassPermissions` every session is gated, also one started in another
  mode; with any other default a session switched into bypass is not
  gated. The same guard may leave the strip's health pill without
  `classic.StopFailure` (not observed: no turn failed during the check);
  a failed turn then reads `turn failed`, without the login or limit
  detail. Nothing here works around the guard.
- **Mascots in a Client module:** a Client cannot draw a `Raster`. The
  Client technique is used by the strip's working pill and by the
  breathing band.
- **The skin's three organization-skipped hooks** are not replaced.
- **A stop command** for motion-hold is left unset in the local config
  until the owner supplies one; until then the STOP row is an indicator.
- **The agents pane's messages view** and **the cross-pane approval
  alarm** are not part of this plan.

## Held back and deferred

- Phases 2 and 4 were held back on 2026-11-16 after the two fix rounds this
  plan allows: the last check of the matcher still confirmed one high
  finding and eleven smaller ones, all in `motion-hold/hooks/match.ts`
  (the gate, the card and the hold kit were clean), and send-gate waited
  with it, since its `hooks/hold.ts` is a copy of the kit whose home and
  tests are in motion-hold. The owner then approved a third, narrow fix
  round with a stop rule (see "Task 5, third correction"). Its one check
  confirmed no high finding, so both phases landed the same day, and the
  notes that said motion-hold was "not in this repo yet" are gone.
- Closed 2026-11-17 by motion-hold 0.1.1
  (`plans/2026-11-16-motion-hold-0.1.1.md`): the nine findings that the
  matcher's last check left open in 0.1.0 (no high; four medium, five low)
  are fixed there, each pinned by a test, but for two spellings after
  signal 0 that the mod's README lists. They were: an assignment that
  opens a group behind `time -p`; the step budget that gave up at 14
  levels of a single quote nested in `${...}`; the room that values newly
  carried as weak spent; a hold put together from a carried value that
  passed under a limit with no configured host named; more spellings that
  hid a later signal option after signal 0; a `${ command; }` nested in
  another `${...}`; and very long commands that took quadratic time. What
  the check of 0.1.1 left in turn is marked in that plan.
- TEMP(2026-11-16, until: queue 0.1.1): two low findings of the queue's last
  check stay open. A `/q clear`, or any other act that empties the queue,
  that lands while the automatic take's state write is in flight brings the
  taken item back. A put-back whose state write fails loses the item
  without a toast. Both need a window of a few milliseconds or a state
  write that fails.
- TEMP(2026-11-16, until: send-gate 0.1.1): one low finding of send-gate's
  last check stays open. When a write of the permission mode to the session
  state fails outright and the mod is reloaded before the next mode event,
  the launcher's variable or the settings can put a mode that is not gated
  back over a bypass mode an event had named, until the next event.

## Phase ledger

Filled in as phases land.

| Phase | Commit | Pushed | Notes |
| --- | --- | --- | --- |
| 0 Housekeeping | `bfada59` | yes | spec, plan, band-row tests for engine 2.1.325 |
| 1 Forks | `c83efaf`, `8a27477`, `ee57d20`, `8c1f29f` | yes | skins, redgreen, smart-compact, breathe |
| 2 Motion-hold | `89c4195` | yes | motion-hold 0.1.0, after a third fix round the owner approved; findings of its check deferred |
| 3 Strip | `3f860fd`, `699d746`, `f2df7d8` | yes | token-weather 0.1.12, strip 0.1.0, here 0.1.1 |
| 4 Send-gate | `b7dafff` | yes | send-gate 0.1.0; one low finding deferred |
| 5 Queue | `9a0e403` | yes | queue 0.1.0; two low findings deferred |
| 6 Comfort | `439023a`, `dc80e01` | yes | images 0.3.0, agents 0.5.0 |
| 7 File tree | `def2ebd` | yes | filetree 0.1.0 |
