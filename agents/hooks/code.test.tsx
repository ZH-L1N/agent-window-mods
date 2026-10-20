// Section 3 of plan 2026-10-20-boards-codemap-recap: the agents pane's Code
// view. The files the tools touch, `git diff --numstat` read back (faked:
// nothing runs), the node map, the tree list, the keys and their twins.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { CodeTouch } from '../types'
import { STATE_COLOR } from './code'
import { ARROW, NODE_W, SUMMARY_MAX, addTouch, bashTouches, editSummary, namesOf, nodesPerRow, parseNumstat, resolvePath, scopeOf, toolTouches } from './codemap'
import { PLUGIN, paneProps, world } from './test-kit'

const mountPane = ($: Engine, cols = 100, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agents', props: paneProps(cols) })
const run = ($: Engine, args: string) => $.command.run({ command: 'agents-info', args } as never) as Promise<{ text?: string }>

const KIT = '/repo/agents/hooks/kit.ts'
const BAND = '/repo/agents/hooks/band.tsx'
const README = '/repo/README.md'

/** A started world in turn 1 where the main loop read README, edited kit.ts and band.tsx (git says +12 −3 and +2 −2). */
async function edits($: Engine, on: On, options: { isStarted?: boolean } = {}) {
  const w = await world($, on, options.isStarted ?? true)
  await w.mainTurn(true)
  w.numstat.set(KIT, `12\t3\t${KIT}\n`)
  w.numstat.set(BAND, `2\t2\t${BAND}\n`)
  await w.tool('Read', { file_path: 'README.md' })
  await w.tool('Read', { file_path: KIT })
  await w.tool('Edit', { file_path: KIT, old_string: 'const a = 1\nconst b = 2', new_string: 'const a = 1\nexport const pruneEnded = 2' })
  await w.clock.advance(1_000)
  await w.tool('Edit', { file_path: BAND, old_string: "' AGENTS '", new_string: "' ◎ AGENTS  '" })
  await w.clock.advance(10)
  return w
}

test('code: helpers read Bash paths, summaries, numstat, names and the row width', () => {
  const touched = bashTouches(
    "cat README.md docs/a.md && sed -i '' 's/a/b/' hooks/kit.ts; echo x >> notes.txt 2>/dev/null; git add hooks/band.tsx; git checkout -- old.ts; cp a.ts b.ts; mv c.ts /tmp/d.ts",
    '/repo',
  )
  expect(touched.map(t => [t.path, t.isEdit, t.tool])).toEqual([
    ['/repo/notes.txt', true, 'Bash'],
    ['/repo/README.md', false, 'Bash'],
    ['/repo/docs/a.md', false, 'Bash'],
    ['/repo/hooks/kit.ts', true, 'Bash'],
    ['/repo/hooks/band.tsx', false, 'git add'],
    ['/repo/old.ts', true, 'git checkout'],
    ['/repo/a.ts', false, 'Bash'],
    ['/repo/b.ts', true, 'Bash'],
    ['/tmp/d.ts', true, 'Bash'],
  ])
  expect(bashTouches('pytest -q tests/ 2>&1 | tail -5', '/repo')).toEqual([])
  expect(bashTouches('cat *.md > /dev/null', '/repo')).toEqual([])
  expect(resolvePath('../x/./y.ts', '/repo/a')).toBe('/repo/x/y.ts')
  expect(editSummary('a\nb', 'a\n  pruneEnded, keepEndedOf\nb')).toBe('pruneEnded, keepEndedOf')
  expect(toolTouches('Write', { file_path: 'new.md', content: '\n# Title\nbody' }, '/repo')).toEqual([
    { path: '/repo/new.md', isEdit: true, tool: 'Write', summary: '# Title' },
  ])
  expect(toolTouches('Grep', { pattern: 'x', path: 'hooks' }, '/repo')).toEqual([{ path: '/repo/hooks', isEdit: false, tool: 'Grep' }])
  expect(toolTouches('Glob', { pattern: '**/*.ts' }, '/repo')).toEqual([])
  expect(parseNumstat('12\t3\ta.ts\n-\t-\tlogo.png\n')).toEqual({ plus: 12, minus: 3 })
  expect(parseNumstat('')).toBeUndefined()
  expect([nodesPerRow(59), nodesPerRow(72), nodesPerRow(100)]).toEqual([2, 3, 4])
  expect([...namesOf(['/r/a/kit.ts', '/r/b/kit.ts', '/r/a/x.ts']).values()]).toEqual(['a/kit.ts', 'b/kit.ts', 'x.ts'])
})

test('code: the scopes: this turn, the turn before while this one is empty, and the session merged with turn tags', () => {
  let list: CodeTouch[] = []
  const touch = (path: string, turn: number, at: number, isEdit = true) =>
    (list = addTouch(list, { path, isEdit, tool: isEdit ? 'Edit' : 'Read', turn, at, by: 'main' }))
  touch('/r/a.ts', 1, 1)
  touch('/r/b.ts', 1, 2, false)
  touch('/r/a.ts', 2, 3)
  touch('/r/c.ts', 2, 4)
  expect(scopeOf(list, 2, 'turn').files.map(f => f.path)).toEqual(['/r/a.ts', '/r/c.ts'])
  expect(scopeOf(list, 3, 'turn')).toMatchObject({ turn: 2, isPrevious: true })
  const session = scopeOf(list, 3, 'session')
  expect(session.files.map(f => [f.path, f.turns])).toEqual([
    ['/r/a.ts', [1, 2]],
    ['/r/c.ts', [2]],
    ['/r/b.ts', [1]],
  ])
})

test('code: an Edit records the file, its summary and the numstat git gives in its folder; a Read is read-only', async ($, on) => {
  const w = await edits($, on)
  expect(w.procRuns).toEqual([
    { argv: ['git', 'rev-parse', '--is-inside-work-tree'], cwd: '/repo/agents/hooks' },
    { argv: ['git', 'diff', '--numstat', '--', KIT], cwd: '/repo/agents/hooks' },
    { argv: ['git', 'diff', '--numstat', '--', BAND], cwd: '/repo/agents/hooks' },
  ])
  const code = w.state('code') as CodeTouch[]
  expect(code.find(c => c.path === KIT)).toMatchObject({
    turn: 1,
    state: 'changed',
    plus: 12,
    minus: 3,
    tools: ['Read', 'Edit'],
    summary: 'export const pruneEnded = 2',
    by: ['main'],
  })
  // A relative path resolves against the session's directory; reading never runs git.
  expect(code.find(c => c.path === README)).toMatchObject({ state: 'read', tools: ['Read'] })
  expect(code.find(c => c.path === README)?.editedAt).toBeUndefined()
})

test('code: outside a git work tree no numstat runs; a failed edit is ✗; a new file counts its lines', async ($, on) => {
  const w = await world($, on, true)
  w.notRepo.add('/repo/scratch')
  await w.tool('Edit', { file_path: '/repo/scratch/a.txt', old_string: 'x', new_string: 'y' })
  await w.tool('Edit', { file_path: '/repo/scratch/b.txt', old_string: 'x', new_string: 'y' })
  await w.tool('Edit', { file_path: KIT, old_string: 'nope', new_string: 'y' }, { isError: true })
  await w.tool('Write', { file_path: '/repo/new.md', content: '# New\none\ntwo\n' }, { result: { type: 'create' } })
  await w.clock.advance(10)
  // One probe for the folder outside a repo (kept), none for the failed edit.
  expect(w.procRuns.map(r => r.argv.slice(0, 2).join(' ') + ' ' + (r.cwd ?? ''))).toEqual([
    'git rev-parse /repo/scratch',
    'git rev-parse /repo',
    'git diff /repo',
  ])
  const code = w.state('code') as CodeTouch[]
  expect(code.find(c => c.path === '/repo/scratch/a.txt')).toMatchObject({ state: 'changed' })
  expect(code.find(c => c.path === '/repo/scratch/a.txt')?.plus).toBeUndefined()
  expect(code.find(c => c.path === KIT)).toMatchObject({ state: 'failed' })
  expect(code.find(c => c.path === '/repo/new.md')).toMatchObject({ state: 'changed', plus: 3, minus: 0, summary: '# New' })
})

test('code: heredoc bodies, quoted > and [ ] paths read right; a summary is capped when recorded', () => {
  const touched = (command: string) => bashTouches(command, '/r').map(t => [t.path, t.isEdit])
  // A heredoc body is data, not commands; the line that opens it keeps its redirect.
  expect(touched("python3 - <<'EOF'\nif n > 5:\n    print(n)\nEOF")).toEqual([])
  expect(touched("cat > notes.md <<'EOF'\n> a blockquote\ncat is great\nEOF\ncat after.md")).toEqual([
    ['/r/notes.md', true],
    ['/r/after.md', false],
  ])
  expect(touched('cat <<-END > out.txt\n\tcat x\n\tEND')).toEqual([['/r/out.txt', true]])
  // A quoted `>` is grep's pattern, not a redirect.
  expect(touched("grep -c '>' seqs.fa")).toEqual([])
  expect(touched('grep ">foo" file')).toEqual([])
  expect(touched('echo x >"out file.txt"')).toEqual([['/r/out file.txt', true]])
  // An edited or read file's path is literal; only a search's path can be a glob.
  expect(toolTouches('Edit', { file_path: '/r/app/[id]/page.tsx', old_string: 'a', new_string: 'b' }, '/r')).toEqual([
    { path: '/r/app/[id]/page.tsx', isEdit: true, tool: 'Edit', summary: 'b' },
  ])
  expect(toolTouches('Read', { file_path: 'app/[id]/page.tsx' }, '/r')).toEqual([{ path: '/r/app/[id]/page.tsx', isEdit: false, tool: 'Read' }])
  expect(toolTouches('Grep', { pattern: 'x', path: 'src/[ab]' }, '/r')).toEqual([])
  const long = toolTouches('Write', { file_path: 'bundle.min.js', content: 'x'.repeat(100_000) }, '/r')[0]?.summary ?? ''
  expect([long.length, long.endsWith('…')]).toEqual([SUMMARY_MAX, true])
  expect(editSummary('', 'y'.repeat(500))?.length).toBe(SUMMARY_MAX)
})

test('code: git never runs outside the session folder; a Bash exit code never marks its target ✗', async ($, on) => {
  const w = await world($, on, true)
  await w.tool('Edit', { file_path: '/tmp/cloned/x.ts', old_string: 'a', new_string: 'b' })
  await w.tool('Write', { file_path: '/Users/z/.claude/CLAUDE.md', content: '# Global' })
  await w.bash('grep pat src.txt > hits.txt', 'b1', { isForeground: true, isError: true })
  await w.clock.advance(10)
  // Only hits.txt (under /repo) is looked up; the two outside files are drawn without counts.
  expect(w.procRuns.map(r => r.argv.slice(0, 2).join(' ') + ' ' + (r.cwd ?? ''))).toEqual(['git rev-parse /repo', 'git diff /repo'])
  const code = w.state('code') as CodeTouch[]
  expect(code.find(c => c.path === '/tmp/cloned/x.ts')).toMatchObject({ state: 'changed' })
  expect(code.find(c => c.path === '/repo/hits.txt')).toMatchObject({ state: 'changed', tools: ['Bash'] })
})

test('code: a subagent’s touches are its own; a Bash command’s paths count too', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('fix the lexer')
  await w.tool('Edit', { file_path: KIT, old_string: 'a', new_string: 'b' }, { agentId: 'a1' })
  await w.bash("sed -i '' 's/x/y/' agents/hooks/band.tsx", 'b1', { isForeground: true })
  await w.clock.advance(10)
  const code = w.state('code') as CodeTouch[]
  expect(code.find(c => c.path === KIT)?.by).toEqual(['a1'])
  expect(code.find(c => c.path === BAND)).toMatchObject({ state: 'changed', tools: ['Bash'], by: ['main'] })
})

test('code: /agents-info code draws the map: header, 22-wide round nodes in edit order with ──▶, ALSO READ', async ($, on) => {
  const w = await edits($, on)
  expect((await run($, 'code')).text).toBe('Agents pane: Code view.')
  expect(w.opened).toEqual(['agents'])
  expect(w.state('view')).toBe('code')
  const ui = await mountPane($)
  expect((await ui.find({ key: 'code-head' }))?.text).toBe('Code map (3 files) (2 changed) · turn 1 ● editing band.tsx')
  const first = await ui.find({ key: 'node-1' })
  expect(first?.props).toMatchObject({ width: NODE_W, borderStyle: 'round', borderColor: STATE_COLOR.editing })
  expect(first?.text).toContain('1 kit.ts')
  expect(first?.text).toContain('+12 −3 · RE · 1s')
  expect(first?.text).toContain('export const pruneEnded')
  expect((await ui.find({ key: 'node-2' }))?.text).toContain('2 band.tsx')
  expect((await ui.find({ key: 'arrow-1' }))?.text).toBe(ARROW)
  expect((await ui.find({ key: 'code-also' }))?.text).toBe(' ALSO READ   README.md')
  // Editing (amber, ●) for 30 s after the edit, then changed (green, ✓).
  await w.clock.advance(31_000)
  expect((await ui.find({ key: 'node-1' }))?.props.borderColor).toBe(STATE_COLOR.changed)
  expect((await ui.find({ key: 'node-1' }))?.text).toContain('✓')
  expect((await ui.find({ key: 'code-head' }))?.text).toBe('Code map (3 files) (2 changed) · turn 1')
  await ui.unmount()
})

test('code: nodes wrap by the pane width, a wrapped row starting with the arrow; under 60 columns a tree list', async ($, on) => {
  const w = await world($, on, true)
  await w.mainTurn(true)
  for (const f of ['a', 'b', 'c', 'd']) await w.tool('Write', { file_path: `/repo/src/${f}.ts`, content: `export const ${f} = 1` })
  await w.clock.advance(31_000)
  await run($, 'code')
  let ui = await mountPane($, 80)
  const row = async (r: number) => (await ui.drawn()) && (await ui.find({ key: `code-row-${r}` }))
  expect((await row(0))?.text).toMatch(/^.*a\.ts.*──▶.*b\.ts.*──▶.*c\.ts.*$/s)
  expect((await row(1))?.text).toMatch(/^──▶.*d\.ts/s)
  await ui.unmount()
  ui = await mountPane($, 50)
  expect(await ui.find({ key: 'node-1' })).toBeUndefined()
  expect((await ui.find({ key: 'tree-4' }))?.text).toBe('└ 4 ✓ d.ts')
  expect((await ui.find({ key: 'tree-1' }))?.text).toBe('├ 1 ✓ a.ts')
  await ui.unmount()
})

test('code: w goes back to Who, c comes to Code, q closes; Who keeps x: clear done', async ($, on) => {
  const w = await world($, on, true, {}, { isPaneOpen: true })
  await w.spawn('one')
  await w.finish('a1')
  await w.tool('Edit', { file_path: KIT, old_string: 'a', new_string: 'b' })
  const ui = await mountPane($)
  expect((await ui.find({ key: 'clear' }))?.props).toMatchObject({ label: 'x: clear done', hotkey: 'x' })
  expect((await ui.find({ key: 'view-code' }))?.props).toMatchObject({ label: 'c: code', hotkey: 'c' })
  await ui.press({ key: 'view-code' })
  expect(w.state('view')).toBe('code')
  expect(await ui.find({ key: 'node-1' })).toBeDefined()
  expect((await ui.find({ key: 'view-who' }))?.props.hotkey).toBe('w')
  await ui.press({ key: 'view-who' })
  expect(w.state('view')).toBe('who')
  await ui.press({ key: 'pane-close' })
  expect(w.closed).toEqual(['agents'])
  expect((await run($, 'close')).text).toBe('Agents pane closed.')
  await ui.unmount()
})

test('code: per turn by default, the turn before kept once, a toggles the session with turn tags', async ($, on) => {
  const w = await world($, on, true)
  await w.mainTurn(true)
  await w.tool('Edit', { file_path: KIT, old_string: 'a', new_string: 'b' })
  await w.mainTurn(false)
  await w.mainTurn(true)
  await w.tool('Edit', { file_path: BAND, old_string: 'a', new_string: 'b' })
  await w.clock.advance(10)
  await run($, 'code')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /kit\.ts/ })).toBeUndefined()
  expect((await ui.find({ key: 'node-1' }))?.text).toContain('band.tsx')
  await ui.press({ key: 'code-scope' })
  expect(w.state('codeScope')).toBe('session')
  expect((await ui.find({ key: 'code-head' }))?.text).toMatch(/^Code map \(2 files\) \(2 changed\) · session/)
  expect((await ui.find({ key: 'node-1' }))?.text).toContain('t1')
  expect((await ui.find({ key: 'node-2' }))?.text).toContain('t2')
  expect((await run($, 'scope')).text).toBe('Code map scope: this turn.')
  // A third turn that touched nothing yet shows the turn before.
  await w.mainTurn(false)
  await w.mainTurn(true)
  expect((await ui.find({ key: 'code-head' }))?.text).toMatch(/· turn 2 \(previous\)/)
  await ui.unmount()
})

test('code: d then a number runs /diff on that file from the tick; /agents-info diff <n> is its twin', async ($, on) => {
  const w = await edits($, on)
  await run($, 'code')
  const ui = await mountPane($)
  expect(await ui.find({ key: 'diff-1' })).toBeUndefined()
  await ui.press({ key: 'code-diff' })
  expect(w.state('isDiffArmed')).toBe(true)
  expect((await ui.find({ key: 'diff-2' }))?.props).toMatchObject({ label: '2', hotkey: '2' })
  await ui.press({ key: 'diff-2' })
  expect(w.state('isDiffArmed')).toBe(false)
  // Run by the 1 s tick, not by the press.
  expect(w.commands).toEqual([])
  await w.clock.advance(1_000)
  expect(w.commands).toEqual([{ command: 'diff', args: BAND }])
  expect((await run($, 'diff 1')).text).toBe(`Diff of ${KIT} coming up.`)
  await w.clock.advance(1_000)
  expect(w.commands).toEqual([
    { command: 'diff', args: BAND },
    { command: 'diff', args: KIT },
  ])
  expect((await run($, 'diff 9')).text).toBe('No file 9 in the code map.')
  await ui.unmount()
})

test('code: the subagents row carries the Who view numbers; their digits give way to the diff pick', async ($, on) => {
  const w = await world($, on, true)
  await w.spawn('fix the lexer', 'savvy-careful')
  await w.tool('Edit', { file_path: KIT, old_string: 'a', new_string: 'b' }, { agentId: 'a1' })
  await w.clock.advance(10)
  await run($, 'code')
  const ui = await mountPane($)
  expect((await ui.find({ key: 'sub-num-a1' }))?.props).toMatchObject({ label: '1', hotkey: '1' })
  expect((await ui.find({ key: 'node-1' }))?.text).toContain('@1')
  const before = w.toasts.length
  await ui.press({ key: 'sub-num-a1' })
  expect(w.toasts.slice(before)).toEqual(['messages view comes with E3'])
  await ui.press({ key: 'code-diff' })
  expect((await ui.find({ key: 'sub-num-a1' }))?.props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('code: summaries=off draws the folder in place of the summary', { options: { summaries: 'off' } }, async ($, on) => {
  await edits($, on)
  await run($, 'code')
  const ui = await mountPane($)
  const node = await ui.find({ key: 'node-1' })
  expect(node?.text).toContain('agents/hooks')
  expect(node?.text).not.toContain('pruneEnded')
  await ui.unmount()
})

test('code: the desktop gets the map as plain text', async ($, on) => {
  await edits($, on)
  await run($, 'code')
  const ui = await mountPane($, 80, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'Code map (3 files) (2 changed) · turn 1 · editing band.tsx' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 ● kit.ts +12 −3 · export const pruneEnded = 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Also read: README.md' })).toBeDefined()
  await ui.unmount()
})
