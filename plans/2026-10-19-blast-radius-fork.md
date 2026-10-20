# Plan: fork blast-radius into zehui-mods with a preview-first hold

**Status: implemented 2026-10-19 14:20, live-verified 15:05** (approved with the 2-minute hold; the 7 planned patches plus 7 more from an adversarial review, all listed in the mod's PROVENANCE.md. Live test in a herdr split: three dry runs timed out before the UI was reachable, fixed by a focused pane with framed buttons and an ask-dialog fallback instead of the band; then Cancel and Proceed both worked.)

## Goal

A destructive-command hold that shows *which files or commits a command would
touch* before it runs, usable in the herdr hub under bypassPermissions, without
stalling unattended spokes or approving on a stray keystroke. Zehui's words:
"比起拒绝，我其实更想看到的是会修改那些文件" (rather than a flat deny, show
what would be modified).

## Source

- `anthropics/claude-code-playground` @ `569c528` (2026-10-01), folder
  `claude-code/mods/blast-radius`, Apache-2.0. Checkout already in the session
  scratchpad under `downloads/playground/src`.
- One hooks module, `hooks/blast-radius.mjs` (528 lines), no dependencies.
- Full review with file:line evidence: session scratchpad `tasks/review3.json`.

## What it does today (kept as is)

| Command | Preview shown |
| --- | --- |
| `rm -r/-f/-rf` | files it would delete, count, total size |
| `git reset --hard` | files with uncommitted changes, diff shortstat |
| `git checkout -- .`, `git restore .` | unstaged files |
| `git clean` | untracked paths from `git clean -n` |
| `git push --force` (and `-f`, `--force-with-lease`, `+ref`) | remote commits the push would drop |
| known migrations | pending migrations from the tool's own status command |

Pane with Proceed / Cancel at 144+ columns; band above the prompt otherwise.

## Patches (7), smallest change each

1. **Fail closed.** Add `.catch(($, e, next) => next.called ? next(e) : { deny: "Blast Radius failed; refusing" })` to the `on("tool.call", { tool: "Bash" }, ...)` registration (`:27`). Today a thrown classifier skips the hook and the command runs.
2. **No one-key approve.** Open the pane with `focus: false` (`:57`) and drop the bare-digit `1` hotkey on Proceed (`:521`). Cancel keeps its hotkey. Proceed is a click or Tab + Enter.
3. **ReDoS guard.** Rewrite the redirect-strip regex at `:147` without nested ambiguous quantifiers; it runs on every Bash call and a pathological string would exhaust the 10 s hook budget and fail open.
4. **Fewer false holds.** Consult `READ_ONLY` before the migration regexes and skip `git commit -m "..."` bodies (`:250-265`), so `grep alembic upgrade` and a commit message are not held.
5. **Visible, shorter hold.** `$.ui.notify("Blast Radius: holding <cmd>")` when a hold starts; hold limit 2 minutes instead of 10 (`:20`).
6. **Band etiquette.** The band fallback yields on `e.props.hasSurvey` and composes: report on top, `await next(e)` nested beneath (same shape as token-weather's patch).
7. **Spoke opt-out.** `if (await $.env.get("BLAST_RADIUS_OFF") === "1") return next(e)` at the top of the hook. herdr spokes run auto mode already; an unattended hold there only stalls. Add `BLAST_RADIUS_OFF=1` to the spoke launch line in the herdr-setup POLICY.

Out of scope: widening the classifier (`bash -c`, `xargs rm`, `find -delete`
stay uncaught, as upstream documents). This is a preview net, not a sandbox.

## Steps

1. `cp -R <checkout>/claude-code/mods/blast-radius ~/.claude/mods/blast-radius`, copy the repo-root `LICENSE` in, remove `.claude-plugin/types/`.
2. Apply patches 1-7. Write `PROVENANCE.md` pinned to `569c528` listing each.
3. Add a `hooks/classify.test.ts` covering: a read-only grep mentioning `alembic upgrade` is not held; `rm -rf build` is; the redirect-strip regex finishes on a 10 kB adversarial string. Run `claude plugin test ~/.claude/mods/blast-radius`.
4. `claude plugin validate ~/.claude/mods/blast-radius`.
5. Live test in a throwaway repo at 144+ columns: ask for `rm -rf build`; expect a pane listing 2 files, Cancel focused, no `1` hotkey; Cancel returns a deny Claude reads. Repeat in a narrow pane: report appears as a row under the token-weather band. `BLAST_RADIUS_OFF=1 claude ...`: no hold.
6. Add the marketplace entry and README row, `claude plugin install blast-radius@zehui-mods --scope user`.
7. Append the ship line to `~/.claude/mods/plans/TIMELINE.md`.

## Open question for review

Patch 5's 2-minute limit: long enough to read a 10-file list and decide, short
enough that a forgotten hold in a background pane does not block for long.
Say if you want longer.

## Follow-up decision 2026-10-19 15:50

A "show what any command would modify" reshape (shorter countdown, post-run
touched-files report, wider classifier) was proposed and declined: the mod
stays as shipped, destructive commands only, 2-minute countdown.
