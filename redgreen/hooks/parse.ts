// Turns a test runner's console output into counts and failures. Pure: register.tsx
// hands it the text of a Bash or PowerShell run and keeps what comes back.
import type { Parsed, Runner } from '../types'

const DETAIL_LINES = 30

// A command that runs tests, and the runner it names when it names one. A bare
// `npm test` names none: the output decides.
const COMMANDS: [RegExp, Runner | undefined][] = [
  [/\bvitest\b/, 'vitest'],
  [/\bjest\b/, 'jest'],
  [/\b(py\.test|pytest)\b/, 'pytest'],
  [/\bcargo\s+(\+\S+\s+)?test\b/, 'cargo'],
  [/\bgo\s+test\b/, 'go'],
  [/\bbun\s+test\b/, 'bun'],
  [/\bdeno\s+test\b/, 'deno'],
  [/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bturbo\s+(run\s+)?test\b|\bnx\s+(run-many\s+.*)?test\b|\bmake\s+test\b|\b(tox|nox)\b/, undefined],
]

export function testCommand(command: string): { runner: Runner | undefined } | undefined {
  for (const [pattern, runner] of COMMANDS) {
    if (pattern.test(command)) {
      return { runner }
    }
  }

  return undefined
}

// ANSI colour codes, and the `pkg:test: ` prefix turbo and pnpm -r put on every line.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g
const WORKSPACE_PREFIX = /^@?[\w.-]+(?:\/[\w.-]+)*(?::| )test(?::[\w-]+)?: ?/

export const linesOf = (output: string): string[] =>
  output.replace(ANSI, '').split(/\r?\n/).map(line => line.replace(WORKSPACE_PREFIX, ''))

const toMs = (value: string, unit: string): number => Math.round(Number(value) * (unit === 'ms' ? 1 : 1000))

const count = (text: string, word: RegExp): number => {
  const match = new RegExp(`(\\d+) (?:${word.source})\\b`).exec(text)

  return match === null ? 0 : Number(match[1])
}

// The lines of a failure's detail, indentation kept relative, blank edges dropped.
function trimDetail(lines: string[]): string[] {
  const kept = lines.slice(0, DETAIL_LINES)

  while (kept.length > 0 && kept[0]?.trim() === '') kept.shift()
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === '') kept.pop()

  const indent = Math.min(...kept.filter(line => line.trim() !== '').map(line => /^\s*/.exec(line)?.[0].length ?? 0))

  return kept.map(line => line.slice(Number.isFinite(indent) ? indent : 0).trimEnd())
}

const firstLine = (detail: string[]): string => detail.find(line => line.trim() !== '')?.trim() ?? ''

const empty = (runner: Runner): Parsed => ({ runner, passed: 0, failed: 0, skipped: 0, unit: 'tests', failures: [] })

function vitest(lines: string[]): Parsed | undefined {
  const parsed = empty('vitest')
  let found = false

  for (const line of lines) {
    const summary = /^\s*Tests\s{2,}(.+?)\s+\((\d+)\)\s*$/.exec(line)

    if (summary?.[1] !== undefined) {
      found = true
      parsed.failed += count(summary[1], /failed/)
      parsed.passed += count(summary[1], /passed/)
      parsed.skipped += count(summary[1], /skipped|todo/)
    }

    const took = /^\s*Duration\s+([\d.]+)(ms|s)\b/.exec(line)

    if (took?.[1] !== undefined && took[2] !== undefined) {
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(took[1], took[2])
    }
  }

  if (!found) {
    return undefined
  }

  lines.forEach((line, at) => {
    const head = /^\s*FAIL\s+(?:\|[^|]+\|\s+)?(\S+?)(?:\s+>\s+(.+?))?(?:\s+\[.*\])?\s*$/.exec(line)

    if (head?.[1] === undefined) {
      return
    }

    const end = lines.findIndex((next, i) => i > at && (/^\s*FAIL\s/.test(next) || /^\s*⎯{3,}/.test(next)))
    const detail = trimDetail(lines.slice(at + 1, end === -1 ? undefined : end))
    const name = head[2] ?? `${head[1]} (file failed to run)`

    if (!parsed.failures.some(f => f.name === name && f.file === head[1])) {
      parsed.failures.push({ name, file: head[1], message: firstLine(detail), detail })
    }
  })

  return parsed
}

function jest(lines: string[]): Parsed | undefined {
  const parsed = empty('jest')
  let found = false
  let file: string | undefined

  for (const line of lines) {
    const summary = /^Tests:\s+(.+)$/.exec(line)

    if (summary?.[1] !== undefined) {
      found = true
      parsed.failed += count(summary[1], /failed/)
      parsed.passed += count(summary[1], /passed/)
      parsed.skipped += count(summary[1], /skipped|todo|pending/)
    }

    const took = /^Time:\s+([\d.]+)\s*(ms|s)\b/.exec(line)

    if (took?.[1] !== undefined && took[2] !== undefined) {
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(took[1], took[2])
    }
  }

  if (!found) {
    return undefined
  }

  lines.forEach((line, at) => {
    const suite = /^\s*FAIL\s+(\S+)/.exec(line)

    if (suite?.[1] !== undefined) {
      file = suite[1]
      return
    }

    const head = /^\s*●\s+(.+)$/.exec(line)

    if (head?.[1] === undefined || /^Console$/.test(head[1].trim())) {
      return
    }

    const end = lines.findIndex((next, i) => i > at && (/^\s*●\s/.test(next) || /^\s*(FAIL|PASS)\s/.test(next) || /^Test Suites:/.test(next)))
    const detail = trimDetail(lines.slice(at + 1, end === -1 ? undefined : end))

    parsed.failures.push({ name: head[1].replace(/ › /g, ' > ').trim(), file, message: firstLine(detail), detail })
  })

  return parsed
}

function pytest(lines: string[]): Parsed | undefined {
  const parsed = empty('pytest')
  let found = false

  for (const line of lines) {
    const summary = /^=*\s*((?:\d+ \w+,? ?)+) in ([\d.]+)s\b/.exec(line)

    if (summary?.[1] !== undefined && summary[2] !== undefined && /\b(passed|failed|errors?|skipped)\b/.test(summary[1])) {
      found = true
      parsed.failed += count(summary[1], /failed/) + count(summary[1], /errors?/)
      parsed.passed += count(summary[1], /passed/)
      parsed.skipped += count(summary[1], /skipped|xfailed|deselected/)
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(summary[2], 's')
    } else if (/^=*\s*no tests ran in [\d.]+s/.test(line)) {
      found = true
    }
  }

  if (!found) {
    return undefined
  }

  // The FAILURES section holds one `____ test_name ____` block per failure.
  const blocks = new Map<string, string[]>()

  lines.forEach((line, at) => {
    const head = /^_{3,} (.+?) _{3,}$/.exec(line)

    if (head?.[1] === undefined) {
      return
    }

    const end = lines.findIndex((next, i) => i > at && (/^_{3,} .+ _{3,}$/.test(next) || /^={3,}/.test(next)))
    blocks.set(head[1], lines.slice(at + 1, end === -1 ? undefined : end))
  })

  for (const line of lines) {
    const short = /^(?:FAILED|ERROR) (\S+?)(?:::(\S+))?(?: - (.*))?$/.exec(line)

    if (short?.[1] === undefined) {
      continue
    }

    const parts = short[2]?.split('::') ?? []
    const name = parts.length > 0 ? parts.join(' > ') : short[1]
    const block = blocks.get(parts.join('.')) ?? blocks.get(parts[parts.length - 1] ?? '') ?? []
    const detail = trimDetail(block)
    const raised = detail.find(entry => entry.startsWith('E ')) ?? ''

    parsed.failures.push({ name, file: short[1], message: short[3]?.trim() || raised.slice(1).trim() || firstLine(detail), detail })
  }

  return parsed
}

function cargo(lines: string[]): Parsed | undefined {
  const parsed = empty('cargo')
  let found = false

  for (const line of lines) {
    const summary = /^test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;.*?finished in ([\d.]+)s/.exec(line)

    if (summary !== null) {
      found = true
      parsed.passed += Number(summary[1])
      parsed.failed += Number(summary[2])
      parsed.skipped += Number(summary[3])
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(summary[4] ?? '0', 's')
    }
  }

  if (!found) {
    return undefined
  }

  lines.forEach((line, at) => {
    const head = /^---- (\S+) stdout ----$/.exec(line)

    if (head?.[1] === undefined) {
      return
    }

    const end = lines.findIndex((next, i) => i > at && (/^---- \S+ stdout ----$/.test(next) || /^failures:$/.test(next)))
    const detail = trimDetail(lines.slice(at + 1, end === -1 ? undefined : end).filter(entry => !/^note: run with `RUST_BACKTRACE/.test(entry)))
    const panic = detail.join('\n')
    const place = /panicked at (?:'.*?', )?([^\s:]+\.rs):(\d+)/.exec(panic)
    const inline = /panicked at '(.*?)'/.exec(panic)
    const message = inline?.[1] ?? detail.find(entry => !/^thread '/.test(entry) && entry.trim() !== '')?.trim() ?? ''

    parsed.failures.push({ name: head[1], file: place?.[1], message, detail })
  })

  return parsed
}

// A test's t.Log lines: under its `--- FAIL` line without -v, under its `=== RUN` line with it.
function goLog(lines: string[], at: number): string[] | undefined {
  if (at === -1) {
    return undefined
  }

  const end = lines.findIndex((next, i) => i > at && (/^\s*(---|===) /.test(next) || /^(FAIL|ok|PASS)\b/.test(next)))
  const detail = trimDetail(lines.slice(at + 1, end === -1 ? undefined : end))

  return detail.length === 0 ? undefined : detail
}

function go(lines: string[]): Parsed | undefined {
  const parsed = { ...empty('go'), durationMs: 0 }
  let packagesOk = 0
  let packagesFailed = 0
  let found = false
  let listedPasses = 0

  for (const line of lines) {
    const pkg = /^(ok|FAIL)\s+(\S+)\s+(?:([\d.]+)s|\[(.+)\]|\(cached\))/.exec(line)

    if (pkg !== null) {
      found = true

      if (pkg[1] === 'ok') {
        packagesOk += 1
      } else {
        packagesFailed += 1
      }

      parsed.durationMs += toMs(pkg[3] ?? '0', 's')

      if (pkg[4] !== undefined) {
        parsed.failures.push({ name: pkg[2] ?? '', message: pkg[4], detail: [] })
      }
    }

    if (/^\s*--- PASS: /.test(line)) listedPasses += 1
    if (/^\s*--- SKIP: /.test(line)) parsed.skipped += 1
  }

  if (!found) {
    return undefined
  }

  const failed = lines.flatMap((line, at) => {
    const head = /^(\s*)--- FAIL: (\S+)/.exec(line)

    return head?.[2] === undefined ? [] : [{ at, indent: head[1]?.length ?? 0, name: head[2] }]
  })

  // A parent fails with its subtest; only the leaves are failures of their own.
  for (const test of failed) {
    if (failed.some(other => other.name.startsWith(`${test.name}/`))) {
      continue
    }

    const detail = goLog(lines, test.at) ?? goLog(lines, lines.findIndex(line => line.trim() === `=== RUN   ${test.name}`)) ?? []
    const place = /^\s*(\S+\.go):\d+:/.exec(detail[0] ?? '')

    parsed.failures.push({
      name: test.name,
      file: place?.[1],
      message: firstLine(detail).replace(/^\S+\.go:\d+:\s*/, ''),
      detail,
    })
  }

  // Without -v go lists no passing test, only packages: count those instead.
  if (listedPasses === 0) {
    return { ...parsed, unit: 'packages', passed: packagesOk, failed: packagesFailed }
  }

  return { ...parsed, passed: listedPasses, failed: parsed.failures.length }
}

function bun(lines: string[]): Parsed | undefined {
  const parsed = empty('bun')
  let found = false
  let from = 0
  let file: string | undefined

  lines.forEach((line, at) => {
    const tally = /^\s*(\d+) (pass|fail|skip|todo)\s*$/.exec(line)

    if (tally !== null) {
      found = true
      const n = Number(tally[1])

      if (tally[2] === 'pass') parsed.passed += n
      else if (tally[2] === 'fail') parsed.failed += n
      else parsed.skipped += n
    }

    const ran = /^Ran \d+ tests? across .*\[([\d.]+)(ms|s)\]/.exec(line)

    if (ran?.[1] !== undefined && ran[2] !== undefined) {
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(ran[1], ran[2])
    }

    // bun prints a failure's error above its `(fail)` line, after the previous result.
    const result = /^\((pass|fail|skip|todo)\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line)

    if (result?.[2] !== undefined) {
      if (result[1] === 'fail') {
        const detail = trimDetail(lines.slice(from, at).filter(entry => !/^\S.*\.(test|spec)\.\w+:$/.test(entry)))
        parsed.failures.push({ name: result[2], file, message: firstLine(detail), detail })
      }

      from = at + 1
    } else if (/^\S.*\.(test|spec)\.\w+:$/.test(line)) {
      file = line.slice(0, -1)
      from = at + 1
    }
  })

  return found ? parsed : undefined
}

function deno(lines: string[]): Parsed | undefined {
  const parsed = empty('deno')
  let found = false

  for (const line of lines) {
    const summary = /^(?:ok|FAILED) \| (\d+) passed.*?\| (\d+) failed(?:.*?\| (\d+) ignored)?.*\(([\d.]+)(ms|s)\)\s*$/.exec(line)

    if (summary !== null) {
      found = true
      parsed.passed += Number(summary[1])
      parsed.failed += Number(summary[2])
      parsed.skipped += Number(summary[3] ?? 0)
      parsed.durationMs = (parsed.durationMs ?? 0) + toMs(summary[4] ?? '0', summary[5] ?? 'ms')
    }
  }

  if (!found) {
    return undefined
  }

  const errors = lines.findIndex(line => /^\s*ERRORS\s*$/.test(line))
  const failures = lines.findIndex(line => /^\s*FAILURES\s*$/.test(line))
  const section = errors === -1 ? [] : lines.slice(errors + 1, failures === -1 ? undefined : failures)

  section.forEach((line, at) => {
    const head = /^(.+?) => (\S+?):\d+:\d+$/.exec(line)

    if (head?.[1] === undefined) {
      return
    }

    const end = section.findIndex((next, i) => i > at && / => \S+:\d+:\d+$/.test(next))
    const detail = trimDetail(section.slice(at + 1, end === -1 ? undefined : end))

    parsed.failures.push({ name: head[1], file: head[2], message: firstLine(detail).replace(/^error: /, ''), detail })
  })

  return parsed
}

const PARSERS: Record<Runner, (lines: string[]) => Parsed | undefined> = { vitest, jest, pytest, cargo, go, bun, deno }

// The runner the command named goes first; a bare `npm test` tries each in turn.
export function parse(output: string, hint?: Runner): Parsed | undefined {
  const lines = linesOf(output)
  const order = hint === undefined ? Object.keys(PARSERS) as Runner[] : [hint, ...(Object.keys(PARSERS) as Runner[]).filter(r => r !== hint)]

  for (const runner of order) {
    const parsed = PARSERS[runner](lines)

    if (parsed !== undefined) {
      // A file that failed to load fails no counted test, but is still a failure to look at.
      return { ...parsed, failed: Math.max(parsed.failed, parsed.unit === 'tests' ? parsed.failures.length : 0) }
    }
  }

  return undefined
}
