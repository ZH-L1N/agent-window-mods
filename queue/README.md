# queue

A prompt queue with no model call. `/q <text>` queues a prompt; each time a
main-loop turn ends normally, the first item is submitted as your next
prompt, so a list of steps runs one after another while you are away.

```
 ≡ QUEUE    2 queued · run the tests and fix what fails                 [ next ] [ pause ] [ pane ]
 ≡ QUEUE    2 queued · run the tests and fix what fails waiting on agents  [ next ] [ pause ] [ pane ]
 ≡ QUEUE    1 queued · write the changelog paused                      [ next ] [ resume ] [ pane ]
```

## /q

| Command | What it does |
| --- | --- |
| `/q <text>`, `/q add <text>` | Appends a prompt (at most 50, each at most 4,000 characters). A text that starts with `/` is refused: slash commands cannot be queued, type them directly. |
| `/q`, `/q list` | Prints the queue, numbered from 1. |
| `/q rm <n>` | Removes item n. |
| `/q up <n>` | Moves item n one place up. |
| `/q clear` | Empties the queue. |
| `/q pause`, `/q resume` | Stops and restarts the automatic send. |
| `/q next` | Sends item 1 now. |
| `/q send <n>` | Sends item n now. |
| `/q pane`, `/q close` | Opens or closes the queue pane. |
| `/q sel <n>` | Selects item n in the pane. |

The row's buttons and the pane's keys each have a `/q` twin: `next` is
`/q next`, `pause` and `resume` are `/q pause` and `/q resume`, `pane` is
`/q pane`; in the pane `j` and `k` move the selection (`/q sel <n>`), `x`
removes it (`/q rm <n>`), `u` moves it up (`/q up <n>`), `s` sends it
(`/q send <n>`) and `c` closes the pane (`/q close`). Clicks need the
fullscreen renderer; the commands work everywhere.

## When it sends

- **Only after a main-loop turn that answered.** A turn that ends with
  `reason` `answer` and was not interrupted sends item 1, from a timer
  after the turn, as your own prompt. A subagent's turn is ignored.
- **A turn that did not finish pauses the queue.** An interrupt (Esc), an
  error or a refusal pauses it with the toast
  `queue paused: last turn did not finish; /q resume`.
- **One at a time.** From the moment a queued prompt is submitted until its
  turn starts, another turn's end sends nothing. This flag lives in the
  mod's state, so a hot reload of the mod cannot send a second item; it
  clears when the next main-loop turn starts, or when the send is dropped
  or fails, and a session start leaves it as it is (a new session cancels
  a waiting send and its wait).
- **No slash commands.** A slash command starts no model turn, so nothing
  would clear that flag and the queue would stall: `/q add` refuses a text
  that starts with `/`, answering
  `Slash commands cannot be queued: type them directly.`
- **Never while a subagent runs.** Before an automatic send the queue reads
  the agents mod's runs (`agents.runs`). While one with `kind` `agent` (or
  no kind) is `running`, the send waits, the row says `waiting on agents`
  in yellow, and it looks again every 5 seconds until the agent finishes,
  the queue is paused or emptied, or a main-loop turn starts (that turn's
  own end then decides). Background shells, watches and crons do not hold
  it. Without the agents mod the queue sends as if no agent ran.
- **A survey delays the send.** While a survey holds the band, the send
  waits and looks again every 2 seconds for a minute, then gives up with
  a toast; `/q next` sends by hand.
- **A dropped send pauses.** When the engine or a hook drops the submitted
  prompt, or the submit fails, the item goes back to the front and the
  queue pauses, with a toast naming why.
- **By hand, at once.** `/q next`, `/q send <n>`, the row's `next` and the
  pane's `s` send immediately, paused or not, agents running or not. A
  manual send sends the item it named: when that item changed before it
  went (the automatic send took it a moment earlier), it sends nothing and
  says `queue: item <n> changed before it was sent; /q list`.

## Known gap

A permission prompt cannot be seen by a mod: the queue cannot tell a turn
that waits on your answer from one that is still working, nor whether you
allowed or denied the call. It goes only by how the turn ended, so a turn
that answered after a denied call still sends the next item. Pause the
queue (`/q pause`) when you expect prompts that ask for permission.

## State

`queue.queue` (declared in `types/index.d.ts`): `items`, `isPaused`,
`selected`, `isSending` and `waitingOn` (`''`, `agents` or `survey`). The
strip reads it for its queue pill.

## Install (local)

```bash
claude plugin install queue@zehui-mods --scope user
```

See `PROVENANCE.md` for where it came from.
