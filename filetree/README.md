# filetree

A small tree of the working folder in a `Files` pane: folders open and
close, git marks changed files, and the files read or written this turn are
listed on top. No preview, no watcher process, no keybinding file.

```
Files · my-project · 3 changed · 2 touched this turn     [ r: refresh ] [ c: close ]
Touched this turn
  src/main.ts  written
  README.md    read
▾ src/ •
    main.ts M
    util.ts
▸ tests/
  README.md
/tree refresh · /tree close · /tree toggle <path>
```

## How it works

- **The root** is the session's working folder (`$.session.cwd()` at the
  session's start). A load in another folder starts a fresh tree; a reload in
  the same one keeps the open folders.
- **Listing:** `$.fs.list` reads the root when the pane opens and a folder
  when it is opened. Folders come first, then files, by name without regard
  to case. Left out: `.git`, `node_modules`, `.DS_Store`, `__pycache__`,
  `.venv`, `dist`, `build`, `target`, and links and other special entries.
  A folder that cannot be listed shows empty. Limits: 200 entries per folder
  (the rest as `… N more`), 8 levels deep, 400 rows in all.
- **Git:** `git -C <root> status --porcelain` (3-second limit, with
  `GIT_OPTIONAL_LOCKS=0` so the read never takes the index lock from a
  `git add` or `git commit` running in the background) when the pane
  opens, on `r` or `/tree refresh`, and when a main-loop turn ends while the
  pane is open. A file shows its code: `M` yellow, `A` and `??` green, `D`
  red; a folder with a change anywhere under it shows `•`, and so does a
  folder inside one git lists whole as untracked (the files in it show
  `??`). When the root is below the repository's top, only the changes
  under the root are shown (the top is found by looking for `.git` in the
  folders above); when the root itself or a folder above it is untracked,
  everything shows `??` and the head line reads `all untracked`. At most
  5000 marks are kept (the head line then reads `5000+ changed`). No git,
  not a repository, a timeout or a non-zero exit: no marks.
- **Touched this turn:** every `Read`, `Edit`, `Write` and `NotebookEdit`
  that went through (refused, failed or staged calls do not count), the main
  loop's and its agents', on a path inside the root. A write wins over a
  read. Up to 8 paths, writes first; in the tree a written file is peach and
  bold, a read one sapphire. A new main-loop turn clears the block.

The pane draws on the terminal only; other surfaces get what lies beneath.

## Command

`/tree [close | refresh | toggle <path>]`

- `/tree`: opens the Files pane with the keyboard, lists the root and reads
  git.
- `/tree close`: closes it (the twin of `c`).
- `/tree refresh`: lists the root and every open folder again and reads git
  (the twin of `r`).
- `/tree toggle <path>`: opens or closes a folder, relative to the root (the
  twin of pressing the folder's row).

Keys while the pane has the focus: `r` refresh, `c` close. A folder row is a
button; clicks need the fullscreen renderer, so every press has its command.

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install filetree@zehui-mods --scope user
```

## Notes

- No network and no model. The only process it runs is
  `git -C <root> status --porcelain` (with `GIT_OPTIONAL_LOCKS=0`); it
  writes no files.
- English only. No band row; one pane, `filetree`.
