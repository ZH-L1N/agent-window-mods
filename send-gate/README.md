# send-gate

In a session that runs without permission prompts, holds an MCP tool call
that would send a message or an email, notify people, or that your local
config names, and shows where it goes, who it mentions and the dates in it
until you let that one call through.

```
╭──────────────────────────────────────────────────────────────────────────╮
│ ■ Send Gate                                                              │
│ Would send a message                                                     │
│ Tool mcp__chat__post_message                                             │
│ To channel: #general                                                     │
│ Mentions <@U123>, @sam, <!here>                                          │
│ Dates 2026-11-20, Friday, 3:30 pm                                        │
│ Text Hi <@U123> and @sam, ship by 2026-11-20 or Friday 3:30 pm <!here>   │
│ [ Cancel ]  [ Send once ]                                                │
│ Enter or 2 cancels. Tab then Enter sends it once. Refused after 120 s.   │
│ Twins: /send-gate send, /send-gate cancel.                               │
╰──────────────────────────────────────────────────────────────────────────╯
```

It is a last look before something reaches other people, not a filter
against a determined model. Read "What it does not see" below.

## When it holds

- **Only in a gated mode:** `bypassPermissions`, or a mode it does not know
  yet. In `default`, `acceptEdits`, `plan`, `dontAsk` and `auto` the engine's
  own permission prompts and rules apply, and the call passes; `/send-gate
  recent` still lists it as `not-gated`.
- The mode has no getter in the engine. Every main-thread prompt, tool
  result and end of turn carries the live mode, and the latest one counts.
  A subagent's events never set it. Until the first such event, the mod uses
  `permissions.defaultMode` from the settings. Session start also fires on a
  reload, an enable or a worker respawn, and the settings never see a mode
  set on the command line or with shift+tab, so once an event has named the
  mode a session start restores that mode from the mod's state and does not
  read the settings. A stored mode that is gated stays gated at a session
  start whatever source it records, so a reload can never open the gate.
  Before the settings, a session start reads the launcher's
  `SEND_GATE_MODE` (below). A mode name the mod does not know, an unreadable
  settings file, a stored mode that cannot be read and a session where
  nothing has named the mode yet are all `unknown`, which is gated.
- Every MCP tool call is read: the main loop's, a subagent's and a Workflow
  agent's alike. Built-in tools (Bash, Edit and the rest) are not.

## What is held

The kind is decided from the full tool name (`mcp__<server>__<tool>`), by
the part after the last `__`, lowercased:

| Kind | Held when the tool is |
| --- | --- |
| `site` | named by a `gate` glob of your config |
| `message` | `slack_send_message`, `slack_schedule_message`, `post_message`, `chat_post_message`; `send_message` on a server whose name has no `mail` |
| `email` | `send_email`, `send_mail`, `reply`, `forward`, `send_draft`; `send_message` on a server whose name has `mail` |
| `notify` | `create_event`, `update_event`, `delete_event`, `respond_to_event`, `share_file` (with `_` and `-` ignored), and any name with `comment` that starts with `add`, `create`, `post` or `reply` |

- A `pass` glob of your config lets a tool through, built-in kinds included.
- A name with `draft` in it is not held, `send_draft` aside: a draft reaches
  nobody.
- Tools that publish a document (a page, a canvas) are not built in. Name
  them in `gate` if you want them held. `/send-gate tools` lists the MCP
  tools that are neither held nor a read, so gaps can be seen and named.
- **A broken config** (not JSON, a wrong type, an empty entry, an unreadable
  file): the built-in kinds still apply, and in addition every MCP tool whose
  last name part does not start with `get`, `list`, `read`, `search`,
  `fetch`, `query`, `describe`, `find`, `lookup`, `check`, `view`, `show` or
  `download` is held as `site`. A toast says so once; `/send-gate status`
  shows the error.

## What happens to a held call

- A card opens in the `send-gate` pane with Cancel (focused, hotkey `2`) and
  Send once (no hotkey). Where the pane cannot be placed (a narrow terminal),
  the engine's question dialog asks instead, with the same two answers. A
  notification says a call is waiting.
- The card shows what the call would do, the tool, `To` (every target
  argument the call has: channel, recipients, cc and bcc, thread, subject,
  attendees, calendar, file, issue or page, a draft or message id, reply-all),
  `Mentions` (`<@ID>`, `<!here>`, `<!channel>`, `<!everyone>`, `@name`),
  `Dates` (ISO dates, clock times, weekdays, a month and a day, `today`,
  `tomorrow`, `tonight`, `next week`, `EOD`, `EOW`, and the call's own time
  arguments such as `post_at`, `startTime` or `dueDate`), and the text: every
  body argument the call has (text, message, body, HTML, comment, description,
  summary and the like) joined, cut to 600 characters. Mentions and dates are
  read from the whole text, before the cut. Argument names are matched with
  case, `_` and `-` ignored, so `startTime` is `start_time`.
- Every other argument, for every kind, is on one `Also k: v · k: v` line
  after the text, cut to 300 characters: a plain value as it is, a list or
  an object as compact JSON, each cut to 80 characters. Any key that looks
  like a key, token, secret, password, credential, authorization, bearer or
  cookie has its value shown as `••••`, at any depth of an object or a
  list. So a card has at most seven lines, and the narrow terminal's
  dialog, which shows eight, always shows the text.
- A line break inside any value, the text included, is drawn as `⏎`, so a
  value can never pass for a card line of its own.
- A time given as an object shows its `dateTime` (or `date`) and its
  `timeZone`; one with any other key shows as compact JSON.
- An argument that cannot be written as JSON (nested too deep) refuses the
  call with the gate's failure text instead of showing an empty value.
- A call with no body argument at all (the send of a saved draft) says
  `Text not in this call`; one whose body is empty says `Text none`. A call
  from a subagent says so.
- **One call per approval.** Send once lets that call through and nothing
  else.
- **Fail closed.** No answer within the time limit, a dismissed dialog, any
  answer but Send once, an interrupted turn and an error in the gate all
  refuse the call, and the model reads `Send Gate held this <message | email
  | notification | call> and did not send it: <why>. Do not retry it unless
  the user asks you to.`
- One hold is asked at a time; a second held call waits for the first.

## What it does not see

- A send through anything but an MCP tool: a Bash `curl` to a webhook, a
  script, a built-in tool. The motion-hold mod holds web writes only toward
  its configured hosts.
- An MCP tool whose name says nothing of sending (`do_action`, `run`): run
  `/send-gate tools` and name such tools in `gate`.
- A mode change the engine has not reported yet. A switch to bypass mode
  mid-turn counts from the next tool result; until then the last mode seen
  holds.
- The live mode at all, where a guard plugin of a higher tier stands on the
  classic hook events and passes them on past user plugins (an
  organization's security plugin may do this; the session then prints
  `send-gate: its classic.UserPromptSubmit hook was skipped`). The gate
  then follows the configured default (`permissions.defaultMode`) for the
  whole session, and `/send-gate status` keeps saying `from the settings`:
  with a default of `bypassPermissions` every session is gated, also one
  started in another mode; with any other default a session switched into
  bypass by a flag or by shift+tab is not gated. Seen in a live session on
  2026-11-16. A launcher that starts sessions in another mode can say so
  with `SEND_GATE_MODE` (below).

## The launcher's variable

Nothing sets `SEND_GATE_MODE` by default. A launcher that starts sessions in
another mode than the configured default can export it, so the gate knows
the mode even where no event names it. For example, a launcher script that
starts helper sessions with `--permission-mode auto` exports
`SEND_GATE_MODE=auto`.

- It is read at session start. Its value, trimmed, must be a mode name:
  `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk` or
  `auto`. Any other value is ignored, as if it were absent.
- It wins over the settings' `permissions.defaultMode`. A mode a session
  event names wins over it, also one an event named before a reload.
- It cannot open a gate: a stored mode that is gated stays gated.
- `/send-gate status` then says `from the launcher's SEND_GATE_MODE`.

## The config file

A local file outside any repo: `<HOME>/.claude/send-gate.json` (or the path
in the `config` option). Every key is optional.
`examples/send-gate.example.json`:

```json
{ "gate": ["mcp__deploy__set_env"], "pass": [] }
```

| Key | Meaning |
| --- | --- |
| `gate` | Globs on the full tool name (`*` any run, `?` one character, case ignored). A match is held as `site`. |
| `pass` | Globs on the full tool name, matched as written. A match is never held. |

- **No file:** only the built-in kinds apply.
- An unknown key is a warning, shown by `/send-gate status`.
- The file is read when the session starts and on `/send-gate reload`.

## /send-gate

`/send-gate` runs at once, mid-turn too, and makes no model call.

| Command | What it does |
| --- | --- |
| `/send-gate` or `/send-gate status` | The mode and where it came from (a session event, the launcher's `SEND_GATE_MODE`, the settings, or nothing yet) and whether it is gated; the config's status, path and gate count; a pending hold. |
| `/send-gate recent` | The newest 20 sending calls: `sent`, `denied` or `not-gated`, the kind, the tool and the target. |
| `/send-gate test <tool name>` | The kind that tool name would be held as, or `not gated`. It calls nothing. |
| `/send-gate tools` | The MCP tools of this session that are neither held nor a read. |
| `/send-gate send` / `/send-gate cancel` | Answer the pending hold: the twins of the card's buttons. Only a command you typed (or sent from the Remote Control bridge) counts; from any other origin the answer is `Only the person can answer a hold.` `send` approves only a card that is on screen and has been for 1.5 seconds, so it never lands on a hold that just took the place of the one you read; otherwise it answers `A new hold just appeared: read it, then answer again.` and sends nothing. `cancel` answers at once. |
| `/send-gate reload` | Read the config file again. |

The card's buttons need the fullscreen renderer for clicks and the pane
focused for hotkeys; the commands always work. The mod draws no band row.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `timeoutSeconds` | `120` | Seconds a hold waits before it is refused (5 to 3600). |
| `config` | `""` | Absolute path of the config file (`~/` is the home folder). Empty: `<HOME>/.claude/send-gate.json`. |

## Install (local)

```bash
claude plugin install send-gate@zehui-mods --scope user
```

## Tests

```bash
claude plugin validate send-gate
claude plugin test send-gate
```

`hooks/rules.test.ts` holds the table of tool names and the preview cases;
`hooks/register.test.tsx` the mod through the engine's test kit. The tests
use neutral names only and send nothing. `hooks/hold.ts` is a byte-for-byte
copy of the motion-hold mod's hold kit, whose own tests live there.
