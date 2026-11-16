# Roadmap

What comes next for these mods, kept here so the plan survives sessions.
Names of specific machines, hosts and people are left out on purpose.

## Done (2026-10-19 to 2026-10-20)

Band rows SYS, PLAN, HANDOFF, CACHE, AGENTS, GOAL, HERE, NEXT with a shared
stack order; the agents pane (Who, Code, Peers views, mascots per state);
`/zh`, `/web` with `web_read`, the herdr peer alarm and board; the blast-radius
fork. See `plans/TIMELINE.md` for the ledger.

## Done (2026-11-16): forks, the strip and comfort

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

## Next, in order

1. **Safety batch, built but not landed.** `motion-hold` holds a shell
   command that would move hardware or disturb a machine, and `send-gate`
   holds an outbound send in a session that runs without permission
   prompts. Both are written and tested, and neither is in this repo yet:
   after the two fix rounds the plan allows, the last review of
   motion-hold's command matcher still found one way past it that counts as
   high, and smaller ones. `send-gate` waits with it, since it shares
   motion-hold's hold kit. Next: one more fix round for the matcher, then
   both land together. The plan's "Held back and deferred" section and its
   review log have the details.
2. **Agents pane:** the messages view behind the numbered card buttons.
3. **motion-hold, once it has landed:** a stop command (its local config
   has none yet, so the STOP row is an indicator until one is set), and
   input given to a whole group or loop (`{ ssh rig-1.local bash; } <
   run.sh`), which the matcher does not follow yet.
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
