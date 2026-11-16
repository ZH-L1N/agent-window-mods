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
- Reads, logs, status and searches are not held. A stop command always passes.

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
| `kill` | B | `kill`, `pkill`, `killall`, unless the signal is 0 and nothing after it could name another: `kill -0 <pid>` (also `kill -s 0`, `pkill -0`, `killall -0`) sends nothing and only asks whether the process exists. A later option makes it a kill again (`kill -0 -s KILL <pid>`, `pkill -0 -f x --signal 9`), wherever it stands in the same command: behind a redirect (`kill -0 <pid> 2>\| /dev/null -s KILL`) and behind a quoted or escaped `\|`, `;` or `&` too. For `pkill`, `-s 0` and `-n 0` are no signal at all (a session, the newest process) |
| `http-write` | B | `curl`, `wget`, `http` or `https` with a write: `-X POST/PUT/PATCH/DELETE`, `--request`, `-d`, `--data`, `--json`, `-F`, `--form`, `--upload-file`, `--post-data`, `--post-file`, `--method`, or `http POST ...`; `-T` with `curl` (for `wget` it is a timeout) |
| `unreadable` | B | input the host's shell would run and this mod cannot read: `ssh host bash < file`, `ssh host bash < <(cat file)`, `cat file \| ssh host`, `ssh host "$CMD"`, `ssh host <<< "$CMD"`, `printf '%s\n' "$CMD" \| ssh host`, a command on the host whose program is a variable (`ssh host 'sudo $CMD'`), and a command that names the host and that the matcher could not read in full: it reached one of its own limits (listed under "How a command is read"), shells read a piece of it differently, or the matcher failed on it |
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
  is the command form of newer shells, `${ command; }` and `${| command; }`.
- **Variables.** A literal `NAME=value` is carried forward: `$NAME` and
  `${NAME}` after it are read with the value in place. The assignment may be
  made with `export`, `local`, `declare`, `typeset` or `readonly`, and may
  stand behind `{`, `then`, `do`, `else`, a case pattern or a function's
  brace. So
  `H=rig-1.local; ssh $H '...'` and
  `BASE=http://rig-1.local:8080; curl -X POST "$BASE/api/move"` are read like
  their literal spellings, also where the variable stands inside a
  substitution (`RESP=$(curl -X POST "$BASE/api/move")`), a process
  substitution, the string of `eval` or `trap`, or the `-c` string or heredoc
  of a local shell. The text is also read as written, and either reading can
  hold: a carried value can add a hold and can name the host of a remote
  shell, and never takes a hold away (`CMD='ls'; ssh rig-1.local "$CMD"` is
  held as `unreadable` like any `ssh rig-1.local "$CMD"`). One exception: a
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
- **When the matcher reaches one of its own limits, the command is held if
  it names a configured host.** The limits: a command over 400,000
  characters; text nested more than eight texts deep (a substitution inside
  a substitution, an `eval` inside an `eval`); nested texts that add up to
  more than 1,200,000 characters of reading; more than 64 different texts
  that have to be read a second time (see "Two readings"); quoted
  substitutions nested more than 100 deep inside one word; carried values
  that add up to more than 20,000 characters put in place in one text, and
  a single value over 2,000 characters; and a spelling that makes the reader
  read the same piece again and again (a single quote inside `${...}`
  nested more than a dozen deep). The same holds for a text with a `${...}`
  inside double quotes that two shells close at different braces, and for
  any command the matcher itself fails on. Whichever limit it is and wherever
  in the command it is reached, the whole command is then decided the same
  way: every pattern is tried on its raw text, a serial device or GPIO path
  it names holds, and when it names a configured host (in its text or
  through a carried value) it is held as `unreadable`, whatever it says.
  The card says so. A command that reaches a limit, names no configured
  host and shows no pattern passes.
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
- **A command that reaches a limit of the matcher** is decided by its raw
  text alone, so what only a full reading shows is missed where the raw
  text shows neither a pattern, nor a device path, nor a configured host:
  a site command put together from a carried value (`M=move; ctl $M x 1`),
  and a command on a configured host whose name is split between a value
  and its use (`H=rig-1; ssh $H.local 'sudo reboot'`). Written without the
  limit, both are held. The limits this has been seen behind: a quoted nest
  more than 100 deep, the room for carried values spent, and the steps
  spent (see "Found by the last review" below).
- **Where a value is assigned.** A `NAME=value` on a line of its own counts
  as a plain assignment wherever that line stands: inside an `if`, a loop or
  a function's body written over several lines, or inside `( )`, where the
  shell may never run it or may forget it. So
  `( H=other.example ); ssh $H bash < run.sh` is read as a remote shell on
  `other.example`. The same goes for an assignment the shell makes only on
  a condition, written on one line: `[ -n "$ALT" ] && H=spare.example`.
- **A name given two literal values.** Only the value written last is
  tried. The usual override,
  `DEV=/dev/ttyUSB0; [ -n "$SIM" ] && DEV=/tmp/sim.txt; echo G1 X10 > "$DEV"`,
  passes, although the first value is the device.
- **A carried value used through any form but `$NAME` and `${NAME}`.**
  `"${BASE%/}/api/move"`, `"${BASE:-http://localhost}/api/move"` and
  `${SSH:?} 'sudo reboot'` are not read with the value in place, so a write
  to a configured host spelled that way passes.
- **A host name with a variable in it** is matched as written.
  `for N in 1 2; do ssh rig-$N.local 'sudo reboot'; done` passes when the
  config names `rig-1.local` and `rig-2.local`, and is held when it names
  the glob `rig-*.local`, as `ssh 10.0.0.$i` is held by `10.0.0.*`. Name
  numbered hosts by a glob.
- **Input fed to a remote shell behind a wrapper this does not look
  through**: `sshpass -p x ssh rig-1.local bash < run.sh`, and the same
  behind `doas`, `flock`, `setsid`, `watch`, `xargs`, `ionice`, `chrt`,
  `strace`, zsh's `repeat` and `noglob`, and `coproc`. The patterns still
  hold there (`sshpass -p x ssh rig-1.local 'sudo reboot'` is held).
  `sudo`, `timeout`, `nohup`, `env`, `exec`, `time`, `nice`, `stdbuf` and
  `command` are looked through.
- **A reboot, a service restart or a kill on the machine the session runs
  on.** Those rules are for the configured hosts:
  `time (sudo reboot; ping -c1 rig-1.local)` passes.
- **Input given to a group over several lines**, like input given to any
  group: `f()`, `(`, `ssh rig-1.local bash`, `) < run.sh` on four lines
  passes, where `f() (ssh rig-1.local bash) < run.sh` on one line is held.
  And input a process substitution hands on:
  `echo hi | tee >(ssh rig-1.local bash)`.
- A request that moves hardware with a plain GET, or through a client the
  `http-write` rule does not know (a library call, `nc`).
- What becomes of a hold that is open while the mod's module is reloaded has
  not been tested. Do not reload plugins with a card on screen.
- A `hold` or `stop` pattern of your own that backtracks badly on a long text
  can stall the check; keep site patterns simple.

### Found by the last review and not fixed yet

The last review of the matcher (2026-11-16) confirmed no high finding and
left the ones below, which the next version is to fix. Until then:

- **An assignment that opens a group behind `time -p` is not read as one.**
  `time -p (M=move; ctl $M x 1)` and `time -p { M=move; ctl $M x 1; }`
  pass. Without `-p` both are held, and so is a command written out behind
  `time -p` (`time -p (ssh rig-1.local 'sudo reboot')`).
- **A single quote inside `${...}` nested 14 or more deep in double quotes
  spends the reader's steps** (`"${a:-''"${a:-''...}"}"`), although the
  whole text may be under 200 characters. The command is then decided by
  its raw text (the first bullet of this list of limits): a hold put
  together from a carried value behind such a nest passes.
- **Many uses of a weak value spend the room for carried values.** A value
  whose name also stands elsewhere as a bare word, or is declared without a
  value, is carried since this version, and each use takes room: after
  20,000 characters of such uses a later value is no longer put in place,
  and a hold put together from it passes (a 100-character value used 200
  times, then `M=move; ctl $M x 1`).
- **After signal 0, a later signal option is not seen** behind a `|`, `;`
  or `&` that stands inside `$'...'`, inside a quote opened in the middle
  of a word (`x"a|b"`), inside `${...}`, or behind zsh's `&>|`:
  `ssh rig-1.local 'pkill -0 -f bench"|"runner --signal 9'` passes.
- **`${ command; }` inside another `${...}` outside double quotes** is not
  read: `echo ${A:-${ sudo reboot; }}` on a configured host passes (a shell
  that knows the form runs it). Inside double quotes it is held.
- **Some very long commands take quadratic time.** A run of over 100,000
  characters of one repeated token that looks like a program with a flag
  (`systemctl -x.systemctl -x. ...`), of `()` pairs behind one long word,
  or of `x(N)` words takes seconds, and past about 235,000 characters more
  than the ten seconds a check has: the session stalls and the call is
  refused, not passed.

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
