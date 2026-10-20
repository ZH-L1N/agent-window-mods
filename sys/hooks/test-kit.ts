// Shared setup for the sys mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const PLUGIN = 'sys'
export const T0 = Date.parse('2026-10-19T12:00:00Z')
export const GIB = 1024 ** 3

/** A vm_stat page in the shape macOS prints, 16 KiB pages. */
export const vmStat = (active: number, wired: number, compressor: number, page = 16384): string =>
  [
    `Mach Virtual Memory Statistics: (page size of ${page} bytes)`,
    'Pages free:                              338182.',
    `Pages active:                           ${active}.`,
    'Pages inactive:                         1777714.',
    'Pages speculative:                        20895.',
    'Pages throttled:                              0.',
    `Pages wired down:                        ${wired}.`,
    'Pages purgeable:                          59021.',
    `Pages occupied by compressor:            ${compressor}.`,
  ].join('\n')

export const PMSET_DISCHARGING = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=7340131)\t64%; discharging; 13:14 remaining present: true\n"
export const PMSET_NO_BATTERY = "Now drawing from 'AC Power'\n"

/** What the mocked machine answers, command by command; a missing entry fails that command. */
export type Machine = {
  loadavg?: string
  ncpu?: string
  memsize?: string
  vmStat?: string
  pmset?: string
  /** `herdr pane split`'s stdout. */
  split?: string
}

/** 10 cores, 64 GiB, 1.3M of 16 KiB pages in use (19.8 GiB, 31%), battery 64% discharging; CPU 6%. */
export const MACHINE: Machine = {
  loadavg: '{ 0.60 1.59 1.46 }\n',
  ncpu: '10\n',
  memsize: `${64 * GIB}\n`,
  vmStat: vmStat(1_000_000, 200_000, 100_000),
  pmset: PMSET_DISCHARGING,
  split: JSON.stringify({ id: 'cli:pane:split', result: { pane: { pane_id: 'w1:p9', tab_id: 'w1:t1' }, type: 'pane_info' } }),
}

export type World = {
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
  toasts: string[]
  /** Every argv $.process.run was called with, in order. */
  runs: string[][]
  /** The init of every call, in order. */
  inits: unknown[]
  setMachine: (m: Machine) => void
  setSurfaces: (s: string[]) => void
  /** How many times $.session.surfaces() was asked (each reader tick asks once). */
  surfaceReads: () => number
  state: (key: string) => unknown
  start: () => Promise<void>
  command: (args: string) => Promise<string>
}

export type WorldShape = {
  /** Beneath the row, the engine's own placeholder instead of another mod's Text. */
  isEngineBeneath?: boolean
  /**
   * Beneath the band, a column of zehui-mods rows keyed as listed (each a Box
   * holding a Text of its key), then another mod's band (a Box keyed `other-band` holding a Text `beneath`).
   */
  stackBeneath?: string[]
  store?: Record<string, unknown>
  env?: Record<string, string>
  machine?: Machine
  /** What $.session.surfaces() answers; the terminal by default. */
  surfaces?: string[]
  /** `herdr pane split` answers this many ms late (on the mocked clock); at once by default. */
  splitDelayMs?: number
  /** $.session.surfaces() answers this many ms late (on the mocked clock); at once by default. */
  surfacesDelayMs?: number
}

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = () => ({ exitCode: 1, stdout: '', stderr: 'mock: no answer', isStdoutTruncated: false, isStderrTruncated: false })

/**
 * The world beneath the plugin: a mocked clock, store and environment, a
 * machine that answers the reader's commands from `Machine`, herdr that
 * answers a split and a run, toasts recorded, and another mod's band beneath
 * (a Text `beneath`). No command runs for real.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.env ?? {})
  const store = new Map<string, unknown>(Object.entries(shape.store ?? {}))
  const toasts: string[] = []
  const runs: string[][] = []
  const inits: unknown[] = []
  const latest = new Map<string, unknown>()
  let machine: Machine = shape.machine ?? MACHINE
  let surfaces: string[] = shape.surfaces ?? ['terminal']
  let surfaceReads = 0

  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const w = e as { key: string; value: unknown }
    store.set(w.key, JSON.parse(JSON.stringify(w.value)))
    return { value: undefined } as never
  })
  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === PLUGIN && w.key) latest.set(w.key, w.value)
    return next(e)
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('session.surfaces', async () => {
    surfaceReads += 1
    if (shape.surfacesDelayMs) await clock.sleep(shape.surfacesDelayMs)
    return { value: surfaces } as never
  })
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('process.run', async (_$, e) => {
    const w = e as { argv: string[]; init?: unknown }
    runs.push([...w.argv])
    inits.push(w.init)
    const key = w.argv.join(' ')
    const answer: Record<string, string | undefined> = {
      'sysctl -n vm.loadavg': machine.loadavg,
      'sysctl -n hw.ncpu': machine.ncpu,
      'sysctl -n hw.memsize': machine.memsize,
      vm_stat: machine.vmStat,
      'pmset -g batt': machine.pmset,
    }
    if (key in answer) {
      const out = answer[key]
      return { value: out === undefined ? fail() : ok(out) } as never
    }
    if (w.argv[0] === 'herdr' && w.argv[2] === 'split' && shape.splitDelayMs) await clock.sleep(shape.splitDelayMs)
    if (w.argv[0] === 'herdr' && w.argv[2] === 'split') return { value: machine.split === undefined ? fail() : ok(machine.split) } as never
    if (w.argv[0] === 'herdr' && w.argv[2] === 'run') return { value: ok('') } as never
    return { value: fail() } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('ui.render', async ($$, e) => {
    if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
    if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)

  return {
    clock,
    store,
    toasts,
    runs,
    inits,
    setMachine: m => (machine = m),
    setSurfaces: s => (surfaces = s),
    surfaceReads: () => surfaceReads,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
      // The first reading comes from a 10 ms timer.
      await clock.advance(10)
    },
    command: async args => ((await $.command.run({ command: 'sys', args } as never)) as { text?: string }).text ?? '',
  }
}

/** The reader's commands among the calls (every call but herdr's). */
export const readerRuns = (w: World): string[][] => w.runs.filter(a => a[0] !== 'herdr')

/** The band's props at `bodyColumns`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false) =>
  ({ hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} }) as never

export const mountRow = ($: Engine, cols = 160, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: bandProps(cols, hasSurvey) })

export type Run = { text: string; color?: string; bg?: string; bold?: boolean; dim: boolean }

/** The row's text runs (the line only, not the button), each with its colour and dimness. */
export async function lineRuns($: Engine, cols = 160): Promise<Run[]> {
  const ui = await mountRow($, cols)
  const line = await ui.find({ key: 'sys-line' })
  await ui.unmount()
  type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const wrap = (line?.children?.[0] ?? {}) as Node
  return (wrap.children ?? []).map(c => {
    const n = c as Node
    const p = n.props ?? {}
    return {
      text: (n.children ?? []).filter(x => typeof x === 'string').join(''),
      ...(typeof p.color === 'string' ? { color: p.color } : {}),
      ...(typeof p.backgroundColor === 'string' ? { bg: p.backgroundColor } : {}),
      ...(p.bold ? { bold: true } : {}),
      dim: Boolean(p.dimColor),
    }
  })
}

export const lineText = (runs: readonly Run[]): string => runs.map(r => r.text).join('')

/** A lower band tree for the stack-order test: zm rows as listed, then a non-zm Text. */
export const stackTree = (keys: readonly string[]) => ({
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [
    ...keys.map(key => ({ type: 'Box', props: { key }, children: [{ type: 'Text', props: {}, children: [key] }] })),
    { type: 'Box', props: { key: 'other-band' }, children: [{ type: 'Text', props: {}, children: ['beneath'] }] },
  ],
})

/** The keys of a drawn tree's direct children, in order. */
export const childKeys = (tree: unknown): string[] =>
  (((tree as { children?: unknown[] }).children ?? []) as { props?: { key?: string } }[]).map(c => c.props?.key ?? '')
