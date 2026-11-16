# skins

A Claude Code mod that redraws the transcript: tool rows on a rail that open onto
their input and answer, highlighted code, diff, table, math, Mermaid and shell
cards, file links, folding, a calm mode, an optional usage band above the prompt
and sixteen themes. It draws on the terminal and on the desktop app.

Fork of https://github.com/hellosverre/claude-skins at v0.5.16 (MIT). Local changes are in PROVENANCE.md.

In this fork the default skin is `terminal` (the terminal's own 16-colour
palette), the usage band is off until `/skin band on`, the plugin makes no
network, file or process call (no update check, no star notice, no system
dark-mode probe), and the band's Compact button has no digit hotkey.

## Install

```sh
claude plugin install skins@zehui-mods --scope user
```

## Commands

| Command | What it does |
| --- | --- |
| `/skin` | Open the settings pane |
| `/skin gallery` | Open a pane showing every element |
| `/skin list` | List the skins and the current settings |
| `/skin help` | List every command |
| `/skin <name>` | Switch skin (`terminal`, `noir`, `nord`, `dracula`, ... or a skin you made) |
| `/skin off` / `/skin on` | Back to Claude Code's own drawing, and back to the skin |
| `/skin calm [on\|off]` | Still the spinner, drop the rail, fold read-only output |
| `/skin band on\|off` | The usage band above the prompt (context and rate-limit meters, Compact) |
| `/skin <part> on\|off` | Switch one part: `rail`, `shimmer`, `countdown`, `clip`, `markdown`, `quiet`, `charts`, `math`, `commands`, `shell`, `highlight`, `hints`, `links`, `copy`, `fold`, `expand`, `compact` |
| `/skin tables on\|text\|off` | Table cards, plain text tables, or Claude Code's own |
| `/skin prompt left\|right\|plain`, `/skin words claude\|skin`, `/skin icons unicode\|ascii` | Prompt layout, spinner words, icon set |
| `/skin pin` / `/skin unpin` / `/skin share` | Give this folder its own look, drop it, or make it the default |
| `/skin copy` / `/skin copy code` | Copy the last reply, or its code |

On `auto`, the light or dark palette comes from `SKINS_THEME`, then Claude Code's
`theme` setting, then `COLORFGBG`; with none of them it is dark.

The bundled `skin-designer` skill designs a skin from a description through the
mod's `mcp__skins__design` tool. The skill is gated: Claude suggests it and runs
it only when you ask.
