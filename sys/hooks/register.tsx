// The sys mod: the ▣ SYS row (row.tsx draws it), the reader behind it, the
// btop button and /sys. The reader runs every 5 seconds from a $.clock timer
// (never on render) while a terminal shows the session and the row is on;
// each command it runs (sysctl, vm_stat, pmset) has a 2-second limit, and the
// reading is kept in $.state under sys.reading.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, ProcessRunResult, Register, Timer } from 'claude-code'

import type { SysReading } from '../types'
import {
  COMMAND,
  HERDR_TIMEOUT_MS,
  NEEDS_HERDR,
  RUN_TIMEOUT_MS,
  STORE_BAND,
  TICK_MS,
  USAGE,
  BTOP_LINE,
  cpuPercent,
  isBandOn,
  memUsedBytes,
  paneIdOf,
  parseBattery,
  parseLoad,
  parsePositiveInt,
  readingText,
} from './kit'
import { drawRow } from './row'

const reading = atom({ plugin: 'sys', key: 'reading' } as const, null)
const band = atom({ plugin: 'sys', key: 'band' } as const, '')

// The reader's timer. A reload drops it with the environment; session.start
// (raised again for a fresh load) starts it again.
let ticker: Timer | null = null
// One reading at a time: a slow command never stacks readings.
let isReading = false
// Bumped by every stop: a start that awaited across a later start or stop
// sees a newer generation and installs no timer, so no timer is ever orphaned.
let readerGen = 0
// One btop open at a time: repeated presses or /sys btop never split extra panes.
let isOpeningBtop = false

const stopTick = () => {
  readerGen += 1
  ticker?.cancel()
  ticker = null
}

/** A finished command's output, or null when it failed, timed out or could not start. */
const outOf = (r: PromiseSettledResult<ProcessRunResult>): string | null =>
  r.status === 'fulfilled' && r.value.exitCode === 0 ? r.value.stdout : null

/** Runs the five commands side by side and reads what came back; a part that failed is null. */
async function takeReading($: EngineInterface): Promise<SysReading> {
  const [load, ncpu, memsize, vmStat, batt] = await Promise.allSettled([
    $.process.run(['sysctl', '-n', 'vm.loadavg'], { timeoutMs: RUN_TIMEOUT_MS }),
    $.process.run(['sysctl', '-n', 'hw.ncpu'], { timeoutMs: RUN_TIMEOUT_MS }),
    $.process.run(['sysctl', '-n', 'hw.memsize'], { timeoutMs: RUN_TIMEOUT_MS }),
    $.process.run(['vm_stat'], { timeoutMs: RUN_TIMEOUT_MS }),
    $.process.run(['pmset', '-g', 'batt'], { timeoutMs: RUN_TIMEOUT_MS }),
  ])
  const loadAvg = parseLoad(outOf(load) ?? '')
  const cores = parsePositiveInt(outOf(ncpu) ?? '')
  const total = parsePositiveInt(outOf(memsize) ?? '')
  const vm = outOf(vmStat)
  const used = vm === null ? null : memUsedBytes(vm)
  const pm = outOf(batt)
  return {
    cpu: loadAvg !== null && cores !== null ? cpuPercent(loadAvg, cores) : null,
    ram: used !== null && total !== null ? { used, total } : null,
    battery: pm === null ? null : parseBattery(pm),
    readAt: await $.clock.now(),
  }
}

/** One reading into $.state; skipped while another is under way. */
async function refresh($: EngineInterface): Promise<SysReading | null> {
  if (isReading) return null
  isReading = true
  try {
    const r = await takeReading($)
    await update($, reading, () => r)
    return r
  } finally {
    isReading = false
  }
}

/** The reader runs only while a terminal shows the session and the row is on. */
async function isWanted($: EngineInterface, options: PluginOptions): Promise<boolean> {
  if (!isBandOn(await read($, band), options.band)) return false
  try {
    return (await $.session.surfaces()).includes('terminal')
  } catch {
    return false
  }
}

async function tick($: EngineInterface, options: PluginOptions): Promise<void> {
  if (!(await isWanted($, options))) {
    stopTick()
    return
  }
  await refresh($)
}

/** Starts the reader when it is wanted: a first reading now (from a timer), then every 5 seconds. */
async function startReader($: EngineInterface, options: PluginOptions): Promise<void> {
  stopTick()
  const gen = readerGen
  if (!(await isWanted($, options))) return
  // A later start or a stop ran while this one waited: it owns the reader now.
  if (gen !== readerGen) return
  $.clock.after(10, () => {
    void refresh($).catch(() => {})
  })
  ticker = $.clock.every(TICK_MS, () => {
    void tick($, options).catch(() => {})
  })
}

/**
 * Opens btop in a herdr pane below this one: split (no focus, the session's
 * cwd), then run the btop line in the new pane. Answers what happened.
 */
async function openBtop($: EngineInterface): Promise<string> {
  // Set before any await, so a second press in the same moment sees it.
  if (isOpeningBtop) return `btop is already opening (/${COMMAND} btop)`
  isOpeningBtop = true
  try {
    return await openBtopOnce($)
  } finally {
    isOpeningBtop = false
  }
}

async function openBtopOnce($: EngineInterface): Promise<string> {
  if ((await $.env.get('HERDR_ENV')) !== '1') return NEEDS_HERDR
  try {
    const cwd = await $.session.cwd()
    const split = await $.process.run(['herdr', 'pane', 'split', '--current', '--direction', 'down', '--no-focus', '--cwd', cwd], {
      timeoutMs: HERDR_TIMEOUT_MS,
    })
    const id = split.exitCode === 0 ? paneIdOf(split.stdout) : null
    if (!id) return `btop: herdr pane split gave no pane (/${COMMAND} btop)`
    const run = await $.process.run(['herdr', 'pane', 'run', id, BTOP_LINE], { timeoutMs: HERDR_TIMEOUT_MS })
    if (run.exitCode !== 0) return `btop: herdr pane run failed in ${id} (/${COMMAND} btop)`
    return `btop opened in pane ${id} below (/${COMMAND} btop)`
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return `btop did not open: ${why} (/${COMMAND} btop)`
  }
}

/** The button's action: from a timer (never inside the press), the answer as a toast. */
function btopFromButton($: EngineInterface): void {
  $.clock.after(10, () => {
    void openBtop($)
      .then(text => $.ui.toast(text))
      .catch(() => {})
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'sys',
      description: 'SYS row: CPU, RAM and battery now, open btop in a herdr pane, or turn the row on or off',
      argumentHint: 'on | off | now | btop',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the option applies.
    }
    await startReader($, options).catch(() => {})
    return started
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'sys' }, async ($, e) => {
    const [verb = 'now'] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    switch (verb) {
      case 'on':
      case 'off':
        await $.store.set(STORE_BAND, verb)
        await update($, band, () => verb)
        if (verb === 'off') {
          stopTick()
          return { text: `SYS line off (no row, no reading; /${COMMAND} now and btop still work).` }
        }
        await startReader($, options)
        return { text: 'SYS line on.' }
      case 'now': {
        const r = (await refresh($)) ?? (await read($, reading))
        return { text: r ? readingText(r) : 'A reading is under way; try again in a moment.' }
      }
      case 'btop':
        return { text: await openBtop($) }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawRow($, e, () => next(e), options, () => btopFromButton($)))
}
