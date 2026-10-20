// The peers mod: a herdr peer alarm. Every 30 seconds a $.clock timer runs
// `herdr agent list`, keeps the agents of this workspace other than this pane,
// and compares them with the last poll (kept in $.state under peers.seen):
// a peer that becomes blocked, one that finishes, and ALL DONE once every peer
// rests after work each raise one toast, and a clip when sound is on. The
// timer runs only in an interactive terminal session in a herdr pane
// (HERDR_ENV=1), never in a headless -p child; while /peer-alarm is off (from
// any pane: the store is shared) it keeps running but reads nothing.
//
// The board pane (/peer-alarm board) is one row per peer, blocked first; while
// it is open the same tick reads herdr whether or not the alarm is on, and the
// result file of each spoke this session sent a HERDR-ORCH request to, with
// $.fs. The requests come from the envelope headers in this session's prompts
// (prompt.submit). Nothing is drawn in the band.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Board, OrchRequest } from '../types'
import type { Alert, Peer } from './kit'
import {
  COMMAND,
  HERDR_TIMEOUT_MS,
  NEEDS_HERDR,
  SOUND_BLOCKED,
  SOUND_DONE,
  STORE_SOUND,
  STORE_WATCH,
  TICK_MS,
  USAGE,
  isSoundOn,
  isWatchOn,
  listText,
  parsePeers,
  step,
} from './kit'
import { PANE, PANE_TITLE, RESULT_MAX_BYTES, boardRows, isSafeReq, parseEnvelopes, recordEnvelopes, requestsByPane, resultPath, resultStatus } from './orch'
import { drawPane } from './pane'

const seen = atom({ plugin: 'peers', key: 'seen' } as const, null)
const isArmed = atom({ plugin: 'peers', key: 'isArmed' } as const, false)
const board = atom({ plugin: 'peers', key: 'board' } as const, null)
const requests = atom({ plugin: 'peers', key: 'requests' } as const, {})

// The poll's timer. A reload drops it with the environment; session.start
// (raised again for a fresh load) starts it again.
let ticker: Timer | null = null
// The baseline poll's 10 ms timer, cancelled with the ticker.
let baseline: Timer | null = null
// One poll at a time: a slow herdr never stacks polls.
let isPolling = false
// Bumped by every stop: a start that awaited across a later start or stop sees
// a newer generation and installs no timer, so no timer is ever orphaned.
let watchGen = 0
// Bumped by every forget (/peer-alarm on or off, or a tick that finds the alarm
// off): a poll that awaited across one keeps nothing and raises nothing.
let pollGen = 0

const stopTick = () => {
  watchGen += 1
  ticker?.cancel()
  ticker = null
  baseline?.cancel()
  baseline = null
}

type HerdrIds = { workspace: string; pane: string }

/** This pane's herdr workspace and pane, or null outside herdr. */
async function herdrIds($: EngineInterface): Promise<HerdrIds | null> {
  if ((await $.env.get('HERDR_ENV')) !== '1') return null
  const workspace = await $.env.get('HERDR_WORKSPACE_ID')
  const pane = await $.env.get('HERDR_PANE_ID')
  return workspace && pane ? { workspace, pane } : null
}

/** This workspace's peers now, or null when herdr did not answer with its JSON. */
async function readPeers($: EngineInterface, ids: HerdrIds): Promise<Peer[] | null> {
  try {
    const r = await $.process.run(['herdr', 'agent', 'list'], { timeoutMs: HERDR_TIMEOUT_MS })
    return r.exitCode === 0 ? parsePeers(r.stdout, ids.workspace, ids.pane) : null
  } catch {
    return null
  }
}

async function storeGet($: EngineInterface, key: string): Promise<unknown> {
  try {
    return await $.store.get(key)
  } catch {
    return undefined
  }
}

/** Toasts each alert; with sound on, the beeps for any blocked and the chime for ALL DONE. */
async function raise($: EngineInterface, options: PluginOptions, alerts: readonly Alert[]): Promise<void> {
  if (alerts.length === 0) return
  for (const a of alerts) $.ui.toast(a.text, { timeoutMs: 8_000 })
  if (!isSoundOn(await storeGet($, STORE_SOUND), options.sound)) return
  const clips = [
    ...(alerts.some(a => a.kind === 'blocked') ? [SOUND_BLOCKED] : []),
    ...(alerts.some(a => a.kind === 'alldone') ? [SOUND_DONE] : []),
  ]
  for (const asset of clips) void $.audio.play({ asset }).catch(() => {})
}

/** Whether the board pane is open in this session. */
async function isBoardOpen($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    return false
  }
}

/**
 * The result file of each request the board shows (the newest of each peer's
 * pane), read with $.fs: missing is null, present is its status ('' when its
 * first two lines are not a valid header). Only changed records are written.
 */
async function readResults($: EngineInterface, b: Board): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) return
  const shown = new Set(b.rows.map(r => r.pane))
  const found: Record<string, string | null> = {}
  for (const r of requestsByPane(await read($, requests)).values()) {
    if (!shown.has(r.pane) || !isSafeReq(r.req)) continue
    const path = resultPath(home, r.req)
    try {
      const stat = await $.fs.stat(path)
      found[r.req] = stat.kind === 'file' && stat.size <= RESULT_MAX_BYTES ? resultStatus(await $.fs.read(path), r.req) : ''
    } catch {
      // No result file yet.
      found[r.req] = null
    }
  }
  const isChanged = (l: Record<string, OrchRequest>) => Object.entries(found).some(([req, v]) => l[req] !== undefined && l[req].result !== v)
  if (!isChanged(await read($, requests))) return
  await update($, requests, l =>
    Object.fromEntries(Object.entries(l).map(([req, r]) => [req, req in found ? { ...r, result: found[req] ?? null } : r])),
  )
}

/**
 * One poll: read the peers; while the alarm watches, step against the last
 * poll, keep the result and raise the alerts; while the board is open, keep
 * its rows and read its spokes' result files.
 */
async function poll($: EngineInterface, options: PluginOptions, isWatch: boolean, isBoard: boolean): Promise<void> {
  if (isPolling) return
  isPolling = true
  const gen = pollGen
  try {
    const ids = await herdrIds($)
    if (!ids) return
    const peers = await readPeers($, ids)
    // A failed read changes nothing: no peer is taken to have gone.
    if (!peers) return
    const now = await $.clock.now()
    let alerts: Alert[] = []
    if (isWatch) {
      const r = step(await read($, seen), peers, now, await read($, isArmed))
      // A forget ran while this poll waited: its reset stands.
      await update($, seen, prev => (gen === pollGen ? r.seen : prev))
      await update($, isArmed, prev => (gen === pollGen ? r.isArmed : prev))
      alerts = r.alerts
    }
    // A board opened while this poll waited on herdr gets its rows from it too.
    if (isBoard || (await isBoardOpen($))) {
      const rows = boardRows(peers, await read($, seen), await read($, board), now)
      const b: Board = { at: now, workspace: ids.workspace, rows }
      await update($, board, () => b)
      await readResults($, b)
    }
    if (isWatch && gen === pollGen) await raise($, options, alerts)
  } finally {
    isPolling = false
  }
}

async function tick($: EngineInterface, options: PluginOptions): Promise<void> {
  const isWatch = isWatchOn(await storeGet($, STORE_WATCH))
  // Off, maybe from another pane ($.store is shared by every session): the
  // timer keeps running, so a later on from any pane takes effect here too,
  // but the alarm reads nothing and the last poll is forgotten, so the first
  // poll after on is a fresh baseline. An open board still reads herdr.
  if (!isWatch && ((await read($, seen)) !== null || (await read($, isArmed)))) await forget($)
  const isBoard = await isBoardOpen($)
  if (!isWatch && !isBoard) return
  await poll($, options, isWatch, isBoard)
}

/** `r` and `/peer-alarm board`: one poll now, the board's rows included. */
async function pollNow($: EngineInterface, options: PluginOptions): Promise<void> {
  await poll($, options, isWatchOn(await storeGet($, STORE_WATCH)), true)
}

/** Opens the board pane and reads herdr for it now; the answer of /peer-alarm board. */
async function openBoard($: EngineInterface, options: PluginOptions): Promise<string> {
  if (!(await herdrIds($))) return NEEDS_HERDR
  const isOpen = await isBoardOpen($)
  await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true })
  await pollNow($, options)
  return isOpen
    ? 'Peers board read again.'
    : `Peers board open: r polls now, q closes (/${COMMAND} board close); read every 30 s while open.`
}

/** Closes the board pane (`q`, `/peer-alarm board close`); false when it was not open. */
async function closeBoard($: EngineInterface): Promise<boolean> {
  if (!(await isBoardOpen($))) return false
  await $.ui.close({ id: PANE })
  return true
}

/** Keeps the HERDR-ORCH requests in a prompt this session submitted (its envelope headers). */
async function noteEnvelopes($: EngineInterface, text: string): Promise<void> {
  if (!text.includes('[HERDR-ORCH v0]')) return
  const ids = await herdrIds($)
  if (!ids) return
  const envs = parseEnvelopes(text, ids.pane)
  if (envs.length === 0) return
  const at = await $.clock.now()
  await update($, requests, l => recordEnvelopes(l, envs, at))
}

/**
 * Starts the watcher in a herdr pane: a first poll now (from a timer; it only
 * takes a baseline), then a tick every 30 seconds, which reads herdr while
 * /peer-alarm is on. Answers whether it started.
 */
async function startWatch($: EngineInterface, options: PluginOptions): Promise<boolean> {
  stopTick()
  const gen = watchGen
  if (!(await herdrIds($))) return false
  // A later start or a stop ran while this one waited: it owns the watcher now.
  if (gen !== watchGen) return false
  baseline = $.clock.after(10, () => {
    baseline = null
    void tick($, options).catch(() => {})
  })
  ticker = $.clock.every(TICK_MS, () => {
    void tick($, options).catch(() => {})
  })
  return true
}

/** Whether this session draws in a terminal (empty in a headless -p run). */
async function isTerminal($: EngineInterface): Promise<boolean> {
  try {
    return (await $.session.surfaces()).includes('terminal')
  } catch {
    return false
  }
}

/** Forgets the last poll, so the next one is a fresh baseline with ALL DONE disarmed. */
async function forget($: EngineInterface): Promise<void> {
  pollGen += 1
  await update($, seen, () => null)
  await update($, isArmed, () => false)
}

async function listAnswer($: EngineInterface): Promise<string> {
  const ids = await herdrIds($)
  if (!ids) return NEEDS_HERDR
  const peers = await readPeers($, ids)
  if (!peers) return `herdr agent list gave no answer (/${COMMAND} list)`
  return listText(ids.workspace, peers, await read($, seen), await $.clock.now())
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'peer-alarm',
      description: 'herdr peer alarm: list this workspace\'s agents, open the board pane, turn the alarm on or off, or its sound',
      argumentHint: 'list | board [close] | on | off | sound on|off',
    })
    // Only a person's terminal session watches: a headless -p child inherits the
    // herdr env and would poll and beep a second time.
    if (e.isInteractive && e.surface === 'terminal') await startWatch($, options).catch(() => false)
    return started
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'peer-alarm' }, async ($, e) => {
    const [verb = 'list', arg = ''] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    switch (verb) {
      case 'list':
        return { text: await listAnswer($) }
      case 'board':
        // `/peer-alarm board` opens the pane and polls now (the twin of `r`); `board close` is the twin of `q`.
        if (arg === 'close') return { text: (await closeBoard($)) ? 'Peers board closed.' : 'The peers board is not open.' }
        return { text: await openBoard($, options) }
      case 'on': {
        await $.store.set(STORE_WATCH, 'on')
        await forget($)
        const isStarted = (await isTerminal($)) && (await startWatch($, options))
        return { text: isStarted ? 'Peer alarm on: this herdr workspace is read every 30 s.' : `Peer alarm on, but idle here: ${NEEDS_HERDR}` }
      }
      case 'off':
        // The timer keeps running and reads nothing while off, so a later on
        // from any pane wakes every pane's watcher.
        await $.store.set(STORE_WATCH, 'off')
        await forget($)
        return { text: `Peer alarm off (/${COMMAND} on to watch again).` }
      case 'sound':
        if (arg === 'on' || arg === 'off') {
          await $.store.set(STORE_SOUND, arg)
          return { text: `Peer alarm sound ${arg}.` }
        }
        return { text: `Peer alarm sound is ${isSoundOn(await storeGet($, STORE_SOUND), options.sound) ? 'on' : 'off'} (/${COMMAND} sound on|off).` }
      default:
        return { text: USAGE }
    }
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The requests this session sends or answers: the HERDR-ORCH envelope headers
  // in its prompts, kept once the prompt entered. Nothing is changed.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.command && r.drop === undefined) await noteEnvelopes($, e.text)
    } catch {
      // A failed note keeps the requests as they were.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('ui.render', { component: 'Pane', requestId: 'peers' }, ($, e) =>
    drawPane($, e, {
      refresh: () => void pollNow($, options).catch(() => {}),
      close: () => void closeBoard($).catch(() => false),
    }),
  )
}
