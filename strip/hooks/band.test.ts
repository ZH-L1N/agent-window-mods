import { describe, expect, test } from 'claude-code/testing'

import { BAND_DEFAULT, BAND_NAMES, BAND_OFF, BAND_SHADES, bandColorOf, bandLabel } from './band'

describe('band', () => {
  test('a shade by name, in any case', () => {
    expect(bandColorOf('moss')).toBe('#18271d')
    expect(bandColorOf(' Cocoa ')).toBe('#2a1f1d')
    for (const name of BAND_NAMES) expect(bandColorOf(name)).toBe(BAND_SHADES[name])
  })

  test('a colour as #rrggbb, answered in lowercase', () => {
    expect(bandColorOf('#ABCDEF')).toBe('#abcdef')
    expect(bandColorOf('#18271d')).toBe('#18271d')
  })

  test('off', () => {
    expect(bandColorOf('off')).toBe(BAND_OFF)
    expect(bandColorOf('OFF')).toBe(BAND_OFF)
  })

  test('anything else is no choice', () => {
    for (const bad of ['', 'green', '#12345', '#1234567', '#12345g', 'abcdef', '18271d', 'constructor', 'toString', '__proto__', 'surface']) {
      expect(bandColorOf(bad)).toBeNull()
    }
    for (const bad of [undefined, null, 7, true, {}, ['moss']]) expect(bandColorOf(bad)).toBeNull()
  })

  test('the default is a named shade, and no shade is the pills\' own grey', () => {
    expect(BAND_SHADES[BAND_DEFAULT]).toBe('#18271d')
    for (const name of BAND_NAMES) {
      expect(BAND_SHADES[name]).toMatch(/^#[0-9a-f]{6}$/)
      expect(BAND_SHADES[name]).not.toBe('#313244')
    }
  })

  test('a label names the shade where it has a name', () => {
    expect(bandLabel('#18271d')).toBe('moss #18271d')
    expect(bandLabel('#abcdef')).toBe('#abcdef')
  })
})
