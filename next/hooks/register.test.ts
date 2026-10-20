import { expect, test } from 'claude-code/testing'

import { MAX_TOKENS, SYSTEM, TIMEOUT_MS, USAGE } from './kit'
import { LONG, THREE, answerTurn, json, press, rowView, world } from './test-kit'

test('auto: a long main-loop answer makes one call from a timer; the row shows the suggestions', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setGoal({ name: 'Ship NEXT', tasks: [{ title: 'Row', status: 'in_progress' }] })
  await w.turnStart()
  await w.turnEnd(LONG)
  // Never inside the hook: the call waits for the timer.
  expect(w.calls).toHaveLength(0)
  await w.settle()
  expect(w.calls).toHaveLength(1)
  expect(w.calls[0]).toEqual(
    expect.objectContaining({ model: 'haiku', system: SYSTEM, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS }),
  )
  expect(w.calls[0]?.prompt).toContain(LONG)
  expect(w.calls[0]?.prompt).toContain('- [in_progress] Row')
  expect(w.state('suggestions')).toEqual(THREE)
  expect(w.state('busy')).toBe('')
  expect((await rowView($))?.buttons.map(b => b.label)).toEqual(['1: Ship it', '2: Run the tests again', '3: Show me the diff of kit.ts', '0: dismiss'])
})

test('auto: no call for a short answer, an aborted or failed turn, or a subagent\'s answer', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, 'Done.')
  await w.turnStart()
  await w.turnEnd(LONG, undefined, 'aborted')
  await w.settle()
  await w.turnStart()
  await w.turnEnd(LONG, undefined, 'error')
  await w.settle()
  await w.turnStart('a1')
  await w.turnEnd(LONG, 'a1')
  await w.settle()
  expect(w.calls).toHaveLength(0)
  expect(await rowView($)).toBeNull()
})

test('auto: no call while a subagent still runs; one once none does', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setAgents([{ id: 'a1', status: 'running' }, { id: 'a0', status: 'completed' }])
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(0)
  expect(w.state('busy') ?? '').toBe('')
  w.setAgents([{ id: 'a1', status: 'completed' }])
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(1)
})

test('auto=off: no call after a long answer; /next still asks', { options: { auto: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setMessages([{ role: 'user', text: 'q' }, { role: 'assistant', text: LONG }])
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(0)
  expect(await w.command('')).toBe('Asking haiku for next steps; they show above the prompt.')
  await w.settle()
  expect(w.calls).toHaveLength(1)
})

test('auto: an automatic call that fails says nothing and shows nothing', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setAnswer(() => ({ fail: true }))
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(1)
  expect(w.toasts).toEqual([])
  expect(await rowView($)).toBeNull()
})

test('the model option: sonnet asks sonnet', { options: { model: 'sonnet' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  expect(w.calls[0]?.model).toBe('sonnet')
})

test('/next: asks over the last assistant reply with text, from a timer; the row shows asking meanwhile', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setMessages([
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'Short reply. Merge?' },
    { role: 'assistant', text: '' },
  ])
  let release: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (release = () => resolve({ text: json(['Merge it', 'Wait']) }))))
  expect(await w.command('')).toBe('Asking haiku for next steps; they show above the prompt.')
  expect(w.calls).toHaveLength(0)
  expect((await rowView($))?.busy).toBe('asking haiku for next steps…')
  await w.settle()
  expect(w.calls[0]?.prompt).toContain('Short reply. Merge?')
  // One call at a time.
  expect(await w.command('')).toBe('Next steps are on their way; wait for them (/next).')
  release()
  await w.settle()
  expect(w.state('suggestions')).toEqual(['Merge it', 'Wait'])
  expect((await rowView($))?.busy).toBe('')
  expect(w.calls).toHaveLength(1)
})

test('/next: no reply yet, the usage, and a failure toasts its reason', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('')).toBe('No assistant reply yet: /next works from the last one.')
  expect(await w.command('7')).toBe(USAGE)
  w.setMessages([{ role: 'assistant', text: 'Reply.' }])
  w.setAnswer(() => ({ fail: true }))
  await w.command('')
  await w.settle()
  expect(w.toasts).toEqual(['Next steps failed: api-error 529 overloaded (/next to try again)'])
  w.setAnswer(() => ({ text: 'I cannot suggest anything.' }))
  await w.command('')
  await w.settle()
  expect(w.toasts.at(-1)).toBe('No usable next steps came back (/next to try again).')
  // The engine refusing the call: $.model.complete rejects.
  w.setAnswer(() => ({ deny: 'model blocked' }))
  await w.command('')
  await w.settle()
  expect(w.toasts.at(-1)).toMatch(/^Next steps failed: .*model blocked.*\(\/next to try again\)$/)
  // The lock is released.
  w.setAnswer(() => ({ text: json(['Go']) }))
  expect(await w.command('')).toBe('Asking haiku for next steps; they show above the prompt.')
  await w.settle()
  expect(w.state('suggestions')).toEqual(['Go'])
})

test('/next falls back to the last answer seen when the transcript has none', async ($, on) => {
  const w = await world($, on, {})
  await w.start()
  await w.turnStart()
  await w.turnEnd('Short answer, kept.')
  expect(await w.command('')).toBe('Asking haiku for next steps; they show above the prompt.')
  await w.settle()
  expect(w.calls[0]?.prompt).toContain('Short answer, kept.')
})

test('/next <n> puts that suggestion in the prompt box from a timer; nothing is sent; the row stays', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  expect(await w.command('2')).toBe('Next step 2 goes in the prompt box: Run the tests again')
  expect(w.fills).toEqual([])
  await w.settle()
  expect(w.fills).toEqual([{ text: 'Run the tests again', mode: 'replace' }])
  expect(w.state('suggestions')).toEqual(THREE)
})

test('/next <n>: none shown, out of range, and a box that does not take it', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('1')).toBe('No next steps shown: /next asks for some.')
  w.setAnswer(() => ({ text: json(['Only one']) }))
  await answerTurn(w, LONG)
  expect(await w.command('3')).toBe('Only 1 next step: /next 1.')
  // A hook's refusal carries no cause (the site strips one a hook writes), so none is named.
  w.setFill({ isFilled: false, refusal: 'dialog' })
  await w.command('1')
  await w.settle()
  expect(w.fills).toEqual([])
  expect(w.toasts).toEqual(['The prompt box did not take next step 1: /next 1 to try again.'])
})

test('buttons: 1 to 3 fill the box, 0 dismisses, each from a timer', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  await press($, w, 'next-3')
  expect(w.fills).toEqual([{ text: 'Show me the diff of kit.ts', mode: 'replace' }])
  expect(w.toasts).toEqual([])
  await press($, w, 'next-dismiss')
  expect(w.state('suggestions')).toEqual([])
  expect(await rowView($)).toBeNull()
})

test('/next 0 dismisses, and drops the answer of a call still running', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  expect(await w.command('0')).toBe('Next steps dismissed.')
  expect(await rowView($)).toBeNull()
  let release: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (release = () => resolve({ text: json(THREE) }))))
  w.setMessages([{ role: 'assistant', text: 'Reply.' }])
  await w.command('')
  await w.settle()
  await w.command('0')
  release()
  await w.settle()
  expect(w.state('suggestions')).toEqual([])
  expect(w.state('busy')).toBe('')
})

test('/next 0 while a call runs takes the asking line down at once', async ($, on) => {
  const w = await world($, on)
  await w.start()
  let release: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (release = () => resolve({ text: json(THREE) }))))
  w.setMessages([{ role: 'assistant', text: 'Reply.' }])
  await w.command('')
  await w.settle()
  expect((await rowView($))?.busy).toBe('asking haiku for next steps…')
  await w.command('0')
  expect(w.state('busy')).toBe('')
  expect(await rowView($)).toBeNull()
  release()
  await w.settle()
  expect(await rowView($)).toBeNull()
})

test('cleared when a prompt is sent (not by a slash command), and when a main-loop turn starts', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  await w.submit('/next 1', { name: 'next', args: '1' })
  expect(w.state('suggestions')).toEqual(THREE)
  await w.submit('Ship it')
  expect(w.state('suggestions')).toEqual([])
  await answerTurn(w, LONG)
  expect(w.state('suggestions')).toEqual(THREE)
  // A subagent's turn leaves them; a main-loop turn (a woken one, no prompt) clears them.
  await w.turnStart('a1')
  expect(w.state('suggestions')).toEqual(THREE)
  await w.turnStart()
  expect(w.state('suggestions')).toEqual([])
})

test('a prompt sent while a call runs drops its answer', async ($, on) => {
  const w = await world($, on)
  await w.start()
  let release: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (release = () => resolve({ text: json(THREE) }))))
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(1)
  await w.submit('Something else')
  release()
  await w.settle()
  expect(w.state('suggestions') ?? []).toEqual([])
})

test('a stale call still running does not skip the next long answer\'s automatic call', async ($, on) => {
  const w = await world($, on)
  await w.start()
  let releaseA: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (releaseA = () => resolve({ text: json(['Stale']) }))))
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(1)
  await w.submit('Prompt B')
  // Turn B ends with a long answer before call A returns: B gets its own call.
  let releaseB: () => void = () => {}
  w.setAnswer(() => new Promise(resolve => (releaseB = () => resolve({ text: json(THREE) }))))
  await answerTurn(w, LONG)
  expect(w.calls).toHaveLength(2)
  // A finishes late: dropped, and it neither releases B's lock nor clears B's asking line.
  releaseA()
  await w.settle()
  expect(w.state('suggestions') ?? []).toEqual([])
  expect(w.state('busy')).toBe('haiku')
  expect(await w.command('')).toBe('Next steps are on their way; wait for them (/next).')
  releaseB()
  await w.settle()
  expect(w.state('suggestions')).toEqual(THREE)
  expect(w.state('busy')).toBe('')
})

test('a /clear empties the row and forgets the last answer', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  await w.sessionEnd('clear')
  expect(w.state('suggestions')).toEqual([])
  expect(await w.command('')).toBe('No assistant reply yet: /next works from the last one.')
})
