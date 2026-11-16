import { describe, expect, test } from 'claude-code/testing'

import { ORDER, REPLACED, arrangeRows, bareName } from './order'

type Row = { plugin: string; tree: { type: string } }
const row = (plugin: string): Row => ({ plugin, tree: { type: 'Box' } })
const names = (rows: readonly Row[]): string[] => rows.map(r => r.plugin)
const HIDE = { showOld: false, keepHandoff: false }

describe('order', () => {
  test('no strip row, nothing changes', async () => {
    const rows = ['next', 'sys', 'handoff', 'agents', 'cache-clock', 'token-weather'].map(row)
    const out = arrangeRows(rows, HIDE)
    expect(out.length).toBe(rows.length)
    for (let i = 0; i < rows.length; i++) expect(out[i]).toBe(rows[i])
    expect(arrangeRows([], HIDE)).toEqual([])
  })

  test('the four old rows are hidden when the strip drew', async () => {
    const rows = ['sys', 'token-weather', 'handoff', 'cache-clock', 'strip'].map(row)
    expect(names(arrangeRows(rows, HIDE))).toEqual(['strip'])
    expect([...REPLACED]).toEqual(['sys', 'token-weather', 'handoff', 'cache-clock'])
  })

  test('a HANDOFF row with something to act on stays', async () => {
    const rows = ['agents', 'sys', 'handoff', 'cache-clock', 'strip', 'next'].map(row)
    expect(names(arrangeRows(rows, { showOld: false, keepHandoff: true }))).toEqual(['strip', 'handoff', 'agents', 'next'])
    // Only a row that is there is kept.
    const none = ['sys', 'strip', 'next'].map(row)
    expect(names(arrangeRows(none, { showOld: false, keepHandoff: true }))).toEqual(['strip', 'next'])
  })

  test('showOld keeps all four', async () => {
    const rows = ['cache-clock', 'agents', 'handoff', 'strip', 'token-weather', 'sys', 'breathe'].map(row)
    expect(names(arrangeRows(rows, { showOld: true, keepHandoff: false }))).toEqual([
      'breathe',
      'strip',
      'sys',
      'token-weather',
      'handoff',
      'cache-clock',
      'agents',
    ])
  })

  test('the order table', async () => {
    expect([...ORDER]).toEqual(['motion-hold', 'breathe', 'strip', 'smart-compact', 'agents', 'goal-meter', 'here', 'queue', 'next', 'images'])
    const rows = ['images', 'somebody-else', 'next', 'queue', 'here', 'goal-meter', 'agents', 'another', 'smart-compact', 'strip', 'breathe', 'motion-hold'].map(row)
    expect(names(arrangeRows(rows, HIDE))).toEqual([
      'motion-hold',
      'breathe',
      'strip',
      'smart-compact',
      'agents',
      'goal-meter',
      'here',
      'queue',
      'next',
      'images',
      'somebody-else',
      'another',
    ])
  })

  test('a marketplace suffix is ignored', async () => {
    expect(bareName('handoff@zehui-mods')).toBe('handoff')
    expect(bareName('strip')).toBe('strip')
    const rows = ['agents@zehui-mods', 'handoff@zehui-mods', 'sys@zehui-mods', 'strip@zehui-mods'].map(row)
    expect(names(arrangeRows(rows, HIDE))).toEqual(['strip@zehui-mods', 'agents@zehui-mods'])
    expect(names(arrangeRows(rows, { showOld: false, keepHandoff: true }))).toEqual(['strip@zehui-mods', 'handoff@zehui-mods', 'agents@zehui-mods'])
  })

  test('rows are passed by identity', async () => {
    const rows = ['sys', 'token-weather', 'handoff', 'cache-clock', 'strip', 'next', 'agents', 'unknown'].map(row)
    for (const o of [HIDE, { showOld: true, keepHandoff: false }, { showOld: false, keepHandoff: true }]) {
      const out = arrangeRows(rows, o)
      for (const r of out) expect(rows.some(x => x === r)).toBe(true)
      // Each at most once.
      expect(new Set(out).size).toBe(out.length)
    }
    // A row handed in twice comes out once.
    const strip = row('strip')
    const next = row('next')
    expect(arrangeRows([next, strip, next], HIDE)).toEqual([strip, next])
    expect(arrangeRows([next, strip, next], HIDE)[1]).toBe(next)
  })
})
