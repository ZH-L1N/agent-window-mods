# Provenance

- **Source:** https://github.com/hellosverre/smart-compact
- **Tag:** `v0.3.2`
- **Commit:** `ccecf5f8c5449573c00122d6c5fc237fa83b23bf`
- **Archive:** `https://codeload.github.com/hellosverre/smart-compact/tar.gz/refs/tags/v0.3.2`,
  sha256 `95da63165029254ee3047b73adf5b5350e49da2fe684c9510e2b2032395f6b33`
- **Licence:** MIT, "Copyright (c) 2026 hellosverre"; `LICENSE` copied unchanged.
- **Imported:** 2026-11-16

Copied from upstream: `.claude-plugin/plugin.json`, `hooks/hooks.json`,
`hooks/register.tsx`, `hooks/signals.ts`, `hooks/backup.ts`,
`types/index.d.ts`, `tests/smart-compact.test.ts` and `LICENSE`. Nothing else
(no nested `marketplace.json`, demo script, media or upstream README).
`README.md`, `.gitignore` and `tsconfig.json` are written fresh.
`hooks/signals.ts` and `hooks/backup.ts` are unchanged.

## Local changes

Each changed site in a source or test file carries a comment
`// Local change N (zehui-mods): <what>`. JSON takes no comments, so the
manifest edits are listed here only.

1. **Backup off by default.** Manifest: the `backup` option's `default` is
   `false` (upstream `true`). `hooks/register.tsx` reads it as
   `options.backup === true`, so a missing value also means off. Upstream
   copied the whole transcript with `sh -c sed ...` before every compact.
   Tests: the backup test sets `{ options: { backup: true } }`; new test
   "backup is off by default".
2. **Separator characters.** The offer's dim text held two U+FFFD characters
   where separators belong; each is now `·` (U+00B7). Test: "the offer
   separates its parts with a middle dot".
3. **`/compact-offer`.** `session.start` registers the command (inside
   try/catch); a `command.run` hook reads the context percent, shows the offer
   with `source: 'manual'` and reason `You asked` at any fill, and answers
   `Compaction offer shown at <percent>% context.` A failure answers with a
   text pointing at `/compact`. `Suggestion['source']` in `types/index.d.ts`
   gains `'manual'`, whose lead text is `Compact now?`. The test world answers
   `command.register`. Test: "/compact-offer shows the offer at any fill".
4. **Cache lifetime default.** Manifest: `cacheTtlMinutes` default `60`
   (upstream `5`), to match the one-hour cache this repo's cache-clock
   assumes. The nine upstream timer tests set `cacheTtlMinutes: 5`, so they
   keep testing upstream's timings instead of failing or passing vacuously.
   Test: "the cache lifetime defaults to 60 minutes" gives no options, so the
   test host fills in the manifest's defaults as a fresh install would; the
   cache warning is absent 5 minutes after a turn and shown (source `cache`)
   at 59. With the default set back to `5` this test fails. The upstream
   fallback `options.cacheTtlMinutes ?? 5` in `hooks/register.tsx` is left as
   upstream wrote it, since the host always supplies the manifest default.
5. **Manifest.** `version` `0.3.2-zm.1`; `homepage` and `repository` still
   name upstream.

## Version

`<upstream version>-zm.<n>`: upstream `0.3.2`, local release `n = 1`.
`claude plugin validate` accepts this form. If the plugin cache ever refuses
it, use `0.3.(2 * 100 + n)` (so `0.3.201`) and record that here.

## Updating from upstream

Download the new tag, diff it against this folder, read the diff, re-apply
the numbered changes, run the tests, raise `n`.

## Type notes against engine 2.1.325

Checked 2026-11-16 with the house compiler options: this fork reports the same 6 type errors as the untouched upstream and adds none. Two are the `PowerShell` tool-name matcher in `hooks/register.tsx` (a tool this build does not have; the hook never fires here). Four are in `tests/smart-compact.test.ts`: the same matcher, a band prop (`isCollapsed`) the 2.1.325 types require, `setTimeout` without a DOM or Node library, and one possibly-undefined string. Left as upstream wrote them; the tests pass.
