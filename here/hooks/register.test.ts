import { expect, test } from 'claude-code/testing'

import { T0, world } from './test-kit'

test('register: a main-loop tool call is now, from the moment it starts; a subagent\'s is not', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.tool({ tool: 'Edit', file_path: '/repo/agents/hooks/kit.ts', old_string: 'a', new_string: 'b' })
  expect(w.state('now')).toEqual({ text: 'Editing agents/hooks/kit.ts', at: T0 })
  await w.tool({ tool: 'Bash', command: 'pytest -q' }, 'a1')
  expect((w.state('now') as { text: string }).text).toBe('Editing agents/hooks/kit.ts')
  await w.tool({ tool: 'Bash', command: 'cd /repo && pytest -q' })
  expect((w.state('now') as { text: string }).text).toBe('Running pytest')
})

test('register: the spinner word stands in for now until the first tool call, and leaves with a turn that called none', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const nowLine = async () => (await w.command('')).split('\n')[1]
  // No turn running: the spinner word is not shown.
  await w.spin('Sauteing')
  expect(await nowLine()).toBe('now   -')
  await w.turnStart()
  expect(w.state('now')).toBeNull()
  await w.spin('Sauteing')
  expect(await nowLine()).toBe('now   Sauteing')
  await w.tool({ tool: 'Read', file_path: '/repo/README.md' })
  await w.spin('Brewing')
  expect(await nowLine()).toBe('now   Reading README.md')
  await w.turnEnd('Done.')
  expect(await nowLine()).toBe('now   Reading README.md')
  // A turn that only thought: its spinner word goes with it.
  await w.turnStart()
  // The last turn's word went with it; this turn's comes when the spinner draws.
  expect(await nowLine()).toBe('now   -')
  await w.spin('Pondering')
  expect(await nowLine()).toBe('now   Pondering')
  await w.turnEnd('Here is the answer.')
  expect(await nowLine()).toBe('now   -')
  // A subagent's turn neither starts nor ends the main loop's.
  await w.turnStart()
  await w.spin('Musing')
  await w.turnEnd('sub', 'a1')
  expect(await nowLine()).toBe('now   Musing')
})

test('register: you is the last answer\'s question lines, dropped when the next prompt is sent', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Built it.\nShould I ship it?\nSay go to merge.')
  expect(w.state('you')).toEqual(['Should I ship it?', 'Say go to merge.'])
  // A subagent's answer changes nothing.
  await w.turnEnd('Any more?', 'a1')
  expect(w.state('you')).toEqual(['Should I ship it?', 'Say go to merge.'])
  // A slash command's line is not an answer to them.
  await w.submit('/here', { name: 'here', args: '' })
  expect(w.state('you')).toEqual(['Should I ship it?', 'Say go to merge.'])
  await w.submit('go')
  expect(w.state('you')).toEqual([])
})

test('register: /here prints the three parts; goal is goal-meter\'s open goal', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setGoal({ name: 'Build the mods', tasks: [{ title: 'Row', status: 'in_progress' }] })
  await w.turnStart()
  await w.tool({ tool: 'Write', file_path: '/repo/here/hooks/row.tsx', content: 'x' })
  await w.turnEnd('Which colour?\n1. orange')
  expect(await w.command('')).toBe(['goal  Build the mods', 'now   Writing here/hooks/row.tsx', 'you   Which colour?'].join('\n'))
  w.setGoal({ name: 'Build the mods', tasks: [{ title: 'Row', status: 'completed' }], doneAt: T0 })
  expect((await w.command('')).split('\n')[0]).toBe('goal  -')
  w.setGoal(undefined)
  expect((await w.command('')).split('\n')[0]).toBe('goal  -')
})

test('register: /here off hides the row; the store keeps it, and it wins at the next start', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('off')).toBe('HERE row off (/here still prints the three parts).')
  expect(w.store.get('here.band')).toBe('off')
  expect((await w.command('')).split('\n').at(-1)).toBe('(the HERE row is off: /here on)')
  await w.start()
  expect(w.state('band')).toBe('off')
  expect(await w.command('ON')).toBe('HERE row on.')
  expect(w.store.get('here.band')).toBe('on')
  expect(await w.command('status')).toBe('Usage: /here [on | off]')
})

test('register: /here on|off still acts when the store cannot be written, and says so', async ($, on) => {
  const w = await world($, on, { isStoreDown: () => true })
  await w.start()
  expect(await w.command('off')).toBe('HERE row off (/here still prints the three parts). (not saved for the next session)')
  expect(w.state('band')).toBe('off')
})

test('register: a /clear forgets now, you and the rewrite', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.tool({ tool: 'Read', file_path: '/repo/a.ts' })
  await w.turnEnd('Ready?')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  expect(w.state('now')).toBeNull()
  expect(w.state('you')).toEqual([])
})

test('register: a failure inside the hooks never blocks the tool or the prompt', async ($, on) => {
  let isDown = false
  const w = await world($, on, { isStateDown: () => isDown })
  await w.start()
  await w.turnStart()
  isDown = true
  const ran = (await $.tool.call({ tool: 'Read', tool_use_id: 'x', file_path: '/repo/a.ts' } as never)) as { result?: unknown; isError?: boolean }
  expect(ran.result).toBe('ok')
  expect(ran.isError).toBeUndefined()
  const sent = (await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as never)) as { text?: string }
  expect(sent.text).toBe('hello')
})

test('register: rewrite=off (default) never calls a model', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Ship it?')
  await w.settle()
  expect(w.calls).toEqual([])
  expect(w.state('rewrite') ?? null).toBeNull()
})

test('register: rewrite=haiku makes one Haiku call per main-loop answer, from a timer, and the row and /here use it', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setGoal({ name: 'Build the mods', tasks: [{ title: 'Row', status: 'in_progress' }] })
  await w.turnStart()
  await w.tool({ tool: 'Bash', command: 'pytest' })
  await w.turnEnd('Tests pass. Merge now?')
  // Nothing inside the hook: the call starts on the timer.
  expect(w.calls).toHaveLength(0)
  await w.settle()
  expect(w.calls).toHaveLength(1)
  const req = w.calls[0]!
  expect(req.model).toBe('haiku')
  expect(req.prompt).toContain('Tests pass. Merge now?')
  expect(req.prompt).toContain('- [in_progress] Row')
  expect(req.prompt).toContain('now: Running pytest')
  expect(w.state('rewrite')).toEqual({ goal: 'Ship HERE', now: 'Writing tests', you: 'Merge now?', turnId: 't1' })
  expect(await w.command('')).toBe(['goal  Ship HERE', 'now   Writing tests', 'you   Merge now?', '(rewritten by Haiku from the last reply)'].join('\n'))
  // A subagent's answer makes no call; the next prompt drops the rewrite.
  await w.turnEnd('sub done', 'a1')
  await w.settle()
  expect(w.calls).toHaveLength(1)
  await w.submit('yes')
  expect(w.state('rewrite')).toBeNull()
})

test('register: no rewrite call once the next prompt is sent; a failed one leaves the plain parts', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Merge now?')
  // The person answers before the timer fires: no call is made.
  await w.submit('yes')
  await w.settle()
  expect(w.calls).toHaveLength(0)
  expect(w.state('rewrite')).toBeNull()
  w.setAnswer(() => ({ fail: true }))
  await w.turnStart()
  await w.turnEnd('Again?')
  await w.settle()
  expect(w.state('rewrite')).toBeNull()
  expect(await w.command('')).toBe(['goal  -', 'now   -', 'you   Again?'].join('\n'))
})

test('register: rewrite=haiku with the row off makes no call', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.command('off')
  await w.turnStart()
  await w.turnEnd('Merge now?')
  await w.settle()
  expect(w.calls).toEqual([])
})

test('register: the spinner hook hands the engine\'s tree on untouched; a desktop spinner\'s word is not taken', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  const desktop = await $.ui.mount({ plugin: 'here', surface: 'desktop', component: 'Spinner', props: { word: 'Creating notes.md', message: null, suffix: '…', mode: 'tool-use' } as never })
  expect((await desktop.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await desktop.unmount()
  expect((await w.command('')).split('\n')[1]).toBe('now   -')
  const term = await $.ui.mount({ plugin: 'here', surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } as never })
  expect((await term.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await term.unmount()
  expect((await w.command('')).split('\n')[1]).toBe('now   Sauteing')
})

test('register: a main-loop turn that starts with no prompt sent drops the last rewrite; the live tool call shows', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.turnStart()
  await w.turnEnd('Done. Merge now?')
  await w.settle()
  expect(w.state('rewrite')).toEqual({ goal: 'Ship HERE', now: 'Writing tests', you: 'Merge now?', turnId: 't1' })
  // A task notification starts the next turn: no prompt.submit before it.
  await w.turnStart()
  expect(w.state('rewrite')).toBeNull()
  await w.tool({ tool: 'Edit', file_path: '/repo/x.ts', old_string: 'a', new_string: 'b' })
  expect((await w.command('')).split('\n')[1]).toBe('now   Editing x.ts')
})

test('register: without goal-meter, goal is the first line of the prompt that started the open task list', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.submit('\nBuild the HERE row\nwith tests')
  await w.turnStart()
  // No list yet: no goal.
  expect((await w.command('')).split('\n')[0]).toBe('goal  -')
  await w.tool({ tool: 'TodoWrite', todos: [{ content: 'Row', status: 'in_progress' }, { content: 'Tests', status: 'pending' }] })
  expect((await w.command('')).split('\n')[0]).toBe('goal  Build the HERE row')
  // A later prompt does not rename the list it did not start; a subagent's list changes nothing.
  await w.submit('also the README')
  await w.tool({ tool: 'TodoWrite', todos: [{ content: 'Row', status: 'completed' }, { content: 'Tests', status: 'in_progress' }] })
  await w.tool({ tool: 'TodoWrite', todos: [{ content: 'Sub', status: 'completed' }] }, 'a1')
  expect((await w.command('')).split('\n')[0]).toBe('goal  Build the HERE row')
  // goal-meter's open goal wins over it.
  w.setGoal({ name: 'Build the mods', tasks: [{ title: 'Row', status: 'in_progress' }] })
  expect((await w.command('')).split('\n')[0]).toBe('goal  Build the mods')
  w.setGoal(undefined)
  // Every item done: no list, no goal.
  await w.tool({ tool: 'TodoWrite', todos: [{ content: 'Row', status: 'completed' }, { content: 'Tests', status: 'completed' }] })
  expect(w.state('goal')).toBeNull()
  expect((await w.command('')).split('\n')[0]).toBe('goal  -')
  // TaskCreate opens one under the last prompt; its last task completed closes it.
  await w.submit('Ship the next mod')
  await w.tool({ tool: 'TaskCreate', subject: 'Spec' })
  await w.tool({ tool: 'TaskCreate', subject: 'Code' })
  expect(w.state('goal')).toEqual({ text: 'Ship the next mod', todos: 0, tasks: ['1', '2'] })
  await w.tool({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  expect((await w.command('')).split('\n')[0]).toBe('goal  Ship the next mod')
  await w.tool({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
  expect(w.state('goal')).toBeNull()
})

test('register: control characters never reach the state, the row or /here', { options: { rewrite: 'haiku' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.setAnswer(() => ({ text: '{"goal":"","now":"Edit\\u001b[2Jing","you":""}' }))
  await w.turnStart()
  await w.tool({ tool: 'Read', file_path: '/repo/a\u0007b.ts' })
  expect((w.state('now') as { text: string }).text).toBe('Reading a b.ts')
  await w.turnEnd('Ring \u0007 the bell?')
  expect(w.state('you')).toEqual(['Ring the bell?'])
  await w.settle()
  expect((w.state('rewrite') as { now: string }).now).toBe('Edit [2Jing')
  const shown = await w.command('')
  expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(shown)).toBe(false)
  expect(shown.split('\n')[1]).toBe('now   Edit [2Jing')
})
