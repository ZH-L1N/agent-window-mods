# Ship review log: strip-forks-safety 2026-11-16

One line per review round of each phase, appended by the ship pipeline. The fix budget is per phase.

ship-review round 1 [phase 0 housekeeping]: 2 confirmed / 2 fixed / 0 left, per lens: conformance 1, correctness 1, coverage 0, simplification 0 (both were one stale provenance sentence)
ship-review round 2 [phase 0 housekeeping]: 0 confirmed / 0 fixed / 0 left, per lens: conformance 0
review-loop [phase 0 housekeeping]: complete @ 5b778ba8fbd03df6dc5379722bf74ef8157165f3 465124e2e7538d78222fec40c2c23131d33fb5ef
ship-review round 1 [phase 1 forks]: 7 confirmed / 7 fixed / 0 left, per lens: fork 4, coverage 2, correctness 1, security 0, conformance 0 (skins 1, redgreen 0, smart-compact 1, breathe 5; one of breathe's was a saved setting, reset by command rather than by a code change)
ship-review round 2 [phase 1 forks]: 0 confirmed / 0 fixed / 0 left, per lens: correctness 0, fork 0 (re-review of the fix round only)
review-loop [phase 1 forks]: complete @ bfada5965c6f891f838f8f984a6fa73c9ee91f26 871233dc3264c0a89bf1ad8784b791fafb1ac169
ship-review round 1 [phase 2 motion-hold]: 27 confirmed / 27 fixed / 0 left, per lens: bypass 14, security 5, correctness 3, conformance 3, coverage 2 (1 high: a Monitor watch was not gated)
ship-review round 2 [phase 2 motion-hold]: 12 confirmed / 12 fixed / 0 left, per lens: bypass 7, security 3, correctness 2 (re-review of fix round 1; all in the matcher, 1 high)
ship-review check [phase 2 motion-hold]: 12 confirmed / 0 fixed / 12 left, per lens: bypass 8, correctness 2, security 2 (check of fix round 2; all in the matcher: 1 high, 6 medium, 5 low; gate, card and hold kit clean)
review-loop [phase 2 motion-hold]: failed (2 fix rounds spent, 1 HIGH and 11 non-HIGH left; not committed, and phase 4 waits with it for the hold kit) @ 8c1f29fd7e6a354d0f5e386059046b0e14ed1c99 9df9187d71291110d9d6fa5091cb9e42a8226bc5

Left open in phase 2, all in `motion-hold/hooks/match.ts` (uncommitted), each confirmed by a skeptic:

1. high: once the budget of 64 second readings is spent, the earlier reading is dropped without the rule 7 hold for a named host, so a held command behind 65 or more such texts passes (two lenses reported it).
2. medium: a `(` after `time`, after a function's `()` or after a later case pattern is read as a glob word: plain reads are held, and the real holds there survive only through the second reading (two lenses reported it).
3. medium: a spent 20,000-character budget for carried values drops later uses without marking the reading uncertain, also from inside a substitution or an `eval` string (two lenses reported it).
4. medium: a weak carried value makes an unresolved ssh target count as known, so the rule 3a hold for an unknown target is lost.
5. medium: a closed nest just past 100 levels is read as an unclosed quote and swallows the commands after it.
6. medium: `local NAME` (or `export NAME`, `readonly NAME`) as a word of its own, then `NAME=value`, drops the carried value.
7. low: nested `"${a:-''...}"` takes time that doubles per level; 27 levels run past the hook's 10 seconds.
8. low: a signal option behind a `>|` redirect is not seen after `kill -0`.
9. low: `<( )` or `>( )` inside an unquoted `${...}`, and `${ command; }`, are not read as substitutions.

ship-review round 1 [phase 3 strip]: 13 confirmed / 13 fixed / 0 left, per lens for the strip: coverage 3, simplification 3, conformance 2, correctness 1; token-weather and here: 4
ship-review round 2 [phase 3 strip]: 2 confirmed / 2 fixed / 0 left, per lens: correctness 2 (re-review of the fix round; both low)
ship-review check [phase 3 strip]: 1 confirmed / 1 fixed / 0 left (spot check of the round 2 edits; low, fixed by the orchestrator, gate re-run green)
review-loop [phase 3 strip]: budget-spent (2 rounds, 0 non-HIGH deferred) @ 8c1f29fd7e6a354d0f5e386059046b0e14ed1c99 9df9187d71291110d9d6fa5091cb9e42a8226bc5
