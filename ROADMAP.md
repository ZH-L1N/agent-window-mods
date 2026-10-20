# Roadmap

What comes next for these mods, kept here so the plan survives sessions.
Names of specific machines, hosts and people are left out on purpose.

## Done (2026-10-19 to 2026-10-20)

Band rows SYS, PLAN, HANDOFF, CACHE, AGENTS, GOAL, HERE, NEXT with a shared
stack order; the agents pane (Who, Code, Peers views, mascots per state);
`/zh`, `/web` with `web_read`, the herdr peer alarm and board; the blast-radius
fork. See `plans/TIMELINE.md` for the ledger.

## Next, in order

1. ~~Image after send~~ done 2026-10-20: the `images` mod draws a thumbnail
   row above the stack once a prompt with a pasted image is sent (sips → BMP
   → half-blocks). A preview before sending stays impossible.
2. **Safety batch**, one plan:
   - outbound-send gate: a preview card before any message or email is sent
     or a deployed app's environment is changed, showing the exact target,
     mentions and any dates being committed to.
   - motion-hold: hold every shell or SSH command that moves, energises or
     restarts lab hardware; one move per approval; a STOP band while it runs.
   - cross-pane approval alarm: never let a session answer another agent's
     permission prompt; make a permission-mode escalation loud.
   - session-health badge: one red or green entry for Remote Control
     disconnected, login expired, spend limit reached.
3. **Small conveniences**: dictation de-dupe (merge a voice re-send into the
   previous prompt), hands-off turn mode ("just check, don't touch" blocks
   writes for that turn).
4. **Agents pane**: E3, the messages view behind the numbered card buttons.
5. **Later**: deploy-watch band, device binding and rig heartbeat chips,
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
cache-clock's 5-minute mode beyond the option it has.
