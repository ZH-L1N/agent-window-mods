# web

`/web` opens a link in terminal-browser (the browser that runs in a terminal pane) in a
herdr pane below this one, and the `web_read` tool lets Claude read the page
that browser shows. The mod fetches nothing itself: the browser does the
fetching, and the mod only runs `herdr` and `terminal-browser`.

## /web

`/web [<url>] | close | trusted | forget <origin>`

- `/web <url>`: opens the address. In herdr (`HERDR_ENV=1`) only; elsewhere
  the answer is "/web needs a herdr pane".
  1. `herdr pane split --current --direction down --no-focus --cwd <session cwd>`
  2. `herdr pane run <new pane id> "terminal-browser open '<url>'"`

  The new pane's id is kept in `$.state` (`web.pane`). While the browser in
  that pane still runs, a later `/web <url>` opens a new tab there instead
  (`terminal-browser action --browser <key> -- open <url>`, terminal-browser's
  own open-tab, no shell) and splits nothing.
- **Address check**: `http://` or `https://` only; no whitespace, quote,
  backslash, control character, user name or password. The address goes out
  as the URL parser writes it (ASCII), inside single quotes.
- `/web` alone: the last `http(s)://` link in Claude's last reply with text
  (bare, in a Markdown link or in `<...>`; trailing punctuation dropped).
- `/web close`: closes the pane this mod opened, with `herdr pane close <id>`.
  Not `terminal-browser shutdown`, which stops the whole daemon and every
  browser. When herdr refuses, the answer says so and the pane stays
  remembered; close it in herdr by hand.
- `/web trusted`: the sites `web_read` reads without asking.
- `/web forget <origin>`: removes one (any address on that site works).

## web_read (tool)

`mcp__web__web_read`, deferred (behind ToolSearch, so its schema does not ride
in every request). Input `{ url?: string }`.

- Without `url`: reads the active tab of the browser in the pane `/web`
  opened, else of the first browser in this terminal tab
  (`terminal-browser ls --json`).
- With `url`: asks about the site first, then opens it (a new tab of a
  running browser, or a new herdr pane as `/web` does), waits up to about
  3 seconds for the tab to show it, and reads it.
- **Reading**: `terminal-browser action --browser <key> --tab <id> -- eval
  <fixed script> --json`. The script (in `hooks/kit.ts`) only reads: it
  clones `main`, else `article`, else `body`, drops script, style, noscript,
  template, nav, header, footer, aside, frames, svg, canvas, form controls,
  nodes hidden by attribute and nodes the page hides with CSS (`display:
  none`, `visibility: hidden`), collapses whitespace and cuts the text at 20,000 characters;
  links are the first 50 distinct `http(s)` anchors.
- **Returned** (JSON text, the tool result only; nothing is written anywhere):

  ```json
  { "origin": "https://docs.example.com", "pathname": "/guide/intro",
    "title": "...", "text": "...", "links": [{ "text": "Next", "href": "https://docs.example.com/guide/next" }],
    "omitted": ["query strings", "fragments", "cookies", "storage", "form values", "frames", "images"] }
  ```

  `omitted` adds `text beyond 20,000 characters` and `links beyond 50` when
  either was cut. The mod bounds the page's answer again whatever the page
  returned: origin and path re-derived (http/https only), title 300
  characters, text 20,000, links 50 with every `href` reduced to origin +
  pathname, `omitted` rebuilt.
- **Trust**: a site not in `$.store` (`web.trusted`) gets one question:
  "Let Claude read pages from <origin>?" with `Allow once`, `Always`, `No`.
  `Always` stores it; `No`, a typed answer or a dismissed question returns
  `{"denied":"<origin>"}` and reads nothing. The page's own answer is not
  trusted for its origin: after the read, `terminal-browser ls --json` gives
  the tab's real address, a disagreement returns nothing, and a page that
  moved to another site between the check and the read is asked about again.
- Failures (no browser, a non-http tab, a page that did not appear, a script
  error) come back to Claude as an error result naming what to do.

The capture's shape follows Zehui's ui-selector `CaptureV1` contract: page
identity is origin + pathname, and everything not captured is named.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `split` | `down`, `right` | `down` |

## Install

From the local marketplace folder (`~/.claude/mods`):

```bash
claude plugin install web@zehui-mods --scope user
```

## Notes

- No network from the mod: it runs `herdr` (split, run, close) and
  `terminal-browser` (ls, action open, action eval), nothing else. No model is
  called. Nothing is drawn: no band row, no pane of its own.
- One open at a time: a second `/web` or `web_read` while a pane is being
  split says so.
- English only.
