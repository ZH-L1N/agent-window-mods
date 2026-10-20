// The ● CACHE row above the prompt: how long the prompt cache stays warm (a
// 6-cell bar of the time left in its window, traffic-light colours), how much
// of the last main request it served, how many tokens it holds and what
// writing them again would cost, then a framed Compact button. Cold, the row
// turns red and says what the next send rewrites. Its row sits in the
// zehui-mods stack by its order (stackRow); other mods' bands follow.
import { atom, read } from 'claude-code'
import type { EngineInterface, PluginOptions, RenderElement, RenderInput } from 'claude-code'

import {
  BAR_CELLS,
  CHIP,
  CHIP_BG,
  CHIP_FG,
  RED,
  barCells,
  cachedOf,
  dollarText,
  fmtTokens,
  isBandOn,
  leftColor,
  leftMs,
  minutesText,
  reusedPct,
  rewriteUsd,
  windowMinutes,
  stackKey,
  stackRow,
} from './kit'

const lastCacheAt = atom({ plugin: 'cache-clock', key: 'lastCacheAt' } as const, 0)
const last = atom({ plugin: 'cache-clock', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-clock', key: 'now' } as const, 0)
const band = atom({ plugin: 'cache-clock', key: 'band' } as const, '')

/** One run of text in the row: its words and how they are drawn. */
type Seg = { text: string; color?: string; bg?: string; isBold?: boolean; isDim?: boolean }

const widthOf = (segs: readonly Seg[]): number => segs.reduce((w, s) => w + [...s.text].length, 0)

/** The framed button's width beside the line: `[ Compact ]` and a one-column gap. */
const BUTTON_W = 'Compact'.length + 4 + 1

export async function drawRow(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  pass: () => Promise<RenderElement>,
  options: PluginOptions,
  onCompact: () => void,
) {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return pass()
  if (!isBandOn(await read($, band), options.band)) return pass()
  const step = await read($, last)
  const since = await read($, lastCacheAt)
  if (!step || !since) return pass()
  const minutes = windowMinutes(options.cacheMinutes)
  const at = Math.max(await read($, now), since)
  const left = leftMs(since, at, minutes)
  const color = leftColor(left, minutes)
  const cached = fmtTokens(cachedOf(step))
  const rewrite = dollarText(rewriteUsd(step, minutes))

  // Other mods' bands beneath this row; stackRow puts this row in its slot
  // among the zehui-mods rows and never nests the engine's own placeholder.
  const below = await pass().catch(() => null)

  const head: Seg[] = [{ text: CHIP, color: CHIP_FG, bg: CHIP_BG, isBold: true }, { text: ' ' }]
  const room = (e.props.bodyColumns > 0 ? e.props.bodyColumns : 80) - BUTTON_W
  let segs: Seg[]
  if (left <= 0) {
    // Short of columns: drop ' on next send', then '180k to '; the rewrite cost stays.
    const tails = [` ${cached} to rewrite ${rewrite} on next send`, ` ${cached} to rewrite ${rewrite}`, ` rewrite ${rewrite}`]
    const build = (tail: string): Seg[] => [
      ...head,
      { text: 'COLD', color: RED, isBold: true },
      { text: ' ' },
      { text: '▱'.repeat(BAR_CELLS), isDim: true },
      { text: tail, color: RED },
    ]
    const fits = tails.find(t => widthOf(build(t)) <= room)
    segs = build(fits ?? tails[tails.length - 1]!)
  } else {
    const n = barCells(left, minutes)
    const bar: Seg[] = [
      ...(n > 0 ? [{ text: '▰'.repeat(n), color }] : []),
      ...(n < BAR_CELLS ? [{ text: '▱'.repeat(BAR_CELLS - n), isDim: true }] : []),
    ]
    // The figures, dropped from the first when the row is short of columns:
    // % reused, then cached; the rewrite cost stays.
    let parts: Seg[][] = [
      [{ text: `${reusedPct(step.reads, step.writes, step.input)}% reused` }],
      [{ text: `${cached} cached` }],
      [{ text: `rewrite ${rewrite}` }],
    ]
    const build = (): Seg[] => [
      ...head,
      { text: `warm ${minutesText(left)}`, color, isBold: true },
      { text: ' ' },
      ...bar,
      ...parts.flatMap((p, i) => [{ text: i === 0 ? ' ' : ' · ', isDim: i > 0 }, ...p]),
    ]
    while (parts.length > 1 && widthOf(build()) > room) parts = parts.slice(1)
    segs = build()
  }

  const { Box, Text, Button } = $.ui.resolve(e)
  const row = (
    <Box key={stackKey('cache')} flexDirection="row" gap={1}>
      <Box key="cache-line" flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-end">
          {segs.map((g, i) => (
            <Text
              key={`seg-${i}`}
              {...(g.color ? { color: g.color } : {})}
              {...(g.bg ? { backgroundColor: g.bg } : {})}
              {...(g.isBold ? { bold: true } : {})}
              {...(g.isDim ? { dimColor: true } : {})}
            >
              {g.text}
            </Text>
          ))}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Button key="cache-compact" label="Compact" onPress={() => onCompact()} />
      </Box>
    </Box>
  )
  return stackRow(row, below)
}
