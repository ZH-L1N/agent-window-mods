import { expect, test } from 'claude-code/testing'

import { PANE, ROOT, mountPane, paneLines, world } from './test-kit'
import type { Git, WorldShape } from './test-kit'

const PEACH = '#fab387'
const SAPPHIRE = '#74c7ec'
const YELLOW = '#f9e2af'
const GREEN = '#a6e3a1'
const RED = '#f38ba8'

const DIRS: WorldShape['dirs'] = {
  [ROOT]: [
    ['README.md', 'file'],
    ['src', 'dir'],
    ['.git', 'dir'],
    ['node_modules', 'dir'],
    ['docs', 'dir'],
    ['link', 'other'],
  ],
  [`${ROOT}/src`]: [
    ['main.ts', 'file'],
    ['util', 'dir'],
  ],
  [`${ROOT}/docs`]: [['guide.md', 'file']],
}

const gitRuns = (w: { runs: { argv: string[] }[] }) => w.runs.filter(r => r.argv[0] === 'git').length

test('/tree opens the Files pane with focus and lists the root through fs.list', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  expect(w.lists).toEqual([])
  expect(await w.command('')).toBe('Files pane opened.')
  expect(w.opened).toEqual([{ id: PANE, title: 'Files', focus: true }])
  expect(w.lists).toEqual([ROOT])
  expect(w.runs.map(r => r.argv)).toEqual([['git', '-C', ROOT, 'status', '--porcelain']])
  // The status read never takes the index lock (a background `git add` or `git commit` keeps it).
  expect(w.runs[0]?.init).toEqual({ timeoutMs: 3000, env: { GIT_OPTIONAL_LOCKS: '0' } })
  expect(w.state('root')).toBe(ROOT)
  expect(w.state('listed')).toEqual({ '': [{ name: 'docs', kind: 'dir' }, { name: 'src', kind: 'dir' }, { name: 'README.md', kind: 'file' }] })

  const ui = await mountPane($)
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(lines).toContain('Files · repo · 0 changed · 0 touched this turn')
  expect(lines).not.toContain('Touched this turn')
  expect(lines.some(l => l.includes('README.md'))).toBe(true)
  expect(lines.some(l => l.includes('node_modules') || l.includes('.git') || l.includes('link'))).toBe(false)
  expect((await ui.find({ key: 'ft-src' }))?.props.label).toBe('▸ src/')
  expect((await ui.find({ key: 'ft-docs' }))?.props.label).toBe('▸ docs/')
  expect((await ui.find({ key: 'tree-refresh' }))?.props.label).toBe('r: refresh')
  expect((await ui.find({ key: 'tree-close' }))?.props.label).toBe('c: close')
  expect(lines.some(l => l.includes('/tree refresh') && l.includes('/tree close') && l.includes('/tree toggle'))).toBe(true)
  await ui.unmount()
})

test('pressing a folder Button lists and opens it; pressing it again closes it', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  const ui = await mountPane($)
  await ui.press({ key: 'ft-src' })
  expect(w.lists).toEqual([ROOT, `${ROOT}/src`])
  expect(w.state('open')).toEqual(['src'])
  await ui.unmount()

  const opened = await mountPane($)
  expect((await opened.find({ key: 'ft-src' }))?.props.label).toBe('▾ src/')
  expect((await opened.find({ key: 'ft-src/util' }))?.props.label).toBe('▸ util/')
  expect((await opened.findAll({ type: 'Text' })).some(t => t.text.includes('main.ts'))).toBe(true)
  await opened.press({ key: 'ft-src' })
  expect(w.state('open')).toEqual([])
  await opened.unmount()

  const closed = await mountPane($)
  expect((await closed.find({ key: 'ft-src' }))?.props.label).toBe('▸ src/')
  expect(await closed.find({ key: 'ft-src/util' })).toBeUndefined()
  await closed.unmount()
})

test('/tree toggle src does the same as the press', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  expect(await w.command('toggle src')).toBe('Opened src/.')
  expect(w.lists).toEqual([ROOT, `${ROOT}/src`])
  expect(w.state('open')).toEqual(['src'])
  expect(w.state('listed')).toMatchObject({ src: [{ name: 'util', kind: 'dir' }, { name: 'main.ts', kind: 'file' }] })
  expect(await w.command('toggle src/')).toBe('Closed src/.')
  expect(w.state('open')).toEqual([])
  expect(await w.command('toggle ../etc')).toBe('/tree toggle: ../etc is outside the tree.')
  expect(await w.command('toggle')).toBe('Usage: /tree [close | refresh | toggle <path>]')
})

test('a folder that fails to list opens empty', async ($, on) => {
  const w = await world($, on, { dirs: { [ROOT]: [['gone', 'dir']] } })
  await w.start()
  await w.command('')
  expect(await w.command('toggle gone')).toBe('Opened gone/.')
  expect(w.state('listed')).toMatchObject({ gone: [] })
  expect((await paneLines($)).length).toBeGreaterThan(0)
})

test('a Read then a Write of one file shows it as written; writes come first', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  await w.turn()
  await w.tool('Read', { file_path: `${ROOT}/README.md` })
  await w.tool('Read', { file_path: `${ROOT}/src/main.ts` })
  await w.tool('Write', { file_path: `${ROOT}/src/main.ts`, content: 'x' })
  // A read after the write leaves it written.
  await w.tool('Read', { file_path: `${ROOT}/src/main.ts` })
  // Outside the root, refused or failed: not touched.
  await w.tool('Read', { file_path: '/etc/hosts' })
  await w.tool('Edit', { file_path: `${ROOT}/docs/guide.md` }, { deny: 'no' })
  await w.tool('Edit', { file_path: `${ROOT}/docs/x.md` }, { isError: true })
  expect(w.state('touched')).toEqual({ 'README.md': 'read', 'src/main.ts': 'write' })

  const ui = await mountPane($)
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(lines).toContain('Files · repo · 0 changed · 2 touched this turn')
  expect(lines).toContain('Touched this turn')
  const written = (await ui.findAll({ type: 'Text', text: 'src/main.ts' }))[0]
  expect(written?.props.color).toBe(PEACH)
  expect(written?.props.bold).toBe(true)
  const read = (await ui.findAll({ type: 'Text', text: 'README.md' }))[0]
  expect(read?.props.color).toBe(SAPPHIRE)
  const block = lines.filter(l => l === 'src/main.ts' || l === 'README.md')
  expect(block.slice(0, 2)).toEqual(['src/main.ts', 'README.md'])
  await ui.unmount()
})

test('the touched block lists at most 8 paths', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.turn()
  for (let i = 0; i < 11; i++) await w.tool('Read', { file_path: `${ROOT}/f${i}.txt` })
  const lines = await paneLines($)
  expect(lines.filter(l => /^f\d+\.txt$/.test(l))).toHaveLength(8)
  expect(lines).toContain('Files · repo · 0 changed · 11 touched this turn')
})

test("a subagent's write counts; a new main turn clears the block, a subagent's turn does not", async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.turn()
  await w.tool('Edit', { file_path: `${ROOT}/README.md` }, { agentId: 'a1' })
  await w.turn('sub', 'a1')
  expect(w.state('touched')).toEqual({ 'README.md': 'write' })
  await w.turn('next')
  expect(w.state('touched')).toEqual({})
  expect(await paneLines($)).not.toContain('Touched this turn')
})

test('git marks are drawn: M yellow, A and ?? green, D red, and • on a folder with a change', async ($, on) => {
  const w = await world($, on, {
    dirs: { ...DIRS, [ROOT]: [...DIRS![ROOT]!, ['new.ts', 'file'], ['old.ts', 'file'], ['add.ts', 'file']] },
    git: { stdout: ' M README.md\n?? new.ts\n D old.ts\nA  add.ts\n M src/main.ts\n' },
  })
  await w.start()
  await w.command('')
  expect(w.state('git')).toEqual({ 'README.md': 'M', 'new.ts': '??', 'old.ts': 'D', 'add.ts': 'A', 'src/main.ts': 'M' })
  const ui = await mountPane($)
  const color = async (text: RegExp) => (await ui.findAll({ type: 'Text', text }))[0]?.props.color
  expect(await color(/^M$/)).toBe(YELLOW)
  expect(await color(/^\?\?$/)).toBe(GREEN)
  expect(await color(/^A$/)).toBe(GREEN)
  expect(await color(/^D$/)).toBe(RED)
  expect(await ui.find({ type: 'Text', text: /^•$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Files · repo · 5 changed · 0 touched this turn')
  await ui.unmount()
})

const FAILING: [string, Git][] = [
  ['a git that cannot run', 'throw'],
  ['a git that exits non-zero', { stdout: ' M README.md\n', exitCode: 128 }],
]
for (const [name, git] of FAILING) {
  test(`${name} draws no marks and does not throw`, async ($, on) => {
    const w = await world($, on, { dirs: DIRS, git })
    await w.start()
    expect(await w.command('')).toBe('Files pane opened.')
    expect(w.state('git')).toEqual({})
    const lines = await paneLines($)
    expect(lines).toContain('Files · repo · 0 changed · 0 touched this turn')
    expect(lines).not.toContain('M')
  })
}

test('a root below the repo top keeps only its own changes, relative to it', async ($, on) => {
  const sub = '/repo/pkg'
  const w = await world($, on, {
    cwd: sub,
    dirs: { [sub]: [['a.ts', 'file']] },
    git: { stdout: ' M pkg/a.ts\n M other/b.ts\n' },
  })
  await w.start()
  await w.command('')
  expect(w.runs.map(r => r.argv)).toEqual([['git', '-C', sub, 'status', '--porcelain']])
  expect(w.state('git')).toEqual({ 'a.ts': 'M' })
  expect(await paneLines($)).toContain('Files · pkg · 1 changed · 0 touched this turn')
})

test('at most 5000 marks are kept and the head reads 5000+ changed', async ($, on) => {
  const lines = Array.from({ length: 5_010 }, (_, i) => ` M f${i}.txt`).join('\n')
  const w = await world($, on, { dirs: { [ROOT]: [['f0.txt', 'file']] }, git: { stdout: `${lines}\n` } })
  await w.start()
  await w.command('')
  expect(Object.keys(w.state('git') as object)).toHaveLength(5000)
  expect(await paneLines($)).toContain('Files · repo · 5000+ changed · 0 touched this turn')
})

test('an untracked parent of the session folder marks the whole tree untracked', async ($, on) => {
  const app = '/repo/scratch/app'
  const w = await world($, on, {
    cwd: app,
    gitTops: [ROOT],
    dirs: { [app]: [['lib', 'dir'], ['main.py', 'file']], [`${app}/lib`]: [['util.py', 'file']] },
    git: { stdout: '?? scratch/\n M README.md\n' },
  })
  await w.start()
  await w.command('')
  await w.command('toggle lib')
  expect(w.state('git')).toEqual({ '': '??' })
  const ui = await mountPane($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('Files · app · all untracked · 0 touched this turn')
  expect(texts.filter(t => t === '??')).toHaveLength(2)
  expect(texts.filter(t => t === '•')).toHaveLength(1)
  await ui.unmount()
})

test('a main turn ending reads git again while the pane is open, and not once it is closed', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.turn()
  await w.complete()
  expect(gitRuns(w)).toBe(0)
  await w.command('')
  expect(gitRuns(w)).toBe(1)
  w.setGit({ stdout: ' M README.md\n' })
  await w.turn()
  await w.complete('a1')
  expect(gitRuns(w)).toBe(1)
  await w.complete()
  expect(gitRuns(w)).toBe(2)
  expect(w.state('git')).toEqual({ 'README.md': 'M' })
  expect(await w.command('close')).toBe('Files pane closed.')
  expect(w.closed).toEqual([PANE])
  await w.complete()
  expect(gitRuns(w)).toBe(2)
  expect(await w.command('close')).toBe('The Files pane is not open.')
})

test('tree-refresh lists the root and every open folder again and reads git; tree-close closes', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  await w.command('toggle src')
  w.setDir(`${ROOT}/src`, [['main.ts', 'file'], ['added.ts', 'file']])
  const ui = await mountPane($)
  await ui.press({ key: 'tree-refresh' })
  expect(w.lists).toEqual([ROOT, `${ROOT}/src`, ROOT, `${ROOT}/src`])
  expect(gitRuns(w)).toBe(2)
  expect(w.state('listed')).toMatchObject({ src: [{ name: 'added.ts', kind: 'file' }, { name: 'main.ts', kind: 'file' }] })
  await ui.press({ key: 'tree-close' })
  expect(w.closed).toEqual([PANE])
  await ui.unmount()
  expect(await w.command('refresh')).toBe('Files read again.')
  expect(w.lists).toHaveLength(6)
})

test('a folder over the cap ends in … N more', async ($, on) => {
  const many = Array.from({ length: 205 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'file'] as [string, 'file'])
  const w = await world($, on, { dirs: { [ROOT]: [['big', 'dir'], ['z.txt', 'file']], [`${ROOT}/big`]: many } })
  await w.start()
  await w.command('')
  await w.command('toggle big')
  const lines = await paneLines($, 80)
  const more = lines.findIndex(l => l.trim() === '… 5 more')
  expect(more).toBeGreaterThan(0)
  expect(lines.findIndex(l => l.includes('z.txt'))).toBeGreaterThan(more)
})

test('files named after Object.prototype members draw, carry their marks and their touches', async ($, on) => {
  const w = await world($, on, {
    dirs: { [ROOT]: [['constructor', 'file'], ['__proto__', 'file'], ['toString', 'file'], ['valueOf', 'file'], ['hasOwnProperty', 'file']] },
    git: { stdout: ' M __proto__\n' },
  })
  await w.start()
  await w.command('')
  // Before anything is touched or marked under those names, the pane draws its tree.
  const before = await paneLines($)
  for (const name of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) expect(before).toContain(name)
  expect(before).toContain('Files · repo · 1 changed · 0 touched this turn')

  await w.turn()
  await w.tool('Read', { file_path: `${ROOT}/constructor` })
  await w.tool('Write', { file_path: `${ROOT}/__proto__`, content: 'x' })
  // Read back from the state as the pane reads it: both keys survive.
  const ui = await mountPane($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('Files · repo · 1 changed · 2 touched this turn')
  expect(texts).toContain('Touched this turn')
  const reads = await ui.findAll({ type: 'Text', text: 'constructor' })
  expect(reads.length).toBe(2)
  for (const t of reads) expect(t.props.color).toBe(SAPPHIRE)
  const writes = await ui.findAll({ type: 'Text', text: '__proto__' })
  expect(writes.length).toBe(2)
  for (const t of writes) expect(t.props.color).toBe(PEACH)
  expect((await ui.findAll({ type: 'Text', text: /^M$/ })).map(t => t.props.color)).toEqual([YELLOW])
  expect((await ui.findAll({ type: 'Text', text: 'toString' }))[0]?.props.color).toBeUndefined()
  await ui.unmount()
})

test('control characters in a name are not drawn', async ($, on) => {
  const w = await world($, on, { dirs: { [ROOT]: [['bad\u001b[31mname', 'file'], ['tab\u0007dir', 'dir']] } })
  await w.start()
  await w.command('')
  const ui = await mountPane($)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.some(t => /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(t))).toBe(false)
  expect(texts.some(t => t.includes('bad[31mname'))).toBe(true)
  expect((await ui.find({ key: 'ft-tab\u0007dir' }))?.props.label).toBe('▸ tabdir/')
  await ui.unmount()
})

test('a session started again in the same folder keeps the open folders and clears the touched block', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  await w.command('toggle src')
  await w.turn()
  await w.tool('Read', { file_path: `${ROOT}/README.md` })
  // A reload in the same folder keeps the open folders; the touched block is cleared.
  await w.start()
  expect(w.state('open')).toEqual(['src'])
  expect(w.state('touched')).toEqual({})
})

test('the desktop surface is passed on', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  await w.command('')
  const ui = await mountPane($, 80, 'desktop')
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['beneath'])
  await ui.unmount()
})

test('an unknown subcommand answers the usage', async ($, on) => {
  const w = await world($, on, { dirs: DIRS })
  await w.start()
  expect(await w.command('frobnicate')).toBe('Usage: /tree [close | refresh | toggle <path>]')
})
