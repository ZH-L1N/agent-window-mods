import { describe, expect, test } from 'claude-code/testing'

import { healthStep, healthText } from './health'
import type { Health } from './health'

const OK: Health = { kind: 'ok' }
const T = 1_000_000

const fail = (error: string, at = T, h: Health = OK): Health => healthStep(h, { type: 'stop-failure', error, at })
const turn = (h: Health, reason: 'answer' | 'aborted' | 'refusal' | 'error', at: number): Health => healthStep(h, { type: 'turn', reason, at })
const limits = (h: Health, list: { kind: string; percentUsed: number }[], at: number): Health => healthStep(h, { type: 'limits', limits: list, at })

describe('health', () => {
  test('a stop failure on the login gives login', async () => {
    for (const error of ['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold', 'verification_required', 'cloud_credential_error']) {
      const h = fail(error)
      expect(h).toEqual({ kind: 'login', at: T, detail: error })
      expect(healthText(h)).toBe('login expired')
    }
  })

  test('a stop failure on a rate or billing limit gives limit', async () => {
    for (const error of ['rate_limit', 'billing_error']) {
      const h = fail(error)
      expect(h).toEqual({ kind: 'limit', at: T, detail: error })
      expect(healthText(h)).toBe('limit reached')
    }
  })

  test('any other stop failure gives error, its detail the error name', async () => {
    for (const error of ['overloaded', 'server_error', 'invalid_request', 'model_not_found', 'max_output_tokens', 'unknown']) {
      const h = fail(error)
      expect(h).toEqual({ kind: 'error', at: T, detail: error })
      expect(healthText(h)).toBe('turn failed')
    }
    // A later failure replaces an earlier one.
    expect(fail('authentication_failed', T + 5, fail('overloaded'))).toEqual({ kind: 'login', at: T + 5, detail: 'authentication_failed' })
  })

  test('an answered turn clears everything', async () => {
    for (const h of [fail('authentication_failed'), fail('rate_limit'), fail('overloaded'), limits(OK, [{ kind: 'five_hour', percentUsed: 100 }], T)]) {
      expect(turn(h, 'answer', T + 60_000)).toEqual(OK)
    }
    expect(turn(OK, 'answer', T)).toEqual(OK)
    expect(healthText(OK)).toBe(null)
  })

  test('a turn that ends on an error keeps a login or limit set within 10 seconds', async () => {
    const login = fail('authentication_failed')
    expect(turn(login, 'error', T + 10_000)).toEqual(login)
    const limit = fail('billing_error')
    expect(turn(limit, 'error', T + 200)).toEqual(limit)
  })

  test('a turn that ends on an error otherwise gives error', async () => {
    const want = { kind: 'error', at: T + 10_001, detail: 'the last turn ended on an API error' }
    expect(turn(fail('authentication_failed'), 'error', T + 10_001)).toEqual(want)
    expect(turn(OK, 'error', T + 10_001)).toEqual(want)
    expect(healthText(turn(OK, 'error', T))).toBe('turn failed')
    // Only a login or a limit is kept: a named error just before is replaced too.
    expect(turn(fail('overloaded'), 'error', T + 50)).toEqual({ kind: 'error', at: T + 50, detail: 'the last turn ended on an API error' })
  })

  test('aborted and refusal change nothing', async () => {
    for (const h of [OK, fail('rate_limit'), fail('overloaded')]) {
      expect(turn(h, 'aborted', T + 99)).toBe(h)
      expect(turn(h, 'refusal', T + 99)).toBe(h)
    }
  })

  test('a refusal does not clear a login failure', async () => {
    const login = fail('authentication_failed')
    expect(turn(login, 'refusal', T + 60_000)).toEqual({ kind: 'login', at: T, detail: 'authentication_failed' })
    expect(healthText(turn(login, 'refusal', T + 60_000))).toBe('login expired')
  })

  test('a window at 100 percent or more gives limit', async () => {
    const h = limits(OK, [{ kind: 'five_hour', percentUsed: 62 }, { kind: 'seven_day', percentUsed: 100 }], T)
    expect(h).toEqual({ kind: 'limit', at: T, detail: 'seven_day at 100%' })
    expect(limits(OK, [{ kind: 'spend_limit', percentUsed: 104.5 }], T)).toEqual({ kind: 'limit', at: T, detail: 'spend_limit at 104.5%' })
    expect(healthText(h)).toBe('limit reached')
    // Under 100 nothing is wrong.
    expect(limits(OK, [{ kind: 'five_hour', percentUsed: 99.9 }], T)).toEqual(OK)
    expect(limits(OK, [], T)).toEqual(OK)
  })

  test('a limit that came from limits clears when no window is at 100 any more', async () => {
    const h = limits(OK, [{ kind: 'five_hour', percentUsed: 100 }], T)
    expect(limits(h, [{ kind: 'five_hour', percentUsed: 100 }], T + 5)).toEqual(h)
    expect(limits(h, [{ kind: 'five_hour', percentUsed: 3 }], T + 9)).toEqual(OK)
    expect(limits(h, [], T + 9)).toEqual(OK)
  })

  test('a limit from a stop failure, a login and an error outlive a quiet limits reading', async () => {
    for (const h of [fail('rate_limit'), fail('authentication_failed'), fail('overloaded')]) {
      expect(limits(h, [{ kind: 'five_hour', percentUsed: 3 }], T + 9)).toBe(h)
    }
  })

  test('an event of no known shape changes nothing', async () => {
    const h = fail('rate_limit')
    expect(healthStep(h, { type: 'limits', limits: [{ kind: 'five_hour', percentUsed: Number.NaN }], at: T })).toBe(h)
    expect(healthStep(h, { type: 'nonsense' } as never)).toBe(h)
  })
})
