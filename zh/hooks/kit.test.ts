import { expect, test } from 'claude-code/testing'

import { costOf, fmtUsd, hashOf, locate, maxTokensFor, modelOf, parseArgs, piecesOf, reasonOf, shownText, splitInTwo } from './kit'

const u = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

test('kit: splitInTwo cuts at the blank line nearest the middle', () => {
  expect(splitInTwo('aaaa\n\nbbbb\n\ncccc\n\ndddd')).toEqual(['aaaa\n\nbbbb', 'cccc\n\ndddd'])
  expect(splitInTwo('one paragraph only')).toBeNull()
})

test('kit: splitInTwo never cuts inside a code fence; with no blank line outside, a line break', () => {
  const text = ['intro line', '```', 'x', '', 'y', '', 'z', '```', 'outro line'].join('\n')
  const [a, b] = splitInTwo(text)!
  expect((a.match(/```/g) ?? []).length % 2).toBe(0)
  expect((b.match(/```/g) ?? []).length % 2).toBe(0)
  expect(`${a}\n${b}`).toBe(text)
  // A tilde fence closes only on its own mark.
  const tilde = ['p1', '', '~~~', 'a', '```', '', 'b', '~~~', '', 'p2'].join('\n')
  const [c, d] = splitInTwo(tilde)!
  expect(c).toBe('p1')
  expect(d).toBe(['~~~', 'a', '```', '', 'b', '~~~', '', 'p2'].join('\n'))
})

test('kit: splitInTwo sees a fence nested in a list item, 4+ columns in', () => {
  const text = ['- a', '  - b', '', '    ```bash', '    echo 1', '', '    echo 2', '', '    echo 3', '    ```', '', '- c'].join('\n')
  const [a, b] = splitInTwo(text)!
  expect(a).toBe(['- a', '  - b'].join('\n'))
  expect(b).toBe(['    ```bash', '    echo 1', '', '    echo 2', '', '    echo 3', '    ```', '', '- c'].join('\n'))
})

test('kit: locate finds a reply by its place first, then the nearest match', () => {
  // Newest first: A, B, A, C.
  const h = ['A', 'B', 'A', 'C']
  expect(locate(h, { sourceHash: 'A', back: 3, total: 4 })).toBe(3)
  expect(locate(h, { sourceHash: 'A', back: 1, total: 4 })).toBe(1)
  // Two replies since: shifted, not the newer duplicate.
  expect(locate(['N', 'M', ...h], { sourceHash: 'A', back: 3, total: 4 })).toBe(5)
  // A rewind: the nearest match, the older one on a tie.
  expect(locate(['A', 'X', 'A'], { sourceHash: 'A', back: 4, total: 3 })).toBe(3)
  expect(locate(['A', 'X', 'A'], { sourceHash: 'A', back: 2, total: 3 })).toBe(3)
  expect(locate(h, { sourceHash: 'Z', back: 1, total: 4 })).toBeNull()
})

test('kit: piecesOf sends up to 6,000 estimated tokens whole', () => {
  const short = 'x'.repeat(24_000)
  expect(piecesOf(short)).toEqual([short])
  const long = `${'a'.repeat(12_001)}\n\n${'b'.repeat(12_001)}`
  expect(piecesOf(long)).toEqual(['a'.repeat(12_001), 'b'.repeat(12_001)])
})

test('kit: the reply cap is twice the tokens and a margin, 1,024 to 64,000', () => {
  expect(maxTokensFor('short')).toBe(1024)
  expect(maxTokensFor('x'.repeat(24_000))).toBe(12_512)
  expect(maxTokensFor('x'.repeat(400_000))).toBe(64_000)
})

test('kit: arguments, model option, prices, reasons and the shown text', () => {
  expect(parseArgs('')).toEqual({ kind: 'show', back: 1 })
  expect(parseArgs(' 3 ')).toEqual({ kind: 'show', back: 3 })
  expect(parseArgs('OFF')).toEqual({ kind: 'off' })
  expect(parseArgs('-1')).toEqual({ kind: 'usage' })
  expect(modelOf('sonnet')).toBe('sonnet')
  expect(modelOf('opus')).toBe('haiku')
  expect(modelOf(undefined)).toBe('haiku')
  expect(Math.round(costOf('haiku', u(1_000_000, 1_000_000))! * 1e6)).toBe(600_000)
  expect(Math.round(costOf('sonnet', u(1_000, 1_000))! * 1e6)).toBe(12_000)
  expect(fmtUsd(0.0001)).toBe('<$0.001')
  expect(fmtUsd(0.0042)).toBe('$0.004')
  expect(fmtUsd(0.123)).toBe('$0.12')
  expect(reasonOf({ isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: u(0, 0) })).toBe('api-error no response unknown')
  expect(reasonOf({ isAnswered: false, reason: 'empty-reply', usage: u(0, 0) })).toBe('the model replied with no text')
  expect(shownText('a\r\nb\u0007c\td')).toBe('a\nbc\td')
  expect(shownText('x'.repeat(95_000)).length).toBe(90_003)
  expect(hashOf('abc')).toBe(hashOf('abc'))
  expect(hashOf('abc')).not.toBe(hashOf('abd'))
})
