# Provenance

## Code

All code in this mod is Zehui Lin's own, written on 2026-11-16 with Claude
(Claude Code), under the MIT license. It is written from the Claude Code
plugin API's declarations (Claude Code 2.1.325 types); no third-party code is
copied, and no other mod's source outside this repo was read to write it.

- `hooks/rules.ts`, `hooks/card.tsx` and `hooks/register.tsx` are written to
  the rules and the tables of plan `plans/2026-11-16-strip-forks-safety.md`,
  Task 13.
- `hooks/hold.ts` is a byte-for-byte copy of `motion-hold/hooks/hold.ts` (the
  hold kit, Task 6 of the same plan). It is never edited here: a change is
  made in motion-hold and copied, and `cmp` of the two files stays silent.
- `hooks/register.tsx`, `hooks/card.tsx` and `hooks/test-kit.ts` follow the
  shape of this repo's motion-hold mod (the engine object handed to the kit,
  the config loader, the card and the test world).

## Where the mod goes past the plan's texts

Choices the plan left open, listed so a later change can be checked against
them.

1. **Globs.** A `gate` glob matches the full tool name case aside (it holds
   more); a `pass` glob matches it as written (it lets through less).
2. **Broken config and drafts.** With a broken config a name with `draft` in
   it is held as `site` like any other tool that is not a read: the file
   that could not be read may have named it.
3. **Config shape.** A `gate` or `pass` value that is not a list, an entry
   that is not text and an empty entry make the read broken; an unknown key
   is a warning.
4. **Preview.** Target parts are joined with ` · `, a list value with `, `,
   each part labelled with the argument's own name as the call spells it.
   Body values are joined with a line break. Mentions and dates are read
   from the whole text before it is cut to 600 characters, so none hides
   past the cut. An argument whose key is on a list but whose value is
   empty is not a field. `Preview` carries `hasBodyKey`, which the plan's
   type does not list, so the card can tell `Text none` from `Text not in
   this call`. A calendar argument such as
   `start: { dateTime, timeZone }` shows its `dateTime` (or `date`) and its
   `timeZone` (item D below). An ISO date with a time shows whole. Month names count in full and short form.
5. **Card.** For kinds other than `site` the card also shows `Tool <name>`;
   `To (no target named)` stands in for an empty target, `Text none` for an
   empty text and `Text not in this call` for a call with no body key (a
   `site` call with no text shows no `Text` line). A
   subagent's call says `From a subagent`. The fields share one `Also`
   line, each `key: value`, joined with ` · ` (item A below).
6. **The record before a send.** An approved call is listed in `recent` as
   `sent` before it goes out; if that write fails, the call is refused with
   the gate's failure text. A `not-gated` or `denied` record that fails is
   skipped.
7. **Status.** The mode line reads the gate's own copy of the mode, which a
   session start sets from the stored state (or leaves `unknown`, gated,
   when the state cannot be read).
8. **Session start** applies the launcher's variable, then the settings'
   default, only while no event has named the mode and the stored mode is
   not gated; an event that arrives while a session start is still reading
   wins over it. A store that holds `unknown` with no source reads as empty
   (that is what a store with nothing in it answers), so the variable and
   the settings apply there.
9. **`/send-gate test`** answers `<tool name>: <kind>` or `<tool name>: not
   gated`; `/send-gate tools` lists the names under one header line, or says
   `Every MCP tool is gated or a read.`
10. The pane's border and title are Catppuccin Mocha peach, `#fab387`.

## Second fix round (2026-11-16)

Fixes to the re-review of the first fix round, each to the plan's Task 13
passages marked "Corrected again 2026-11-16" (previewOf) and "Added
2026-11-16 after the phase 4 live check" (Mode).

- **A. The text is always in the dialog.** The card's lines are the tool,
  the subagent line, `To`, `Mentions`, `Dates`, `Text`, then one `Also`
  line with every other argument, cut to 300 characters. A card has at
  most seven lines; the dialog shows eight. A `site` call's fields moved to
  the same line.
- **B. Secrets at any depth.** Lists and objects are written as JSON with a
  replacer that masks the value of any key matching the secret pattern,
  which now also covers `authorization`, `bearer` and `cookie`, at the top
  level too. Target values and date objects use the same writer.
- **C. No forged card lines.** A line break (`\n`, `\r`, U+2028, U+2029) in a
  field key or value, a target, a date or a mention is drawn as `⏎` before
  the cut. The text's line breaks are drawn as `⏎` on the card as well,
  since a text line starting with `To ` would read as a card line in both
  the pane and the dialog. `Preview.body` keeps its line breaks; the card
  draws them.
- **D. Date objects.** `{ dateTime | date, timeZone? }` shows the time and
  the zone; an object with any other key shows as compact JSON, cut to 80
  characters, secrets masked.
- **E. Unwritable arguments refuse.** The JSON writer no longer swallows a
  failure: `previewOf` throws and the gate's catch refuses the call with
  its failure text. The engine's test kit refuses tool-call arguments
  nested deeper than 28,000 levels, and at that depth `JSON.stringify`
  still succeeds there, so the register test sends a value that
  `JSON.stringify` refuses for another reason (a BigInt in a list and in an
  object) and a second test shows a 200,000-deep call never reaches the
  tool; `rules.test.ts` covers `previewOf` on the 200,000-deep value.
- **F. A stored gated mode stays gated.** At session start a stored mode
  that is gated is kept whatever the stored `modeFrom` says, so a reload
  between the two writes cannot put the settings' default (or the
  launcher's variable) over a live bypass mode.
- **G. The launcher's variable.** `SEND_GATE_MODE`, read at session start
  with `$.env.get` (a failed read counts as absent), sets a known mode with
  `modeFrom: 'env'`: over the settings, under any event, never over a
  stored gated mode. `claude plugin validate` lists it among the env reads.

## Config

The site's tool names are not in this repo. They live in a local file
(`<HOME>/.claude/send-gate.json`). The repo holds a neutral example only:
`examples/send-gate.example.json`.
