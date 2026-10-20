// Background shells: what a command runs (a coding agent's CLI or a plain
// shell), the task notification that ends one, and the last line of its output.
// Plain string work, no engine calls; register.tsx keeps the books.

/** What a shell's command is labelled with: the coding agent and its model, and the task text. */
export type ShellLabel = {
  /** `codex`, `opencode` or `claude`; absent for a plain shell. */
  label?: string
  /** The model named by `-m`/`--model` (codex also `-c model=`), when given. */
  model?: string
  /** The agent's prompt when one is found; else the command, its whitespace folded. */
  task: string
}

/** One `<task-notification>` as the engine writes it into the conversation. */
export type TaskNote = {
  id: string
  /** `completed`, `failed`, `killed`, or another word its producer wrote. */
  status: string
  toolUseId?: string
  outputFile?: string
  /** The exit code its summary names, when it does. */
  exitCode?: number
}

const fold = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** One lexed word: its text, and whether its first character was quoted or escaped (so `'>'` is no redirect). */
export type Word = { text: string; isQuotedStart: boolean }

/** A command's words and control operators, quotes honoured and marked (a small shell lexer, no expansion). */
export function lexWords(command: string): Word[] {
  const out: Word[] = []
  let word: string | null = null
  let isQuotedStart = false
  const add = (s: string, isQuoted: boolean) => {
    if (word === null) isQuotedStart = isQuoted
    word = (word ?? '') + s
  }
  const push = () => {
    if (word !== null) out.push({ text: word, isQuotedStart })
    word = null
  }
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i)
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      const stop = end < 0 ? command.length : end
      add(command.slice(i + 1, stop), true)
      i = stop
    } else if (c === '"') {
      let s = ''
      let j = i + 1
      for (; j < command.length && command.charAt(j) !== '"'; j++) {
        if (command.charAt(j) === '\\' && j + 1 < command.length) j++
        s += command.charAt(j)
      }
      add(s, true)
      i = j
    } else if (c === '\\' && i + 1 < command.length) {
      add(command.charAt(++i), true)
    } else if (c === '&' && (command.charAt(i - 1) === '>' || command.charAt(i - 1) === '<' || command.charAt(i + 1) === '>')) {
      // Part of a redirection (`2>&1`, `&>`), not an operator.
      add(c, false)
    } else if (c === '&' || c === '|' || c === ';' || c === '\n') {
      push()
      const two = command.slice(i, i + 2)
      if (two === '&&' || two === '||') {
        out.push({ text: two, isQuotedStart: false })
        i++
      } else out.push({ text: c === '\n' ? ';' : c, isQuotedStart: false })
    } else if (/\s/.test(c)) push()
    else add(c, false)
  }
  push()
  return out
}

/** A command's words and control operators, quotes honoured (a small shell lexer, no expansion). */
export const wordsOf = (command: string): string[] => lexWords(command).map(w => w.text)

const OPERATORS = new Set(['&&', '||', ';', '|', '&'])
/** Words that run the next word as the command. */
const WRAPPERS = new Set(['nohup', 'time', 'command', 'exec', 'caffeinate'])
/** Commands that only set up the one after them. */
const SETUP = new Set(['cd', 'pushd', 'export', 'source', '.', 'set', 'unset'])

/**
 * The words of each command that runs, in order (a pipeline's and a list's
 * segments alike): setup segments, assignments and wrappers skipped.
 */
function runSegments(words: readonly string[]): string[][] {
  const segments: string[][] = [[]]
  for (let k = 0; k < words.length; k++) {
    const w = words[k] ?? ''
    if (OPERATORS.has(w)) segments.push([])
    else if (/^\d*(?:[<>]|&>)/.test(w)) {
      // A redirection: `>`, `2>` and `&>` take the next word as their file; `2>&1` and `>out` hold it.
      if (/^\d*(?:[<>]{1,2}|&>{1,2})$/.test(w)) k++
    } else segments[segments.length - 1]?.push(w)
  }
  const out: string[][] = []
  for (const seg of segments) {
    let i = 0
    for (;;) {
      const w = seg[i]
      if (w === undefined) break
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++
      else if (WRAPPERS.has(w)) {
        i++
        while (seg[i]?.startsWith('-')) i++
      } else if (w === 'env') {
        i++
        while (seg[i]?.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i] ?? '')) i++
      } else if (w === 'timeout' || w === 'gtimeout') {
        i++
        while (seg[i]?.startsWith('-')) i += /^-(k|s)$|^--(kill-after|signal)$/.test(seg[i] ?? '') ? 2 : 1
        i++ // the duration
      } else break
    }
    const rest = seg.slice(i)
    const head = rest[0]
    if (head === undefined || SETUP.has(head)) continue
    out.push(rest)
  }
  return out
}

const base = (w: string): string => w.slice(w.lastIndexOf('/') + 1)

// Flags that take a value (the next word), per CLI; any other flag stands alone.
const CODEX_VALUE = new Set([
  '-m', '--model', '-c', '--config', '-C', '--cd', '-s', '--sandbox', '-a', '--ask-for-approval', '-p', '--profile',
  '-i', '--image', '--add-dir', '-o', '--output-last-message', '--output-schema', '--color', '--enable', '--disable', '--local-provider',
])
const OPENCODE_VALUE = new Set(['-m', '--model', '-s', '--session', '--agent', '-f', '--file', '--format', '--port', '--attach', '--title', '--command', '--variant'])
const CLAUDE_VALUE = new Set([
  '--model', '--output-format', '--input-format', '--permission-mode', '--max-turns', '--allowedTools', '--allowed-tools',
  '--disallowedTools', '--disallowed-tools', '--append-system-prompt', '--system-prompt', '--add-dir', '--settings', '--mcp-config',
  '--agents', '--agent', '--session-id', '-r', '--resume', '--fallback-model', '--effort', '--setting-sources', '--plugin-dir',
  '--betas', '--max-budget-usd', '--json-schema', '--tools', '-n', '--name',
])
/** codex subcommands that run no prompt. */
const CODEX_IDLE = new Set([
  'login', 'logout', 'mcp', 'mcp-server', 'app-server', 'completion', 'sandbox', 'debug', 'apply', 'a', 'cloud', 'features', 'help',
  'responses-api-proxy', 'stdio-to-uds', 'generate-ts',
])
const CODEX_PROMPT_SUBS = new Set(['exec', 'e', 'review'])

/** The words that are not flags or flag values, in order. */
function positionals(words: readonly string[], valued: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    if (w === '--') {
      out.push(...words.slice(i + 1))
      break
    }
    if (w.startsWith('-') && w !== '-') {
      if (!w.includes('=') && valued.has(w)) i++
      continue
    }
    out.push(w)
  }
  return out
}

/** The value of `-m`/`--model` (or `--model=x`), when given. */
function modelFlag(words: readonly string[], names: readonly string[]): string | undefined {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    for (const n of names) {
      if (w === n && words[i + 1] !== undefined) return words[i + 1]
      if (w.startsWith(n + '=')) return w.slice(n.length + 1)
    }
  }
  return undefined
}

const promptOf = (p: string | undefined): string | undefined => (p && p !== '-' ? fold(p) || undefined : undefined)

/** The agent one segment runs (its task, or the whole command when it names none); undefined for any other command. */
function agentOf(words: readonly string[], command: string): ShellLabel | undefined {
  const head = base(words[0] ?? '')
  const args = words.slice(1)
  if (head === 'codex') {
    if (args.some(w => w === '--version' || w === '-V' || w === '--help' || w === '-h')) return undefined
    const pos = positionals(args, CODEX_VALUE)
    const sub = pos[0]
    if (sub !== undefined && CODEX_IDLE.has(sub)) return undefined
    const configModel = args.map((w, i) => (w === '-c' || w === '--config' ? args[i + 1] : undefined)).find(v => v?.startsWith('model='))
    const model = modelFlag(args, ['-m', '--model']) ?? configModel?.slice('model='.length).replace(/^["']|["']$/g, '')
    // `codex exec resume [SESSION_ID] [PROMPT]`: with `--last` the first word after `resume` is the prompt.
    const resumed = pos[1] === 'resume' ? (args.includes('--last') ? pos[2] : pos[3]) : pos[1]
    const prompt = sub !== undefined && CODEX_PROMPT_SUBS.has(sub) ? resumed : sub === 'resume' || sub === 'fork' ? undefined : sub
    return { label: 'codex', ...(model ? { model } : {}), task: promptOf(prompt) ?? fold(command) }
  }
  if (head === 'opencode' && args[0] === 'run') {
    const model = modelFlag(args, ['-m', '--model'])
    const prompt = positionals(args.slice(1), OPENCODE_VALUE).join(' ')
    return { label: 'opencode', ...(model ? { model } : {}), task: promptOf(prompt) ?? fold(command) }
  }
  if (head === 'claude' && args.some(w => w === '-p' || w === '--print')) {
    const model = modelFlag(args, ['--model'])
    return { label: 'claude', ...(model ? { model } : {}), task: promptOf(positionals(args, CLAUDE_VALUE)[0]) ?? fold(command) }
  }
  return undefined
}

/**
 * What a background command runs: `codex exec`, `codex <prompt>` (or another
 * codex subcommand that runs a prompt), `opencode run` or `claude -p` is that
 * agent, with the model `-m`/`--model` names, wherever it sits in a pipeline
 * or list (`git diff | codex exec "review"`); anything else is a plain shell.
 */
export function labelOf(command: string): ShellLabel {
  for (const words of runSegments(wordsOf(command))) {
    const agent = agentOf(words, command)
    if (agent) return agent
  }
  return { task: fold(command) }
}

/** The output file a background Bash result names (`Output is being written to: <path>.`). */
export function outputFileOf(text: string | undefined): string | undefined {
  const m = /Output is being written to: (\S+)/.exec(text ?? '')
  return m?.[1]?.replace(/\.$/, '') || undefined
}

const tag = (body: string, name: string): string | undefined => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)
  return m?.[1]?.trim() || undefined
}

/** Every `<task-notification>` in a row's text. */
export function notesOf(text: string): TaskNote[] {
  const out: TaskNote[] = []
  for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1] ?? ''
    const id = tag(body, 'task-id')
    const status = tag(body, 'status')
    if (!id || !status) continue
    const code = /exit code (-?\d+)/.exec(tag(body, 'summary') ?? '')?.[1]
    const toolUseId = tag(body, 'tool-use-id')
    const outputFile = tag(body, 'output-file')
    out.push({
      id,
      status,
      ...(toolUseId ? { toolUseId } : {}),
      ...(outputFile ? { outputFile } : {}),
      ...(code !== undefined ? { exitCode: Number(code) } : {}),
    })
  }
  return out
}

/** The text of a row's content: its text blocks joined (or the string itself). */
export function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(b => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .join('\n')
}

/** The longest last output line kept: wider than any pane, so a one-line dump is not held whole. */
export const LINE_MAX = 240

/** The last line of output with anything on it: escapes stripped, the last `\r` rewrite kept, clipped to LINE_MAX. */
export function lastLineOf(output: string): string | undefined {
  const lines = output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const parts = (lines[i] ?? '').split('\r').map(s => s.trimEnd())
    const shown = [...parts].reverse().find(s => s.trim() !== '')
    if (shown === undefined) continue
    const line = fold(shown)
    return line.length > LINE_MAX ? line.slice(0, LINE_MAX - 1) + '…' : line
  }
  return undefined
}
