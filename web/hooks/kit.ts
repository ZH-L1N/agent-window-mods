// Shared by register.tsx and the tests: the words, the URL check, the link
// finder, the parsers of herdr's and terminal-browser's output, the page
// script web_read runs in the browser, and the bounding of what it returns.
// Nothing here runs a command or touches the network.
import type { WebCapture, WebLink } from '../types'

export const COMMAND = 'web'
export const TOOL = 'web_read'
/** The full name the model calls: mcp__<plugin>__<name>. */
export const TOOL_FULL = 'mcp__web__web_read'
export const STORE_TRUSTED = 'web.trusted'
export const USAGE = `Usage: /${COMMAND} [<url>] | close | trusted | forget <origin>   (no argument: the last link of Claude's last reply)`
export const NEEDS_HERDR = `/${COMMAND} needs a herdr pane (HERDR_ENV=1) to open the browser`

export const TOOL_DESCRIPTION =
  'Reads the page open in the terminal browser (or opens url first) and returns its title, origin+path, main text (cut to 20,000 characters) and first 50 links.'
export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: 'An http(s) address to open in the terminal browser before reading. Leave it out to read the page already open.',
    },
  },
  additionalProperties: false,
}

/** The trust question's three answers, as $.ui.ask offers them. */
export const ALLOW_ONCE = 'Allow once'
export const ALWAYS = 'Always'
export const NO = 'No'
export const ASK_HEADER = 'web_read'
export const askQuestion = (origin: string): string => `Let Claude read pages from ${origin}?`

export const MAX_TEXT = 20_000
export const MAX_LINKS = 50
export const MAX_TITLE = 300
export const MAX_LINK_TEXT = 200
/** What a capture never carries (ui-selector's §6.4 list, for a whole page). */
export const OMITTED_ALWAYS = ['query strings', 'fragments', 'cookies', 'storage', 'form values', 'frames', 'images'] as const
export const OMITTED_TEXT = 'text beyond 20,000 characters'
export const OMITTED_LINKS = 'links beyond 50'

/** Each herdr command's limit. */
export const HERDR_TIMEOUT_MS = 5_000
/** `terminal-browser ls --json` and `action -- open`. */
export const LS_TIMEOUT_MS = 5_000
export const OPEN_TIMEOUT_MS = 10_000
/** The page script's run. */
export const EVAL_TIMEOUT_MS = 15_000
/** After opening a page: how often and how many times ls is asked for its tab. */
export const POLL_MS = 250
export const POLL_TRIES = 12
/** A page still loading is read again this many times, this far apart. */
export const LOADING_RETRIES = 2
export const LOADING_WAIT_MS = 400

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))
export { whyOf }

/** The split direction option: `right`, or `down` for anything else (the default). */
export const directionOf = (option: unknown): 'down' | 'right' => (option === 'right' ? 'right' : 'down')

export type UrlCheck = { ok: true; href: string; origin: string } | { ok: false; why: string }

/**
 * An address /web may open: http or https only, no whitespace, and nothing
 * that could leave the single quotes it travels in (`'`, `\`, control
 * characters). Answers the parsed address (ASCII, as the URL parser writes it).
 */
export function checkUrl(raw: string): UrlCheck {
  const s = raw.trim()
  if (s === '') return { ok: false, why: 'no address given' }
  if (/\s/.test(s)) return { ok: false, why: 'the address has whitespace in it' }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f'\\]/.test(s)) return { ok: false, why: "the address has a quote, a backslash or a control character in it" }
  if (!/^https?:\/\//i.test(s)) return { ok: false, why: 'only http:// and https:// addresses open' }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return { ok: false, why: 'not a valid address' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, why: 'only http:// and https:// addresses open' }
  if (u.username || u.password) return { ok: false, why: 'an address with a user name or password does not open here' }
  const href = u.href
  // eslint-disable-next-line no-control-regex
  if (!/^[\x21-\x7e]+$/.test(href) || /['\\]/.test(href)) return { ok: false, why: 'the address has a character that cannot be quoted safely' }
  return { ok: true, href, origin: u.origin }
}

/** The pane's command: the address in single quotes (checkUrl has ruled out a quote inside it). */
export const openLine = (href: string): string => `terminal-browser open '${href}'`

/** An http(s) origin from an address or an origin, else null. */
export function originOf(text: string): string | null {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

/** `origin + pathname` of an http(s) address, else null. */
export function pageOf(text: string): string | null {
  try {
    const u = new URL(text)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin + u.pathname : null
  } catch {
    return null
  }
}

/** A link's tail with trailing sentence punctuation and unbalanced closing parentheses dropped (`_` stays: it can end a path). */
function trimLinkTail(link: string): string {
  let s = link
  for (;;) {
    const t = s.replace(/[.,;:!?*~]+$/, '')
    if (!(t.endsWith(')') && t.split(')').length > t.split('(').length)) return t
    s = t.slice(0, -1)
  }
}

/**
 * The last http(s) link in a text: bare or inside Markdown `[..](..)` or
 * `<..>`, with balanced parentheses kept (`.../Mercury_(planet)`) and
 * trailing sentence punctuation dropped. Null when there is none.
 */
export function lastLinkIn(text: string): string | null {
  const found = text.match(/https?:\/\/[^\s<>"'`[\]{}]+/gi)
  if (!found) return null
  for (let i = found.length - 1; i >= 0; i--) {
    const link = trimLinkTail(found[i]!)
    if (checkUrl(link).ok) return link
  }
  return null
}

/** The new pane's id from `herdr pane split`'s JSON (`.result.pane.pane_id`), else null. */
export function paneIdOf(stdout: string): string | null {
  try {
    const j = JSON.parse(stdout) as { result?: { pane?: { pane_id?: unknown } } }
    const id = j.result?.pane?.pane_id
    return typeof id === 'string' && id.length > 0 ? id : typeof id === 'number' ? String(id) : null
  } catch {
    return null
  }
}

/** One tab of a terminal browser, as `terminal-browser ls --json` lists it. */
export type TbTab = { id: string; url: string; title: string; isActive: boolean; hasTarget: boolean }
/** One terminal browser: its key (what --browser takes), its herdr pane and its tabs. */
export type TbBrowser = { key: string; pane: string | null; isInCurrentTab: boolean; tabs: TbTab[] }

/**
 * The browsers of `terminal-browser ls --json`
 * (`{ self, browsers: [{ key, pane: { tab, pane }, inCurrentTab, tabs: [{ id, active, title, url, targetId }] }] }`);
 * a tab whose `targetId` is still null cannot be read yet (`hasTarget` false);
 * an entry without a key is skipped. Null when the output is not that JSON.
 */
export function parseLs(stdout: string): TbBrowser[] | null {
  let j: unknown
  try {
    j = JSON.parse(stdout)
  } catch {
    return null
  }
  const list = (j as { browsers?: unknown } | null)?.browsers
  if (!Array.isArray(list)) return null
  const out: TbBrowser[] = []
  for (const b of list) {
    const r = (b ?? {}) as Record<string, unknown>
    const key = typeof r.key === 'string' || typeof r.key === 'number' ? String(r.key) : ''
    if (!key) continue
    const p = ((r.pane ?? {}) as Record<string, unknown>).pane
    const tabs: TbTab[] = []
    for (const t of Array.isArray(r.tabs) ? r.tabs : []) {
      const q = (t ?? {}) as Record<string, unknown>
      if (typeof q.id !== 'string' && typeof q.id !== 'number') continue
      tabs.push({
        id: String(q.id),
        url: typeof q.url === 'string' ? q.url : '',
        title: typeof q.title === 'string' ? q.title : '',
        isActive: q.active === true,
        hasTarget: typeof q.targetId === 'string' && q.targetId !== '',
      })
    }
    out.push({
      key,
      pane: typeof p === 'string' && p ? p : typeof p === 'number' ? String(p) : null,
      isInCurrentTab: r.inCurrentTab !== false,
      tabs,
    })
  }
  return out
}

/** The browser to read: the one in the pane /web opened, else the first in this terminal tab, else the first. */
export function pickBrowser(browsers: readonly TbBrowser[], pane: string): TbBrowser | null {
  return (pane ? browsers.find(b => b.pane === pane) : undefined) ?? browsers.find(b => b.isInCurrentTab) ?? browsers[0] ?? null
}

/** A browser's active tab, else its first. */
export const activeTab = (b: TbBrowser): TbTab | null => b.tabs.find(t => t.isActive) ?? b.tabs[0] ?? null

/** The tab showing `page` (origin + pathname), the active one first; null when none does. */
export function tabShowing(b: TbBrowser, page: string): TbTab | null {
  const hits = b.tabs.filter(t => pageOf(t.url) === page)
  return hits.find(t => t.isActive) ?? hits[hits.length - 1] ?? null
}

/**
 * The script web_read runs in the page (`terminal-browser action ... -- eval`).
 * It reads, never writes: it clones main (else article, else body), drops
 * script, style, noscript, template, nav, footer, header, aside, iframe, svg,
 * canvas, form controls, nodes hidden by attribute and nodes the live page
 * hides with CSS (display none, visibility hidden; read with getComputedStyle
 * on the live twin of each cloned element) from the clone, puts a line break
 * after block elements, collapses whitespace and cuts the text to 20,000
 * characters; links are the first 50 distinct http(s) anchors, each reduced to
 * origin + pathname. It returns one JSON string. The mod bounds it again.
 */
export const PAGE_SCRIPT = [
  '(() => {',
  'const MAX = 20000, LINKS = 50;',
  'const drop = "script,style,noscript,template,nav,footer,header,aside,iframe,frame,svg,canvas,object,embed,input,textarea,select,button,[hidden],[aria-hidden=true]";',
  'const blocks = "p,div,li,ul,ol,dl,dd,dt,tr,table,br,hr,h1,h2,h3,h4,h5,h6,pre,blockquote,section,article,main,figure,figcaption,details,summary";',
  'const root = document.querySelector("main") || document.querySelector("article") || document.body;',
  'let text = "";',
  'if (root) {',
  'const copy = root.cloneNode(true);',
  'const live = root.querySelectorAll("*"), twins = copy.querySelectorAll("*"), gone = [];',
  'for (let i = 0; i < live.length && i < twins.length; i++) { const cs = getComputedStyle(live[i]); if (cs.display === "none" || cs.visibility === "hidden") gone.push(twins[i]); }',
  'gone.forEach(n => n.remove());',
  'copy.querySelectorAll(drop).forEach(n => n.remove());',
  'copy.querySelectorAll(blocks).forEach(n => n.after("\\n"));',
  'copy.querySelectorAll("td,th").forEach(n => n.after(" "));',
  'text = (copy.textContent || "").replace(/[^\\S\\n]+/g, " ").replace(/ ?\\n ?/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim();',
  '}',
  'const isCut = text.length > MAX;',
  'if (isCut) text = text.slice(0, MAX);',
  'const seen = new Set(); const links = []; let isMore = false;',
  'for (const a of document.querySelectorAll("a[href]")) {',
  'let u; try { u = new URL(a.getAttribute("href") || "", document.baseURI); } catch (err) { continue; }',
  'if (u.protocol !== "http:" && u.protocol !== "https:") continue;',
  'const href = u.origin + u.pathname;',
  'if (seen.has(href)) continue;',
  'if (links.length >= LINKS) { isMore = true; break; }',
  'seen.add(href);',
  'links.push({ text: (a.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200), href });',
  '}',
  'const omitted = ["query strings", "fragments", "cookies", "storage", "form values", "frames", "images"];',
  'if (isCut) omitted.push("text beyond 20,000 characters");',
  'if (isMore) omitted.push("links beyond 50");',
  'return JSON.stringify({ origin: location.origin, pathname: location.pathname, title: String(document.title || "").slice(0, 300), text, links, omitted, ready: document.readyState });',
  '})()',
].join(' ')

/** The page script's reply, unwrapped: agent-browser's `--json` envelope, a quoted string, or the object itself. */
export function unwrapEval(stdout: string): Record<string, unknown> | null {
  let v: unknown = stdout.trim()
  for (let depth = 0; depth < 4; depth++) {
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v)
      } catch {
        return null
      }
      continue
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if ('origin' in o && 'text' in o) return o
      const data = o.data as Record<string, unknown> | undefined
      if (data && typeof data === 'object' && 'result' in data) {
        v = data.result
        continue
      }
      return null
    }
    return null
  }
  return null
}

/** The page's error from agent-browser's `--json` envelope (`{ success: false, error }`), else null. */
export function evalErrorOf(stdout: string): string | null {
  try {
    const o = JSON.parse(stdout.trim()) as { success?: unknown; error?: unknown }
    return o && o.success === false ? (typeof o.error === 'string' ? o.error : 'the page script failed') : null
  } catch {
    return null
  }
}

// eslint-disable-next-line no-control-regex
const clean = (s: string, isMultiline: boolean): string => s.replace(isMultiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '')

/**
 * The capture as web_read returns it, bounded here whatever the page answered:
 * origin + pathname re-derived (http/https only), title 300, text 20,000,
 * links 50 distinct with hrefs reduced to origin + pathname, and `omitted`
 * rebuilt from the fixed list plus what was cut (by the page or here). Null
 * when the reply is not a page of http(s) origin. `isLoading` is true while
 * the document was still loading.
 */
export function boundCapture(raw: Record<string, unknown>): { capture: WebCapture; isLoading: boolean } | null {
  const origin = typeof raw.origin === 'string' ? raw.origin : ''
  const pathname = typeof raw.pathname === 'string' ? raw.pathname : '/'
  let u: URL
  try {
    u = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, origin)
  } catch {
    return null
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.origin !== origin) return null
  const pageOmitted = Array.isArray(raw.omitted) ? raw.omitted.filter((x): x is string => typeof x === 'string') : []
  let text = clean(typeof raw.text === 'string' ? raw.text : '', true)
  let isTextCut = pageOmitted.includes(OMITTED_TEXT)
  if (text.length > MAX_TEXT) {
    text = text.slice(0, MAX_TEXT)
    isTextCut = true
  }
  const links: WebLink[] = []
  const seen = new Set<string>()
  let isLinksCut = pageOmitted.includes(OMITTED_LINKS)
  for (const l of Array.isArray(raw.links) ? raw.links : []) {
    const r = (l ?? {}) as Record<string, unknown>
    const href = typeof r.href === 'string' ? pageOf(r.href) : null
    if (!href || seen.has(href)) continue
    if (links.length >= MAX_LINKS) {
      isLinksCut = true
      break
    }
    seen.add(href)
    links.push({ text: clean(typeof r.text === 'string' ? r.text : '', false).slice(0, MAX_LINK_TEXT), href })
  }
  const omitted: string[] = [...OMITTED_ALWAYS]
  if (isTextCut) omitted.push(OMITTED_TEXT)
  if (isLinksCut) omitted.push(OMITTED_LINKS)
  return {
    capture: {
      origin: u.origin,
      pathname: u.pathname,
      title: clean(typeof raw.title === 'string' ? raw.title : '', false).slice(0, MAX_TITLE),
      text,
      links,
      omitted,
    },
    isLoading: raw.ready === 'loading',
  }
}

/** The trusted origins as kept in the store: distinct http(s) origins only. */
export function trustedOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    const o = typeof v === 'string' ? originOf(v) : null
    if (o && !out.includes(o)) out.push(o)
  }
  return out
}

/** What /web was asked. */
export type WebArgs =
  | { kind: 'last' }
  | { kind: 'open'; url: string }
  | { kind: 'close' }
  | { kind: 'trusted' }
  | { kind: 'forget'; origin: string }
  | { kind: 'usage' }

export function parseArgs(args: string): WebArgs {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'last' }
  const verb = words[0]!.toLowerCase()
  if (words.length === 1 && (verb === 'close' || verb === 'off')) return { kind: 'close' }
  if (words.length === 1 && verb === 'trusted') return { kind: 'trusted' }
  if (verb === 'forget') return words.length === 2 ? { kind: 'forget', origin: words[1]! } : { kind: 'usage' }
  if (verb === 'help') return { kind: 'usage' }
  // Anything else is an address; checkUrl says why it does not open (whitespace included).
  return { kind: 'open', url: args.trim() }
}
