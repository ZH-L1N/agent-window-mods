# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-11-16 with Claude
(Claude Code), under the MIT license. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.325 types); no third-party code is
copied, and no other mod's source was read to write it.

- `hooks/match.ts` (the matcher) is written to the rules and the table of
  cases in plan `plans/2026-11-16-strip-forks-safety.md`, Task 5.
- `hooks/hold.ts` (the hold kit) is written to Task 6 of the same plan. The
  send-gate mod carries a byte-for-byte copy.
- `hooks/register.tsx` and `hooks/card.tsx` are written to Task 7.

## Pattern

The hold flow follows this repo's own `blast-radius` guard (a vendored
first-party mod): a `tool.call` hook on Bash that holds a call, one hold at a
time; a card in a pane with Cancel focused and the approving button without a
hotkey; the engine's question dialog where the pane cannot be placed; a wait
built on `$.process.run(['sleep', '0.25'])` so the hook's own time is not
spent; a deny text that tells the model not to retry; and the fail-closed
`.catch`. It is the pattern only: no line of blast-radius is copied.

Three things differ from that guard on purpose: the dialog path has the same
time limit as the pane path; a hold can be answered by a slash command
(`/motion run`, `/motion cancel`), honoured only from the person; and the
kit is handed an explicit engine object, so it can be tested with a stub.

## Where the matcher goes past the plan's rules

Items 1 to 12 date from the first implementation. The review round of
2026-11-16 found the plan's rules and its table incomplete; its fixes are
items 13 to 20 and the sentences marked "review" in the earlier items. A
second review of that round, the same day, confirmed twelve more findings,
most of them commands the first version held and the reviewed one passed;
its fixes are items 21 to 29. A third review confirmed twelve again, nine
distinct ones, all of them in the matcher's own limits and in spellings next
to the second round's fixes; its fixes are items 30 to 38. Version 0.1.1,
the same day, closes what the check of those fixes left (item 39) and three
gaps every earlier version shared; its changes are items 40 to 49, written
to plan `plans/2026-11-16-motion-hold-0.1.1.md` (items A to J of that plan,
in its order). Where a later
item replaces what an earlier one says, the later item stands. Every case of
the plan's table (1 to 73) still gives the verdict the table names; the
first review's cases are rows 74 to 165 of `hooks/match.test.ts`, the second
review's rows 166 to 259, the third review's rows 260 to 322, and version
0.1.1's rows 323 on. Three of the third review's rows changed their verdict
in 0.1.1 and say so: 267 and 279 (a limit with no configured host named,
held since item 43) and 317 (a shape read in full since item 41).

A departure is one of two kinds. **Holds more:** a command the plan's rules,
read to the letter, pass is held. **Reads more exactly:** a command is read
the way the shell reads it, which holds some commands the letter passes and
passes some reads the letter holds; each such read is named. They are listed
so a later change to the plan's rules can be checked against them.

1. **Comments** (holds more). A `#` comment is set aside (so an apostrophe
   in one cannot swallow the next line as a quoted word); the site patterns
   and class A are still tried on its text; it exempts nothing. Review: a
   comment ends at its newline whatever stands before it (item 17).
2. **Prefixes** (reads more exactly). `if`, `elif`, `while` and `until` are
   looked through like `do` and `then`. Review: `function` is looked through
   with the name after it, and these flags take the next word as their
   value: `exec -a`; `time -o -f --output --format`; `env -u -C --unset
   --chdir`. Before, the flag's value was taken as the executable, which
   passed `exec -a ls ssh host 'sudo reboot'` and held a read behind
   `env -u NAME`.
3. **A remote shell whose target is a variable** with no value carried
   forward (item 14) marks the parse uncertain, so the raw text decides.
   Review (holds more): rule 3a then applies with the host the raw command
   names, so `for h in rig-1.local; do ssh $h bash < run.sh; done` is held
   as `unreadable`.
4. **A stop inside a wrapper** (holds more). Where one segment holds several
   commands (a program typing them into a pane), a class B word in a part
   that is not the stop still holds.
5. **Read-only set** (holds more). `rg --pre` and `sort --compress-program`
   are not exempt: both make the program run another one. Review: nor is a
   command with an assignment in front of it other than a locale or terminal
   setting (`LC_*`, `LANG`, `LANGUAGE`, `TZ`, `TERM`, `COLUMNS`, `LINES`,
   `NO_COLOR`, `CLICOLOR`, `CLICOLOR_FORCE`, `FORCE_COLOR`), since the value
   may name a program (`GIT_PAGER`, `GIT_EXTERNAL_DIFF`, `LESSOPEN`, `PATH`);
   nor `git` with `-c`, `--config-env` or `--exec-path` before its
   subcommand, or `--ext-diff`, `--textconv`, `-O` or
   `--open-files-in-pager` after it. A file a command of the set writes
   through its own arguments (`sort -o`, `sort --output`, the second file of
   `uniq`, `--output` of `git` and `diff`) ends the exemption and is tried
   against class A like a redirect to that file.
6. **Remote output redirected locally** (holds more)
   (`ssh host '...' > /dev/ttyUSB0`): the outer redirect is tried against
   class A, and the segment is not read-only.
7. **Web writes.** A short flag counts only at the start of a word (a host
   named `rig-d.local` is not `-d`). Added (holds more): short flags in a
   cluster (`-sX POST`, `-sd`), `--upload-file`, `--post-file`, `--method`,
   and `-T`. Review (reads more exactly): `-T` counts only where the text
   has `curl`; for `wget` it is a timeout, so `wget -T 5 <url>` on a
   configured host passes again, as the plan's own rule passes it.
8. **Services** (holds more). Flags between the program and its verb
   (`systemctl --user restart`, `docker -H <host> stop`), `try-restart` and
   `reload-or-restart`, `docker container stop`, `docker-compose`, flags
   before a compose verb, and `service <name> restart`.
9. **Unreadable input** (holds more). `echo "$CMD" | ssh host` counts as
   unreadable (an `echo` of nothing but variables is not a readable
   producer); `su`, `sudo -i` and `sudo -s` count as shells that read their
   standard input; a bare shell in any segment of the remote text counts;
   and a remote shell reached through a jump host
   (`ssh jump ssh host bash < file`) counts when the remote text names a
   configured host. Review:
   - a here-string or heredoc body that is nothing but variables or
     substitutions, fed to a remote side that reads its program from
     standard input (`ssh host <<< "$CMD"`, `ssh host python3 <<< "$CODE"`),
     through a jump host too, where a readable body is now also classified
     with the far host;
   - an executable in remote text that is nothing but a variable
     (`ssh host 'sudo $CMD'`, `ssh host "cd app && $CMD"`,
     `ssh host bash -c "$CMD"`);
   - not readable producers: a `printf` whose arguments after the format,
     or an `echo` whose words after its flags, are nothing but variables; a
     `cat` whose body is nothing but variables; any producer with a
     substitution; the last command of a parenthesised group; a command
     that stands after a case pattern or a function's name;
   - `/dev/stdin`, `/dev/fd/0`, `/proc/self/fd/0` and `-` as the operand of
     a shell or an interpreter are standard input, like no operand.
10. **A shell's `-c` string** is read together with the words after it.
    Review (reads more exactly): the flags in front of it are read as the
    shell reads them. Every `o` or `O` of a cluster takes the next word as
    its value (`-euo pipefail`), so the `-c` after such flags is found; a
    `c` inside a cluster counts (`-lc`); an `s` makes the shell read its
    standard input. Flags after the `-c` word are still read as part of the
    string, as before. For an interpreter, `-` ends the options whatever
    follows (`python3 - x 10`), and `-W`, `-X` (python), `-r`, `--require`
    (node) and `-r`, `-I` (ruby, perl) take a value; a `-c` or `-e` after
    one of those is still matched as it stands, not as code, as before. This
    holds `ssh host 'bash -euo pipefail' < run.sh` and passes the read
    `bash -euo pipefail -c "ssh host 'grep -c shutdown log'"`.
11. **Config.** A `hold` or `stop` pattern that matches the empty text, an
    empty entry, and a `stopCommand` that is not a list of words make the
    read broken. A word that starts with a dash is never a host.
12. **Time.** A long text must be read in time proportional to its length,
    inside a hook that cannot be interrupted. Review: where a pattern of the
    plan's table lets anything stand between two words
    (`tee ... /sys/class/gpio/`, `tee ... /dev/tty*`, `pio run ... upload`),
    the check is a function that passes over the text once. It has the
    table's meaning with no limit on the gap, lines included (the first
    implementation held the gap to one line and 400 characters, which let a
    padded or multi-line form pass). (The one bounded gap that was left,
    200 characters before a `docker compose` verb, is gone: item 37.) A
    command over 400,000 characters is not taken apart and nesting
    is followed eight texts deep: past either limit the raw text decides, as
    for any uncertain parse, and (review, holds more) a text that names a
    configured host is held as `unreadable`, because rule 3a is not a
    pattern and the raw text cannot show it.
13. **ssh options** (review). Reads more exactly: `ssh` (not `mosh`) goes on
    reading options after the host, with the same value flags, to the first
    word that is not an option or to `--`; `-P` takes a value. This holds
    `ssh host -T < run.sh` and passes the read
    `ssh host -t 'grep -c shutdown log'`. Holds more: the value of
    `-o RemoteCommand` is remote text, the values of `-o ProxyCommand` and
    `-o LocalCommand` are local commands, and `-o HostName` names the host
    where the target word names none (`-o Key=Value`, `-oKey=Value` and
    `-o "Key Value"`, the key in any case). With no words after the host the
    far side is still taken to read its standard input.
14. **Variables: rule 2a** (review). A segment that is nothing but
    `NAME=value` words, after `export` too, carries each literal value
    forward within its text: `$NAME` and `${NAME}` after it are read with
    the value in place, in words, redirect targets, here-strings and heredoc
    bodies the shell expands; an unquoted value is split at its blanks. A
    name is carried only when its value holds no variable and no
    substitution, is at most 2,000 characters, and the name stands nowhere
    else in the text as a bare word (so a loop variable, `read`, `+=`,
    `unset` or a second assignment stop it; since the third review such a
    value is carried as a weak one, item 34); one text expands at most
    20,000 characters (item 32). The text is then read twice, with the
    values in place and as written, and the readings are joined: every
    reason of either holds, and a segment is exempt only when both exempt
    it. Holds more:
    `BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move"` is tried
    against class B, `SSH="ssh rig-1.local"; $SSH 'sudo reboot'` is a remote
    shell. Reads more exactly, in one place only: the target of a remote
    shell. A carried value that names a configured host makes the parse
    certain, so `H=rig-1.local; ssh $H 'grep -c shutdown log'` passes like
    its literal spelling. A carried value that names no configured host
    leaves the parse uncertain, as before.
15. **Substitutions, `eval` and `trap`** (review, holds more). The text
    inside each `$( )`, backtick pair, `<( )`, `>( )` and zsh's `=( )` of a
    segment, in its words and in a heredoc body the shell expands, is
    classified as a command of its own; so is the string of `eval` and of
    `trap`. This is beside the segment's own verdict, never in place of it,
    and any reason found ends the segment's exemption. A heredoc body under
    an unquoted delimiter that holds a substitution makes its segment one
    with a substitution (rule 5), so `cat <<EOF` with `$(ssh host ...)` in
    the body is no longer exempt. Rule 5a: text that a readable producer
    feeds to a shell reading its standard input (`echo '...' | bash`) is
    also classified as the command it is.
16. **Case arms, function bodies and groups** (review, reads more exactly).
    A top-level `)` with words after it in the same segment closed a case
    pattern or a function's name: the command after it is judged by its own
    executable, and the words before it are tried as raw text with no
    exemption. Before, the pattern word was taken as the executable, so
    `test) ssh host 'ctl move x 1' ;;` passed as read-only. A read in a case
    arm or a function body (`status) ssh host 'grep -c shutdown log' ;;`)
    now passes, where a pattern word outside the read-only set used to hold
    it.
17. **Line continuations** (review, reads more exactly). A backslash-newline
    is no longer removed from the whole command before anything is matched.
    The scanner joins two lines between and inside words, in double quotes,
    and in a heredoc body whose delimiter is unquoted; not after a comment,
    not before a carriage return, not in a heredoc whose delimiter is
    quoted. Every pattern is tried on a text as written, with its
    continuations joined, and with quotes and backslashes removed. This
    holds a command on the line after `# note \`, and reads a quoted heredoc
    whose last line ends in a backslash as closed, where it used to be an
    uncertain parse.
18. **An interpreter beside a bare shell** (review, holds more). A body is
    an interpreter's code only when the interpreter is what reads standard
    input. Where the remote text names an interpreter that was given a
    script or `-c`, or names a bare shell as well
    (`ssh host 'python3 prep.py; bash' <<EOF`), the body is tried both ways:
    as code and as a command.
19. **Class A spellings** (review, holds more). A clobber redirect (`>|`,
    and `>&`) to a GPIO or serial path; a compound assignment to
    `input_pos`, `input_vel` or `input_torque` (`+=`, `-=`, `*=`, `/=`);
    macOS's `/dev/tty.*` twin of every `/dev/cu.*` device;
    `pio run --target=upload`.
20. **Signal 0** (review, reads more exactly). `kill`, `pkill` or `killall`
    followed at once by `-0`, `-s 0`, `-n 0` or `--signal 0` is not a `kill`
    reason: it sends nothing and only asks whether the process exists. Any
    other signal, or none, still is, and so is a text that has both forms.
    Narrowed by item 29.
21. **Two readings of one text** (second review, holds more). Items 22, 23
    and 26 change how the scanner cuts a text into words and commands. No
    command the reviewed version held may pass for that reason, so the
    scanner can still read a text the earlier way (every top-level `)` with
    words after it is a cut, a `(` always ends a word, a `${` ends at the
    first `}`, a continuation after a redirect sign loses the target). Where
    the newer reading parts from that one, the text is read both ways and
    the readings are joined like the two of rule 2a: every reason of either
    holds, and the text is exempt only when both readings exempt it. The
    earlier reading's own doubt adds the raw text's reasons (rule 7) and does
    not mark the verdict uncertain. The price is a few reads that stay held:
    `if (ssh host 'grep -c shutdown log') then echo ok; fi` is held, because
    the earlier reading tries the words before the `)` as raw text. One
    command reads a text a second time at most 64 times (the limit rule 2a
    already had); past it the raw text decides (and since the third review
    the command is held when it names a configured host: items 30 and 31).
22. **Parentheses** (second review, reads more exactly; replaces the premise
    of item 16). A `)` is a cut only where it ends a case pattern, in a
    `case ... in` clause the scanner follows through `case`, `in`, `;;`,
    `;&`, `;;&` and `esac`, or where an empty `()` stands after a function's
    name (with nothing before the name but `function` and the words rule 2
    looks through). The words before a cut are tried as raw text as before
    and are also read as a text of their own, and a segment with a cut is
    exempt only when that text is exempt too. A pair glued into a word is
    part of the word (zsh's `*(N)` and `x(N)`, an extglob `!(x)`, the group
    of a pattern in `[[ $x =~ ^(a|b)$ ]]`), and so is a `(` that opens a
    word behind a command (zsh's `ls (a|b)*`), except where a case pattern
    is due and after `for x`. What such a pair holds is read as a command of
    its own, and counts as a substitution, unless it is plain glob text:
    zsh runs code from a glob qualifier (`*(e:'command':)`). Any other `)`
    ends a group and its last command: a word after it starts a command of
    its own, as if a `;` stood there (`if (command) then`, `do (command)
    done`, zsh's `if (test) command` and `for x (list) command`), so the
    group's last command is judged in its own place in its pipeline. The
    `}` of zsh's `{ command }` and the `]]` of `if [[ ... ]] then` end their
    command the same way. Holds, among others,
    `ssh host 'bash -s' < run.sh *(N) ls` and
    `if (cat run.sh | ssh host bash) then echo ok; fi`.
23. **`${...}`** (second review, holds more). A `${` runs to the brace that
    closes it, past a nested `${ }`, `$( )`, backticks and quotes, so
    `"${X:-$(command | awk '{print $1}')}"` is one reference. A substitution
    inside the braces is noted inside double quotes as outside them, and
    there its text is taken out whatever single quotes stand around it
    (inside double quotes they do not quote). Inside double quotes two
    shells disagree on whether a single quote in the braces quotes: where
    both readings close, at different braces, the text cannot be taken
    apart and is decided like one nested too deep (item 12). Holds
    `echo "${OUT:-$(ssh host 'ctl move x 1')}"`, which the reviewed version
    passed as read-only.
24. **Errors, depth and work** (second review, holds more). An internal
    error of `classify` is decided like a text too long to take apart: every
    pattern on the raw text, and `unreadable` when it names a configured
    host. The two known causes are gone: quoted substitutions are followed
    200 deep inside one word and count as not closed past that, and lists
    of reasons are appended one by one. One call of `classify` may hand
    1,200,000 characters in all to its reader (three times the 400,000
    limit), nested texts counted each time they are read; past that the raw
    text decides, with the host the whole command names. Each distinct
    substitution, `eval` and `trap` text of a segment is classified once.
    Before, eight levels of `trap "eval $( ... )" EXIT` around a long
    harmless text took more than the ten seconds a hook has.
25. **Rule 2a, wider** (second review, holds more; extends item 14). A
    carried value is also put in place inside the text of a substitution
    and of a process substitution (the same shell expands it), in the
    string of `eval` and `trap`, and in the `-c` string, here-string and
    quoted heredoc body of a local shell, which inherits it: each such text
    is read with the values in place beside the text as written. Both
    readings of a heredoc body that was expanded keep their substitutions.
    An assignment is carried also behind `{`, `do`, `then`, `else`, `elif`,
    `if`, `while`, `until`, `!`, a case pattern and a function's name, and
    when made with `local`, `declare`, `typeset` or `readonly` (not under
    `-n`, `-i`, `-u`, `-l`, `-a`, `-A`, where the value kept is not the
    written one). A use of the name glued to a dash (`curl -H ...` beside
    `H=...`) is a flag and no longer stops the value. All of these are
    **weak** values: they add holds and name a host, and they do not make
    the target of a remote shell certain, which stays the privilege of a
    plain or exported assignment that is a command of its own and whose
    name stands nowhere else. So
    `{ H=rig-1.local; ssh $H 'grep -c shutdown log'; }` is still held as
    uncertain, as before.
26. **Line continuations, more places** (second review, reads more exactly;
    extends item 17). A backslash-newline is also joined after a redirect
    sign, before its target (`bash < \` and the file on the next line), the
    here-string and the heredoc delimiter; inside a redirect sign
    (`>\`+`|`, `<\`+`<`); between a file descriptor and its sign (bash; for
    zsh the number is a word, which is the earlier reading); between `$`
    and the `(` or the name behind it, and inside a variable's name. Inside
    `$'...'` the pair is kept for the next shell to join, as bash hands it
    on; zsh drops the backslash, which is the earlier reading, so both are
    read (item 21).
27. **A process substitution as a redirect's target** (second review, holds
    more). `command < <(other)` used to leave the redirect without a target
    and make `<(other)` a word of the command. It is now the target: the
    stage reads what `other` writes, so a bare remote shell fed that way is
    `unreadable` like one fed a file, and the text is tried against every
    class with the stage's host, like text piped in (rule 5a).
28. **A shell's options** (second review, reads more exactly; extends item
    10). bash's long options are read with one dash as with two (`-login`,
    `-noprofile`, `-norc`, `-posix`, `-restricted`, `-verbose`,
    `-noediting`, `-debugger`; `-rcfile` and `-init-file` with their
    value), where they were taken for clusters whose `o` swallowed the `-c`.
    Where that reader finds no `-c`, the first version's rule is tried as
    well (the first `-...c...` word starts the command string) and what it
    finds is read as a command beside the segment's verdict, which covers
    zsh's glued `-oshwordsplit`. The command string is read alone as well as
    together with the words after it, so `bash -c 'command' arg` no longer
    reads `arg` into the command. Passes again the read
    `bash -login -c "ssh host 'grep -c shutdown log'"`.
29. **Signal 0, narrowed** (second review, holds more). The exemption of
    item 20 holds only when no later word of the same command could name
    another signal: any word that starts with `-`, up to the next `;`, `&`,
    `|` or newline and before a lone `--`. Not counted: pkill's own match
    flags (`-f`, `-x`, `-i`, `-n`, `-o`, `-a`, `-e`, `-l`), and what stands
    inside a plain substitution (`kill -0 $(pgrep -f x)`). The spellings of
    signal 0 are each program's own: `-s 0` and `-n 0` for `kill`, `-s 0`
    for `killall`, neither for `pkill`, where they pick a session and the
    newest process.
30. **The reader's limits end in one rule** (third review, holds more).
    Wherever the reader stops short of reading everything for a reason of
    its own, it says so once for the whole call (`stopShort`), and
    `classify` acts on that in one place, at its end: the whole raw command
    is decided as rule 7 decides a text that cannot be taken apart. Every
    pattern is tried on it, a class A device path it names holds (a write
    through a command's own arguments or through a carried value is no
    pattern), and a command that names a configured host, in its text or
    through a value a stage was read with, is held as `unreadable`, with
    `isCertain` false. The reasons already found are kept. The limits: a
    command over 400,000 characters; a text more than eight texts deep;
    1,200,000 characters of reading in one call; 64 distinct texts read a
    second time (item 31); quoted substitutions nested past the 200 counted
    levels inside one word, which used to count as a quote that is not
    closed and swallowed the commands after it; the room for carried values
    (item 32) and a single value over 2,000 characters, which used to be
    left out without a word; the steps of the closing readers (item 33);
    and a text two shells close at different braces. Before, the second
    readings and the nest ended in the patterns alone, and the room for
    values and a value's length in nothing, so a remote shell fed a file
    passed behind seventy harmless lines. The price: a command that
    reaches a limit and names a configured host is held even when it only
    reads, and one that names a serial device or a GPIO path is held for
    it. A command that reaches a limit, names no configured host and shows
    no pattern passed, as before, until version 0.1.1: since then every
    limit holds the command, whatever it names, and a value over 2,000
    characters is a limit only where its name stands again in the command
    (item 43).
31. **Second readings are counted by text** (third review, holds more). The
    64 second readings of item 21 are 64 distinct texts: a nested text that
    is read again inside each reading of the text around it counts once,
    where it used to spend the budget twice per level (seven substitutions
    nested in one another spent it). The work stays bounded by the
    1,200,000 characters of item 24.
32. **Room for carried values** (third review, holds more). The 20,000
    characters of item 14 are kept three times: once for every use, as
    before, once for the words of the commands and once for the second
    copies of texts the shell reads again (item 25). A value is put in place
    while it fits in the first or in the room of its own kind, so ten uses
    of a long value inside substitutions no longer leave the words of the
    next command unread; where nothing fits, the reader has stopped short
    (item 30). Since version 0.1.1 the values that item 34 carries where
    nothing was carried before have the same three rooms of their own
    (item 42).
33. **Steps** (third review). The readers that close a quote, a `( )` and a
    `${ }` count their steps, the characters they pass over in a search for
    a closing quote or backtick included: 16 for each character handed to
    the scanner and 100,000 for the call. Reading takes one or two steps a
    character; a single quote inside `${...}` nested in one another made the
    reader read the inside twice at every level, so 27 levels (276
    characters) took over ten seconds. Such a text now runs out of steps
    instead of time, which is a limit like the others (item 30). Three
    searches that were asked again at every level or every pair are asked
    once: the first `}` behind a `${` (looked for inside the reference the
    reader has closed, where it used to be looked for to the end of the
    text), the last `}` of a text (noted once for each text), and whether a
    word of glued pairs (`x(N)(N)(N)...`) ends in `name=`. So a command of
    400,000 characters in any of these shapes is read in about a tenth of a
    second, where 130,000 glued pairs took over two seconds. Other shapes
    still took quadratic time, and the step budget itself cost a hold
    (item 39); version 0.1.1 reads the quoted shape once (item 41), which
    leaves the budget a last resort, and reads the other shapes in one pass
    (item 46).
34. **Weak values never take a hold away** (third review, holds more;
    extends item 25). Where a weak value names no configured host, a remote
    shell whose target it is stays an unresolved target for rule 3a (the
    shell may not use that value at all), and an executable in remote text
    that is a weak value stays input that cannot be read. Weak as well, and
    carried where they used not to be carried at all: a name that some
    declaring word names without a value (`local url`, then `url=...` on
    the next line; `export B` before or after `B=...`), which the one-use
    guard counted as a second assignment; a name that stands elsewhere in
    the text as a bare word (assigned twice, a loop variable, `read NAME`,
    or a word that merely equals it, such as `dev` beside `/dev/ttyUSB0`);
    and a value put together from a weak one (`H=$A` after `{ A=...; }`),
    which used to count as certain. Only a plain or exported assignment
    whose name stands nowhere else still makes a target certain. The price:
    a stale value can add a hold (`f=/dev/ttyUSB0`, later a loop
    `for f in *.txt` that writes to `"$f"`), and a value carried this way
    took room that the second review's version did not spend (item 39),
    until version 0.1.1 gave such values a room of their own (item 42).
35. **A subshell is a group** (third review, reads more exactly; corrects
    item 22). A `(` behind `time` (and its `-p`), right behind a function's
    `()` and behind the pattern of a case arm opens a group, where the
    second review's reading took it for zsh's glob group and made the whole
    subshell one word. Passes again reads such as
    `time (ssh host 'grep -c shutdown log')`, which that version held, and
    holds `time (ssh host bash) < run.sh` by its own reading, where it was
    held only through the earlier one. A `(` in those places that is never
    closed leaves the parse uncertain, as it did.
36. **Signal 0, behind a redirect and a quote** (third review, holds more;
    extends item 29). The search for a later signal option does not end at
    the `|` of a clobber redirect (`kill -0 <pid> 2>| /dev/null -s KILL`),
    nor at a `|`, `;`, `&` or newline inside a quote or behind a backslash
    (`pkill -0 "a|b" --signal 9`). A quote counts as opened only where it
    starts a word or stands behind `=`: the text in hand may begin inside a
    quoted string of the command around it, whose closing quote opens
    nothing. (Version 0.1.1 adds a second search for a command that stands
    outside every quote of its text: item 44.)
37. **Substitutions in braces, and two caps removed** (third review, holds
    more). Inside the braces of a `${...}` a process substitution is read as
    one (`${A:-<(command)}`; bash runs it outside double quotes, and the
    same spelling inside them is held alike), and so is the command form
    `${ command; }` and `${| command; }` of bash 5.3, ksh and mksh, in a
    word, in double quotes and in a heredoc body (inside another reference
    outside double quotes only since version 0.1.1: item 45). The `docker compose` verb
    is found however far along its command it stands (a check that passes
    over the text once, like the ones of item 12). A variable's name may be
    of any length where a text is asked whether it is nothing but
    variables; past 79 characters it used to count as text.
38. **What is left** (third review). Under a limit, a hold that the raw
    text does not show was missed: a site command put together from a
    carried value, and a command on a configured host whose name is split
    between a value and its use, behind a quoted nest the reader cannot
    follow, once the room for values is spent, or once the steps are spent
    (item 39). Version 0.1.1 holds every command that reaches a limit
    (item 43), so this is closed. An assignment on a line of
    its own inside a compound command, or inside `( )`, counts as a plain
    one. Input given to a group over several lines, or handed on by a
    process substitution (`tee >(ssh host bash)`), is not followed. `time`
    behind another prefix (`sudo time (...)`) and zsh's `time { (...) }`
    stay held as before. All are listed in the README.
39. **What the check of the third review's fixes left** (2026-11-16; no
    high finding). All six were listed in the README of version 0.1.0 under
    "Found by the last review and not fixed yet" and are fixed in version
    0.1.1, in the order below: items 40, 41, 42, 44, 45 and 46.
    - `time -p` and an assignment: `push` looks through `-p` behind `time`,
      and the look-through loop of `noteAssignments` does not, so
      `time -p (NAME=value; ...)` and `time -p { NAME=value; ...; }` carry
      no value. The version before this round held the `( )` form, by
      reading the subshell as a text of its own.
    - The step budget of item 33 runs out at about 14 levels of a single
      quote inside nested `${...}` in double quotes, where the version
      before this round still read the text (in milliseconds at that
      depth; in ten seconds at 27 levels). Past it the closing readers
      report "not closed" and the rest of the text is decided by the raw
      command, which loses a hold put together from a carried value.
      Keeping the result of `closeBrace` for each text, start and quoting
      would read the shape in linear time and leave the budget a backstop.
    - The values of item 34 that are newly carried as weak are charged to
      the same room as every other value (item 32), so 20,000 characters
      of their uses leave a later value out, where the version before this
      round did not carry them and spent nothing.
    - Signal 0 (item 36): a quote opened in the middle of a word, a
      `$'...'` quote and a `${...}` still end the search for a later
      signal option at a separator inside them, and so does zsh's `&>|`.
    - Item 37's command form is read in `readDouble` and not in `readWord`
      where it stands inside another `${...}`.
    - Quadratic time: the class B patterns with a run of flags (systemctl,
      docker, the http client) restart at every repeat of the program
      word; `isFunctionHead` tests a long last word at every empty pair;
      `endsInAssign` re-reads a word at every pair behind a letter; and
      `lastBraceOf` compares two long equal texts at every `${`. The first
      is as old as the mod, the second and third came with the second
      review's fixes, the fourth with this round's.
40. **`time -p` and an assignment** (version 0.1.1, holds more; plan item
    A). The look-through of `noteAssignments` passes the `-p` of `time`,
    as `push` does (and a `--` behind it), so `time -p (NAME=value; ...)`,
    `time -p { NAME=value; ...; }` and the bare `time -p NAME=value; ...`
    carry the value, as a weak one like every value behind `time`. The
    version before 0.1.0 held the `( )` form by reading the subshell as a
    text of its own; the brace and bare forms passed in every version.
    What the check of this version found in this item is in item 50.
41. **A closed brace is closed once** (version 0.1.1, reads more exactly;
    plan item B). `closeBrace` keeps its answer for each text, start and
    way of quoting. A single quote inside `${...}` nested in double quotes
    has every level asked for twice by the level around it (the two
    shells' readings of item 23), which doubled the work at every level:
    the version before 0.1.0 took ten seconds at 27 levels, and 0.1.0 ran
    out of the steps of item 33 at 14, where it held a command that names
    a configured host and passed one that names none. The shape is now
    read once, in time proportional to its length, up to the nesting limit
    (100 levels). So a hold put together from a carried value behind it is
    made again, and a read on a configured host behind it passes again
    (rows 317 and 342). The notes are forgotten at the start and the end
    of every scan, because a reader marks on the scan in hand what it
    meets (a reading that parts from the earlier one, braces two shells
    close differently), and an answer found while a limit was reached is
    not kept. The step budget stays as a last resort: over the generated
    commands of the round the readers took at most 2.9 steps for each
    character read, against the 16 allowed.
42. **A room of their own for the values carried since 0.1.0** (version
    0.1.1, holds more; plan item C; corrects item 34). A value that item
    34 carries as a weak one where the version before carried nothing (its
    name stands elsewhere as a bare word or is declared without a value,
    the assignment stands behind `time`, or the value was put together
    from such a value) takes its room from three rooms of its own, never
    from those of item 32. So every value the version before 0.1.0 put in
    place still is, whatever these values spend: a 100-character value of
    that kind used 200 times no longer leaves `M=move; ctl $M x 1` unread.
    Reads more exactly as well: a read on a configured host beside values
    of both kinds, each within its room, passes where 0.1.0 held it for
    the one room they shared.
43. **Every limit holds the command** (version 0.1.1, holds more; plan item
    D; corrects items 30 and 38). Where the reader stopped short anywhere,
    and where the matcher failed on a command, the command is held as
    `unreadable` with `isCertain` false, whether or not it names a
    configured host; the reason carries the host when the command names
    one and no host otherwise (`unread`). Before, such a command passed
    when it named no configured host and showed neither a pattern nor a
    device path, which let a site command put together from a carried
    value pass behind a quoted nest (the one hold of the version before
    the second review that was still lost). The price is that a harmless
    command that reaches a limit is held: the plan of 0.1.0 found that
    none of the 63,895 distinct commands of the history its limits were
    measured on reached one (not measured again for the two limits this
    version adds or moves). So that this holds little that is harmless, a
    literal value over 2,000 characters is a limit only where its name
    stands again: where a use of it is read (in a word, a heredoc body, or
    the second copy of a text the shell reads again, in any spelling
    behind a `$`: `${NAME@Q}` and `${OTHER:-$NAME}` too), and wherever
    else the name stands in the command or in a text read out of it, other
    than as the name being assigned (`namesLong`: a bare name in
    arithmetic, a function written before the assignment, the name as the
    value of another name, `echo NAME`). The matcher does not work out
    which of those the shell reads the value through, so each of them is
    the limit, in whatever order the texts were read (rows 363 and 364).
    Nowhere when the name stands nowhere else:
    `X=<2,001 characters>; ls -la` passes, and so does a read on a
    configured host beside such a value, which 0.1.0 held. Left: a name
    the command works out where its text does not show it
    (`eval "echo \$UR$(echo L)"`); a name put together from carried
    pieces is seen, because the copy of the text with the values in place
    spells it. Existing assertions changed with this item: rows 267
    and 279, the limit shapes beside `ls -la`, a command over 400,000
    characters with no host, the internal error on `make test`, and the
    shapes of the speed tests that reach a limit; each says so where it
    stands in the test file.
    What the check of this version found in this item is in item 50.
44. **Signal 0, a separator inside a word** (version 0.1.1, holds more;
    plan item E; extends item 36). Where the program stands outside every
    quote of its text (the text is read from its start for `'...'`,
    `"..."`, `$'...'`, backslashes and comments), the words after signal 0
    are also read as a shell reads them: a quote may open anywhere in a
    word, `$'...'` is one, a backslash takes the next character with it,
    and a blank or a `|`, `;`, `&` or newline inside a quote, inside the
    braces of a `${...}` or inside a pair of parentheses opened in the
    command belongs to its word. This search only adds to the one of item
    36, which is kept as it was: a later option found by either makes the
    command a kill. Where the program stands inside a quoted string of the
    text around it, only the search of item 36 is made, so
    `echo 'kill -0 2186 2>/dev/null' | ssh $H bash -s` is read as before.
    The scanner reads zsh's `&>|`, `&>>|`, `>>|` and `>&|` as redirect
    signs (bash takes the `|` for a pipe, which is the earlier reading and
    is still made). Holds `pkill -0 -f x"a|b" --signal 9`,
    `kill -0 $'a;b' -s KILL`, `kill -0 <pid> ${X:-;} -s KILL`,
    `pkill -0 $((P|0)) --signal 9` and `kill -0 <pid> &>| /dev/null -s KILL`
    on a configured host, which the first version held and every later one
    passed. Left: `$[P|0]`, where the scanner cuts the command at the `|`,
    and a line continuation inside `&>|`.
    What the check of this version found in this item is in item 50.
45. **The command form inside another reference** (version 0.1.1, holds
    more; plan item F; completes item 37). `readWord` tests the text of a
    reference for `${` followed by a blank, a newline or `|`, as
    `readDouble` did, so `${A:-${ command; }}` and `${A[${ command; }]}`
    outside double quotes are substitutions whose text is a command.
46. **Time, four places** (version 0.1.1; plan item G; completes item 12).
    No verdict changes. The three class B patterns with a run of flags
    between a program and its verb (systemctl twice, docker) and the
    method word behind `http` and its flags are checks that pass over the
    text once (`afterFlags`): the pattern started again at every repeat of
    the program's word and read the run to its end each time. The check
    gives the match the pattern gives, the backtracking included (a word
    behind a flag is taken for its value first, and a verb that stands
    there is the match when nothing follows that way); it was compared
    with the patterns on a million generated texts. `isFunctionHead` reads
    a word once however many empty pairs follow it. `readWord` keeps the
    last three characters of its word and whether it starts with `name=`
    beside the word, where asking the word itself at every pair of
    parentheses, or at every value put into it, read the whole word again.
    `lastBraceOf` notes the string in hand where it equals a noted one, so
    two long equal texts are compared once. Each of the shapes of the
    finding, and four more found beside them, is read in under a tenth of
    a second at 399,000 characters, where the slowest took 29 seconds.
47. **A carried value through another form of reference** (version 0.1.1,
    holds more; plan item H; extends items 14 and 25). `${NAME%word}`,
    `%%`, `#`, `##`, `/`, `//`, `^`, `^^`, `,`, `,,`, `${NAME:offset}`,
    `:-word`, `-word`, `:=word`, `=word`, `:?word` and `?word` are read
    with the carried value of `NAME` in place, and `:+word` and `+word`
    with `word` in place, in a word, in double quotes and in the copies of
    texts the same shell reads again (`formValue`, `expandBody`). The value
    stands in place unchanged: what `%` or `/` would take off it or put in
    its place is not worked out (the plan allows applying `%` and `#`
    exactly as a further spelling; that is not done). A value read this way
    is a weak one (item 34): it adds holds and names a host, and a remote
    target known only through it stays uncertain. It takes its room from
    the rooms of item 42, so no value an earlier version put in place is
    left out for it. Read as written, as before: a name with no carried
    value or an empty one, a form whose word holds a variable or a
    substitution (the substitution is still read as one, item 23), and the
    forms not listed. Before, every such reference was an unknown variable,
    so `BASE=http://rig-1.local:8080; curl -X POST "${BASE%/}/api/move"`
    was not tried against class B in any version.
    What the check of this version found in this item is in item 50.
48. **A name with more than one literal value** (version 0.1.1, holds more;
    plan item I; extends item 34). The reading with values in place keeps
    the value written last before each use, exactly as before. Where a
    literal value of a name replaces another one and a use of the name is
    read after that, the text is read once more for each such earlier
    value (each distinct value once), with that value kept in place from
    its assignment on whatever is assigned to the name later (`Pin`,
    `alsoEarlier`). Such a reading only adds its reasons: it exempts
    nothing, makes no target certain, takes no reason away, and its own
    doubt adds the raw text's reasons without making the verdict uncertain
    (like the earlier scanner's reading, item 21). The texts inside it get
    no further readings of their own. One command makes eight further
    readings, each counted against the work of item 24; past either the
    reader has stopped short (item 43). Holds the usual override,
    `DEV=/dev/ttyUSB0; [ -n "$SIM" ] && DEV=/tmp/sim.txt; echo G1 X10 > "$DEV"`,
    which passed in every version. Left: a later value that is not a
    literal forgets the earlier one, as before, and the earlier values of
    two names are not tried together.
    What the check of this version found in this item is in item 50.
49. **More words that stand before a command** (version 0.1.1, holds more;
    plan item J; extends item 2). `sshpass`, `doas`, `flock`, `setsid`,
    `watch`, `xargs`, `ionice`, `chrt`, `strace`, `unbuffer`, `builtin`,
    zsh's `repeat`, `noglob` and `nocorrect`, and `coproc` are in a second
    table beside the prefixes (`WRAPPERS`), each with the flags of its own
    that take a value; `chrt` takes a priority, `repeat` a count and
    `flock` a lock file before the command. `commandOf` reads the two
    tables with one loop. Unlike the prefixes of rule 2, these words are
    looked through in a second reading of the segment only (`judge`): the
    segment is first judged with the word taken for its program, as every
    earlier version judged it, and then with the command behind the word,
    and the second reading adds its reasons (and, for the stages before it
    in a pipeline, that a shell behind the word reads its standard input).
    Looking through them in the first reading would have passed reads that
    0.1.0 holds (`sshpass -p x ssh host 'grep -c shutdown log'`, held for
    the word in its raw text), which this version may not do. The
    arguments of `watch` together, and the value of flock's `-c`, are a
    command text for a shell and are classified as one, like the string of
    `eval`. `xargs` runs its template with arguments that are not in the
    text: a template that is a remote shell on a configured host, and on a
    configured host any template that is not exempt as a read, is held as
    `unreadable`. There a template whose program is `readlink`, `realpath`,
    `basename`, `dirname`, `md5sum`, `sha1sum`, `sha256sum`, `sha512sum`
    or `cksum` is a read as well (`TEMPLATE_READS`): these print what
    they read whatever arguments they are handed. The set is asked about
    in that one place and is not part of rule 5's set, so no other
    verdict changes; one such read stood in the owner's command history
    and was the only command there whose verdict this version changed.
    Holds `sshpass -p x ssh host bash < run.sh`,
    `cat run.sh | setsid ssh host bash` and `ssh host 'doas bash' < run.sh`,
    which passed in every version.
    What the check of this version found in this item is in item 50.
50. **What the check of version 0.1.1 left** (2026-11-17; no high finding;
    nothing was changed in the code after it). Twelve findings were
    confirmed, seven medium and five low, which are the eight defects
    below; the README lists each under "Found by the check of 0.1.1 and
    not fixed yet", and the gaps every version shares that the check
    named are in the list above that.
    - A value put in place hides a hold (items 40 and 47; against the
      rule of item 34 that a weak value never takes a hold away). The
      scanner joins two readings: every carried value in place, and none.
      Item 47 puts the value of a form in place where 0.1.0 left the form
      as written, and item 40 carries the value behind `time -p`. Where
      such a value is a read-only program standing as the command word,
      the reading with values in place is exempt by rule 5 and the
      reading as written shows no target, so the hold that 0.1.0 made
      with the target's value in place beside the form as written is
      gone. Of 509,335 random mixed commands of the check, 190 that 0.1.0
      holds pass, all of this class. The plain spelling (`$DRY`) passes
      in every version. A third reading that only adds reasons (the
      certain values in place, every weak one as written) would give the
      holds back.
    - A long value through a name the text does not show (item 43):
      `namesLong` looks for the name as written, so an `eval` that builds
      the name, `${!N}`, `declare -n`, `${!PREFIX*}`, a line continuation
      inside the name and an exported value read by a child program reach
      no limit. 0.1.0 held them by stopping at the assignment.
    - Item 47 in text that is read again: `formValue` takes any word
      without a `$`, a backtick or a process substitution, and
      `BODY_REFERENCE`, which makes the second copies, only a word without
      a quote, a backslash, `<`, `>`, `{` or `}`.
    - The bound of item 48: `MAX_FURTHER` (8) is counted over all names of
      the command, and an earlier value is queued whenever a later literal
      replaces it, also where it could not reach a later use. The work
      budget of item 24 already bounds the time (about 0.2 s in the
      check's worst case), so the count could go.
    - The template rule of item 49: on a configured host every template of
      `xargs` outside rule 5's set and `TEMPLATE_READS` is held, a read
      too, and a template of rule 5's set is held where a later stage of
      its pipeline is outside that set (rule 5's exemption is asked for
      the rest of the pipeline as well). The plan asked only that `xargs`
      be looked through.
    - `TEMPLATE_READS` is asked about the program alone, so an assignment
      in front of it does not end the exemption as it does under rule 5.
    - `--max-lines` is in the list of the flags of `xargs` that take a
      value as a second word; GNU `xargs` takes it glued on only.
    - The exact search of item 44 is made only where the kill command
      stands outside every quote of the text in hand.

## Where the mod goes past the plan's texts

- The STOP toasts end with ` · /motion stop` (the house rule: a toast that
  follows a press names its twin). A stop command that exits non-zero reads
  `STOP failed: <first line of stderr, else the exit code>`.
- `/motion stop` from an origin that is not the person answers `Only the
  person can send STOP.`; `/motion run` and `/motion cancel` answer the
  plan's `Only the person can answer a hold.`
- The hold kit is handed an object that spells out each `$` call
  (`holdEngine` in `hooks/register.tsx`): engine 2.1.325 refuses a module
  that passes `$` itself to a method.
- A poll whose `sleep` exits non-zero ends the hold as an error, so a wait
  that cannot sleep does not spin.
- With no `HOME` and no `config` option, and for a `config` option that is
  not an absolute path, the config reads as broken.
- The gate also covers the Monitor tool (`tool.call` on `Bash` and
  `Monitor`), which the plan's first text did not name. Monitor runs a shell
  command as a watch, and the goal is that every shell or SSH command that
  moves hardware is held. A Monitor call with a command is judged as a Bash
  command is; one that only opens a WebSocket passes; an approved watch is a
  background entry in `active`. The card adds a line naming the tool, and
  the deny text says the command was a Monitor watch.
- The kit closes the hold's pane whenever `$.ui.open` resolved, placed or
  not: a pane that is not placed waits undrawn for a wider terminal and
  would otherwise appear later as an empty, focused card.
- The kit records `shownAt` on the slot (the engine clock time when the
  card went on screen; null while waiting) and exports `READ_MS` (1500) and
  `canApprove(slot, now)`. `/motion run` approves only a hold that
  `canApprove` accepts and otherwise answers `A new hold just appeared: read
  it, then answer again.` `/motion cancel` and the pane's buttons are
  unchanged. The send-gate mod applies the same rule from its byte-for-byte
  copy of the kit.

## Look

The ` ■ MOTION  ` chip is the house chip (bold `#0b0b0f` on a colour, eleven
cells); its red, `#f38ba8`, is the Catppuccin Mocha red the strip mod uses.

## Config

The site's hosts, command patterns and stop command are not in this repo.
They live in a local file (`<HOME>/.claude/motion-hold.json`). The repo holds
a neutral example only: `examples/motion-hold.example.json`.
