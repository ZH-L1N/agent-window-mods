// Shared by register.tsx and row.tsx: the look, how a tool call reads as
// "now", which lines of a reply are questions for the person, the Haiku
// rewrite's request and answer, and the stack-order helper. Pure functions
// only; the state atoms are declared again in each file that reads or writes
// them (the engine reads a state source only from a const of the calling file).
import type { RenderElement, RenderNode } from 'claude-code'

import type { HereGoal } from '../types'
import type { PeerGoal } from '../types/peer'

export const CHIP = ' ◉ HERE    ' // padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up
export const CHIP_FG = '#0b0b0f'
export const CHIP_BG = '#fb923c'
export const COMMAND = 'here'
export const STORE_BAND = 'here.band'
/** The question shown in the row is cut to this many terminal columns. */
export const YOU_MAX = 60
/** A question line is kept this long in state (/here prints it whole up to this). */
export const QUESTION_KEEP = 200
/** At most this many question lines are kept from one reply. */
export const QUESTIONS_MAX = 5
/** What `now` is cut to in the row, and the goal's name. */
export const NOW_MAX = 48
export const GOAL_MAX = 40
/** On a narrow band the goal and now are cut further, in this order. */
export const GOAL_SHORT = 20
export const NOW_SHORT = 28

/** The rewrite (option rewrite=haiku): the reply's tail sent, the reply's cap, the time limit, the delay after the turn. */
export const REWRITE_MODEL = 'haiku'
export const REWRITE_REPLY_MAX = 8_000
export const REWRITE_MAX_TOKENS = 300
export const REWRITE_TIMEOUT_MS = 20_000
export const REWRITE_DELAY_MS = 10

// --- terminal columns

/** East Asian Wide and Fullwidth ranges (CJK, Hangul, fullwidth forms) and emoji: two columns each. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

/** The columns one character takes in the terminal: 2 for a wide one, else 1. */
export function charCells(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

/** The columns a string takes in the terminal. */
export const cellsOf = (s: string): number => [...s].reduce((w, ch) => w + charCells(ch), 0)

/** Control characters (C0, DEL, C1) as spaces: none of them reaches the row, /here or the state. */
// eslint-disable-next-line no-control-regex
export const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')

/** Control characters dropped, whitespace folded to single spaces, cut to `max` terminal columns (an ellipsis marks the cut). */
export function cut(text: string, max: number): string {
  const flat = clean(text).replace(/\s+/g, ' ').trim()
  if (cellsOf(flat) <= max) return flat
  let kept = ''
  let width = 0
  for (const ch of flat) {
    const w = charCells(ch)
    if (width + w > max - 1) break
    kept += ch
    width += w
  }
  return `${kept.trimEnd()}…`
}

// --- now: what a tool call is doing

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A path shown relative to `cwd` when under it; otherwise its last three parts after `…/` when it is long. */
export function relPath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, '') + '/'
  if (cwd && path.startsWith(root)) return path.slice(root.length) || '.'
  if (cwd && path === cwd.replace(/\/+$/, '')) return '.'
  const parts = path.split('/').filter(Boolean)
  return path.startsWith('/') && parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : path
}

const base = (w: string): string => w.slice(w.lastIndexOf('/') + 1)
/** A command word that only sets up the one after it. */
const PREFIX = new Set(['sudo', 'env', 'time', 'command', 'nohup', 'exec', 'nice'])
/** Programs named with their subcommand (`git status`, `uv run pytest`). */
const WITH_SUB = new Set([
  'git', 'gh', 'docker', 'kubectl', 'brew', 'cargo', 'go', 'npm', 'pnpm', 'yarn', 'bun', 'bunx', 'npx', 'uv', 'uvx',
  'claude', 'herdr', 'make', 'pip', 'pip3', 'poetry', 'just',
])
const INTERPRETERS = new Set(['python', 'python3', 'node', 'deno', 'ruby', 'bash', 'sh', 'zsh', 'fish'])
/** Options of those programs that take the next word as their value (`git -C dir status`). */
const VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--directory', '--project', '--manifest-path', '-R', '--repo', '-f', '--file'])

/**
 * The program a Bash command runs, as a few words: its first command that is
 * not a `cd`, with environment assignments and `sudo`-like prefixes dropped,
 * plus the subcommand for git, npm, uv and the like (`uv run pytest`), the
 * script for an interpreter (`python3 build.py`, `python3 -m pytest`).
 */
export function programOf(command: string): string {
  const first = command.split('\n').find(l => l.trim() !== '') ?? ''
  const segments = first.split(/&&|\|\||;|\|/).map(s => s.trim()).filter(Boolean)
  const seg = segments.find(s => !/^cd(\s|$)/.test(s)) ?? segments[0] ?? ''
  const words = seg.split(/\s+/).filter(Boolean).map(w => w.replace(/^['"]|['"]$/g, ''))
  let i = 0
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '') || PREFIX.has(words[i] ?? ''))) i++
  const prog = base(words[i] ?? '')
  if (!prog) return ''
  const rest = words.slice(i + 1)
  const plain = rest.filter(w => !w.startsWith('-'))
  if (WITH_SUB.has(prog)) {
    const plain = rest.filter((w, j) => !w.startsWith('-') && !VALUED.has(rest[j - 1] ?? ''))
    const sub = plain[0]
    if (!sub) return prog
    // `uv run pytest`, `npm run build`, `docker compose up`: one more word.
    return ['run', 'exec', 'compose', 'x'].includes(sub) && plain[1] ? `${prog} ${sub} ${base(plain[1])}` : `${prog} ${sub}`
  }
  if (INTERPRETERS.has(prog)) {
    const m = rest.indexOf('-m')
    if (m >= 0 && rest[m + 1]) return `${prog} -m ${rest[m + 1]}`
    return plain[0] ? `${prog} ${base(plain[0])}` : prog
  }
  return prog
}

/** `https://docs.example.com/a?b` -> `docs.example.com`; the text itself when it is no URL. */
const hostOf = (url: string): string => /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url)?.[1] ?? url

const TASK_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskStop'])

/**
 * What a main-loop tool call reads as in the row: a verb and its object
 * (`Editing agents/hooks/kit.ts`, `Running pytest`, `Reading README.md`),
 * paths relative to the session's directory, control characters dropped. Null
 * for a call with nothing to say.
 */
export function nowOf(tool: string, input: Record<string, unknown>, cwd: string): string | null {
  const text = nowWords(tool, input, cwd)
  return text === null ? null : clean(text).replace(/\s+/g, ' ').trim() || null
}

function nowWords(tool: string, input: Record<string, unknown>, cwd: string): string | null {
  const path = (key: string) => relPath(str(input[key]), cwd)
  switch (tool) {
    case 'Read':
      return input.file_path ? `Reading ${path('file_path')}` : 'Reading'
    case 'Edit':
    case 'MultiEdit':
      return input.file_path ? `Editing ${path('file_path')}` : 'Editing'
    case 'Write':
      return input.file_path ? `Writing ${path('file_path')}` : 'Writing'
    case 'NotebookEdit':
      return input.notebook_path ? `Editing ${path('notebook_path')}` : 'Editing a notebook'
    case 'Grep': {
      const pattern = cut(str(input.pattern), 24)
      return pattern ? `Searching for "${pattern}"` : 'Searching'
    }
    case 'Glob':
      return input.pattern ? `Finding ${cut(str(input.pattern), 30)}` : 'Finding files'
    case 'Bash': {
      const prog = programOf(str(input.command))
      return prog ? `Running ${prog}` : 'Running a command'
    }
    case 'WebFetch':
      return input.url ? `Fetching ${hostOf(str(input.url))}` : 'Fetching a page'
    case 'WebSearch':
      return input.query ? `Searching the web for "${cut(str(input.query), 24)}"` : 'Searching the web'
    case 'Agent':
    case 'Task': {
      const d = str(input.description)
      return d ? `Delegating "${cut(d, 30)}"` : 'Delegating to a subagent'
    }
    case 'Skill':
      return input.skill ? `Using skill ${str(input.skill)}` : 'Using a skill'
    case 'AskUserQuestion':
      return 'Asking you'
    case 'ToolSearch':
      return 'Loading tools'
  }
  if (TASK_TOOLS.has(tool)) return 'Updating the task list'
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) return `Calling ${mcp[1]} ${mcp[2]}`
  return tool ? `Using ${tool}` : null
}

// --- you: the questions the last reply asked

/** A line's text with its Markdown dress taken off: list marks, quote marks, headings, emphasis. */
function bare(line: string): string {
  return line
    .trim()
    .replace(/^(?:[>#]+\s*)+/, '')
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

const NUMBERED = /^\(?\d{1,2}[.)]\s+/
/** A line that asks for the go-ahead: `say go`, `say "go"`, `reply go`. */
const SAY_GO = /\b(?:say|reply|type|answer)\s+["'\u201c]?go\b/i
/** A heading or lead-in over a list of questions (`Open questions:`, `## Questions`). */
const QUESTION_HEAD = /\bquestions?\b.*:?\s*$/i

/** Whether a bare line ends as a question (a trailing `?` or a fullwidth one, maybe inside closing quotes or brackets). */
const endsAsk = (s: string): boolean => /[?\uff1f][)\]"'\u201d\u2019*_]*$/.test(s)

/**
 * The question lines of a reply, in order, at most QUESTIONS_MAX, each cut
 * to QUESTION_KEEP: lines ending in `?`, numbered items under a "questions"
 * heading, and "say go" lines. Code blocks are skipped; a line is shown
 * without its list and emphasis marks.
 */
export function questionsOf(answer: string): string[] {
  const out: string[] = []
  let inCode = false
  let underHead = false
  for (const raw of answer.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const line = bare(raw)
    if (!line) continue
    const isNumbered = NUMBERED.test(line)
    const isHead = !isNumbered && QUESTION_HEAD.test(line) && (/^\s*#/.test(raw) || /:\s*$/.test(line))
    if (isHead) {
      underHead = true
      if (!endsAsk(line)) continue
    } else if (!isNumbered && !/^[-*+]\s/.test(raw.trim())) {
      // A plain paragraph line ends the list a "questions" heading opened.
      if (underHead && !endsAsk(line)) underHead = false
    }
    if (endsAsk(line) || SAY_GO.test(line) || (isNumbered && underHead)) {
      out.push(cut(line, QUESTION_KEEP))
      if (out.length >= QUESTIONS_MAX) break
    }
  }
  return out
}

// --- goal

/** goal-meter's goal name while its list is open; '' without one, or once it is done. */
export function goalOf(g: PeerGoal | null | undefined): string {
  if (!g || typeof g !== 'object' || typeof g.name !== 'string') return ''
  if (!Array.isArray(g.tasks) || g.tasks.length === 0 || g.doneAt !== undefined) return ''
  return clean(g.name).trim()
}

/** The first line of a prompt that has text, cut to QUESTION_KEEP; '' for none. */
export const firstLineOf = (prompt: string): string => cut(prompt.split(/\r?\n/).find(l => l.trim() !== '') ?? '', QUESTION_KEEP)

/** At most this many open TaskCreate ids are kept for the fallback goal. */
export const TASKS_KEEP = 100

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const idOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/**
 * The fallback goal after a main-loop task-list call that went through. A list
 * opened by this call takes `prompt` (the first line of the prompt that started
 * it); a list already open keeps its own, so the goal is the longest-running
 * list's. Null once no TodoWrite item and no TaskCreate task is left open.
 */
export function listGoalOf(prev: HereGoal | null, tool: string, input: Record<string, unknown>, result: unknown, prompt: string): HereGoal | null {
  let todos = prev?.todos ?? 0
  let tasks = prev?.tasks ?? []
  const out = obj(result)
  switch (tool) {
    case 'TodoWrite':
      if (!Array.isArray(input.todos)) return prev
      todos = input.todos.map(obj).filter(t => typeof t.content === 'string' && t.status !== 'completed').length
      break
    case 'TaskCreate': {
      const id = idOf(obj(out.task).id)
      if (!id) return prev
      tasks = [...tasks.filter(t => t !== id), id]
      break
    }
    case 'TaskUpdate': {
      const id = idOf(input.taskId)
      // A refusal answers success: false; the task did not change.
      if (!id || out.success === false) return prev
      if (input.status === 'completed' || input.status === 'deleted') tasks = tasks.filter(t => t !== id)
      else if ((input.status === 'pending' || input.status === 'in_progress') && !tasks.includes(id)) tasks = [...tasks, id]
      break
    }
    default:
      return prev
  }
  if (todos === 0 && tasks.length === 0) return null
  return { text: prev ? prev.text : prompt, todos, tasks: tasks.slice(-TASKS_KEEP) }
}

// --- the switch and the option

/** The row's switch: /here on|off when set, else on. */
export const isBandOn = (stored: '' | 'on' | 'off'): boolean => stored !== 'off'

/** The `rewrite` option, held to its listed values: anything but `haiku` is `off`. */
export const rewriteOf = (option: unknown): 'off' | 'haiku' => (option === 'haiku' ? 'haiku' : 'off')

// --- the Haiku rewrite (option rewrite=haiku)

export const REWRITE_SYSTEM = [
  'You label where a coding session stands, for a one-line status row.',
  'Read the assistant reply and the task list, then answer with one JSON object and nothing else:',
  '{"goal": "...", "now": "...", "you": "..."}',
  'goal: what the work is for, at most 40 characters, from the task list or the reply.',
  'now: what was just done or is being done, a verb first ("Editing kit.ts", "Waiting for review"), at most 48 characters.',
  'you: the one thing the reply asks the person to answer or do, at most 60 characters; "" when it asks nothing.',
  'Keep file paths, commands and names exactly as written. Use "" for a part you cannot tell.',
].join('\n')

/** The rewrite's one user message: the reply's tail, the task list and the plain parts. */
export function rewritePrompt(answer: string, tasks: readonly { title: string; status: string }[], plain: { goal: string; now: string; you: string }): string {
  const reply = answer.length > REWRITE_REPLY_MAX ? `…${answer.slice(-REWRITE_REPLY_MAX)}` : answer
  const list = tasks.length ? tasks.map(t => `- [${t.status}] ${t.title}`).join('\n') : '(none)'
  return [
    '<reply>',
    reply,
    '</reply>',
    '<tasks>',
    list,
    '</tasks>',
    '<plain>',
    `goal: ${plain.goal || '(none)'}`,
    `now: ${plain.now || '(none)'}`,
    `you: ${plain.you || '(none)'}`,
    '</plain>',
  ].join('\n')
}

/** The rewrite's answer as the three parts, each cut to the row's limits; null when it holds no JSON object. */
export function parseRewrite(text: string): { goal: string; now: string; you: string } | null {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>
    if (typeof o !== 'object' || o === null) return null
    const part = (k: string, max: number) => (typeof o[k] === 'string' ? cut(o[k] as string, max) : '')
    return { goal: part('goal', GOAL_MAX), now: part('now', NOW_MAX), you: part('you', YOU_MAX) }
  } catch {
    return null
  }
}

// --- the three parts, as the row and /here show them

export type Parts = { goal: string; now: string; you: string[]; isRewritten: boolean }

/** The parts shown: the rewrite's where it said something, else the plain ones. */
export function partsOf(goal: string, now: string, you: readonly string[], rw: { goal: string; now: string; you: string } | null): Parts {
  if (!rw) return { goal, now, you: [...you], isRewritten: false }
  return {
    goal: rw.goal || goal,
    now: rw.now || now,
    you: rw.you ? [rw.you] : [...you],
    isRewritten: Boolean(rw.goal || rw.now || rw.you),
  }
}

/** What /here prints: the three parts, one line each, every question under `you`. */
export function summaryOf(p: Parts, isOn: boolean): string {
  const lines = [`goal  ${p.goal || '-'}`, `now   ${p.now || '-'}`]
  if (p.you.length === 0) lines.push('you   -')
  else p.you.forEach((q, i) => lines.push(`${i === 0 ? 'you   ' : '      '}${q}`))
  if (p.isRewritten) lines.push('(rewritten by Haiku from the last reply)')
  if (!isOn) lines.push('(the HERE row is off: /here on)')
  return lines.join('\n')
}

// Stack order of the zehui-mods band rows (plan 2026-10-20-boards-codemap-recap,
// section 0): SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60, HERE 70,
// NEXT 80. Copied unchanged from the canonical
// ~/.claude/skills/building-claude-code-mods/references/stack-row.tsx; change it
// there first, then in every band mod.

/** The rows each zehui-mods band draws, by stack order. */
export const STACK = { sys: 10, plan: 20, handoff: 30, cache: 40, agents: 50, goal: 60, here: 70, next: 80 } as const

/** A row's key: `zm-<order>-<name>`. */
export const stackKey = (name: keyof typeof STACK): string => `zm-${STACK[name]}-${name}`

type Loose = { type?: unknown; props?: Record<string, unknown> | null; part?: unknown; children?: unknown }

/** The order of a zehui-mods row (`zm-<order>-<name>`), or null for any other node. */
export const stackOrderOf = (node: unknown): number | null => {
  const key = node && typeof node === 'object' ? (node as Loose).props?.key : undefined
  const m = typeof key === 'string' ? /^zm-(\d+)-/.exec(key) : null
  return m ? Number(m[1]) : null
}

/**
 * The column a band hook beneath built: a Box whose only prop is
 * `flexDirection: 'column'` and whose direct children hold a zm row. A Box with
 * other props (a border, a padding) is another mod's own drawing, kept whole.
 */
const isStack = (node: Loose): node is Loose & { children: unknown[] } =>
  node.type === 'Box' &&
  node.props?.flexDirection === 'column' &&
  Object.keys(node.props).every(k => k === 'flexDirection') &&
  Array.isArray(node.children) &&
  node.children.some(c => stackOrderOf(c) !== null)

/**
 * `row` put in its slot among the zm rows of `below` (what `next(e)` drew):
 * zm rows sorted by their number, then every other child in its original order.
 * Nothing beneath (null, a failed next, the engine placeholder): the row alone.
 */
export function stackRow(row: RenderElement, below: unknown): RenderElement {
  const tree = below && typeof below === 'object' && (below as Loose).type !== 'engine' ? (below as Loose) : null
  if (!tree) return row
  let items: unknown[] = [tree]
  if (isStack(tree)) {
    items = [...tree.children]
    // The column's mark (whose drawing started there) moves to the one row
    // that carries none, its own; the engine lets a mark move, never multiply.
    const bare = items.filter(c => c && typeof c === 'object' && !(c as Loose).part)
    if (tree.part && bare.length === 1) items = items.map(c => (c === bare[0] ? { ...(c as object), part: tree.part } : c))
  }
  const rows = items.filter(c => stackOrderOf(c) !== null)
  const others = items.filter(c => stackOrderOf(c) === null)
  // A stable sort: two rows of one number keep their order, this row after.
  const sorted = [...rows, row].sort((a, b) => (stackOrderOf(a) ?? 0) - (stackOrderOf(b) ?? 0))
  return { type: 'Box', props: { flexDirection: 'column' }, children: [...sorted, ...others] as RenderNode[] }
}
