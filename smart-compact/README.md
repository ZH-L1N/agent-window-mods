# smart-compact

Offers to compact the conversation at a good moment: after a commit or a green
test run, a minute before the prompt cache expires, or when Claude asks for it
with its own `request_compact` tool. The offer is a small dialog (or a row
above the prompt where no dialog fits) with **Compact now** and **Not now**;
Esc means not now.

## Commands

- `/compact-offer`: show the offer now, at any context fill.

Claude's tool is `mcp__smart-compact__request_compact`. Settings (`/config`):
when Claude asks (`ask` or `auto`), the minimum context fill (40%), the prompt
cache lifetime (60 minutes), whether to suggest after work lands, whether to
compact while idle before the cache expires, and whether to back up the
conversation before each compact (off by default).

Fork of https://github.com/hellosverre/smart-compact at v0.3.2 (MIT). Local changes are in PROVENANCE.md.

## Install

```sh
claude plugin install smart-compact@zehui-mods --scope user
```
