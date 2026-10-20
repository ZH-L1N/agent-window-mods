// The code map's books: which files the tools touched (Read, Edit, Write,
// MultiEdit, NotebookEdit, Grep, Glob, and the paths a Bash command names),
// one record per file and main-loop turn, the one-line summaries taken from
// the edits themselves, `git diff --numstat` read back, and the scopes the
// Code view draws (this turn, the turn before, or the whole session).
// Plain data work, no engine calls; register.tsx keeps the books, code.tsx draws.
import type { CodeScope, CodeState, CodeTouch } from '../types'
import { lexWords } from './shells'

/** A node is drawn `editing` (amber) this long after an edit. */
export const EDITING_MS = 30_000
/** A node's width in cells, its round border included. */
export const NODE_W = 22
/** The arrow between consecutive edited files. */
export const ARROW = '──▶'
/** Under this many columns the Code view is a tree list. */
export const TREE_BELOW = 60
/** Records kept: the oldest turns' go first (the current and previous turn's always stay). */
export const CODE_MAX = 400
/** The tools whose calls the map reads, besides Bash. */
export const FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Grep', 'Glob'] as const
/** The tools that edit the file they name. */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** The `git diff --numstat` call's limit. */
export const NUMSTAT_TIMEOUT_MS = 5_000

/** The `summaries` option: `edit` (default), `haiku` (drawn as `edit`: see the README) or `off`. */
export type Summaries = 'edit' | 'haiku' | 'off'
export const summariesOf = (option: unknown): Summaries => (option === 'off' ? 'off' : option === 'haiku' ? 'haiku' : 'edit')

/** One touch a tool call made: the file, read or edit, and by which tool. */
export type Touch = { path: string; isEdit: boolean; tool: string; summary?: string }

/** `/a/b/../c` → `/a/c`; a relative path joined to `cwd` first. */
export function resolvePath(path: string, cwd: string): string {
  const joined = path.startsWith('/') ? path : `${cwd.replace(/\/+$/, '')}/${path}`
  const out: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

/** A summary's length cap when recorded (a minified line must not bloat the state). */
export const SUMMARY_MAX = 80
const capped = (s: string | undefined): string | undefined => (s !== undefined && s.length > SUMMARY_MAX ? s.slice(0, SUMMARY_MAX - 1) + '…' : s)

const firstLine = (text: string): string | undefined => capped(text.split('\n').map(l => l.trim()).find(l => l !== ''))

/** The Edit's first changed line: the first line of the new text not in the old, else its first line. */
export function editSummary(oldText: string, newText: string): string | undefined {
  const old = new Set(oldText.split('\n').map(l => l.trim()))
  return capped(
    newText
      .split('\n')
      .map(l => l.trim())
      .find(l => l !== '' && !old.has(l)),
  ) ?? firstLine(newText)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** What one file tool's call touched (Bash aside); empty for a call that names no path. */
export function toolTouches(tool: string, input: Record<string, unknown>, cwd: string): Touch[] {
  const isSearch = tool === 'Grep' || tool === 'Glob'
  const path = str(input.file_path) || str(input.notebook_path) || (isSearch ? str(input.path) : '')
  // Only a search's path can be a glob; an edited or read file's path is literal (`app/[id]/page.tsx`).
  if (!path || (isSearch && /[*?[]/.test(path))) return []
  const abs = resolvePath(path, cwd)
  if (tool === 'Edit') return [{ path: abs, isEdit: true, tool, summary: editSummary(str(input.old_string), str(input.new_string)) }]
  if (tool === 'MultiEdit') {
    const first = Array.isArray(input.edits) ? (input.edits[0] as Record<string, unknown> | undefined) : undefined
    return [{ path: abs, isEdit: true, tool, summary: first ? editSummary(str(first.old_string), str(first.new_string)) : undefined }]
  }
  if (tool === 'Write') return [{ path: abs, isEdit: true, tool, summary: firstLine(str(input.content)) }]
  if (tool === 'NotebookEdit') return [{ path: abs, isEdit: true, tool, summary: firstLine(str(input.new_source)) }]
  return [{ path: abs, isEdit: false, tool }]
}

const OPERATORS = new Set(['&&', '||', ';', '|', '&'])
const base = (w: string): string => w.slice(w.lastIndexOf('/') + 1)
/** A word that can be a file the map shows: no flag, glob, variable or device. */
const isFile = (w: string): boolean => w !== '' && w !== '.' && w !== '-' && !w.startsWith('-') && !/[*?$`{}]/.test(w) && !w.startsWith('/dev/')

/**
 * The command with each heredoc's body dropped, up to its closing tag line:
 * the line that opens it stays (`cat > notes.md <<'EOF'` still writes notes.md).
 * `<<<` here-strings are left alone.
 */
export function withoutHeredocs(command: string): string {
  const out: string[] = []
  const tags: string[] = []
  for (const line of command.split('\n')) {
    if (tags.length > 0) {
      if (line.replace(/^\t+/, '').trimEnd() === tags[0]) tags.shift()
      continue
    }
    out.push(line)
    for (const m of line.matchAll(/(?<![<\w])<<-?\s*(['"]?)([A-Za-z_][\w.-]*)\1/g)) tags.push(m[2] ?? '')
  }
  return out.join('\n')
}

/**
 * The files a Bash command reads or writes, as far as its words say: `cat`
 * reads, `sed -i` edits, `>` and `>>` write their target, `git add` reads,
 * `git checkout -- <file>` and `git restore` rewrite, `cp` reads its sources
 * and writes its target, `mv` writes its target. Anything else touches nothing.
 */
export function bashTouches(command: string, cwd: string): Touch[] {
  const out: Touch[] = []
  const add = (w: string, isEdit: boolean, tool: string) => {
    if (isFile(w)) out.push({ path: resolvePath(w, cwd), isEdit, tool })
  }
  const segments: string[][] = [[]]
  const words = lexWords(withoutHeredocs(command))
  for (let k = 0; k < words.length; k++) {
    const { text: w, isQuotedStart } = words[k] ?? { text: '', isQuotedStart: false }
    if (OPERATORS.has(w) && !isQuotedStart) {
      segments.push([])
      continue
    }
    // A quoted `>` (`grep -c '>' f`) is an argument, not a redirect.
    if (isQuotedStart) {
      segments[segments.length - 1]?.push(w)
      continue
    }
    // `>`/`>>` (stdout, or `1>`) write their file; `2>`, `<` and `>&` do not count.
    const redirect = /^(1?)(>>?)(.*)$/.exec(w)
    if (redirect && !w.startsWith('>&') && !/^\d*>&/.test(w)) {
      const target = redirect[3] || words[++k]?.text || ''
      add(target, true, 'Bash')
      continue
    }
    if (/^\d*(?:[<>]{1,2}|&>{1,2})/.test(w)) {
      if (/^\d*(?:[<>]{1,2}|&>{1,2})$/.test(w)) k++
      continue
    }
    segments[segments.length - 1]?.push(w)
  }
  for (const seg of segments) {
    let i = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i] ?? '') || seg[i] === 'sudo' || seg[i] === 'command') i++
    const head = base(seg[i] ?? '')
    const args = seg.slice(i + 1)
    const files = args.filter(isFile)
    if (head === 'cat') files.forEach(f => add(f, false, 'Bash'))
    else if (head === 'sed' && args.some(a => /^-i|^--in-place|^-[a-zA-Z]*i/.test(a))) {
      // The script is the first positional unless -e or -f gave it.
      const hasScript = args.some(a => a === '-e' || a === '-f' || a.startsWith('--expression') || a.startsWith('--file'))
      const pos: string[] = []
      for (let j = 0; j < args.length; j++) {
        const a = args[j] ?? ''
        // BSD sed's `-i ''` (or `-i .bak`): the suffix word is not the script.
        if (a === '-i' && (args[j + 1] === '' || args[j + 1]?.startsWith('.'))) j++
        else if (a === '-e' || a === '-f') j++
        else if (!a.startsWith('-')) pos.push(a)
      }
      pos.slice(hasScript ? 0 : 1).forEach(f => add(f, true, 'Bash'))
    } else if (head === 'git') {
      const sub = args.find(a => !a.startsWith('-'))
      const rest = args.slice(args.indexOf(sub ?? '') + 1)
      if (sub === 'add') rest.filter(isFile).forEach(f => add(f, false, 'git add'))
      else if (sub === 'checkout') {
        const dash = rest.indexOf('--')
        if (dash >= 0) rest.slice(dash + 1).forEach(f => add(f, true, 'git checkout'))
      } else if (sub === 'restore') rest.filter(isFile).forEach(f => add(f, true, 'git restore'))
    } else if (head === 'cp' || head === 'mv') {
      if (files.length < 2) continue
      const target = files[files.length - 1] ?? ''
      if (head === 'cp') files.slice(0, -1).forEach(f => add(f, false, 'Bash'))
      add(target, true, 'Bash')
    }
  }
  return out
}

/** Lines added and removed in `git diff --numstat` output; undefined when it names none (or only binaries). */
export function parseNumstat(stdout: string): { plus: number; minus: number } | undefined {
  let plus = 0
  let minus = 0
  let isAny = false
  for (const line of stdout.split('\n')) {
    const m = /^(\d+)\t(\d+)\t/.exec(line)
    if (!m) continue
    plus += Number(m[1])
    minus += Number(m[2])
    isAny = true
  }
  return isAny ? { plus, minus } : undefined
}

/** The parent folder of a path. */
export const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/'

/**
 * The records with one touch added: merged into the file's record for this
 * turn (tools, who, last touch; for an edit its state, summary and edit
 * times), or a new record. The oldest turns' records go past CODE_MAX.
 */
export function addTouch(list: readonly CodeTouch[], t: Touch & { turn: number; at: number; by: string; isError?: boolean }): CodeTouch[] {
  const prev = list.find(c => c.path === t.path && c.turn === t.turn)
  const rec: CodeTouch = prev
    ? { ...prev, tools: [...prev.tools], by: [...prev.by] }
    : { path: t.path, turn: t.turn, lastAt: t.at, state: 'read', tools: [], by: [] }
  rec.lastAt = t.at
  if (!rec.tools.includes(t.tool)) rec.tools.push(t.tool)
  if (!rec.by.includes(t.by)) rec.by.push(t.by)
  if (t.isEdit) {
    rec.editedAt = rec.editedAt ?? t.at
    rec.lastEditAt = t.at
    rec.state = t.isError ? 'failed' : 'changed'
    if (!t.isError && t.summary) rec.summary = t.summary
  }
  const next = prev ? list.map(c => (c === prev ? rec : c)) : [...list, rec]
  if (next.length <= CODE_MAX) return next
  const keepFrom = t.turn - 1
  const old = next.filter(c => c.turn < keepFrom).sort((a, b) => a.turn - b.turn || a.lastAt - b.lastAt)
  const drop = new Set(old.slice(0, next.length - CODE_MAX))
  return next.filter(c => !drop.has(c))
}

/** A file as the map draws it: its records in the scope merged. */
export type MapFile = {
  path: string
  editedAt?: number
  lastEditAt?: number
  lastAt: number
  state: CodeState
  plus?: number
  minus?: number
  tools: string[]
  summary?: string
  by: string[]
  /** The main-loop turns it was touched in. */
  turns: number[]
}

/** The map's scope: its files, the turn it shows (session: the current one), and whether it is the turn before. */
export type ScopeView = { files: MapFile[]; turn: number; isPrevious: boolean; scope: CodeScope }

/**
 * The files the map shows: this turn's (the turn before's while this one
 * touched nothing yet), or every turn's merged by path for the session. Edited
 * files come first in edit order, then the read-only ones by last touch.
 */
export function scopeOf(list: readonly CodeTouch[], turn: number, scope: CodeScope): ScopeView {
  let records = scope === 'session' ? [...list] : list.filter(c => c.turn === turn)
  let isPrevious = false
  if (scope === 'turn' && records.length === 0) {
    const before = list.filter(c => c.turn < turn)
    const last = before.length ? Math.max(...before.map(c => c.turn)) : undefined
    if (last !== undefined) {
      records = before.filter(c => c.turn === last)
      isPrevious = true
    }
  }
  const byPath = new Map<string, MapFile>()
  for (const c of [...records].sort((a, b) => a.turn - b.turn || a.lastAt - b.lastAt)) {
    const f = byPath.get(c.path)
    if (!f) {
      byPath.set(c.path, { ...c, tools: [...c.tools], by: [...c.by], turns: [c.turn] })
      continue
    }
    f.lastAt = Math.max(f.lastAt, c.lastAt)
    f.tools.push(...c.tools.filter(x => !f.tools.includes(x)))
    f.by.push(...c.by.filter(x => !f.by.includes(x)))
    if (!f.turns.includes(c.turn)) f.turns.push(c.turn)
    if (c.editedAt !== undefined) {
      f.editedAt = f.editedAt ?? c.editedAt
      f.lastEditAt = c.lastEditAt
      f.state = c.state
      f.summary = c.summary ?? f.summary
      if (c.plus !== undefined) {
        f.plus = c.plus
        f.minus = c.minus
      }
    }
  }
  const all = [...byPath.values()]
  const edited = all.filter(f => f.editedAt !== undefined).sort((a, b) => (a.editedAt ?? 0) - (b.editedAt ?? 0))
  const read = all.filter(f => f.editedAt === undefined).sort((a, b) => b.lastAt - a.lastAt)
  return { files: [...edited, ...read], turn: isPrevious ? Math.max(0, ...records.map(c => c.turn)) : turn, isPrevious, scope }
}

/** What a node draws for its state now: `editing` for 30 s after an edit that did not fail. */
export type ShownState = CodeState | 'editing'
export const shownState = (f: Pick<MapFile, 'state' | 'lastEditAt'>, at: number): ShownState =>
  f.state !== 'failed' && f.lastEditAt !== undefined && at - f.lastEditAt < EDITING_MS ? 'editing' : f.state

/** How many nodes (each with its arrow) fit across `cols`; at least one. */
export const nodesPerRow = (cols: number): number => Math.max(1, Math.floor((cols + ARROW.length) / (NODE_W + ARROW.length)))

/** Each file's short name: its base name, with its parent folder when another file in view shares the base name. */
export function namesOf(paths: readonly string[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const p of paths) count.set(base(p), (count.get(base(p)) ?? 0) + 1)
  return new Map(
    paths.map(p => {
      const b = base(p)
      if ((count.get(b) ?? 0) < 2) return [p, b]
      const dir = dirOf(p)
      return [p, `${base(dir)}/${b}`]
    }),
  )
}

/** A path shown relative to `cwd` when under it. */
export const relPath = (path: string, cwd: string): string => {
  const root = cwd.replace(/\/+$/, '') + '/'
  return cwd && path.startsWith(root) ? path.slice(root.length) : path
}

/** The tools as initials, in first-use order (`ER`), Bash as `B`, git's as `G`. */
export const toolMarks = (tools: readonly string[]): string =>
  [...new Set(tools.map(t => (t.startsWith('git') ? 'G' : t === 'MultiEdit' ? 'M' : t === 'NotebookEdit' ? 'N' : t.charAt(0))))].join('')
