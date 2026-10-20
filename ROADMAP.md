# Roadmap

What comes next for these mods, kept here so the plan survives sessions.
Names of specific machines, hosts and people are left out on purpose.

## Done (2026-10-19 to 2026-10-20)

Band rows SYS, PLAN, HANDOFF, CACHE, AGENTS, GOAL, HERE, NEXT with a shared
stack order; the agents pane (Who, Code, Peers views, mascots per state);
`/zh`, `/web` with `web_read`, the herdr peer alarm and board; the blast-radius
fork. See `plans/TIMELINE.md` for the ledger.

## Next, in order

1. **Image after send** (`images` mod): when a prompt with a pasted image is
   sent, open that image in a side pane automatically (default on), `/img`
   to reopen the last one or a given one. A preview before sending is not
   possible: the engine exposes no pasted-image bytes until the prompt goes.
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

## Not planned

Recording mode (no screen recording needed), pixel-pulse (decorative),
cache-clock's 5-minute mode beyond the option it has.
