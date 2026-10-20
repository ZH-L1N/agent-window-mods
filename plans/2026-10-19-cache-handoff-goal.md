# Plan: CACHE line, HANDOFF line (context moves there), GOAL line

**Status: implemented 2026-10-19 21:20, live-verified 21:45** (defaults: band order as drawn, HANDOFF.md in the session root, cacheMinutes 60; the agent-radar follow-ups come after, in the agents mod)

Zehui, 2026-10-19 evening: "I also wanna have the cache, and maybe lets move
the context related ui to handoff to avoid too much info in one line; also do
we need to set a goal to have the goal section?"

All three are written from scratch as separate mods in `~/.claude/mods`, in
the deck's idiom (chip, `▰▱` bar, traffic-light colours), composing beneath
each other. No third-party code. Each is one hooks module plus tests.

## Band stack after this plan (top to bottom)

```
 ◎ AGENTS  …                              only while subagents run (+10 s)
 ◆ GOAL    Build the mods ▰▰▰▰▱▱ 4/6 · 67% · 18m · ETA ~9m │ ▶ Write the deck   only while a task list exists
 ● CACHE   warm 52m ▰▰▰▰▰▱ 94% reused · 180k cached · rewrite ≈ $1.12   [Compact]
 ⇄ HANDOFF ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱░░ 62%  messages 40% · tools 12% · system 8%   h: save now
 ◔ PLAN    ☀ 117k / 1M  last turns ▂▃▂▆▂▁▂  +1.9k  cost $97.53  Oct $412 · 38M tokens
```

At rest (no agents, no task list) that is three rows. Every row yields to the
survey card and to `hasSurvey`, and each mod has `on | off` in its options.

## 1. token-weather: context moves out

Local change 6: the stacked context bar, the percent and the top-three
categories leave the PLAN row. The row keeps the chip, the weather glyph,
`tokens / window`, the 12-turn chart, the delta, the session cost and the
month figure. The breakdown reading code stays in token-weather and is
exposed to the handoff mod through `$.state` under `token-weather.context`
(declared in its types), so the breakdown is read once per turn, not twice.
If the handoff mod is off, PLAN shows a plain `12%` after the glyph so the
number is never lost.

## 2. `handoff` mod: ⇄ HANDOFF

- Chip ` ⇄ HANDOFF ` bold `#0b0b0f` on violet `#a78bfa`.
- The 20-cell stacked context bar, percent and top-three categories, exactly
  as drawn today, read from `token-weather.context` (falls back to its own
  `$.session.usage({ breakdown: 'summary' })` on turn.complete when
  token-weather is absent).
- Threshold 80% of the compaction point (option `threshold`). Under it the
  row ends with nothing. From 60% the percent is amber; at the threshold the
  row turns red, a toast fires once ("Chat is 80% full, save a handoff"), and
  the row ends with a framed button `h: save now` (hotkey `h`, pane-less, so
  it needs the band focused; the toast names the command as well).
- `save now` runs the person's `/handoff` command through `$.command.run`
  from a timer if one exists; otherwise it submits a short prompt asking
  Claude to write `HANDOFF.md` in the session root with objective, done /
  in progress / next, decisions and why, open questions, exact next step.
  After the file is written the row shows `✓ saved 14:32` and a framed
  `c: clear & continue` button that runs `/clear` then offers the resume.
- Mode `ask` (default) only turns red and waits; mode `auto` saves by itself
  at the threshold.
- Before a compaction (`session.compact` hook): if no handoff in the last
  10 minutes, toast "Compacting without a fresh handoff". Never veto.
- New session with a `HANDOFF.md` in the root: toast "Handoff from 2 days
  ago available", and the row shows `from 2d ago: <objective>` with a framed
  `r: resume` button that submits "Read HANDOFF.md and continue from its
  exact next step".
- `/handoff-line on | off | now | resume | threshold <n> | mode auto|ask |
  status` (the bare `/handoff` name is left to the person's own command).
- State in `$.store`: mode, threshold, last save time per session root.

Question for review: is there an existing `/handoff` command or skill to call?
None was found under `~/.claude/commands` or in the skills list at planning
time; the plan assumes none and writes `HANDOFF.md` itself.

## 3. `cache-clock` mod: ● CACHE

- Chip ` ● CACHE ` bold `#0b0b0f` on cyan `#22d3ee`.
- `warm 52m ▰▰▰▰▰▱ 94% reused · 180k cached · rewrite ≈ $1.12 [Compact]`.
  The bar is the time left in the cache window out of `cacheMinutes`
  (option: `5` or `60`, default `60`, matching this account's 1-hour prompt
  cache TTL; overage drops it to 5 minutes, which the person sets by hand).
  Green above 15 minutes, amber at 15 or under, red `COLD ▱▱▱▱▱▱ 180k to
  rewrite ≈ $1.12 on next send` at 0.
- Data: `turn.step` on the main loop only (no agentId): a step whose usage
  has `cache_read_input_tokens` or `cache_creation_input_tokens` restarts the
  countdown; `% reused` = reads ÷ (reads + writes + fresh input) on the last
  main step; `cached` = the last step's read + creation tokens; `rewrite` =
  cached × the cache-write price of the model that answered, from a price
  table copied from the claude-api skill (same table the agents mod carries,
  moved to a tiny shared file `~/.claude/mods/shared/prices.ts`? No: plugins
  cannot import across folders, so the table is duplicated with a comment
  naming the other copy). Unknown model: `≈ ?`. Dollars are labelled estimates
  in the README.
- Tick every 30 s with `$.clock.every`; last-cache time in `$.state`.
- Toast once at 5 minutes left: tokens, rewrite cost, "Send anything to keep
  it warm".
- Framed `[Compact]` button calls `$.session.compact()` and toasts the
  result; a test proves the button triggers the call.
- `/cache-clock on | off | status`; status shows reads, writes, % reused and
  the estimated dollars saved (reads × (write price − read price)).

## 4. `goal-meter` mod: ◆ GOAL

Answer to "do we need to set a goal?": no. The row reads Claude's own task
list. It appears when a TodoWrite call (the task tool this build uses:
checked against the tool types at build time) creates tasks in the main loop,
and hides two minutes after they are all done. Nothing to set by hand.

- Chip ` ◆ GOAL ` bold `#0b0b0f` on gold `#facc15`.
- Goal name: the first line of the prompt that started the turn in which the
  list was created, cut to about 50 characters.
- `▰▰▰▰▱▱ 4/6 · 67% · 18m · ETA ~9m │ ▶ <running task>`. ETA = average
  minutes per finished task × tasks left, shown after the first finish. Bar
  green `#22c55e`; amber `#f59e0b` when the running task has taken twice the
  average. Done: `done ✓ in 12m` in green for two minutes, then hidden, and
  one toast "Goal done in 12m, 4 tasks".
- Subagents' task lists are ignored (agentId present).
- `/goals` (the bare `/goal` is built in): no argument opens a pane with
  every task (`▶ ✓ ○` plus its time) and the last five goals; `on | off |
  clear | help`. Settings and history in `$.store`.

## Order and size

1. token-weather local change 6 + handoff mod (hours): they move together so
   the context bar is never shown twice or lost.
2. cache-clock (hours).
3. goal-meter (hours).
Each: validate, `claude plugin test`, tsc, `/reload-plugins`, live look,
PROVENANCE (all ours; deck credited for the look), TIMELINE line, memory.

## Review questions

- Band order as drawn above, or CACHE below HANDOFF?
- Handoff `save now`: write `HANDOFF.md` in the session root (repo root when
  in a repo), or under `plans/`? Default: session root, gitignored by the
  person if wanted.
- cache-clock default `cacheMinutes` 60: confirm the account's TTL is 1 hour
  (this session's runtime note says so).
