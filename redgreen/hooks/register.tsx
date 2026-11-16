import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Run } from '../types'
import { isGreen, keep, plural, statusText } from './format'
import { testsPane } from './pane'
import { parse, testCommand } from './parse'

const PANE = 'redgreen'
const TITLE = 'Tests'

const runs = atom({ plugin: 'redgreen', key: 'runs' } as const, [])
const viewing = atom({ plugin: 'redgreen', key: 'viewing' } as const, null)
const picked = atom({ plugin: 'redgreen', key: 'picked' } as const, 0)

type Ran = { isError?: true; text?: string; result?: unknown }

// The whole output: Claude's copy is cut short past a size, the full one is on disk.
async function outputOf($: EngineInterface, ran: Ran): Promise<string> {
  const result = typeof ran.result === 'object' && ran.result !== null ? (ran.result as Record<string, unknown>) : {}
  const path = result.persistedOutputPath

  if (typeof path === 'string') {
    try {
      return await $.fs.read(path)
    } catch {
      // Past 4 MiB or gone already: the inline copy still holds the summary's tail.
    }
  }

  if (typeof ran.text === 'string') {
    return ran.text
  }

  return [result.stdout, result.stderr].filter(part => typeof part === 'string').join('\n')
}

// Bash and PowerShell share this; one hook per tool keeps each tool's types apart.
async function record<R extends object>($: EngineInterface, command: string, toolUseId: string | undefined, ran: R): Promise<R> {
  const test = testCommand(command)

  if (test === undefined || ('deny' in ran && ran.deny !== undefined)) {
    return ran
  }

  const parsed = parse(await outputOf($, ran as Ran), test.runner)

  if (parsed === undefined) {
    return ran
  }

  const at = await $.clock.now()
  const run: Run = { ...parsed, id: `${at}-${toolUseId ?? ''}`, command, at }

  await update($, runs, list => keep(list, run))
  await update($, viewing, () => null)
  await update($, picked, () => 0)
  await $.ui.status(statusText(run))

  // Unasked, a pane seats only on a wide terminal; below that it waits.
  if (!isGreen(run)) {
    void $.ui.open({ id: PANE, title: TITLE })
  }

  return ran
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tests', description: 'Show test results: failures, their detail and run history (/tests clear empties it)' })

    const last = (await read($, runs)).at(-1)

    if (last !== undefined) {
      await $.ui.status(statusText(last))
    }

    return next(e)
  })

  on('command.run', { command: 'tests' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await update($, runs, () => [])
      await update($, viewing, () => null)
      await update($, picked, () => 0)
      await $.ui.status(undefined)

      return { text: 'Test history cleared.' }
    }

    await update($, viewing, () => null)
    await $.ui.open({ id: PANE, title: TITLE })

    const count = (await read($, runs)).length

    return { text: count === 0 ? 'Tests pane opened. It fills on the next test run.' : `Tests pane opened (${plural(count, 'run')}).` }
  })

  // Only watches: if recording throws, Claude's call keeps the result it already had.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)

    return record($, e.command, e.tool_use_id, ran)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const ran = await next(e)

    return record($, e.command, e.tool_use_id, ran)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, runs)
    const viewed = await read($, viewing)
    const index = viewed === null ? list.length - 1 : list.findIndex(run => run.id === viewed)
    const run = list[index]
    const failures = run?.failures.length ?? 0
    const chosen = Math.min(await read($, picked), Math.max(0, failures - 1))

    return testsPane($.ui.resolve(e), {
      list,
      index,
      chosen,
      now: await $.clock.now(),
      rows: e.viewport?.rows ?? 30,
      show: to => void update($, viewing, () => (to >= list.length - 1 ? null : (list[to]?.id ?? null))).then(() => update($, picked, () => 0)),
      pick: to => void update($, picked, () => Math.max(0, Math.min(failures - 1, to))),
    })
  })
}
