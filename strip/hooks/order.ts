// The band's order: which rows the strip stands in for and where every row
// goes. Pure. The one AbovePromptList hook (register.tsx) hands its rows here
// and passes on what comes back: the same objects, each at most once.

/** The plugins whose rows the strip replaces: SYS, PLAN, HANDOFF and CACHE, in their old order. */
export const REPLACED = ['sys', 'token-weather', 'handoff', 'cache-clock'] as const

/** Top to bottom. A row of a plugin not named here comes after these, in the order received. */
export const ORDER = ['motion-hold', 'breathe', 'strip', 'smart-compact', 'agents', 'goal-meter', 'here', 'queue', 'next', 'images'] as const

/** A plugin's bare name: `sys@zehui-mods` reads as `sys`. */
export const bareName = (plugin: string): string => plugin.split('@')[0] ?? plugin

const STRIP_AT = ORDER.indexOf('strip')

/**
 * The band's rows, arranged. With no row of the strip's among them nothing is
 * hidden or moved: the strip did not draw, so the old rows are all there is.
 * Otherwise the replaced rows are left out (all kept with `showOld`, the
 * HANDOFF row kept with `keepHandoff`), a kept one sorts right after the
 * strip, and the rest follow the order table.
 */
export function arrangeRows<T extends { plugin: string }>(rows: readonly T[], o: { showOld: boolean; keepHandoff: boolean }): T[] {
  if (!rows.some(r => bareName(r.plugin) === 'strip')) return [...rows]
  const ranked: { row: T; rank: number; at: number }[] = []
  const seen = new Set<T>()
  rows.forEach((row, at) => {
    if (seen.has(row)) return
    seen.add(row)
    const name = bareName(row.plugin)
    const old = (REPLACED as readonly string[]).indexOf(name)
    if (old >= 0) {
      if (!o.showOld && !(o.keepHandoff && name === 'handoff')) return
      // Between the strip and what follows it in the table, in the old rows' own order.
      ranked.push({ row, rank: STRIP_AT + (old + 1) / (REPLACED.length + 1), at })
      return
    }
    const listed = (ORDER as readonly string[]).indexOf(name)
    ranked.push({ row, rank: listed >= 0 ? listed : ORDER.length, at })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.at - b.at).map(r => r.row)
}
