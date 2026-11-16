# redgreen

A test results pane. Each time Claude runs a test command (vitest, jest,
pytest, cargo, go, bun or deno), redgreen parses the output and keeps the run:
a failing run opens the **Tests** pane with the failing tests by name and the
picked one's detail (assertion, diff, code frame); a green run only updates the
status line (`tests ✓ 4`, or `tests ✗ 3/4` after a failure). The session's last
50 runs are kept and can be stepped through.

## Commands

| Command | What it does |
| --- | --- |
| `/tests` | Opens the pane on the latest run |
| `/tests clear` | Empties the history and clears the status line |

In the pane: `p` / `n` / `l` older, newer and latest run; `k` / `j` previous
and next failure.

## State

`{ plugin: 'redgreen', key: 'runs' }` holds `Run[]`, newest last; each run has
`passed`, `failed`, `skipped` and `at` (see `types/index.d.ts`).

## Install

```bash
claude plugin install redgreen@zehui-mods --scope user
```

Fork of https://github.com/hellosverre/redgreen at v0.1.0 (MIT). Local changes are in PROVENANCE.md.

## Tests

```bash
claude plugin test redgreen
```
