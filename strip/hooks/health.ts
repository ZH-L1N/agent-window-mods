// Session health: what the engine's own signals say is wrong with the
// session. Pure: a state and a step. Three signals feed it: a turn that died
// on an API error (classic.StopFailure names the error), how a main-loop turn
// ended, and the rate-limit windows of a measurement. The engine gives no
// signal for a Remote Control link, so that condition is not known here.
import type { Health } from '../types'
import { noControls } from './diff'

export type { Health }

export type HealthEvent =
  | { type: 'stop-failure'; error: string; at: number }
  | { type: 'turn'; reason: 'answer' | 'aborted' | 'refusal' | 'error'; at: number }
  | { type: 'limits'; limits: readonly { kind: string; percentUsed: number }[]; at: number }

/** API errors that mean the login no longer works. */
const LOGIN_ERRORS: readonly string[] = ['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold', 'verification_required', 'cloud_credential_error']
/** API errors that mean a rate or spend limit was reached. */
const LIMIT_ERRORS: readonly string[] = ['rate_limit', 'billing_error']
/** A login or limit failure this recent belongs to the turn that just ended on an error. */
const SAME_TURN_MS = 10_000
const TURN_ERROR = 'the last turn ended on an API error'
/** The detail of a limit read off the windows, as `limitDetail` writes it. */
const FROM_LIMITS = / at \d+(\.\d+)?%$/

/** A word of the engine's, safe to draw: no control characters (tab included), at most 80 characters. */
const word = (s: unknown): string =>
  noControls(String(s ?? ''))
    .replace(/\t/g, '')
    .slice(0, 80)

const limitDetail = (w: { kind: string; percentUsed: number }): string => `${word(w.kind)} at ${Math.round(w.percentUsed * 10) / 10}%`

/** The health after one event. An event that changes nothing answers the same object. */
export function healthStep(h: Health, ev: HealthEvent): Health {
  if (ev.type === 'stop-failure') {
    const kind = LOGIN_ERRORS.includes(ev.error) ? 'login' : LIMIT_ERRORS.includes(ev.error) ? 'limit' : 'error'
    return { kind, at: ev.at, detail: word(ev.error) }
  }
  if (ev.type === 'turn') {
    if (ev.reason === 'answer') return h.kind === 'ok' ? h : { kind: 'ok' }
    if (ev.reason !== 'error') return h
    if ((h.kind === 'login' || h.kind === 'limit') && ev.at - h.at <= SAME_TURN_MS) return h
    return { kind: 'error', at: ev.at, detail: TURN_ERROR }
  }
  if (ev.type === 'limits') {
    const full = ev.limits.filter(w => w && typeof w.percentUsed === 'number' && w.percentUsed >= 100)
    if (full.length > 0) {
      const top = full.reduce((a, b) => (b.percentUsed > a.percentUsed ? b : a))
      const detail = limitDetail(top)
      return h.kind === 'limit' && h.detail === detail ? h : { kind: 'limit', at: ev.at, detail }
    }
    // Only a limit these windows raised is theirs to clear, and only on a reading that is one.
    const isReadable = ev.limits.every(w => w && Number.isFinite(w.percentUsed))
    if (h.kind === 'limit' && FROM_LIMITS.test(h.detail) && isReadable) return { kind: 'ok' }
    return h
  }
  return h
}

/** The health pill's words; null while nothing is wrong. */
export function healthText(h: Health): string | null {
  if (h.kind === 'login') return 'login expired'
  if (h.kind === 'limit') return 'limit reached'
  if (h.kind === 'error') return 'turn failed'
  return null
}
