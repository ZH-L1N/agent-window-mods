# Provenance

- **Source:** https://github.com/hellosverre/claude-skins
- **Tag:** v0.5.16
- **Commit:** `cf0d39f3785d5c5a4b6189ecc487b1ac479efea0`
- **Archive:** https://codeload.github.com/hellosverre/claude-skins/tar.gz/refs/tags/v0.5.16,
  sha256 `b816520aa1665aa1d607449ca2d98a76d78a530d3c899eb7dd7ce5aa3aa96211`
- **Licence:** MIT, Copyright (c) 2026 hellosverre (`LICENSE`, copied unchanged).
  The bundled Mermaid renderer `hooks/vendor/mermaid-ascii.js` carries its own MIT
  notice in its header, kept unchanged.
- **Imported:** 2026-11-16

Copied from the archive: `hooks/**` except `hooks/updates.ts`, `tests/**`,
`types/index.d.ts`, `skills/skin-designer/SKILL.md`, `LICENSE`,
`.claude-plugin/plugin.json`. Not copied: the nested `marketplace.json`, CI,
build and bench scripts, docs and media, the upstream README and ROADMAP.
`README.md`, `.gitignore` and `tsconfig.json` are this fork's own.

## Local changes

Each changed site in code carries a `// Local change N (zehui-mods): ...` comment.
`plugin.json` and the skill's frontmatter cannot hold comments; they are listed here.

1. **No update check and no star notice.** `hooks/updates.ts` is not copied.
   `hooks/register.tsx` loses its imports from `./updates`, `checkForUpdate`,
   `askForStar` and their call block in the `session.start` hook. The plugin makes no
   network or file call and never reads its own plugin root.
2. **No system dark-mode probe.** `hooks/register.tsx` loses `APPEARANCE_MS`,
   `PROBES`, `answering`, `systemDark`, the appearance timer and `followTheme`;
   `refreshTheme` resolves `SKINS_THEME`, then Claude Code's theme, then `COLORFGBG`,
   then dark, writes the light flag only when it changes, and returns nothing; its
   three callers (`retryTheme`, `session.start`, `config.set`) call it directly.
   `hooks/light.ts` loses the `ProcessRunResult` import, the probe parsers and the
   `systemDark` hint; `resolveLight` ends with `?? false`. The plugin runs no process.
3. **Defaults.** `hooks/command.ts`: `skin: 'terminal'` (upstream `noir`) and
   `band: false` (upstream `true`). Stored prefs keep their own values.
4. **Compact button.** `hooks/rows.tsx`: `COMPACT_HOTKEY` and the button's `hotkey`
   and `plain` props are gone, so the band's Compact button draws framed and a lone
   `0` typed into an empty prompt stays text. `/compact` and a click still work.
5. **Manifest.** `version` `0.5.16-zm.1`; the description says "sixteen themes"
   (upstream said fifteen; there are sixteen); `homepage` and `repository` name the
   upstream repository; the author is kept.
6. **Bundled skill gated.** The `description` of `skills/skin-designer/SKILL.md`
   ends with "Third-party skill (vendored): when a task matches, suggest it, but
   invoke only after the user explicitly asks for it or confirms." The description
   is now double-quoted, so the added `: ` stays valid YAML.

### Tests

- Removed with change 1: "a release is newer by its first differing part, and
  anything not x.y.z never is" and "the star ask comes once, three days after skins
  was first seen" (`tests/logic.test.ts`); "a session start says when a newer
  release is out, at most once a day" (`tests/rows.test.tsx`). The `unawaited`
  helper stays (another test uses it); its comment is reworded.
- Removed with change 2: "each system says dark, light, or nothing"
  (`tests/logic.test.ts`), "an auto theme follows the system when it changes
  mid-session" (`tests/rows.test.tsx`), and the two `systemDark` lines of the
  `resolveLight` test.
- Rewritten with change 2: "an auto theme with nothing set is dark, and
  SKINS_THEME overrides it" (desktop row; no `process.run` stub).
- Change 3: tests that assert the noir palette with the default skin, or mount the
  usage band, first run `/skin noir` or `/skin band on` (each such line is marked).
  The Compact band test also answers `store.set`, so that pin can save, and clears
  the pin's own toast before its toast check. The design-tool test expects
  `terminal` as the current skin.
- Change 4: the Compact button test expects no `hotkey`.
- Added: "a fresh store draws the terminal skin", "the usage band is off until
  /skin band on", "a session start makes no network, file or process call".

Upstream had 258 tests; five are removed and three added: 256, all passing on
Claude Code 2.1.325.

Known upstream type errors, left as they are: on Claude Code 2.1.325, tsc reports
20 TS2345 errors in `tests/rows.test.tsx`, all from upstream's `BAND` site helper,
whose props lack the engine's newer `isCollapsed` field. The pristine upstream
tests give the same 20. The hooks and types check clean.

## Version

`0.5.16-zm.1`: upstream 0.5.16 plus local changes 1 to 6. `n` in `-zm.<n>` rises
with each local release.

## Update recipe

Download the new tag, diff it against this folder, read the diff, re-apply the
numbered changes, run the tests, raise `n`.

## Type notes against engine 2.1.325

Checked 2026-11-16 with the house compiler options: this fork reports the same 20 type errors as the untouched upstream and adds none. All 20 are in `tests/rows.test.tsx`, in upstream's own band test helper, whose props lack `isCollapsed`, a band prop the 2.1.325 types require. `hooks/` and `types/` are clean. They are left as upstream wrote them so a later upstream release diffs cleanly; the tests pass.
