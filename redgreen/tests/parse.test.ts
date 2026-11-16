import { expect, test } from 'claude-code/testing'

import { ago, duration, keep, shortCommand, statusText } from '../hooks/format'
import { linesOf, parse, testCommand } from '../hooks/parse'
import type { Run } from '../types'
import * as output from './fixtures'

const names = (output: string, hint?: Parameters<typeof parse>[1]) => parse(output, hint)?.failures.map(f => f.name)

test('commands that run tests name their runner, or none for a package script', () => {
  expect(testCommand('pnpm exec vitest run src/a.test.ts')).toEqual({ runner: 'vitest' })
  expect(testCommand('npx jest --ci')).toEqual({ runner: 'jest' })
  expect(testCommand('python -m pytest -q tests/')).toEqual({ runner: 'pytest' })
  expect(testCommand('cargo +nightly test --workspace')).toEqual({ runner: 'cargo' })
  expect(testCommand('go test ./...')).toEqual({ runner: 'go' })
  expect(testCommand('bun test')).toEqual({ runner: 'bun' })
  expect(testCommand('deno test -A')).toEqual({ runner: 'deno' })
  expect(testCommand('cd app && pnpm test')).toEqual({ runner: undefined })
  expect(testCommand('npm run test -- --watch=false')).toEqual({ runner: undefined })
  expect(testCommand('pnpm exec turbo run test')).toEqual({ runner: undefined })
  expect(testCommand('git status')).toBeUndefined()
  expect(testCommand('pnpm build')).toBeUndefined()
})

test('vitest: counts, every failing test, and a file that failed to load', () => {
  const run = parse(output.vitest, 'vitest')

  expect(run).toMatchObject({ runner: 'vitest', passed: 1, failed: 3, skipped: 1, unit: 'tests' })
  expect(names(output.vitest)).toEqual(['broken.test.ts (file failed to run)', 'cart > applies discount', 'rounds tax'])
  expect(run?.failures[1]).toMatchObject({ file: 'cart.test.ts', message: 'AssertionError: expected 13.5 to be 14 // Object.is equality' })
  expect(run?.failures[1]?.detail).toContain('- Expected')
})

test('jest: the failing file and the › path as >', () => {
  const run = parse(output.jest, 'jest')

  expect(run).toMatchObject({ runner: 'jest', passed: 1, failed: 2, skipped: 1 })
  expect(names(output.jest, 'jest')).toEqual(['cart > applies discount', 'rounds tax'])
  expect(run?.failures[0]?.file).toBe('./cart.test.js')
})

test('pytest: class tests, the assertion as the message', () => {
  const run = parse(output.pytest, 'pytest')

  expect(run).toMatchObject({ runner: 'pytest', passed: 1, failed: 2, skipped: 1 })
  expect(names(output.pytest, 'pytest')).toEqual(['test_applies_discount', 'TestTax > test_rounds'])
  expect(run?.failures[0]).toMatchObject({ file: 'test_cart.py', message: 'assert (15 * 0.9) == 14' })
})

test('cargo: ignored as skipped, the panic as the message', () => {
  const run = parse(output.cargo, 'cargo')

  expect(run).toMatchObject({ runner: 'cargo', passed: 1, failed: 2, skipped: 1 })
  expect(run?.failures.map(f => [f.name, f.message])).toEqual([
    ['tests::applies_discount', 'assertion `left == right` failed'],
    ['tests::rounds_tax', 'rounding is off'],
  ])
})

test('go: packages without -v, the failing leaf subtest and its log either way', () => {
  const quiet = parse(output.go, 'go')

  expect(quiet).toMatchObject({ runner: 'go', unit: 'packages', passed: 1, failed: 1 })
  expect(quiet?.failures[0]).toMatchObject({ name: 'TestDiscount/ten_percent', file: 'cart_test.go', message: 'total = 13, want 14' })

  const verbose = parse(output.goVerbose, 'go')

  expect(verbose).toMatchObject({ unit: 'tests', failed: 1, skipped: 1 })
  expect(verbose?.failures[0]).toMatchObject({ name: 'TestDiscount/ten_percent', message: 'total = 13, want 14' })
})

test('bun: the error printed above each (fail) line', () => {
  const run = parse(output.bun, 'bun')

  expect(run).toMatchObject({ runner: 'bun', passed: 1, failed: 2, skipped: 1, durationMs: 268 })
  expect(run?.failures[0]).toMatchObject({ name: 'cart > applies discount', file: 'cart.test.ts' })
  expect(run?.failures[0]?.detail).toContain('Received: 13.5')
})

test('deno: the ERRORS section, one entry per test', () => {
  const run = parse(output.deno, 'deno')

  expect(run).toMatchObject({ runner: 'deno', passed: 1, failed: 2, skipped: 1 })
  expect(names(output.deno, 'deno')).toEqual(['applies discount', 'rounds tax'])
  expect(run?.failures[0]?.message).toBe('AssertionError: Values are not equal.')
})

test('a bare npm test finds its runner from the output alone', () => {
  for (const [runner, text] of Object.entries({ vitest: output.vitest, jest: output.jest, pytest: output.pytest, cargo: output.cargo, bun: output.bun, deno: output.deno })) {
    expect(parse(text)?.runner).toBe(runner)
  }
})

test('output with no summary is no run', () => {
  expect(parse('error: could not compile `cart`', 'cargo')).toBeUndefined()
  expect(parse('')).toBeUndefined()
})

test('colour codes and turbo prefixes are stripped before parsing', () => {
  expect(linesOf('@app/web:test: \x1b[31m FAIL \x1b[39m a.test.ts')).toEqual([' FAIL  a.test.ts'])

  const prefixed = output.vitest.split('\n').map(line => `web:test: ${line}`).join('\n')

  expect(parse(prefixed)?.failed).toBe(3)
})

const run = (over: Partial<Run> = {}): Run => ({ runner: 'vitest', passed: 4, failed: 0, skipped: 0, unit: 'tests', failures: [], id: 'a', command: 'vitest run', at: 0, ...over })

test('status text, durations, ages and the kept history', () => {
  expect(statusText(run())).toBe('tests ✓ 4')
  expect(statusText(run({ failed: 2 }))).toBe('tests ✗ 2/6')
  expect(statusText(run({ unit: 'packages', passed: 3 }))).toBe('tests ✓ 3 pkg')
  expect([duration(undefined), duration(420), duration(1530), duration(95_000)]).toEqual(['', '420ms', '1.5s', '1m 35s'])
  expect([ago(4000), ago(120_000), ago(7_200_000), ago(172_800_000)]).toEqual(['4s ago', '2m ago', '2h ago', '2d ago'])
  expect(shortCommand('cd "C:/my app" &&  pnpm   test')).toBe('pnpm test')

  let history: Run[] = []

  for (let i = 0; i < 55; i++) history = keep(history, run({ id: String(i) }))

  expect(history).toHaveLength(50)
  expect(history[0]?.id).toBe('5')
})
