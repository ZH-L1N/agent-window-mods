# Strip, forks and safety: spec

Date: 2026-11-16. Plan: `plans/2026-11-16-strip-forks-safety.md`.

## What

Rework the band above the prompt into one strip of pills, bring four
outside mods into this repo as audited forks, add two safety gates, and add
a small set of comfort features. Everything is a Claude Code mod (a plugin
with a hooks module) in this repo's local marketplace.

## Why

- The band grew to four always-on rows that repeat the status line and each
  other. One strip shows state at a glance and opens panes for detail.
- Four outside mods do things worth having (a transcript skin, a test
  failure pane, a compaction offer, a breathing band). A full-source read
  at pinned commits found no exfiltration, obfuscation or remote code, so
  forking them with the phone-home code removed is cheaper and safer than
  rewriting them.
- A session that can reach lab hardware should not move it without a
  person's yes for each move, and a session running without permission
  prompts should not send a message unseen.

## Constraints

- Public, personal repo. Nothing related to any employer or company may
  appear in it: no company, product, project, person, host, machine or
  internal tool names, no work email, no domain-flavoured examples. This
  covers code, tests, fixtures, docs, plans, review logs and commit
  messages. Site-specific values (hosts, command patterns, tool names) live
  in local config files outside the repo; the mods ship only generic rules
  and neutral examples.
- Outside code enters the repo only as one of the four named forks, from
  the upstream tag or commit that was scanned, with its licence kept and a
  provenance file listing every local change. Our own mods are written
  without opening any other outside mod's source.
- The organization's plugin guard skips user-tier hooks on
  `classic.SessionStart`, `prompt.compose`, `session.append`,
  `session.compact` and `skill.prompt`. No new behaviour may depend on
  those events, and nothing works around the guard.
- Terminal surface only; every render hook falls back to the engine's
  drawing on any error; every button has a slash-command twin; clicks need
  the fullscreen renderer, so nothing may depend on a click.
- A gate fails closed: an error, a timeout or an unreadable config never
  lets a held action run.
- House rules for mods in this repo apply (stacking keys, chips, state
  contracts, validate, test, type-check, provenance, version bump and cache
  update, timeline line).

## Success criteria

Each line is one thing that was asked for, with its numbers.

1. skins is forked into this repo from upstream `hellosverre/claude-skins`
   v0.5.16, with the update check, the star toast and the dark-mode probe
   removed, the `terminal` skin as default, and it is on in every session.
2. redgreen (the test-failure pane) v0.1.0 and smart-compact (the
   compaction offer) v0.3.2 are forked into this repo; smart-compact's
   transcript backup is off by default.
3. The breathing band is forked from `claude-breathe` at `d8cc7b9`, on
   everywhere, with the random pool limited to pulse, wave and melody, a
   10 second delay, and the spinner word left alone.
4. One strip in "style B" replaces the PLAN, HANDOFF, CACHE and SYS rows:
   quiet pills, colour only when something needs attention, pills for
   context, cache, diff, tests, agents, queue, system and peers, and a
   health pill only when unhealthy. Context is always visible; cost and
   token totals move to a pane. The strip is a new mod that reads the
   existing mods' state; those mods keep their data and commands.
5. The seven borrowed ideas are all present: pills open panes (direct open,
   else the slash command with a "queued" toast); fit levels instead of
   dropped blocks; the context meter measured against the auto-compact
   window with steps at 30, 60 and 80 percent; a per-turn diff pane;
   animation on the drawing thread through a Client module; rows that
   appear only after a delay; and the mascot behaviour ladder.
6. From the outside marketplace's list, items 1, 2, 4, 5, 6, 8, 9, 11 and
   12 are covered: skin (fork), band (the strip), transparent pane
   backgrounds, image thumbnails under sent messages with labels, a
   cut-down file tree, a context pane, a prompt queue, the test-failure
   pane (fork) and the compaction offer (fork).
7. Safety batch: motion-hold holds every shell or SSH command that moves,
   energises or restarts lab hardware, one move per approval, with a STOP
   row and pill while it runs; reads, logs and status pass; a stop command
   always passes; the host list stays out of the repo. A session-health
   pill shows Remote Control disconnected, login expired or spend limit
   reached. An outbound-send gate previews a message, an email or an app
   environment change before it goes out, in bypass-mode sessions only.
8. The prompt queue is `/q` with plain subcommands and no model call; a
   turn that was interrupted or failed pauses it; it never sends while an
   agent is running.
9. Build order: the four forks, motion-hold, the strip, then the rest.
10. No company information anywhere in the repo, including the one old
    test fixture name that predates this rule.
11. The plan was reviewed by the mods-review pane with a ceiling of 5
    rounds before any implementation.

## Out of scope

- From the outside marketplace: the start page, the model picker,
  bookmarks, the mod store, and its powerline band as code.
- The desktop pet as code (only its behaviour ladder is borrowed).
- The cross-pane approval alarm (dropped from the safety batch).
- The agents pane's E3 messages view; it stays on the roadmap.
- Mermaid charts, themes and other skin features beyond what the fork
  already contains: nothing is added to the fork.
- Changes outside this repo, with three stated exceptions that the plan
  lists under "Outside the repo": installing or updating the mods in the
  local plugin cache, creating local config files for the two gates, and
  updating the local mods skill.

## Decisions carried from the discussion

- Old rows are hidden by the strip, not removed from their mods, so a
  person without the strip keeps them and `/strip rows` brings them back.
- The skin's organization-skipped hooks are not replaced. One line in a
  person's own instructions ("Mermaid blocks render as charts here") covers
  the only visible gap; it is a follow-up for the person, not part of this
  work.
- The strip orders the whole band through one list hook, because this
  engine version asks each plugin for its own row and stacks them itself.
- The HANDOFF row is hidden only while it has nothing to act on: a save
  offer, a save in progress or a resume offer brings it back.
- Thumbnails under the sent message are added; the IMAGES band row stays.
- The health pill shows a failed login, a reached limit and a failed turn.
  The engine gives no signal for a Remote Control link, so that part of the
  request cannot be met and is reported as such.
- The send gate decides "bypass mode" from the mode the engine reports on
  its classic events, falling back to the configured default; an unknown
  mode is gated.
- Ten tests in nine existing band mods assert a stacking the engine no
  longer does and fail on the current engine before any change here. They
  are rewritten first, with no runtime change, so every later check starts
  from green.
- motion-hold is a guard against a mistaken command, not a sandbox. It
  holds what it can read, and input that reaches a rig's shell in the same
  command when it cannot be read. A script copied to a rig and run there by
  name is a listed limit, closed by a site pattern for that script.
- The send gate also covers calendar invitations, file shares and comments,
  since they reach other people. Tools that publish a document are a site
  choice in the local config.
- The queue cannot see a permission prompt, because the engine exposes no
  flag for it. The no-agents-running rule narrows that gap.
