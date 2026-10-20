// Local change (zehui-mods): tests for the PLAN row, the month store, the
// band composed above another mod's band, the re-read after session.compact,
// the spend_limit window and (local change 6) the context reading published
// to $.state for the handoff mod, and the plain percent of option showPercent.
// Local change 10 (zehui-mods): today's tokens before the month figure, their
// day keys, their drop order and their pruning with the month keys.
// Local change 11 (zehui-mods): the PLAN row's slot (20) in the zehui-mods stack order.
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'token-weather'
const T0 = Date.parse('2026-10-15T12:00:00Z')
const WINDOW = 1_000_000

type Kind = 'used' | 'free' | 'buffer' | 'deferred'
type Cat = { name: string; tokens: number; color: string; kind: Kind }

const cat = (name: string, tokens: number, color: string, kind: Kind = 'used'): Cat => ({ name, tokens, color, kind })

// One million tokens in all; the deferred MCP row is left out of what is published.
const CATEGORIES: Cat[] = [
  cat('System prompt', 100_000, 'promptBorder'),
  cat('System tools', 50_000, 'inactive'),
  cat('Memory files', 10_000, 'claude'),
  cat('MCP tools', 30_000, 'cyan_FOR_SUBAGENTS_ONLY', 'deferred'),
  cat('Messages', 140_000, 'purple_FOR_SUBAGENTS_ONLY'),
  cat('Free space', 550_000, 'promptBorder', 'free'),
  cat('Autocompact buffer', 150_000, 'inactive', 'buffer'),
]

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Reading = { tokens: number; usd?: number; categories?: Cat[] | null; compactAt?: number; rateLimits?: Limit[] }

function usageOf(r: Reading) {
  const context: Record<string, unknown> = { tokens: r.tokens, window: WINDOW, percent: Math.round((r.tokens / WINDOW) * 100) }
  if (r.categories) {
    context.breakdown = {
      categories: r.categories.map(c => ({ ...c, isDeferred: c.kind === 'deferred' })),
      totalTokens: r.tokens,
      maxTokens: WINDOW,
      rawMaxTokens: WINDOW,
      percentage: Math.round((r.tokens / WINDOW) * 100),
      autoCompactThreshold: r.compactAt ?? WINDOW,
      isAutoCompactEnabled: true,
    }
  }
  return { startedAt: T0, context, rateLimits: r.rateLimits ?? [], ...(r.usd != null ? { cost: { usd: r.usd } } : {}) }
}

type Trigger = 'manual' | 'auto' | 'plugin' | 'precompute'
type World = {
  set: (r: Reading) => void
  store: Map<string, unknown>
  /** Every value the plugin wrote to $.state under token-weather.context, in order. */
  published: unknown[]
  /** Fires session.compact; beneath the plugin it stands, or is skipped with `skip`. */
  compact: (trigger: Trigger, skip?: string) => Promise<unknown>
  /** Local change 10 (zehui-mods): the mocked clock, to cross midnight. */
  clock: ReturnType<typeof mock.clock>
}

/**
 * The world beneath the plugin: a mocked clock, a session id, the usage the
 * test hands it, and a store in a Map the test reads back.
 */
async function world(
  $: Engine,
  on: On,
  first: Reading,
  // Local change 11 (zehui-mods): stackBeneath: a column of zm rows keyed as listed, then another band.
  opts: { sessionId?: string; store?: Record<string, unknown>; beneath?: boolean; stackBeneath?: string[] } = {},
): Promise<World> {
  let current = first
  const kept = [{ role: 'user', text: 'summary', toolUses: [] }]
  let compactResult: unknown = { messages: kept }
  const store = new Map<string, unknown>(Object.entries(opts.store ?? {}))
  const published: unknown[] = []
  const clock = mock.clock(on, { now: T0 })
  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    store.delete((e as { key: string }).key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...store.keys()] }) as never)
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key === 'context') published.push(JSON.parse(JSON.stringify(w.value)))
    return next(e)
  })
  on('session.id', () => ({ value: opts.sessionId ?? 's1' }) as never)
  on('session.usage', () => ({ value: usageOf(current) }) as never)
  on('ui.render', async ($$, e) => {
    // Local change 11 (zehui-mods): zm rows out of order, then a non-zm band.
    if (opts.stackBeneath) {
      return {
        type: 'Box',
        props: { flexDirection: 'column' },
        children: [
          ...opts.stackBeneath.map(key => ({ type: 'Box', props: { key }, children: [{ type: 'Text', props: {}, children: [key] }] })),
          { type: 'Box', props: { key: 'other-band' }, children: [{ type: 'Text', props: {}, children: ['beneath'] }] },
        ],
      } as never
    }
    if (!opts.beneath) return { type: 'engine', ref: 0 } as never
    // Another mod's band beneath this one.
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.compact', async () => compactResult as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return {
    set: r => (current = r),
    store,
    published,
    clock,
    compact: (trigger, skip) => {
      compactResult = skip ? { skip } : { messages: kept }
      return $.session.compact({ trigger, messages: kept } as never)
    },
  }
}

const turn = ($: Engine, tokens = 0) =>
  $.turn.complete({
    answer: 'ok',
    durationMs: 1_000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { model: 'claude-opus-5-5', input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as never)

const bandProps = (bodyColumns = 240, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

type Run = { text: string; color?: string; dim: boolean }

/** The band's row as its Text runs, in order. */
async function runs($: Engine, columns = 240, hasSurvey = false): Promise<Run[]> {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(columns, hasSurvey) })
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.map(t => ({
    text: t.text,
    ...(typeof t.props.color === 'string' ? { color: t.props.color } : {}),
    dim: Boolean(t.props.dimColor),
  }))
}

const pct = (row: Run[]) => row.find(r => /^\d+%$/.test(r.text))
const tokensText = (row: Run[]) => row.find(r => /^ {2}[\d.]+[kM]? \/ /.test(r.text))?.text

test('the PLAN row: chip, glyph, a plain percent, tokens, chart, cost and month; no bar, no top three', async ($, on) => {
  await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES })
  await turn($)
  const row = await runs($)
  expect(row[0]).toEqual({ text: ' ◔ PLAN    ', color: '#0b0b0f', dim: false })
  expect(row[1]?.text).toBe(' ☁\uFE0E ')
  // The plain percent: no colour of its own, not dim.
  expect(row[2]).toEqual({ text: '25%', dim: false })
  expect(row.some(r => /[▰▱░]/.test(r.text))).toBe(false)
  expect(row.some(r => /Messages|System/.test(r.text))).toBe(false)
  expect(tokensText(row)).toBe('  250k / 1M')
  expect(row.some(r => r.text === '  last turns ')).toBe(true)
  expect(row.some(r => r.text === '$12.00')).toBe(true)
  expect(row[row.length - 1]?.text).toMatch(/^Oct /)
})

test('showPercent off leaves the percent out of the PLAN row', { options: { showPercent: false } }, async ($, on) => {
  await world($, on, { tokens: 250_000, categories: CATEGORIES })
  await turn($)
  const row = await runs($)
  expect(pct(row)).toBeUndefined()
  expect(row[1]?.text).toBe(' ☁\uFE0E ')
  expect(tokensText(row)).toBe('  250k / 1M')
})

test('each reading is published to token-weather.context for the handoff row', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, categories: CATEGORIES, compactAt: 850_000 })
  // session.start published one already.
  expect(w.published.length).toBe(1)
  await turn($)
  expect(w.published.length).toBe(2)
  expect(w.published[1]).toEqual({
    categories: [
      { name: 'System prompt', tokens: 100_000, color: '#888888', kind: 'used' },
      { name: 'System tools', tokens: 50_000, color: '#999999', kind: 'used' },
      { name: 'Memory files', tokens: 10_000, color: '#d77757', kind: 'used' },
      { name: 'Messages', tokens: 140_000, color: '#9333ea', kind: 'used' },
      { name: 'Free space', tokens: 550_000, color: '#888888', kind: 'free' },
      { name: 'Autocompact buffer', tokens: 150_000, color: '#999999', kind: 'buffer' },
    ],
    totalTokens: 250_000,
    maxTokens: WINDOW,
    autoCompactThreshold: 850_000,
    percent: 25,
    readAt: T0,
  })
})

test('a build without a breakdown publishes no categories and no compaction point', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, categories: null })
  await turn($)
  expect(w.published[w.published.length - 1]).toEqual({ categories: [], totalTokens: 250_000, maxTokens: WINDOW, percent: 25, readAt: T0 })
})

test('two sessions in one month sum into the month line', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES }, {
    sessionId: 's1',
    store: { 'token-weather.month.2026-10.s0': { usd: 400, tokens: 37_000_000 } },
  })
  await turn($, 1_000_000)
  expect(w.store.get('token-weather.month.2026-10.s1')).toEqual({ usd: 12, tokens: 1_000_000 })
  const row = await runs($)
  expect(row[row.length - 1]?.text).toBe('Oct $412 · 38M tokens')
})

test('lower-ranked parts drop first when the columns are short; chip, glyph and percent stay', async ($, on) => {
  await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES, rateLimits: [{ kind: 'spend_limit', percentUsed: 42 }] })
  await turn($)
  const wide = await runs($, 240)
  const full = wide.reduce((n, r) => n + [...r.text].length, 0)
  // One column short: the rate limits go first.
  const short = await runs($, full - 1)
  expect(short.some(r => r.text === '  spend 42%')).toBe(false)
  expect(short[short.length - 1]?.text).toMatch(/^Oct /)
  const narrow = await runs($, 20)
  expect(narrow.map(r => r.text)).toEqual([' ◔ PLAN    ', ' ☁\uFE0E ', '25%'])
})

test('session.start deletes month keys older than two months', async ($, on) => {
  const w = await world($, on, { tokens: 0, usd: 0, categories: null }, {
    store: {
      'token-weather.month.2026-07.old': { usd: 1, tokens: 1 },
      'token-weather.month.2026-08.kept': { usd: 2, tokens: 2 },
      // Local change 10 (zehui-mods): day keys go with their month.
      'token-weather.day.2026-07-31.old': { tokens: 1 },
      'token-weather.day.2026-08-01.kept': { tokens: 2 },
      unrelated: 1,
    },
  })
  expect([...w.store.keys()].sort()).toEqual([
    'token-weather.day.2026-08-01.kept',
    `token-weather.day.${TODAY}.s1`,
    'token-weather.month.2026-08.kept',
    'token-weather.month.2026-10.s1',
    'unrelated',
  ])
})

// Local change 10 (zehui-mods): T0's day, local time, as the module keys it.
const TODAY = (() => {
  const d = new Date(T0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

test('local change 10: today\'s tokens sum the day\'s sessions and sit just before the month', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES }, {
    sessionId: 's1',
    store: {
      [`token-weather.day.${TODAY}.s0`]: { tokens: 300_000 },
      // Another day: not today's.
      'token-weather.day.2026-10-14.s0': { tokens: 5_000_000 },
      'token-weather.month.2026-10.s0': { usd: 400, tokens: 37_000_000 },
    },
  })
  await turn($, 1_000_000)
  expect(w.store.get(`token-weather.day.${TODAY}.s1`)).toEqual({ tokens: 1_000_000 })
  await turn($, 200_000)
  expect(w.store.get(`token-weather.day.${TODAY}.s1`)).toEqual({ tokens: 1_200_000 })
  const row = await runs($)
  const n = row.length
  // 300k of session s0 today + 1.2M of this one; the other day's 5M is not today's.
  expect(row[n - 4]).toEqual({ text: '  today ', dim: true })
  expect(row[n - 3]).toEqual({ text: '1.5M tok', dim: false })
  expect(row[n - 1]?.text).toBe('Oct $412 · 38M tokens')
})

test('local change 10: today drops after the tokens / window and before the month', async ($, on) => {
  await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES })
  await turn($, 2_000_000)
  const wide = await runs($)
  const width = (texts: string[]) => texts.reduce((s, t) => s + [...t].length, 0)
  const kept = [' ◔ PLAN    ', ' ☁︎ ', '25%', '  today ', '2M tok', '  ', wide[wide.length - 1]!.text]
  expect((await runs($, width(kept))).map(r => r.text)).toEqual(kept)
  const noToday = (await runs($, width(kept) - 1)).map(r => r.text)
  expect(noToday).toEqual([' ◔ PLAN    ', ' ☁︎ ', '25%', '  ', wide[wide.length - 1]!.text])
})

// Local change 10 (zehui-mods): an idle session past midnight never shows yesterday's sum as today's.
test('local change 10: past midnight with no turn, the today figure is gone until the next turn', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES })
  await turn($, 2_000_000)
  expect((await runs($)).map(r => r.text)).toContain('  today ')
  const d = new Date(T0)
  await w.clock.set(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 10).getTime())
  const texts = (await runs($)).map(r => r.text)
  expect(texts).not.toContain('  today ')
  expect(texts).not.toContain('2M tok')
  expect(texts[texts.length - 1]).toBe('Oct $12.00 · 2.0M tokens')
  await turn($, 100_000)
  const next = await runs($)
  expect(next[next.length - 4]).toEqual({ text: '  today ', dim: true })
  expect(next[next.length - 3]).toEqual({ text: '100k tok', dim: false })
})

test('the band yields to the survey', async ($, on) => {
  await world($, on, { tokens: 250_000, categories: CATEGORIES })
  await turn($)
  expect(await runs($, 240, true)).toEqual([])
})

test('the row composes above another band, which draws beneath it', async ($, on) => {
  await world($, on, { tokens: 250_000, categories: CATEGORIES }, { beneath: true })
  await turn($)
  const row = await runs($)
  expect(row[0]?.text).toBe(' ◔ PLAN    ')
  expect(row[row.length - 2]?.text).toMatch(/^Oct /)
  expect(row[row.length - 1]?.text).toBe('beneath')
  expect(row.filter(r => r.text === 'beneath').length).toBe(1)
})

// After a compaction: Messages down to 40k, free space up to 650k.
const COMPACTED: Cat[] = CATEGORIES.map(c =>
  c.name === 'Messages' ? { ...c, tokens: 40_000 } : c.name === 'Free space' ? { ...c, tokens: 650_000 } : c,
)

test('session.compact reads the breakdown again and publishes it; precompute and a skip do not', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, categories: CATEGORIES })
  await turn($)
  const before = w.published.length
  w.set({ tokens: 200_000, categories: COMPACTED })

  await w.compact('precompute')
  await w.compact('manual', 'blocked by a hook')
  expect(w.published.length).toBe(before)
  expect(pct(await runs($))?.text).toBe('25%')

  await w.compact('manual')
  expect(w.published.length).toBe(before + 1)
  const last = w.published[w.published.length - 1] as { totalTokens: number; categories: { name: string; tokens: number }[] }
  expect(last.totalTokens).toBe(200_000)
  expect(last.categories.find(c => c.name === 'Messages')?.tokens).toBe(40_000)
  expect(pct(await runs($))?.text).toBe('20%')
})

test('a gateway spend_limit window is shown', async ($, on) => {
  await world($, on, { tokens: 250_000, categories: CATEGORIES, rateLimits: [{ kind: 'spend_limit', percentUsed: 42 }] })
  await turn($)
  expect((await runs($)).some(r => r.text === '  spend 42%')).toBe(true)
})

test('a session that ran into this month counts only its usd since the boundary', async ($, on) => {
  const w = await world($, on, { tokens: 250_000, usd: 12, categories: CATEGORIES }, {
    sessionId: 's1',
    store: { 'token-weather.month.2026-09.s1': { usd: 5, tokens: 100 } },
  })
  await turn($, 1_000_000)
  expect(w.store.get('token-weather.month.2026-10.s1')).toEqual({ usd: 7, tokens: 1_000_000 })
  expect(w.store.get('token-weather.month.2026-09.s1')).toEqual({ usd: 5, tokens: 100 })
  const row = await runs($)
  expect(row[row.length - 1]?.text).toBe('Oct $7.00 · 1.0M tokens')
})

// Local change 11 (zehui-mods): the stack order.
test('stack order: the PLAN row takes 20 among the zm rows beneath, sorted; another band stays last', async ($, on) => {
  await world($, on, { tokens: 250_000, categories: CATEGORIES }, { stackBeneath: ['zm-50-agents', 'zm-10-sys'] })
  await turn($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(240, false) })
  const tree = (await ui.drawn()) as { children?: { props?: { key?: string } }[] }
  expect((tree.children ?? []).map(c => c.props?.key ?? '')).toEqual(['zm-10-sys', 'zm-20-plan', 'zm-50-agents', 'other-band'])
  expect(await ui.find({ type: 'Text', text: ' ◔ PLAN    ' })).toBeDefined()
  await ui.unmount()
})
