// Text for the status line and the pane, kept apart from register.tsx so tests reach it.
import type { Run } from '../types'

export const HISTORY = 50

export const isGreen = (run: Run): boolean => run.failed === 0

export const total = (run: Run): number => run.passed + run.failed

export function statusText(run: Run): string {
  const unit = run.unit === 'packages' ? ' pkg' : ''

  return isGreen(run) ? `tests ✓ ${run.passed}${unit}` : `tests ✗ ${run.failed}/${total(run)}${unit}`
}

export function duration(ms: number | undefined): string {
  if (ms === undefined) {
    return ''
  }

  if (ms < 1000) {
    return `${ms}ms`
  }

  return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))

  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`

  return `${Math.floor(s / 86_400)}d ago`
}

// The command as it reads in one line: a leading `cd … &&` says nothing about the run.
export const shortCommand = (command: string): string =>
  command.replace(/^\s*cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/, '').replace(/\s+/g, ' ').trim()

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// What the hook adds to the history: newest last, the oldest dropped past the limit.
export const keep = (runs: Run[], run: Run): Run[] => [...runs, run].slice(-HISTORY)
