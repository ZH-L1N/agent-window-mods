// Monitor watchers and CronCreate timers: what a watch's command targets,
// a cron expression's next fire time, the time-left words, and the event
// notifications a watch sends. Plain string and date work, no engine calls;
// register.tsx keeps the books.
import { wordsOf } from './shells'

/** How long an entry stays grey after a stale notification. */
export const STALE_MS = 10_000
/**
 * How recently another watch on the same target must have ended done for a
 * notification to count as stale; a later wait on that target (a second
 * round, a re-armed Monitor) is fresh and toasts.
 */
export const DONE_RECENT_MS = 60_000

/**
 * What a watch's command watches, for the band and for spotting a second
 * watch on a target already done: a herdr pane (`w1:p6`), then a commit or
 * run id (seven or more hex characters with a digit among them, or a number
 * of five or more digits). Undefined when the command names none.
 */
export function targetOf(command: string): string | undefined {
  const pane = /\bw\d+[A-Za-z]?:p\w+\b/.exec(command)?.[0]
  if (pane) return pane
  for (const w of wordsOf(command)) {
    const word = w.replace(/^[#@]/, '')
    if (/^[0-9a-f]{7,40}$/i.test(word) && /\d/.test(word) && /[a-f]/i.test(word)) return word.slice(0, 7)
    if (/^\d{5,}$/.test(word)) return word
  }
  return undefined
}

/** `45s`, `12m`, `1h05m`, `2d`: a span of time in the band's words. */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d`
}

/** `20:30`: a time of day, local, as the cron entry reads it. */
export const fmtClock = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** One cron field as the set of values it allows, or null when it cannot be read. */
function fieldOf(text: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part)
    if (!m) return null
    const step = m[2] ? Number(m[2]) : 1
    if (step < 1) return null
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      const [a, b] = (m[1] ?? '').split('-').map(Number)
      lo = a ?? min
      hi = b ?? (m[2] ? max : lo)
    }
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

/**
 * The next time after `from` a five-field cron expression (`M H DoM Mon DoW`,
 * local time; `*`, lists, ranges and steps) matches, within eight days (a
 * recurring job expires after seven); undefined when it cannot be read or does
 * not match in that span. Day of month and day of week combine as cron does:
 * either matches when both are restricted.
 */
export function cronNext(expr: string, from: number): number | undefined {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return undefined
  const [mi, ho, dom, mon, dow] = parts as [string, string, string, string, string]
  const minutes = fieldOf(mi, 0, 59)
  const hours = fieldOf(ho, 0, 23)
  const days = fieldOf(dom, 1, 31)
  const months = fieldOf(mon, 1, 12)
  // Sunday is 0 or 7.
  const weekdays = fieldOf(dow, 0, 7)
  if (weekdays?.has(7)) weekdays.add(0)
  if (!minutes || !hours || !days || !months || !weekdays) return undefined
  const isDomAny = dom === '*'
  const isDowAny = dow === '*'
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const dayOk =
      isDomAny && isDowAny
        ? true
        : isDomAny
          ? weekdays.has(d.getDay())
          : isDowAny
            ? days.has(d.getDate())
            : days.has(d.getDate()) || weekdays.has(d.getDay())
    if (months.has(d.getMonth() + 1) && dayOk && hours.has(d.getHours()) && minutes.has(d.getMinutes())) return d.getTime()
    d.setMinutes(d.getMinutes() + 1)
  }
  return undefined
}

/** A watch's event notification: its task id and the first line of its event. */
export type WatchEvent = { id: string; event: string }

/**
 * Every event notification in a row's text: a `<task-notification>` with an
 * `<event>` and no `<status>` (a Monitor's stdout line, not its end).
 */
export function eventsOf(text: string): WatchEvent[] {
  const out: WatchEvent[] = []
  for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1] ?? ''
    if (/<status>/.test(body)) continue
    const id = /<task-id>([\s\S]*?)<\/task-id>/.exec(body)?.[1]?.trim()
    const event = /<event>([\s\S]*?)<\/event>/.exec(body)?.[1]?.trim()
    if (!id || event === undefined) continue
    out.push({ id, event: (event.split('\n').find(l => l.trim() !== '') ?? '').trim().slice(0, 240) })
  }
  return out
}
