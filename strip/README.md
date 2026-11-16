# strip

One strip of quiet pills above the prompt, in place of the SYS, PLAN, HANDOFF
and CACHE rows. A pill is dim or softly coloured while all is well and turns
solid red only when something needs attention. The strip owns no data of the
other mods: it reads their state, and those mods keep their data and their
commands.

It also orders the whole band (one `AbovePromptList` hook), records each
turn's edits for a diff pane, keeps a small record of the session's health,
and can open any mod's pane without a background fill.

Terminal only. English only. No network, no model call, no process.

## The pills

Left to right. Each reads the first source that has a value; a source whose
mod is not loaded, is broken or is reloading leaves the pill dim.
`/strip sources` says where every value came from.

| Pill | Shows | Reads | A press |
| --- | --- | --- | --- |
| stop | `STOP`, solid red, only while a held motion runs | `motion-hold.active` | runs `/motion status` |
| context | a 10-cell bar and the fill in percent of the auto-compact window (of the model's window when no threshold is known): green, yellow from 30, peach from 60, solid red from 80 | `token-weather.context`, else `handoff.context`, else the strip's own `$.session.usage` reading | opens the context pane |
| cache | minutes of prompt-cache warmth left, yellow under 10, `cold` at none | `cache-clock.lastCacheAt` and its `cacheMinutes` option | runs `/compact-offer` when the session has it, else `/cache-clock status` |
| diff | edits applied in the running turn, else in the last turn that made any | the strip's own recorder | opens the diff pane |
| tests | the last test run: the total in green, or solid red `tests 2/14` | `redgreen.runs` | runs `/tests` |
| agents | running subagents (background shells, watchers and timers are not counted) | `agents.runs` | runs `/agents-info open` |
| queue | prompts waiting; `2 paused` in yellow while the queue is paused | `queue.queue` | runs `/q pane` |
| system | its icon alone while the machine is fine; solid red `RAM 92%`, `CPU 95%` or both from 90 | `sys.reading` | opens the system pane |
| peers | other panes of the workspace; `4 · 1 waiting` in peach while one is blocked | `peers.seen` | runs `/peer-alarm board` |
| health | `login expired`, `limit reached` or `turn failed`, solid red, only while something is wrong | the strip's own record | toasts the detail |

A reading taken before the last `/clear` is skipped, so the context pill never
shows the old conversation's fill.

### Narrow terminals

The strip takes the richest of four levels that fits the band: the full
strip; without the context bar; without the words (`2/14`, `2`, `4·1`);
numbers only. When even that is too wide, idle pills are left out from the
right (peers first, cache last). Context and every attention pill always stay.

### While Claude works

Five seconds into a turn a small working pill appears at the strip's right
end. It is a Client module with its own frame clock, so the animation runs on
the drawing thread and wakes no hook.

## Panes

| Pane | Opened by | Shows |
| --- | --- | --- |
| Context (`strip-context`) | the context pill, `/strip context` | the fill against the compact window, one bar for each `/context` category, and the session cost, today's tokens and the month's total from the token-weather mod (today's tokens only while those totals are of the current day; a dash after midnight until token-weather publishes again) |
| System (`strip-system`) | the system pill, `/strip system` | CPU, RAM and battery with bars (green, yellow from 80, red from 90; the battery turns yellow under 30 and red under 15 while it is not charging) |
| Last turn (`strip-diff`) | the diff pill, `/strip diff` | the last turn's applied edits, one step for each Edit or Write, as a diff with the file's true line numbers |

The diff comes from what the tool itself reports (its patch; failing that, a
line diff of the whole file before and after). A step keeps at most 400 lines
and a turn its newest 50 steps. Edits that were denied, failed or were held
for review are not recorded; a subagent's edits are. An edit a background
subagent applies while no turn of yours runs joins the last turn's steps at
once, so the next turn does not drop it.

A pill opens its pane at once. When the surface does not place it, the pane's
command is run instead, from a timer, and a toast says it is queued. Clicks
need Claude Code's fullscreen renderer, so every button has a command:

| Button | Command |
| --- | --- |
| a pill | `/strip open <pill>` |
| `r: refresh`, `x: close` (context) | `/strip context`, `/strip context close` |
| `b: btop`, `r: refresh`, `x: close` (system) | `/sys btop`, `/sys now`, `/strip system close` |
| `p: prev`, `n: next`, `c: close` (diff) | `/strip diff prev`, `/strip diff next`, `/strip diff close` |

## Command

`/strip sources | context [close] | system [close] | diff [prev | next | <n> | close] | open <pill> | rows [show | hide] | panes [clear | solid]`

- `sources` (also `/strip` alone): the strip as text, one line for each pill
  naming its source, and whether the old rows are hidden.
- `context`, `system`, `diff`: open that pane; `close` closes it. `diff prev`,
  `diff next` and `diff <n>` choose the step.
- `open <pill>`: what a press on that pill does. The pills are `stop`,
  `context`, `cache`, `diff`, `tests`, `agents`, `queue`, `system`, `peers`
  and `health`.
- `rows show`, `rows hide`: see below.
- `panes clear`, `panes solid`: see below.

## The old rows

While the strip draws, the SYS, PLAN, HANDOFF and CACHE rows are left out of
the band. Their mods keep running, since the strip reads them. Two things
bring rows back:

- `/strip rows show` draws all four again, right under the strip;
  `/strip rows hide` removes them. The choice is kept in the mod's store and
  wins over the `rows` option at the next start.
- A HANDOFF row with something to act on always shows: its threshold was
  crossed, a save is under way or done, or a resume offer stands. It also
  shows when its state cannot be read, so an offer is never hidden by mistake.
  A value the handoff mod has not written yet (as in an ordinary session,
  where its threshold was never crossed) counts as nothing to act on.

Nothing is hidden or moved unless the strip drew its own row. On a survey, on
another surface, or when the strip fails, the band is passed on as it came.

The band's order, top to bottom: motion-hold, breathe, strip (then any old row
kept), smart-compact, agents, goal-meter, here, queue, next, images, then any
other plugin's row in the order received.

## Panes without a fill

With `transparentPanes` on (the default), a pane that any mod opens without a
background colour of its own is opened with `"transparent"`, so the terminal
shows through. A pane that names a colour, and the engine's own `settings` and
`changes` panes, are left alone. `/strip panes solid` turns this off and
`/strip panes clear` turns it on; the choice is kept in the store.

## Health

The health pill is drawn from three signals the engine gives a mod:

- a turn that died on an API error, with the error's name: a login error
  (`authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`,
  `verification_required`, `cloud_credential_error`) reads `login expired`; a
  `rate_limit` or `billing_error` reads `limit reached`; any other reads
  `turn failed`;
- how a main-loop turn ended: an answered turn clears the pill, a turn that
  ended on an error sets `turn failed`, an interrupted or refused turn changes
  nothing;
- the rate-limit windows of a measurement: one at 100 percent or more reads
  `limit reached`, and clears when none is.

The first signal arrives on a classic hook event. Where a guard plugin of a
higher tier passes the classic events on past user plugins (an
organization's security plugin may do this), the error's name never
arrives, and a failed turn reads `turn failed` whatever its cause.

What it cannot show:

- **A Remote Control link.** The engine gives a mod no signal for a link that
  connects or drops, so this condition is not shown.
- **A login that expires while the session is idle.** It shows at the next
  turn that fails on it.
- **Limits on an account that reports no rate-limit windows.** There the pill
  turns only when a turn dies on the limit.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `rows` | `hide`, `show` | `hide` |
| `transparentPanes` | on, off | on |

## Font

The pills' rounded caps (U+E0B6, U+E0B4) and icons (U+F00C, U+F00D, U+F017,
U+F03A, U+F04D, U+F071, U+F0C0, U+F0E4, U+F0E8, U+F2DB, U+F440) are private
use glyphs of a Nerd Font. The terminal needs one as its font or as a
fallback font; without one the caps and icons draw as empty boxes while the
numbers still read.

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install strip@zehui-mods --scope user
```

## Notes

- Row key `zm-10-strip`; pill buttons `sp-<pill>`; the working pill `sp-work`.
- State (`types/index.d.ts`): `usage`, `steps`, `last`, `sel`, `turnAt`,
  `now`, `clearedAt`, `health`, `isShowingRows`, `isPanesClear`,
  `cacheMinutes`. The fields read from other mods are typed in
  `types/peer.d.ts`.
- Another mod's command is run from a timer, never inside a hook; the session
  runs it once idle. A command that is not in the session is a toast.
