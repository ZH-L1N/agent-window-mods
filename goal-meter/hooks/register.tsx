// The goal-meter mod: the ◆ GOAL row (row.tsx) and the /goals pane
// (pane.tsx), read from Claude's own task list. Each task-list tool call of
// the main loop (TodoWrite, TaskCreate, TaskUpdate, TaskList) changes the one
// goal; subagents' lists are ignored. The goal is named after the prompt that
// started the turn its list was made in. Finished goals and replaced ones go
// to a five-long history in the store.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Goal, GoalRecord, GoalTaskStatus } from '../types'
import {
  COMMAND,
  DONE_SHOW_MS,
  PANE,
  PANE_TITLE,
  STORE_BAND,
  STORE_HISTORY,
  TICK_MS,
  applyCreate,
  applyList,
  applyTodos,
  applyUpdate,
  doneToast,
  historyOf,
  isBandOn,
  isShown,
  withRecord,
} from './kit'
import type { TodoItem } from './kit'
import { drawPane } from './pane'
import { drawRow } from './row'

const goal = atom({ plugin: 'goal-meter', key: 'goal' } as const, null)
const history = atom({ plugin: 'goal-meter', key: 'history' } as const, [])
const now = atom({ plugin: 'goal-meter', key: 'now' } as const, 0)
const prompt = atom({ plugin: 'goal-meter', key: 'prompt' } as const, '')
const band = atom({ plugin: 'goal-meter', key: 'band' } as const, '')

// The row's tick while a goal shows, and the one-shot that hides a finished
// goal's row on time. A reload drops both with the environment; session.start
// (raised again for a fresh load) starts the tick again while a goal shows.
let ticker: Timer | null = null
let linger: Timer | null = null

const stopTick = () => {
  ticker?.cancel()
  ticker = null
}

function startTick($: EngineInterface): void {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => {
    void tick($).catch(() => {})
  })
}

/** Moves `now` so the row's minutes redraw; stops once the row has nothing to show. */
async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  if (!isShown(await read($, goal), at)) stopTick()
}

/** The store's history as it stands now (another session may have written it since this one started); null with no store. */
async function storedHistory($: EngineInterface): Promise<GoalRecord[] | null> {
  try {
    return historyOf(await $.store.get(STORE_HISTORY))
  } catch {
    return null
  }
}

// Records go in one at a time, so two in this process never write over each other.
let saving: Promise<void> = Promise.resolve()

function remember($: EngineInterface, g: Goal): Promise<void> {
  const run = saving.then(() => save($, g))
  saving = run.catch(() => {})
  return run
}

/** The goal into the history: merged with the store's list read fresh, written back, mirrored into state. */
async function save($: EngineInterface, g: Goal): Promise<void> {
  const stored = await storedHistory($)
  const list = await update($, history, h => withRecord(stored ?? h, g))
  try {
    await $.store.set(STORE_HISTORY, list)
  } catch {
    // No store: the pane still lists them for this process.
  }
}

/** Writes a /goals setting to the store; the words to add to the reply when it could not be kept. */
async function persist($: EngineInterface, key: string, value: unknown): Promise<string> {
  try {
    await $.store.set(key, value)
    return ''
  } catch {
    return ' (not saved for the next session)'
  }
}

type Change = (prev: Goal | null, at: number, prompt: string) => { goal: Goal | null; replaced?: Goal | null }

/**
 * One change to the goal: written, the tick started while it shows, a
 * replaced unfinished goal kept in the history, and on its finish the
 * history, the one toast and the hide two minutes on.
 */
async function change($: EngineInterface, options: PluginOptions, fn: Change): Promise<void> {
  const at = await $.clock.now()
  const p = await read($, prompt)
  // Worked out inside update(): when a parallel task-list call writes first,
  // update() runs `fn` again on that newer goal instead of overwriting it.
  const seen: { prev: Goal | null; out: ReturnType<Change> } = { prev: null, out: { goal: null } }
  const next = await update($, goal, cur => {
    seen.prev = cur
    seen.out = fn(cur, at, p)
    return seen.out.goal
  })
  const prev = seen.prev
  const replaced = seen.out.replaced ?? null
  await update($, now, () => at)
  // A finished goal is in the history from its finish; an unfinished one goes in as it is replaced.
  if (replaced && replaced.tasks.length > 0 && replaced.doneAt === undefined) await remember($, replaced)
  const wasDone = prev !== null && next !== null && prev.startedAt === next.startedAt && prev.doneAt !== undefined
  if (next && next.doneAt !== undefined && !wasDone) {
    await remember($, next)
    if (isBandOn(await read($, band), options.band)) $.ui.toast(doneToast(next))
    linger?.cancel()
    linger = $.clock.after(DONE_SHOW_MS, () => {
      void tick($).catch(() => {})
    })
  }
  if (isShown(next, at)) startTick($)
}

const STATUSES = new Set(['pending', 'in_progress', 'completed'])
const isStatus = (s: unknown): s is GoalTaskStatus => typeof s === 'string' && STATUSES.has(s)
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

/** A task-list call that went through, read defensively: what it said and what it answered. */
async function record($: EngineInterface, options: PluginOptions, input: Record<string, unknown>, result: unknown): Promise<void> {
  const out = obj(result)
  switch (input.tool) {
    case 'TodoWrite': {
      if (!Array.isArray(input.todos)) return
      const todos: TodoItem[] = input.todos
        .map(obj)
        .filter(t => typeof t.content === 'string' && isStatus(t.status))
        .map(t => ({ content: str(t.content), status: t.status as GoalTaskStatus }))
      await change($, options, (prev, at, p) => applyTodos(prev, todos, at, p))
      return
    }
    case 'TaskCreate': {
      const task = obj(out.task)
      const id = str(task.id)
      const subject = str(input.subject) || str(task.subject)
      if (!id || !subject) return
      await change($, options, (prev, at, p) => applyCreate(prev, id, subject, at, p))
      return
    }
    case 'TaskUpdate': {
      const taskId = str(input.taskId)
      // A refusal answers success: false without isError; the task did not change.
      if (!taskId || out.success === false) return
      const status = input.status === 'deleted' || isStatus(input.status) ? input.status : undefined
      const subject = str(input.subject) || undefined
      await change($, options, (prev, at) => ({
        goal: applyUpdate(prev, { taskId, ...(status ? { status } : {}), ...(subject ? { subject } : {}) }, at),
      }))
      return
    }
    case 'TaskList': {
      if (!Array.isArray(out.tasks)) return
      const listed = out.tasks
        .map(obj)
        .filter(t => str(t.id) && isStatus(t.status))
        .map(t => ({ id: str(t.id), status: t.status as GoalTaskStatus }))
      await change($, options, (prev, at) => ({ goal: applyList(prev, listed, at) }))
      return
    }
  }
}

const USAGE = `Usage: /${COMMAND} [on | off | clear | help]`

const HELP = [
  `/${COMMAND}: the GOAL row reads Claude's own task list (TodoWrite, or TaskCreate and TaskUpdate) in the main loop; there is nothing to set by hand.`,
  `  /${COMMAND}          open the pane: every task (▶ running, ✓ done, ○ open) with its minutes, then the last five goals`,
  `  /${COMMAND} on|off   show or hide the GOAL row and its done toast`,
  `  /${COMMAND} clear    forget the current goal and the history`,
  `  /${COMMAND} help     this text`,
  'Row: name ▰▰▰▰▱▱ 4/6 · 67% · 18m · ETA ~9m │ ▶ running task. ETA is the finished tasks\' average times the tasks left.',
  'The bar turns amber when the running task has taken twice that average. Done: "done ✓ in 12m" for two minutes, then the row hides.',
  'Subagents\' task lists are ignored.',
].join('\n')

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'goals',
      description: 'GOAL row: open the goals pane (every task and the last five goals), turn the row on or off, clear, or help',
      argumentHint: 'on | off | clear | help',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
      const past = historyOf(await $.store.get(STORE_HISTORY))
      await update($, history, () => past)
    } catch {
      // No store: the option applies and the history starts empty.
    }
    const at = await $.clock.now()
    await update($, now, () => at)
    stopTick()
    if (isShown(await read($, goal), at)) startTick($)
    return started
  })

  // The prompt that starts a main-loop turn names a goal whose list that turn makes.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    try {
      if (e.agentId === undefined && e.text.trim()) {
        const text = e.text
        await update($, prompt, () => text.slice(0, 2_000))
      }
    } catch {
      // Best effort: the name falls back to the last prompt.
    }
    return started
  })

  // The task-list tools of the main loop. Read after the tool ran (TaskCreate's
  // id is in its result); a call that was refused or failed changes nothing.
  on('tool.call', { tool: ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList'] }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError) return ran
    try {
      await record($, options, e as unknown as Record<string, unknown>, ran.result)
    } catch {
      // The goal is best effort: the tool's result goes on whatever happens here.
    }
    return ran
  }).catch(($, e, next) => next(e)) // A failure here never blocks the tool.

  // A /clear or an in-process resume puts another conversation in this
  // process: its goal is not this one. An unfinished goal goes to the history.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      await change($, options, prev => ({ goal: null, replaced: prev })).catch(() => {})
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'goals' }, async ($, e) => {
    const [verb = ''] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    switch (verb) {
      case '': {
        const at = await $.clock.now()
        await update($, now, () => at)
        await $.ui.open({ id: PANE, title: PANE_TITLE })
        return { text: 'Goals pane opened.' }
      }
      case 'on':
      case 'off': {
        await update($, band, () => verb)
        const note = await persist($, STORE_BAND, verb)
        return { text: `${verb === 'on' ? 'GOAL line on.' : `GOAL line off (no row, no toast; /${COMMAND} still opens the pane).`}${note}` }
      }
      case 'clear': {
        await update($, goal, () => null)
        await update($, history, () => [])
        stopTick()
        const note = await persist($, STORE_HISTORY, [])
        return { text: `Goal and history cleared.${note}` }
      }
      case 'help':
        return { text: HELP }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'goals' }, ($, e) => drawPane($, e))
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawRow($, e, () => next(e), options))
}
