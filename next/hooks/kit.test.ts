import { expect, test } from 'claude-code/testing'

import { CHIP, autoOf, cellsOf, cut, modelOf, parseArgs, parseSuggestions, promptOf } from './kit'

test('kit: the chip is padded like the other zehui-mods chips (the word to 7 letters)', async () => {
  expect(CHIP).toBe(' ➜ NEXT    ')
  expect(cellsOf(CHIP)).toBe(cellsOf(' ◉ HERE    '))
})

test('kit: options are held to their listed values', async () => {
  expect(autoOf(undefined)).toBe('on')
  expect(autoOf('on')).toBe('on')
  expect(autoOf('off')).toBe('off')
  expect(autoOf('OFF ')).toBe('on')
  expect(modelOf(undefined)).toBe('haiku')
  expect(modelOf('sonnet')).toBe('sonnet')
  expect(modelOf('opus')).toBe('haiku')
})

test('kit: parseSuggestions reads the first JSON array, inside a fence or words', async () => {
  expect(parseSuggestions('["Ship it", "Run the tests"]')).toEqual(['Ship it', 'Run the tests'])
  expect(parseSuggestions('Here you go:\n```json\n["a", "b", "c"]\n```')).toEqual(['a', 'b', 'c'])
  expect(parseSuggestions('no array')).toEqual([])
  expect(parseSuggestions('[not json]')).toEqual([])
  expect(parseSuggestions('{"a": 1}')).toEqual([])
})

test('kit: parseSuggestions cleans, drops long, empty and repeated ones, keeps three', async () => {
  const long = 'x'.repeat(61)
  expect(parseSuggestions(json(['1. Ship it', '- ship IT', '', '  ', long, 'Run\tthe\ntests', 42, '"Quoted"', 'four', 'five']))).toEqual([
    'Ship it',
    'Run the tests',
    'Quoted',
  ])
  expect(parseSuggestions(json(['y'.repeat(60)]))).toEqual(['y'.repeat(60)])
  // Control characters never reach the box.
  expect(parseSuggestions(json(['a\u001b[31mb']))).toEqual(['a [31mb'])
})

test('kit: promptOf sends the reply tail and the task list', async () => {
  expect(promptOf('Done. Ship?', [{ title: 'Row', status: 'completed' }, { title: 'Tests', status: 'in_progress' }])).toBe(
    ['<reply>', 'Done. Ship?', '</reply>', '<tasks>', '- [completed] Row', '- [in_progress] Tests', '</tasks>'].join('\n'),
  )
  expect(promptOf('x', [])).toContain('<tasks>\n(none)\n</tasks>')
  const p = promptOf(`HEAD${'a'.repeat(9_000)}TAIL`, [])
  expect(p).not.toContain('HEAD')
  expect(p).toContain('TAIL')
  expect(p).toContain('…')
})

test('kit: parseArgs', async () => {
  expect(parseArgs('')).toEqual({ kind: 'ask' })
  expect(parseArgs(' 2 ')).toEqual({ kind: 'pick', n: 2 })
  expect(parseArgs('0')).toEqual({ kind: 'dismiss' })
  expect(parseArgs('dismiss')).toEqual({ kind: 'dismiss' })
  expect(parseArgs('4')).toEqual({ kind: 'usage' })
  expect(parseArgs('1 2')).toEqual({ kind: 'usage' })
  expect(parseArgs('go')).toEqual({ kind: 'usage' })
})

test('kit: cut keeps a short text and marks a cut one', async () => {
  expect(cut('Run the tests', 20)).toBe('Run the tests')
  expect(cut('Run the tests again please', 10)).toBe('Run the t…')
})

const json = (o: unknown) => JSON.stringify(o)
