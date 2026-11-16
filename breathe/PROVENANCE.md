# Provenance

- **Source:** https://github.com/linxuan-sys/claude-breathe (itself a fork of
  halluton/Mindful-Claude)
- **Tag:** none; pinned by commit
- **Commit:** `d8cc7b98ee52a841c8874139d4ab5ff37005fcfc`
- **Archive:** `https://codeload.github.com/linxuan-sys/claude-breathe/tar.gz/d8cc7b98ee52a841c8874139d4ab5ff37005fcfc`,
  sha256 `dcf6c068ca4a3a79e6a964d4d13f625b045dc83614da872eaffb8a6d16cafff2`
- **Licence:** MIT, "Copyright (c) 2026 Halluton" and "Copyright (c) 2026
  Linxuan"; `LICENSE` copied unchanged.
- **Imported:** 2026-11-16, under `plans/2026-11-16-strip-forks-safety.md`
  (Task 4).

Copied from upstream: `.claude-plugin/plugin.json`, `hooks/hooks.json`,
`hooks/register.tsx`, `hooks/breathe.tsx`, `hooks/breath/config.ts`,
`hooks/breath/exercises.ts`, `hooks/breath/shapes.ts`, the three files in
`tests/` and `LICENSE`. Not copied: `legacy/` (the old shell and tmux
version), `docs/` (demo GIFs), `.github/`, `.claude/`, the upstream
`tsconfig.json`, `.gitignore`, `.claude-plugin/marketplace.json` and the
upstream README. `README.md`, `.gitignore` and `tsconfig.json` here are new.

`tsconfig.json` departs from the fork template
(`{ "extends": "./.claude-plugin/types/tsconfig.json" }`): it also sets
`"compilerOptions": { "allowImportingTsExtensions": true }`. Upstream imports
its own modules with `.ts` extensions and its own `tsconfig.json` set this
option; without it `tsc -p breathe` (and an editor) reports TS5097 on every
such import. `claude plugin validate breathe` still prints TS5097 warnings
for those imports, as it does for the untouched upstream, because the
validator type-checks with the engine's own options, not this file.

## Local changes

Each changed site carries a `// Local change N (zehui-mods): ...` comment
(`plugin.json` and `hooks.json` cannot hold one; change 5 is recorded here
only).

1. **Random pool.** `hooks/breath/shapes.ts` exports
   `RANDOM_POOL = ['pulse', 'wave', 'melody']`, and `pickStyle` draws a
   random style from it (never the one just shown) instead of from all of
   `STYLES`. `STYLES` and `isStyle` are unchanged, so all seventeen styles
   stay selectable with `/breathe style <name>` or a bare `/breathe <name>`.
2. **Defaults.** `hooks/breath/config.ts` `DEFAULTS`: `delay: 10`
   (upstream 0) and `spinner: false` (upstream true). The band appears only
   after 10 seconds of a turn, and the spinner word is left alone. A config
   already saved in the store keeps its saved values.
3. **Tests on the engine's kit.** The three test files import `describe`,
   `expect` and `test` from `claude-code/testing` instead of bun's runner;
   the one `test.each(STYLES)` in `tests/shapes.test.ts` is a `for` loop that
   declares one test per style; the mid-file `spinnerWord` import in
   `tests/exercises.test.ts` moved to the top. With change 1 the pool test in
   `tests/shapes.test.ts` was rewritten: over 200 random picks with `last`
   rotating through every style, each pick is in `RANDOM_POOL` and differs
   from `last`, and the picks cover all three. With change 2,
   `tests/config.test.ts` gained "defaults: delay 10 seconds, spinner off",
   and its upstream test "spinner on or off" now checks that `spinner on`
   gives `true` and starts the `spinner off` case from
   `{ ...DEFAULTS, spinner: true }` (with the default now off, the upstream
   assertion alone no longer tested anything).
4. **Safe render hooks.** The two `ui.render` hooks in `hooks/register.tsx`
   (AbovePrompt and Spinner) end with `.catch(($, e, next) => next(e))`, so a
   failure passes the band or spinner on instead of breaking it.
5. **Manifest.** `.claude-plugin/plugin.json`: `version` `2.0.0-zm.1`; the
   description's closing sentence about function hooks being early access is
   gone, and "and the spinner reads the breath" reads "and the spinner can
   read the breath (/breathe spinner on)", since change 2 turns the spinner
   off by default. `hooks/hooks.json`: the description keeps its first clause
   and loses the sentence about an environment variable and early builds.
6. **Main loop only.** `turn.start` and `turn.complete` fire for subagent
   turns too, with `e.agentId` set. The two hooks in `hooks/register.tsx`
   return `next(e)` untouched when `e.agentId !== undefined`, so a subagent's
   turn neither restarts the 10 second delay of change 2 nor ends the main
   turn's band. `tests/turns.test.ts` (new) checks that with a subagent turn
   starting and ending inside a main turn, the band is not drawn 9 seconds
   into the main turn and is drawn at 10.5 seconds.

49 tests: upstream's 47 (the seventeen-style loop as seventeen tests), the
defaults test of change 2 and the turns test of change 6.

The mod hooks `AbovePrompt` for a row of its own and does not order the band
(`grep -rn AbovePromptList hooks` prints nothing); the strip mod places its
row.

## Version

`<upstream version>-zm.<n>`: upstream `2.0.0`, local release `n = 1`, so
`2.0.0-zm.1`. `claude plugin validate` accepts this form. If the plugin cache
ever refuses it, the fallback is `<major>.<minor>.<patch * 100 + n>`, here
`2.0.1`, recorded in this section.

## Updating from upstream

Download the new tag, diff it against this folder, read the diff, re-apply
the numbered changes, run the tests (`claude plugin test breathe`), raise `n`.
