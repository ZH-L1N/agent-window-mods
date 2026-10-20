// The web mod: /web opens an address in terminal-browser in a herdr pane
// below this one, and the web_read tool reads the page the browser shows as a
// bounded capture (kit.ts has the page script and the bounds). The mod itself
// fetches nothing: the browser does, and the mod only runs `herdr` and
// `terminal-browser` through $.process.run. Trusted origins live in $.store
// (web.trusted); the pane /web opened in $.state (web.pane).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { WebCapture } from '../types'
import {
  ALLOW_ONCE,
  ALWAYS,
  ASK_HEADER,
  COMMAND,
  EVAL_TIMEOUT_MS,
  HERDR_TIMEOUT_MS,
  LOADING_RETRIES,
  LOADING_WAIT_MS,
  LS_TIMEOUT_MS,
  NEEDS_HERDR,
  NO,
  OPEN_TIMEOUT_MS,
  PAGE_SCRIPT,
  POLL_MS,
  POLL_TRIES,
  STORE_TRUSTED,
  TOOL,
  TOOL_DESCRIPTION,
  TOOL_SCHEMA,
  USAGE,
  activeTab,
  askQuestion,
  boundCapture,
  checkUrl,
  directionOf,
  evalErrorOf,
  lastLinkIn,
  openLine,
  originOf,
  pageOf,
  paneIdOf,
  parseArgs,
  parseLs,
  pickBrowser,
  tabShowing,
  trustedOf,
  unwrapEval,
  whyOf,
} from './kit'
import type { TbBrowser, TbTab } from './kit'

const pane = atom({ plugin: 'web', key: 'pane' } as const, '')

// One open at a time: a second /web or web_read while a pane is being split
// waits for nothing and splits nothing. Set before any await.
let isOpening = false

/** A step that failed, with the words the person or the model reads. */
class Refusal extends Error {}

const firstLine = (s: string): string => s.trim().split('\n')[0]?.slice(0, 200) ?? ''

async function isInHerdr($: EngineInterface): Promise<boolean> {
  return (await $.env.get('HERDR_ENV')) === '1'
}

/** The browsers terminal-browser lists for this terminal tab; [] when none or when ls fails. */
async function listBrowsers($: EngineInterface): Promise<TbBrowser[]> {
  try {
    const r = await $.process.run(['terminal-browser', 'ls', '--json'], { timeoutMs: LS_TIMEOUT_MS })
    return r.exitCode === 0 ? (parseLs(r.stdout) ?? []) : []
  } catch {
    return []
  }
}

/** Splits a herdr pane (no focus, the session's cwd) and runs the browser on `href` in it; answers the pane id. */
async function splitAndOpen($: EngineInterface, options: PluginOptions, href: string): Promise<string> {
  if (!(await isInHerdr($))) throw new Refusal(NEEDS_HERDR)
  const cwd = await $.session.cwd()
  const split = await $.process.run(
    ['herdr', 'pane', 'split', '--current', '--direction', directionOf(options.split), '--no-focus', '--cwd', cwd],
    { timeoutMs: HERDR_TIMEOUT_MS },
  )
  const id = split.exitCode === 0 ? paneIdOf(split.stdout) : null
  if (!id) throw new Refusal(`herdr pane split gave no pane${split.stderr ? `: ${firstLine(split.stderr)}` : ''}`)
  await update($, pane, () => id)
  const run = await $.process.run(['herdr', 'pane', 'run', id, openLine(href)], { timeoutMs: HERDR_TIMEOUT_MS })
  if (run.exitCode !== 0) throw new Refusal(`herdr pane run failed in ${id}${run.stderr ? `: ${firstLine(run.stderr)}` : ''}`)
  return id
}

/** Opens `href` as a new tab of a browser already running (terminal-browser's own open-tab; no shell). */
async function openTab($: EngineInterface, b: TbBrowser, href: string): Promise<void> {
  const r = await $.process.run(['terminal-browser', 'action', '--browser', b.key, '--', 'open', href], { timeoutMs: OPEN_TIMEOUT_MS })
  if (r.exitCode !== 0) throw new Refusal(`terminal-browser could not open a tab in ${b.key}${r.stderr ? `: ${firstLine(r.stderr)}` : ''}`)
}

type Opened = { how: 'tab' | 'pane'; paneId: string | null; browserKey: string | null }

/**
 * Opens `href`: as a new tab of the browser in the pane /web opened when it
 * still runs, else in a new herdr pane. With `isReuseAny` (web_read), any
 * browser of this terminal tab takes the new tab.
 */
async function openUrl($: EngineInterface, options: PluginOptions, href: string, isReuseAny: boolean): Promise<Opened> {
  if (isOpening) throw new Refusal(`a page is already opening; try again in a moment (/${COMMAND} ${href})`)
  isOpening = true
  try {
    const remembered = await read($, pane)
    if (remembered || isReuseAny) {
      const browsers = await listBrowsers($)
      const b = remembered ? browsers.find(x => x.pane === remembered) : undefined
      const target = b ?? (isReuseAny ? pickBrowser(browsers, remembered) : null)
      if (target) {
        await openTab($, target, href)
        return { how: 'tab', paneId: target.pane, browserKey: target.key }
      }
    }
    return { how: 'pane', paneId: await splitAndOpen($, options, href), browserKey: null }
  } finally {
    isOpening = false
  }
}

/** /web <url> and /web: open and answer what happened. */
async function webOpen($: EngineInterface, options: PluginOptions, raw: string): Promise<string> {
  const url = checkUrl(raw)
  if (!url.ok) return `Not opened: ${url.why}. ${USAGE}`
  if (!(await isInHerdr($))) return NEEDS_HERDR
  try {
    const o = await openUrl($, options, url.href, false)
    return o.how === 'tab'
      ? `Opened ${url.href} in a new tab of the browser in pane ${o.paneId} (/${COMMAND} close closes that pane).`
      : `Opened ${url.href} in pane ${o.paneId} ${directionOf(options.split) === 'right' ? 'to the right' : 'below'} (/${COMMAND} close closes it).`
  } catch (err) {
    return `Not opened: ${whyOf(err)}`
  }
}

/** The last http(s) link of the main conversation's last assistant reply with text. */
async function lastReplyLink($: EngineInterface): Promise<string | null> {
  const all = await $.session.messages()
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]!
    if (m.role === 'assistant' && m.text.trim() !== '') return lastLinkIn(m.text)
  }
  return null
}

async function webClose($: EngineInterface): Promise<string> {
  const id = await read($, pane)
  if (!id) return `No pane opened by /${COMMAND} in this session.`
  if (!(await isInHerdr($))) return NEEDS_HERDR
  try {
    const r = await $.process.run(['herdr', 'pane', 'close', id], { timeoutMs: HERDR_TIMEOUT_MS })
    if (r.exitCode === 0) {
      await update($, pane, () => '')
      return `Closed pane ${id}.`
    }
    return `herdr pane close ${id} failed${r.stderr ? `: ${firstLine(r.stderr)}` : ''}; close the pane in herdr by hand (its browser stops with it).`
  } catch (err) {
    return `herdr pane close ${id} failed: ${whyOf(err)}; close the pane in herdr by hand.`
  }
}

async function trustedList($: EngineInterface): Promise<string[]> {
  try {
    return trustedOf(await $.store.get(STORE_TRUSTED))
  } catch {
    return []
  }
}

/**
 * Whether Claude may read pages from `origin`: yes when it is trusted, else
 * the person is asked once (Allow once, Always, No). Always stores it; No, a
 * typed answer, a dismissed dialog or no one to ask is a no.
 */
async function isAllowed($: EngineInterface, origin: string): Promise<boolean> {
  if ((await trustedList($)).includes(origin)) return true
  let answer: string
  try {
    answer = await $.ui.ask(askQuestion(origin), { options: [ALLOW_ONCE, ALWAYS, NO], header: ASK_HEADER })
  } catch {
    return false
  }
  if (answer === ALWAYS) {
    const now = await trustedList($)
    if (!now.includes(origin)) await $.store.set(STORE_TRUSTED, [...now, origin])
    return true
  }
  return answer === ALLOW_ONCE
}

const sleep = ($: EngineInterface, ms: number) => $.clock.sleep(ms)

/** After opening `href`: the browser and tab that show it, asking ls a few times while the page appears. */
async function findOpened($: EngineInterface, opened: Opened, href: string): Promise<{ b: TbBrowser; tab: TbTab }> {
  const page = pageOf(href)
  for (let i = 0; i < POLL_TRIES; i++) {
    const browsers = await listBrowsers($)
    const b =
      (opened.browserKey ? browsers.find(x => x.key === opened.browserKey) : undefined) ??
      (opened.paneId ? browsers.find(x => x.pane === opened.paneId) : undefined)
    const isLast = i === POLL_TRIES - 1
    const tab = b && page ? tabShowing(b, page) : null
    // A tab with no CDP target yet is still starting: ask again, unless this is the last try.
    if (b && tab && (tab.hasTarget || isLast)) return { b, tab }
    if (isLast && b) {
      const t = activeTab(b)
      if (t) return { b, tab: t }
    }
    await sleep($, POLL_MS)
  }
  throw new Refusal(`the browser has not shown ${href} yet; call ${TOOL} again without url in a moment`)
}

/** Runs the page script in one tab and answers the bounded capture; a loading page is read again a little later. */
async function capture($: EngineInterface, b: TbBrowser, tab: TbTab): Promise<WebCapture> {
  for (let attempt = 0; ; attempt++) {
    const r = await $.process.run(
      ['terminal-browser', 'action', '--browser', b.key, '--tab', tab.id, '--', 'eval', PAGE_SCRIPT, '--json'],
      { timeoutMs: EVAL_TIMEOUT_MS },
    )
    const pageError = evalErrorOf(r.stdout)
    if (r.exitCode !== 0 || pageError)
      throw new Refusal(`terminal-browser could not read tab ${tab.id}: ${pageError ?? (firstLine(r.stderr) || `exit ${r.exitCode}`)}`)
    const raw = unwrapEval(r.stdout)
    const bounded = raw ? boundCapture(raw) : null
    if (!bounded) throw new Refusal(`tab ${tab.id} did not answer with a readable http(s) page`)
    if (!bounded.isLoading || attempt >= LOADING_RETRIES) return bounded.capture
    await sleep($, LOADING_WAIT_MS)
  }
}

/**
 * The origin the browser itself shows in a tab, from a fresh ls after the read
 * (the page script runs in the page, so its own origin is only a hint); null
 * when the tab is gone or not an http(s) page.
 */
async function originShown($: EngineInterface, b: TbBrowser, tab: TbTab): Promise<string | null> {
  const t = (await listBrowsers($)).find(x => x.key === b.key)?.tabs.find(x => x.id === tab.id)
  return t ? originOf(t.url) : null
}

/** What the tool answers: the capture or the denial as JSON text; a failure as a refusal. */
type ToolAnswer = { result: string } | { deny: string }

async function webRead($: EngineInterface, options: PluginOptions, input: Record<string, unknown>): Promise<ToolAnswer> {
  const asked = typeof input.url === 'string' && input.url.trim() !== '' ? input.url : null
  try {
    let where: { b: TbBrowser; tab: TbTab }
    let origin: string
    if (asked !== null) {
      const url = checkUrl(asked)
      if (!url.ok) return { deny: `${TOOL}: not opened: ${url.why}` }
      origin = url.origin
      if (!(await isAllowed($, origin))) return { result: JSON.stringify({ denied: origin }) }
      const opened = await openUrl($, options, url.href, true)
      where = await findOpened($, opened, url.href)
    } else {
      const b = pickBrowser(await listBrowsers($), await read($, pane))
      const tab = b ? activeTab(b) : null
      if (!b || !tab) return { deny: `${TOOL}: no page is open in the terminal browser; pass url, or /${COMMAND} <url> opens one` }
      const o = originOf(tab.url)
      if (!o) return { deny: `${TOOL}: the open tab is not an http(s) page (${firstLine(tab.url) || 'no address'})` }
      origin = o
      if (!(await isAllowed($, origin))) return { result: JSON.stringify({ denied: origin }) }
      where = { b, tab }
    }
    const got = await capture($, where.b, where.tab)
    // The browser's own address for the tab decides, not the page's word: a disagreement returns nothing.
    const shown = await originShown($, where.b, where.tab)
    if (!shown) return { deny: `${TOOL}: tab ${where.tab.id} no longer shows an http(s) page; nothing returned` }
    if (shown !== got.origin) return { deny: `${TOOL}: the page said it is ${got.origin} but the browser shows ${shown}; nothing returned` }
    // The page moved to another site between the check and the read: that site is asked for too.
    if (shown !== origin && !(await isAllowed($, shown))) return { result: JSON.stringify({ denied: shown }) }
    return { result: JSON.stringify(got) }
  } catch (err) {
    return { deny: `${TOOL}: ${whyOf(err)}` }
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'web',
      description: 'Open a link in terminal-browser in a herdr pane (the last link of the last reply by default), close it, or manage the sites web_read may read',
      argumentHint: '[url] | close | trusted | forget <origin>',
    })
    try {
      await $.tool.register({ name: TOOL, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: true })
    } catch {
      // The command still works without the tool.
    }
    return started
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'web' }, async ($, e) => {
    const asked = parseArgs(e.args)
    switch (asked.kind) {
      case 'last': {
        let link: string | null
        try {
          link = await lastReplyLink($)
        } catch (err) {
          return { text: `/${COMMAND}: ${whyOf(err)}` }
        }
        if (!link) return { text: `No http(s) link in Claude's last reply. ${USAGE}` }
        return { text: await webOpen($, options, link) }
      }
      case 'open':
        return { text: await webOpen($, options, asked.url) }
      case 'close':
        return { text: await webClose($) }
      case 'trusted': {
        const list = await trustedList($)
        return {
          text:
            list.length === 0
              ? `No trusted sites: ${TOOL} asks before reading each new one (Always adds it here).`
              : `${TOOL} reads these without asking:\n${list.map(o => `  ${o}`).join('\n')}\n/${COMMAND} forget <origin> removes one.`,
        }
      }
      case 'forget': {
        const origin = originOf(asked.origin) ?? asked.origin
        const list = await trustedList($)
        if (!list.includes(origin)) return { text: `${origin} was not trusted (/${COMMAND} trusted lists them).` }
        await $.store.set(STORE_TRUSTED, list.filter(o => o !== origin))
        return { text: `Forgot ${origin}: ${TOOL} asks again before reading it.` }
      }
      default:
        return { text: USAGE }
    }
  })

  on('tool.call', { tool: 'mcp__web__web_read' }, async ($, e) => webRead($, options, e as unknown as Record<string, unknown>)).catch(
    ($, e, next) => (next.called ? undefined : next(e)),
  )
}
