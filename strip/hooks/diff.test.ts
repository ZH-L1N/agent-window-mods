import { describe, expect, test } from 'claude-code/testing'

import { LINE_CAP, STEP_CAP, clean, fromPatch, fromTexts, hunkHeader, stepOf } from './diff'

const numbered = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

/** An Edit result as the tool reports it, with only the fields the recorder reads. */
const edit = (over: Record<string, unknown>): Record<string, unknown> => ({
  filePath: '/repo/src/a.ts',
  oldString: '',
  newString: '',
  originalFile: null,
  structuredPatch: [],
  userModified: false,
  replaceAll: false,
  ...over,
})

describe('diff', () => {
  test('hunkHeader', async () => {
    expect(hunkHeader({ oldStart: 10, oldLines: 1, newStart: 10, newLines: 3 })).toBe('@@ -10,1 +10,3 @@')
    expect(STEP_CAP).toBe(50)
    expect(LINE_CAP).toBe(400)
  })

  test('an Edit that adds two lines after line 10', async () => {
    const step = stepOf(
      'Edit',
      edit({
        oldString: 'line 10',
        newString: 'line 10\nline 11\nline 12',
        originalFile: numbered(10),
        structuredPatch: [{ oldStart: 10, oldLines: 1, newStart: 10, newLines: 3, lines: [' line 10', '+line 11', '+line 12'] }],
      }),
    )
    expect(step?.file).toBe('/repo/src/a.ts')
    expect(step?.tool).toBe('Edit')
    expect(step?.adds).toBe(2)
    expect(step?.dels).toBe(0)
    expect(step?.lines[0]).toEqual({ kind: 'hunk', text: '@@ -10,1 +10,3 @@' })
    expect(step?.lines.slice(1)).toEqual([
      { kind: 'ctx', text: ' line 10' },
      { kind: 'add', text: '+line 11' },
      { kind: 'add', text: '+line 12' },
    ])
  })

  test('a new file', async () => {
    const step = stepOf('Write', {
      type: 'create',
      filePath: '/repo/new.txt',
      content: 'x\ny\n',
      originalFile: null,
      structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+x', '+y'] }],
    })
    expect(step?.tool).toBe('Write')
    expect(step?.lines[0]).toEqual({ kind: 'hunk', text: '@@ -0,0 +1,2 @@' })
    expect(step?.adds).toBe(2)
    expect(step?.dels).toBe(0)
  })

  test('patch lines: a space keeps, - removes, + adds, anything else is kept as context', async () => {
    const lines = fromPatch([
      { oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' same', '-old', '+new', '\\ No newline at end of file'] },
      { oldStart: 40, oldLines: 1, newStart: 40, newLines: 0, lines: ['-gone'] },
    ])
    expect(lines.map(l => l.kind)).toEqual(['hunk', 'ctx', 'del', 'add', 'ctx', 'hunk', 'del'])
    expect(lines[0]?.text).toBe('@@ -3,2 +3,2 @@')
    expect(lines[4]?.text).toBe('\\ No newline at end of file')
    expect(lines[5]?.text).toBe('@@ -40,1 +40,0 @@')
  })

  test('no patch, texts known', async () => {
    const original = numbered(12)
    const step = stepOf('Edit', edit({ oldString: 'line 10', newString: 'line ten', originalFile: original }))
    expect(step?.lines.map(l => l.text)).toEqual(['@@ -9,3 +9,3 @@', ' line 9', '-line 10', '+line ten', ' line 11'])
    expect(step?.lines.map(l => l.kind)).toEqual(['hunk', 'ctx', 'del', 'add', 'ctx'])
    expect(step?.adds).toBe(1)
    expect(step?.dels).toBe(1)
    // A Write falls back to the content it wrote.
    const write = stepOf('Write', { type: 'update', filePath: '/repo/b.txt', content: original.replace('line 3\n', ''), originalFile: original, structuredPatch: [] })
    expect(write?.lines.map(l => l.text)).toEqual(['@@ -2,3 +2,2 @@', ' line 2', '-line 3', ' line 4'])
    expect(write?.dels).toBe(1)
  })

  test('the fallback numbers hunks by the file: two far apart, an insertion, a new and an emptied file', async () => {
    const before = numbered(30)
    const far = fromTexts(before, before.replace('line 2\n', 'line two\n').replace('line 29\n', 'line twenty-nine\n'))
    expect(far.filter(l => l.kind === 'hunk').map(l => l.text)).toEqual(['@@ -1,3 +1,3 @@', '@@ -28,3 +28,3 @@'])
    const near = fromTexts(before, before.replace('line 2\n', 'line two\n').replace('line 4\n', 'line four\n'))
    expect(near.filter(l => l.kind === 'hunk').map(l => l.text)).toEqual(['@@ -1,5 +1,5 @@'])
    const inserted = fromTexts(before, before.replace('line 20\n', 'line 20\nextra\n'))
    expect(inserted.map(l => l.text)).toEqual(['@@ -20,2 +20,3 @@', ' line 20', '+extra', ' line 21'])
    expect(fromTexts('', 'x\ny\n').map(l => l.text)).toEqual(['@@ -0,0 +1,2 @@', '+x', '+y'])
    expect(fromTexts('x\ny\n', '').map(l => l.text)).toEqual(['@@ -1,2 +0,0 @@', '-x', '-y'])
    expect(fromTexts(before, before)).toEqual([])
    // More context on request.
    expect(fromTexts(before, before.replace('line 10\n', 'line ten\n'), 2)[0]?.text).toBe('@@ -8,5 +8,5 @@')
  })

  test('replaceAll replaces every occurrence', async () => {
    const original = 'a = 1\nkeep\na = 1\nkeep\nkeep\nkeep\na = 1\n'
    const all = stepOf('Edit', edit({ oldString: 'a = 1', newString: 'a = 2', originalFile: original, replaceAll: true }))
    expect(all?.adds).toBe(3)
    expect(all?.dels).toBe(3)
    const first = stepOf('Edit', edit({ oldString: 'a = 1', newString: 'a = 2', originalFile: original, replaceAll: false }))
    expect(first?.adds).toBe(1)
    expect(first?.dels).toBe(1)
    expect(first?.lines[0]?.text).toBe('@@ -1,2 +1,2 @@')
    // The new text is taken as written, never as a replacement pattern.
    const dollars = stepOf('Edit', edit({ oldString: 'keep', newString: "$& $1 $'", originalFile: 'keep\n' }))
    expect(dollars?.lines.map(l => l.text)).toEqual(['@@ -1,1 +1,1 @@', '-keep', "+$& $1 $'"])
  })

  test('nothing to go on', async () => {
    const step = stepOf('Edit', edit({ oldString: 'a', newString: 'b' }))
    expect(step?.lines).toEqual([{ kind: 'note', text: 'no diff available' }])
    expect(step?.adds).toBe(0)
    expect(step?.dels).toBe(0)
    // An old string that is not in the original cannot be replayed either.
    expect(stepOf('Edit', edit({ oldString: 'missing', newString: 'b', originalFile: 'x\n' }))?.lines).toEqual([{ kind: 'note', text: 'no diff available' }])
    // A patch of no usable hunk counts as none.
    expect(stepOf('Edit', edit({ structuredPatch: [{ oldStart: 'x' }, null] }))?.lines).toEqual([{ kind: 'note', text: 'no diff available' }])
  })

  test('long diffs are cut', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `+new ${i}`)
    const step = stepOf('Write', {
      type: 'create',
      filePath: '/repo/big.txt',
      content: '',
      originalFile: null,
      structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 500, lines }],
    })
    expect(step?.lines.length).toBe(LINE_CAP + 1)
    expect(step?.lines[LINE_CAP - 1]).toEqual({ kind: 'add', text: '+new 398' })
    expect(step?.lines[LINE_CAP]).toEqual({ kind: 'note', text: '101 more lines not shown' })
    // The counts are the whole diff's.
    expect(step?.adds).toBe(500)
    // A very long line is cut too.
    const wide = stepOf('Edit', edit({ structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [`+${'x'.repeat(5_000)}`] }] }))
    expect(wide?.lines[1]?.text.length).toBe(300)
  })

  test('a side over 2,000 lines is not diffed', async () => {
    const big = numbered(2_001)
    expect(fromTexts(big, 'x\n')).toEqual([{ kind: 'note', text: 'file too large to diff here' }])
    expect(fromTexts('x\n', big)).toEqual([{ kind: 'note', text: 'file too large to diff here' }])
    const ok = numbered(2_000)
    expect(fromTexts(ok, ok.replace('line 1999\n', 'changed\n'))[0]?.text).toBe('@@ -1998,3 +1998,3 @@')
  })

  test('garbage in', async () => {
    expect(stepOf('Edit', null)).toBe(null)
    expect(stepOf('Edit', {})).toBe(null)
    expect(stepOf('Edit', 'text')).toBe(null)
    expect(stepOf('Write', { filePath: '' })).toBe(null)
    expect(stepOf('Write', { filePath: 7 })).toBe(null)
    expect(stepOf('Write', [])).toBe(null)
  })

  test('text from a file is cleaned before it is kept', async () => {
    expect(clean('a\u001b[31mb\r\u0007\u009bc\td')).toBe('a[31mbc\td')
    expect(clean('abcdef', 3)).toBe('abc')
    const step = stepOf('Edit', edit({ filePath: '/repo/\u001b]0;x\u0007a.ts', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a\r', '+b\u001b[0m\r'] }] }))
    expect(step?.file).toBe('/repo/]0;xa.ts')
    expect(step?.lines.map(l => l.text)).toEqual(['@@ -1,1 +1,1 @@', '-a', '+b[0m'])
  })
})
