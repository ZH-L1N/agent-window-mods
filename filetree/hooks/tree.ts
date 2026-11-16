// The filetree mod's pure parts: sorting a listing, the rows the pane shows,
// `git status --porcelain` read into marks, and which file a tool call touched.
// Paths are relative to the tree's root, with '' for the root itself.
import type { Entry, Touch } from '../types'

export type { Entry, Touch } from '../types'

export type Row = {
  path: string
  name: string
  depth: number
  kind: 'file' | 'dir'
  isOpen: boolean
  mark: string
  touch: '' | Touch
  more: number
}

export const IGNORE = ['.git', 'node_modules', '.DS_Store', '__pycache__', '.venv', 'dist', 'build', 'target'] as const
export const DIR_CAP = 200
export const ROW_CAP = 400
export const DEPTH_CAP = 8
/** Git marks kept from one read; the head line then reads `5000+ changed`. */
export const MARK_CAP = 5000

export const PANE = 'filetree'
export const PANE_TITLE = 'Files'
export const COMMAND = 'tree'
/** Paths the touched block lists. */
export const TOUCHED_CAP = 8
/** Folders walked up from the root looking for the repository's top. */
export const TOP_WALK_CAP = 64

const IGNORED: ReadonlySet<string> = new Set(IGNORE)

/** Folders first, then by name without regard to case; ignored names and `other` entries left out. */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .filter(e => e.kind !== 'other' && !IGNORED.has(e.name))
    .map(e => ({ name: e.name, kind: e.kind }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      const x = a.name.toLowerCase()
      const y = b.name.toLowerCase()
      return x < y ? -1 : x > y ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    })
}

export const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)

/**
 * A record's own value at `key`. A path is a key, and a file may be named
 * after an Object.prototype member (`constructor`, `toString`, `__proto__`):
 * a plain read would hand back the inherited function or object.
 */
export const own = <V>(record: Readonly<Record<string, V>>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/** Sets `key` as an own property, so a path named `__proto__` is a key like any other instead of the prototype's setter. */
export function setOwn<V>(record: Record<string, V>, key: string, value: V): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true })
}

/**
 * The folders holding a change: every folder above a marked path (a folder
 * git lists whole, `new/`, holds one too). Built once per marks object, so a
 * draw looks each row up instead of scanning every mark for it.
 */
const changedDirs = new WeakMap<Record<string, string>, ReadonlySet<string>>()

function dirsOf(git: Record<string, string>): ReadonlySet<string> {
  const known = changedDirs.get(git)
  if (known) return known
  const dirs = new Set<string>()
  for (const key of Object.keys(git)) {
    for (let at = key.indexOf('/'); at > 0; at = key.indexOf('/', at + 1)) dirs.add(key.slice(0, at))
  }
  changedDirs.set(git, dirs)
  return dirs
}

/** The code of a folder git lists whole (`new/`) at or above `path`; `''` marks the whole tree. */
function untrackedAbove(path: string, git: Record<string, string>): string | undefined {
  const whole = own(git, '')
  if (whole !== undefined) return whole
  for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) {
    const code = own(git, path.slice(0, at + 1))
    if (code !== undefined) return code
  }
  return undefined
}

/** A file's git code: its own, or that of a folder git lists whole above it. */
function fileMark(path: string, git: Record<string, string>): string {
  return own(git, path) ?? untrackedAbove(path, git) ?? ''
}

/** `•` when anything under the folder has a git code, or the folder sits inside one git lists whole. */
function dirMark(path: string, git: Record<string, string>): string {
  return dirsOf(git).has(path) || untrackedAbove(`${path}/`, git) !== undefined ? '•' : ''
}

/**
 * The rows the pane shows: the root's entries, and under every open folder
 * its listed entries, depth first, to DEPTH_CAP levels. A folder over DIR_CAP
 * shows its first DIR_CAP entries, the last carrying how many more there
 * are. The whole list stops at ROW_CAP.
 */
export function visibleRows(
  listed: Record<string, Entry[]>,
  open: readonly string[],
  git: Record<string, string>,
  touched: Record<string, Touch>,
): Row[] {
  const isOpen = new Set(open)
  const rows: Row[] = []
  const walk = (dir: string, depth: number): void => {
    const entries = own(listed, dir)
    if (!entries || depth >= DEPTH_CAP) return
    const shown = entries.slice(0, DIR_CAP)
    const more = entries.length - shown.length
    for (let i = 0; i < shown.length; i++) {
      if (rows.length >= ROW_CAP) return
      const e = shown[i]!
      if (e.kind === 'other') continue
      const path = join(dir, e.name)
      const isDir = e.kind === 'dir'
      const isOpened = isDir && isOpen.has(path)
      rows.push({
        path,
        name: e.name,
        depth,
        kind: e.kind,
        isOpen: isOpened,
        mark: isDir ? dirMark(path, git) : fileMark(path, git),
        touch: isDir ? '' : (own(touched, path) ?? ''),
        more: i === shown.length - 1 ? more : 0,
      })
      if (isOpened) walk(path, depth + 1)
    }
  }
  walk('', 0)
  return rows
}

/** A C-style quoted path as git writes it (`"sp ace.txt"`, `"caf\303\251"`); the text after it. */
function unquote(text: string): { path: string; rest: string } {
  const bytes: number[] = []
  const enc = new TextEncoder()
  const ESC: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, '\\': 92, a: 7, b: 8, f: 12, v: 11 }
  let i = 1
  while (i < text.length && text[i] !== '"') {
    const c = text[i]!
    if (c === '\\' && i + 1 < text.length) {
      const n = text[i + 1]!
      const oct = /^[0-7]{3}/.exec(text.slice(i + 1, i + 4))
      if (oct) {
        bytes.push(parseInt(oct[0], 8))
        i += 4
        continue
      }
      bytes.push(ESC[n] ?? n.charCodeAt(0))
      i += 2
      continue
    }
    const cp = text.codePointAt(i)!
    const ch = String.fromCodePoint(cp)
    bytes.push(...enc.encode(ch))
    i += ch.length
  }
  return { path: new TextDecoder().decode(new Uint8Array(bytes)), rest: text.slice(i + 1) }
}

/** One porcelain path field, quoted or bare. */
const pathOf = (text: string): string => (text.startsWith('"') ? unquote(text).path : text)

/**
 * `git status --porcelain` as a map of path to code: the two-letter code
 * trimmed (`M`, `A`, `D`, `??`, `R`), a rename's new path, quoted paths unquoted.
 */
export function parsePorcelain(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.length < 4) continue
    const code = line.slice(0, 2).trim()
    if (!code) continue
    let field = line.slice(3)
    if (/[RC]/.test(code)) {
      if (field.startsWith('"')) {
        const first = unquote(field)
        if (first.rest.startsWith(' -> ')) field = first.rest.slice(4)
      } else {
        const at = field.indexOf(' -> ')
        if (at >= 0) field = field.slice(at + 4)
      }
    }
    const path = pathOf(field)
    if (path) setOwn(out, path, code)
  }
  return out
}

/** A path relative to `root`, `.` and `..` resolved; null when it leaves the root. */
export function relOf(root: string, path: string): string | null {
  const base = root.replace(/\/+$/, '')
  let rest: string
  if (path.startsWith('/')) {
    if (path !== base && !path.startsWith(`${base}/`)) return null
    rest = path.slice(base.length)
  } else {
    rest = path
  }
  const parts: string[] = []
  for (const seg of rest.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

const READS: ReadonlySet<string> = new Set(['Read'])
const WRITES: ReadonlySet<string> = new Set(['Edit', 'Write', 'NotebookEdit'])

/** The file a tool call touched and how, relative to `root`; null for another tool or a path outside it. */
export function touchOf(tool: string, input: Record<string, unknown>, root: string): { path: string; kind: Touch } | null {
  const kind: Touch | null = READS.has(tool) ? 'read' : WRITES.has(tool) ? 'write' : null
  if (!kind) return null
  const raw = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (!raw || !raw.startsWith('/')) return null
  const path = relOf(root, raw)
  return path ? { path, kind } : null
}

/**
 * The porcelain marks of a root below the repository's top: only the paths
 * under it, made relative to it. `prefix` is the root relative to the top
 * ('' when they are one). When git lists the root itself or a folder above
 * it whole as untracked (`?? scratch/` for the root `scratch/app`), the
 * whole tree is untracked: the one mark `''`.
 */
export function marksUnder(git: Record<string, string>, prefix: string): Record<string, string> {
  if (!prefix) return git
  const lead = `${prefix}/`
  const out: Record<string, string> = {}
  for (const [path, code] of Object.entries(git)) {
    if (path.endsWith('/') && lead.startsWith(path)) return { '': code }
    if (path.startsWith(lead) && path.length > lead.length) setOwn(out, path.slice(lead.length), code)
  }
  return out
}

/** At most MARK_CAP marks, the first ones git printed. */
export function capMarks(marks: Record<string, string>): Record<string, string> {
  const keys = Object.keys(marks)
  if (keys.length <= MARK_CAP) return marks
  const out: Record<string, string> = {}
  for (const k of keys.slice(0, MARK_CAP)) setOwn(out, k, marks[k]!)
  return out
}

/** The head line's count: `N changed`, `5000+ changed` at the cap, `all untracked` when the whole tree is. */
export function changedText(marks: Record<string, string>): string {
  if (own(marks, '') !== undefined) return 'all untracked'
  const n = Object.keys(marks).length
  return n >= MARK_CAP ? `${MARK_CAP}+ changed` : `${n} changed`
}

/** The files touched this turn as the block lists them: writes first, then reads, at most TOUCHED_CAP. */
export function touchedList(touched: Record<string, Touch>): { path: string; kind: Touch }[] {
  const all = Object.entries(touched).map(([path, kind]) => ({ path, kind }))
  return [...all.filter(t => t.kind === 'write'), ...all.filter(t => t.kind === 'read')].slice(0, TOUCHED_CAP)
}

/** Text safe to draw: no control character (tab and newline too, a name is one line). */
export const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')

/** The last segment of an absolute path ('/' for the filesystem's root). */
export const baseName = (path: string): string => path.replace(/\/+$/, '').split('/').pop() || '/'
