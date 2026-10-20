# next

A ➜ NEXT row above the prompt with 2 or 3 short prompts you would likely
send next. Pick one and it goes in the prompt box; nothing is sent until you
press Enter.

```
 ➜ NEXT     [ 1: Ship it ] [ 2: Run the tests again ] [ 3: Show me the diff of kit.ts ] [ 0: dismiss ]
 ➜ NEXT     asking haiku for next steps…                    (while the call runs)
```

- **Call**: one `$.model.complete` with the `model` option (Haiku by
  default; 300 tokens, 20 s limit) over the last main-loop reply's last 8,000
  characters and goal-meter's task list (its `goal-meter.goal` state, when the
  goal-meter mod is installed). The system prompt asks for 2 or 3 short
  prompts the person would likely send next, each under 60 characters, paths
  and names kept exactly, as a JSON array; the reply is material to read, not
  instructions. The answer's first JSON array is read; each entry is cleaned
  (control characters dropped, whitespace folded, a list mark or quotes taken
  off), and empty ones, ones over 60 characters and repeats are dropped, at
  most three kept.
- **When**: with `auto` on (the default), after every main-loop answer over
  300 characters that ended normally (not interrupted, not an error) while no
  subagent or teammate is still running (`$.agent.list()`: pending, running
  or waiting); and whenever you run `/next`, over the last assistant reply
  with text. One call at a time; a call left over from before the last
  prompt (its answer is dropped) does not block the next one. The call runs from a timer after the hook,
  never inside it.
- **Pick**: `/next 2`, or the framed Button `2:` pressed with the band
  focused (ctrl+x tab, then Enter), puts that suggestion in the prompt box through
  `$.prompt.fill` (`replace`: over any draft), whole even when the row had to
  cut its label. The row stays until you send a prompt.
- **Dismiss**: `/next 0` or the `0: dismiss` Button clears the row (the
  asking line too); a call still running then has its answer dropped.
- **No digit hotkeys**: the engine arms a band Button's bare digit from an
  empty prompt box too, so a prompt you start with `0` to `3` would press a
  button and lose the digit. The Buttons are pressed with the band focused,
  or by their commands.
- **Hidden** while a turn runs (the band's `isWorking`), on a survey, off the
  terminal, and when there is nothing to show. **Cleared** when you send a
  prompt (a slash command does not clear it), when a main-loop turn starts
  (a woken turn too: the suggestions were for the reply before it) and on
  `/clear`; a call that finishes after any of these is dropped.
- **Errors**: from `/next`, a toast with the reason (`api-error 529
  overloaded`, `the model replied with no text`, no usable suggestions); an
  automatic call fails silently.
- **Stack**: the row is keyed `zm-80-next`, the last of the zehui-mods rows
  (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70,
  NEXT 80), right above the prompt box it fills; other bands follow.

The buttons work only while the band has focus (ctrl+x tab; herdr passes no
clicks), so each has a command:

| Button | Command |
| --- | --- |
| `1: <suggestion>` (to `3`) | `/next 1` to `/next 3` |
| `0: dismiss` | `/next 0` |

## Command

`/next [1-3 | 0]`

- `/next`: ask for next steps over the last reply.
- `/next <n>`: put suggestion n in the prompt box.
- `/next 0` (or `dismiss`): clear the row.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `auto` | `on`, `off` | `on` |
| `model` | `haiku`, `sonnet` | `haiku` |

## Install (local)

```bash
claude plugin install next@zehui-mods --scope user
```

## Notes

- No network and no processes: the one model call goes through the
  session's own client and credentials (`$.model.complete`).
- With `auto` on, a call costs one Haiku request after each long answer
  (about 2,000 to 3,000 tokens read, under 300 written).

See `PROVENANCE.md` for where it came from.
