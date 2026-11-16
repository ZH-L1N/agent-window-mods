import { describe, expect, test } from 'claude-code/testing'

import type { Entry } from '../types'
import { DEPTH_CAP, DIR_CAP, MARK_CAP, ROW_CAP, capMarks, changedText, marksUnder, parsePorcelain, sortEntries, touchOf, visibleRows } from './tree'

const f = (name: string): Entry => ({ name, kind: 'file' })
const d = (name: string): Entry => ({ name, kind: 'dir' })
/** File names that are also members of Object.prototype, in the order sortEntries gives them. */
const PROTO_NAMES = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'] as const

describe('sortEntries', () => {
  test('folders first, then by name without regard to case; ignored names and other kinds left out', () => {
    const out = sortEntries([
      f('b.txt'),
      d('src'),
      f('A.md'),
      d('.git'),
      d('node_modules'),
      f('.DS_Store'),
      { name: 'link', kind: 'other' },
      d('Docs'),
      d('dist'),
      d('__pycache__'),
      d('.venv'),
      d('build'),
      d('target'),
      f('c.ts'),
    ])
    expect(out.map(e => e.name)).toEqual(['Docs', 'src', 'A.md', 'b.txt', 'c.ts'])
  })
})

describe('visibleRows', () => {
  test('nests the entries of open folders only, depth first', () => {
    const listed = {
      '': [d('lib'), d('src'), f('README.md')],
      src: [d('util'), f('main.ts')],
      'src/util': [f('x.ts')],
      lib: [f('a.ts')],
    }
    const rows = visibleRows(listed, ['src', 'src/util'], {}, {})
    expect(rows.map(r => `${r.depth}:${r.path}`)).toEqual(['0:lib', '0:src', '1:src/util', '2:src/util/x.ts', '1:src/main.ts', '0:README.md'])
    expect(rows.find(r => r.path === 'lib')?.isOpen).toBe(false)
    expect(rows.find(r => r.path === 'src')?.isOpen).toBe(true)
    expect(rows.find(r => r.path === 'src')?.kind).toBe('dir')
    expect(rows.find(r => r.path === 'README.md')?.kind).toBe('file')
    expect(rows.every(r => r.more === 0 && r.touch === '' && r.mark === '')).toBe(true)
  })

  test('an open folder inside a closed one is not shown', () => {
    const listed = { '': [d('src')], src: [d('util')], 'src/util': [f('x.ts')] }
    expect(visibleRows(listed, ['src/util'], {}, {}).map(r => r.path)).toEqual(['src'])
  })

  test('nesting stops at DEPTH_CAP', () => {
    const listed: Record<string, Entry[]> = {}
    const open: string[] = []
    let path = ''
    for (let i = 0; i < DEPTH_CAP + 4; i++) {
      listed[path] = [d(`d${i}`)]
      path = path ? `${path}/d${i}` : `d${i}`
      open.push(path)
    }
    const rows = visibleRows(listed, open, {}, {})
    expect(rows).toHaveLength(DEPTH_CAP)
    expect(Math.max(...rows.map(r => r.depth))).toBe(DEPTH_CAP - 1)
  })

  test('a folder over DIR_CAP shows its first DIR_CAP entries and sets more on the last', () => {
    const many = Array.from({ length: DIR_CAP + 25 }, (_, i) => f(`f${String(i).padStart(4, '0')}.txt`))
    const rows = visibleRows({ '': [d('big'), f('z.txt')], big: many }, ['big'], {}, {})
    const inBig = rows.filter(r => r.path.startsWith('big/'))
    expect(inBig).toHaveLength(DIR_CAP)
    expect(inBig[DIR_CAP - 1]?.more).toBe(25)
    expect(inBig.slice(0, -1).every(r => r.more === 0)).toBe(true)
    expect(rows[rows.length - 1]?.path).toBe('z.txt')
    expect(rows[rows.length - 1]?.more).toBe(0)
  })

  test('the whole list stops at ROW_CAP', () => {
    const listed: Record<string, Entry[]> = { '': [] }
    const open: string[] = []
    for (let i = 0; i < 5; i++) {
      listed['']!.push(d(`d${i}`))
      listed[`d${i}`] = Array.from({ length: 150 }, (_, j) => f(`f${j}`))
      open.push(`d${i}`)
    }
    expect(visibleRows(listed, open, {}, {})).toHaveLength(ROW_CAP)
  })

  test("a file's mark is its git code; a folder's is • when anything under it has one", () => {
    const listed = { '': [d('clean'), d('src'), d('new'), f('a.txt')], src: [d('deep')], 'src/deep': [f('x.ts')], new: [f('n.txt')] }
    const git = { 'a.txt': 'M', 'src/deep/x.ts': 'A', 'new/': '??' }
    const rows = visibleRows(listed, ['src', 'src/deep', 'new'], git, {})
    const mark = (p: string) => rows.find(r => r.path === p)?.mark
    expect(mark('a.txt')).toBe('M')
    expect(mark('src')).toBe('•')
    expect(mark('src/deep')).toBe('•')
    expect(mark('src/deep/x.ts')).toBe('A')
    expect(mark('clean')).toBe('')
    expect(mark('new')).toBe('•')
    // A file inside a folder git lists whole as untracked is untracked too.
    expect(mark('new/n.txt')).toBe('??')
  })

  test('a folder inside an untracked folder has its dot, and the files in it their ??', () => {
    const listed = { '': [d('new'), f('a.txt')], new: [d('sub'), f('top.txt')], 'new/sub': [d('deeper'), f('a.txt')], 'new/sub/deeper': [] }
    const rows = visibleRows(listed, ['new', 'new/sub', 'new/sub/deeper'], { 'new/': '??' }, {})
    const mark = (p: string) => rows.find(r => r.path === p)?.mark
    expect(mark('new')).toBe('•')
    expect(mark('new/top.txt')).toBe('??')
    expect(mark('new/sub')).toBe('•')
    expect(mark('new/sub/deeper')).toBe('•')
    expect(mark('new/sub/a.txt')).toBe('??')
    expect(mark('a.txt')).toBe('')
  })

  test("the whole tree untracked ('' marked) marks every file ?? and every folder •", () => {
    const listed = { '': [d('src'), f('a.txt')], src: [f('b.ts')] }
    const rows = visibleRows(listed, ['src'], { '': '??' }, {})
    expect(rows.map(r => `${r.path}:${r.mark}`)).toEqual(['src:•', 'src/b.ts:??', 'a.txt:??'])
  })

  test('20,000 marks are indexed once, not scanned for each of the 400 rows', () => {
    // Two open folders of DIR_CAP files each fill ROW_CAP rows; none of them is marked.
    const listed: Record<string, Entry[]> = { '': [d('a'), d('b')] }
    for (const dir of ['a', 'b']) listed[dir] = Array.from({ length: DIR_CAP }, (_, i) => f(`f${i}.txt`))
    const plain: Record<string, string> = {}
    for (let i = 0; i < 20_000; i++) plain[i % 50 === 0 ? `u${i}/` : `x/y${i % 7}/z${i}.ts`] = i % 50 === 0 ? '??' : 'M'
    // Every read of the marks object is counted: a deterministic measure of the work, unlike a timer.
    let reads = 0
    const git = new Proxy(plain, {
      get: (t, k) => (reads++, Reflect.get(t, k)),
      has: (t, k) => (reads++, Reflect.has(t, k)),
      ownKeys: t => ((reads += Object.keys(t).length), Reflect.ownKeys(t)),
      getOwnPropertyDescriptor: (t, k) => (reads++, Reflect.getOwnPropertyDescriptor(t, k)),
    })
    const rows = visibleRows(listed, ['a', 'b'], git, {})
    expect(rows).toHaveLength(ROW_CAP)
    expect(rows.every(r => r.mark === '')).toBe(true)
    // One pass over the marks to index them (a few reads per key), then a handful per row.
    // Scanning them for every row instead costs millions.
    expect(reads).toBeLessThan(5 * 20_000)
    // Drawn again from the same marks: the index is reused, so only the per-row lookups remain.
    reads = 0
    visibleRows(listed, ['a', 'b'], git, {})
    expect(reads).toBeLessThan(ROW_CAP * (DEPTH_CAP + 4))
  })

  test('touched files carry their touch', () => {
    const rows = visibleRows({ '': [f('a.txt'), f('b.txt')] }, [], {}, { 'a.txt': 'write', 'b.txt': 'read' })
    expect(rows.map(r => r.touch)).toEqual(['write', 'read'])
  })

  test('a file named after an Object.prototype member reads no inherited mark or touch', () => {
    const rows = visibleRows({ '': PROTO_NAMES.map(f) }, [], {}, {})
    expect(rows.map(r => r.path)).toEqual([...PROTO_NAMES])
    for (const row of rows) {
      expect(typeof row.mark).toBe('string')
      expect(row.mark).toBe('')
      expect(typeof row.touch).toBe('string')
      expect(row.touch).toBe('')
    }
    // Own keys of those names are read like any other.
    const git = Object.fromEntries([['__proto__', 'M'], ['constructor', '??']]) as Record<string, string>
    const touched = Object.fromEntries([['__proto__', 'write'], ['toString', 'read']]) as Record<string, 'read' | 'write'>
    const marked = visibleRows({ '': PROTO_NAMES.map(f) }, [], git, touched)
    expect(marked.map(r => `${r.path}:${r.mark}:${r.touch}`)).toEqual([
      '__proto__:M:write',
      'constructor:??:',
      'hasOwnProperty::',
      'toString::read',
      'valueOf::',
    ])
  })
})

describe('parsePorcelain', () => {
  test('one entry per line, the code trimmed', () => {
    expect(parsePorcelain(' M a.txt\n?? new/\nA  added.ts\n D gone.md\n')).toEqual({ 'a.txt': 'M', 'new/': '??', 'added.ts': 'A', 'gone.md': 'D' })
  })

  test('a rename keeps the new path', () => {
    expect(parsePorcelain('R  old.txt -> new.txt')).toEqual({ 'new.txt': 'R' })
  })

  test('a quoted path is unquoted', () => {
    expect(parsePorcelain('?? "sp ace.txt"')).toEqual({ 'sp ace.txt': '??' })
    expect(parsePorcelain(' M "caf\\303\\251.txt"')).toEqual({ 'café.txt': 'M' })
    expect(parsePorcelain('R  "a b.txt" -> "c d.txt"')).toEqual({ 'c d.txt': 'R' })
  })

  test('blank and short lines are skipped', () => {
    expect(parsePorcelain('\n\nM\n')).toEqual({})
  })

  test('a path named __proto__ or constructor is an own key like any other', () => {
    const marks = parsePorcelain(' M __proto__\n M constructor\n')
    expect(Object.keys(marks)).toEqual(['__proto__', 'constructor'])
    expect(Object.getOwnPropertyDescriptor(marks, '__proto__')?.value).toBe('M')
    expect(Object.getOwnPropertyDescriptor(marks, 'constructor')?.value).toBe('M')
    expect(Object.getPrototypeOf(marks)).toBe(Object.prototype)
    expect(changedText(marks)).toBe('2 changed')
  })
})

describe('marksUnder', () => {
  test('only the paths under the root, relative to it', () => {
    expect(marksUnder({ 'pkg/a.ts': 'M', 'other/b.ts': 'M', 'pkg/new/': '??' }, 'pkg')).toEqual({ 'a.ts': 'M', 'new/': '??' })
  })

  test("an untracked folder that is the root or one of its parents marks the whole tree ('')", () => {
    expect(marksUnder({ 'scratch/': '??', 'other.txt': 'M' }, 'scratch/app')).toEqual({ '': '??' })
    expect(marksUnder({ 'scratch/app/': '??' }, 'scratch/app')).toEqual({ '': '??' })
    // A sibling whose name only starts the same is not a parent.
    expect(marksUnder({ 'scr/': '??', 'scratch/application/': '??' }, 'scratch/app')).toEqual({})
  })

  test('keeps keys named after Object.prototype members', () => {
    const git = Object.fromEntries([['pkg/__proto__', 'M'], ['pkg/constructor', 'A'], ['other/x', 'M']]) as Record<string, string>
    const under = marksUnder(git, 'pkg')
    expect(Object.keys(under)).toEqual(['__proto__', 'constructor'])
    expect(Object.getOwnPropertyDescriptor(under, '__proto__')?.value).toBe('M')
    expect(Object.getOwnPropertyDescriptor(under, 'constructor')?.value).toBe('A')
  })
})

describe('capMarks and changedText', () => {
  test('at most MARK_CAP marks are kept, the first ones read', () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < MARK_CAP + 7; i++) many[`f${i}.txt`] = 'M'
    const kept = capMarks(many)
    expect(Object.keys(kept)).toHaveLength(MARK_CAP)
    expect(kept['f0.txt']).toBe('M')
    expect(kept[`f${MARK_CAP}.txt`]).toBeUndefined()
    const few = { 'a.txt': 'M' }
    expect(capMarks(few)).toEqual(few)
  })

  test('capMarks keeps keys named after Object.prototype members', () => {
    const many = Object.fromEntries([['__proto__', 'M'], ['constructor', 'D'], ...Array.from({ length: MARK_CAP + 3 }, (_, i) => [`f${i}.txt`, 'M'])]) as Record<string, string>
    const kept = capMarks(many)
    expect(Object.keys(kept)).toHaveLength(MARK_CAP)
    expect(Object.keys(kept).slice(0, 2)).toEqual(['__proto__', 'constructor'])
    expect(Object.getOwnPropertyDescriptor(kept, '__proto__')?.value).toBe('M')
    expect(Object.getOwnPropertyDescriptor(kept, 'constructor')?.value).toBe('D')
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype)
  })

  test("the head's count: N changed, 5000+ changed at the cap, all untracked for the whole tree", () => {
    expect(MARK_CAP).toBe(5000)
    expect(changedText({})).toBe('0 changed')
    expect(changedText({ 'a.txt': 'M', 'new/': '??' })).toBe('2 changed')
    const full: Record<string, string> = {}
    for (let i = 0; i < MARK_CAP; i++) full[`f${i}`] = 'M'
    expect(changedText(full)).toBe('5000+ changed')
    expect(changedText({ '': '??' })).toBe('all untracked')
  })
})

describe('touchOf', () => {
  const root = '/repo'

  test('Read is read; Edit, Write and NotebookEdit are write; the path relative to the root', () => {
    expect(touchOf('Read', { file_path: '/repo/src/a.ts' }, root)).toEqual({ path: 'src/a.ts', kind: 'read' })
    expect(touchOf('Edit', { file_path: '/repo/a.ts' }, root)).toEqual({ path: 'a.ts', kind: 'write' })
    expect(touchOf('Write', { file_path: '/repo/new/b.md' }, root)).toEqual({ path: 'new/b.md', kind: 'write' })
    expect(touchOf('NotebookEdit', { notebook_path: '/repo/nb.ipynb' }, root)).toEqual({ path: 'nb.ipynb', kind: 'write' })
  })

  test('a path outside the root gives null', () => {
    expect(touchOf('Read', { file_path: '/etc/hosts' }, root)).toBeNull()
    expect(touchOf('Read', { file_path: '/repository/a.ts' }, root)).toBeNull()
    expect(touchOf('Edit', { file_path: '/repo/../other/a.ts' }, root)).toBeNull()
    expect(touchOf('Read', { file_path: '/repo' }, root)).toBeNull()
  })

  test('a tool it does not know, or no path, gives null', () => {
    expect(touchOf('Bash', { command: 'cat /repo/a.ts', file_path: '/repo/a.ts' }, root)).toBeNull()
    expect(touchOf('Read', {}, root)).toBeNull()
  })
})
