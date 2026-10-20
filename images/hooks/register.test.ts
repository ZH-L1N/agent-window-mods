import { expect, test } from 'claude-code/testing'

import { USAGE } from './kit'
import { rowView, world } from './test-kit'

test('box: a pasted tag adds a tile; typing that leaves the tags alone writes nothing', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await rowView($)).toBeNull()
  await w.type('look at ')
  expect(w.state('tags')).toBeUndefined()
  await w.type('[Image #1]')
  expect(w.state('tags')).toEqual([1])
  expect((await rowView($))?.captions).toEqual(['[Image #1] · 48×24'])
  await w.type(' and ')
  await w.type('[Image #2]')
  expect(w.state('tags')).toEqual([1, 2])
  expect((await rowView($))?.tiles.map(t => t.key)).toEqual(['images-tile-1', 'images-tile-2'])
})

test('box: tiles leave when their tag leaves the box (an undo, a clear, history)', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1] [Image #2]')
  await w.change('[Image #2]', 'undo')
  expect((await rowView($))?.captions).toEqual(['[Image #2] · 48×24'])
  await w.change('', 'clear')
  expect(w.state('tags')).toEqual([])
  expect(await rowView($)).toBeNull()
  // A recalled entry with a tag brings a tile back.
  await w.change('fix this [Image #14]', 'history')
  expect(w.state('tags')).toEqual([14])
})

test('box: a sent prompt and a /clear empty the list; another end keeps it', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #3]')
  await w.submit('[Image #3]')
  expect(w.state('tags')).toEqual([])
  await w.type('[Image #4]')
  await w.sessionEnd('other')
  expect(w.state('tags')).toEqual([4])
  await w.sessionEnd('clear')
  expect(w.state('tags')).toEqual([])
})

test('box: with the last write not known (a session start, as after a hot reload), an emptied box still empties the kept list', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect(w.state('tags')).toEqual([1])
  // The state survives; the module's memory of the last write does not.
  await w.start()
  await w.change('', 'undo')
  expect(w.state('tags')).toEqual([])
  expect(await rowView($)).toBeNull()
})

test('command: /images lists the tags; off hides the row and is kept in the store; on shows it', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('')).toBe('No image tags in the prompt box; tiles on.')
  await w.type('[Image #1][Image #5]')
  expect(await w.command('')).toContain('In the prompt box: [Image #1], [Image #5]; tiles on.')
  expect(await w.command('off')).toBe('Image tiles off: /images on shows them again.')
  expect(w.store.get('band')).toBe('off')
  expect(await rowView($)).toBeNull()
  expect(await w.command('on')).toBe('Image tiles on.')
  expect(w.store.get('band')).toBe('on')
  expect(await rowView($)).not.toBeNull()
  expect(await w.command('maybe')).toBe(USAGE)
})

test('command: a stored off holds in the next session', async ($, on) => {
  const w = await world($, on, { stored: { band: 'off' } })
  await w.start()
  await w.type('[Image #1]')
  expect(w.state('band')).toBe('off')
  expect(await rowView($)).toBeNull()
})

test('options: the default size draws a 48 by 24 tile', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect((await rowView($))?.tiles[0]).toEqual({ key: 'images-tile-1', columns: 48, rows: 24 })
})

test('options: size 16', { options: { size: '16' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect((await rowView($))?.tiles[0]).toEqual({ key: 'images-tile-1', columns: 32, rows: 16 })
})

test('options: size 32', { options: { size: '32' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect((await rowView($))?.tiles[0]).toEqual({ key: 'images-tile-1', columns: 64, rows: 32 })
})

test('options: an unlisted size is the default 24', { options: { size: '20' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.type('[Image #1]')
  expect((await rowView($))?.tiles[0]).toEqual({ key: 'images-tile-1', columns: 48, rows: 24 })
})
