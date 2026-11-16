import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { ImageTile } from '../types'
import { PLUGIN, rowView, world } from './test-kit'

type PlacedState = Record<string, { tags: number[]; at: number; done?: true }>

/** The Placed row `id` as the engine asks for it: placed by `plugin` (this one by default), on `surface`. */
async function underView($: Engine, id: string, opts: { plugin?: string; surface?: 'terminal' | 'desktop' } = {}) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: opts.surface ?? 'terminal', component: 'Placed', props: { id, plugin: opts.plugin ?? PLUGIN } })
  const row = await ui.find({ key: 'img-under' })
  const rasters = (await ui.findAll({ type: 'Raster' })).map(r => {
    const p = (r.props ?? {}) as { key?: string; columns?: number; rows?: number }
    return { key: p.key ?? String((r as { key?: unknown }).key ?? ''), columns: p.columns ?? 0, rows: p.rows ?? 0 }
  })
  const captions = await ui.findAll({ type: 'Text', text: /^\[Image #/ })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return { isDrawn: row !== undefined, rasters, captions: captions.map(t => t.text), isDim: captions.every(t => (t.props as { dimColor?: boolean }).dimColor === true), texts }
}

test("under: a person's prompt with an image places a row", async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('look at [Image #1]')
  await w.settle()
  expect(w.places.length).toBe(1)
  expect(w.places[0]!.startsWith('img-')).toBe(true)
  const placed = w.state('placed') as PlacedState
  expect(Object.keys(placed)).toEqual([w.places[0]!])
  expect(placed[w.places[0]!]!.tags).toEqual([1])
  // A prompt with no image places nothing.
  await w.send('thanks')
  await w.settle()
  expect(w.places.length).toBe(1)
})

test('under: the caption comes first, the picture when it is ready', async ($, on) => {
  const w = await world($, on, { pngSize: { w: 800, h: 600 } })
  await w.start()
  w.paste(1, 1_000)
  await w.send('[Image #1]')
  await w.settle()
  const id = w.places[0]!
  const before = await underView($, id)
  expect(before.isDrawn).toBe(true)
  expect(before.captions).toEqual(['[Image #1] …'])
  expect(before.rasters).toEqual([])
  expect(before.isDim).toBe(true)
  await w.clock.advance(1_500)
  const after = await underView($, id)
  expect(after.rasters.map(r => r.key)).toEqual(['img-under-1'])
  expect(after.rasters[0]!.columns).toBeLessThanOrEqual(12)
  expect(after.rasters[0]!.rows).toBeLessThanOrEqual(6)
  expect(after.captions).toEqual(['[Image #1] 800x600'])
  expect(after.isDim).toBe(true)
  const thumbs = w.state('thumbs') as Record<string, ImageTile>
  expect([thumbs['1']!.columns, thumbs['1']!.rows]).toEqual([12, 3])
  // The band row keeps its own tile size.
  expect((w.state('tiles') as ImageTile[]).map(t => [t.columns, t.rows])).toEqual([[24, 6]])
})

test('under: under off places nothing', { options: { under: 'off' } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.places).toEqual([])
  // The band row is unchanged.
  expect((w.state('tiles') as ImageTile[]).map(t => t.n)).toEqual([1])
})

test('under: /img under off places nothing, is kept in the store, and /img under on places again', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(await w.command('under off')).toBe('Image thumbnails under the sent prompt off: /img under on turns them on again.')
  expect(w.store.get('under')).toBe('off')
  expect(w.state('under')).toBe('off')
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.places).toEqual([])
  expect((w.state('tiles') as ImageTile[]).map(t => t.n)).toEqual([1])
  expect(await w.command('under on')).toBe("Image thumbnails under the sent prompt on: a sent prompt's images are drawn under it in the transcript.")
  expect(w.store.get('under')).toBe('on')
  w.paste(2)
  await w.send('[Image #2]')
  await w.settle()
  expect(w.places.length).toBe(1)
})

test('under: a stored under off holds in the next session, over the option', { options: { under: 'on' } }, async ($, on) => {
  const w = await world($, on, { stored: { under: 'off' } })
  await w.start()
  expect(w.state('under')).toBe('off')
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  expect(w.places).toEqual([])
})

test("under: a plugin's prompt and a subagent's place nothing", async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]', { origin: 'plugin' })
  await w.settle()
  expect(w.places).toEqual([])
  await w.send('[Image #1]', { command: { name: 'review', args: '[Image #1]' } })
  await w.settle()
  expect(w.places).toEqual([])
  // A person's prompt waits for the main loop's turn: a subagent's turn places nothing.
  await w.send('[Image #1]', { isTurn: false })
  await w.turn('agent-1')
  await w.settle()
  expect(w.places).toEqual([])
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
})

test("under: another plugin's placed row is passed on", async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const id = w.places[0]!
  for (const plugin of ['other', 'other@market', 'images-extra']) {
    const v = await underView($, id, { plugin })
    expect(v.isDrawn).toBe(false)
    expect(v.texts).toEqual(['beneath'])
  }
  // This plugin by its marketplace name is drawn.
  expect((await underView($, id, { plugin: 'images@some-market' })).isDrawn).toBe(true)
  // An id this plugin never placed (or forgot) is passed on.
  const unknown = await underView($, 'img-999')
  expect(unknown.isDrawn).toBe(false)
  expect(unknown.texts).toEqual(['beneath'])
})

test('under: the desktop surface is passed on', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const v = await underView($, w.places[0]!, { surface: 'desktop' })
  expect(v.isDrawn).toBe(false)
  expect(v.texts).toEqual(['beneath'])
})

test('under: old rows are forgotten', async ($, on) => {
  const w = await world($, on)
  await w.start()
  for (let n = 1; n <= 13; n++) {
    w.paste(n)
    await w.send(`[Image #${n}]`)
    await w.settle()
  }
  expect(w.places.length).toBe(13)
  const placed = w.state('placed') as PlacedState
  expect(Object.keys(placed).length).toBe(12)
  expect(Object.keys(placed)).toEqual(w.places.slice(1))
  expect(placed[w.places[0]!]).toBeUndefined()
  // The forgotten row is passed on; the newest is drawn.
  expect((await underView($, w.places[0]!)).isDrawn).toBe(false)
  expect((await underView($, w.places[12]!)).captions).toEqual(['[Image #13] 1376x688'])
})

test('under: at most 24 thumbnails are kept, the newest', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const tags = Array.from({ length: 26 }, (_, i) => i + 1)
  for (const n of tags) w.paste(n)
  // Two prompts of 13 images each.
  await w.send(tags.slice(0, 13).map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  await w.send(tags.slice(13).map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  const thumbs = w.state('thumbs') as Record<string, ImageTile>
  expect(Object.keys(thumbs).map(Number).sort((a, b) => a - b)).toEqual(tags.slice(2))
  // One row per prompt, each with its own tags.
  const placed = w.state('placed') as PlacedState
  expect(Object.values(placed).map(r => r.tags.length)).toEqual([13, 13])
})

test('under: one column per tag, in the order of the prompt', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  w.paste(1)
  await w.send('[Image #2] then [Image #1]')
  await w.settle()
  const v = await underView($, w.places[0]!)
  expect(v.rasters.map(r => r.key)).toEqual(['img-under-2', 'img-under-1'])
  expect(v.captions).toEqual(['[Image #2] 1376x688', '[Image #1] 1376x688'])
})

for (const reason of ['clear', 'resume'] as const) {
  test(`under: a ${reason} forgets the placed rows and the thumbnails`, async ($, on) => {
    const w = await world($, on)
    await w.start()
    w.paste(1)
    await w.send('[Image #1]')
    await w.settle()
    await w.sessionEnd('other')
    expect(Object.keys(w.state('placed') as PlacedState).length).toBe(1)
    await w.sessionEnd(reason)
    expect(w.state('placed')).toEqual({})
    expect(w.state('thumbs')).toEqual({})
  })
}

for (const how of ['/img off', 'auto off'] as const) {
  test(`under: the band off still places a row (${how})`, { options: how === 'auto off' ? { auto: 'off' } : {} }, async ($, on) => {
    const w = await world($, on, { pngSize: { w: 800, h: 600 } })
    await w.start()
    if (how === '/img off') await w.command('off')
    w.paste(1)
    await w.send('[Image #1]')
    await w.settle()
    expect(w.places.length).toBe(1)
    expect(Object.keys(w.state('thumbs') as Record<string, ImageTile>)).toEqual(['1'])
    expect((await underView($, w.places[0]!)).captions).toEqual(['[Image #1] 800x600'])
    // Nothing is added to the band: no tile was ever written, and the band stays hidden.
    expect(w.state('tiles')).toBeUndefined()
    expect(w.state('shown')).toBe(false)
    expect(await rowView($)).toBeNull()
  })
}

test('under: an id never repeats after a reload', async ($, on) => {
  const w = await world($, on)
  await w.start()
  for (let n = 1; n <= 13; n++) {
    w.paste(n)
    await w.send(`[Image #${n}]`)
    await w.settle()
  }
  const before = [...w.places]
  const stampOf = (id: string) => id.split('-')[1]
  // A reload starts the run numbers again; the new load's stamp keeps the ids apart.
  await w.clock.advance(60_000)
  await w.start()
  w.paste(14)
  await w.send('[Image #14]')
  await w.settle()
  const id = w.places[13]!
  expect(before.includes(id)).toBe(false)
  expect(/^img-[0-9a-z]+-[0-9]+$/.test(id)).toBe(true)
  expect(id.length).toBeLessThanOrEqual(64)
  expect(new Set(before.map(stampOf)).size).toBe(1)
  expect(stampOf(id) === stampOf(before[0]!)).toBe(false)
})

for (const how of ['a newer prompt', '/img off', '/img clear'] as const) {
  test(`under: a stopped run stops claiming to load (${how})`, async ($, on) => {
    const w = await world($, on)
    await w.start()
    w.paste(1)
    w.paste(2, 3_000)
    await w.send('[Image #1] [Image #2]')
    await w.settle()
    const id = w.places[0]!
    expect((await underView($, id)).captions).toEqual(['[Image #1] 1376x688', '[Image #2] \u2026'])
    if (how === 'a newer prompt') await w.send('thanks')
    else await w.command(how === '/img off' ? 'off' : 'clear')
    await w.clock.advance(6_000)
    expect((await underView($, id)).captions).toEqual(['[Image #1] 1376x688', '[Image #2]'])
    expect((w.state('placed') as PlacedState)[id]!.done).toBe(true)
  })
}

test('under: a dropped thumbnail stops claiming to load', async ($, on) => {
  const w = await world($, on)
  await w.start()
  const tags = Array.from({ length: 26 }, (_, i) => i + 1)
  for (const n of tags) w.paste(n)
  await w.send(tags.slice(0, 13).map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  await w.send(tags.slice(13).map(n => `[Image #${n}]`).join(' '))
  await w.settle()
  // Thumbnails 1 and 2 were dropped by the cap; the first row's run had ended.
  const first = await underView($, w.places[0]!)
  expect(first.captions.slice(0, 3)).toEqual(['[Image #1]', '[Image #2]', '[Image #3] 1376x688'])
  expect(first.rasters.length).toBe(11)
})

test('under: a prompt typed over a turn is placed when its turn starts', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running' })
  await w.settle()
  // The band starts at once; the row waits for the prompt to join the transcript.
  expect((w.state('tiles') as ImageTile[]).map(t => t.n)).toEqual([2])
  expect(Object.keys(w.state('thumbs') as Record<string, ImageTile>)).toEqual(['2'])
  expect(w.places).toEqual([])
  await w.turn('agent-1')
  await w.settle()
  expect(w.places).toEqual([])
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
  const v = await underView($, w.places[0]!)
  expect(v.rasters.map(r => r.key)).toEqual(['img-under-2'])
  expect(v.captions).toEqual(['[Image #2] 1376x688'])
  expect((w.state('placed') as PlacedState)[w.places[0]!]).toEqual({ tags: [2], at: expect.any(Number), done: true })
  // Placed once.
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
  // A /clear drops a row still waiting.
  w.paste(3)
  await w.send('[Image #3]', { isTurn: false, turnId: 't-running-2' })
  await w.settle()
  await w.sessionEnd('clear')
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
  // A newer prompt's turn places the waiting row first, then its own.
  w.paste(4)
  await w.send('[Image #4]', { isTurn: false, turnId: 't-running-3' })
  await w.settle()
  w.paste(5)
  await w.send('[Image #5]')
  await w.settle()
  expect(w.places.length).toBe(3)
  const placed = w.state('placed') as PlacedState
  expect(w.places.slice(1).map(id => placed[id]!.tags)).toEqual([[4], [5]])
})

test('under: a model request of the running turn places nothing; the row waits for the turn\'s end', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running' })
  await w.settle()
  expect(w.places).toEqual([])
  // The mod stands in no model stream: neither a subagent's request nor the main loop's places the row.
  await w.step('agent-1')
  await w.step()
  await w.settle()
  expect(w.places).toEqual([])
  // The prompt was delivered into the running turn, so no turn of its own starts: the row is placed once that turn has ended and the grace has passed.
  await w.complete()
  await w.settle()
  expect(w.places).toEqual([])
  await w.clock.advance(1500)
  expect(w.places.length).toBe(1)
  expect((w.state('placed') as PlacedState)[w.places[0]!]).toEqual({ tags: [2], at: expect.any(Number), done: true })
  // Placed once: later requests and the next turn place nothing more for it.
  await w.step()
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
  // A newer prompt's row comes after it.
  w.paste(3)
  await w.send('[Image #3]')
  await w.settle()
  expect(w.places.length).toBe(2)
  expect((w.state('placed') as PlacedState)[w.places[1]!]!.tags).toEqual([3])
})

test('under: a prompt typed over a turn that only ends is placed at its end', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running' })
  await w.settle()
  expect(w.places).toEqual([])
  // A subagent's end places nothing.
  await w.complete('agent-1')
  await w.settle()
  expect(w.places).toEqual([])
  await w.complete()
  await w.settle()
  expect(w.places).toEqual([])
  await w.clock.advance(1500)
  expect(w.places.length).toBe(1)
  expect((w.state('placed') as PlacedState)[w.places[0]!]!.tags).toEqual([2])
  // Placed once: the next turn places nothing more for it.
  await w.turn()
  await w.step()
  await w.settle()
  expect(w.places.length).toBe(1)
})

test('under: a prompt held for a turn of its own is placed at that turn\'s start, not at the earlier turn\'s end', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running' })
  await w.settle()
  // The running turn ends; the prompt's own turn starts right after, inside the grace.
  await w.complete()
  await w.settle()
  expect(w.places).toEqual([])
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
  // The grace runs out: nothing is placed a second time.
  await w.clock.advance(2000)
  expect(w.places.length).toBe(1)
})

test('under: a prompt the person asked to wait is left to its own turn, however late', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(2)
  await w.send('[Image #2]', { isTurn: false, turnId: 't-running', wait: true })
  await w.settle()
  await w.complete()
  await w.clock.advance(5000)
  expect(w.places).toEqual([])
  await w.turn()
  await w.settle()
  expect(w.places.length).toBe(1)
})

test('under: under off keeps the rows already placed', async ($, on) => {
  const w = await world($, on)
  await w.start()
  w.paste(1)
  await w.send('[Image #1]')
  await w.settle()
  const id = w.places[0]!
  await w.command('under off')
  const v = await underView($, id)
  expect(v.isDrawn).toBe(true)
  expect(v.captions).toEqual(['[Image #1] 1376x688'])
  w.paste(2)
  await w.send('[Image #2]')
  await w.settle()
  expect(w.places).toEqual([id])
})
