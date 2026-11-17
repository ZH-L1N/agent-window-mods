# motion-hold 0.1.1: implementation plan

> Executed by one implementing agent and one check; the orchestrator owns
> git. A follow-up to `plans/2026-11-16-strip-forks-safety.md` (phase 2,
> "Task 5" and its three corrections, which stay the rules of the matcher).

**Goal:** close what the last review of motion-hold 0.1.0 left open in the
command matcher (`motion-hold/hooks/match.ts`), and three gaps that every
earlier version shares and that ordinary work can meet.

**Why:** three of the open findings are holds that the round before 0.1.0
made and 0.1.0 lost. The mod is a safety gate; what it misses should be
what its README says it misses, and nothing a person would write by habit.

**Size call:** small in files (the matcher, its test file, the mod's two
documents, its version), large in care. One implementing agent, in order.

**Status: implemented 2026-11-17 02:56.** Approved by the owner 2026-11-16 16:35
("do motion-hold 0.1.1 now", scope as listed in the report of 0.1.0's
landing). Landed as checked: the one check confirmed no high finding, and
what it confirmed below that is in "The result of the check" near the end.

## Success criteria

1. Each item A to J below behaves as its lines say, pinned by a table row
   or a test in `hooks/match.test.ts` (rows numbered from 323).
2. No command that 0.1.0 holds passes in 0.1.1, except a read that 0.1.0
   held only because it gave up early: behind a quote nested in `${...}`
   (item B), in a command whose room for carried values weak values had
   spent (item C), or beside a long value that is never used (item D).
3. No hold of the three earlier versions of the matcher is lost beyond
   what the earlier corrections of Task 5 already allow.
4. `classify` never throws, and no input takes more than a small multiple
   of linear time.
5. The 414 tests of 0.1.0 pass, changed only where an item changes the
   verdict they assert, each such change named in the report.
6. The mod's README says what is held, how a command is read and what it
   cannot see, true to the code. The version is 0.1.1.

## Items

Names are the neutral ones of the earlier plan: host `rig-1.local`,
`10.0.0.*`, the site command `ctl move`.

**A. `time -p` and an assignment that opens a group.** The look-through of
the assignment reader passes `-p` behind `time`, as the scanner does.
`time -p (M=move; ctl $M x 1)`, the same with `{ ...; }`, with a newline
for the `;`, and with a URL, a device path or an ssh command in the value
are held, as they are without `-p`. A read behind `time -p (` passes.

**B. A single quote inside nested `${...}` in double quotes.** The reader
keeps the result of closing a brace for each text, start and quoting, so
the shape (`"${a:-''"${a:-''x}"}"` and deeper) is read once, in linear
time, at any depth under the nesting limit; the step budget stays as a
backstop. Behind 14, 27 and 100 levels of it, `M=move; ctl $M x 1` and
`H=rig-1; ssh $H.local 'sudo reboot'` are held, and
`ssh rig-1.local 'grep -c done log'` passes.

**C. Room for carried values.** A value that 0.1.0 carries as a weak one
where the version before did not carry it at all (its name stands
elsewhere as a bare word, or is declared without a value, or the value is
put together from a weak one, or the assignment stands behind `time`)
takes its room from a room of its own. A 100-character value of that kind
used 200 times, then `M=move; ctl $M x 1`, is held.

**D. Every limit of the reader holds the command.** Where the reader stops
short for a reason of its own, the command is held as `unreadable`,
uncertain, whether or not it names a configured host; the host is named
when the command names one. An internal error is decided the same way. So
that this holds little that is harmless, a literal value over 2,000
characters is a limit only where a use of its name is read. A quoted nest
101 deep followed by `ls -la` is held; `X=<2,001 characters>; ls -la`
passes; the same value used in a later word is held.

**E. Signal 0.** The search for a later signal option does not end at a
`|`, `;`, `&` or newline inside `$'...'`, inside a quote opened in the
middle of a word, or inside `${...}`, nor at the `|` of `&>|`. On a
configured host, `pkill -0 -f bench"|"runner --signal 9`,
`kill -0 2186 &>| /dev/null -s KILL` and
`pkill -0 -f $'a;b' --signal 9` are held; `kill -0 2186` and
`kill -0 2186; echo done` pass.

**F. The command form inside another `${...}`.** Outside double quotes too,
`${A:-${ command; }}` and `${A[${ command; }]}` are substitutions whose
text is a command: `echo ${A:-${ sudo reboot; }}` on a configured host is
held; `echo ${A:-${B:-x}}` passes.

**G. Time.** The four places that take quadratic time are made linear: the
class B patterns with a run of flags (systemctl, docker, the http client),
the function-head test at each empty pair, the assignment test at each
pair behind a letter, and the comparison of two long texts at each `${`.
The five shapes of the finding, at 100,000 and 399,000 characters, each
stay under the speed test's bound.

**H. A carried value used through another form.** `${NAME%word}`, `%%`,
`#`, `##`, `/`, `//`, `^`, `,`, `:offset`, `:-word`, `-word`, `:=word`,
`=word`, `:?word` and `?word` are read with the carried value of `NAME`
in place, as a weak value (it adds holds and names a host; it never makes
a target certain). `:+word` and `+word` are read with `word` in place.
`BASE=http://rig-1.local:8080; curl -X POST "${BASE%/}/api/move" -d 1`,
the same with `${BASE:-http://localhost}`, and
`SSH="ssh rig-1.local"; ${SSH:?} 'sudo reboot'` are held. A read through
such a form passes.

**I. A name with more than one literal value.** Every literal value of the
name is tried, the earlier ones as weak values whose readings only add
holds. `DEV=/dev/ttyUSB0; [ -n "$SIM" ] && DEV=/tmp/sim.txt; echo G1 X10 >
"$DEV"` is held, and so is
`URL=http://rig-1.local:8080/api/move; [ "$1" = dry ] &&
URL=http://localhost:9000/echo; curl -X POST "$URL" -d 1`. The number of
further readings in one command is bounded; past the bound is a limit
(item D).

**J. More words that stand before a command.** `sshpass`, `doas`, `flock`,
`setsid`, `watch`, `xargs`, `ionice`, `chrt`, `strace`, `unbuffer`,
`builtin`, zsh's `repeat`, `noglob` and `nocorrect`, and `coproc` are
looked through, with the flags of theirs that take a value, like `sudo`
and `timeout` are. `sshpass -p x ssh rig-1.local bash < run.sh` is held as
`unreadable`, and so is the same behind each of the others;
`sshpass -p x ssh rig-1.local uptime` passes.

## Ground rules for the implementing agent

- Tests first: every example above, and every failing input of the
  findings, becomes a row or a test that is seen failing before the code
  changes.
- The smallest change per item. No refactoring. An item that cannot be
  done without losing a hold, or without breaking a test for a reason the
  items do not give, is left and reported, not forced.
- Scope: `hooks/match.ts`, `hooks/match.test.ts`, `README.md`,
  `PROVENANCE.md`, and the version in `.claude-plugin/plugin.json`.
  `hooks/hold.ts` stays byte for byte what `send-gate` carries.
- Proof by comparison: the four earlier versions of the matcher and the
  new one are run side by side over the earlier reviewers' generators and
  new ones for every item, and every command whose verdict goes from hold
  to pass is accounted for under criteria 2 and 3.

## The check and the stop rule

One check of the finished change against 0.1.0: three lenses (the items,
regressions, correctness of the changed code), each finding tested by a
skeptic. As for 0.1.0: the version lands unless the check confirms a high
finding, and what it confirms below that is documented in the mod's
README and fixed later. Nothing is changed in the code after the check.

## What was built (2026-11-16 to 2026-11-17)

All ten items are in `motion-hold/hooks/match.ts`, version 0.1.1. One agent
built them in two groups (A to G, then H to J) with the suite, validation
and the type check green after each group; `hooks/hold.ts` is untouched and
still byte for byte what `send-gate` carries.

### The rules, one sentence for each rule changed or added

- **Built-in table, kill (E).** A `kill`, `pkill` or `killall` with signal 0
  is a kill when a later word names another signal, and where the program
  stands outside every quote of its text the words after signal 0 are read
  as a shell reads them: a quote may open anywhere in a word, `$'...'` is a
  quote, a backslash takes the next character with it, and a blank or a
  `|`, `;`, `&` or newline inside a quote, inside the braces of a `${...}`
  or inside parentheses belongs to its word.
- **Built-in table, class B (G).** The patterns for `systemctl`, `docker`
  and the method word behind `http` give the matches they gave, found in
  one pass over the text.
- **Rule 1 (E).** zsh's `&>|`, `&>>|`, `>>|` and `>&|` are redirect signs,
  not a pipe.
- **Rule 1 (F).** `${` followed by a blank, a tab, a newline or `|` inside
  another `${...}` is a command substitution, outside double quotes too.
- **Rule 1 (B).** A `${...}` in double quotes is closed once for each text,
  start and quoting, and the answer is kept for the scan in hand; the step
  budget is a backstop behind the nesting limit of 100 levels.
- **Rule 2 (A).** `time` may be followed by `-p` and by `--` before what it
  times.
- **Rule 2 (J).** Behind `sshpass`, `doas`, `flock`, `setsid`, `watch`,
  `xargs`, `ionice`, `chrt`, `strace`, `unbuffer`, `builtin`, `repeat`,
  `noglob`, `nocorrect` and `coproc`, with their flags and operands, the
  command is read a second time as the command the word runs, and the
  reasons of that reading are added to those of the first, which stands.
- **Rule 2a (A).** An assignment behind `time -p`, and one that opens a
  group or braces behind it, is carried as a weak value.
- **Rule 2a (C).** The values carried only since 0.1.0 take their room from
  a room of their own, so every value the version before put in place
  still is.
- **Rule 2a (H).** A reference of the form `${NAME%w}`, `%%`, `#`, `##`,
  `/`, `//`, `^`, `^^`, `,`, `,,`, `:offset`, `:-`, `-`, `:=`, `=`, `:?` or
  `?` is read with the carried value of NAME in place, and `:+` or `+` with
  its word in place, as a weak value that adds holds and names a host and
  never makes a target certain.
- **Rule 2a (I).** Where a literal value replaces a different literal value
  of a name and the name is then used, the command is read once more for
  each earlier value, at most eight times, and those readings only add
  reasons.
- **Rule 2a (D).** A literal value over 2,000 characters is not carried,
  and the command is held as not read in full when its name stands again
  anywhere in the command, other than as the name being assigned.
- **Rule 3a (J).** Input fed to a remote shell behind one of the words of
  rule 2 is held; the string of `watch` and of `flock -c` is read as text;
  and `xargs` with a template is input that cannot be read where the
  template is a remote shell that names a configured host, or where
  `xargs` stands in text run on a configured host and its template is not
  a read.
- **Rule 7 (D).** Wherever the reader stops short of reading everything for
  a reason of its own, or fails, the command is held as `unreadable` with
  `isCertain` false, with the configured host it names or with no host,
  and the reasons found before are kept.

### Cases 323 to 367

Rows of the table in `hooks/match.test.ts`, each with its expected verdict:
323 to 329 `time -p` with an assignment that opens a group (six holds, one
read); 330 to 332 the command form inside another `${...}` (two holds, one
read); 333 to 337 signal 0 with a later option behind a separator inside a
word (four holds, one probe that passes); 338 a value carried only since
0.1.0 spends its own room; 339 to 342 a single quote inside nested braces
at 14, 27 and 100 levels (three holds, one read); 343 to 347 every limit
holds, and a long value never used passes; 348 to 353 the words that stand
before a command (four holds, two reads); 354 to 358 other forms of
reference (three holds, two reads); 359 to 362 a name with several literal
values (two holds, one read, one limit past eight earlier values); 363 and
364 the name of a long value standing again; 365 to 367 the template of
`xargs` on a configured host (two reads, one hold). Six list tests stand
beside them (further forms, reads, the time of the shapes the last review
found slow, the wrapper words, the forms, the values).

### Decisions made while building

1. **Item D, the long value, is wider than this plan's words.** The limit
   is reached where the name of a value over 2,000 characters stands again
   anywhere in the command or in a text read out of it, behind a `$` or
   bare, before the assignment or after it. The narrower reading (a use
   behind a `$`, after the assignment) passed two commands that 0.1.0
   held. Price: `X=<long>; echo X is set` is held.
2. **Item J is a second reading that only adds holds.** The first reading
   takes the word for the program, as every earlier version did. Looking
   through the word in the first reading would have passed reads that
   0.1.0 holds for a word in their raw text.
3. **Item H puts the whole value in place** as a weak value; what `%`, `#`
   or `/` would take off it is not applied.
4. **Item I reads at most eight further times** for one command; past that
   the command reaches a limit and is held.
5. **One correction after the agent's comparison and before the check.**
   Over the owner's own command history (64,447 distinct commands) the
   agent's final file changed one verdict against 0.1.0: a read on a
   configured host through `xargs -n1 readlink`, newly held. So in text
   run on a configured host a template of `xargs` whose program is
   `readlink`, `realpath`, `basename`, `dirname`, `md5sum`, `sha1sum`,
   `sha256sum`, `sha512sum` or `cksum` is a read (`TEMPLATE_READS`, asked
   about in that one place only). Over 5,616 generated `xargs` commands
   the change gives back 1,518, each held before for the template reason
   alone, and passes none that 0.1.0 holds. With it, 0.1.0 and 0.1.1 give
   the same verdict for every command of that history.

### Declared as not done, item by item

What the implementing agent reported as left. Each of these passes in
every version unless it says otherwise; the mod's README lists them under
"What it cannot see".

- **E:** a later signal option behind the old arithmetic spelling
  `$[ ... ]`, and behind a line continuation inside `&>|`.
- **H:** a form whose word holds a variable or a substitution; a carried
  value inside the word of another reference; the forms not listed; a
  default that names the host for a name with no value in the command; a
  hold that shows only once `%` or `#` has changed the value.
- **I:** a later value that is not a literal forgets the earlier one; the
  earlier values of two names are not tried together.
- **J:** words not in the list (`taskset`, `runuser`, `pkexec`,
  `systemd-run`, `parallel`, `coproc NAME { ...; }`, `su -c`, `script -c`,
  `env -S`); a local shell that hands its own input on; `xargs -I{} sh -c`
  with a remote shell in its string.
- **D:** the name of a long value that the command works out where its
  text does not show it; a read beside it passes where 0.1.0 held it (the
  check found this wider than a read: defect 2 of its result).

### Proof

- **Five versions side by side.** 7,052,567 distinct generated commands
  through the matcher before each fix round, 0.1.0 and the new one (the
  earlier reviewers' generators and ten new ones, one per item). Commands
  that 0.1.0 holds and 0.1.1 passes: 3,400, every one a read of the three
  kinds ground rule 1 allows, each shown by a copy of 0.1.0 with only that
  limit lifted (2,044 behind the quote nest, 1,288 behind spent room, 68
  beside a long value never used). Holds of the three earlier versions
  that are gone: only the classes the earlier rounds sanctioned (2,803,
  1,514 and 176,670 commands, none outside its class). Newly held: 39,885.
  Internal errors: 0. Slowest classify on a quiet machine: 279 ms, at
  396,018 characters. The check then found two classes of lost hold that
  these generators did not reach (defects 1 and 2 of its result).
- **The owner's history.** Every Bash command of the local transcripts
  (64,447 distinct) and the 4,421 hardware commands mined earlier: 0.1.0
  and 0.1.1 give the same verdict for every one (922 and 375 held), none
  reaches a limit, and the slowest takes 7 ms.
- **The gate.** 465 tests pass (the 414 of 0.1.0, changed only where item
  B or D changes the verdict they assert, plus 45 rows and 6 list tests);
  `claude plugin validate` passes; the type check is clean.
- **Live.** Loaded from its folder in a throwaway session with a stub
  command and a test config: the status line is right, a short command
  that reaches a limit is reported as held, and the stub command is held
  on a card and refused when its time runs out.

## The result of the check (2026-11-17)

One check of the finished change against 0.1.0 and the three versions
before it, as the stop rule above asks: three lenses (the items,
regressions, the correctness of the changed code), each finding tested by
a skeptic that ran its own probes. 15 findings were raised; 12 were
confirmed (7 medium, 5 low, no high) and 3 were set aside as gaps that
every version shares. The lenses ran over 1,600,000 commands of their own
through the matcher, most of them through all five versions, with no
internal error; the slowest shape they timed took 361 ms at about 390,000
characters.

The files the check read are the files that landed: `hooks/match.ts`
(sha1 `e613135a07df17c4523321f2d0b94da2674d69af`) and `hooks/match.test.ts`
(sha1 `1e3f8d03d757e6d1f42fabf9a3a93aded4f8429b`). After the check only
documents changed. Before landing, the orchestrator ran the headline
command of every confirmed finding through the five versions again; all
of them reproduce.

The twelve findings are eight defects. The mod's README lists each under
"Found by the check of 0.1.1 and not fixed yet".

1. **A value put in place hides a hold** (medium). A command is read with
   every carried value in place and with none. Item H puts the value of a
   form in place where 0.1.0 left the form as written, and item A carries
   the value behind `time -p`. Where that value is a read-only program
   standing as the command word (`[ -n "$DRYRUN" ] && DRY=echo`, then
   `${DRY:-} ssh $H '...'` with the host in `H`), the first reading is a
   read and the second shows no target, so the command passes; 0.1.0 and
   the two versions before it held it. Of 509,335 random mixed commands,
   190 that 0.1.0 holds pass, all of this class. The plain spelling
   (`$DRY ssh $H '...'`) passes in every version.
2. **A long value used through a name the text does not show** (one
   medium, two low). The limit of item D is reached where the name of a
   value over 2,000 characters stands again. An `eval` that builds the
   name, `${!N}`, `declare -n` and an exported value that a child program
   reads show no name, reach no limit and pass; 0.1.0 held them by
   stopping at the assignment. This is the loss the implementing agent
   declared, and it is wider than a read: a remote shell or a write can
   stand behind it.
3. **A form whose word holds a quote or a backslash is not read in text
   that is read again** (medium). `OUT=$(curl -X POST
   "${BASE:?"BASE not set"}/api/move")` passes in every version; with a
   plain word, and at the top level of the command, it is held.
4. **Eight further readings are few** (two medium; a price of item I).
   The bound is counted over all names of the command, and an earlier
   value counts also where it could not reach a later use. A ten-step
   script that gives one label ten values is held as `unreadable`, where
   every earlier version passed it. Of 94 shell scripts of 30 to 600
   lines that ship with the system and a package manager (their text
   classified, nothing run), 0.1.0 passes all and 0.1.1 holds 16 for this
   limit alone.
5. **On a configured host a read through `xargs` is held unless its
   template is a known read** (two medium; a price of item J). `xargs
   zcat`, `xargs jq`, `xargs docker inspect` and a read-only template
   followed by `| awk ...` are held; the same reads without `xargs` pass.
   The plan asked only that `xargs` be looked through.
6. **An assignment in front of one of the nine template reads does not end
   the exemption** (low): `xargs env LD_PRELOAD=... readlink` on the host
   passes, as in every version.
7. **`xargs --max-lines` without a value takes the next word for its
   value** (low), so the remote shell behind it is not seen.
8. **Signal 0 with a later signal option inside a string typed into
   another program** (low): the search of item E is made only where the
   kill command stands outside every quote of the text in hand.

The gaps every version shares that the check named are in the README's
list "What it cannot see": a file on the host fed to a shell on the host,
a string that `env -S`, `su -c` or `script -c` splits into a command, a
local shell that hands its own input on, a string that `xargs` fills, a
value flag of a looked-through word that is in no list, a file that
`time -o` or `strace -o` writes, and a default that names a device.

### The criteria as landed

1. Met. Every line of items A to J holds, pinned by rows 323 to 367; what
   is left of D, E, H, I and J beyond their lines is listed under "What
   was built".
2. Not met in two classes: defects 1 and 2. Both are commands that 0.1.0
   holds and 0.1.1 passes, and neither is a read of the three kinds this
   criterion allows.
3. Not met for defect 1: the two versions before 0.1.0 held those
   commands too.
4. Met. No internal error in any run; time grows no faster than the
   length of the command.
5. Met. Rows 267, 279 and 317 and the limit, speed and internal-error
   tests changed, each for item B or D, each named in the report.
6. Met after the check. Four sentences of the README said more than the
   code does (a carried value never takes a hold away; no limit is
   reached by ordinary work; a template that only reads passes; reads are
   never held). They are corrected, the eight defects are listed, and a
   stop command beside a reached limit is said to be held with the rest.

It landed because the stop rule says so: no high finding. Over the owner's
own command history (64,447 distinct commands) 0.1.0 and 0.1.1 give the
same verdict for every command, so neither the two lost classes nor the
two prices occur there.

### Left for the next version

- TEMP(2026-11-17, until: motion-hold 0.1.2): the eight defects that the check of 0.1.1 confirmed stay open
  (no high; seven medium and five low findings), all in
  `motion-hold/hooks/match.ts` and all listed in the mod's README under
  "Found by the check of 0.1.1 and not fixed yet". In the order to fix
  them: a third reading with the weak values left as written, which gives
  back the holds of defect 1; a limit where a long value can be reached
  through a name the text does not show; the further readings bounded by
  the work budget instead of a count of eight; the `xargs` template rule
  narrowed to templates that can run their arguments; a form with a
  quoted word in text that is read again; the assignment in front of a
  template read; `--max-lines`; the kill search inside a quoted string.

## Ledger

| Step | Commit | Notes |
| --- | --- | --- |
| motion-hold 0.1.1 | pending | |
