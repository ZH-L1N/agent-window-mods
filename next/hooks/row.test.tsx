import { expect, test } from 'claude-code/testing'

import { CHIP } from './kit'
import { LONG, answerTurn, childKeys, json, mountRow, rowView, world } from './test-kit'

test('row: the lime chip, framed Buttons 1 to 3 and 0 with no hotkeys; above another mod\'s band', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  const ui = await mountRow($)
  const chip = await ui.find({ type: 'Text', text: CHIP })
  expect(chip?.props).toMatchObject({ bold: true, color: '#0b0b0f', backgroundColor: '#a3e635' })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => (b.props as { label?: string }).label?.slice(0, 2))).toEqual(['1:', '2:', '3:', '0:'])
  // No hotkeys: a band Button's bare digit is armed from an empty composer too,
  // so a prompt starting with 0 to 3 would press it (claude-code.d.ts ButtonProps.hotkey).
  expect(buttons.every(b => (b.props as { hotkey?: string }).hotkey === undefined)).toBe(true)
  // Framed: none is drawn plain.
  expect(buttons.every(b => (b.props as { plain?: boolean }).plain === undefined)).toBe(true)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.filter(t => t === 'beneath')).toHaveLength(1)
  expect(texts.indexOf(CHIP)).toBeLessThan(texts.indexOf('beneath'))
  await ui.unmount()
})

test('row: hidden with nothing to show, and while a turn runs', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await rowView($)).toBeNull()
  await answerTurn(w, LONG)
  expect(await rowView($)).not.toBeNull()
  expect(await rowView($, 160, { isWorking: true })).toBeNull()
  const ui = await mountRow($, 160, { isWorking: true })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('row: a narrow band cuts a label for the row only; the box takes the whole text', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const long = 'Rename stackRow to placeRow in every mod kit now'
  w.setAnswer(() => ({ text: json([long]) }))
  await answerTurn(w, LONG)
  const v = await rowView($, 40)
  // 40 columns less the frame (4) and '1: ' (3): 33 for the text.
  expect(v?.buttons[0]?.label).toBe('1: Rename stackRow to placeRow in e…')
  await w.command('1')
  await w.settle()
  expect(w.fills[0]?.text).toBe(long)
})

test('row: yields to a survey, untouched, and draws only on the terminal', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await answerTurn(w, LONG)
  expect(await rowView($, 160, { hasSurvey: true })).toBeNull()
  expect(await rowView($, 160, { surface: 'desktop' })).toBeNull()
  const survey = await mountRow($, 160, { hasSurvey: true })
  expect((await survey.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await survey.unmount()
})

test('row: the engine placeholder beneath is skipped when the row draws, handed on when it has nothing', async ($, on) => {
  const w = await world($, on, { isEngineBeneath: true })
  await w.start()
  const empty = await mountRow($)
  expect(JSON.stringify(await empty.drawn())).toContain('"engine"')
  await empty.unmount()
  await answerTurn(w, LONG)
  const ui = await mountRow($)
  expect(await ui.find({ key: 'next-chip' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
  await ui.unmount()
})

test('row: stack order: the row takes NEXT 80 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  const w = await world($, on, { stackBeneath: ['zm-70-here', 'zm-10-sys', 'zm-60-goal'] })
  await w.start()
  await answerTurn(w, LONG)
  const ui = await mountRow($)
  expect(childKeys(await ui.drawn())).toEqual(['zm-10-sys', 'zm-60-goal', 'zm-70-here', 'zm-80-next', 'other-band'])
  await ui.unmount()
})
