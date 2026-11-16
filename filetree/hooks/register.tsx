// The filetree mod: a small tree of the working folder in the Files pane
// (pane.tsx). Folders are listed with $.fs.list as the pane opens and as a
// folder is opened; `git status --porcelain` marks changed files; the files
// Read, Edit, Write and NotebookEdit touched since the main loop's turn
// started are listed on top. No watcher: `r` or /tree refresh reads again,
// and a main turn's end reads git again while the pane is open.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawPane } from './pane'
import { COMMAND, PANE, PANE_TITLE, TOP_WALK_CAP, capMarks, clean, marksUnder, own, parsePorcelain, relOf, sortEntries, touchOf } from './tree'
import type { Entry } from './tree'

const root = atom({ plugin: 'filetree', key: 'root' } as const, '')
const open = atom({ plugin: 'filetree', key: 'open' } as const, [])
const listed = atom({ plugin: 'filetree', key: 'listed' } as const, {})
const git = atom({ plugin: 'filetree', key: 'git' } as const, {})
const touched = atom({ plugin: 'filetree', key: 'touched' } as const, {})

const USAGE = `Usage: /${COMMAND} [close | refresh | toggle <path>]`

/** The absolute path of a path relative to the root. */
const absOf = (rootPath: string, rel: string): string => (rel ? `${rootPath === '/' ? '' : rootPath}/${rel}` : rootPath)

/** The tree's root; read from the session when this load has none yet. */
async function rootOf($: EngineInterface): Promise<string> {
  const r = await read($, root)
  if (r) return r
  const cwd = await $.session.cwd()
  await update($, root, () => cwd)
  return cwd
}

/** Lists one folder into the state; a failed listing gives an empty folder. */
async function listDir($: EngineInterface, rootPath: string, rel: string): Promise<void> {
  let entries: Entry[] = []
  try {
    entries = sortEntries((await $.fs.list(absOf(rootPath, rel))).map(e => ({ name: e.name, kind: e.kind })))
  } catch {
    // Unreadable or gone: shown empty.
  }
  await update($, listed, l => ({ ...l, [rel]: entries }))
}

// The root relative to its repository's top, by root, found once per load.
const prefixes = new Map<string, string>()

/** The root relative to the nearest folder above it holding `.git` ('' when the root is the top, or none is found). */
async function prefixOf($: EngineInterface, rootPath: string): Promise<string> {
  const known = prefixes.get(rootPath)
  if (known !== undefined) return known
  let dir = rootPath.replace(/\/+$/, '') || '/'
  let prefix = ''
  for (let i = 0; i < TOP_WALK_CAP; i++) {
    const isTop = await $.fs.exists(`${dir === '/' ? '' : dir}/.git`).catch(() => false)
    if (isTop) {
      prefix = relOf(dir, rootPath) ?? ''
      break
    }
    if (dir === '/') break
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  prefixes.set(rootPath, prefix)
  return prefix
}

/**
 * Reads `git status --porcelain` for the root; a failure or a non-zero exit
 * gives no marks. GIT_OPTIONAL_LOCKS=0 keeps the read off the index lock, so
 * it never breaks a `git add` or `git commit` a background task is running.
 */
async function readGit($: EngineInterface, rootPath: string): Promise<void> {
  let marks: Record<string, string> = {}
  try {
    const ran = await $.process.run(['git', '-C', rootPath, 'status', '--porcelain'], { timeoutMs: 3000, env: { GIT_OPTIONAL_LOCKS: '0' } })
    if (ran.exitCode === 0 && !ran.isStdoutTruncated) marks = capMarks(marksUnder(parsePorcelain(ran.stdout), await prefixOf($, rootPath)))
  } catch {
    // No git, not a repository, or too slow: no marks.
  }
  await update($, git, () => marks)
}

/** Lists the root and every open folder again, then git. */
async function refresh($: EngineInterface): Promise<void> {
  const r = await rootOf($)
  await listDir($, r, '')
  for (const rel of await read($, open)) await listDir($, r, rel)
  await readGit($, r)
}

/** Opens or closes one folder; opening lists it first. The reply. */
async function toggle($: EngineInterface, rel: string): Promise<string> {
  const r = await rootOf($)
  if ((await read($, open)).includes(rel)) {
    await update($, open, o => o.filter(p => p !== rel))
    return `Closed ${clean(rel)}/.`
  }
  await listDir($, r, rel)
  await update($, open, o => (o.includes(rel) ? o : [...o, rel]))
  return `Opened ${clean(rel)}/.`
}

const isPaneOpen = async ($: EngineInterface): Promise<boolean> => (await $.ui.panes()).some(p => p.id === PANE)

async function openPane($: EngineInterface): Promise<string> {
  const placed = await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true })
  const r = await rootOf($)
  await listDir($, r, '')
  await readGit($, r)
  return placed.isPlaced ? 'Files pane opened.' : `Files pane opened; it shows once there is room (${clean(placed.reason ?? '')}).`
}

async function closePane($: EngineInterface): Promise<string> {
  if (!(await isPaneOpen($))) return 'The Files pane is not open.'
  await $.ui.close({ id: PANE })
  return 'Files pane closed.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: COMMAND,
      description: 'Files pane: a small tree of the working folder with git marks and the files touched this turn',
      argumentHint: 'close | refresh | toggle <path>',
    })
    const cwd = await $.session.cwd()
    // Another folder (a fresh load elsewhere) starts a fresh tree; a reload in the same one keeps its open folders.
    if ((await read($, root)) !== cwd) {
      await update($, root, () => cwd)
      await update($, open, () => [])
      await update($, listed, () => ({}))
      await update($, git, () => ({}))
    }
    await update($, touched, () => ({}))
    return started
  }).catch(($, e, next) => next(e))

  // A main-loop turn starts a fresh touched block.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId === undefined) await update($, touched, () => ({})).catch(() => {})
    return started
  }).catch(($, e, next) => next(e))

  // The files the tools touched, read after the tool ran; a write wins over a read.
  on('tool.call', { tool: ['Read', 'Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      const isApplied = ran.deny === undefined && !ran.isError && (ran.result as { staged?: unknown } | undefined)?.staged !== true
      if (!isApplied) return ran
      const hit = touchOf(e.tool, e as unknown as Record<string, unknown>, await rootOf($))
      // A computed key in a literal is an own key, `__proto__` included.
      if (hit) await update($, touched, t => (own(t, hit.path) === 'write' ? t : { ...t, [hit.path]: hit.kind }))
    } catch {
      // Best effort: the tool's result goes on whatever happens here.
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A main turn's end reads git again while the pane is open.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      if (e.agentId === undefined && (await isPaneOpen($))) await readGit($, await rootOf($))
    } catch {
      // The marks stay as they were.
    }
    return done
  }).catch(($, e, next) => next(e))

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'tree' }, async ($, e) => {
    const args = e.args.trim()
    const [word = ''] = args.split(/\s+/)
    const verb = word.toLowerCase()
    const rest = args.slice(word.length).trim()
    switch (verb) {
      case '':
        return { text: await openPane($) }
      case 'close':
        return { text: rest ? USAGE : await closePane($) }
      case 'refresh':
        if (rest) return { text: USAGE }
        await refresh($)
        return { text: 'Files read again.' }
      case 'toggle': {
        if (!rest) return { text: USAGE }
        const rel = relOf(await rootOf($), rest)
        if (rel === null) return { text: `/${COMMAND} toggle: ${clean(rest)} is outside the tree.` }
        if (rel === '') return { text: `/${COMMAND} toggle: the root is always open.` }
        return { text: await toggle($, rel) }
      }
      default:
        return { text: USAGE }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { text: `/${COMMAND} failed. Try /${COMMAND} refresh.` }))

  on('ui.render', { component: 'Pane', requestId: 'filetree' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    return drawPane($, e, {
      refresh: () => void refresh($).catch(() => {}),
      close: () => void closePane($).catch(() => ''),
      toggle: path => void toggle($, path).catch(() => ''),
    })
  }).catch(($, e, next) => next(e))
}
