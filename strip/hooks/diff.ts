// The diff recorder's model: one applied Edit or Write as lines to draw.
// Pure, no engine calls. The lines come from what the tool itself reports:
// its `structuredPatch` (hunks with the file's true line numbers) when it has
// one, else a line diff of the whole file before and after, never of the
// Edit's two snippets alone (their line numbers would start at 1).
import type { DiffLine, DiffStep } from '../types'

export type { DiffLine, DiffStep }

/** The most steps one turn keeps. */
export const STEP_CAP = 50
/** The most lines one step keeps; the rest is counted in a closing note. */
export const LINE_CAP = 400
/** One line's text is cut here, so the state stays small. */
const TEXT_CAP = 300
/** A side with more lines than this is not diffed by the fallback. */
const SIDE_CAP = 2_000

type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number }
type PatchHunk = Hunk & { lines: readonly string[] }

/**
 * The text without control characters but tab (U+0000 to U+001F, U+007F to
 * U+009F): the strip's one cleaner for what it draws; each caller keeps its own
 * length cap.
 */
export const noControls = (text: string): string => text.replace(/[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g, '')

/** A text made safe to draw on one line (`noControls`), cut to `max` characters. */
export function clean(text: string, max = TEXT_CAP): string {
  const out = noControls(text).slice(0, max)
  // Never end on half of a surrogate pair.
  const last = out.charCodeAt(out.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? out.slice(0, -1) : out
}

/** `@@ -<oldStart>,<oldLines> +<newStart>,<newLines> @@`. */
export function hunkHeader(h: Hunk): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

const isHunk = (h: unknown): h is PatchHunk => {
  if (!h || typeof h !== 'object') return false
  const x = h as Record<string, unknown>
  return isCount(x.oldStart) && isCount(x.oldLines) && isCount(x.newStart) && isCount(x.newLines) && Array.isArray(x.lines)
}

/**
 * A tool's patch as lines: each hunk's header, then its lines. A line that
 * starts with a space is kept context, `-` removed, `+` added, anything else
 * (a `\ No newline` remark) context; the marker stays in the text.
 */
export function fromPatch(patch: readonly PatchHunk[]): DiffLine[] {
  const out: DiffLine[] = []
  for (const h of patch) {
    out.push({ kind: 'hunk', text: hunkHeader(h) })
    for (const raw of h.lines) {
      const line = String(raw)
      const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx'
      out.push({ kind, text: clean(line) })
    }
  }
  return out
}

/** A text's lines: none for '', and a closing newline adds no empty line. */
function linesOf(text: string): string[] {
  if (text === '') return []
  const parts = text.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

/** One step of the edit script, with its 1-based line number on both sides (where it is absent, the number it would have). */
type Op = { kind: 'ctx' | 'add' | 'del'; text: string; a: number; b: number }

/**
 * The edit script from `a` to `b` by longest common subsequence. The lines the
 * two share at the start and at the end are set aside first, so the table is
 * only as large as the part that differs.
 */
function opsOf(a: readonly string[], b: readonly string[]): Op[] {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const n = a.length - pre - suf
  const m = b.length - pre - suf
  const ops: Op[] = []
  for (let k = 0; k < pre; k++) ops.push({ kind: 'ctx', text: a[k]!, a: k + 1, b: k + 1 })

  // table[i * w + j]: the LCS length of the middle parts from i and from j.
  const w = m + 1
  const table = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[pre + i] === b[pre + j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!)
    }
  }
  let i = 0
  let j = 0
  while (i < n || j < m) {
    const at = { a: pre + i + 1, b: pre + j + 1 }
    if (i < n && j < m && a[pre + i] === b[pre + j]) {
      ops.push({ kind: 'ctx', text: a[pre + i]!, ...at })
      i++
      j++
    } else if (i < n && (j >= m || table[(i + 1) * w + j]! >= table[i * w + j + 1]!)) {
      ops.push({ kind: 'del', text: a[pre + i]!, ...at })
      i++
    } else {
      ops.push({ kind: 'add', text: b[pre + j]!, ...at })
      j++
    }
  }
  for (let k = 0; k < suf; k++) {
    ops.push({ kind: 'ctx', text: a[pre + n + k]!, a: pre + n + k + 1, b: pre + m + k + 1 })
  }
  return ops
}

/** The header of a run of ops; a side with no lines in it starts one line before. */
function headerOf(run: readonly Op[]): string {
  const olds = run.filter(o => o.kind !== 'add')
  const news = run.filter(o => o.kind !== 'del')
  return hunkHeader({
    oldStart: olds[0]?.a ?? Math.max(0, (run[0]?.a ?? 1) - 1),
    oldLines: olds.length,
    newStart: news[0]?.b ?? Math.max(0, (run[0]?.b ?? 1) - 1),
    newLines: news.length,
  })
}

/**
 * The line diff of two whole texts: hunks of changes with `context` kept
 * lines around each, every hunk led by a header with the file's true line
 * numbers. No lines for the same text; one note when a side is too large.
 */
export function fromTexts(before: string, after: string, context = 1): DiffLine[] {
  const a = linesOf(before)
  const b = linesOf(after)
  if (a.length > SIDE_CAP || b.length > SIDE_CAP) return [{ kind: 'note', text: 'file too large to diff here' }]
  const ops = opsOf(a, b)
  const keep = Math.max(0, Math.floor(context))
  // The ranges of ops to show, merged where their context touches.
  const ranges: [number, number][] = []
  ops.forEach((o, k) => {
    if (o.kind === 'ctx') return
    const from = Math.max(0, k - keep)
    const to = Math.min(ops.length - 1, k + keep)
    const lastRange = ranges[ranges.length - 1]
    if (lastRange && from <= lastRange[1] + 1) lastRange[1] = Math.max(lastRange[1], to)
    else ranges.push([from, to])
  })
  const out: DiffLine[] = []
  for (const [from, to] of ranges) {
    const run = ops.slice(from, to + 1)
    out.push({ kind: 'hunk', text: headerOf(run) })
    for (const o of run) out.push({ kind: o.kind, text: clean((o.kind === 'add' ? '+' : o.kind === 'del' ? '-' : ' ') + o.text) })
  }
  return out
}

/** The file after an Edit, replayed on its original; null when the old string is not in it. */
function replay(original: string, oldString: string, newString: string, isAll: boolean): string | null {
  if (oldString === '') return original === '' ? newString : null
  const at = original.indexOf(oldString)
  if (at < 0) return null
  // Plain joins: the new text is never read as a replacement pattern.
  if (isAll) return original.split(oldString).join(newString)
  return original.slice(0, at) + newString + original.slice(at + oldString.length)
}

const NO_DIFF: DiffLine[] = [{ kind: 'note', text: 'no diff available' }]

/**
 * One applied call as a step, from the tool's result object: its patch, else
 * the whole-file diff, else a note. Null when the result is not an Edit's or
 * a Write's (no object, no file path).
 */
export function stepOf(tool: 'Edit' | 'Write', result: unknown): DiffStep | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const r = result as Record<string, unknown>
  if (typeof r.filePath !== 'string') return null
  const file = clean(r.filePath, 1_000)
  if (file === '') return null

  const hunks = Array.isArray(r.structuredPatch) ? r.structuredPatch.filter(isHunk) : []
  let lines: DiffLine[]
  if (hunks.length > 0) {
    lines = fromPatch(hunks)
  } else if (typeof r.originalFile === 'string') {
    const after =
      tool === 'Write'
        ? typeof r.content === 'string'
          ? r.content
          : null
        : replay(r.originalFile, typeof r.oldString === 'string' ? r.oldString : '', typeof r.newString === 'string' ? r.newString : '', r.replaceAll === true)
    if (after === null) lines = NO_DIFF
    else {
      lines = fromTexts(r.originalFile, after)
      if (lines.length === 0) lines = [{ kind: 'note', text: 'no line changes' }]
    }
  } else {
    lines = NO_DIFF
  }

  const adds = lines.filter(l => l.kind === 'add').length
  const dels = lines.filter(l => l.kind === 'del').length
  if (lines.length > LINE_CAP) {
    const left = lines.length - LINE_CAP
    lines = [...lines.slice(0, LINE_CAP), { kind: 'note', text: `${left} more line${left === 1 ? '' : 's'} not shown` }]
  }
  return { file, tool, lines: lines.map(l => ({ kind: l.kind, text: l.text })), adds, dels }
}
