import { describe, expect, test } from 'claude-code/testing'

import { settleAll } from './kit'
import { CLIP_MS, REACT_MS, isPending, react, settle, shown } from './ladder'

describe('ladder', () => {
  test('first sight', () => {
    expect(settle(undefined, 'a', 1000)).toEqual({ pose: 'a', clipAt: 1000 })
  })

  test('the same pose keeps its clip', () => {
    const rec = { pose: 'a', clipAt: 0 }
    expect(settle(rec, rec.pose, 5_300)).toBe(rec)
  })

  test('a change waits for the clip', () => {
    const rec = { pose: 'a', clipAt: 0 }
    expect(settle(rec, 'b', 1500)).toBe(rec)
    expect(settle(rec, 'b', 2000)).toEqual({ pose: 'b', clipAt: 2000 })
    expect(settle(rec, 'b', 4300)).toEqual({ pose: 'b', clipAt: 4000 })
    expect(CLIP_MS).toBe(2000)
  })

  test('a reaction cuts in at once', () => {
    const rec = react({ pose: 'a', clipAt: 0 }, 'finished', 'c', 500)
    expect(rec).toEqual({ pose: 'a', clipAt: 0, reaction: { kind: 'finished', pose: 'c', at: 500, until: 500 + REACT_MS } })
    expect(shown(rec, 500)).toMatchObject({ pose: 'c', isReacting: true })
    // With no record yet, the reaction starts one at its own pose.
    expect(react(undefined, 'error', 'e', 10)).toEqual({ pose: 'e', clipAt: 10, reaction: { kind: 'error', pose: 'e', at: 10, until: 3010 } })
  })

  test('a reaction lasts three seconds, then rests', () => {
    const rec = react({ pose: 'a', clipAt: 0 }, 'finished', 'c', 500)
    expect(shown(rec, 3499)).toMatchObject({ pose: 'c', isReacting: true })
    expect(settle(rec, 'r', 3499)).toBe(rec)
    expect(isPending(rec, 'r', 3499)).toBe(true)
    const rested = settle(rec, 'r', 3500)
    expect(rested).toEqual({ pose: 'r', clipAt: 3500 })
    expect(shown(rested, 3500)).toMatchObject({ pose: 'r', isReacting: false })
    expect(isPending(rested, 'r', 3500)).toBe(false)
  })

  test('the bob follows the clip', () => {
    const rec = { pose: 'a', clipAt: 700 }
    expect(shown(rec, 700).isBobbed).toBe(false)
    expect(shown(rec, 1699).isBobbed).toBe(false)
    expect(shown(rec, 1700).isBobbed).toBe(true)
    expect(shown(rec, 2699).isBobbed).toBe(true)
    expect(shown(rec, 2700).isBobbed).toBe(false)
    // A reaction's bob counts from the reaction's own start.
    const r = react(rec, 'tool-error', 'x', 1_234)
    expect(shown(r, 1_234).isBobbed).toBe(false)
    expect(shown(r, 2_234).isBobbed).toBe(true)
  })

  test('a pose that waits for its clip is pending', () => {
    const rec = { pose: 'a', clipAt: 0 }
    expect(isPending(rec, 'a', 500)).toBe(false)
    expect(isPending(rec, 'b', 500)).toBe(true)
  })

  test('settleAll keeps a reacting record whose card it does not know yet, until the reaction ends', () => {
    // A hook wrote this reaction for a card the tick's list did not hold yet.
    const recs = { main: { pose: 'h', clipAt: 0 }, a9: react(undefined, 'finished', 'c', 1_000) }
    const wanted = { main: 'h' }
    expect(settleAll(recs, wanted, 3_999)).toBe(recs)
    expect(settleAll(recs, wanted, 4_000)).toEqual({ main: { pose: 'h', clipAt: 0 } })
  })

  test('settleAll drops a record with no reaction whose card is gone', () => {
    const recs = { main: { pose: 'h', clipAt: 0 }, a1: { pose: 'a', clipAt: 0 } }
    expect(settleAll(recs, { main: 'h' }, 500)).toEqual({ main: { pose: 'h', clipAt: 0 } })
  })

  test('settleAll returns the very same object when no record moves', () => {
    const recs = { main: { pose: 'h', clipAt: 0 }, a1: { pose: 'a', clipAt: 0 } }
    expect(settleAll(recs, { main: 'h', a1: 'a' }, 9_000)).toBe(recs)
    // A pose that waits for its clip moves nothing either.
    expect(settleAll(recs, { main: 'h', a1: 'b' }, 1_500)).toBe(recs)
  })
})
