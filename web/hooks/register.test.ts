import { expect, test } from 'claude-code/testing'

import { PAGE_SCRIPT, TOOL_DESCRIPTION } from './kit'
import { PAGE, browser, evalOut, evalRuns, herdrRuns, tbRuns, world } from './test-kit'
import type { Msg } from './test-kit'

const IN_HERDR = { HERDR_ENV: '1' }
const TAB = { id: 2, active: true, title: 'Intro', url: 'https://docs.example.com/guide/intro?q=1#top' }
const OPEN = [browser('901-1', 'w1:p9', [TAB])]
const OMITTED = ['query strings', 'fragments', 'cookies', 'storage', 'form values', 'frames', 'images']

const parsed = (r: { result?: unknown }) => JSON.parse(String(r.result)) as Record<string, unknown>

// ---- /web ----

test('/web <url> in herdr: splits a pane below and opens the address in it, single-quoted', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  expect(await w.command('https://example.com/a?b=1')).toBe('Opened https://example.com/a?b=1 in pane w1:p9 below (/web close closes it).')
  expect(herdrRuns(w)).toEqual([
    ['herdr', 'pane', 'split', '--current', '--direction', 'down', '--no-focus', '--cwd', '/repo'],
    ['herdr', 'pane', 'run', 'w1:p9', "terminal-browser open 'https://example.com/a?b=1'"],
  ])
  expect(w.inits.every(i => (i as { timeoutMs?: number }).timeoutMs === 5_000)).toBe(true)
  expect(w.state('pane')).toBe('w1:p9')
})

test('/web <url> with the split option right splits to the right', { options: { split: 'right' } }, async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  expect(await w.command('https://example.com/')).toBe('Opened https://example.com/ in pane w1:p9 to the right (/web close closes it).')
  expect(herdrRuns(w)[0]).toEqual(['herdr', 'pane', 'split', '--current', '--direction', 'right', '--no-focus', '--cwd', '/repo'])
})

test('/web <url> outside herdr answers that it needs a herdr pane and runs nothing', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('https://example.com/')).toBe('/web needs a herdr pane (HERDR_ENV=1) to open the browser')
  expect(w.runs).toEqual([])
})

test('/web refuses an address that is not http(s), has whitespace or a quote, and runs nothing', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  expect(await w.command('ftp://example.com/x')).toMatch(/^Not opened: only http:\/\/ and https:\/\/ addresses open\./)
  expect(await w.command('example.com')).toMatch(/^Not opened: only http:\/\/ and https:\/\/ addresses open\./)
  expect(await w.command('https://example.com/a b')).toMatch(/^Not opened: the address has whitespace in it\./)
  expect(await w.command("https://example.com/a'$(id)'")).toMatch(/^Not opened: the address has a quote/)
  expect(await w.command('javascript:alert(1)')).toMatch(/^Not opened: only http/)
  expect(w.runs).toEqual([])
})

const CONVO: Msg[] = [
  { role: 'assistant', text: 'Older: https://old.example.com/x' },
  { role: 'user', text: 'and the docs? https://user.example.com/' },
  { role: 'assistant', text: 'See [the guide](https://docs.example.com/guide) and then https://docs.example.com/api/v2.' },
  { role: 'assistant', text: '' },
]

test('/web alone opens the last http(s) link of the last assistant reply with text', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, messages: CONVO })
  await w.start()
  expect(await w.command('')).toBe('Opened https://docs.example.com/api/v2 in pane w1:p9 below (/web close closes it).')
  expect(herdrRuns(w)[1]).toEqual(['herdr', 'pane', 'run', 'w1:p9', "terminal-browser open 'https://docs.example.com/api/v2'"])
})

test('/web alone with no link in the last reply says so and runs nothing', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, messages: [{ role: 'assistant', text: 'https://a.example.com/' }, { role: 'assistant', text: 'No links here.' }] })
  await w.start()
  expect(await w.command('')).toMatch(/^No http\(s\) link in Claude's last reply\./)
  expect(w.runs).toEqual([])
})

test('/web <url> again while its browser still runs opens a new tab there, no second split', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  await w.command('https://example.com/')
  w.setBrowsers(OPEN)
  expect(await w.command('https://example.org/b')).toBe('Opened https://example.org/b in a new tab of the browser in pane w1:p9 (/web close closes that pane).')
  expect(herdrRuns(w).filter(a => a[2] === 'split')).toHaveLength(1)
  expect(tbRuns(w)).toEqual([
    ['terminal-browser', 'ls', '--json'],
    ['terminal-browser', 'action', '--browser', '901-1', '--', 'open', 'https://example.org/b'],
  ])
})

test('/web close closes the pane this mod opened, and only that one', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  expect(await w.command('close')).toBe('No pane opened by /web in this session.')
  await w.command('https://example.com/')
  expect(await w.command('close')).toBe('Closed pane w1:p9.')
  expect(herdrRuns(w).at(-1)).toEqual(['herdr', 'pane', 'close', 'w1:p9'])
  expect(w.state('pane')).toBe('')
  expect(await w.command('close')).toBe('No pane opened by /web in this session.')
  // Never the daemon-wide shutdown.
  expect(w.runs.some(a => a.includes('shutdown'))).toBe(false)
})

test('/web close that herdr refuses says how to close it and keeps the pane remembered', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, isCloseFailing: true })
  await w.start()
  await w.command('https://example.com/')
  expect(await w.command('close')).toBe('herdr pane close w1:p9 failed: pane not found; close the pane in herdr by hand (its browser stops with it).')
  expect(w.state('pane')).toBe('w1:p9')
})

test('/web trusted and /web forget manage the trusted sites', async ($, on) => {
  const w = await world($, on, { store: { 'web.trusted': ['https://docs.example.com', 'https://example.org'] } })
  await w.start()
  expect(await w.command('trusted')).toBe(
    'web_read reads these without asking:\n  https://docs.example.com\n  https://example.org\n/web forget <origin> removes one.',
  )
  expect(await w.command('forget https://example.org/some/page')).toBe('Forgot https://example.org: web_read asks again before reading it.')
  expect(w.store.get('web.trusted')).toEqual(['https://docs.example.com'])
  expect(await w.command('forget https://nope.example.com')).toBe('https://nope.example.com was not trusted (/web trusted lists them).')
  expect(await w.command('help')).toMatch(/^Usage: \/web /)
})

// ---- web_read ----

test('web_read is registered deferred, with the url-only schema and its description', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(w.registered).toEqual([
    {
      name: 'web_read',
      description: TOOL_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: expect.any(String) } },
        additionalProperties: false,
      },
      isDeferred: true,
    },
  ])
})

test('web_read: reads the open tab, asks once for an unknown origin, returns the parsed capture', async ($, on) => {
  const w = await world($, on, { browsers: OPEN })
  await w.start()
  const r = await w.read()
  expect(w.asked).toEqual([{ question: 'Let Claude read pages from https://docs.example.com?', header: 'web_read', options: ['Allow once', 'Always', 'No'] }])
  expect(tbRuns(w)).toEqual([
    ['terminal-browser', 'ls', '--json'],
    ['terminal-browser', 'action', '--browser', '901-1', '--tab', '2', '--', 'eval', PAGE_SCRIPT, '--json'],
    // The tab's real address, checked after the read.
    ['terminal-browser', 'ls', '--json'],
  ])
  expect(parsed(r)).toEqual({ origin: 'https://docs.example.com', pathname: '/guide/intro', title: PAGE.title, text: PAGE.text, links: PAGE.links, omitted: OMITTED })
  // Allow once: the next read asks again; nothing was stored.
  await w.read()
  expect(w.asked).toHaveLength(2)
  expect(w.store.get('web.trusted')).toBeUndefined()
})

test('web_read never asks for a trusted origin, and Always makes one trusted', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, answer: 'Always' })
  await w.start()
  await w.read()
  expect(w.asked).toHaveLength(1)
  expect(w.store.get('web.trusted')).toEqual(['https://docs.example.com'])
  const again = await w.read()
  expect(w.asked).toHaveLength(1)
  expect(parsed(again).origin).toBe('https://docs.example.com')
})

test('web_read with a trusted origin in the store asks nothing', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, store: { 'web.trusted': ['https://docs.example.com'] } })
  await w.start()
  expect(parsed(await w.read()).pathname).toBe('/guide/intro')
  expect(w.asked).toEqual([])
})

test('web_read: No returns the denial and reads nothing', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, answer: 'No' })
  await w.start()
  const r = await w.read()
  expect(parsed(r)).toEqual({ denied: 'https://docs.example.com' })
  expect(evalRuns(w)).toEqual([])
})

test('web_read: a dismissed question or a typed answer is a no', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, answer: 'dismiss' })
  await w.start()
  expect(parsed(await w.read())).toEqual({ denied: 'https://docs.example.com' })
  w.setAnswer('sure, whatever')
  expect(parsed(await w.read())).toEqual({ denied: 'https://docs.example.com' })
  expect(evalRuns(w)).toEqual([])
  expect(w.store.get('web.trusted')).toBeUndefined()
})

test('web_read cuts the text at 20,000 characters and the links at 50, hrefs to origin + path', async ($, on) => {
  const links = Array.from({ length: 60 }, (_, i) => ({ text: `L${i}`, href: `https://docs.example.com/p${i}?secret=${i}#frag` }))
  const w = await world($, on, {
    browsers: OPEN,
    store: { 'web.trusted': ['https://docs.example.com'] },
    // A page that ignored the script's own bounds: the mod bounds it again.
    evalStdout: evalOut({ ...PAGE, text: 'x'.repeat(25_000), links }),
  })
  await w.start()
  const c = parsed(await w.read())
  expect((c.text as string).length).toBe(20_000)
  expect(c.links).toHaveLength(50)
  expect((c.links as { href: string }[])[0]).toEqual({ text: 'L0', href: 'https://docs.example.com/p0' })
  expect(c.omitted).toEqual([...OMITTED, 'text beyond 20,000 characters', 'links beyond 50'])
})

test('web_read with no browser open refuses and says how to open one', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const r = await w.read()
  expect(r.deny).toBe('web_read: no page is open in the terminal browser; pass url, or /web <url> opens one')
  expect(w.asked).toEqual([])
})

test('web_read with url and no browser: asks first, opens a pane, waits for the page, reads it', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR })
  await w.start()
  w.afterRun([browser('77-1', 'w1:p9', [{ id: 1, active: true, title: 'Intro', url: 'https://docs.example.com/guide/intro', targetId: 'T1' }])])
  const r = await w.read({ url: 'https://docs.example.com/guide/intro' })
  expect(w.asked).toHaveLength(1)
  expect(herdrRuns(w)).toEqual([
    ['herdr', 'pane', 'split', '--current', '--direction', 'down', '--no-focus', '--cwd', '/repo'],
    ['herdr', 'pane', 'run', 'w1:p9', "terminal-browser open 'https://docs.example.com/guide/intro'"],
  ])
  expect(evalRuns(w)[0]!.slice(0, 6)).toEqual(['terminal-browser', 'action', '--browser', '77-1', '--tab', '1'])
  expect(parsed(r).title).toBe(PAGE.title)
  expect(w.state('pane')).toBe('w1:p9')
})

test('web_read with url and a browser open: a new tab there, then reads that tab', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, store: { 'web.trusted': ['https://docs.example.com'] } })
  await w.start()
  w.afterOpen([
    browser('901-1', 'w1:p9', [
      { ...TAB, active: false },
      { id: 5, active: true, title: 'API', url: 'https://docs.example.com/api', targetId: 'T5' },
    ]),
  ])
  await w.read({ url: 'https://docs.example.com/api' })
  expect(herdrRuns(w)).toEqual([])
  expect(tbRuns(w).find(a => a.includes('open'))).toEqual(['terminal-browser', 'action', '--browser', '901-1', '--', 'open', 'https://docs.example.com/api'])
  // Found on the first ls after the open: no waiting (the third ls checks the tab after the read).
  expect(tbRuns(w).filter(a => a[1] === 'ls')).toHaveLength(3)
  expect(evalRuns(w)[0]!.slice(0, 6)).toEqual(['terminal-browser', 'action', '--browser', '901-1', '--tab', '5'])
})

test('web_read with url: a tab still starting (no CDP target) is asked for again, then read on the last try', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, store: { 'web.trusted': ['https://docs.example.com'] } })
  await w.start()
  w.afterRun([browser('77-1', 'w1:p9', [{ id: 1, active: true, title: '', url: 'https://docs.example.com/guide/intro' }])])
  const r = await w.read({ url: 'https://docs.example.com/guide/intro' })
  // One ls to look for a running browser, twelve while the page starts, one after the read.
  expect(tbRuns(w).filter(a => a[1] === 'ls')).toHaveLength(14)
  expect(evalRuns(w)).toHaveLength(1)
  expect(parsed(r).pathname).toBe('/guide/intro')
})

test('web_read with an untrusted url and No opens nothing', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, browsers: OPEN, answer: 'No' })
  await w.start()
  expect(parsed(await w.read({ url: 'https://evil.example.net/x' }))).toEqual({ denied: 'https://evil.example.net' })
  expect(w.runs).toEqual([])
})

test('web_read refuses a url that is not http(s) before asking anything', async ($, on) => {
  const w = await world($, on, { env: IN_HERDR, browsers: OPEN })
  await w.start()
  const r = await w.read({ url: 'file:///etc/passwd' })
  expect(r.deny).toBe('web_read: not opened: only http:// and https:// addresses open')
  expect(w.asked).toEqual([])
  expect(w.runs).toEqual([])
})

const MOVED = [browser('901-1', 'w1:p9', [{ ...TAB, url: 'https://elsewhere.example.net/' }])]

test('web_read: a page that moved to another site is asked for again', async ($, on) => {
  const w = await world($, on, {
    browsers: OPEN,
    store: { 'web.trusted': ['https://docs.example.com'] },
    evalStdout: evalOut({ ...PAGE, origin: 'https://elsewhere.example.net', pathname: '/' }),
    answer: 'No',
  })
  await w.start()
  w.afterEval(MOVED)
  expect(parsed(await w.read())).toEqual({ denied: 'https://elsewhere.example.net' })
  expect(w.asked.map(a => a.question)).toEqual(['Let Claude read pages from https://elsewhere.example.net?'])
})

test('web_read: a page that claims a trusted origin the browser does not show returns nothing and asks nothing', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, store: { 'web.trusted': ['https://docs.example.com'] } })
  await w.start()
  // The page reports docs.example.com (PAGE), but the tab really shows elsewhere.
  w.afterEval(MOVED)
  const r = await w.read()
  expect(r.deny).toBe('web_read: the page said it is https://docs.example.com but the browser shows https://elsewhere.example.net; nothing returned')
  expect(r.result).toBeUndefined()
  expect(w.asked).toEqual([])
})

test('web_read: a tab gone after the read returns nothing', async ($, on) => {
  const w = await world($, on, { browsers: OPEN, store: { 'web.trusted': ['https://docs.example.com'] } })
  await w.start()
  w.afterEval([])
  const r = await w.read()
  expect(r.deny).toBe('web_read: tab 2 no longer shows an http(s) page; nothing returned')
  expect(r.result).toBeUndefined()
})
