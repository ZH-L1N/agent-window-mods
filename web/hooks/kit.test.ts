import { expect, test } from 'claude-code/testing'

import { PAGE_SCRIPT, boundCapture, checkUrl, lastLinkIn, openLine, paneIdOf, parseArgs, parseLs, trustedOf, unwrapEval } from './kit'

test('checkUrl: http(s) only, no whitespace, nothing that leaves the quotes', () => {
  expect(checkUrl(' https://example.com/a?b=1 ')).toEqual({ ok: true, href: 'https://example.com/a?b=1', origin: 'https://example.com' })
  expect(checkUrl('HTTP://Example.com')).toEqual({ ok: true, href: 'http://example.com/', origin: 'http://example.com' })
  for (const bad of ['', 'ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)', 'x.com', 'https://a.com/b c', "https://a.com/'", 'https://a.com/\\x', 'https://u:p@a.com/', 'https://a.com/\u0007'])
    expect(checkUrl(bad).ok).toBe(false)
  // Non-ASCII is written as the URL parser writes it: ASCII only.
  const r = checkUrl('https://\u4f8b\u3048.jp/\u30d1\u30b9')
  expect(r.ok && /^[\x21-\x7e]+$/.test(r.href)).toBe(true)
  expect(openLine('https://a.com/x')).toBe("terminal-browser open 'https://a.com/x'")
})

test('lastLinkIn: the last link, bare, in Markdown or in angle brackets, sentence punctuation dropped', () => {
  expect(lastLinkIn('a https://a.com/1 then [b](https://b.com/2).')).toBe('https://b.com/2')
  expect(lastLinkIn('see <https://c.com/x>, and https://d.com/y.')).toBe('https://d.com/y')
  expect(lastLinkIn('`https://e.com/z`')).toBe('https://e.com/z')
  expect(lastLinkIn('none here, ftp://f.com/')).toBeNull()
})

test('lastLinkIn keeps balanced parentheses and a final underscore', () => {
  const MERCURY = 'https://en.wikipedia.org/wiki/Mercury_(planet)'
  expect(lastLinkIn(`bare ${MERCURY}.`)).toBe(MERCURY)
  expect(lastLinkIn(`see [Mercury](${MERCURY}).`)).toBe(MERCURY)
  expect(lastLinkIn(`(see ${MERCURY})`)).toBe(MERCURY)
  expect(lastLinkIn('(see https://a.com/x)')).toBe('https://a.com/x')
  expect(lastLinkIn('see https://a.com/snake_')).toBe('https://a.com/snake_')
})

test('the page script leaves out what the live page hides with CSS', () => {
  expect(PAGE_SCRIPT).toContain('getComputedStyle(live[i])')
  expect(PAGE_SCRIPT).toContain('cs.display === "none" || cs.visibility === "hidden"')
})

test('paneIdOf reads herdr split JSON', () => {
  expect(paneIdOf('{"result":{"pane":{"pane_id":"w1:p9"}}}')).toBe('w1:p9')
  expect(paneIdOf('{"result":{}}')).toBeNull()
  expect(paneIdOf('nope')).toBeNull()
})

test('parseLs reads terminal-browser ls --json', () => {
  const out = JSON.stringify({
    self: { tab: 'w1:t1', pane: 'w1:p1' },
    browsers: [
      { key: '901-1', pid: 1, pane: { tab: 'w1:t1', pane: 'w1:p9' }, inCurrentTab: true, tabs: [{ id: 2, active: true, title: 'T', url: 'https://a.com/', targetId: 'x' }] },
      { pid: 2, tabs: [] },
    ],
  })
  expect(parseLs(out)).toEqual([{ key: '901-1', pane: 'w1:p9', isInCurrentTab: true, tabs: [{ id: '2', url: 'https://a.com/', title: 'T', isActive: true, hasTarget: true }] }])
  expect(parseLs('{"self":null,"browsers":[]}')).toEqual([])
  expect(parseLs('no terminal browsers running')).toBeNull()
})

test('unwrapEval takes the --json envelope, a quoted string or the object', () => {
  const page = { origin: 'https://a.com', pathname: '/', text: 'x' }
  expect(unwrapEval(JSON.stringify({ success: true, data: { result: JSON.stringify(page) } }))).toEqual(page)
  expect(unwrapEval(JSON.stringify(JSON.stringify(page)))).toEqual(page)
  expect(unwrapEval(JSON.stringify(page))).toEqual(page)
  expect(unwrapEval('undefined')).toBeNull()
  expect(unwrapEval(JSON.stringify({ success: false, error: 'boom' }))).toBeNull()
})

test('boundCapture re-derives the page, drops non-http links and refuses a non-http page', () => {
  const b = boundCapture({
    origin: 'https://a.com',
    pathname: '/p',
    title: 'T\u0007itle',
    text: 'line 1\nline 2\u0000',
    links: [{ text: 'm', href: 'mailto:x@a.com' }, { text: 'x', href: 'https://b.com/q?z=1#f' }, { text: 'dup', href: 'https://b.com/q' }, 'junk'],
    omitted: ['made up'],
  })
  expect(b?.capture).toEqual({
    origin: 'https://a.com',
    pathname: '/p',
    title: 'Title',
    text: 'line 1\nline 2',
    links: [{ text: 'x', href: 'https://b.com/q' }],
    omitted: ['query strings', 'fragments', 'cookies', 'storage', 'form values', 'frames', 'images'],
  })
  expect(boundCapture({ origin: 'file://', pathname: '/etc/passwd', text: '' })).toBeNull()
  expect(boundCapture({ origin: 'https://a.com', pathname: '//evil.com/x', text: '' })).toBeNull()
  expect(boundCapture({ origin: 'https://a.com', pathname: '/', text: '', ready: 'loading' })?.isLoading).toBe(true)
})

test('trustedOf keeps distinct http(s) origins', () => {
  expect(trustedOf(['https://a.com/x', 'https://a.com', 'file:///x', 3, 'http://b.com'])).toEqual(['https://a.com', 'http://b.com'])
  expect(trustedOf('https://a.com')).toEqual([])
})

test('parseArgs: verbs, an address, and the usage', () => {
  expect(parseArgs('')).toEqual({ kind: 'last' })
  expect(parseArgs('CLOSE')).toEqual({ kind: 'close' })
  expect(parseArgs('trusted')).toEqual({ kind: 'trusted' })
  expect(parseArgs('forget https://a.com')).toEqual({ kind: 'forget', origin: 'https://a.com' })
  expect(parseArgs('forget')).toEqual({ kind: 'usage' })
  expect(parseArgs('https://A.com/Path')).toEqual({ kind: 'open', url: 'https://A.com/Path' })
})

test('the page script is one expression with no template literal or comment', () => {
  expect(PAGE_SCRIPT.startsWith('(() => {')).toBe(true)
  expect(PAGE_SCRIPT.endsWith('})()')).toBe(true)
  expect(PAGE_SCRIPT.includes('`')).toBe(false)
  expect(PAGE_SCRIPT.includes('//')).toBe(false)
  expect(PAGE_SCRIPT).toContain('JSON.stringify({ origin: location.origin, pathname: location.pathname')
})
