# Provenance

Vendored 2026-10-19 from https://github.com/anthropics/claude-code-playground,
folder `claude-code/mods/blast-radius` v0.1.0, pinned at commit `569c528`
(2026-10-01). Apache-2.0 (Claude Code DevRel); `LICENSE` copied from the repo
root. Screenshots dropped.

Plan and review evidence: `../plans/2026-10-19-blast-radius-fork.md`.

## Local changes to `hooks/blast-radius.mjs`

1. **Fail closed.** `.catch(($, e, next) => next.called ? next(e) : { deny })`
   on the `tool.call` registration. Upstream had no handler, so a thrown
   classifier let the command run.
2. **No one-key approve.** The Proceed button has no hotkey (upstream: `1`)
   and is drawn framed, right under the summary; Cancel keeps `2` and the
   auto-focus. The pane opens with `focus: true` (the API admits only `true`
   or no key; `false` is refused), so the keys reach it at once: Enter or any
   digit cancels, only Tab + Enter or a click proceeds. Live test 2026-10-19:
   an unfocused pane was unreachable in a herdr split (clicks do not pass
   through, hotkeys need focus), so every hold timed out.
3. **Linear redirect stripping.** `stripTrailingRedirects()` replaces the
   nested-quantifier regex at the old line 147 (possible catastrophic
   backtracking on a long segment, which would fail the guard open).
4. **Fewer false holds.** Any command in `READ_ONLY` (grep, cat, echo, git ...)
   returns before the migration regexes, so `grep 'alembic upgrade'` or a
   commit message is not held.
5. **Visible, shorter hold.** `$.ui.notify` when a hold starts; hold limit
   2 minutes (upstream 10). Hint text in the pane updated to match.
6. **No band fallback.** Where the pane is not placed (narrow herdr splits),
   the hold uses `$.ui.ask` (the engine's AskUserQuestion dialog, options
   Cancel / Proceed) instead of drawing in the AbovePrompt band. First cut
   composed in the band; the live test on 2026-10-19 showed the band occupied
   by a "You should know" survey card plus token-weather, so the buttons never
   appeared and the hold timed out. The dialog always reaches the person;
   dismissing it refuses the command. The AbovePrompt hook is removed.
7. **Spoke opt-out.** `BLAST_RADIUS_OFF=1` in the environment makes the hook
   pass every call through.

8. **Every risky segment.** `classifyAll` collects all risky segments and the
   pane shows one merged report (`[1] ... [2] ...`), so `rm -rf a; rm -rf b`
   cannot show "delete nothing" for the first and hide the second. The Command
   row wraps instead of truncating.
9. **fd-dup redirects.** `stripTrailingRedirects` also strips `2>&1`, `>&2`,
   `2>&-`, so a `)` after them still closes its subshell scope (the first cut
   of change 3 regressed this against upstream).
10. **Linear time.** Redirect stripping works on the last 1024 characters
    only; the trailing-paren strip uses `trimEnd` instead of `\s*[)}]+$`;
    commands over 16000 characters are held unparsed ("too-long") rather
    than classified inside the hook budget.
11. **Opt-out spoofing.** A command whose text names `BLAST_RADIUS_OFF` is
    held ("guard-off") so the model cannot export it for a nested session
    without a human seeing it.
12. **Sanitised display.** Control characters in the command are blanked
    before it reaches the pane or the notification; the notification leads
    with the computed summary and labels the command "as typed".
13. **Narrower read-only exemption.** Only ls/cat/echo/printf/grep/rg/less/
    head/tail and the git subcommands that carry text (commit, log, show,
    grep, tag, diff, status, blame) skip the migration regexes, and only when
    the segment has no `$(`, backtick or `<(`. `find -exec`, `git submodule
    foreach` and `git rebase -x` are still held, as upstream held them.
14. Pane hint text names the real keys for the pane and for the band.

Changes 8-14 came out of a two-lens adversarial review of changes 1-7
(session workflow `wf_3bad389b-195`, 2026-10-19).

Also: `classify`, `classifyAll` and `stripTrailingRedirects` are exported
for tests; the classifier check script is `hooks/classify-check.mjs`
(run `node hooks/classify-check.mjs` from the mod folder; 41 cases incl. timing).

## Rebase recipe

Re-copy the folder from a newer pinned commit, re-apply the changes above
(each is marked `Local change (zehui-mods)` in the source), run
`node hooks/classify-check.mjs` and `claude plugin validate`.
