# peers

A herdr peer alarm and board: toasts when another agent in this herdr
workspace needs you or has finished, and a `peers` pane listing every peer
with the HERDR-ORCH requests this session sent them. Nothing is drawn in the
band.

```
▲ w1:p6 "Explore ML training platform alternatives" is blocked
✓ w1:p7 "Compare Impeccable design skills" finished
★ ALL DONE · 5 peers idle
```

## How it works

Every 30 seconds a `$.clock` timer runs `herdr agent list` (5-second limit)
and keeps the agents of this workspace (`HERDR_WORKSPACE_ID`), leaving out this
pane (`HERDR_PANE_ID`). It compares them with the last poll, kept in `$.state`
under `peers.seen` (pane id → state, since when, agent, title):

- **▲ blocked**: a peer whose state becomes `blocked` (or a new pane that
  appears blocked). One toast per change, not one per poll.
- **✓ finished**: a peer that goes from `working` to `idle` or `done`.
- **★ ALL DONE · N peers idle**: every peer is `idle` or `done`, after at
  least one was seen `working` in this session. It fires once, then waits until
  a peer is working again. A quiet workspace never chimes.

The first poll after the start (or after `/peer-alarm on`) only takes a
baseline: a peer already blocked then is not announced. A failed herdr read
changes nothing.

The timer runs only in a herdr pane (`HERDR_ENV=1` with a workspace and pane
id) while the alarm is on. Outside herdr nothing runs.

## Board (0.2.0)

`/peer-alarm board` opens the `peers` pane (focused) and reads herdr at once:

```
2 peers in w1 · 1 blocked · read every 30 s           [ r: refresh ] [ q: close ]
▲ blocked 4m  w1:p7  codex   "Compare Impeccable design skills"
  req dd-skin · ⏳ 21m left · no result.md
● working 12m w1:p6  claude  "Review round 4"
  req apr-alp-r4 · round 4/5 · result.md ✓ completed
```

- One row per peer of this workspace: the state's glyph and word (`▲
  blocked`, `● working`, `○ idle`, `✓ done`, `? unknown`) with the time in that
  state, the pane id, the agent and the title. Blocked peers come first and
  are drawn amber. The time counts from the first read that saw the pane in
  that state, so a pane first seen by this read has none yet. A board last
  read more than two ticks ago (closed since, alarm off) may have missed
  changes, so its times are not carried over.
- While the pane is open, the 30 s tick reads herdr even when the alarm is
  off (`/peer-alarm off` silences the toasts, not the board), and reads the
  result file of each spoke shown on a row with `$.fs`:
  `~/.local/state/herdr-orch/<req>/result.md`. `result.md ✓ completed`,
  `✗ failed` or `▲ blocked` when its first two lines are exactly
  `req: <req>` and `status: <status>` and a non-blank line follows (POLICY.md
  section 4), `result.md (no status)` when not (as while the spoke is still
  writing it), `no result.md` when it is missing. Closed, nothing is read for it.
- Keys while the pane has the focus (`ctrl+x tab`): `r` polls now (the twin
  is `/peer-alarm board` again), `q` closes it (`/peer-alarm board close`).

### Which peers are this session's spokes

A prompt this session submits (typed, pasted, a peer's message, a herdr
injection) is read for HERDR-ORCH envelope headers, POLICY.md section 2:

```
[HERDR-ORCH v0] req=<id> from=<agent-name>@<pane-id> type=<type>
```

at the start of a line, or after `herdr agent prompt <pane> "` on it; type one
of `request`, `handoff`, `progress`, `blocked`, `needs-approval`,
`completed`, `failed`, or `followup` (not in POLICY.md's list, but the hubs
send it; it only updates a request already kept); the request id letters,
digits, `.`, `_` or `-` only. Each is kept in `$.state` under
`peers.requests` (the newest 40):

- **Spoke pane**: `to=<pane>` on the header line, or the pane after `herdr
  agent prompt`; else the sender (`from=`) when it is not this pane (a spoke's
  report reaching this session); else the first other pane id in the prompt.
- **This pane is the spoke**: a `request`, `handoff` or `followup` from
  another pane that names no other pane (the hub's brief to this session), and
  a report this pane sends (to its hub), are left out, so a spoke's board
  never lists its hub as a spoke.
- **Round**: `round 4/5`, `round 4 of 5`, `round 4` or a `-r4` suffix of the
  request id; the ceiling from `round n/m`, `ceiling 5` or `max rounds 5`.
- **Deadline**: `deadline: 45 minutes` (or `2 hours`) in the prompt, counted
  from the first envelope of the request seen here; POLICY.md's default of 30
  minutes for a `request` or `handoff` that names none. A deadline a
  `followup` names counts from the follow-up. A result file ends the
  countdown.

A row shows the newest request of its pane. Envelopes the hub sends from a
Bash call (`herdr agent prompt ...` run by Claude) are not prompts of this
session and are not seen.

## Sound

Silent by default. With sound on, a blocked peer plays two low beeps
(`assets/blocked.wav`, 0.4 s) and ALL DONE a rising three-note chime
(`assets/done.wav`, 0.6 s) through `$.audio.play` (`afplay` on macOS); ✓
finished has no clip. Both clips are generated by `tools/make-sounds.py`
(standard library only): `python3 -I tools/make-sounds.py`.

## Command

`/peer-alarm list | board [close] | on | off | sound on|off`

(Claude Code ships a `/peers` command of its own, so the command is
`/peer-alarm`; the mod keeps the name `peers`.)

- `list` (also `/peer-alarm` alone): reads herdr now and answers every peer's
  pane, agent, state, time in that state and title, for example
  `w1:p6  claude  working 12m "Explore ML platforms"`. The time counts from the
  first poll that saw the pane in that state, so it is left out for a pane the
  watcher has not yet seen so.
- `board`: opens the board pane and reads herdr now (again, while it is
  open: the twin of `r`); `board close` closes it (the twin of `q`).
- `on`, `off`: start or stop the watcher; kept in the mod's store
  (`peers.watch`), which every session shares, so either one typed in any pane
  applies to every pane of the workspace within 30 s. `on` starts from a fresh
  baseline.

Only an interactive terminal session watches: a headless `claude -p` run
started from a herdr pane inherits the herdr env but never polls or beeps.
- `sound on`, `sound off`: kept in the store (`peers.sound`), winning over the
  `sound` option; `sound` alone answers which applies.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `sound` | `off`, `on` | `off` |

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install peers@zehui-mods --scope user
```

## Notes

- No network and no model: the mod runs `herdr agent list` and nothing else,
  and reads only `~/.local/state/herdr-orch/<req>/result.md` files.
- Only the current herdr workspace is watched; cross-workspace watching is out
  of scope (hand off to the other workspace instead).
- English only. No band row; one pane, `peers`.
