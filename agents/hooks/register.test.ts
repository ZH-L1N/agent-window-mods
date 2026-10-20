import { expect, test } from 'claude-code/testing'

import { T0, outputFileFor, usage, world } from './test-kit'

test('register: an Agent call and its spawn make one running run', async ($, on) => {
  let toolUseId = ''
  on('tool.call', async (_$, e) => {
    toolUseId = String((e as { tool_use_id?: string }).tool_use_id)
    return { result: 'ok' } as never
  })
  const w = await world($, on)
  await $.tool.call({ tool: 'Agent', description: 'find the hooks', prompt: 'go', subagent_type: 'Explore', model: 'haiku', effort: 'low' } as never)
  expect(toolUseId).not.toBe('')
  await w.spawn('find the hooks', 'Explore', 'haiku', toolUseId)
  const [run, ...rest] = await w.runs()
  expect(rest).toHaveLength(0)
  expect(run).toMatchObject({
    id: 'a1',
    agentId: 'a1',
    type: 'Explore',
    description: 'find the hooks',
    model: 'claude-haiku-5-5',
    effort: 'low',
    status: 'running',
    startedAt: T0,
    steps: 0,
    tokens: 0,
    contextMax: 1_000_000,
  })
})

test('register: each step adds tokens, context and cost; the end finishes the run', async ($, on) => {
  const w = await world($, on)
  await w.spawn('scout the parser', 'Explore', 'haiku')
  await w.clock.advance(2_000)
  // Haiku 5.5: (10000 * 0.1 + 2000 * 0.5 + 26000 * 0.01) / 1e6 = $0.00226.
  await w.step('a1', usage('claude-haiku-5-5', 10_000, 2_000, 26_000), 1)
  let [run] = await w.runs()
  expect(run).toMatchObject({ steps: 1, tokens: 38_000, contextTokens: 38_000, awaitingSince: T0 + 2_000, stepStartedAt: T0 + 2_000 })
  expect(Math.abs((run?.costUsd ?? 0) - 0.00226)).toBeLessThan(1e-9)

  // The next step clears the wait and closes a step cycle of 3 s.
  await w.clock.advance(3_000)
  await w.step('a1', usage('claude-haiku-5-5', 1_000, 500, 38_000), 0)
  ;[run] = await w.runs()
  expect(run).toMatchObject({ steps: 2, tokens: 77_500, contextTokens: 39_500, stepCycles: 1, stepMsTotal: 3_000 })
  expect(run?.awaitingSince).toBeUndefined()

  await w.clock.advance(1_000)
  await w.finish('a1')
  ;[run] = await w.runs()
  expect(run).toMatchObject({ status: 'finished', endedAt: T0 + 6_000, steps: 2 })
})

test('register: an error or an interrupt ends the run as error', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  await w.spawn('two')
  await w.finish('a1', 'error')
  await w.finish('a2', 'aborted')
  expect((await w.runs()).map(a => a.status)).toEqual(['error', 'error'])
})

test('register: a run whose steps went unseen takes the turn usage; an unknown model is unpriced', async ($, on) => {
  const w = await world($, on)
  await w.spawn('quiet one')
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1_000,
    isAborted: false,
    turnId: 't-a1',
    agentId: 'a1',
    reason: 'answer',
    usage: usage('claude-opus-5-5', 10_000, 2_000, 26_000),
  } as never)
  let [run] = await w.runs()
  // Opus 5.5: (10000 * 4 + 2000 * 20 + 26000 * 0.2) / 1e6 = $0.0852.
  expect(run?.tokens).toBe(38_000)
  expect(Math.abs((run?.costUsd ?? 0) - 0.0852)).toBeLessThan(1e-9)
  expect(run?.isUnpriced).toBeUndefined()

  await w.spawn('mystery')
  await w.step('a2', usage('claude-mystery-9', 1_000, 1_000))
  ;[, run] = await w.runs()
  expect(run?.isUnpriced).toBe(true)
  expect(run?.costUsd).toBe(0)
})

test('register: skills are counted once per expansion while a batch is live, never with no band up', async ($, on) => {
  const w = await world($, on)
  await w.skill('commit')
  expect(w.state('skills')).toBeUndefined()
  await w.spawn('one')
  await w.skill('plugin-authoring')
  await w.skill('plugin-authoring')
  await w.skill('claude-api')
  expect(w.state('skills')).toEqual({ 'plugin-authoring': 2, 'claude-api': 1 })
})

test('register: the main loop is running between its turn start and end', async ($, on) => {
  const w = await world($, on)
  await w.mainTurn(true)
  expect(w.state('main')).toMatchObject({ model: 'claude-fable-5-1', isRunning: true })
  await w.mainTurn(false)
  expect(w.state('main')).toMatchObject({ isRunning: false })
})

test('register: the tick runs while a run runs and the band lingers, then stops and clears the skills', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('scout')
  await w.skill('plugin-authoring')
  await w.clock.advance(3_000)
  expect(w.nowWrites.length).toBeGreaterThan(2)
  await w.finish('a1')
  await w.clock.advance(13_000)
  const writes = w.nowWrites.length
  await w.clock.advance(5_000)
  expect(w.nowWrites).toHaveLength(writes)
  expect(w.state('skills')).toEqual({})
})

test('register: /agents-info toggles the pane and `open` opens it', async ($, on) => {
  const w = await world($, on, true)
  const text = (r: unknown) => (r as { text?: string }).text
  expect(text(await $.command.run({ command: 'agents-info', args: '' } as never))).toBe('Agents pane opened.')
  expect(text(await $.command.run({ command: 'agents-info', args: 'open' } as never))).toBe('Agents pane opened.')
  expect(w.opened).toEqual(['agents', 'agents'])
})

test('register: a spawn with no agentId (a remote agent) keeps no run, so nothing runs for good', async ($, on) => {
  const w = await world($, on, true, {}, { isSpawnUnlinked: true })
  const started = (await w.spawn('remote one', 'Explore', 'haiku', 'tu-shared')) as { agentId?: string; model?: string }
  expect(started.agentId).toBeUndefined()
  expect(started.model).toBe('claude-haiku-5-5')
  await w.spawn('remote two', 'Explore', 'haiku', 'tu-shared')
  expect(await w.runs()).toEqual([])
  // The tick stays idle: no `now` writes once the session has started.
  const writes = w.nowWrites.length
  await w.clock.advance(3_000)
  expect(w.nowWrites).toHaveLength(writes)
})

test('register: a bookkeeping failure never blocks a spawn or an Agent call', async ($, on) => {
  let calls = 0
  on('tool.call', async () => {
    calls++
    return { result: 'ok' } as never
  })
  const w = await world($, on, false, {}, { isStateDown: true })
  await $.tool.call({ tool: 'Agent', description: 'find the hooks', prompt: 'go', subagent_type: 'Explore' } as never)
  expect(calls).toBe(1)
  const started = (await w.spawn('find the hooks', 'Explore', 'haiku')) as { agentId?: string }
  expect(started.agentId).toBe('a1')
})

test('register: a background Bash call starts a shell run; its notification ends it ✓ and toasts once', async ($, on) => {
  const w = await world($, on)
  await w.bash('pytest -q tests/')
  const [run, ...rest] = await w.runs()
  expect(rest).toHaveLength(0)
  expect(run).toMatchObject({
    id: 'sh-b1',
    kind: 'shell',
    taskId: 'b1',
    type: 'sh',
    command: 'pytest -q tests/',
    description: 'pytest -q tests/',
    model: '',
    outputFile: outputFileFor('b1'),
    status: 'running',
    startedAt: T0,
  })
  await w.clock.advance(42_000)
  await w.notify('b1', { status: 'completed', door: 'queue' })
  await w.notify('b1', { status: 'completed' })
  expect(await w.runs()).toMatchObject([{ status: 'finished', endedAt: T0 + 42_000 }])
  expect(w.toasts).toEqual(['✓ sh "pytest -q tests/" finished in 0:42'])
})

test('register: a failed shell toasts its exit code, a killed one says so', async ($, on) => {
  const w = await world($, on)
  await w.bash('pytest -q tests/', 'b1')
  await w.bash('sleep 90', 'b2')
  await w.clock.advance(42_000)
  await w.notify('b1', { status: 'failed', exitCode: 1 })
  await w.notify('b2', { status: 'killed' })
  expect((await w.runs()).map(a => [a.status, a.endWord, a.exitCode])).toEqual([
    ['error', 'failed', 1],
    ['error', 'killed', undefined],
  ])
  expect(w.toasts).toEqual(['✗ sh "pytest -q tests/" exit 1 after 0:42', '✗ sh "sleep 90" killed after 0:42'])
})

test('register: a codex command is labelled with its agent and model', async ($, on) => {
  const w = await world($, on)
  await w.bash('codex exec -m gpt-5.4 "review the diff"', 'b7')
  expect(await w.runs()).toMatchObject([{ id: 'sh-b7', type: 'codex', label: 'codex', model: 'gpt-5.4', description: 'review the diff' }])
  await w.clock.advance(130_000)
  await w.notify('b7', { status: 'completed' })
  expect(w.toasts).toEqual(['✓ codex gpt-5.4 "review the diff" finished in 2:10'])
})

test('register: a foreground Bash call and a notification for no known shell keep nothing', async ($, on) => {
  const w = await world($, on)
  await w.bash('ls', 'b1', { isForeground: true })
  await w.notify('b9', { status: 'completed' })
  expect(await w.runs()).toEqual([])
  expect(w.toasts).toEqual([])
})

test('register: a subagent that finishes toasts once; the main loop never does', async ($, on) => {
  const w = await world($, on)
  await w.mainTurn(true)
  await w.spawn('survey the mods', 'Explore', 'haiku')
  await w.spawn('rewrite the parser', 'general-purpose', 'opus')
  await w.clock.advance(31_000)
  await w.finish('a1')
  await w.finish('a2', 'error')
  await w.mainTurn(false)
  expect(w.toasts).toEqual(['✓ Explore "survey the mods" finished in 0:31', '✗ general-purpose "rewrite the parser" failed after 0:31'])
})

test('register: toasts=off raises none', { options: { toasts: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  await w.bash('sleep 1')
  await w.finish('a1')
  await w.notify('b1', { status: 'completed' })
  expect((await w.runs()).map(a => a.status)).toEqual(['finished', 'finished'])
  expect(w.toasts).toEqual([])
})

test('register: a shell that ends with its subagent ends when the subagent does', async ($, on) => {
  const w = await world($, on)
  await w.spawn('one')
  await w.bash('sleep 90', 'b3', { agentId: 'a1', endsWithParent: true })
  expect((await w.runs()).find(a => a.id === 'sh-b3')).toMatchObject({ parentAgentId: 'a1', endsWithParent: true, status: 'running' })
  await w.finish('a1')
  expect((await w.runs()).find(a => a.id === 'sh-b3')).toMatchObject({ status: 'error', endWord: 'killed' })
})

test('register: while the pane is open the tick reads each shell its last output line', async ($, on) => {
  const w = await world($, on, true, {}, { isPaneOpen: true })
  await w.bash('pytest -q tests/')
  w.files.set(outputFileFor('b1'), 'collecting\n\x1b[32m3 passed\x1b[0m\n')
  await w.clock.advance(1_000)
  expect(w.state('tails')).toEqual({ 'sh-b1': '3 passed' })
  w.files.set(outputFileFor('b1'), 'collecting\n3 passed\n12 passed in 0.4s\n')
  await w.clock.advance(1_000)
  expect(w.state('tails')).toEqual({ 'sh-b1': '12 passed in 0.4s' })
})

test('register: /agents-info open <n> is the numbered card twin, a stub until E3', async ($, on) => {
  const w = await world($, on, true)
  const text = (r: unknown) => (r as { text?: string }).text
  expect(text(await $.command.run({ command: 'agents-info', args: 'open 2' } as never))).toBe('Card 2: messages view comes with E3.')
  expect(w.opened).toEqual([])
})

test('register: a bookkeeping failure never blocks a Bash call or a notification', async ($, on) => {
  const w = await world($, on, false, {}, { isStateDown: true })
  const r = (await w.bash('sleep 90')) as { result?: { backgroundTaskId?: string } }
  expect(r.result?.backgroundTaskId).toBe('b1')
  await w.notify('b1', { status: 'completed' })
})

test('register: a notification that finds no running shell yet leaves its second row to end it', async ($, on) => {
  const w = await world($, on)
  await w.notify('b1', { status: 'completed', door: 'queue' })
  await w.bash('pytest -q tests/')
  await w.clock.advance(5_000)
  await w.notify('b1', { status: 'completed' })
  await w.notify('b1', { status: 'completed' })
  expect(await w.runs()).toMatchObject([{ status: 'finished' }])
  expect(w.toasts).toEqual(['✓ sh "pytest -q tests/" finished in 0:05'])
})

test('register: a long command and its task are clipped as recorded', async ($, on) => {
  const w = await world($, on)
  await w.bash(`python - <<'EOF'\n${'print(1)\n'.repeat(5_000)}EOF`)
  const [run] = await w.runs()
  expect(run?.command?.length).toBe(2_000)
  expect(run?.description.length).toBe(200)
})

test('register: opening the pane reads the last line of a shell that ended while it was closed', async ($, on) => {
  const w = await world($, on, true)
  await w.bash('pytest -q tests/')
  w.files.set(outputFileFor('b1'), 'collecting\n1 failed, 3 passed\n')
  await w.notify('b1', { status: 'failed', exitCode: 1 })
  await w.clock.advance(20_000)
  expect(w.state('tails')).toBeUndefined()
  await $.command.run({ command: 'agents-info', args: 'open' } as never)
  expect(w.state('tails')).toEqual({ 'sh-b1': '1 failed, 3 passed' })
})
