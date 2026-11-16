// The strip's three panes (context by category with the cost totals, the
// machine, the last turn's edits as diffs) and what opens, closes and steps
// them. The drawings take their data as an argument (sources.ts reads it), so
// each is a plain function of it; every button has a slash-command twin,
// named on the pane's last line.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { DiffStep } from '../types'
import { noControls } from './diff'
import { C, cellWidth } from './pills'
import { refreshUsage } from './sources'

const last = atom({ plugin: 'strip', key: 'last' } as const, [])
const sel = atom({ plugin: 'strip', key: 'sel' } as const, 0)
const turnAt = atom({ plugin: 'strip', key: 'turnAt' } as const, null)
const isPanesClear = atom({ plugin: 'strip', key: 'isPanesClear' } as const, true)

export const CONTEXT_PANE = 'strip-context'
export const SYSTEM_PANE = 'strip-system'
export const DIFF_PANE = 'strip-diff'

export type PaneName = 'context' | 'system' | 'diff'
/** Each pane's id, title and the `/strip <twin>` that opens it. */
export const PANES: Record<PaneName, { id: string; title: string }> = {
  context: { id: CONTEXT_PANE, title: 'Context' },
  system: { id: SYSTEM_PANE, title: 'System' },
  diff: { id: DIFF_PANE, title: 'Last turn' },
}

export type ContextData = {
  /** Percent of `limit`; null with no reading. */
  pct: number | null
  used: number
  limit: number
  /** True when `limit` is the auto-compact threshold, false when it is the window. */
  isThreshold: boolean
  categories: { name: string; tokens: number; color: string }[]
  /** token-weather's totals; null while that state is absent. */
  totals: { costUsd: number | null; today: { ymd: string; tokens: number } | null; month: { ym: string; usd: number; tokens: number } | null } | null
}

export type SystemData = {
  reading: { cpu: number | null; ram: { used: number; total: number } | null; battery: { percent: number; isCharging: boolean } | null } | null
}

export type DiffData = {
  /** The last turn's steps. */
  steps: DiffStep[]
  /** The step shown, 0-based. */
  sel: number
  /** Steps recorded in the running turn. */
  running: number
}

const BAR_FULL = '\u25b0'
const BAR_EMPTY = '\u25b1'
const CTX_BAR = 20
const SYS_BAR = 10
const QUEUED = 'queued until the turn ends'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `812`, `84.2k`, `167k`, `1.23M`. */
export function fmtTokens(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 100_000_000 ? 0 : v >= 10_000_000 ? 1 : 2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}k`
  return `${Math.round(v)}`
}

/** A label padded (or cut) to `w` cells. */
function padCells(text: string, w: number): string {
  let out = ''
  for (const ch of text) {
    if (cellWidth(out + ch) > w) break
    out += ch
  }
  return out + ' '.repeat(Math.max(0, w - cellWidth(out)))
}

/** Filled cells of a bar: none at 0, at least one above, all from 100 percent. */
const cells = (pct: number, of: number): number => (pct <= 0 ? 0 : Math.min(of, Math.max(1, Math.round((pct / 100) * of))))

const percentOf = (part: number, all: number): number => (all > 0 && Number.isFinite(part) ? Math.max(0, Math.round((part / all) * 100)) : 0)

/** The file's last path part. */
const baseName = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

/** The totals in one line: the session cost, today's tokens, then the month's cost and tokens. */
export function totalsLine(t: NonNullable<ContextData['totals']>): string {
  const parts = [`Session cost ${t.costUsd === null ? '\u2013' : `$${t.costUsd.toFixed(2)}`}`]
  parts.push(`today ${t.today ? `${fmtTokens(t.today.tokens)} tok` : '\u2013'}`)
  if (t.month) {
    const month = MONTHS[Number(t.month.ym.slice(5, 7)) - 1] ?? noControls(t.month.ym)
    parts.push(`${month} $${Math.round(t.month.usd)}, ${fmtTokens(t.month.tokens)} tok`)
  }
  return parts.join(' \u00b7 ')
}

// ---- opening, closing, stepping ----

/** Opens one of the strip's own panes; false when the surface did not place it. */
export async function openPane($: EngineInterface, name: PaneName): Promise<boolean> {
  const p = PANES[name]
  // The strip's ui.open hook does not hear the strip's own call, so the open carries the fill itself.
  const isClear = await read($, isPanesClear).catch(() => false)
  try {
    return (await $.ui.open({ id: p.id, title: p.title, focus: true, ...(isClear ? { backgroundColor: 'transparent' } : {}) })).isPlaced
  } catch {
    return false
  }
}

/**
 * A press on a pill or a pane's button: open the pane at once, while the
 * press is still what asked for it. When that is not placed, the twin runs
 * from a timer (the session runs it once idle) and a toast says so.
 */
export async function launchPane($: EngineInterface, name: PaneName): Promise<string> {
  const isPlaced = await openPane($, name)
  if (name === 'context') await refreshUsage($).catch(() => {})
  if (isPlaced) return `${PANES[name].title} pane opened.`
  const line = `/strip ${name}`
  $.clock.after(20, () => {
    void $.command.run({ command: 'strip', args: name }).catch(() => {})
  })
  const text = `${line} ${QUEUED}`
  $.ui.toast(text)
  return text
}

export async function closePane($: EngineInterface, name: PaneName): Promise<void> {
  await $.ui.close({ id: PANES[name].id }).catch(() => {})
}

/** Moves the diff pane's selection by `by` steps, or to step `to` (1-based); answers where it stands. */
export async function moveSel($: EngineInterface, move: { by: number } | { to: number }): Promise<string> {
  const n = (await read($, last)).length
  if (n === 0) return 'No edits in the last turn.'
  const want = 'by' in move ? (await read($, sel)) + move.by : move.to - 1
  const at = Math.min(n - 1, Math.max(0, Number.isFinite(want) ? Math.trunc(want) : 0))
  await update($, sel, () => at)
  return `Step ${at + 1}/${n}.`
}

/**
 * Runs another mod's slash command: looked up first (one that is not in the
 * session is a toast naming `twin`), then run from a timer, never inside the
 * hook; the session runs it once idle, so while a turn runs a toast says it
 * is queued. Answers what it did.
 */
export async function runOther($: EngineInterface, command: string, args: string, twin: string): Promise<string> {
  const names = (await $.command.list().catch(() => [])).map(c => c.name)
  if (!names.includes(command)) {
    const text = `${command} is not in this session (${twin})`
    $.ui.toast(text)
    return text
  }
  const line = `/${command}${args ? ` ${args}` : ''}`
  $.clock.after(20, () => {
    void $.command.run({ command, args }).catch(() => {
      $.ui.toast(`${line} did not run (${twin})`)
    })
  })
  if ((await read($, turnAt).catch(() => null)) !== null) {
    const text = `${line} ${QUEUED}`
    $.ui.toast(text)
    return text
  }
  return `${line} runs once the session is idle.`
}

// ---- drawing ----

export function drawContextPane($: EngineInterface, e: RenderInput<'Pane'>, data: ContextData): RenderElement {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cats = data.categories
  const labelW = Math.min(24, Math.max(8, ...cats.map(c => cellWidth(noControls(c.name)))))
  const head =
    data.pct === null
      ? 'Context: no reading yet.'
      : `Context ${data.pct}% of the ${data.isThreshold ? 'compact window' : 'window'} \u00b7 ${fmtTokens(data.used)} / ${fmtTokens(data.limit)}`
  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">
        {head}
      </Text>
      {data.pct !== null && cats.length === 0 ? <Text dimColor>No categories: they come from the token-weather or the handoff mod.</Text> : null}
      {cats.map(c => {
        const pct = percentOf(c.tokens, data.limit)
        const n = cells(pct, CTX_BAR)
        return (
          <Text wrap="truncate-end">
            <Text>{padCells(noControls(c.name), labelW)} </Text>
            <Text color={c.color}>{BAR_FULL.repeat(n)}</Text>
            <Text color={C.dim}>{BAR_EMPTY.repeat(CTX_BAR - n)}</Text>
            <Text>{` ${String(pct).padStart(3)}%`}</Text>
          </Text>
        )
      })}
      <Text wrap="truncate-end">{data.totals ? totalsLine(data.totals) : 'Cost and totals need the token-weather mod.'}</Text>
      <Box flexDirection="row" gap={1}>
        <Button key="ctx-refresh" label="r: refresh" hotkey="r" onPress={() => void launchPane($, 'context').catch(() => {})} />
        <Button key="ctx-close" label="x: close" hotkey="x" onPress={() => void closePane($, 'context')} />
      </Box>
      <Text dimColor>Twins: /strip context, /strip context close</Text>
    </Box>
  )
}

/** Green, yellow from 80, red from 90. */
const loadColor = (pct: number): string => (pct >= 90 ? C.red : pct >= 80 ? C.yellow : C.green)
/** A battery runs the other way: red under 15 and yellow under 30 while it is not charging. */
const batteryColor = (pct: number, isCharging: boolean): string => (isCharging ? C.green : pct < 15 ? C.red : pct < 30 ? C.yellow : C.green)

export function drawSystemPane($: EngineInterface, e: RenderInput<'Pane'>, data: SystemData): RenderElement {
  const { Box, Text, Button } = $.ui.resolve(e)
  const r = data.reading
  const lines: { label: string; pct: number; color: string }[] = []
  if (r && r.cpu !== null) lines.push({ label: `CPU ${Math.round(r.cpu)}%`, pct: r.cpu, color: loadColor(r.cpu) })
  if (r && r.ram && r.ram.total > 0) {
    const pct = percentOf(r.ram.used, r.ram.total)
    const gib = (b: number): number => b / 1024 ** 3
    lines.push({ label: `RAM ${gib(r.ram.used).toFixed(1)}/${Math.round(gib(r.ram.total))}G`, pct, color: loadColor(pct) })
  }
  if (r && r.battery) {
    const pct = Math.round(r.battery.percent)
    lines.push({ label: `Battery ${pct}%${r.battery.isCharging ? ' charging' : ''}`, pct, color: batteryColor(pct, r.battery.isCharging) })
  }
  const labelW = Math.max(12, ...lines.map(l => cellWidth(l.label)))
  return (
    <Box flexDirection="column">
      {r ? null : <Text dimColor>No reading: the sys mod is not loaded.</Text>}
      {r && lines.length === 0 ? <Text dimColor>The sys mod could read nothing of this machine.</Text> : null}
      {lines.map(l => {
        const n = cells(l.pct, SYS_BAR)
        return (
          <Text wrap="truncate-end">
            <Text color={l.color}>{padCells(l.label, labelW)} </Text>
            <Text color={l.color}>{BAR_FULL.repeat(n)}</Text>
            <Text color={C.dim}>{BAR_EMPTY.repeat(SYS_BAR - n)}</Text>
          </Text>
        )
      })}
      <Box flexDirection="row" gap={1}>
        <Button key="sys-btop" label="b: btop" hotkey="b" onPress={() => void runOther($, 'sys', 'btop', '/sys btop').catch(() => {})} />
        <Button key="sys-refresh" label="r: refresh" hotkey="r" onPress={() => void runOther($, 'sys', 'now', '/sys now').catch(() => {})} />
        <Button key="sys-close" label="x: close" hotkey="x" onPress={() => void closePane($, 'system')} />
      </Box>
      <Text dimColor>Twins: /sys btop, /sys now, /strip system close</Text>
    </Box>
  )
}

export function drawDiffPane($: EngineInterface, e: RenderInput<'Pane'>, data: DiffData): RenderElement {
  const { Box, Text, Button } = $.ui.resolve(e)
  const list = data.steps
  const at = list.length === 0 ? 0 : Math.min(list.length - 1, Math.max(0, Math.trunc(data.sel) || 0))
  const step = list[at]
  return (
    <Box flexDirection="column">
      {list.length === 0 ? (
        <Text dimColor>No edits in the last turn.</Text>
      ) : (
        <Text wrap="wrap">
          {list.map((s, i) => (
            <Text {...(i === at ? { inverse: true, bold: true } : { dimColor: true })}>{` ${i + 1} ${noControls(baseName(s.file))} `}</Text>
          ))}
        </Text>
      )}
      {step ? (
        <Text dimColor wrap="truncate-end">
          {`Step ${at + 1}/${list.length} \u00b7 ${step.tool} \u00b7 ${noControls(step.file)} \u00b7 +${step.adds} \u2212${step.dels}`}
        </Text>
      ) : null}
      {data.running > 0 ? <Text dimColor>{`${data.running} edit${data.running === 1 ? '' : 's'} in the running turn, shown when it ends.`}</Text> : null}
      {(step?.lines ?? []).map(l =>
        l.kind === 'ctx' || l.kind === 'note' ? (
          <Text dimColor wrap="truncate-end">
            {noControls(l.text)}
          </Text>
        ) : (
          <Text color={l.kind === 'add' ? C.green : l.kind === 'del' ? C.red : C.teal} wrap="truncate-end">
            {noControls(l.text)}
          </Text>
        ),
      )}
      <Box flexDirection="row" gap={1}>
        <Button key="diff-prev" label="p: prev" hotkey="p" onPress={() => void moveSel($, { by: -1 }).catch(() => {})} />
        <Button key="diff-next" label="n: next" hotkey="n" onPress={() => void moveSel($, { by: 1 }).catch(() => {})} />
        <Button key="diff-close" label="c: close" hotkey="c" onPress={() => void closePane($, 'diff')} />
      </Box>
      <Text dimColor>Twins: /strip diff prev, /strip diff next, /strip diff close</Text>
    </Box>
  )
}
