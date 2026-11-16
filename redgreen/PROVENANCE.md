# Provenance

- **Source:** https://github.com/hellosverre/redgreen
- **Tag:** v0.1.0
- **Commit:** `4aafc775744451c488e35f8c59067d475c0f0824`
- **Archive:** `https://codeload.github.com/hellosverre/redgreen/tar.gz/refs/tags/v0.1.0`,
  sha256 `f2710cec03bd69db5fe08700aaa36e9a42e5c11e7b4e764ac7077d791ef5ef6a`
  (checked at import)
- **Licence:** MIT, "Copyright (c) 2026 hellosverre"; `LICENSE` copied unchanged
- **Imported:** 2026-11-16

## What was copied

`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`,
`hooks/pane.tsx`, `hooks/parse.ts`, `hooks/format.ts`, `types/index.d.ts`,
`tests/fixtures.ts`, `tests/pane.test.tsx`, `tests/parse.test.ts`, `LICENSE`.

Left out: the nested `.claude-plugin/marketplace.json`, the upstream
`README.md`, `.gitignore` and `tsconfig.json` (written fresh here; the
tsconfig has the same content), `scripts/` (demo tooling) and `docs/`
(media). A full-source read of this tag found no network use, no process
spawning, no obfuscation and no remote code.

## Local changes

1. **Version.** `version` in `.claude-plugin/plugin.json` is `0.1.0-zm.1`
   (upstream `0.1.0`). JSON has no comments, so this site carries no
   `Local change` marker. No code change.

## Version note

The version is `<upstream version>-zm.<n>`; `n` starts at 1 and rises with
each local release. `claude plugin validate` accepted `0.1.0-zm.1` on
2026-11-16, so the fallback form `<major>.<minor>.<patch * 100 + n>` is not
used.

## Update recipe

Download the new tag, diff it against this folder, read the diff, re-apply the
numbered changes, run the tests (`claude plugin test redgreen`), raise `n`.

## Type notes against engine 2.1.325

Checked 2026-11-16 with the house compiler options: this fork reports the same 2 type errors as the untouched upstream and adds none. Both are in `hooks/register.tsx`: a `tool.call` matcher on the tool name `PowerShell`, which this build's tool-name union does not have, and its follow-on. The hook simply never fires here. Left as upstream wrote it; the tests pass.
