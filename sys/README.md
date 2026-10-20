# sys

A ▣ SYS row above the prompt: how busy the machine is, read every 5 seconds.

```
 ▣ SYS     CPU 6% ▰▱▱▱▱▱ · RAM 28.9/64G ▰▰▰▱▱▱ · ⚡ 65%   [ btop ]
```

- **CPU**: the 1-minute load average over the cores, as a percentage
  (`sysctl -n vm.loadavg` over `sysctl -n hw.ncpu`, truncated). It can pass
  100% when more is runnable than there are cores; the bar stops at six cells.
- **RAM**: active + wired + compressor pages from `vm_stat`, times the page
  size in its header, over `sysctl -n hw.memsize`, in GiB.
- **⚡**: the battery's percentage from `pmset -g batt`. A machine with no
  battery has no `⚡` segment.
- **Colours**: CPU and RAM green, amber from 80%, red from 95% (the figure and
  the bar's filled cells; empty cells dim). The battery is red under 15% while
  it is not charging (discharging, or on AC without charging).
- When the band is narrow the bars go first, then the battery.

The figures are the same arithmetic as `herdr-setup/monitor/herdr_monitor.py`
(`sysinfo_parts`, `_mem_used_bytes`).

## Reader

A `$.clock` timer reads every 5 seconds, never on render. Each command runs
through `$.process.run` with a 2-second limit; one that fails leaves only its
part out. The reading is kept in `$.state` under `sys.reading`. The timer runs
only while a terminal shows the session (`$.session.surfaces()`) and the row
is on; it stops otherwise, and `/sys on` or a new session starts it again.

## btop

The `btop` button and `/sys btop` open btop in a herdr pane below this one:

1. `herdr pane split --current --direction down --no-focus --cwd <session cwd>`
2. `herdr pane run <new pane id> "XDG_CONFIG_HOME=$HOME/.config/btop-mini btop"`
   (the new pane's shell expands `$HOME`, so btop reads the compact config in
   `~/.config/btop-mini`).

Outside herdr (`HERDR_ENV` is not `1`) nothing runs and the answer is
"btop needs a herdr pane". While one open is under way, another press or
`/sys btop` splits nothing and answers "btop is already opening". The button works only while the band has focus
(ctrl+x tab, or a click in Claude Code's fullscreen renderer; the classic
renderer reports no clicks), so it has a command too:

| Button | Command |
| --- | --- |
| `btop` | `/sys btop` |

## Command

`/sys on | off | now | btop`

- `on`, `off`: show or hide the row and start or stop the reader; kept in the
  mod's store and winning over the `band` option.
- `now` (also `/sys` alone): read at once and answer the figures, for example
  `CPU 6% · RAM 19.8/64G (31%) · ⚡ 64% (not charging)`.
- `btop`: as the button.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `band` | `on`, `off` | `on` |

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install sys@zehui-mods --scope user
```

## Notes

- No network: the mod runs `sysctl`, `vm_stat`, `pmset` and, for btop,
  `herdr`, and nothing else. No model is called.
- Not in the row: the clock (the status line has it) and today's tokens (the
  PLAN row has them, token-weather local change 10).
- The row composes with the other bands: keyed `zm-10-sys`, it takes its slot in
  the zehui-mods stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80);
  other bands follow. It yields to a survey. Terminal only. English only.
