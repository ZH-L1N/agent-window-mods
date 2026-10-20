import { expect, test } from 'claude-code/testing'

import { BUSY_TEXT, RULES, busyLine, replyLabel } from './kit'
import { CONVO, paneView, press, usage, world } from './test-kit'
import type { Msg } from './test-kit'

test('/zh: the last reply with text, translated with haiku and drawn in the pane', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  expect(await w.command('')).toBe('Translating reply 1 back with haiku; the pane shows it when done.')
  expect(w.toasts).toEqual([BUSY_TEXT])
  expect(w.opened).toEqual(['zh'])
  // While the call waits on its timer: the busy line, no translation yet.
  const before = await paneView($)
  expect(before.busy).toBe(busyLine(1))
  expect(before.header).toBe('No translation yet.')
  expect(before.markdown).toBe('')

  await w.settle()
  expect(w.calls).toHaveLength(1)
  expect(w.calls[0]).toEqual(
    expect.objectContaining({ model: 'haiku', system: RULES, prompt: 'Newest reply.', maxTokens: 1024, timeoutMs: 180_000 }),
  )
  const v = await paneView($)
  expect(v.markdown).toBe('ZH(Newest reply.)')
  // 100 x $0.1 + 200 x $0.5 per million: $0.00011.
  expect(v.header).toBe(`${replyLabel(1)} · haiku · 0.0 s · 100→200 tok · ≈<$0.001`)
  expect(v.busy).toBe('')
  expect(w.state('shown')).toBe(0)
  expect(w.state('busy')).toBeNull()
  expect((w.state('items') as unknown[]).length).toBe(1)
})

test('/zh 2: the reply before, skipping assistant messages with no text; a second /zh 2 reuses it', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  await w.command('2')
  await w.settle()
  expect(w.calls.map(c => c.prompt)).toEqual(['Older reply with `npm test` and **bold**.'])
  const v = await paneView($)
  expect(v.markdown).toBe('ZH(Older reply with `npm test` and **bold**.)')
  expect(v.header.startsWith(`${replyLabel(2)} · haiku · `)).toBe(true)
  expect(await w.command('2')).toBe('Showing the kept translation of reply 2 back (/zh 2).')
  await w.settle()
  expect(w.calls).toHaveLength(1)
})

test('pane: prev translates the reply before, next goes back to the kept one; the ends say so', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  await w.command('')
  await w.settle()
  await press($, w, 'zh-prev')
  expect(w.calls.map(c => c.prompt)).toEqual(['Newest reply.', 'Older reply with `npm test` and **bold**.'])
  expect((await paneView($)).markdown).toBe('ZH(Older reply with `npm test` and **bold**.)')
  await press($, w, 'zh-next')
  // Kept: no third call.
  expect(w.calls).toHaveLength(2)
  expect((await paneView($)).markdown).toBe('ZH(Newest reply.)')
  await press($, w, 'zh-next')
  expect(w.toasts.at(-1)).toBe('Already the last reply (/zh 1).')
  await press($, w, 'zh-prev')
  await press($, w, 'zh-prev')
  expect(w.toasts.at(-1)).toBe('Only 2 assistant replies with text so far: /zh 1 to /zh 2.')
  expect(w.calls).toHaveLength(2)
})

test('pane: prev and next follow the reply as the conversation grows', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  await w.command('')
  await w.settle()
  // A new reply arrives: the one shown is now 2 back, so prev asks for 3 back (none) and next for the new one.
  w.setMessages([...CONVO, { role: 'user', text: 'Third question' }, { role: 'assistant', text: 'Brand new reply.' }])
  await press($, w, 'zh-next')
  expect(w.calls.at(-1)?.prompt).toBe('Brand new reply.')
  expect((await paneView($)).header.startsWith(`${replyLabel(1)} · `)).toBe(true)
})

test('pane: the header names where the reply sits now, also when replies came during the call', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  await w.command('')
  // A reply arrives before the call ends: the translated one is now 2 back.
  w.setMessages([...CONVO, { role: 'user', text: 'Third question' }, { role: 'assistant', text: 'Brand new reply.' }])
  await w.settle()
  expect((await paneView($)).header.startsWith(`${replyLabel(2)} · `)).toBe(true)
  expect((w.state('items') as { back: number; total: number }[])[0]).toEqual(expect.objectContaining({ back: 2, total: 3 }))
  // One more: a press re-places it (now 3 back) before moving, so prev asks for 4 back.
  w.setMessages([...CONVO, { role: 'user', text: 'q3' }, { role: 'assistant', text: 'Brand new reply.' }, { role: 'assistant', text: 'Newer still.' }])
  await press($, w, 'zh-prev')
  expect(w.calls.at(-1)?.prompt).toBe('Older reply with `npm test` and **bold**.')
  expect((await paneView($)).header.startsWith(`${replyLabel(4)} · `)).toBe(true)
  await press($, w, 'zh-next')
  expect(w.calls).toHaveLength(2)
  expect((await paneView($)).header.startsWith(`${replyLabel(3)} · `)).toBe(true)
  await press($, w, 'zh-next')
  expect(w.calls.at(-1)?.prompt).toBe('Brand new reply.')
})

test('pane: prev and next tell replies with the same text apart by position', async ($, on) => {
  // Newest first: A, B, A, C.
  const convo: Msg[] = [
    { role: 'assistant', text: 'C' },
    { role: 'assistant', text: 'Done.' },
    { role: 'assistant', text: 'B' },
    { role: 'assistant', text: 'Done.' },
  ]
  const w = await world($, on, convo)
  await w.start()
  await w.command('')
  await w.settle()
  await press($, w, 'zh-prev')
  await press($, w, 'zh-prev')
  // Reply 3 is the kept "Done." again: no call, and the header says 3 back.
  expect(w.calls.map(c => c.prompt)).toEqual(['Done.', 'B'])
  expect((await paneView($)).header.startsWith(`${replyLabel(3)} · `)).toBe(true)
  await press($, w, 'zh-prev')
  expect(w.calls.map(c => c.prompt)).toEqual(['Done.', 'B', 'C'])
  expect((await paneView($)).markdown).toBe('ZH(C)')
  await press($, w, 'zh-next')
  expect((await paneView($)).header.startsWith(`${replyLabel(3)} · `)).toBe(true)
  await press($, w, 'zh-next')
  expect((await paneView($)).markdown).toBe('ZH(B)')
  await press($, w, 'zh-next')
  expect((await paneView($)).header.startsWith(`${replyLabel(1)} · `)).toBe(true)
  await press($, w, 'zh-next')
  expect(w.toasts.at(-1)).toBe('Already the last reply (/zh 1).')
})

test('close: the button and /zh off close the pane', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  await w.command('')
  await w.settle()
  await press($, w, 'zh-close')
  expect(w.closed).toEqual(['zh'])
  expect(await w.command('off')).toBe('Translation pane closed.')
  expect(w.closed).toEqual(['zh', 'zh'])
})

test('a reply over 6,000 tokens goes in two calls, split at a blank line outside code, and is joined', async ($, on) => {
  const para = (i: number) => `Paragraph ${i}: ${'the quick brown fox jumps over the lazy dog '.repeat(22).trim()}`
  const head = Array.from({ length: 14 }, (_, i) => para(i)).join('\n\n')
  // A fence across the middle with blank lines inside: none of them may be the cut.
  const code = ['```ts', 'const a = 1', '', '', 'const b = 2', '', 'const c = 3', '```'].join('\n')
  const tail = Array.from({ length: 14 }, (_, i) => para(i + 14)).join('\n\n')
  const long = `${head}\n\n${code}\n\n${tail}`
  expect(long.length).toBeGreaterThan(24_000)
  const w = await world($, on, [{ role: 'user', text: 'q' }, { role: 'assistant', text: long }])
  await w.start()
  await w.command('')
  await w.settle()
  expect(w.calls).toHaveLength(2)
  const [a, b] = w.calls.map(c => c.prompt)
  expect(`${a}\n\n${b}`).toBe(long)
  for (const part of [a!, b!]) {
    expect((part.match(/```/g) ?? []).length % 2).toBe(0)
    expect(part.length).toBeLessThan(long.length * 0.6)
  }
  const v = await paneView($)
  expect(v.markdown).toBe(`ZH(${a})\n\nZH(${b})`)
  // Two calls' usage summed.
  expect(v.header).toContain('200→400 tok')
  expect(v.header.endsWith(' · 2 parts')).toBe(true)
})

test('an error toasts the reason and leaves the pane as it was', async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  w.setAnswer(() => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }))
  await w.command('')
  await w.settle()
  expect(w.toasts).toEqual([BUSY_TEXT, 'Translation failed: api-error 529 overloaded (/zh 1 to try again)'])
  // The pane was closed before: closed again, nothing kept.
  expect(w.opened).toEqual(['zh'])
  expect(w.closed).toEqual(['zh'])
  expect(w.state('items') ?? []).toEqual([])
  expect(w.state('busy')).toBeNull()

  // Open with a translation: a failure leaves it open and showing.
  w.setAnswer(e => ({ isAnswered: true, text: `ZH(${e.prompt})`, usage: usage() }))
  await w.command('')
  await w.settle()
  // The engine refusing the request (a blocked model): $.model.complete rejects.
  w.setAnswer(() => ({ deny: 'model blocked' }))
  await press($, w, 'zh-prev')
  expect(w.toasts.at(-1)).toMatch(/^Translation failed: .*model blocked.* \(\/zh 2 to try again\)$/)
  expect(w.closed).toEqual(['zh'])
  expect((await paneView($)).markdown).toBe('ZH(Newest reply.)')
  // The lock is released: the next request runs.
  w.setAnswer(e => ({ isAnswered: true, text: `ZH(${e.prompt})`, usage: usage() }))
  expect(await w.command('2')).toBe('Translating reply 2 back with haiku; the pane shows it when done.')
})

test('the model option: sonnet asks sonnet and prices it', { options: { model: 'sonnet' } }, async ($, on) => {
  const w = await world($, on, CONVO)
  await w.start()
  expect(await w.command('')).toBe('Translating reply 1 back with sonnet; the pane shows it when done.')
  await w.settle()
  expect(w.calls[0]?.model).toBe('sonnet')
  // 100 x $2 + 200 x $10 per million: $0.0022.
  expect((await paneView($)).header).toBe(`${replyLabel(1)} · sonnet · 0.0 s · 100→200 tok · ≈$0.002`)
})

test('/zh: one call at a time, the range and the usage', async ($, on) => {
  const w = await world($, on, [])
  await w.start()
  expect(await w.command('')).toBe('No assistant reply with text yet.')
  expect(w.opened).toEqual([])
  w.setMessages(CONVO)
  expect(await w.command('9')).toBe('Only 2 assistant replies with text so far: /zh 1 to /zh 2.')
  expect(await w.command('abc')).toBe('Usage: /zh [n] | off   (n: the n-th assistant reply back, 1 = the last)')
  expect(await w.command('1 2')).toContain('Usage: /zh')
  expect(await w.command('0')).toContain('Usage: /zh')
  await w.command('1')
  expect(await w.command('2')).toBe('A translation is running; wait for it (/zh 2).')
  await w.settle()
  expect(w.calls).toHaveLength(1)
})

test('keeps the last three translations, newest first', async ($, on) => {
  const convo: Msg[] = []
  for (let i = 1; i <= 4; i++) convo.push({ role: 'user', text: `q${i}` }, { role: 'assistant', text: `reply ${i}` })
  const w = await world($, on, convo)
  await w.start()
  for (const n of ['4', '3', '2', '1']) {
    await w.command(n)
    await w.settle()
  }
  const kept = w.state('items') as { text: string; back: number }[]
  expect(kept.map(k => k.text)).toEqual(['ZH(reply 4)', 'ZH(reply 3)', 'ZH(reply 2)'])
  expect(kept.map(k => k.back)).toEqual([1, 2, 3])
  // The dropped one is translated again.
  await w.command('4')
  await w.settle()
  expect(w.calls).toHaveLength(5)
})
