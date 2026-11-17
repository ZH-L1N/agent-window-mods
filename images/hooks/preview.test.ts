// 0.4.0: the picture before you send (the prompt box's changes, the clipboard,
// the ticket rule, the preview switch) and the files it leaves.
import { expect, test } from 'claude-code/testing'

import type { ImageTile } from '../types'
import { isPathInsert, isTextInsert, osascriptArgv } from './kit'
import { CACHE, IMAGES, SESSION, mountRow, rowView, world } from './test-kit'

const pendingOf = (w: { state: (k: string) => unknown }): ImageTile[] => (w.state('pending') as ImageTile[] | undefined) ?? []
const sipsInputs = (w: { runs: string[][] }) => w.runs.filter(a => a[0] === 'sips' && a[1] === '-s').map(a => a[6])
const pre = (n: number, id = SESSION) => `${CACHE}/${id}-${n}-pre.png`

test('preview: a pasted tag shows its picture above the prompt before sending, "not sent yet"', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // Typed, then the image pasted (a keyless edit of text and a tag in one is a dragged file or a path).
  await w.edit('look at ', 't')
  await w.edit('look at [Image #1]')
  // Nothing inside the hook: the work starts from a timer.
  expect(w.runs).toEqual([])
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1))])
  expect(w.inits[0]).toEqual({ timeoutMs: 3_000 })
  // The tile is built from that file as any tile is.
  expect(w.runs.filter(a => a[0] === 'sips')).toEqual([
    ['sips', '-s', 'format', 'bmp', '-Z', '48', pre(1), '--out', `${CACHE}/${SESSION}-1-pre.bmp`],
    ['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', pre(1)],
  ])
  expect(pendingOf(w).map(t => [t.n, t.w, t.h, t.columns, t.rows])).toEqual([[1, 1376, 688, 24, 6]])
  expect(await rowView($)).toEqual({ tiles: [{ key: 'images-tile-1', columns: 24, rows: 6 }], captions: ['[Image #1] 1376x688 · not sent yet'], more: '' })
  // Half-blocks: no small PNG is kept, the clipboard's PNG and the BMP are emptied.
  expect(w.files.get(pre(1))).toBe('')
  expect(w.files.get(`${CACHE}/${SESSION}-1-pre.bmp`)).toBe('')
  // The band's after-send tiles are not touched.
  expect(w.state('tiles')).toBeUndefined()
})

test('preview: reading a change: a typed tag (a key), a history recall, an undo, a plugin fill and a clear never read the clipboard', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1]', 'v')
  await w.settle()
  await w.change('[Image #1] [Image #2]', 'history')
  await w.settle()
  await w.change('[Image #1] [Image #2] [Image #3]', 'undo')
  await w.settle()
  await w.change('[Image #1] [Image #2] [Image #3] [Image #4]', 'plugin')
  await w.settle()
  await w.change('[Image #1] [Image #2] [Image #3] [Image #4] [Image #5]', 'clear')
  await w.settle()
  await w.change('[Image #1] [Image #2] [Image #3] [Image #4] [Image #5] [Image #6]', 'app')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
  // An engine write (dictation, a draft put back, an edit prompt.edit does not carry) may be a paste.
  await w.change('[Image #1] [Image #2] [Image #3] [Image #4] [Image #5] [Image #6] [Image #7]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(7))])
  expect(pendingOf(w).map(t => t.n)).toEqual([7])
})

test('preview: a tag that leaves the box loses its tile; an empty box clears them', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  await w.edit('[Image #1] and ', 'd')
  await w.edit('[Image #1] and [Image #2]')
  await w.settle()
  expect(pendingOf(w).map(t => t.n)).toEqual([1, 2])
  // A tag deleted with a key.
  await w.edit('and [Image #2]', 'backspace')
  await w.settle()
  expect(pendingOf(w).map(t => t.n)).toEqual([2])
  expect((await rowView($))?.captions).toEqual(['[Image #2] 1376x688 · not sent yet'])
  // Typing more text with the tag kept changes nothing.
  await w.edit('and [Image #2] please', 'e')
  await w.settle()
  expect(w.osaRuns().length).toBe(2)
  await w.edit('', 'backspace')
  await w.settle()
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
})

test('preview: ticket rule: two new tags in one change: the older gets the note, never the newer picture', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1] [Image #2]')
  await w.settle()
  // The clipboard is read once, for the newest tag only.
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(2))])
  const [one, two] = pendingOf(w)
  expect(one).toEqual({ n: 1, w: 0, h: 0, columns: 0, rows: 0, cells: '', note: 'a later paste replaced it on the clipboard' })
  expect(two?.cells).not.toBe('')
  expect((await rowView($))?.captions).toEqual(['[Image #1] · a later paste replaced it on the clipboard', '[Image #2] 1376x688 · not sent yet'])
})

test('preview: ticket rule: a newer paste while osascript runs: the older tag gets the note, its file is never built', async ($, on) => {
  const w = await world($, on, { osaDelayMs: 500 })
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(1)
  await w.edit('[Image #1] [Image #2]')
  await w.clock.advance(2_000)
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1)), osascriptArgv(pre(2))])
  expect(sipsInputs(w)).toEqual([pre(2)])
  expect(pendingOf(w).map(t => [t.n, t.note ?? ''])).toEqual([
    [1, 'a later paste replaced it on the clipboard'],
    [2, ''],
  ])
  // What osascript wrote for the older tag is emptied.
  expect(w.files.get(pre(1))).toBe('')
})

test('preview: osascript failing (no picture on the clipboard): the tag and the note, no sips, the file emptied', async ($, on) => {
  const w = await world($, on, { clipboard: 'none' })
  await w.start()
  await w.edit('[Image #3]')
  await w.settle()
  expect(w.osaRuns().length).toBe(1)
  expect(w.runs.filter(a => a[0] === 'sips')).toEqual([])
  expect(pendingOf(w)).toEqual([{ n: 3, w: 0, h: 0, columns: 0, rows: 0, cells: '', note: 'no picture on the clipboard' }])
  expect(await rowView($)).toEqual({ tiles: [], captions: ['[Image #3] · no picture on the clipboard'], more: '' })
  expect(w.files.get(pre(3))).toBe('')
})

test('preview: the preview option off: no process runs at all, nothing shows', { options: { preview: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1]')
  await w.change('[Image #1] [Image #2]')
  await w.clock.advance(5_000)
  expect(w.runs).toEqual([])
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
})

test('preview: /img preview off is kept in the store, drops the tiles and stops the clipboard; /img preview on again', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(pendingOf(w).map(t => t.n)).toEqual([1])
  expect(await w.command('preview off')).toBe('Image preview off: the clipboard is not read; /img preview on turns it on again.')
  expect(w.store.get('preview')).toBe('off')
  expect(w.state('preview')).toBe('off')
  expect(pendingOf(w)).toEqual([])
  await w.edit('[Image #1] [Image #2]')
  await w.clock.advance(5_000)
  expect(w.osaRuns().length).toBe(1)
  expect(await w.command('preview on')).toBe('Image preview on: a pasted image is shown above the prompt before you send it.')
  expect(w.store.get('preview')).toBe('on')
  await w.edit('[Image #1] [Image #2] [Image #3]')
  await w.settle()
  expect(w.osaRuns().map(a => a[4])).toEqual([osascriptArgv(pre(1))[4], osascriptArgv(pre(3))[4]])
})

test('preview: a stored preview off holds in the next session, over the option', { options: { preview: 'on' } }, async ($, on) => {
  const w = await world($, on, { stored: { preview: 'off' } })
  await w.start()
  expect(w.state('preview')).toBe('off')
  await w.edit('[Image #1]')
  await w.clock.advance(5_000)
  expect(w.runs).toEqual([])
})

test('preview: the path check: a HOME with a quote is refused before osascript runs', async ($, on) => {
  const w = await world($, on, { home: '/Users/o"brien' })
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)[0]?.note).toBe('the file name is not safe')
})

test('preview: a session id that is no plain name is written as `session`', async ($, on) => {
  const w = await world($, on, { sessionId: '../../etc/x' })
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1, 'session'))])
})

test('preview: no HOME: no process runs, the tag with a note', async ($, on) => {
  const w = await world($, on, { isNoHome: true })
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)[0]?.note).toBe('no HOME')
})

test('preview: sending drops the tiles and empties their files; the run after sending goes on as before', async ($, on) => {
  const w = await world($, on, { env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' } })
  await w.start()
  await w.edit('look at ', 't')
  await w.edit('look at [Image #1]')
  await w.settle()
  // With pictures on, the clipboard's PNG is scaled in place and kept as the tile's small PNG.
  expect(pendingOf(w)[0]?.file).toBe(pre(1))
  expect(w.files.get(pre(1))).toBe('small-png')
  w.paste(1)
  await w.send('look at [Image #1]')
  await w.settle()
  expect(pendingOf(w)).toEqual([])
  expect(w.files.get(pre(1))).toBe('')
  // The engine's own PNG of the sent prompt is drawn as in 0.3.0.
  expect(sipsInputs(w)).toContain(`${IMAGES}/1.png`)
  const [sent] = w.state('tiles') as ImageTile[]
  expect([sent?.n, sent?.file]).toEqual([1, `${CACHE}/${SESSION}-1-${sent?.gen}.png`])
  expect((await rowView($))?.captions).toEqual(['[Image #1] 1376x688'])
})

test('preview: a clipboard run still going when the prompt is sent writes no tile', async ($, on) => {
  const w = await world($, on, { osaDelayMs: 500 })
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  await w.send('[Image #1]', { isTurn: false })
  await w.clock.advance(1_000)
  expect(pendingOf(w)).toEqual([])
  expect(w.files.get(pre(1))).toBe('')
})

test('preview: while tiles of the box exist the row shows them, not the last sent prompt\'s; /img clear drops them', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect((await rowView($))?.captions).toEqual(['[Image #1] 1376x688'])
  await w.edit('[Image #2]')
  await w.settle()
  expect((await rowView($))?.captions).toEqual(['[Image #2] 1376x688 · not sent yet'])
  expect(await w.command('clear')).toBe('Image tiles cleared.')
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
})

test("preview: the row's clear button drops the box's tiles too", async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #2]')
  await w.settle()
  const ui = await mountRow($)
  await ui.press({ key: 'images-clear' })
  await ui.unmount()
  await w.settle()
  expect(pendingOf(w)).toEqual([])
  expect(w.toasts).toEqual(['Image tiles cleared (/img clear).'])
})

// --- review fixes

test('preview: a draft the engine puts back is no paste: a tag not above the highest seen is not read', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(1)
  await w.send('[Image #1]', { isTurn: false })
  await w.settle()
  // The prompt put back after an early interrupt: its tag was sent, not pasted.
  await w.change('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(1)
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
  // A tag above the highest seen is a paste.
  await w.change('[Image #1] [Image #2]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1)), osascriptArgv(pre(2))])
  // A stash, then the stash restored: both tags seen before, nothing read.
  await w.change('', 'clear')
  await w.settle()
  await w.change('[Image #1] [Image #2]')
  await w.settle()
  expect(w.osaRuns().length).toBe(2)
  expect(pendingOf(w)).toEqual([])
})

test('preview: a tag seen only in a sent prompt counts as seen too (a queued prompt pulled back)', async ($, on) => {
  const w = await world($, on, { clipboard: 'none' })
  await w.start()
  // Sent with no change of the box seen (a prompt typed over a running turn, queued).
  await w.send('[Image #3]', { isTurn: false })
  await w.change('[Image #3]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)).toEqual([])
})

test('preview: the highest tag seen starts again at a /clear, a resume and a session start', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('[Image #1] [Image #2]')
  await w.settle()
  expect(w.osaRuns().length).toBe(1)
  await w.send('[Image #1] [Image #2]', { isTurn: false })
  await w.settle()
  await w.sessionEnd('clear')
  await w.edit('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(2)
  await w.change('', 'clear')
  await w.sessionEnd('resume')
  await w.change('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(3)
  await w.change('', 'clear')
  // An ordinary end keeps it; a new start drops it.
  await w.sessionEnd('prompt_input_exit')
  await w.change('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(3)
  await w.change('', 'clear')
  await w.start()
  await w.change('[Image #1]')
  await w.settle()
  expect(w.osaRuns().length).toBe(4)
})

test('preview: a dragged file or a pasted path: its tag is not read from the clipboard and gets no tile', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // The path goes in as text; the engine then writes the tag in its place.
  await w.edit('/Users/me/shot.png')
  await w.change('[Image #1]')
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
  // An edit whose own answer carries the tag beside the inserted path.
  await w.edit('[Image #1] /Users/me/b.png [Image #2]')
  await w.settle()
  expect(w.runs).toEqual([])
  // Still within 2 seconds of that edit: an engine write's new tag is the path's.
  await w.clock.advance(1_900)
  await w.change('[Image #1] /Users/me/b.png [Image #2] [Image #3]')
  await w.settle()
  expect(w.runs).toEqual([])
  // Past the 2 seconds an engine write may be a paste again.
  await w.clock.advance(2_000)
  await w.change('[Image #1] /Users/me/b.png [Image #2] [Image #3] [Image #4]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(4))])
})

test('preview: a picture pasted right after a pasted path (tags only) is read', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('/Users/me/notes.txt ')
  await w.edit('/Users/me/notes.txt [Image #1]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1))])
  expect(pendingOf(w).map(t => t.n)).toEqual([1])
})

test('preview: the tag removed while its tile is being written: no tile, its file released', async ($, on) => {
  const w = await world($, on, { env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' } })
  let isArmed = true
  // The state's read inside the tile's write: the person deletes the tag then,
  // and the box's own drop runs before the write goes on.
  on('state.get', async (_$, e, next) => {
    const g = e as { plugin?: string; key?: string }
    if (isArmed && g.plugin === 'images' && g.key === 'pending' && w.runs.some(a => a[0] === 'sips' && a[3] === 'png')) {
      isArmed = false
      await w.edit('', 'backspace')
      await w.clock.sleep(50)
    }
    return next(e)
  })
  await w.start()
  await w.edit('[Image #1]')
  await w.clock.advance(1_000)
  expect(isArmed).toBe(false)
  expect(pendingOf(w)).toEqual([])
  expect(await rowView($)).toBeNull()
  expect(w.files.get(pre(1))).toBe('')
})

// --- re-check fixes

test('kit: what looks like a file path (opens the 2 second window) and what does not', async () => {
  for (const text of [
    '/Users/me/shot.png',
    '/Users/me/My\\ Shot\\ 2.png',
    '/Users/me/a.png /Users/me/b\\ c.jpg ',
    '~/Desktop/x.HEIC',
    'file:///Users/me/x.png',
    "'/Users/me/a b/c.png'",
    '"~/Pictures/one two.webp"',
    '  /tmp/notes.txt  ',
    'Screen Shot 2026-11-17 at 10.02.11.PNG',
    'photo.jpeg" ',
    'scan.TIFF',
  ])
    expect([text, isPathInsert(text)]).toEqual([text, true])
  for (const text of [
    'https://example.com/page',
    'https://example.com/page.html',
    'Please look at the picture below and tell me what is wrong.',
    'hello',
    '/Users/me/a.png\n/Users/me/b.png',
    'see this\n~/x.png',
    "'hello'",
    '',
    '   ',
    '[Image #1]',
    undefined,
    42,
  ])
    expect([text, isPathInsert(text)]).toEqual([text, false])
  // Rule (a) is wider: any text of its own, a path or not.
  expect(isTextInsert('hello')).toBe(true)
  expect(isTextInsert('[Image #1] ')).toBe(false)
})

test('preview: typed or dictated text, or a pasted link, opens no window: a picture an engine write brings right after is read', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // A burst of typed keys, an input-method commit or dictated text: a keyless edit of plain text.
  await w.edit('hello there ')
  await w.change('hello there [Image #1]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1))])
  // A pasted link to a web page.
  await w.edit('hello there [Image #1] https://example.com/page ')
  await w.change('hello there [Image #1] https://example.com/page [Image #2]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(1)), osascriptArgv(pre(2))])
  expect(pendingOf(w).map(t => t.n)).toEqual([1, 2])
  // Rule (a) stands: a keyless edit of text and a new tag in one brings no clipboard picture for it.
  await w.edit('hello there [Image #1] https://example.com/page [Image #2] and this [Image #3]')
  await w.settle()
  expect(w.osaRuns().length).toBe(2)
})

test('preview: a pasted path with escaped spaces, or a quoted one, opens the 2 second window', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.edit('~/Desktop/My\\ Shot.png')
  await w.change('[Image #1]')
  await w.settle()
  await w.edit("[Image #1] '/Users/me/a b/c.PNG'")
  await w.change("[Image #1] '/Users/me/a b/c.PNG' [Image #2]")
  await w.settle()
  expect(w.runs).toEqual([])
  expect(pendingOf(w)).toEqual([])
})

test('preview: a history recall, an undo, a plugin fill, an app write or a typed tag does not raise the highest tag seen', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // A prompt of another conversation recalled from history, then put away.
  await w.change('[Image #9]', 'history')
  await w.change('[Image #9] [Image #10]', 'undo')
  await w.change('[Image #9] [Image #10] [Image #11]', 'plugin')
  await w.change('[Image #9] [Image #10] [Image #11] [Image #12]', 'app')
  await w.settle()
  await w.change('', 'clear')
  await w.settle()
  // A real paste with a lower number is read.
  await w.edit('[Image #2]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(2))])
  // A tag typed by hand (an edit with a key) does not raise it either.
  await w.edit('[Image #2] [Image #8]', '8')
  await w.settle()
  await w.edit('[Image #2] [Image #8] [Image #3]')
  await w.settle()
  expect(w.osaRuns()).toEqual([osascriptArgv(pre(2)), osascriptArgv(pre(3))])
  // A recalled tag still in the box is not raised by a later paste beside it.
  await w.change('[Image #2] [Image #8] [Image #3] [Image #20]', 'history')
  await w.edit('[Image #2] [Image #8] [Image #3] [Image #20] [Image #4]')
  await w.settle()
  await w.change('', 'clear')
  await w.edit('[Image #5]')
  await w.settle()
  expect(w.osaRuns().map(a => a[4])).toEqual([2, 3, 4, 5].map(n => osascriptArgv(pre(n))[4]))
})
