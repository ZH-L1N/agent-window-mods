# Roadmap

What comes next for these mods, kept here so the plan survives sessions.
Names of specific machines, hosts and people are left out on purpose.

## Done (2026-10-19 to 2026-10-20)

Band rows SYS, PLAN, HANDOFF, CACHE, AGENTS, GOAL, HERE, NEXT with a shared
stack order; the agents pane (Who, Code, Peers views, mascots per state);
`/zh`, `/web` with `web_read`, the herdr peer alarm and board; the blast-radius
fork. See `plans/TIMELINE.md` for the ledger.

## Done (2026-11-16): forks, the strip, comfort and the safety batch

One plan (`plans/2026-11-16-strip-forks-safety.md`), shipped mod by mod:

- **Four audited forks:** `skins` (the transcript skin), `redgreen` (the
  test results pane), `smart-compact` (the compaction offer) and `breathe`
  (the breathing band), each pinned, with its local changes numbered in its
  `PROVENANCE.md`.
- **The strip:** one row of pills in place of the SYS, PLAN, HANDOFF and
  CACHE rows; the band's order in one place; context, system and last-turn
  diff panes; a session-health pill; other mods' panes without a background
  fill.
- **Comfort:** the prompt queue (`queue`), image thumbnails under the sent
  message, the mascot behaviour ladder, and a small file tree (`filetree`).
- **Safety batch:** `motion-hold` holds a shell command that would move
  hardware or disturb a machine until a person approves it, and
  `send-gate` holds an outbound send in a session that runs without
  permission prompts. Both read their rules from a local config file
  outside this repo. motion-hold's command matcher went through three fix
  rounds; what it cannot see, and what its last review left open, is
  listed in its README.

## Done (2026-11-17): motion-hold 0.1.1

Plan `plans/2026-11-16-motion-hold-0.1.1.md`. What the review of 0.1.0 left
open in the command matcher is fixed, each with a test and checked against
0.1.0 over generated commands and over the owner's own command history.
A command the matcher cannot read in full is now held whatever it names.
Three gaps that every earlier version shared are closed as far as the
plan's lines go: a carried value used through `${NAME%/}` and the like, a
name given several literal values, and input fed to a remote shell behind
`sshpass` and fourteen more words. Its one check confirmed no high finding
and left eight defects, listed in the mod's README.

## Done (2026-11-17): strip 0.1.1

Plan `plans/2026-11-17-strip-band-background.md`. The rows above the prompt,
the strip's and every other mod's, are drawn on one background colour, so
it is plain where the conversation ends: one wrapper in the strip's list
hook, default `moss`, `/strip band <shade | #rrggbb | off>`.

## Next, in order

1. **motion-hold 0.1.2:** what the check of 0.1.1 left, each with a test
   and checked against 0.1.1 the same way. First the two kinds of command
   that 0.1.0 held and 0.1.1 passes: a hold hidden by a value put in
   place (a dry-run switch written `${DRY:-}` in front of a command whose
   target is in a variable), and a value over 2,000 characters used
   through a name the text does not show. Then the two prices: the bound
   of eight further readings, which holds a ten-step script that reuses a
   label, and the rule that holds a read through `xargs` on a configured
   host unless its template is a known read. Then a form with a quoted
   word in text that is read again, an assignment in front of a template
   read, `xargs --max-lines`, and signal 0 inside a typed string. Its
   README lists all of them.
2. **Agents pane:** the messages view behind the numbered card buttons.
3. **motion-hold, later:** a stop command (its local config has none yet,
   so the STOP row is an indicator until one is set), and input given to
   a whole group or loop (`{ ssh rig-1.local bash; } < run.sh`), which the
   matcher does not follow yet.
4. **The guard's skipped events:** a look at what the organization plugin
   guard's skipped events (`classic.SessionStart`, `prompt.compose`,
   `session.append`, `session.compact`, `skill.prompt`) cost the existing
   mods, and whether anything should move to other events.
5. **Small conveniences:** dictation de-dupe (merge a voice re-send into the
   previous prompt), hands-off turn mode ("just check, don't touch" blocks
   writes for that turn).
6. **Later:** deploy-watch band, device binding and rig heartbeat chips,
   protected-paths guard, away mode, outputs shelf, tool-gotcha rewriter.

## Clicks on buttons

Buttons in bands and panes take clicks only under Claude Code's fullscreen
renderer (`/tui fullscreen`, which saves `"tui": "fullscreen"`; attached
background sessions are fullscreen regardless). The classic renderer never
enables mouse reporting, so its buttons draw but cannot be clicked, in herdr
or any other terminal; that is why every button here has a slash-command
twin. Found 2026-10-20: herdr forwards the mouse to the pane fine (verified
on 0.8.2); for the wheel and click-position fixes, herdr 0.9.4 or later.
Upstream, claude-code issue 101306 explains the alt-text-only `Image`
element under herdr (the graphics check rejects the `libghostty` terminal
name), so pictures may start drawing there without any change here.

## Not planned

Recording mode (no screen recording needed), pixel-pulse (decorative),
cache-clock's 5-minute mode beyond the option it has. The cross-pane
approval alarm: a mod cannot see a permission prompt, its own session's or
another's. A health signal for the Remote Control link: the engine has no
event or field for it. Mascots drawn by a Client module: a Client cannot
draw a `Raster`.
