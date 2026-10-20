# Plan: SYS row, /zh, /web with web_read, herdr peer alarm

**Status: implemented 2026-10-20 00:10, live-verified 00:45** (web_read verified with the trust ask; /sys btop verified) (defaults: web_read 20,000 chars / 50 links; /zh takes the engine's pane width; ALL DONE only after a peer was seen working)

Decisions already taken by Zehui (2026-10-19 evening, after the demos):
no herdr-request count; today's tokens move to the PLAN row; SYS refresh 5 s,
teal chip; `/zh` Simplified only, Haiku; `/web` keeps the terminal-browser
split and gets a `web_read` tool shaped after his own ui-selector contract;
the peer alarm watches the current herdr workspace only and is silent by
default. All four are written from scratch, engine APIs only.

## 1. `sys` mod: ▣ SYS row

```
 ▣ SYS     CPU 6% ▰▱▱▱▱▱ · RAM 28.9/64G ▰▰▰▱▱▱ · ⚡ 65%  [btop]
```

- Chip ` ▣ SYS     ` bold `#0b0b0f` on teal `#2dd4bf`, padded to the shared
  7-letter width.
- Data, every 5 s from a `$.clock.every` timer (never on render), each through
  `$.process.run` with a 2 s timeout and the value kept in `$.state`:
  CPU = 1-minute load average over cores (`sysctl -n vm.loadavg` and
  `hw.ncpu`); RAM = active + wired + compressor pages from `vm_stat` over
  `sysctl -n hw.memsize`; battery from `pmset -g batt` (percent and whether
  charging; the segment is left out on a machine with no battery). The same
  arithmetic as `herdr-setup/monitor/herdr_monitor.py`, Zehui's own code.
- Colours: CPU and RAM green, amber from 80%, red from 95%; ⚡ red under 15%
  when not charging. Bars 6 cells.
- The timer stops when no terminal surface is attached (`$.session.surfaces`)
  and when the row is off; it never runs inside a hook.
- `[btop]` framed Button and `/sys btop`: `herdr pane split --current
  --direction down --no-focus --cwd <cwd>`, then `herdr pane run <id>
  "XDG_CONFIG_HOME=$HOME/.config/btop-mini btop"`; without `HERDR_ENV=1`
  the command answers "needs a herdr pane". `/sys on | off | now | btop`.
- Not in the row: the clock (status line has it), today's tokens (PLAN).

## 2. token-weather local change 10: today's tokens

`today 12.4M tok` before the month figure on the PLAN row. Summed from the
engine's own usage per turn (the same `e.usage` sums the month store keeps),
stored in `$.store` under `token-weather.day.<YYYY-MM-DD>.<sessionId>` with
the month keys, pruned with them. Counts this machine's sessions since the
change, like the month figure.

## 3. `zh` mod: /zh

- `/zh` takes the last assistant message (`$.session.messages()` main
  conversation, last `role: 'assistant'` with non-empty text), asks
  `$.model.complete({ model: 'haiku', system: RULES, prompt: text,
  maxTokens })` to translate it into Simplified Chinese, and opens a pane
  `zh` titled 译文 drawing the result as `Markdown`, with a dim header
  `上一条回复 · haiku · 1.2 s` and framed buttons `prev`, `next`, `close`
  (hotkeys p, n, q; command twins `/zh 2`, `/zh 1`, `/zh off`).
- RULES: translate to Simplified Chinese; keep code blocks, inline code,
  file paths, commands, URLs, product names and proper nouns exactly;
  keep the Markdown structure; no commentary. Text over 6,000 tokens is
  split at paragraph boundaries into two calls.
- `/zh <n>`: the n-th reply back (1 = last). The pane keeps the last three
  translations in `$.state` (`zh.items`), nothing in the transcript.
- A toast "translating…" while the call runs; errors toast and leave the pane
  as it was. Cost shown in the header from the result's usage when present.
- Option `model: haiku | sonnet` (default haiku).

## 4. `web` mod: /web and web_read

- `/web <url>`: `herdr pane split --current --direction down --no-focus
  --cwd <cwd>` then `herdr pane run <id> "terminal-browser open '<url>'"`.
  The URL is validated (`http`/`https` only, no spaces, single-quoted on
  the way out). `/web` alone: the last `http(s)://…` link in the last
  assistant message. `/web close` runs `terminal-browser shutdown` for the
  tab this mod opened. Outside herdr: "needs a herdr pane".
- `web_read` tool (`$.tool.register`, deferred so its schema does not ride in
  every request; `isDeferred: true`), input `{ url?: string }`: reads the
  page terminal-browser has open (or opens `url` first) through
  `terminal-browser action --browser <key> --tab <id> -- eval` of a fixed
  script, and returns a bounded capture shaped after ui-selector's
  `CaptureV1` contract (`~/Documents/GitHub/ui-selector/docs/data-contract.md`):
  origin + pathname only (no query string, hash, cookies, storage or form
  values), title, the main readable text with scripts, styles, nav and
  footers removed, cut to 20,000 characters, links as `[text](href)` for
  the first 50, and an explicit `omitted` list. Trusted origins live in
  `$.store` (`web.trusted`); an unknown origin gets a one-time
  `$.ui.ask` "Let Claude read pages from <origin>?" with Allow once / Always /
  No, as ui-selector's run-once confirmation. The capture is returned as the
  tool result only; nothing is written anywhere.
- No network from the mod itself: the browser does the fetching, the mod
  only runs the two binaries.
- Commands: `/web <url> | close | trusted | forget <origin>`.

## 5. `peers` mod: herdr peer alarm

- Every 30 s (timer, off when `HERDR_ENV` is not `1`): `herdr agent list`
  (JSON), filtered to `$HERDR_WORKSPACE_ID`, excluding this pane.
- Transitions raise one toast each: `▲ w1:p6 "Explore ML platforms" is
  blocked`, `✓ wZ:p7 finished`, and `★ ALL DONE · 5 peers idle` once every
  peer is idle or done after at least one was working.
- Silent by default. `/peers sound on` adds `$.audio.play` of two bundled
  clips (short, generated by us: two low beeps for blocked, a rising chime
  for all done); `/peers sound off`.
- `/peers list` answers every pane's agent, state and time in state;
  `/peers on | off`.
- Nothing is drawn in the band: toasts only.

## Out of scope

Cross-workspace watching (Zehui: hand off to the other workspace instead).
E3 messages view, recording-mode.

## Steps

1. sys + token-weather change 10 (they share the "no duplicate numbers"
   rule). 2. zh. 3. web + web_read. 4. peers. Each: validate, test, tsc,
   review, reload, live look; marketplace rows; PROVENANCE; TIMELINE; memory.

## Review questions

- `web_read` cap 20,000 characters and 50 links: fine, or smaller?
- `/zh` pane width: a right split would read better for long replies, but
  panes are placed by the engine; accept whatever width it gives?
- The peer alarm's "ALL DONE" fires only after at least one peer was seen
  working in this session, so a quiet workspace never chimes. OK?

## Deviations accepted 2026-10-20 00:10

- `/web close` closes the herdr pane this mod opened (`herdr pane close <id>`) instead of `terminal-browser shutdown`, which would stop the whole daemon.
- The peer alarm's command is `/peer-alarm` (Claude Code ships its own `/peers`); the mod is still named `peers`.
- web: a `split` option (down | right), an `omitted` entry for links beyond 50, `--json` on the eval call. zh: the busy line in the pane is English, the toast is 翻译中….
