# cache-clock

A ● CACHE row above the prompt: how long the prompt cache stays warm, and
what letting it go cold would cost.

```
 ● CACHE  warm 52m ▰▰▰▰▰▱ 94% reused · 180k cached · rewrite ≈ $1.44   [ Compact ]
 ● CACHE  COLD ▱▱▱▱▱▱ 180k to rewrite ≈ $1.44 on next send            [ Compact ]
```

- **Countdown**: every main-loop request that reads or writes the prompt
  cache restarts it from that request's start. The 6-cell bar is the time
  left out of the cache window. Green above 15 minutes, amber at 15 or under,
  red `COLD` at 0. The row ticks every 30 seconds while warm and stops once
  cold.
- **% reused**: cache reads ÷ (reads + writes + fresh input) of the last main
  request that touched the cache.
- **cached**: that request's cache reads plus writes: the tokens the next
  send reads cheaply while warm, or writes again once cold.
- **rewrite**: cached × the cache-write price of the model that answered, at
  the rate of the window's TTL (1-hour write, 2× input, for 60; 5-minute
  write, 1.25× input, for 5). A model the price table does not know shows
  `≈ ?`.
- **Toast** once, at 5 minutes left: "180k cached, rewrite ≈ $1.44. Send
  anything to keep it warm."
- **Compact** compacts the conversation (`$.session.compact()`, the same as
  `/compact`) and toasts the result. The row then hides until the next cache
  request, as it does after your own `/compact` or a `/clear`.
- Subagents' requests never move the row; they count only into the session
  totals that `/cache-clock status` prints.

**Dollar figures are estimates**: list prices from the claude-api skill
(cached 2026-10-06), not your bill. On a subscription plan nothing is billed
per token; the figure is what the same tokens would cost on the API.

The Compact button works only while the band has focus (ctrl+x tab, or a
click; herdr passes no clicks), so it has a command too:

| Button | Command |
| --- | --- |
| `Compact` | `/cache-clock compact` |

## Command

`/cache-clock on | off | status | compact`

- `on`, `off`: show or hide the row and its toast; kept in the mod's store and
  winning over the `band` option.
- `status`: the window, warm or cold, the last main request's figures, and the
  session's cache reads, writes, % reused and estimated dollars saved
  (reads × (write price − read price)), main loop and subagents apart.
- `compact`: as the button; the result comes as a toast.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `band` | `on`, `off` | `on` |
| `cacheMinutes` | `5`, `60` | `60` |

**Why 60 minutes**: this account's prompt cache lives for 1 hour (the
1-hour TTL), so a reply within the hour reads the conversation from cache.
When usage runs on **overage**, the TTL drops to 5 minutes; set
`cacheMinutes` to `5` by hand then. In the 5-minute window the row turns amber
at 2 minutes left and the toast comes at 1 minute (15 and 5 would fire at
once on every request).

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install cache-clock@zehui-mods --scope user
```

## Notes

- The figures come from each request's usage as the API reported it
  (`turn.step`); nothing is fetched and no model is called.
- The row composes with the other bands: keyed `zm-40-cache`, it takes its slot in
  the zehui-mods stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80);
  other bands follow. It yields to a survey. Terminal only. English only.
