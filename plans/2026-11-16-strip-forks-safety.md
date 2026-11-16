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
  defined and not `'idle'`, or `handoff.offer` is not null. It is also true
  when the state cannot be read: any of the three reads threw, or
  `handoff.isOver` came back `undefined`. `arrangeRows` only ever keeps a
  HANDOFF row that is present, so "unreadable" errs on the side of showing
  it.

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
  `STEP_CAP` kept). Subagent edits count.
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
      as idle, the row is hidden.
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
      mode: Mode; modeFrom: 'event' | 'settings' | 'none'
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
- **Mode.** At `session.start` read
  `$.settings.read({ key: 'permissions' })` in try/catch (the call is in
  the 2.1.325 types: it resolves one top-level settings key, or
  `undefined`). Only an object with a string `defaultMode` sets `mode`,
  with `modeFrom: 'settings'`; anything else leaves `unknown`.
  Hooks on `classic.UserPromptSubmit`, `classic.PostToolUse` and
  `classic.Stop` (main thread only: `e.agent_id === undefined`) set `mode`
  from `e.permission_mode` with `modeFrom: 'event'`. All three observe and
  return `next(e)`.
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
   twice. `isSending` clears at a main-loop `turn.start` and at
   `session.start`.
3. **Never send while an agent runs.** `isAgentBusy(runs)` is true when
   `runs` is an array holding an entry with `status === 'running'` and
   `kind` absent or `'agent'`. An automatic send first reads
   `{ plugin: 'agents', key: 'runs' }`; when busy it sets
   `waitingOn: 'agents'` and retries every `AGENT_RETRY_MS` until the
   queue is empty, paused, or a main turn starts. An absent agents mod
   reads as not busy. Manual sends (`/q next`, `/q send <n>`, the row and
   pane buttons) are not held back.
4. The row shows `waiting on agents` in yellow while `waitingOn` is
   `agents`.
5. Both render hooks get the standard `.catch`; the command registration
   sits in try/catch.

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
    `session.start`, then a turn end; one submit in total.
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
placed: Record<string, { tags: number[]; at: number }>   // place id -> its tags
thumbs: Record<string, ImageTile>                         // tag number -> thumbnail
under: '' | 'on' | 'off'
```

**Behaviour:**

- Where the existing code starts `runBatch` for a person's prompt with
  `[Image #n]` tags, and `under` is on, it first calls
  `$.ui.place({ id: 'img-' + generation })` from the same timer, and
  records the id with its tags in `placed` (newest `PLACED_KEPT` kept).
- Each tile the pipeline builds is also stored as `thumbs[n] =
  thumbOf(tile)` (newest `THUMBS_KEPT` kept).
- `on('ui.render', { component: 'Placed' }, ...)` in `under.tsx`: passes
  with `next(e)` unless the surface is the terminal, the row's plugin
  (bare name) is `images` and its id is in `placed`. It draws a row keyed
  `img-under`: for each tag a column with a `Raster` keyed
  `img-under-<n>` when the thumbnail has cells, and a dim caption `[Image
  #n] WxH`, or `[Image #n] …` while the tile is not built yet.
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
- **Mascots in a Client module:** a Client cannot draw a `Raster`. The
  Client technique is used by the strip's working pill and by the
  breathing band.
- **The skin's three organization-skipped hooks** are not replaced.
- **A stop command** for motion-hold is left unset in the local config
  until the owner supplies one; until then the STOP row is an indicator.
- **The agents pane's messages view** and **the cross-pane approval
  alarm** are not part of this plan.

## Phase ledger

Filled in as phases land.

| Phase | Commit | Pushed | Notes |
| --- | --- | --- | --- |
| 0 Housekeeping | | | |
| 1 Forks | | | |
| 2 Motion-hold | | | |
| 3 Strip | | | |
| 4 Send-gate | | | |
| 5 Queue | | | |
| 6 Comfort | | | |
| 7 File tree | | | |
