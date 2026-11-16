import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import * as output from './fixtures'

const SURFACES = ['terminal', 'desktop'] as const

const pane = (surface: (typeof SURFACES)[number], rows = 30) =>
  ({
    plugin: 'redgreen',
    surface,
    component: 'Pane',
    requestId: 'redgreen',
    viewport: { columns: 100, rows },
    props: { title: 'Tests', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: rows }, view: {} },
  }) as const

// The engine's answers a session would give, recording what the mod asks of it.
function stubEngine(on: On) {
  const seen = { status: [] as (string | undefined)[], opened: 0 }

  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.status', ($, e) => {
    seen.status.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => {
    seen.opened += 1
    return { value: { isPlaced: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))

  return seen
}

// Claude's Bash or PowerShell, answering with whatever the test last set: a success or a non-zero exit.
function shell(on: On) {
  const reply = { text: '', isError: false }

  on('tool.call', () =>
    (reply.isError
      ? { isError: true, result: { stdout: reply.text, stderr: '', interrupted: false }, text: reply.text }
      : { result: { stdout: reply.text, stderr: '', interrupted: false }, text: reply.text }) as never,
  )

  return (text: string, isError = false) => Object.assign(reply, { text, isError })
}

// Typed loosely: the kit's full tool-call union is too deep for tsc to instantiate here.
const call = ($: Engine, tool: string, command: string) =>
  ($ as unknown as { tool: { call: (input: { tool: string; command: string }) => Promise<unknown> } }).tool.call({ tool, command })
const bash = ($: Engine, command: string) => call($, 'Bash', command)

const runTests = ($: Engine, args = '') =>
  $.command.run({ command: 'tests', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

test('a failing run sets the status line and opens the pane', async ($, on) => {
  const seen = stubEngine(on)
  const answer = shell(on)
  answer(output.vitest, true)

  await bash($, 'pnpm exec vitest run')

  expect(seen.status).toEqual(['tests ✗ 3/4'])
  expect(seen.opened).toBe(1)
})

test('a green run updates the status line and leaves the pane shut', async ($, on) => {
  const seen = stubEngine(on)
  const answer = shell(on)
  answer(' ✓ cart.test.ts (2 tests) 4ms\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n   Duration  310ms\n')

  await bash($, 'npx vitest run')

  expect(seen.status).toEqual(['tests ✓ 2'])
  expect(seen.opened).toBe(0)
})

test('PowerShell runs count too; other commands do not', async ($, on) => {
  const seen = stubEngine(on)
  const answer = shell(on)
  answer(output.pytest, true)

  await call($, 'PowerShell', 'python -m pytest')
  await bash($, 'git status')

  expect(seen.status).toEqual(['tests ✗ 2/3'])
})

for (const surface of SURFACES) {
  test(`the pane lists failures, shows the picked one's detail and walks history (${surface})`, async ($, on) => {
    stubEngine(on)
    const answer = shell(on)
    answer(output.jest, true)
    await bash($, 'npx jest')
    answer(output.vitest, true)
    await bash($, 'cd web && pnpm exec vitest run')

    const ui = await $.ui.mount(pane(surface))

    expect(await ui.find({ type: 'Text', text: '✗ 3 failed' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$ pnpm exec vitest run' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /expected 13\.5 to be 14/ })).toBeUndefined()

    await ui.press({ key: 'fail-1' })
    expect(await ui.find({ type: 'Text', text: /expected 13\.5 to be 14/ })).toBeDefined()

    await ui.press({ key: 'older' })
    expect(await ui.find({ type: 'Text', text: '✗ 2 failed' })).toBeDefined()
    expect(await ui.find({ key: 'older' })).toBeUndefined()

    await ui.press({ key: 'latest' })
    expect(await ui.find({ type: 'Text', text: '✗ 3 failed' })).toBeDefined()
    await ui.unmount()
  })
}

test('a short pane windows the failure list and pages it', async ($, on) => {
  stubEngine(on)
  const answer = shell(on)
  // Two sessions' output back to back: four failures, one more than the list's floor.
  answer(output.pytest + output.pytest, true)
  await bash($, 'pytest')

  const ui = await $.ui.mount(pane('terminal', 14))

  expect(await ui.find({ type: 'Text', text: '1/4' })).toBeDefined()
  await ui.press({ key: 'next' })
  await ui.press({ key: 'next' })
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: '4/4' })).toBeDefined()
})

test('/tests opens the pane, empty until a run; /tests clear empties it', async ($, on) => {
  const seen = stubEngine(on)
  const answer = shell(on)

  expect((await runTests($)).text).toBe('Tests pane opened. It fills on the next test run.')
  expect(seen.opened).toBe(1)

  const empty = await $.ui.mount(pane('desktop'))
  expect(await empty.find({ type: 'Text', text: 'No test runs yet' })).toBeDefined()
  await empty.unmount()

  answer(output.cargo, true)
  await bash($, 'cargo test')
  expect((await runTests($)).text).toBe('Tests pane opened (1 run).')

  expect((await runTests($, 'clear')).text).toBe('Test history cleared.')
  expect(seen.status.at(-1)).toBeUndefined()

  const cleared = await $.ui.mount(pane('terminal'))
  expect(await cleared.find({ type: 'Text', text: 'No test runs yet' })).toBeDefined()
})
