# motion-hold

Holds any Bash call, and any Monitor watch that runs a command, that would
move, energise or restart lab hardware until you approve that one call, and
shows a STOP row while an approved call runs.

```
╭──────────────────────────────────────────────────────────────────────────╮
│ ■ Motion Hold                                                            │
│ Would run a site motion command on rig-1.local                           │
│ Host rig-1.local                                                         │
│ Command ssh rig-1.local 'ctl move x 10'                                  │
│ [ Cancel ]  [ Run once ]                                                 │
│ Enter or 2 cancels. Tab then Enter runs it once. Refused after 120 s.    │
│ Twins: /motion run, /motion cancel.                                      │
╰──────────────────────────────────────────────────────────────────────────╯

 ■ MOTION   run a site motion command on rig-1.local · since 14:02:11   [ s: STOP ]
```

It is a guard against a mistaken command, not a sandbox against a determined
one. Read "What it cannot see" below before relying on it.

## What happens

- Every Bash call, and every Monitor call that runs a command (a watch whose
  output lines are events), is read before it runs: the main loop's, a
  subagent's, a Workflow agent's and a background launch alike, in every
  permission mode. A Monitor command is judged exactly as a Bash command
  is, and its card says that a watch would run it. A Monitor call that
  opens a WebSocket and runs no command is not held.
- A command that matches a rule is **held**. A card opens in a pane with
  Cancel (focused, hotkey `2`) and Run once. Where the pane cannot be placed
  (a narrow terminal), the engine's question dialog asks instead, with the
  same two answers. A notification says a command is waiting. The pane is
  closed when the hold ends, also on a narrow terminal where it was opened
  but never drawn, so no empty card appears when the terminal is widened
  later.
- **One call per approval.** Run once approves that call and nothing else:
  the same command a second later is held again.
- **Fail closed.** No answer within the time limit, a dismissed dialog, any
  answer but Run once, an interrupted turn, an error in the gate and an
  unreadable config file all refuse the call, and the model is told not to
  retry it unless you ask.
- One hold is asked at a time; a second held call waits for the first.
- While an approved call runs, the ` ■ MOTION  ` row shows what it does and
  since when. A background launch, and an approved Monitor watch (which
  outlives the call that starts it), keeps its row until you clear it.
- Reads, logs, status and searches are not held, with two exceptions that
  hold a command without reading it through: a command that reaches one of
  the matcher's limits, and on a configured host a read through `xargs`
  whose template is not a known read (both under "How a command is
  read"). A stop command passes, unless the command it stands in reaches
  a limit: then the whole command is held like any other.

## What is held

Class A rules apply anywhere, local or remote. Class B rules apply only to
text that names a host of your config (a remote shell to it, a URL on it, or
text piped toward it).

| Kind | Class | Held when the text has |
| --- | --- | --- |
| `site` | your config | a match of one of your `hold` patterns |
| `modbus-write` | A | `write_register(`, `write_registers(`, `write_coil(`, `write_coils(` |
| `motor-api` | A | `.requested_state =`, `.input_pos =`, `.input_vel =`, `.input_torque =`, and `+=`, `-=`, `*=`, `/=` on those three inputs |
| `gpio-set` | A | `gpioset`, `pinctrl set`, `raspi-gpio set`, `GPIO.output(`, a redirect (`>`, `>>`, `>\|`) or `tee`/`dd` into `/sys/class/gpio/` |
| `serial-write` | A | a redirect or `tee`/`dd` into `/dev/ttyUSB*`, `ttyACM*`, `ttyAMA*`, `ttyS*`, `/dev/cu.*` or `/dev/tty.*` (the macOS names of a USB serial device); code with both `serial.Serial(` and `.write(` |
| `flash` | A | `esptool`, `openocd`, `dfu-util`, `st-flash`, `avrdude`, `pio run -t upload` (also `--target upload` and `--target=upload`) |
| `service` | B | `systemctl restart/stop/start/reload/kill`, `docker restart/stop/kill/rm`, `docker compose up/down/restart/stop`, `service <name> restart/stop/start/reload` |
| `power` | B | `reboot`, `shutdown`, `poweroff`, `halt` |
| `kill` | B | `kill`, `pkill`, `killall`, unless the signal is 0 and nothing after it could name another: `kill -0 <pid>` (also `kill -s 0`, `pkill -0`, `killall -0`) sends nothing and only asks whether the process exists. A later option makes it a kill again (`kill -0 -s KILL <pid>`, `pkill -0 -f x --signal 9`), wherever it stands in the same command: behind a redirect (`kill -0 <pid> 2>\| /dev/null -s KILL`, zsh's `&>\|`, `>>\|` and `>&\|` too) and behind a `\|`, `;` or `&` that is quoted, escaped or stands inside a word: in a quote opened in mid-word (`x"a\|b"`), in `$'...'`, in the braces of a `${...}` or in a pair of parentheses (`$((P\|0))`). For `pkill`, `-s 0` and `-n 0` are no signal at all (a session, the newest process). The spellings this still misses are under "What it cannot see" |
| `http-write` | B | `curl`, `wget`, `http` or `https` with a write: `-X POST/PUT/PATCH/DELETE`, `--request`, `-d`, `--data`, `--json`, `-F`, `--form`, `--upload-file`, `--post-data`, `--post-file`, `--method`, or `http POST ...`; `-T` with `curl` (for `wget` it is a timeout) |
| `unreadable` | B | input the host's shell would run and this mod cannot read: `ssh host bash < file`, `ssh host bash < <(cat file)`, `cat file \| ssh host`, `ssh host "$CMD"`, `ssh host <<< "$CMD"`, `printf '%s\n' "$CMD" \| ssh host`, a command on the host whose program is a variable (`ssh host 'sudo $CMD'`), and what `xargs` hands to a remote shell (`... \| xargs ssh host`) or, on the host, to a template that is not a known read (`ssh host '... \| xargs rm'`, and a read such as `xargs zcat` too) |
| `unreadable` | any command | **a command the matcher could not read in full is held, whatever it names**: it reached one of the matcher's own limits (listed under "How a command is read"), shells read a piece of it differently, or the matcher failed on it. The card names the configured host when the command names one, and no host otherwise |
| `config-error` | - | the config file is broken and the command has `ssh`, `mosh` or a class A match |

`tee` or `dd` counts when the path follows it before the next `|`, `;` or
`&`, however far along and on whatever line (an argument list laid out one
word per line is one command). A file that a read-only command writes through
its own arguments (`sort -o <file>`, `uniq <in> <out>`, `git ... --output=<file>`)
is tried like a redirect to that file.

How a command is read:

- It is split at `;`, `&&`, `||`, `|`, `&` and newlines, with quotes,
  heredocs and here-strings respected. Each part is judged on its own;
  `sudo`, `nohup`, `timeout`, `env`, `nice`, `time`, `exec` and the like are
  looked through, with the flags of theirs that take a value. After a case
  pattern (`start) command`) or a function's name (`f() { command`,
  `function f { command`) the command is what is judged; the words before it
  are read as a text of their own and tried against the rules.
- **More words that stand before a command** are looked through as well:
  `sshpass`, `doas`, `flock`, `setsid`, `watch`, `xargs`, `ionice`, `chrt`,
  `strace`, `unbuffer`, `builtin`, zsh's `repeat`, `noglob` and `nocorrect`,
  and `coproc`, each with the flags of its own that take a value
  (`sshpass -p <password>`, `flock -w <seconds> <lock file>`,
  `chrt -f <priority>`, `repeat <count>`). So
  `sshpass -p x ssh rig-1.local bash < run.sh` is held as `unreadable` like
  the command behind the word. This is a second reading that only adds
  holds: the part is also judged with the word taken for its program, as
  before, so `sshpass -p x ssh rig-1.local 'grep -c shutdown log'` stays
  held for its `shutdown` (the same read with no word before it passes).
  `watch` hands its arguments to a shell, and so does `flock ... -c`: that
  string is read as a command, like the string of `bash -c`. `xargs` runs
  its template with arguments that are not in the text: where the template
  is a remote shell on a configured host, or the `xargs` stands in text run
  on a configured host and its template is not a known read (`xargs rm`,
  `xargs sudo`, `xargs -I{} sh -c {}`), those arguments are input that
  cannot be read. Two kinds of template pass on the host. One is a program
  of the read-only set (the bullet on reads below) with nothing after it in
  the pipeline that is outside that set: `ls | xargs wc -l` and
  `... | xargs grep -h ERROR | sort | head -3` pass, and the same `grep`
  with `| awk ...` after it is held. The other is `readlink`, `realpath`,
  `basename`, `dirname` or a checksum program (`md5sum`, `sha1sum`,
  `sha256sum`, `sha512sum`, `cksum`), whatever follows it. Every other
  template is held there, a read too: `xargs zcat`, `xargs jq .status`,
  `xargs docker inspect`, `xargs -n1 systemctl is-active`. The same read
  written without `xargs` passes (`docker inspect $(docker ps -q)`, a
  `for` loop), and so does `xargs` on this machine.
- **Parentheses.** A `)` ends a case pattern only inside a `case ... in`
  clause, and an empty `()` after a name defines a function. A pair glued
  into a word belongs to the word (zsh's `*(N)`, an extglob `!(x)`,
  `ls (a|b)*`); what stands inside it is read as a command unless it is
  plain glob text, since zsh can run code from a glob qualifier. Any other
  `)` ends a group, and with it the group's last command, also where no `;`
  follows: `if (command) then ...`, `do (command) done`, zsh's
  `if (test) command`. The same holds for zsh's `{ command }` and
  `if [[ ... ]] then ...`. A `(` behind `time` (and its `-p`), behind a
  function's `()` and behind a case pattern opens a group like any other:
  `time (command)`, `f() (command)`, `b) (command) ;;`.
- `ssh host '...'` and `mosh host -- ...`: the remote text is read as a
  command of its own, on that host. So is a heredoc or here-string fed to it.
  ssh's options are read where ssh reads them, after the host too
  (`ssh host -t '...'`). `-o RemoteCommand=...` is remote text,
  `-o ProxyCommand=...` and `-o LocalCommand=...` are local commands, and
  `-o HostName=...` names the host.
- `bash -c '...'` and a shell fed a heredoc: that text is read as a command,
  with the shell's own flags read as the shell reads them
  (`bash -euo pipefail -c '...'`, and bash's long options written with one
  dash: `bash -login -c '...'`). The command string is read alone and
  together with the words after it (`bash -c '...' arg`). The strings of
  `eval '...'` and `trap '...' EXIT` are read the same way.
  `python3 -c '...'`, `node -e`, a heredoc fed to an interpreter: that text
  is code; the site patterns and class A are tried on all of it, class B only
  inside its string literals (so `sock.shutdown()` is not a reboot, and
  `os.system("reboot")` is).
- **Substitutions.** The text inside `$( )`, a pair of backticks, `<( )`,
  `>( )` and zsh's `=( )` is read as a command of its own wherever it stands:
  in a word, inside double quotes, inside the braces of a `${...}`
  (`"${OUT:-$(...)}"`), and in a heredoc body the shell expands (`<<EOF`; a
  body under `<<'EOF'` is taken as it stands). So
  `OUT=$(ssh rig-1.local bash < run.sh)` is held like the command inside it.
  A process substitution that is a redirect's target (`command < <(other)`)
  is input fed to `command`, like a pipe into it. Inside the braces of a
  `${...}` a process substitution is read too (`${A:-<(command)}`), and so
  is the command form of newer shells, `${ command; }` and `${| command; }`,
  also where it stands inside another reference (`${A:-${ command; }}`).
- **Variables.** A literal `NAME=value` is carried forward: `$NAME` and
  `${NAME}` after it are read with the value in place. The assignment may be
  made with `export`, `local`, `declare`, `typeset` or `readonly`, and may
  stand behind `{`, `then`, `do`, `else`, `time` (and its `-p`), a case
  pattern or a function's brace. So
  `H=rig-1.local; ssh $H '...'` and
  `BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move"` are read like
  their literal spellings, also where the variable stands inside a
  substitution (`RESP=$(curl -X POST "$BASE/api/move")`), a process
  substitution, the string of `eval` or `trap`, or the `-c` string or heredoc
  of a local shell. The text is also read as written, and either reading can
  hold: a carried value can add a hold and can name the host of a remote
  shell, and takes no hold of the text as written away
  (`CMD='ls'; ssh rig-1.local "$CMD"` is held as `unreadable` like any
  `ssh rig-1.local "$CMD"`). Those are the two readings: every carried
  value in place, and none. A hold that shows only with one value in place
  and another left as written is not made (the first entry under "Found by
  the check of 0.1.1" below). One exception: a
  plain or exported assignment that is a command of its own, with its name
  standing nowhere else in the command, makes the target of a remote shell
  certain, so `H=rig-1.local; ssh $H 'grep -c shutdown log'` passes like its
  literal spelling. An assignment behind `{`, `then` and the like, or made
  with `local`, `declare`, `typeset` or `readonly`, gives a weak value: it
  adds holds and names the host for the rules, it leaves that target
  uncertain, and where it names no configured host the target stays an
  unresolved variable (the shell may not use that value at all).
  The same goes for a name that is declared without a value somewhere in
  the command (`local url`, and `url=...` on the next line; `export B`
  before or after `B=...`), for a name that stands anywhere else in the
  command as a bare word (assigned twice, a loop variable, `read NAME`, or
  just `echo URL done`: the value written may not be the one in use), and
  for a value put together from a weak one (`H=$A` after `{ A=...; }`).
- **A carried value used through another form of reference** is read with
  the value in place too, as a weak one: `${NAME%word}`, `%%`, `#`, `##`,
  `/`, `//`, `^`, `^^`, `,`, `,,`, `${NAME:offset}`, `:-word`, `-word`,
  `:=word`, `=word`, `:?word` and `?word`. So
  `BASE=http://rig-1.local:8080; curl -X POST "${BASE%/}/api/move"`,
  the same with `"${BASE:-http://localhost}"`, and
  `SSH="ssh rig-1.local"; ${SSH:?} 'sudo reboot'` are held. The value stands
  in place as it is: what the operator would take off it or put in its
  place is not worked out. `${NAME:+word}` and `${NAME+word}` are read with
  `word` in place (`J=1; curl ${J:+-X POST} ...`). A read through such a
  form passes.
- **A name with more than one literal value.** The reading above has the
  value written last before each use in place. Each earlier value that a
  later one replaced is tried as well, in a further reading of the command
  with that value kept in place; such a reading only adds holds (it exempts
  nothing and makes no target certain). So the usual override is held:
  `DEV=/dev/ttyUSB0; [ -n "$SIM" ] && DEV=/tmp/sim.txt; echo G1 X10 > "$DEV"`.
  One command gets eight such readings, counted over all its names
  together, and an earlier value counts also where it was used before it
  was replaced and could not reach a later use. With more earlier values
  than that the command has reached a limit (below), which a script of
  ordinary lines can do (see "Found by the check of 0.1.1").
- A part whose program only reads (`ls`, `cat`, `grep`, `tail`, `journalctl`,
  `ps`, `git log` and the like), with no command substitution, no redirect to
  a file and nothing after it in the pipeline that could run its output, is
  exempt whatever its arguments say. Searching for a motion word is not a
  motion. The exemption ends where the command runs or writes something
  through its own arguments: an assignment in front of it other than a locale
  or terminal setting (`GIT_PAGER=...`, `LESSOPEN=...`), `git -c ...`,
  `git ... --output`, `sort -o`, `uniq <in> <out>`, `rg --pre`.
- Text that such a program feeds to a shell, an interpreter or a remote shell
  (`echo 'ctl move x 5' | ssh rig-1.local`) is tried against the rules; fed
  to a shell that reads its standard input (`... | bash`), it is also read as
  the command it is.
- A part that matches one of your `stop` patterns, no `hold` pattern and no
  class A rule, and has no command substitution, passes, class B included.
- **When a command cannot be read with certainty** (an unclosed quote or
  heredoc, a remote shell whose target is a variable with no value in the
  command), every pattern is tried on the whole raw text and any match
  holds.
- **A command the matcher cannot read in full is held, whatever it names.**
  Where the matcher reaches one of its own limits it has not read the whole
  command, so it does not pass it: the command is held as `unreadable`, with
  `certain` off, whether or not it names a configured host (the card names
  the host when there is one). The limits: a command over 400,000
  characters; text nested more than eight texts deep (a substitution inside
  a substitution, an `eval` inside an `eval`); nested texts that add up to
  more than 1,200,000 characters of reading; more than 64 different texts
  that have to be read a second time (see "Two readings"); quoted
  substitutions or quoted `${...}` nested more than 100 deep inside one
  word; carried values that add up to more than 20,000 characters put in
  place in one text (counted apart for the values that are carried only as
  weak ones because their name stands elsewhere in the command, is declared
  without a value or is assigned behind `time`, so they cannot use up the
  room of the others; the values read through another form of reference
  count with them); a name whose literal value is over 2,000 characters
  standing anywhere else in the command, behind a `$` or bare, before the
  assignment or after it (the value is not carried, and the matcher does
  not work out which of those the shell reads it through; a long value
  whose name stands nowhere else is no limit); and more than eight earlier
  values of names that were given
  another one before a use. The same holds for a text with a `${...}`
  inside double quotes that two shells close at different braces
  (`echo "${A:-it's} ${B:-don't}"`), and for any command the matcher itself
  fails on. Whichever limit it is and wherever in the command it is reached,
  the patterns are also tried on the whole raw text, and a serial device or
  GPIO path it names holds for its kind. The readers that close quotes and
  braces also count their steps (16 for each character and 100,000 for the
  call) as a last resort against a spelling that would make them read a
  piece again and again; no command is known that runs out of them without
  reaching another limit first.
- **Two readings.** Where shells disagree, or where this version reads a
  spelling differently from the one before it, the command is read both ways
  and either reading can hold: a pair of parentheses glued into a word, a
  group followed by a word, zsh's `{ command }` and `[[ ... ]]` followed by
  a word, a `${...}` that runs past its first `}`, a line continuation after
  a redirect sign or inside `$'...'`. So a few reads stay held:
  `if (ssh rig-1.local 'grep -c shutdown log') then echo ok; fi` is held,
  where the same read written `if ssh rig-1.local '...'; then` passes. One
  command reads at most 64 different texts a second time; past that it has
  reached a limit (above).
- Before matching, zero-width characters are removed. A backslash-newline
  joins two lines where the shell joins them: between and inside words, after
  a redirect sign (`<` at the end of a line, the file on the next) and inside
  one, between `$` and the `(` or the name it belongs to, in double quotes;
  not after a comment, not before a carriage return, not in a heredoc whose
  delimiter is quoted. Inside `$'...'` bash hands the pair on for the next
  shell to join and zsh drops the backslash: both are read. Every pattern is
  also tried with line continuations joined and with quotes and backslashes
  removed, so `c'tl' move` reads like `ctl move`.
- A comment runs nothing and exempts nothing; the site patterns and class A
  are still tried on its text.

## What it cannot see

- **Motion code inside a script file** run by a name no pattern matches
  (`ssh rig-1.local 'python3 run.py'`). Copying a file to the host and
  running it there by name is the ordinary way of working and is not held:
  name the script in `hold` if it moves hardware. A script run by name from
  inside a heredoc fed to a remote shell (a body line `source run.sh` or
  `bash run.sh`) is the same limit: the body is read, the script it names is
  not.
- **A command put together from parts at run time**: `"$(echo ctl) move"`,
  an encoded string decoded on the host, a variable whose value is not
  assigned literally in the same command, text and such a variable mixed
  (`echo "sudo $WHAT" | ssh rig-1.local`), a brace expansion that spells the
  program (`{ssh,rig-1.local,bash} < run.sh`), a signal option kept in a
  variable (`kill -0 $OPTS <pid>`).
- **A variable inside remote text that otherwise only reads** is not
  followed: `ssh rig-1.local "ls $X"` passes when `$X` is set outside the
  command, whatever `$X` holds. (Remote text that is nothing but a variable,
  or whose program is one, is held as `unreadable`.)
- **Input given to a whole group or loop** instead of to the remote shell
  itself: `{ ssh rig-1.local bash; } < run.sh`,
  `while read l; do ssh rig-1.local bash; done < run.sh`,
  `cat run.sh | (echo hi; ssh rig-1.local bash)`. The remote shell is held
  where the redirect or the pipe stands on its own command.
- **A host, a base URL or a program in a variable this cannot follow**: one
  set outside the command (the environment, a sourced file, an ssh config
  alias), set only by a loop, `read` or a `${NAME:=value}` default, or
  assigned after the text that uses it was written (a function or a trap
  defined before the assignment). A remote shell
  whose target is such a variable is decided by the raw text: when the
  command names a configured host anywhere, every pattern is tried on all of
  it and input fed to that shell is held as `unreadable`; when it names none,
  nothing ties the call to a host and only the class A rules and your `hold`
  patterns apply. A `curl "$BASE/..."` whose `$BASE` cannot be followed is
  not tried against class B at all.
- **Anything sent to a host the config does not list**, beyond the class A
  rules.
- **Whether a command that reaches a limit of the matcher is harmless.** It
  is held without being read in full, so a harmless one is held too: a
  command over 400,000 characters, nine substitutions inside one another,
  seventy lines that each need a second reading, a 100-character value used
  more than 200 times, a value over 2,000 characters whose name stands
  again anywhere in the command (`echo NAME` too), names given more than
  eight literal values that a later one replaced (a label given ten values
  in a ten-step script), and two defaults with an apostrophe in one
  double-quoted string (`echo "${A:-it's} ${B:-don't}"`), whatever else
  the command does, a stop command included. The card says the command
  could not be read. All but one of these are no spelling of ordinary
  work; the replaced values are, and the entry on further readings under
  "Found by the check of 0.1.1" says what reaches that limit and how the
  same work is written so that it passes.
- **After signal 0, a later signal option behind `$[ ... ]`**, the old
  spelling of arithmetic, where a `|` inside it cuts the command
  (`kill -0 $[P|0] -s KILL` passes; written `$((P|0))` it is held), and
  behind zsh's `&>|` with a line continuation inside the sign (`&>`, a
  backslash and a newline, then `|`; written unbroken it is held).
- **Where a value is assigned.** A `NAME=value` on a line of its own counts
  as a plain assignment wherever that line stands: inside an `if`, a loop or
  a function's body written over several lines, or inside `( )`, where the
  shell may never run it or may forget it. So
  `( H=other.example ); ssh $H bash < run.sh` is read as a remote shell on
  `other.example`. The same goes for an assignment the shell makes only on
  a condition, written on one line: `[ -n "$ALT" ] && H=spare.example`.
- **What is left of a name with several values.** A later value that is not
  a literal makes the earlier one forgotten
  (`DEV=/dev/ttyUSB0; DEV=$(pick); echo G1 X10 > "$DEV"` passes). Each
  further reading keeps one earlier value of one name, so a hold that needs
  the earlier values of two names at once is not made
  (`H=rig-1; D=local; H=other; D=example; ssh $H.$D bash < run.sh`).
- **What is left of a value used through another form.** The value stands
  in place unchanged, so a hold that shows only once the operator has
  changed it is missed (`M=moved; ctl ${M%d} x 1`). Read as written, as
  before: a form whose word holds a variable or a substitution
  (`"${BASE%$SUFFIX}"`, `"${BASE:-$(cat url.txt)}"`; the substitution itself
  is read), the forms not listed (`${NAME@Q}`, `${NAME[1]}`, `${!NAME}`), a
  carried value inside the word of another reference (`"${A:-${BASE}}"`),
  and a default that names the host or a device for a name with no value
  in the command (`curl -X POST "${BASE:-http://rig-1.local:8080}/api/move"`
  and `echo G1 X10 > "${PORT:-/dev/ttyUSB0}"` pass).
- **A host name with a variable in it** is matched as written.
  `for N in 1 2; do ssh rig-$N.local 'sudo reboot'; done` passes when the
  config names `rig-1.local` and `rig-2.local`, and is held when it names
  the glob `rig-*.local`, as `ssh 10.0.0.$i` is held by `10.0.0.*`. Name
  numbered hosts by a glob.
- **Input fed to a remote shell behind a word this does not look through**:
  `taskset -c 0 ssh rig-1.local bash < run.sh`, and the same behind
  `runuser`, `pkexec`, `systemd-run`, `parallel` and any other program that
  runs the command it is handed; `coproc NAME { ssh rig-1.local bash; }`
  with a name and a group. The patterns still hold there
  (`taskset -c 0 ssh rig-1.local 'sudo reboot'` is held). The words that are
  looked through are listed under "How a command is read". The same goes
  for a string that a program splits into a command
  (`env -S 'ssh rig-1.local bash' < run.sh`, `su -c '...'`,
  `script -c '...'`), for a local shell that hands its own input on
  (`bash -c 'ssh rig-1.local bash' < run.sh`), for a string that `xargs`
  fills (`cat cmds.txt | xargs -I{} sh -c 'ssh rig-1.local {}'`), and for a
  flag of a looked-through word that takes its value as a second word and
  is in no list: `sudo --user root ssh rig-1.local bash < run.sh` passes
  where `sudo -u root ...` is held, and so does the same behind
  `nice --adjustment 5`, `strace --trace-path /x` and
  `watch --shotsdir /tmp/s`.
- **A reboot, a service restart or a kill on the machine the session runs
  on.** Those rules are for the configured hosts:
  `time (sudo reboot; ping -c1 rig-1.local)` passes.
- **Input given to a group over several lines**, like input given to any
  group: `f()`, `(`, `ssh rig-1.local bash`, `) < run.sh` on four lines
  passes, where `f() (ssh rig-1.local bash) < run.sh` on one line is held.
  And input a process substitution hands on:
  `echo hi | tee >(ssh rig-1.local bash)`.
- **A file on the host fed to a shell on the host.** The file is not read,
  whichever way it reaches the shell: `ssh rig-1.local 'sh /tmp/cmds.txt'`
  and `ssh rig-1.local 'cat /tmp/cmds.txt | sh'` both pass, and so does a
  download piped to a shell there. (`cat cmds.txt | ssh rig-1.local`, with
  the file on this machine, is held.) The arguments that `xargs` hands on
  reach a shell on the host unread where its template reads:
  `xargs watch cat`, `xargs -I{} sh -c "cat {}"`, `xargs sudo -s readlink`
  and `xargs readlink | sh` pass.
- **A file that a word before the command writes through its own flag** is
  not tried like a redirect: `/usr/bin/time -o /dev/ttyUSB0 ls` and
  `strace -o /dev/ttyUSB0 ls` pass.
- A request that moves hardware with a plain GET, or through a client the
  `http-write` rule does not know (a library call, `nc`).
- What becomes of a hold that is open while the mod's module is reloaded has
  not been tested. Do not reload plugins with a card on screen.
- A `hold` or `stop` pattern of your own that backtracks badly on a long text
  can stall the check; keep site patterns simple.

### Found by the check of 0.1.1 and not fixed yet

The check of this version (2026-11-17) confirmed no high finding and left
the ones below, which the next version is to fix. The first two are
commands that 0.1.0 held and this version passes. Until then:

- **A value put in place can hide a hold.** A command is read with every
  carried value in place and with none, and with no mix of the two. Where
  the word that stands as the program is a reference to a read-only
  program (`echo`), the first reading is a read and the second shows no
  target, so a hold that needs the target's value in place and the
  program left as written is not made. In every version this passes the
  dry-run switch written plainly:
  `[ -n "$DRYRUN" ] && DRY=echo; H=rig-1.local; $DRY ssh $H 'sudo reboot'`
  (the shell reboots the host when `DRYRUN` is empty). Since this version
  it also passes the same switch written through a form (`${DRY:-}`,
  `${DRY:?}`, `${DRY%x}`), which 0.1.0 held because it left the form as
  written, and the plain one behind `time -p`:
  `time -p DRY=echo; H=rig-1.local; $DRY ssh $H 'sudo reboot'` (zsh does
  not make that assignment and runs the reboot; behind plain `time` 0.1.0
  passed it already). The target may be a host, a base URL, a serial
  device or a word of a site command kept in a variable
  (`M=move; ${DRY:-} ctl $M x 1` after the same switch). Held in this
  version: the same commands with the target written out
  (`${DRY:-} ssh rig-1.local 'sudo reboot'`, `${DRY:-} ctl move x 1`), and
  with an empty value written first
  (`DRY=; [ -n "$DRYRUN" ] && DRY=echo; ...`), which holds the plain
  spelling too.
- **A long value used through a name the text does not show.** A literal
  value over 2,000 characters is a limit where its name stands again. A
  use that never shows the name reaches no limit: an `eval` whose string
  builds the name (`eval "\$C$(echo X)"` for `CX`), `${!N}`,
  `declare -n R=...`, `${!PREFIX*}`, a line continuation inside the name,
  and an exported value that a program reads from its environment
  (`export GIT_SSH_COMMAND='ssh rig-1.local bash #<2,001 characters>'; git fetch`).
  0.1.0 held these commands, by stopping at the long assignment; this
  version passes them, a write or a remote shell among them. With a value
  of 2,000 characters or fewer every version passes them, like any
  command put together at run time (above).
- **A form whose word holds a quote or a backslash, in text that is read
  again.** In a word of the command itself every listed form is read with
  the value in place. In the copy of a text the shell reads again (inside
  `$( )`, backticks, `<( )`, a heredoc fed to a local shell, the
  single-quoted string of `eval`, `trap` or `bash -c`) the form is read
  only where its word has no quote, backslash, `<`, `>`, `{` or `}`. So
  `BASE=http://rig-1.local:8080; OUT=$(curl -X POST "${BASE:?"BASE not set"}/api/move" -d 1)`
  passes, in every version; with `${BASE:?BASE not set}` or `$BASE` in the
  same place, and with the quoted word outside the `$( )`, it is held.
- **Eight further readings are few.** The readings of "A name with more
  than one literal value" are counted over all names of a command, and an
  earlier value counts also where it was used before it was replaced. A
  script of ordinary lines reaches the limit and is held as `unreadable`,
  where every earlier version passed it: ten lines of
  `STEP=<label>; echo "== $STEP"; make <target>`, ten hosts read in turn
  with `H=<address>; ssh $H uptime`, nine names given two values each, and
  six values of one name in a `bash -c '...'` string that has a word after
  it (the string is read twice). Nine values of one name pass. A loop
  passes (`for s in ...; do ...; done`), and so does the same script
  written to a file by a heredoc and run by name.
- **A read through `xargs` on a configured host is held unless its
  template is a known read** (the bullet on the words before a command,
  under "How a command is read"). Every earlier version passed these
  reads, and the same read without `xargs` passes.
- **An assignment in front of `readlink` and the eight like it, as the
  template of `xargs` on a configured host**, does not end the exemption
  as it does for the read-only set:
  `ssh rig-1.local 'ls | xargs env LD_PRELOAD=/tmp/x.so readlink'` passes
  (with `wc -l` for `readlink` it is held). Every earlier version passed
  both.
- **`xargs --max-lines` without a value** takes the next word for its
  value, so `cat cmds.txt | xargs --max-lines ssh rig-1.local` passes
  (GNU `xargs` takes that value only glued on, and runs `ssh`). Written
  `--max-lines=1` or `-L 1` it is held.
- **Signal 0 with a later signal option, inside a string that is typed
  into another program.** Where `kill`, `pkill` or `killall` stands inside
  a quote of the text in hand (`tmux send-keys "..."`, `screen -X stuff`,
  the string of `os.system`), the search for a later option still ends at
  a `|`, `;` or `&` inside a quote of the kill's own words:
  `tmux send-keys -t 1 "ssh rig-1.local 'pkill -0 -f x\"a|b\" --signal 9'" Enter`
  passes. Without the quoted bar it is held, and so is every spelling in
  text that is read as a command (the string of `ssh` or `bash -c`, a
  heredoc).

`/motion recent` lists what passed on configured hosts, so a gap can be found
and closed with a `hold` pattern. `/motion test <command>` shows the verdict
for a text without running it.

## The config file

Site-specific values live in a local file outside any repo:
`<HOME>/.claude/motion-hold.json` (or the path in the `config` option). Every
key is optional. `examples/motion-hold.example.json`:

```json
{
  "hosts": ["rig-1.local", "10.0.0.*"],
  "hold": ["\\bctl\\s+(move|jog|home|drive)\\b", "\\bbench/[\\w-]+\\.sh\\b"],
  "stop": ["\\bctl\\s+stop\\b"],
  "stopCommand": ["ssh", "{host}", "ctl stop all"]
}
```

| Key | Meaning |
| --- | --- |
| `hosts` | Host globs (`*` any run, `?` one character, case-insensitive), matched against each word of a command after quotes and a leading `user@` are stripped; a URL contributes its host name. |
| `hold` | Regular expressions (case-insensitive) for the site's motion commands. A match holds, anywhere. |
| `stop` | Regular expressions (case-insensitive) for the site's stop commands. A match passes. |
| `stopCommand` | The argv the STOP button runs, the program first; `{host}` is replaced by the running command's host. No shell reads it. |

- **No file:** only the class A rules apply (no hosts are known).
- **A broken file** (not JSON, a wrong type, an invalid regular expression, a
  pattern that matches everything, an unreadable file): every command with
  `ssh` or `mosh` and every class A match is held until it is fixed. A toast
  says so once; `/motion status` shows the error.
- An unknown key is a warning, shown by `/motion status`.
- The file is read when the session starts and on `/motion reload`.

## /motion

`/motion` runs at once, mid-turn too, and makes no model call.

| Command | What it does |
| --- | --- |
| `/motion` or `/motion status` | The config's status, path, host and rule counts and any error; the pending hold; the running motion. |
| `/motion recent` | The newest 20 commands that were held or that named a configured host: `passed`, `ran` or `denied`, newest first. |
| `/motion test <command>` | The verdict for that text: hold or pass, the kinds, the host, certain or not. It runs nothing. |
| `/motion run` / `/motion cancel` | Answer the pending hold: the twins of the card's buttons. Only a command you typed (or sent from the Remote Control bridge) counts; from any other origin the answer is `Only the person can answer a hold.` `/motion run` approves only a card that has been on screen (pane or dialog) for at least 1.5 seconds; otherwise it approves nothing and answers `A new hold just appeared: read it, then answer again.`, so a typed approval can never land on a hold that has only just replaced the one you read. `/motion cancel` answers at once. |
| `/motion stop` | Run `stopCommand`: the twin of the row's `s: STOP`. Person only, like run and cancel. |
| `/motion clear` | Remove the STOP row: the twin of the row's `x: clear`. |
| `/motion reload` | Read the config file again. |

The card's buttons and the row's buttons need the fullscreen renderer for
clicks and the pane or band focused for hotkeys; the commands always work.

## The STOP row

Drawn while an approved call runs: the chip, what it does, since when, and
` · background` for a background launch.

- With a `stopCommand`: an `s: STOP` button. It runs the argv as a process of
  the mod's own (never held), and a toast says `STOP sent (exit 0)` or
  `STOP failed: <why>`.
- Without one, the row ends `· Esc interrupts here; the hardware may keep
  moving`: interrupting the turn stops the command on this machine, not
  necessarily the motion it started.
- A background launch keeps its row until `x: clear` or `/motion clear`. A
  new session start clears a row whose call is gone; `/clear` and a resume
  clear any.

The row is keyed `zm-01-motion`, yields to a survey and draws on the terminal
only. The `motion-hold.active` state behind it is what the strip mod's stop
pill reads.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `timeoutSeconds` | `120` | Seconds a hold waits before it is refused (5 to 3600). |
| `config` | `""` | Absolute path of the config file (`~/` is the home folder). Empty: `<HOME>/.claude/motion-hold.json`. |

## Install (local)

```bash
claude plugin install motion-hold@zehui-mods --scope user
```

## Tests

```bash
claude plugin validate motion-hold
claude plugin test motion-hold
```

`hooks/match.test.ts` holds the matcher's table of commands, one test each;
`hooks/hold.test.ts` the hold kit against a hand-made engine;
`hooks/register.test.tsx` the mod through the engine's test kit. The tests
use neutral names only and run no command.
