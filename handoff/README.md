# handoff

A ⇄ HANDOFF row above the prompt: how full the chat is, and a one-key way to
save a handoff before it compacts.

```
 ⇄ HANDOFF ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱░░ 62%  Messages 40% · System prompt 12% · System tools 8%   [ h: save now ]
```

- **Bar**: 20 cells stacked by the categories `/context` draws, each used
  category `▰` in its colour, free space dim `▱`, the auto-compact buffer
  `░`. A category under half a cell folds into its neighbour; deferred tool
  schemas are left out.
- **Percent**: the fill as a share of the **compaction point** (where
  auto-compact fires; the window when auto-compact is off). Green under 60%,
  amber from 60% to the threshold, red from the threshold. The PLAN row of
  token-weather shows the share of the whole window, so the two numbers can
  differ.
- **Top three** used categories, `name n%` of the window, in their colours;
  dropped first (third first) when the row is short of columns.
- **At the threshold** (default 80% of the compaction point): one toast per
  crossing, "Chat is 80% full, save a handoff (/handoff-line now)", and a
  framed `[ h: save now ]` button. In `auto` mode the save starts by itself.
- **Save now** runs your own `/handoff` command if one exists; otherwise it
  sends Claude a prompt to write `HANDOFF.md` in the session root (objective,
  done / in progress / next, decisions and why, open questions, exact next
  step). The row shows `writing HANDOFF.md…`, then `✓ saved 14:32` with
  `[ c: clear & continue ]`, which runs `/clear`. If you keep working instead
  and the fill crosses the threshold again (after a compaction), the old save
  is done with: the row offers `[ h: save now ]` again and `auto` mode saves
  again. `/handoff-line now` while a save is still being written says so
  instead of asking twice.
- **Next session** (or after a `/clear`) with a `HANDOFF.md` in the root: a
  toast "Handoff from 2d ago available (/handoff-line resume)" and the row
  shows `from 2d ago: <objective>` with `[ r: resume ]`, which sends "Read
  HANDOFF.md and continue from its exact next step". The offer goes once the
  first turn ends.
- **Before a compaction** with no handoff saved in the last 10 minutes: a
  toast "Compacting without a fresh handoff". It never stops the compaction.

The buttons work only while the band has focus (ctrl+x tab, or a click in
Claude Code's fullscreen renderer; the classic renderer reports no clicks), so
every one has a command:

| Button | Command |
| --- | --- |
| `h: save now` | `/handoff-line now` |
| `c: clear & continue` | `/clear`, then `/handoff-line resume` |
| `r: resume` | `/handoff-line resume` |

## Command

`/handoff-line on | off | now | resume | threshold <50-95> | mode auto|ask | status | reset`

`on`, `off`, `threshold` and `mode` are kept in the mod's store and win over
the plugin options; `reset` drops them so the options apply again. `off`
hides the row and its toasts; `now` and `resume` still work. `status` prints
the settings, the context reading and where it came from, `HANDOFF.md`'s time
and which save path `now` takes.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `band` | `on`, `off` | `on` |
| `mode` | `ask`, `auto` | `ask` |
| `threshold` | 50 to 95 (% of the compaction point) | 80 |

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install handoff@zehui-mods --scope user
```

## Notes

- The reading is token-weather's (`token-weather.context`, read once per
  turn there). Without token-weather this mod reads the same breakdown itself.
- `HANDOFF.md` goes in the session root (`$.session.root()`: the repo root in
  a repo). Gitignore it if you do not want it committed.
- The row composes with the other bands: keyed `zm-30-handoff`, it takes its slot in
  the zehui-mods stack order (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70, NEXT 80);
  other bands follow. It yields to a survey. Terminal only. English only.
