import { expect, test } from 'claude-code/testing'

import { LINE_MAX, labelOf, lastLineOf, notesOf, outputFileOf, textOfContent, wordsOf } from './shells'

test('shells: a plain command is `sh`, its task the command with whitespace folded', () => {
  expect(labelOf('pytest -q   tests/')).toEqual({ task: 'pytest -q tests/' })
  expect(labelOf('sleep 90')).toEqual({ task: 'sleep 90' })
})

test('shells: codex exec and a bare codex prompt are codex, with the model -m or -c model= names', () => {
  expect(labelOf('codex exec -m gpt-5.4 "review the diff"')).toEqual({ label: 'codex', model: 'gpt-5.4', task: 'review the diff' })
  expect(labelOf("codex 'fix the bug'")).toEqual({ label: 'codex', task: 'fix the bug' })
  expect(labelOf("codex --model o3 exec --full-auto 'write tests' 2>&1 | tee codex.log")).toEqual({ label: 'codex', model: 'o3', task: 'write tests' })
  expect(labelOf('cd repo && codex exec -c model="gpt-5.4" --skip-git-repo-check "audit the hooks"')).toEqual({
    label: 'codex',
    model: 'gpt-5.4',
    task: 'audit the hooks',
  })
  expect(labelOf('FOO=1 timeout 600 /opt/homebrew/bin/codex review "the branch"')).toEqual({ label: 'codex', task: 'the branch' })
  // A prompt from stdin: the task is the command itself.
  expect(labelOf('codex exec - < prompt.md > out.log')).toEqual({ label: 'codex', task: 'codex exec - < prompt.md > out.log' })
})

test('shells: an agent fed by a pipe is that agent, the command its task when it names no prompt', () => {
  expect(labelOf('git diff | codex exec "review the diff"')).toEqual({ label: 'codex', task: 'review the diff' })
  expect(labelOf('cat p.md | claude -p --model sonnet')).toEqual({ label: 'claude', model: 'sonnet', task: 'cat p.md | claude -p --model sonnet' })
  expect(labelOf('git diff | grep codex').label).toBeUndefined()
})

test('shells: codex exec resume takes the prompt after the session id, or after --last', () => {
  expect(labelOf('codex exec resume --last "follow up"')).toEqual({ label: 'codex', task: 'follow up' })
  expect(labelOf('codex exec resume abc123 "next step"')).toEqual({ label: 'codex', task: 'next step' })
  expect(labelOf('codex exec resume abc123')).toEqual({ label: 'codex', task: 'codex exec resume abc123' })
})

test('shells: codex subcommands that run no prompt stay plain shells', () => {
  expect(labelOf('codex login').label).toBeUndefined()
  expect(labelOf('codex mcp list').label).toBeUndefined()
  expect(labelOf('codex --version').label).toBeUndefined()
})

test('shells: opencode run and claude -p are their agents; claude without -p is a shell', () => {
  expect(labelOf('opencode run -m anthropic/claude-sonnet-4 fix the lint')).toEqual({
    label: 'opencode',
    model: 'anthropic/claude-sonnet-4',
    task: 'fix the lint',
  })
  expect(labelOf('claude -p "summarize the log" --model sonnet --output-format json')).toEqual({
    label: 'claude',
    model: 'sonnet',
    task: 'summarize the log',
  })
  expect(labelOf('claude --version').label).toBeUndefined()
  expect(labelOf('opencode serve').label).toBeUndefined()
})

test('shells: the lexer honours quotes and keeps redirections out of the operators', () => {
  expect(wordsOf(`a "b c" 'd e' f\\ g 2>&1 && h`)).toEqual(['a', 'b c', 'd e', 'f g', '2>&1', '&&', 'h'])
})

test('shells: a notification row names its task, status, exit code and output file', () => {
  const text = [
    '<task-notification>',
    '<task-id>bloibhmw4</task-id>',
    '<tool-use-id>toolu_01Shk</tool-use-id>',
    '<output-file>/private/tmp/claude-501/x/tasks/bloibhmw4.output</output-file>',
    '<status>failed</status>',
    '<summary>Background command "Watch the log" failed with exit code 1</summary>',
    '</task-notification>',
  ].join('\n')
  expect(notesOf(text)).toEqual([
    { id: 'bloibhmw4', status: 'failed', toolUseId: 'toolu_01Shk', outputFile: '/private/tmp/claude-501/x/tasks/bloibhmw4.output', exitCode: 1 },
  ])
  expect(notesOf('<task-notification><task-id>b2</task-id><status>killed</status></task-notification>')).toEqual([{ id: 'b2', status: 'killed' }])
  expect(notesOf('no notification here')).toEqual([])
  expect(textOfContent([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n\nb')
})

test('shells: the output file comes from the Bash result text', () => {
  expect(
    outputFileOf('Command running in background with ID: b1. Output is being written to: /private/tmp/claude-501/x/tasks/b1.output. You will be notified when it completes.'),
  ).toBe('/private/tmp/claude-501/x/tasks/b1.output')
  expect(outputFileOf('ok')).toBeUndefined()
  expect(outputFileOf(undefined)).toBeUndefined()
})

test('shells: the last output line skips blank lines, strips colour and keeps the last \\r rewrite', () => {
  expect(lastLineOf('collecting\n\x1b[32m12 passed\x1b[0m in 0.4s\n\n')).toBe('12 passed in 0.4s')
  expect(lastLineOf('downloading 10%\rdownloading 55%\r')).toBe('downloading 55%')
  expect(lastLineOf('\n  \n')).toBeUndefined()
  // One long line (a minified dump) is clipped, not kept whole.
  const line = lastLineOf('{"a":1}'.repeat(100_000))
  expect(line?.length).toBe(LINE_MAX)
  expect(line?.endsWith('…')).toBe(true)
})
