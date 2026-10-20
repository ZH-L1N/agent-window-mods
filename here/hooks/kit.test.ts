import { expect, test } from 'claude-code/testing'

import { cellsOf, cut, firstLineOf, goalOf, listGoalOf, nowOf, parseRewrite, partsOf, programOf, questionsOf, relPath, rewriteOf, summaryOf } from './kit'

test('kit: programOf names the program and its subcommand, past cd, env and sudo', () => {
  expect(programOf('pytest -q tests/')).toBe('pytest')
  expect(programOf('cd /repo && uv run pytest -x')).toBe('uv run pytest')
  expect(programOf('FOO=1 sudo git -C x status --short')).toBe('git status')
  expect(programOf('npm run build -- --watch')).toBe('npm run build')
  expect(programOf('python3 -I /tmp/x/build.py --fast')).toBe('python3 build.py')
  expect(programOf('python3 -m pytest -q')).toBe('python3 -m pytest')
  expect(programOf('/opt/homebrew/bin/rg foo | head')).toBe('rg')
  expect(programOf('ls')).toBe('ls')
  expect(programOf('')).toBe('')
})

test('kit: nowOf reads each tool as a verb and a path relative to the session', () => {
  const cwd = '/Users/z/mods'
  expect(nowOf('Edit', { file_path: '/Users/z/mods/agents/hooks/kit.ts' }, cwd)).toBe('Editing agents/hooks/kit.ts')
  expect(nowOf('Read', { file_path: '/Users/z/mods/README.md' }, cwd)).toBe('Reading README.md')
  expect(nowOf('Read', { file_path: '/etc/a/b/c/d.conf' }, cwd)).toBe('Reading …/b/c/d.conf')
  expect(nowOf('Write', { file_path: 'notes.md' }, cwd)).toBe('Writing notes.md')
  expect(nowOf('Bash', { command: 'pytest -q' }, cwd)).toBe('Running pytest')
  expect(nowOf('Grep', { pattern: 'stackRow' }, cwd)).toBe('Searching for "stackRow"')
  expect(nowOf('Glob', { pattern: '**/*.tsx' }, cwd)).toBe('Finding **/*.tsx')
  expect(nowOf('WebFetch', { url: 'https://docs.example.com/a?b=1' }, cwd)).toBe('Fetching docs.example.com')
  expect(nowOf('Agent', { description: 'Review the diff' }, cwd)).toBe('Delegating "Review the diff"')
  expect(nowOf('Skill', { skill: 'ship' }, cwd)).toBe('Using skill ship')
  expect(nowOf('TaskUpdate', { taskId: '1' }, cwd)).toBe('Updating the task list')
  expect(nowOf('mcp__kb__search', {}, cwd)).toBe('Calling kb search')
  expect(nowOf('Frobnicate', {}, cwd)).toBe('Using Frobnicate')
  expect(nowOf('', {}, cwd)).toBeNull()
})

test('kit: relPath keeps short absolute paths and the session root itself', () => {
  expect(relPath('/repo', '/repo')).toBe('.')
  expect(relPath('/tmp/x', '/repo')).toBe('/tmp/x')
  expect(relPath('src/a.ts', '')).toBe('src/a.ts')
})

test('kit: questionsOf keeps question lines, numbered items under a questions heading and say-go lines', () => {
  const reply = [
    'I built the row.',
    '',
    '```ts',
    'const ok = a ? b : c // is this a question?',
    '```',
    '',
    '**Should I also add the pane?**',
    '- Is the chip colour right?',
    'See https://example.com/x?y',
    '',
    'Open questions:',
    '1. Keep the 60-column cut',
    '2. Drop the dim labels',
    '',
    'Done for now.',
    '3. Not a question',
    'Say "go" and I will ship it.',
  ].join('\n')
  expect(questionsOf(reply)).toEqual([
    'Should I also add the pane?',
    'Is the chip colour right?',
    '1. Keep the 60-column cut',
    '2. Drop the dim labels',
    'Say "go" and I will ship it.',
  ])
  expect(questionsOf('All done.\nNothing to ask.')).toEqual([])
  expect(questionsOf('a?\nb?\nc?\nd?\ne?\nf?')).toHaveLength(5)
  expect(questionsOf('\u8981\u7ee7\u7eed\u5417\uff1f')).toEqual(['\u8981\u7ee7\u7eed\u5417\uff1f'])
})

test('kit: cut measures terminal columns, folds whitespace and marks the cut', () => {
  expect(cut('a  b\n c', 10)).toBe('a b c')
  expect(cut('abcdefghij', 5)).toBe('abcd…')
  const zh = cut('\u76ee\u6807\u8fdb\u5ea6\u6761\u6a21\u7ec4\u76ee\u6807\u8fdb\u5ea6\u6761', 9)
  expect(cellsOf(zh)).toBeLessThanOrEqual(9)
  expect(zh).toBe('\u76ee\u6807\u8fdb\u5ea6\u2026')
})

test('kit: goalOf reads goal-meter\'s goal only while its list is open', () => {
  expect(goalOf(null)).toBe('')
  expect(goalOf(undefined)).toBe('')
  expect(goalOf({ name: 'Ship it', tasks: [] })).toBe('')
  expect(goalOf({ name: 'Ship it', tasks: [{ title: 'a', status: 'pending' }] })).toBe('Ship it')
  expect(goalOf({ name: 'Ship it', tasks: [{ title: 'a', status: 'completed' }], doneAt: 1 })).toBe('')
  expect(goalOf({ junk: true } as never)).toBe('')
})

test('kit: rewriteOf holds the option to its listed values', () => {
  expect(rewriteOf('haiku')).toBe('haiku')
  expect(rewriteOf('off')).toBe('off')
  expect(rewriteOf('sonnet')).toBe('off')
  expect(rewriteOf(undefined)).toBe('off')
})

test('kit: parseRewrite takes the JSON object out of the reply and cuts each part', () => {
  expect(parseRewrite('Sure: {"goal": "Ship HERE", "now": "Testing", "you": "Merge?"} done')).toEqual({ goal: 'Ship HERE', now: 'Testing', you: 'Merge?' })
  expect(parseRewrite('{"goal": 3}')).toEqual({ goal: '', now: '', you: '' })
  expect(parseRewrite('no json')).toBeNull()
  expect(parseRewrite('{broken')).toBeNull()
  expect([...(parseRewrite(`{"you": "${'x'.repeat(100)}"}`)?.you ?? '')]).toHaveLength(60)
})

test('kit: partsOf prefers what the rewrite said and summaryOf prints the three lines', () => {
  const plain = partsOf('Goal', 'Editing a.ts', ['Q1?', 'Q2?'], null)
  expect(summaryOf(plain, true)).toBe(['goal  Goal', 'now   Editing a.ts', 'you   Q1?', '      Q2?'].join('\n'))
  const rw = partsOf('Goal', 'Editing a.ts', ['Q1?'], { goal: '', now: 'Writing the row', you: '' })
  expect(rw).toEqual({ goal: 'Goal', now: 'Writing the row', you: ['Q1?'], isRewritten: true })
  expect(summaryOf(partsOf('', '', [], null), false)).toBe(['goal  -', 'now   -', 'you   -', '(the HERE row is off: /here on)'].join('\n'))
})

test('kit: cut, nowOf, questionsOf and parseRewrite drop control characters', () => {
  expect(cut('a\u001b[31mb\u0007c\u009bd', 40)).toBe('a [31mb c d')
  expect(nowOf('Skill', { skill: 'x\u001by' }, '/r')).toBe('Using skill x y')
  expect(nowOf('mcp__a\u0008__b', {}, '/r')).toBe('Calling a b')
  expect(questionsOf('Go \u0007 now?')).toEqual(['Go now?'])
  expect(parseRewrite('{"you":"\\u001b[2Jhi"}')?.you).toBe('[2Jhi')
  expect(goalOf({ name: 'G\u001bx', tasks: [{ title: 't', status: 'pending' }] } as never)).toBe('G x')
})

test('kit: listGoalOf keeps the first prompt of the open list until every item is done', () => {
  expect(firstLineOf('\n  Build it \nmore')).toBe('Build it')
  const open = listGoalOf(null, 'TodoWrite', { todos: [{ content: 'a', status: 'pending' }] }, 'ok', 'P1')
  expect(open).toEqual({ text: 'P1', todos: 1, tasks: [] })
  const more = listGoalOf(open, 'TaskCreate', { subject: 's' }, { task: { id: 7 } }, 'P2')
  expect(more).toEqual({ text: 'P1', todos: 1, tasks: ['7'] })
  expect(listGoalOf(more, 'TaskUpdate', { taskId: '7', status: 'completed' }, { success: false }, 'P2')).toBe(more)
  const tasksDone = listGoalOf(more, 'TaskUpdate', { taskId: '7', status: 'completed' }, { success: true }, 'P2')
  expect(tasksDone).toEqual({ text: 'P1', todos: 1, tasks: [] })
  expect(listGoalOf(tasksDone, 'TodoWrite', { todos: [{ content: 'a', status: 'completed' }] }, 'ok', 'P2')).toBeNull()
  expect(listGoalOf(null, 'Read', {}, 'ok', 'P')).toBeNull()
  expect(listGoalOf(null, 'TodoWrite', { todos: 'x' }, 'ok', 'P')).toBeNull()
})
