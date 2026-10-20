import { expect, test } from 'claude-code/testing'

import type { Goal, GoalRecord } from '../types'
import { MIN, T0, lineRuns, lineText, world } from './test-kit'

const finishTwo = async (w: Awaited<ReturnType<typeof world>>) => {
  await w.todo([
    ['Build', 'in_progress'],
    ['Release', 'pending'],
  ])
  await w.clock.advance(4 * MIN)
  await w.todo([
    ['Build', 'completed'],
    ['Release', 'in_progress'],
  ])
  await w.clock.advance(8 * MIN)
  await w.todo([
    ['Build', 'completed'],
    ['Release', 'completed'],
  ])
}

test('register: TaskCreate and TaskUpdate keep one goal, named after the turn\'s prompt, with each task\'s times', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Build the mods\nsecond line')
  const a = await w.create('Write the plan')
  const b = await w.create('Write the row')
  await w.set(a, 'in_progress')
  await w.clock.advance(3 * MIN)
  await w.set(a, 'completed')
  const goal = w.state('goal') as Goal
  expect(goal).toEqual({
    name: 'Build the mods',
    startedAt: T0,
    tasks: [
      { id: a, title: 'Write the plan', status: 'completed', startedAt: T0, doneAt: T0 + 3 * MIN },
      { id: b, title: 'Write the row', status: 'pending' },
    ],
  })
  // A deleted task leaves the goal; an unknown id changes nothing.
  await w.set(b, 'deleted')
  await w.set('99', 'completed')
  expect((w.state('goal') as Goal).tasks.map(t => t.id)).toEqual([a])
})

test('register: TaskList brings the goal\'s own tasks up to date and pulls in no others', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Old work')
  const old = await w.create('Old task')
  await w.set(old, 'completed')
  await w.clock.advance(MIN)
  // A new goal on the same list: the old task stays out of it.
  await w.prompt('New work')
  const a = await w.create('New task')
  expect((w.state('goal') as Goal).name).toBe('New work')
  // The tool's own list moved on without a TaskUpdate the hook saw (a reload, say).
  w.calls.length = 0
  const tools = $ as unknown as { tool: { call: (i: unknown) => Promise<unknown> } }
  await tools.tool.call({ tool: 'TaskUpdate', taskId: a, status: 'in_progress', agentId: 'a9' })
  expect((w.state('goal') as Goal).tasks[0]?.status).toBe('pending')
  await w.list()
  expect((w.state('goal') as Goal).tasks).toEqual([{ id: a, title: 'New task', status: 'in_progress', startedAt: T0 + MIN }])
})

test('register: subagents\' task lists are ignored', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Main work')
  await w.todo([['Their step', 'in_progress']], 'a1')
  await w.create('Their task', 'a1')
  // The calls reached the tools with the subagent's id, and the goal never started.
  expect(w.calls).toEqual([
    { tool: 'TodoWrite', agentId: 'a1' },
    { tool: 'TaskCreate', agentId: 'a1' },
  ])
  expect(w.state('goal') ?? null).toBeNull()
  expect(await lineRuns($)).toEqual([])
  // The main loop's own list does start one.
  await w.todo([['My step', 'pending']])
  expect((w.state('goal') as Goal).tasks.map(t => t.title)).toEqual(['My step'])
})

test('register: one toast when the goal is done, none when the finished list is written again', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Ship it')
  await finishTwo(w)
  expect(w.toasts).toEqual(['Goal done in 12m, 2 tasks'])
  await w.todo([
    ['Build', 'completed'],
    ['Release', 'completed'],
  ])
  await w.clock.advance(5 * MIN)
  expect(w.toasts).toEqual(['Goal done in 12m, 2 tasks'])
  expect((w.store.get('goal-meter.history') as GoalRecord[]).map(r => r.name)).toEqual(['Ship it'])
})

test('register: a new list after a finished goal starts a new goal; the history keeps the last five', async ($, on) => {
  const w = await world($, on)
  await w.start()
  for (let i = 1; i <= 6; i++) {
    await w.prompt(`Goal ${i}`)
    await w.todo([[`Step ${i}`, 'in_progress']])
    await w.clock.advance(MIN)
    await w.todo([[`Step ${i}`, 'completed']])
  }
  await w.prompt('Goal 7')
  await w.todo([['Step 7', 'pending']])
  expect((w.state('goal') as Goal).name).toBe('Goal 7')
  expect(lineText(await lineRuns($))).toContain('Goal 7 ▱▱▱▱▱▱ 0/1')
  const stored = w.store.get('goal-meter.history') as GoalRecord[]
  expect(stored.map(r => r.name)).toEqual(['Goal 6', 'Goal 5', 'Goal 4', 'Goal 3', 'Goal 2'])
  expect(stored[0]).toEqual({ name: 'Goal 6', startedAt: T0 + 5 * MIN, doneAt: T0 + 6 * MIN, total: 1, done: 1 })
  expect(w.toasts).toHaveLength(6)
})

test('register: an unfinished goal replaced by /clear goes to the history as stopped', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Half done')
  await w.todo([
    ['A', 'completed'],
    ['B', 'pending'],
  ])
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  expect(w.state('goal')).toBeNull()
  expect(w.store.get('goal-meter.history')).toEqual([{ name: 'Half done', startedAt: T0, total: 2, done: 1 }])
})

test('register: the history in the store comes back at the session start', async ($, on) => {
  const past: GoalRecord[] = [{ name: 'Yesterday', startedAt: T0 - 86_400_000, doneAt: T0 - 86_000_000, total: 3, done: 3 }]
  const w = await world($, on, { store: { 'goal-meter.history': [...past, { junk: true }] } })
  await w.start()
  expect(w.state('history')).toEqual(past)
})

test('register: /goals off hides the row and the toast; the store keeps it, and it wins at the next start', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Quiet')
  await w.todo([['A', 'in_progress']])
  expect(await w.command('off')).toBe('GOAL line off (no row, no toast; /goals still opens the pane).')
  expect(w.store.get('goal-meter.band')).toBe('off')
  expect(await lineRuns($)).toEqual([])
  await w.todo([['A', 'completed']])
  expect(w.toasts).toEqual([])
  await w.start()
  expect(w.state('band')).toBe('off')
  expect(await w.command('on')).toBe('GOAL line on.')
  expect(lineText(await lineRuns($))).toContain('done ✓ in 0m')
})

test('register: /goals clear forgets the goal and the history', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Ship it')
  await finishTwo(w)
  expect(await w.command('clear')).toBe('Goal and history cleared.')
  expect(w.state('goal')).toBeNull()
  expect(w.state('history')).toEqual([])
  expect(w.store.get('goal-meter.history')).toEqual([])
  expect(await lineRuns($)).toEqual([])
})

test('register: /goals help explains the row and every argument; anything else prints the usage', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('help')).toBe(
    [
      "/goals: the GOAL row reads Claude's own task list (TodoWrite, or TaskCreate and TaskUpdate) in the main loop; there is nothing to set by hand.",
      '  /goals          open the pane: every task (▶ running, ✓ done, ○ open) with its minutes, then the last five goals',
      '  /goals on|off   show or hide the GOAL row and its done toast',
      '  /goals clear    forget the current goal and the history',
      '  /goals help     this text',
      "Row: name ▰▰▰▰▱▱ 4/6 · 67% · 18m · ETA ~9m │ ▶ running task. ETA is the finished tasks' average times the tasks left.",
      'The bar turns amber when the running task has taken twice that average. Done: "done ✓ in 12m" for two minutes, then the row hides.',
      "Subagents' task lists are ignored.",
    ].join('\n'),
  )
  expect(await w.command('status')).toBe('Usage: /goals [on | off | clear | help]')
})

test('register: a failure inside the hook never blocks the tool', async ($, on) => {
  let isDown = false
  const w = await world($, on, { isStateDown: () => isDown })
  await w.start()
  await w.prompt('Doomed')
  // Every state write of the plugin throws from here: the call still answers the tool's result.
  isDown = true
  const ran = (await $.tool.call({ tool: 'TaskCreate', subject: 'x', description: 'x' } as never)) as { result?: { task?: { id?: string } }; isError?: boolean }
  expect(ran.result?.task?.id).toBe('1')
  expect(ran.isError).toBeUndefined()
  expect(w.calls).toEqual([{ tool: 'TaskCreate' }])
  expect(w.state('goal')).toBeUndefined()
})

test('register: task-list calls that run together all land, and the goal finishes once', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('Parallel work')
  const ids = await Promise.all([w.create('A'), w.create('B'), w.create('C'), w.create('D')])
  let goal = w.state('goal') as Goal
  expect(goal.name).toBe('Parallel work')
  expect(goal.tasks.map(t => t.id).sort()).toEqual([...ids].sort())
  await w.set(ids[0]!, 'in_progress')
  await Promise.all([w.set(ids[0]!, 'completed'), w.set(ids[1]!, 'in_progress')])
  goal = w.state('goal') as Goal
  expect(goal.tasks.find(t => t.id === ids[0])?.status).toBe('completed')
  expect(goal.tasks.find(t => t.id === ids[1])?.status).toBe('in_progress')
  await Promise.all([w.set(ids[1]!, 'completed'), w.set(ids[2]!, 'completed'), w.set(ids[3]!, 'completed')])
  expect((w.state('goal') as Goal).doneAt).toBe(T0)
  expect(w.toasts).toEqual(['Goal done in 0m, 4 tasks'])
  expect((w.store.get('goal-meter.history') as GoalRecord[]).map(r => r.name)).toEqual(['Parallel work'])
})

test('register: a refused TaskUpdate (success false) changes nothing', async ($, on) => {
  const w = await world($, on, { refused: new Set(['2']) })
  await w.start()
  await w.prompt('Guarded')
  const a = await w.create('A')
  const b = await w.create('B')
  await w.set(a, 'completed')
  await w.set(b, 'completed')
  const goal = w.state('goal') as Goal
  expect(goal.tasks.find(t => t.id === b)?.status).toBe('pending')
  expect(goal.doneAt).toBeUndefined()
  expect(w.toasts).toEqual([])
  expect(w.store.get('goal-meter.history')).toBeUndefined()
})

test('register: a goal finished in another session stays in the stored history', async ($, on) => {
  const w = await world($, on)
  await w.start()
  // Another tab, started before this goal finished, writes its own finished goal.
  const theirs: GoalRecord = { name: 'Other tab', startedAt: T0 - MIN, doneAt: T0, total: 1, done: 1 }
  w.store.set('goal-meter.history', [theirs])
  await w.prompt('This tab')
  await finishTwo(w)
  expect((w.store.get('goal-meter.history') as GoalRecord[]).map(r => r.name)).toEqual(['This tab', 'Other tab'])
  expect((w.state('history') as GoalRecord[]).map(r => r.name)).toEqual(['This tab', 'Other tab'])
})

test('register: /goals on|off|clear still act when the store cannot be written, and say so', async ($, on) => {
  let isDown = false
  const w = await world($, on, { isStoreDown: () => isDown })
  await w.start()
  await w.prompt('Ship it')
  await finishTwo(w)
  isDown = true
  expect(await w.command('off')).toBe('GOAL line off (no row, no toast; /goals still opens the pane). (not saved for the next session)')
  expect(w.state('band')).toBe('off')
  expect(await lineRuns($)).toEqual([])
  expect(await w.command('clear')).toBe('Goal and history cleared. (not saved for the next session)')
  expect(w.state('goal')).toBeNull()
  expect(w.state('history')).toEqual([])
  isDown = false
  expect(await w.command('on')).toBe('GOAL line on.')
})
