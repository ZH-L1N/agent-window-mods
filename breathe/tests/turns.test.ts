// Local change 6 (zehui-mods): a subagent turn must not restart the 10 second delay or end the main turn's band.
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'breathe',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 9, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

const turn = { durationMs: 1000, isAborted: false, reason: 'answer', answer: '' } as const

// Whether the band is drawn now: a fresh drawing of the row, read for the band's Client.
async function bandShown($: Engine): Promise<boolean> {
  const ui = await $.ui.mount(BAND)
  const client = await ui.find({ type: 'Client' })
  await ui.unmount()
  return client !== undefined
}

test('a subagent turn starting and ending inside a main turn leaves the main turn and its delay alone', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'breathe' } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', ($$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  // The main turn starts at 0; a subagent's turn runs from 4 to 6 seconds.
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(4_000)
  await $.turn.start({ text: 'look', turnId: 'a1-t1', agentId: 'a1' })
  await clock.advance(2_000)
  await $.turn.complete({ ...turn, turnId: 'a1-t1', agentId: 'a1' })

  // 9 seconds into the main turn: not yet.
  await clock.advance(3_000)
  expect(await bandShown($)).toBe(false)

  // 10.5 seconds into the main turn: the band is drawn.
  await clock.advance(1_500)
  expect(await bandShown($)).toBe(true)
})
