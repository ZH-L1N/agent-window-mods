# Ship review log: motion-hold 0.1.1

Plan: `plans/2026-11-16-motion-hold-0.1.1.md`. One implementing agent, one check, no fix round after the check
(the plan's stop rule).

ship-review note [implementation]: one agent built items A to J in two groups (A to G, then H to J), suite, validation and type check green after each; its own proof: 7,052,567 generated commands through five versions of the matcher (3,400 holds of 0.1.0 pass, each a read of the three kinds the plan allows; 39,885 newly held; 0 internal errors; slowest 279 ms); 45 new table rows and 6 list tests; H, I and J done in part beyond the plan's lines, and one loss against 0.1.0 declared
ship-review note [orchestrator, before the check]: structure, suite (462), validation, type check, a 70-row acceptance probe, the earlier high findings, timing and a live load in a throwaway session all as the plan says; over the owner's own command history (64,447 distinct commands, compared privately) the agent's file changed one verdict against 0.1.0, a read through `xargs` on a configured host newly held; corrected before the check by a set of nine programs that count as reads as the template of `xargs` there (rows 365 to 367, 465 tests); with it 0.1.0 and 0.1.1 agree on every command of that history
ship-review check [motion-hold 0.1.1]: 12 confirmed / 0 fixed / 12 left, per lens: regression 7, fixes 3, correctness 2 (no high, 7 medium, 5 low; 3 more raised and set aside by their skeptics; 7 gaps that every version shares listed)
ship-review note [orchestrator, after the check]: the headline command of every confirmed finding run again through the five versions, all reproduce; nothing changed in the code; the mod's README corrected in four sentences that said more than the code does, and the eight defects and the shared gaps listed in it
review-loop [motion-hold 0.1.1]: budget-spent (one check by the plan's stop rule, no fix round; 12 non-HIGH deferred and documented in the mod's README) @ fb97eb0e349c106be4fb0fd0d960c7e43a953fd3 c332302c48002a574005b1236e7a94cf7122ae9b

Landed tree, which differs from the reviewed one in documents only (the mod's README and PROVENANCE, the repo's README row and the roadmap): fb97eb0e349c106be4fb0fd0d960c7e43a953fd3 467fc63abbf25e578db21634845f6b82f7ddf0dd

Reviewed files: `motion-hold/hooks/match.ts` sha1 `e613135a07df17c4523321f2d0b94da2674d69af`, `motion-hold/hooks/match.test.ts` sha1 `1e3f8d03d757e6d1f42fabf9a3a93aded4f8429b`; both are the files committed.

Left open after the check, all in `motion-hold/hooks/match.ts`, each confirmed by a skeptic (twelve findings, eight defects):

1. medium: a value that 0.1.1 newly puts in place (through a form of reference, or behind `time -p`) hides a hold where it is a read-only program standing as the command word and the target is known only through another carried value; 0.1.0 and the two versions before it held these commands (190 of 509,335 random mixed commands). The plain spelling passes in every version.
2. medium and two low (three lenses): a value over 2,000 characters used through a name the text does not show (an `eval` that builds the name, `${!N}`, `declare -n`, an exported value a child program reads) reaches no limit and passes; 0.1.0 held it by stopping at the assignment.
3. medium: a form whose word holds a quote, a backslash, `<`, `>`, `{` or `}` is not read with the value in place in text that is read again (a substitution, an `eval` string, a heredoc fed to a shell); passes in every version.
4. medium (two lenses; a third raised it and its skeptic set it aside as the plan's own bound): the bound of eight further readings is counted over all names of a command, so a ten-step script that reuses one label is held as unreadable, where every earlier version passed it; the README said no limit is reached by ordinary work.
5. medium (two lenses): on a configured host a read through `xargs` is held unless its template is one of the known reads, and a read-only template is held where a later stage of its pipeline is not; every earlier version passed these reads.
6. low: an assignment in front of one of the nine template reads does not end the exemption, as it does for the read-only set.
7. low: `xargs --max-lines` without a value takes the next word for its value, which hides the command behind it.
8. low: after signal 0, a later signal option is not seen where the kill command stands inside a quoted string that is typed into another program and a separator stands inside a quote of its words.
