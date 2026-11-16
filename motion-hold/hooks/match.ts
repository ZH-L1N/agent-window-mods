// The matcher of the motion-hold mod: reads one Bash command and says whether
// it would move, energise or restart lab hardware. Pure: no engine call, no
// state. `classify` never throws; when a command cannot be read with
// certainty every pattern is tried on its raw text, so a doubt holds.
// Where the reader stops short of reading everything for a reason of its
// own (a text too long, too deep or too nested, a budget spent, a value too
// long to carry), it says so once for the whole call (`stopShort`), and
// `classify` then also holds the command when it names a configured host.
//
// A text is cut into words and commands the way the shells read it. Where
// that reading parts from the one this matcher gave before its second review
// round, or where two shells read a spelling differently, the text is read
// both ways and either reading can hold (`scan`, `classifyText`).
//
// Class A rules apply anywhere. Class B rules apply only where a host of the
// site config is named. The site's own `hold` and `stop` patterns come from
// the config file (see README.md for the rules in words, and PROVENANCE.md
// for where they go past the plan they were written to).
//
// Time: every check reads its text in time proportional to its length.
// Where the plan's table lets anything stand between two words
// (`tee ... /sys/class/gpio/`, `pio run ... upload`), the check is a
// function that passes over the text once, with no limit on the gap
// (`afterTeeOrDd`, `pioUpload`, `composeVerb`). The gaps left in patterns
// are the flags between `systemctl` or `docker` and a verb (one flag and at
// most one value at a time). The speed tests in match.test.ts cover each.

export type HoldKind =
  | 'site'
  | 'modbus-write'
  | 'motor-api'
  | 'gpio-set'
  | 'serial-write'
  | 'flash'
  | 'service'
  | 'power'
  | 'kill'
  | 'http-write'
  | 'unreadable'
  | 'config-error'
export type Reason = { kind: HoldKind; match: string; host: string | null }
export type Verdict =
  | { hold: false; why: 'no-match' | 'stop' | 'read-only' }
  | { hold: true; reasons: Reason[]; summary: string; host: string | null; isCertain: boolean }
export type HoldConfig = { hosts: string[]; hold: RegExp[]; stop: RegExp[]; stopCommand: string[] | null }
export type ConfigRead =
  | { status: 'none' }
  | { status: 'ok'; config: HoldConfig; warnings: string[] }
  | { status: 'broken'; error: string }

// ---------------------------------------------------------------- text

/** Control characters out (tab and newline stay), then cut to `max` characters. */
export function clean(text: string, max: number): string {
  const s = String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
  if (s.length <= max) return s
  let cut = s.slice(0, Math.max(0, max - 1))
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${cut}…`
}

/**
 * Zero-width and soft-hyphen characters out. A line continuation is not
 * joined here: whether a backslash-newline joins two lines depends on where
 * it stands (not after a comment, not in a heredoc with a quoted delimiter),
 * which only the scanner knows.
 */
const normalise = (text: string): string => text.replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '')

/** A text with its line continuations joined. */
const joinedOf = (text: string): string => (text.includes('\\\n') || text.includes('\\\r\n') ? text.replace(/\\\r?\n/g, '') : text)

/**
 * The forms a pattern is tried on: the text as written, the text with its
 * line continuations joined, and that with its quote characters and
 * backslashes removed, so `c'tl' move` reads `ctl move`.
 */
function formsOf(text: string): string[] {
  const joined = joinedOf(text)
  const bare = joined.replace(/['"\\]/g, '')
  const out = [text]
  if (joined !== text) out.push(joined)
  if (bare !== joined) out.push(bare)
  return out
}

/** The pattern's match in the first form of the text that has one. */
function hit(re: RegExp, forms: readonly string[]): string | null {
  for (const form of forms) {
    const m = re.exec(form)
    if (m) return m[0]
  }
  return null
}

/** The same for a check that is a function. */
function hitFn(fn: (text: string) => string | null, forms: readonly string[]): string | null {
  for (const form of forms) {
    const m = fn(form)
    if (m !== null) return m
  }
  return null
}

// ---------------------------------------------------------------- config

const KNOWN_KEYS = new Set(['hosts', 'hold', 'stop', 'stopCommand'])
const EMPTY: HoldConfig = { hosts: [], hold: [], stop: [], stopCommand: null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The site config from the file's text; `null` means there is no file. */
export function parseConfig(text: string | null): ConfigRead {
  if (text === null || text === undefined) return { status: 'none' }
  const broken = (error: string): ConfigRead => ({ status: 'broken', error: clean(error, 200) })
  let data: unknown
  try {
    data = JSON.parse(String(text))
  } catch (err) {
    return broken(`not valid JSON (${err instanceof Error ? err.message : 'parse error'})`)
  }
  if (!isRecord(data)) return broken('the file must hold one JSON object')
  const warnings: string[] = []
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`unknown key "${clean(key, 40)}"`)
  }

  const strings = (key: string): string[] | string => {
    const v = data[key]
    if (v === undefined) return []
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return `"${key}" must be a list of strings`
    if (v.some(x => (x as string).trim() === '')) return `"${key}" holds an empty entry`
    return v as string[]
  }
  const patterns = (key: string): RegExp[] | string => {
    const list = strings(key)
    if (typeof list === 'string') return list
    const out: RegExp[] = []
    for (const source of list) {
      let re: RegExp
      try {
        re = new RegExp(source, 'i')
      } catch (err) {
        return `${key} pattern "${source}" is not a valid regular expression (${err instanceof Error ? err.message : 'syntax error'})`
      }
      // A pattern that matches the empty text matches every command: as a stop it would waive every hold.
      if (re.test('')) return `${key} pattern "${source}" matches everything`
      out.push(re)
    }
    return out
  }

  const hosts = strings('hosts')
  if (typeof hosts === 'string') return broken(hosts)
  const hold = patterns('hold')
  if (typeof hold === 'string') return broken(hold)
  const stop = patterns('stop')
  if (typeof stop === 'string') return broken(stop)
  let stopCommand: string[] | null = null
  const sc = data.stopCommand
  if (sc !== undefined && sc !== null) {
    if (!Array.isArray(sc) || sc.length === 0 || sc.some(x => typeof x !== 'string' || x === '')) {
      return broken('"stopCommand" must be a list of words, the program first')
    }
    stopCommand = [...(sc as string[])]
  }
  return { status: 'ok', config: { hosts: hosts.map(h => h.trim()), hold, stop, stopCommand }, warnings }
}

// ---------------------------------------------------------------- hosts

const globs = new Map<string, RegExp>()

/** A host glob as a pattern: `*` any run, `?` one character, case-insensitive, the whole word. */
function globOf(glob: string): RegExp {
  let re = globs.get(glob)
  if (!re) {
    const body = [...glob].map(ch => (ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[\\^$.|+()[\]{}]/g, '\\$&'))).join('')
    re = new RegExp(`^${body}$`, 'i')
    if (globs.size > 500) globs.clear()
    globs.set(glob, re)
  }
  return re
}

/** What a word could name as a host: a URL's host name; else the word after `user@`, cut at a port or a path, then whole. */
function hostNames(word: string): string[] {
  const url = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(.*)$/.exec(word)
  if (url) {
    let h = (url[1] ?? '').split(/[/?#]/)[0] ?? ''
    h = h.slice(h.lastIndexOf('@') + 1).replace(/:\d*$/, '')
    return h && !h.startsWith('-') ? [h] : []
  }
  const at = word.indexOf('@')
  const bare = at >= 0 ? word.slice(at + 1) : word
  // A word that starts with a dash is an option, never a host (the stop command is handed the host as a word).
  if (bare === '' || bare.startsWith('-')) return []
  const head = bare.split(/[:/]/)[0] ?? ''
  return head && head !== bare ? [head, bare] : [bare]
}

/** The first word of `text` that names a configured host, as written; null when none does. */
export function hostOf(text: string, hosts: readonly string[]): string | null {
  if (!hosts || hosts.length === 0 || !text) return null
  const res = hosts.map(globOf)
  for (const word of joinedOf(String(text)).replace(/['"`\\]/g, '').split(/[\s;|&()<>=,[\]{}]+/)) {
    if (!word) continue
    for (const name of hostNames(word)) {
      if (res.some(re => re.test(name))) return clean(name, 120)
    }
  }
  return null
}

// ---------------------------------------------------------------- built-in rules

type Check = (text: string) => string | null
type Rule = { kind: HoldKind; any?: RegExp[]; both?: RegExp[][]; fns?: Check[] }

/** How much of a long match a check hands back; the reason cuts it further. */
const SHOWN_MAX = 200

/**
 * The table's `\b(tee|dd)\b[^|;&]*<path>` as one pass over the text: `tee`
 * or `dd`, then a path of the kind, with no `|`, `;` or `&` between them.
 * The gap has no limit and may span lines; the pass cannot backtrack, so a
 * long text is read in time proportional to its length.
 */
function afterTeeOrDd(path: string): Check {
  const source = `[|;&]|\\b(?:tee|dd)\\b|${path}`
  return text => {
    const re = new RegExp(source, 'g')
    let from = -1
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const t = m[0]
      if (t === '|' || t === ';' || t === '&') from = -1
      else if (t === 'tee' || t === 'dd') {
        if (from < 0) from = m.index
      } else if (from >= 0) return text.slice(from, Math.min(re.lastIndex, from + SHOWN_MAX))
    }
    return null
  }
}

/**
 * The table's `\b(pio|platformio)\s+run\b.*(-t|--target)\s+upload\b` the
 * same way: `pio run`, then the upload target on the same line, however far
 * along it. `--target=upload` counts like `--target upload`.
 */
const pioUpload: Check = text => {
  const re = /\n|\b(?:pio|platformio)\s+run\b|(?:-t|--target)[\s=]+upload\b/g
  let from = -1
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const t = m[0]
    if (t === '\n') from = -1
    else if (t.charAt(0) === 'p') {
      if (from < 0) from = m.index
    } else if (from >= 0) return text.slice(from, Math.min(re.lastIndex, from + SHOWN_MAX))
  }
  return null
}

/**
 * `docker compose` (or `docker-compose`), then one of its verbs as a word of
 * its own further along the same command, however far: one pass, like the
 * two checks above, where a pattern would need a limit on the gap.
 */
const composeVerb: Check = text => {
  // The verb is tried first: the blank before it may be a newline, which otherwise ends the command.
  const re = /\s(?:up|down|restart|stop)\b|[|;&\n]|\bdocker[\s-]+compose\b/g
  let from = -1
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const t = m[0]
    if (t === '|' || t === ';' || t === '&' || t === '\n') from = -1
    else if (t.charAt(0) === 'd') {
      if (from < 0) from = m.index
    } else if (from >= 0) return text.slice(from, Math.min(re.lastIndex, from + SHOWN_MAX))
  }
  return null
}

/** A serial device: the Linux names of the table, and macOS's `tty.` twin of every `cu.` device. */
const SERIAL = '/dev/(?:tty(?:USB|ACM|AMA|S)|(?:tty|cu)\\.)'

/**
 * Class A: held anywhere, local or remote. The patterns are the table's,
 * with three everyday spellings added: a clobber redirect (`>|`, and `>&`),
 * a compound assignment to a motor input (`+=`), and macOS's `tty.` devices.
 */
const CLASS_A: Rule[] = [
  { kind: 'modbus-write', any: [/\bwrite_(register|registers|coil|coils)\s*\(/] },
  { kind: 'motor-api', any: [/\.requested_state\s*=/, /\.input_(pos|vel|torque)\s*[-+*/]?=/] },
  {
    kind: 'gpio-set',
    any: [/\bgpioset\b/, /\bpinctrl\s+set\b/, /\braspi-gpio\s+set\b/, /\bGPIO\.output\s*\(/, />[|&]?\s*\/sys\/class\/gpio\//],
    fns: [afterTeeOrDd('/sys/class/gpio/')],
  },
  {
    kind: 'serial-write',
    any: [/>[|&]?\s*\/dev\/(tty(USB|ACM|AMA|S)\w*|(tty|cu)\.[\w.-]+)/],
    both: [[/\bserial\.Serial\s*\(/, /\.write\s*\(/]],
    fns: [afterTeeOrDd(SERIAL)],
  },
  { kind: 'flash', any: [/\b(esptool(\.py)?|openocd|dfu-util|st-flash|avrdude)\b/], fns: [pioUpload] },
]

/**
 * What makes a web request a write: the table's flags (`-X POST`, `--request`,
 * `-d`, `--data`, `--json`, `-F`, `--form`, `--post-data`) and a method word
 * after `http`/`https`. Two things differ from the table as written. A short
 * flag counts only at the start of a word, so a host named `rig-d.local` is
 * not read as `-d`. And added: the same short flags inside a cluster
 * (`-sX POST`, `-sd`), `--upload-file`, and wget's `--post-file` and
 * `--method`.
 */
const HTTP_WRITE =
  /(^|[\s'"])-[A-Za-z]*X\s*(POST|PUT|PATCH|DELETE)|(^|[\s'"])-[A-Za-z]*[dF]\b|--request|--data|--json|--form|--post-data|--post-file|--method|--upload-file|\b(http|https)\s+(-\S+\s+)*(POST|PUT|PATCH|DELETE)\b/

/** curl's upload flag. For wget `-T` is a timeout, so it counts only where the text has `curl`. */
const CURL_UPLOAD = /(^|[\s'"])-[A-Za-z]*T\b/

const KILL_WORD = /\b(kill|pkill|killall)\b/g
/**
 * Signal 0 right after the program, in the spellings that program reads as a
 * signal. `-s` and `-n` name a signal for `kill` (`-s` for `killall` too);
 * for `pkill` they pick a session and the newest process, so `pkill -s 0`
 * is a real kill.
 */
const SIGNAL_ZERO: Record<string, RegExp> = {
  kill: /\s+(?:-0|-s\s*0|-n\s*0|--signal(?:=|\s+)0)(?![\w.-])/y,
  killall: /\s+(?:-0|-s\s*0|--signal(?:=|\s+)0)(?![\w.-])/y,
  pkill: /\s+(?:-0|--signal(?:=|\s+)0)(?![\w.-])/y,
}
/** pkill's own match flags: they choose the processes and cannot change the signal. */
const PKILL_MATCH_FLAGS = /^-[fxinoael]+$/
/** A substitution with nothing but plain words in it: one word of the command, whatever options stand inside it. */
const PLAIN_SUBST = /\$\([^()'"`\\\n]*\)|`[^`'"\\\n]*`/y
const KILL_INSIDE = /\b(?:kill|pkill|killall)\b/

/**
 * Whether a word after a signal 0 could change the signal. The last signal
 * option wins (`kill -0 -s KILL`, `pkill -0 -f x --signal 9`), so any later
 * word of the same command that starts with `-` counts, up to the next `;`,
 * `&`, `|` or newline and before a lone `--`. Not counted: pkill's own match
 * flags, and what stands inside a plain substitution (`$(pgrep -f x)`).
 */
function hasLaterOption(text: string, from: number, isPkill: boolean): boolean {
  const n = text.length
  let i = from
  // Inside a quote, and behind a backslash, a `;`, `&`, `|` or newline is part of a word: the command goes on.
  // A quote counts as opened only at the start of a word or behind `=`: the text may begin inside a quoted
  // string of the command around it, whose closing quote ends a word and opens nothing.
  let quote = ''
  for (;;) {
    while (i < n && (text.charAt(i) === ' ' || text.charAt(i) === '\t' || text.charAt(i) === '\r')) i++
    const start = i
    while (i < n) {
      const c = text.charAt(i)
      if (c === ' ' || c === '\t' || c === '\r') break
      if (c === '"' || c === "'") {
        if (quote === c) quote = ''
        else if (quote === '' && (i === start || text.charAt(i - 1) === '=')) quote = c
      } else if (c === '\\' && ';|&'.includes(text.charAt(i + 1)) && i + 1 < n) {
        i += 2
        continue
      } else if (quote === '') {
        if (c === '\n' || c === ';') break
        // `>|` is a redirect, not a pipe.
        if (c === '|' && (i === 0 || text.charAt(i - 1) !== '>')) break
        if (c === '&') {
          // `>&`, `<&` and `&>` are redirects, not the end of the command.
          const before = i > 0 ? text.charAt(i - 1) : ''
          if (before !== '>' && before !== '<' && text.charAt(i + 1) !== '>') break
        }
      }
      if (c === '$' || c === '`') {
        PLAIN_SUBST.lastIndex = i
        const m = PLAIN_SUBST.exec(text)
        if (m !== null) {
          // A substitution that itself kills is not looked through.
          if (KILL_INSIDE.test(m[0])) return true
          i += m[0].length
          continue
        }
      }
      i++
    }
    // The end of the command: nothing after the signal changed it.
    if (i === start) return false
    const word = text.slice(start, i).replace(/^(?:\$?["']|\\)+/, '')
    if (/^--["']*$/.test(word)) return false
    if (word.startsWith('-') && !(isPkill && PKILL_MATCH_FLAGS.test(word))) return true
  }
}

/**
 * The table's `\b(kill|pkill|killall)\b`, less one form: signal 0 sends
 * nothing, it only asks whether the process exists (`kill -0 <pid>`,
 * `kill -s 0`, `pkill -0`). Any other signal, or none, is a kill; so is a
 * signal 0 with an option after it that could name another signal, and a
 * text that has both forms.
 */
const killSignal: Check = text => {
  const re = new RegExp(KILL_WORD.source, 'g')
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const zero = SIGNAL_ZERO[m[0]] as RegExp
    zero.lastIndex = re.lastIndex
    if (!zero.test(text)) return m[0]
    if (hasLaterOption(text, zero.lastIndex, m[0] === 'pkill')) return m[0]
  }
  return null
}

/**
 * Class B: held only where a configured host is named. The service patterns
 * are the table's, read a little wider so the usual spellings of the same
 * act are caught too: flags, each with one value at most, between the program and its verb
 * (`systemctl --user restart`, `docker -H <host> stop`), `try-restart` and
 * `reload-or-restart`, `docker container stop`, `docker-compose` with a
 * hyphen and with flags before the verb, and `service <name> restart`.
 */
const CLASS_B: Rule[] = [
  {
    kind: 'service',
    any: [
      /\bsystemctl\s+(-\S+\s+([^-\s]\S*\s+)?)*?((try-|reload-or-|try-reload-or-)?restart|stop|start|reload|kill)\b/,
      /\bdocker\s+(-\S+\s+([^-\s]\S*\s+)?)*?(container\s+)?(restart|stop|kill|rm)\b/,
      /\bservice\s+\S+\s+(restart|stop|start|reload)\b/,
    ],
    fns: [composeVerb],
  },
  { kind: 'power', any: [/\b(reboot|shutdown|poweroff|halt)\b/, /\bsystemctl\s+(-\S+\s+([^-\s]\S*\s+)?)*?(reboot|poweroff|halt)\b/] },
  { kind: 'kill', fns: [killSignal] },
  {
    kind: 'http-write',
    both: [
      [/\b(curl|wget|http|https)\b/, HTTP_WRITE],
      [/\bcurl\b/, CURL_UPLOAD],
    ],
  },
]

/** One phrase per kind, in the order the summary lists them. */
const PHRASES: [HoldKind, string][] = [
  ['site', 'run a site motion command'],
  ['modbus-write', 'write Modbus registers'],
  ['motor-api', 'command a motor'],
  ['gpio-set', 'set a GPIO line'],
  ['serial-write', 'write to a serial device'],
  ['flash', 'flash a device'],
  ['service', 'start or stop a service'],
  ['power', 'reboot or power off'],
  ['kill', 'kill a process'],
  ['http-write', 'send a write request'],
  ['unreadable', 'run input that cannot be read'],
  ['config-error', 'use hardware while the site config is broken'],
]

const MATCH_MAX = 80

function ruleReasons(rules: readonly Rule[], forms: readonly string[], host: string | null): Reason[] {
  const out: Reason[] = []
  for (const rule of rules) {
    for (const re of rule.any ?? []) {
      const m = hit(re, forms)
      if (m !== null) out.push({ kind: rule.kind, match: clean(m.trim(), MATCH_MAX), host })
    }
    for (const set of rule.both ?? []) {
      const found = set.map(re => hit(re, forms))
      if (found.every(m => m !== null)) out.push({ kind: rule.kind, match: clean((found[0] ?? '').trim(), MATCH_MAX), host })
    }
    for (const fn of rule.fns ?? []) {
      const m = hitFn(fn, forms)
      if (m !== null) out.push({ kind: rule.kind, match: clean(m.trim(), MATCH_MAX), host })
    }
  }
  return out
}

/** Appends a list one by one: a spread of a very long list into `push` overflows the stack. */
function addAll<T>(to: T[], from: readonly T[]): void {
  for (let k = 0; k < from.length; k++) to.push(from[k] as T)
}

/** The site `hold` patterns and class A on a text. */
function siteAndA(text: string, cfg: HoldConfig, host: string | null): Reason[] {
  if (!text) return []
  const forms = formsOf(text)
  const out: Reason[] = []
  for (const re of cfg.hold) {
    const m = hit(re, forms)
    if (m !== null) out.push({ kind: 'site', match: clean(m.trim(), MATCH_MAX), host })
  }
  addAll(out, ruleReasons(CLASS_A, forms, host))
  return out
}

/** Class B on a text; nothing without a host. */
function classB(text: string, host: string | null): Reason[] {
  if (!text || host === null) return []
  return ruleReasons(CLASS_B, formsOf(text), host)
}

/** Every class on a text as raw text, with no exemption: site, class A and, with a host, class B. */
const everyClass = (text: string, cfg: HoldConfig, host: string | null): Reason[] => [...siteAndA(text, cfg, host), ...classB(text, host)]

const hasStop = (text: string, cfg: HoldConfig): boolean => {
  const forms = formsOf(text)
  return cfg.stop.some(re => hit(re, forms) !== null)
}

/** The contents of a code text's string literals: triple, double, single and backtick quoted. A backslash-newline inside one joins its lines. */
function literalsOf(text: string): string {
  const code = joinedOf(text)
  const re = /"""([\s\S]*?)"""|'''([\s\S]*?)'''|"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`((?:\\.|[^`\\])*)`/g
  const out: string[] = []
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '')
    if (m[0] === '') re.lastIndex++
  }
  return out.join('\n')
}

// ---------------------------------------------------------------- scanner

type Word = {
  /** The word with one level of quoting removed. */
  v: string
  /** The word as written; empty for a word split off a variable's value (the word after it carries the text). */
  raw: string
  /** It holds a variable or a substitution whose value is not known here. */
  hasVar?: boolean
  /** Every variable in it was replaced by a value assigned earlier in the command, so `v` is what the shell sees. */
  isLit?: boolean
  /** On a word of the as-written reading (`Seg.words0`): the value its variables stand for, when all are known. */
  vx?: string
  /** A value in it is carried only to add holds (see `noteAssignments`): as the target of a remote shell it stays uncertain. */
  isWeak?: boolean
  /** On a word of the reading with values in place: one of the values put into it is a weak one. */
  tookWeak?: boolean
}
type Redirect = { isOut: boolean; target: string; target0?: string }
type Seg = {
  /** The segment as written, without its comment and its heredoc bodies; known variables replaced, line continuations joined. */
  raw: string
  /** Its words, each with one level of quoting removed. */
  words: Word[]
  bodies: string[]
  here: string | null
  redirects: Redirect[]
  /** `$(`, a backtick, `<(` or `=(` somewhere in it, a heredoc body the shell expands included. */
  hasSubst: boolean
  /** The text inside each of those substitutions, and every other text of the segment that is read as a command of its own. */
  substs: string[]
  /** The command proper starts at this word: the words before it stand before the `)` of a case pattern or a function's name (`pattern) command`, `name() { command`). */
  cut: number
  /** The text before that `)`. */
  cutText: string
  /** The cut was made where a case pattern or a function's name really stands, so the text before it is read as a text of its own. */
  isCutRead: boolean
  /** A top-level `)` closes it with nothing after: the end of a group, whose output is the whole group's. */
  isGroupEnd: boolean
  /**
   * A variable in it was replaced by a value carried forward (rule 2a). The
   * as-written reading of such a segment is kept beside the expanded one:
   * `raw0`, `words0` and `cut0` where they differ, `bodies0` and `here0`
   * always.
   */
  isExpanded: boolean
  raw0: string | null
  words0: Word[] | null
  cut0: number
  bodies0: string[]
  here0: string | null
  /** Joined to the next segment by `|`. */
  isPiped: boolean
}
type Scanned = {
  segs: Seg[]
  comments: string[]
  isUncertain: boolean
  hasExpansions: boolean
  /** This reading parted from the earlier one somewhere (see `scan`). */
  differs: boolean
  /** Something in the text is read differently by different shells, so neither reading can be trusted. */
  isOpaque: boolean
}

const blankSeg = (): Seg => ({
  raw: '',
  words: [],
  bodies: [],
  here: null,
  redirects: [],
  hasSubst: false,
  substs: [],
  cut: 0,
  cutText: '',
  isCutRead: false,
  isGroupEnd: false,
  isExpanded: false,
  raw0: null,
  words0: null,
  cut0: 0,
  bodies0: [],
  here0: null,
  isPiped: false,
})

/** The as-written reading of a segment: what it says before any carried value replaces a variable. */
function plainOf(seg: Seg): Seg {
  if (!seg.isExpanded) return seg
  return {
    ...seg,
    raw: seg.raw0 ?? seg.raw,
    words: seg.words0 ?? seg.words,
    cut: seg.words0 !== null ? seg.cut0 : seg.cut,
    bodies: seg.bodies0,
    here: seg.here0,
    redirects: seg.redirects.map(r => (r.target0 !== undefined ? { isOut: r.isOut, target: r.target0 } : r)),
  }
}

/**
 * The literal values of the `NAME=value` assignments seen so far in one scan
 * (rule 2a), the names among them that are carried only to add holds, the
 * room left for expanding them, where the current segment was expanded, and
 * whether the word being read took one of the weak values. The room is kept
 * three times over: `left` for every use, as before the third review round,
 * `words` for the words of the commands alone and `copies` for the second
 * copies of texts the shell reads again (a substitution, an `eval` string).
 * A value is put in place while it fits in `left` or in the room of its own
 * kind, so the copies cannot use up the room of the words.
 */
type Vars = {
  map: Map<string, string>
  weak: Set<string>
  left: number
  words: number
  copies: number
  reps: [number, number, string][]
  usedWeak: boolean
}

/** A value longer than this is not carried forward; an assignment of one is a limit of the reader (`stopShort`). */
const VALUE_MAX = 2000
/** One scan expands at most this many characters of values in each kind of room, so a text cannot grow without bound. */
const EXPAND_MAX = 20_000

/** Whether a value of this length still fits; takes its room. False is a limit of the reader: the value is left out. */
function hasRoom(vars: Vars, length: number, isCopy: boolean): boolean {
  const fitsAll = length <= vars.left
  const fitsOwn = length <= (isCopy ? vars.copies : vars.words)
  if (fitsAll) vars.left -= length
  if (fitsOwn && isCopy) vars.copies -= length
  else if (fitsOwn) vars.words -= length
  if (fitsAll || fitsOwn) return true
  stopShort()
  return false
}
/** How deep quoted substitutions are followed inside one word; past it the word counts as not closed. */
const NEST_MAX = 200
/**
 * The steps the readers that close a quote, a `( )` or a `${ }` may take for
 * each character of text handed to `scan`, and the steps one call may take
 * outside any scan. Reading a text takes a few steps for each character; a
 * spelling that makes those readers read the same piece again and again
 * (a single quote inside nested `${...}`) runs out of steps instead of time.
 */
const STEPS_PER_CHAR = 16
const STEPS_FLAT = 100_000

/**
 * The limits of the reader, for the `classify` call in hand (one never runs
 * inside another). `isShort`: somewhere the reader stopped short of reading
 * everything, for a reason of its own. `steps`: how many more steps the
 * closing readers may take.
 */
const reading = { isShort: false, steps: 0 }

/**
 * The reader gives up a piece of the text in hand, or leaves a carried value
 * out, because of one of its own limits. Called wherever that happens and
 * acted on in one place, at the end of `classify`: the whole raw command is
 * then decided as rule 7 decides a text that cannot be taken apart, so no
 * limit ends in a pass that a full reading might have held.
 */
function stopShort(): void {
  reading.isShort = true
}

/** One more step of a closing reader; false when the call has no steps left, which is a limit of the reader. */
function hasStep(): boolean {
  if (reading.steps > 0) {
    reading.steps--
    return true
  }
  stopShort()
  return false
}

/** The same for a search that passed over `count` characters at once (to a closing quote or backtick). */
function hasSteps(count: number): boolean {
  if (reading.steps >= count) {
    reading.steps -= count
    return true
  }
  reading.steps = 0
  stopShort()
  return false
}

const NAME_AT = /[A-Za-z_][A-Za-z0-9_]*/y
const NAME_TAIL_AT = /[A-Za-z0-9_]+/y

/**
 * What the scan in hand is doing, for the readers below (a scan never runs
 * inside another, and outside one every field is false). `isLegacy`: the
 * text is read as the scanner read it before the second review round.
 * `differs`: this reading took a path that one would not. `isOpaque`:
 * shells disagree on how a piece of the text is read.
 */
const scanning = { isLegacy: false, differs: false, isOpaque: false, isPart: false }

/**
 * How often each name stands in a text as a bare word, not as `$NAME` or
 * `${NAME}`: in all, and of those glued to a dash (`-H`), where the name is a
 * flag and cannot be an assignment. Not counted, and listed in `declared`:
 * a name that is only the operand of a declaring word, with no `=` (`local
 * NAME`, `export A B`, after the flags `-g -r -x` too). Such a word gives
 * the name no value, so it is no second assignment; what it does to the
 * name's scope is not known here.
 */
function bareNames(s: string): { all: Map<string, number>; flags: Map<string, number>; declared: Set<string> } {
  const all = new Map<string, number>()
  const flags = new Map<string, number>()
  const declared = new Set<string>()
  const re = /(\$\{?|-)?[A-Za-z_][A-Za-z0-9_]*/g
  /** Where the last word of a declaring command so far ends (the word itself, a flag, a bare name); -1 outside one. */
  let declEnd = -1
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const end = re.lastIndex
    const isNext = declEnd >= 0 && /^[ \t]+$/.test(s.slice(declEnd, m.index))
    const isWord = isWordStart(s, m.index) && isWordEnd(s, end)
    declEnd = -1
    if (m[1] === undefined) {
      if (isWord && isNext) {
        declared.add(m[0])
        declEnd = end
        continue
      }
      if (isWord && DECLARERS.has(m[0])) declEnd = end
      all.set(m[0], (all.get(m[0]) ?? 0) + 1)
    } else if (m[1] === '-') {
      if (isWord && isNext && /^-[grx]+$/.test(m[0])) declEnd = end
      const name = m[0].slice(1)
      all.set(name, (all.get(name) ?? 0) + 1)
      flags.set(name, (flags.get(name) ?? 0) + 1)
    }
  }
  return { all, flags, declared }
}

/** Whether a word of a command can start at `i`, and end before `i`. */
const isWordStart = (s: string, i: number): boolean => i === 0 || ' \t\n;&|({'.includes(s.charAt(i - 1))
const isWordEnd = (s: string, i: number): boolean => i >= s.length || ' \t\n;&|)}'.includes(s.charAt(i))

/** The value carried forward for a name, when there is one and room to expand it. */
function valueOf(vars: Vars | null, name: string, start: number, end: number): string | null {
  if (vars === null || vars.map.size === 0) return null
  const value = vars.map.get(name)
  if (value === undefined || !hasRoom(vars, value.length, false)) return null
  vars.reps.push([start, end, value])
  if (vars.weak.has(name)) vars.usedWeak = true
  return value
}

/** Past the line continuations at `i`. */
function skipJoins(s: string, i: number): number {
  while (s.charAt(i) === '\\' && s.charAt(i + 1) === '\n') i += 2
  return i
}

const skipSpaces = (s: string, i: number): number => {
  while (i < s.length && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) i++
  return i
}

/**
 * Past the blanks after a redirect sign, and past a line continuation among
 * them: the shell joins it, so the target may stand on the next line.
 */
function skipBlanks(s: string, i: number): number {
  for (;;) {
    i = skipSpaces(s, i)
    if (scanning.isLegacy || s.charAt(i) !== '\\' || s.charAt(i + 1) !== '\n') return i
    scanning.differs = true
    i += 2
  }
}

/**
 * The index of the `}` that closes a `${` whose text starts at `i`, past any
 * nested `${ }`, `$( )`, backticks and quotes; -1 when it is not closed.
 * `isQuoting`: a single quote inside the braces quotes, as it does outside
 * double quotes. `seen.quote` is set when one is met that does not.
 */
function closeBrace(s: string, i: number, isQuoting: boolean, depth: number, seen: { quote: boolean }): number {
  if (depth > NEST_MAX) {
    // Not an unclosed brace: the reader does not follow the nest this deep.
    stopShort()
    return -1
  }
  const n = s.length
  let open = 1
  while (i < n) {
    if (!hasStep()) return -1
    const c = s.charAt(i)
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === "'") {
      if (isQuoting) {
        const j = s.indexOf("'", i + 1)
        if (!hasSteps((j < 0 ? n : j) - i) || j < 0) return -1
        i = j + 1
        continue
      }
      seen.quote = true
    } else if (c === '"') {
      const d = readDouble(s, i, null, depth + 1)
      if (!d.isClosed) return -1
      i = d.end
      continue
    } else if (c === '`') {
      const k = closeTick(s, i)
      if (k < 0) return -1
      i = k + 1
      continue
    } else if (c === '$') {
      // A continuation between `$` and `(` is joined first.
      const p = skipJoins(s, i + 1)
      const d = s.charAt(p)
      if (d === '(') {
        const k = closeParen(s, p + 1, depth + 1)
        if (k < 0) return -1
        i = k + 1
        continue
      }
      if (d === '{' && p === i + 1) {
        open++
        i += 2
        continue
      }
    } else if (c === '}') {
      open--
      if (open === 0) return i
    }
    i++
  }
  return -1
}

type Ref = { end: number; text: string; value: string | null; isOpen: boolean }

/**
 * Where the last `}` of a text stands (-1: it has none). Looked for once for the text a scan is reading (`scan`
 * notes it) and once for any other text the closing readers are handed (`noteText`: a heredoc body, a text asked
 * whether it is nothing but variables), so that asking at every `${` costs nothing. Each is noted as the very
 * string the readers then get, so the two comparisons below are of a string with itself or with one of another
 * length, never of two long strings with the same text.
 */
const braces = { text: '', textLast: -1, other: '', otherLast: -1 }
function noteText(s: string): void {
  braces.other = s
  braces.otherLast = s.lastIndexOf('}')
}
function lastBraceOf(s: string): number {
  if (s === braces.other) return braces.otherLast
  if (s === braces.text) return braces.textLast
  return s.lastIndexOf('}')
}

/**
 * A variable reference at the `$` at `i`: `$NAME`, `${...}` or a special
 * parameter; null when the `$` is just a character. A `${` runs to the brace
 * that closes it, whatever stands between (`${X:-$(cmd '}')}`).
 */
function readRef(s: string, i: number, vars: Vars | null, inDouble: boolean, depth: number): Ref | null {
  const d = s.charAt(i + 1)
  if (d === '{') {
    // The earlier scanner ended a `${` at the first `}`. This one asks for that brace only where it has
    // found its own, so the search stays inside the reference: looked for from every `${` of a deep
    // nest, a first `}` that stands far behind would be searched for again and again.
    let k: number
    if (lastBraceOf(s) < i + 2) k = -1
    else if (scanning.isLegacy) k = s.indexOf('}', i + 2)
    else {
      const seen = { quote: false }
      k = closeBrace(s, i + 2, !inDouble, depth, seen)
      // Inside double quotes the shells disagree on whether a single quote in the braces quotes. Where
      // both readings close, at different braces, the text cannot be read with either. (Where the
      // quoting reading does not close at all, that shell runs nothing.)
      if (seen.quote) {
        const other = closeBrace(s, i + 2, true, depth, seen)
        if (other >= 0 && other !== k) scanning.isOpaque = true
      }
      if (k < 0 || s.indexOf('}', i + 2) !== k) scanning.differs = true
    }
    const end = k < 0 ? s.length : k + 1
    let inner = k < 0 ? '' : s.slice(i + 2, k)
    if (!scanning.isLegacy && inner.includes('\\\n')) {
      // A continuation inside the name is joined by the shell.
      inner = inner.replace(/\\\n/g, '')
      scanning.differs = true
    }
    return { end, text: s.slice(i, end), value: k < 0 ? null : valueOf(vars, inner, i, end), isOpen: k < 0 }
  }
  // A continuation between `$` and the name is joined by the shell, like one inside the name.
  let at = i + 1
  if (!scanning.isLegacy && d === '\\' && s.charAt(at + 1) === '\n') {
    const p = skipJoins(s, at)
    if (/[A-Za-z_]/.test(s.charAt(p))) {
      at = p
      scanning.differs = true
    }
  }
  NAME_AT.lastIndex = at
  const m = NAME_AT.exec(s)
  if (m) {
    let end = at + m[0].length
    let name = m[0]
    while (!scanning.isLegacy && s.charAt(end) === '\\' && s.charAt(end + 1) === '\n') {
      // A continuation inside the name is joined by the shell: the name runs on behind it.
      NAME_TAIL_AT.lastIndex = end + 2
      const more = NAME_TAIL_AT.exec(s)
      if (more === null) break
      name += more[0]
      end += 2 + more[0].length
      scanning.differs = true
    }
    return { end, text: `$${name}`, value: valueOf(vars, name, i, end), isOpen: false }
  }
  if (d !== '' && '@*#?!$-0123456789'.includes(d)) return { end: i + 2, text: s.slice(i, i + 2), value: null, isOpen: false }
  return null
}

/**
 * The index of the `)` that closes a `(` opened just before `i`; -1 when it
 * is not closed, and when quoted substitutions nest deeper than `NEST_MAX`.
 */
function closeParen(s: string, i: number, depth = 0): number {
  if (depth > NEST_MAX) {
    stopShort()
    return -1
  }
  let open = 1
  const n = s.length
  while (i < n) {
    if (!hasStep()) return -1
    const c = s.charAt(i)
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1)
      if (!hasSteps((j < 0 ? n : j) - i) || j < 0) return -1
      i = j + 1
      continue
    }
    if (c === '"') {
      const d = readDouble(s, i, null, depth + 1)
      if (!d.isClosed) return -1
      i = d.end
      continue
    }
    if (c === '(') open++
    else if (c === ')') {
      open--
      if (open === 0) return i
    }
    i++
  }
  return -1
}

/** The index of the backtick that closes one opened at `i`; -1 when it is not closed. */
function closeTick(s: string, i: number): number {
  let at = -1
  let j = i + 1
  for (; j < s.length; j++) {
    const c = s.charAt(j)
    if (c === '\\') j++
    else if (c === '`') {
      at = j
      break
    }
  }
  // The search takes steps like the loops of the other closing readers: it may be asked again from many places.
  return hasSteps(Math.min(j, s.length) - i) ? at : -1
}

type ReadDouble = {
  v: string
  end: number
  hasSubst: boolean
  isClosed: boolean
  hasVar: boolean
  isExpanded: boolean
  substs: string[] | null
}

/**
 * A double-quoted string opened at `i`: its text with the quotes and escapes
 * removed and known variables replaced; substitutions and unknown variables
 * are kept as written. A substitution is noted wherever it stands, inside
 * the braces of a `${...}` too; the texts inside those braces are taken out
 * only where `isCollecting` (a call that just looks for the closing quote
 * must not read the nested text a second time at every level).
 */
function readDouble(s: string, i: number, vars: Vars | null, depth = 0, isCollecting = false): ReadDouble {
  let v = ''
  let hasSubst = false
  let hasVar = false
  let isExpanded = false
  let substs: string[] | null = null
  const n = s.length
  let j = i + 1
  const done = (end: number, isClosed: boolean): ReadDouble => ({ v, end, hasSubst, isClosed, hasVar, isExpanded, substs })
  if (depth > NEST_MAX) {
    stopShort()
    return done(n, false)
  }
  while (j < n) {
    if (!hasStep()) return done(n, false)
    const c = s.charAt(j)
    if (c === '"') return done(j + 1, true)
    if (c === '\\') {
      const d = s.charAt(j + 1)
      if (d === '$' || d === '`' || d === '"' || d === '\\') v += d
      else if (d !== '\n') v += c + d
      j += 2
      continue
    }
    if (c === '$') {
      // A continuation between `$` and `(` is joined first by some shells: the substitution is read.
      let p = j + 1
      if (!scanning.isLegacy && s.charAt(p) === '\\' && s.charAt(p + 1) === '\n') {
        p = skipJoins(s, p)
        if (s.charAt(p) === '(') scanning.differs = true
        else p = j + 1
      }
      if (s.charAt(p) === '(') {
        hasSubst = true
        hasVar = true
        const k = closeParen(s, p + 1, depth + 1)
        ;(substs ??= []).push(s.slice(p + 1, k < 0 ? n : k))
        if (k < 0) {
          v += s.slice(j)
          return done(n, false)
        }
        v += s.slice(j, k + 1)
        j = k + 1
        continue
      }
      const ref = readRef(s, j, vars, true, depth + 1)
      if (ref !== null) {
        if (ref.value !== null) {
          isExpanded = true
          v += ref.value
        } else {
          hasVar = true
          v += ref.text
          const joined = isCollecting && ref.text.charAt(1) === '{' ? joinedOf(ref.text) : ''
          if (COMMAND_FORM.test(joined)) {
            // `${ command; }`: the braces hold a command.
            hasSubst = true
            ;(substs ??= []).push(commandFormOf(joined, ref.isOpen))
          } else if (/\$\(|`|\$\{[ \t\n|]/.test(joined)) {
            // A substitution inside the braces runs, whatever quotes stand around it there.
            hasSubst = true
            const inner = bodySubsts(joined.slice(2, ref.isOpen ? undefined : -1))
            for (const t of inner.texts) (substs ??= []).push(t)
          }
          if (/[<>]\(/.test(joined)) {
            // A process substitution inside the braces: bash runs it only outside double quotes, but
            // the text is read as one here too, so the same spelling is held in either place.
            hasSubst = true
            ;(substs ??= []).push(joined.slice(2, ref.isOpen ? undefined : -1))
          }
        }
        if (ref.isOpen) return done(n, false)
        j = ref.end
        continue
      }
    }
    if (c === '`') {
      hasSubst = true
      hasVar = true
      const k = closeTick(s, j)
      ;(substs ??= []).push(s.slice(j + 1, k < 0 ? n : k))
      if (k < 0) {
        v += s.slice(j)
        return done(n, false)
      }
      v += s.slice(j, k + 1)
      j = k + 1
      continue
    }
    v += c
    j++
  }
  return done(n, false)
}

const ANSI: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '', b: '', e: '', f: '', v: '' }

/**
 * A `$'...'` string opened at `i` (the `$`): its text with the usual escapes
 * read. A backslash-newline stays as the two characters, as bash hands it
 * on, so a shell that reads the text next joins the lines; zsh drops the
 * backslash, which is the earlier reading (`scanning.differs`).
 */
function readAnsi(s: string, i: number): { v: string; end: number; isClosed: boolean } {
  let v = ''
  const n = s.length
  let j = i + 2
  while (j < n) {
    const c = s.charAt(j)
    if (c === "'") return { v, end: j + 1, isClosed: true }
    if (c === '\\') {
      const d = s.charAt(j + 1)
      if (d === '\n' && !scanning.isLegacy) {
        scanning.differs = true
        v += '\\\n'
        j += 2
        continue
      }
      const hex = d === 'x' ? /^[0-9a-fA-F]{1,2}/.exec(s.slice(j + 2, j + 4)) : null
      if (hex) {
        v += String.fromCharCode(parseInt(hex[0], 16))
        j += 2 + hex[0].length
        continue
      }
      v += d in ANSI ? (ANSI[d] ?? '') : d
      j += 2
      continue
    }
    v += c
    j++
  }
  return { v, end: n, isClosed: false }
}

type ReadWord = {
  v: string
  end: number
  hasSubst: boolean
  isOpen: boolean
  hasVar: boolean
  isExpanded: boolean
  /** Whole words that an unquoted value split off before `v`, as the shell splits it. */
  pre: string[] | null
  substs: string[] | null
}

/** Whether a word so far ends in `name=`, `name+=` or `name[i]=`: a `(` after it opens an array. */
function endsInAssign(v: string): boolean {
  let k = v.length - 1
  if (v.charAt(k) !== '=') return false
  k--
  if (v.charAt(k) === '+') k--
  return k >= 0 && /[\w\]]/.test(v.charAt(k))
}

/** What a pair of parentheses glued into a word holds when it is nothing but a glob: `*(N)`, `x(.)`, `!(a|b)`. */
const PLAIN_GLOB = /^[\w.,|^#*?\/@!~[\]=-]*$/

/**
 * One word starting at `i`, to the next blank or operator outside quotes.
 * `isArgument`: the word stands behind a command, where a `(` that opens it
 * is zsh's glob group (`ls (a|b)*`) and belongs to the word.
 */
function readWord(s: string, i: number, vars: Vars | null, isArgument = false): ReadWord {
  let v = ''
  let hasSubst = false
  let isOpen = false
  let hasVar = false
  let isExpanded = false
  let pre: string[] | null = null
  let substs: string[] | null = null
  const start = i
  const n = s.length
  /** A substitution opened at `i` whose text starts at `from` and closes at `k` (-1: it does not close). */
  const subst = (from: number, k: number): void => {
    hasSubst = true
    hasVar = true
    ;(substs ??= []).push(s.slice(from, k < 0 ? n : k))
    if (k < 0) isOpen = true
    v += s.slice(i, k < 0 ? n : k + 1)
    i = k < 0 ? n : k + 1
  }
  while (i < n) {
    const c = s.charAt(i)
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';' || c === '|' || c === '&' || c === '<' || c === '>' || c === ')') break
    if (c === '(') {
      // name=( ... ): an array assignment is one word.
      // Behind a `)` the word so far ends in that `)`, never in `name=`: asking the word itself there, at
      // every pair of a long run of glued pairs, read the whole word again each time.
      const isArray = s.charAt(i - 1) !== ')' && endsInAssign(v)
      if (!isArray) {
        // At the start of a word a `(` opens a group, and an empty pair after a name defines a function:
        // both end the word. Any other pair glued into a word is part of it: a zsh glob qualifier
        // (`*(N)`), an extglob (`!(x)`), the group of a pattern (`^(a|b)$`).
        if (scanning.isLegacy || (i === start && !isArgument) || s.charAt(skipSpaces(s, i + 1)) === ')') break
        scanning.differs = true
      }
      const k = closeParen(s, i + 1)
      const inside = s.slice(i + 1, k < 0 ? n : k)
      // zsh can run code from a glob qualifier (`*(e:'cmd':)`, `*(+cmd)`): anything but plain glob text counts as a substitution.
      if (isArray ? /\$\(|`|<\(/.test(joinedOf(inside)) : !PLAIN_GLOB.test(inside)) {
        hasSubst = true
        ;(substs ??= []).push(inside)
      }
      if (/[$`]/.test(inside)) hasVar = true
      if (k < 0) isOpen = true
      v += s.slice(i, k < 0 ? n : k + 1)
      i = k < 0 ? n : k + 1
      continue
    }
    if (c === '=' && i === start && s.charAt(i + 1) === '(') {
      // zsh's =( ... ): the command inside runs and the word becomes a file of its output.
      subst(i + 2, closeParen(s, i + 2))
      continue
    }
    if (c === '\\') {
      // A backslash-newline joins the two lines; any other pair is the second character.
      if (s.charAt(i + 1) !== '\n') v += i + 1 < n ? s.charAt(i + 1) : c
      i += 2
      continue
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1)
      if (j < 0) {
        isOpen = true
        v += s.slice(i + 1)
        i = n
      } else {
        v += s.slice(i + 1, j)
        i = j + 1
      }
      continue
    }
    if (c === '"') {
      const d = readDouble(s, i, vars, 0, true)
      v += d.v
      if (d.hasSubst) hasSubst = true
      if (d.hasVar) hasVar = true
      if (d.isExpanded) isExpanded = true
      if (d.substs) for (const t of d.substs) (substs ??= []).push(t)
      if (!d.isClosed) isOpen = true
      i = d.end
      continue
    }
    if (c === '`') {
      subst(i + 1, closeTick(s, i))
      continue
    }
    if (c === '$') {
      const d = s.charAt(i + 1)
      if (d === '\\' && s.charAt(i + 2) === '\n' && !scanning.isLegacy) {
        // A continuation right after `$` is joined before the word is read: a `(` behind it opens a
        // substitution, anything else is a variable this does not follow.
        const p = skipJoins(s, i + 1)
        if (s.charAt(p) === '(') {
          scanning.differs = true
          subst(p + 1, closeParen(s, p + 1))
          continue
        }
        if (!/[A-Za-z_]/.test(s.charAt(p))) {
          hasVar = true
          v += c
          i = p
          continue
        }
        // A name behind the continuation: read below as the reference it is.
      }
      if (d === "'") {
        const a = readAnsi(s, i)
        v += a.v
        if (!a.isClosed) isOpen = true
        i = a.end
        continue
      }
      if (d === '(') {
        subst(i + 2, closeParen(s, i + 2))
        continue
      }
      const ref = readRef(s, i, vars, false, 0)
      if (ref !== null) {
        if (ref.isOpen) isOpen = true
        if (ref.value === null) {
          hasVar = true
          const joined = joinedOf(ref.text)
          if (COMMAND_FORM.test(joined)) {
            // `${ command; }` and `${| command; }`: the braces hold a command, which runs.
            hasSubst = true
            ;(substs ??= []).push(commandFormOf(joined, ref.isOpen))
          } else if (/\$\(|`|[<>]\(/.test(joined)) {
            // A substitution inside the braces, a process substitution too (`${A:-<(command)}`).
            hasSubst = true
            ;(substs ??= []).push(ref.text.slice(2, ref.isOpen ? undefined : -1))
          }
          v += ref.text
        } else {
          isExpanded = true
          // An unquoted value is split at its blanks, as the shell splits it; the value of an assignment is not.
          const parts = /^[A-Za-z_][A-Za-z0-9_]*=/.test(v) ? [ref.value] : ref.value.split(/[ \t\n]+/)
          for (let k = 0; k < parts.length; k++) {
            if (k > 0 && v !== '') {
              ;(pre ??= []).push(v)
              v = ''
            }
            v += parts[k] ?? ''
          }
        }
        i = ref.end
        continue
      }
    }
    v += c
    i++
  }
  return { v, end: Math.min(i, n), hasSubst, isOpen, hasVar, isExpanded, pre, substs }
}

/**
 * The command form of a `${`: `${ command; }` and `${| command; }` run the
 * command in the braces (bash 5.3, ksh, mksh). A blank, a newline or a `|`
 * right after the `{` is what tells it from a variable's name.
 */
const COMMAND_FORM = /^\$\{[ \t\n|]/
/** The command inside one, from its text `${ ... }` (`isOpen`: the closing brace is missing). */
const commandFormOf = (text: string, isOpen: boolean): string => text.slice(text.charAt(2) === '|' ? 3 : 2, isOpen ? undefined : -1)

/** Whether a line ends in a backslash that is not itself escaped. */
function endsInBackslash(line: string): boolean {
  let count = 0
  for (let i = line.length - 1; i >= 0 && line.charAt(i) === '\\'; i--) count++
  return count % 2 === 1
}

/**
 * The text inside each `$( )`, backtick pair and `${ command; }` of a
 * heredoc body the shell expands; `isOpen` when one does not close.
 */
function bodySubsts(body: string): { texts: string[]; isOpen: boolean } {
  noteText(body)
  const texts: string[] = []
  let isOpen = false
  const n = body.length
  let i = 0
  while (i < n) {
    const c = body.charAt(i)
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '$' && body.charAt(i + 1) === '{' && ' \t\n|'.includes(body.charAt(i + 2)) && i + 2 < n) {
      const k = closeBrace(body, i + 2, true, 0, { quote: false })
      texts.push(body.slice(body.charAt(i + 2) === '|' ? i + 3 : i + 2, k < 0 ? n : k))
      if (k < 0) isOpen = true
      i = k < 0 ? n : k + 1
      continue
    }
    if (c === '$' && body.charAt(i + 1) === '(') {
      const k = closeParen(body, i + 2)
      texts.push(body.slice(i + 2, k < 0 ? n : k))
      if (k < 0) isOpen = true
      i = k < 0 ? n : k + 1
      continue
    }
    if (c === '`') {
      const k = closeTick(body, i)
      texts.push(body.slice(i + 1, k < 0 ? n : k))
      if (k < 0) isOpen = true
      i = k < 0 ? n : k + 1
      continue
    }
    i++
  }
  return { texts, isOpen }
}

/**
 * A text the shell expands (a heredoc body, the inside of a substitution), with the variables known so far replaced.
 * `isCopy`: the text is a second copy of one that is also read as written (see `Vars`).
 */
function expandBody(body: string, vars: Vars, isCopy: boolean): string {
  if (vars.map.size === 0 || !body.includes('$')) return body
  return body.replace(/\\[\s\S]|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all: string, a?: string, b?: string) => {
    const name = a ?? b
    if (name === undefined) return all
    const value = vars.map.get(name)
    if (value === undefined || !hasRoom(vars, value.length, isCopy)) return all
    return value
  })
}

/**
 * Words rule 2 looks through, behind which a command, an assignment, a `case` or a group may stand.
 * None takes a flag but `time`, whose `-p` is looked through with it (see `push`).
 */
const LEADS = new Set(['{', 'do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', 'function', 'time'])
/** The same set as it was before the third review round, when `time` was not in it (see `leadWas` in `scanText`). */
const LEADS_WAS = new Set(['{', 'do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', 'function'])
/** Commands whose `(` opens a list or a pattern, not a glob group (zsh's `for x (a b) command`). */
const LIST_HEADS = new Set(['for', 'select', 'foreach', 'case', 'repeat'])
/** Builtins that assign like a bare `NAME=value`. */
const DECLARERS = new Set(['export', 'local', 'declare', 'typeset', 'readonly'])
/** A file descriptor glued to a redirect sign, and one with a line continuation between the two (bash joins it; for zsh the number is a word). */
const FD_AT = /\d+(?=[<>])/y
const FD_JOINED_AT = /\d+(?:\\\n)+(?=[<>])/y

/**
 * Splits a command at top-level `;`, `&&`, `||`, `|`, `&` and newlines into
 * segments, each with its words, redirects, heredoc bodies and here-string.
 * A `#` comment is set aside and ends at its newline, whatever stands before
 * it. A backslash-newline joins two lines between and inside words, after a
 * redirect sign, in double quotes, and in a heredoc body whose delimiter is
 * unquoted; nowhere else. Where `canExpand`, literal `NAME=value`
 * assignments are carried forward and replace `$NAME` and `${NAME}` in what
 * follows (rule 2a). An unclosed quote, substitution or heredoc marks the
 * scan uncertain.
 *
 * `isLegacy` asks for the reading the scanner gave before the second review
 * round: every top-level `)` with words after it is a cut, a `(` always ends
 * a word, a `${` ends at the first `}`, a continuation after a redirect sign
 * loses the target. `classifyText` reads a text that way too wherever this
 * reading parts from it (`differs`), so no hold of the earlier reading is
 * lost to the newer one.
 */
function scan(s: string, canExpand: boolean, isLegacy: boolean, isPart = false): Scanned {
  scanning.isLegacy = isLegacy
  scanning.isPart = isPart
  scanning.differs = false
  scanning.isOpaque = false
  reading.steps += STEPS_PER_CHAR * s.length
  braces.text = s
  braces.textLast = s.lastIndexOf('}')
  try {
    return scanText(s, canExpand, isLegacy)
  } finally {
    scanning.isLegacy = false
    scanning.isPart = false
  }
}

function scanText(s: string, canExpand: boolean, isLegacy: boolean): Scanned {
  const segs: Seg[] = []
  const comments: string[] = []
  let isUncertain = false
  let hasExpansions = false
  const n = s.length
  let i = 0
  let segStart = 0
  let textEnd = -1
  let cur = blankSeg()
  let pending: { seg: Seg; delim: string; isTabbed: boolean; isQuoted: boolean }[] = []
  const vars: Vars = { map: new Map(), weak: new Set(), left: EXPAND_MAX, words: EXPAND_MAX, copies: EXPAND_MAX, reps: [], usedWeak: false }
  let counts: { all: Map<string, number>; flags: Map<string, number>; declared: Set<string> } | null = null
  /**
   * The last top-level `)` of the segment, while no word has followed it: how many words stood before
   * it (in each reading), where it is and where the text after it starts. `isCut`: it closed a case
   * pattern or a function's name, so words after it are the command; else it closed a group. The `}`
   * and the `]]` that end a command in zsh are kept here like a group's `)`.
   */
  let paren: { count: number; count0: number; at: number; next: number; isCut: boolean } | null = null
  let cutEnd = -1
  /** The case clauses open here, innermost last: 0 after `case` (before its `in`), 1 where a pattern is due, 2 inside an arm's commands. */
  const cases: number[] = []
  /** The segment so far, after its cut, holds only words of `LEADS` (and a function's name); `leadBefore`: the same before its last word. */
  let lead = true
  let leadBefore = true
  let lastRaw = ''
  /** The first word of the segment that is not one of `LEADS`: its command. */
  let firstRaw = ''
  /**
   * `lead` and `firstRaw` as they stood before the third review round, which made a `(` behind `time`, behind a
   * function's `()` and behind a case pattern open a group. Before it such a `(` was a glob word, and one that
   * was never closed left the parse uncertain; these two say where that was so, and it stays so.
   */
  let leadWas = true
  let firstWas = ''
  /** A `[[` of the segment is open. */
  let isInTest = false

  /** The text from `from` to `to` with the values that replaced variables in place. */
  const written = (from: number, to: number): string => {
    if (vars.reps.length === 0) return s.slice(from, to)
    let out = ''
    let at = from
    for (const [a, b, value] of vars.reps) {
      if (a < at || b > to) continue
      out += s.slice(at, a) + value
      at = b
    }
    return out + s.slice(at, to)
  }
  /** The executable of a segment, as rule 2 finds it. */
  const exeOf = (seg: Seg): Command => commandOf(seg.cut > 0 ? seg.words.slice(seg.cut) : seg.words)
  /**
   * Rule 2a: a segment that is only assignments sets or forgets each name. It may stand behind the
   * words rule 2 looks through (`{`, `then`, `do`, `else`, a case pattern, a function's brace) and
   * behind `export`, `local`, `declare`, `typeset` or `readonly` with their flags.
   */
  const noteAssignments = (): void => {
    if (!canExpand) return
    const words = cur.words
    let k = cur.cut
    for (;;) {
      const raw = words[k]?.raw
      if (raw === undefined) return
      if (raw === 'function') k += 2
      else if (LEADS.has(raw)) k++
      else break
    }
    // Only a plain or exported assignment that stands first in its segment may make the target of a
    // remote shell certain (the one place where a carried value takes a hold away). Every other one
    // is carried to add holds and nothing else: its scope is not known here.
    let isWeak = k > 0
    let isAsWritten = true
    const head = words[k]
    if (head !== undefined && DECLARERS.has(head.raw)) {
      if (head.raw !== 'export') isWeak = true
      k++
      for (; k < words.length && /^[-+]/.test((words[k] as Word).raw); k++) {
        // Any flag makes the value a weak one, `--` included.
        isWeak = true
        if ((words[k] as Word).raw === '--') {
          k++
          break
        }
        // Under -n, -i, -u, -l, -a or -A the value the shell keeps is not the written one.
        if (!/^[-+][grx]+$/.test((words[k] as Word).raw)) isAsWritten = false
      }
    }
    if (k >= words.length) return
    // A continuation inside the name is joined by the shell (`BA\<newline>SE=...`).
    const rawOf = (w: Word): string => {
      if (isLegacy || !w.raw.includes('\\\n')) return w.raw
      scanning.differs = true
      return w.raw.replace(/\\\n/g, '')
    }
    for (let j = k; j < words.length; j++) {
      if (!ASSIGNMENT.test(rawOf(words[j] as Word))) return
    }
    for (let j = k; j < words.length; j++) {
      const w = words[j] as Word
      const name = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(rawOf(w))?.[1]
      if (name === undefined) continue
      const value = w.v.slice(name.length + 1)
      counts ??= bareNames(isLegacy ? s : joinedOf(s))
      // A literal value is carried. It is a certain one only when the name is assigned nowhere else that
      // this can see: a loop variable, `read`, `+=`, a second assignment all show as one more bare use of
      // the name, and so does a word that merely equals it (`echo URL`, a path with the name in it). With
      // such a use the value written here may not be the one in use, so it is carried as a weak one, which
      // only adds holds. Weak as well: a name used glued to a dash (`-H`, a flag), a name some declaring
      // word names without a value (`local NAME`), and a value that was itself put together from a weak one.
      const all = counts.all.get(name) ?? 0
      const flags = counts.flags.get(name) ?? 0
      const isCarriable = isAsWritten && w.hasVar !== true && !/[$`\n]/.test(value)
      // A value that would be carried but for its length is left out: a limit of the reader, not a variable it cannot know.
      if (isCarriable && value.length > VALUE_MAX) stopShort()
      if (!isCarriable || value.length > VALUE_MAX) {
        vars.map.delete(name)
        vars.weak.delete(name)
      } else {
        vars.map.set(name, value)
        if (isWeak || flags > 0 || all - flags !== 1 || counts.declared.has(name) || w.tookWeak === true) vars.weak.add(name)
        else vars.weak.delete(name)
      }
    }
  }
  /**
   * Rule 2a in text the same command hands to a shell again: the string of `eval` and of `trap`, and
   * the `-c` string or here-string of a local shell, which inherits the values. Where a carried value
   * stands in such a text unexpanded (single quotes), the text with the values in place is read as a
   * command of its own, beside the text as written.
   */
  const noteReread = (): void => {
    if (!canExpand || vars.map.size === 0) return
    if (!cur.words.some(w => w.v.includes('$')) && (cur.here === null || !cur.here.includes('$'))) return
    const { exe, rest } = exeOf(cur)
    const texts: string[] = []
    if (exe === 'eval') texts.push(rest.map(w => w.v).join(' '))
    else if (exe === 'trap') texts.push(rest.find(w => w.v === '-' || !w.v.startsWith('-'))?.v ?? '')
    else if (exe !== null && SHELL.test(exe)) {
      const flags = shellFlags(rest)
      if (flags.hasC) for (const text of commandStrings(rest, flags.at)) texts.push(text)
      if (cur.here !== null) texts.push(cur.here)
    }
    for (const text of texts) {
      const x = expandBody(text, vars, true)
      if (x !== text) cur.substs.push(x)
    }
  }
  const endSeg = (end: number, isPiped: boolean, next: number): void => {
    const stop = textEnd >= 0 ? textEnd : end
    cur.raw = written(segStart, stop).replace(/\\\n/g, '').trim()
    if (vars.reps.length > 0) {
      cur.isExpanded = true
      cur.raw0 = s.slice(segStart, stop).replace(/\\\n/g, '').trim()
    }
    if (cur.isExpanded) hasExpansions = true
    cur.isPiped = isPiped
    if (cur.cut > 0) cur.cutText = s.slice(segStart, cutEnd).replace(/\\\n/g, '')
    if (paren !== null) cur.isGroupEnd = true
    if (cur.raw || cur.words.length > 0 || cur.redirects.length > 0 || cur.here !== null) {
      noteReread()
      noteAssignments()
      segs.push(cur)
    } else if (isPiped && segs.length > 0) {
      // `a | | b` is not a command: keep what was read and let the raw text decide.
      isUncertain = true
    }
    cur = blankSeg()
    textEnd = -1
    segStart = next
    paren = null
    cutEnd = -1
    vars.reps.length = 0
    lead = true
    leadBefore = true
    lastRaw = ''
    firstRaw = ''
    leadWas = true
    firstWas = ''
    isInTest = false
  }
  /**
   * A substitution's inner text, kept as a command of its own. The same shell expands it, so beside
   * the text as written the text with the values carried so far in place is kept too (rule 2a).
   */
  const keep = (t: string): void => {
    cur.substs.push(t)
    if (!canExpand || vars.map.size === 0) return
    const joined = joinedOf(t)
    const x = expandBody(joined, vars, true)
    if (x !== joined) cur.substs.push(x)
  }
  const take = (w: ReadWord): void => {
    if (w.hasSubst) cur.hasSubst = true
    if (w.isOpen) isUncertain = true
    if (w.substs) for (const t of w.substs) keep(t)
  }
  /**
   * A word is about to be read. After the `)` of a group it starts a command of its own, as if a `;`
   * stood there: `(a) then b`, `do (a) done`, zsh's `if (a) b`. The group's last command is then
   * judged as the command it is, in its own place in its pipeline.
   */
  const beforeWord = (): void => {
    if (paren === null || paren.isCut) return
    scanning.differs = true
    endSeg(paren.at, false, paren.next)
  }
  /** Adds a word to the segment: `w` to its reading with values in place (none when the value was empty), `w0` to its as-written reading. */
  const push = (w: Word | null, w0: Word | null): void => {
    if (paren !== null) {
      // Words follow the `)` of a case pattern or a function's name: the command starts here.
      cur.cut = paren.count
      cur.cut0 = paren.count0
      cur.isCutRead = !isLegacy
      cutEnd = paren.at
      paren = null
      lead = true
      lastRaw = ''
      firstRaw = ''
      leadWas = true
      firstWas = ''
    }
    // The as-written reading shares the words until the first one that differs.
    if (w0 !== w && cur.words0 === null) cur.words0 = cur.words.slice()
    if (w !== null) cur.words.push(w)
    if (w0 !== null && cur.words0 !== null) cur.words0.push(w0)
    const raw = (w0 ?? w)?.raw ?? ''
    leadBefore = lead
    if (!LEADS_WAS.has(raw) && lastRaw !== 'function') {
      if (leadWas) firstWas = raw
      leadWas = false
    }
    // The name after `function` and the `-p` of `time` belong to those words.
    if (!LEADS.has(raw) && lastRaw !== 'function' && !(raw === '-p' && lastRaw === 'time')) {
      if (lead) firstRaw = raw
      lead = false
    }
    lastRaw = raw
  }
  /** Follows `case ... in`, its arms and `esac`, so a `)` that ends a pattern can be told from one that ends a group. */
  const noteKeyword = (raw: string): void => {
    const top = cases.length - 1
    if (raw === 'case') {
      if (leadBefore) cases.push(0)
    } else if (raw === 'in') {
      if (top >= 0 && cases[top] === 0) cases[top] = 1
    } else if (raw === 'esac' && top >= 0 && (leadBefore || cases[top] === 1)) {
      // Where a pattern is due, `esac` ends the clause wherever it stands (`case x in esac`).
      cases.pop()
    }
  }
  /** Whether the words of the segment are a function's name and nothing else (`f`, `function f`, `then f`), so an empty `()` after them defines it. */
  const isFunctionHead = (): boolean => {
    const last = cur.words[cur.words.length - 1]
    return cur.words.length > cur.cut && leadBefore && last !== undefined && !LEADS.has(last.raw) && /^[^\s'"`$=]+$/.test(last.raw)
  }
  /** The word at `at` as written, where a value replaced a variable in it. */
  const plain = (w: ReadWord, at: number): string | undefined => (w.isExpanded ? readWord(s, at, null).v : undefined)

  while (i < n) {
    const c = s.charAt(i)
    if (c === '\n') {
      let pos = i + 1
      if (pending.length > 0) {
        for (const p of pending) {
          const lines: string[] = []
          let isClosed = false
          while (pos < n) {
            let nl = s.indexOf('\n', pos)
            let line = s.slice(pos, nl < 0 ? n : nl)
            pos = nl < 0 ? n : nl + 1
            if (!p.isQuoted && pos < n && endsInBackslash(line)) {
              // In a body the shell expands, a backslash at the end of a line joins the next line to it.
              const parts: string[] = []
              while (pos < n && endsInBackslash(line)) {
                parts.push(line.slice(0, -1))
                nl = s.indexOf('\n', pos)
                line = s.slice(pos, nl < 0 ? n : nl)
                pos = nl < 0 ? n : nl + 1
              }
              parts.push(line)
              line = parts.join('')
            }
            line = line.replace(/\r$/, '')
            if ((p.isTabbed ? line.replace(/^\t+/, '') : line) === p.delim) {
              isClosed = true
              break
            }
            lines.push(line)
          }
          if (!isClosed) isUncertain = true
          let body = lines.join('\n')
          if (!p.isQuoted) {
            // The shell expands this body: its variables are replaced and its substitutions run.
            const asWritten = body
            body = expandBody(body, vars, false)
            p.seg.bodies0.push(asWritten)
            const inner = bodySubsts(body)
            if (inner.texts.length > 0) p.seg.hasSubst = true
            for (const t of inner.texts) p.seg.substs.push(t)
            if (inner.isOpen) isUncertain = true
            if (body !== asWritten) {
              p.seg.isExpanded = true
              hasExpansions = true
              // The as-written reading keeps its own substitutions: either reading can hold.
              for (const t of bodySubsts(asWritten).texts) p.seg.substs.push(t)
            }
          } else {
            p.seg.bodies0.push(body)
            // A local shell fed this body expands it, with the values it inherits (rule 2a).
            if (canExpand && vars.map.size > 0 && body.includes('$')) {
              const exe = exeOf(p.seg).exe
              const x = exe !== null && SHELL.test(exe) ? expandBody(body, vars, true) : body
              if (x !== body) p.seg.substs.push(x)
            }
          }
          p.seg.bodies.push(body)
        }
        pending = []
      }
      endSeg(i, false, pos)
      i = pos
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '\\' && s.charAt(i + 1) === '\n') {
      // A line continuation between words.
      i += 2
      continue
    }
    if (c === '#') {
      const nl = s.indexOf('\n', i)
      const end = nl < 0 ? n : nl
      comments.push(s.slice(i + 1, end))
      if (textEnd < 0) textEnd = i
      i = end
      continue
    }
    if (c === ';') {
      // `;;`, `;&` and `;;&` end a case arm: a pattern is due again.
      const top = cases.length - 1
      if (top >= 0 && cases[top] === 2 && (s.charAt(i + 1) === ';' || s.charAt(i + 1) === '&')) cases[top] = 1
      endSeg(i, false, i + 1)
      i++
      continue
    }
    if (c === '&') {
      const d = s.charAt(i + 1)
      if (d === '&') {
        endSeg(i, false, i + 2)
        i += 2
      } else if (d === '>') {
        let j = i + 2
        if (s.charAt(j) === '>') j++
        const at = skipBlanks(s, j)
        const w = readWord(s, at, vars)
        take(w)
        const target0 = plain(w, at)
        cur.redirects.push({ isOut: true, target: w.v, ...(target0 !== undefined ? { target0 } : {}) })
        i = Math.max(w.end, j)
      } else {
        endSeg(i, false, i + 1)
        i++
      }
      continue
    }
    if (c === '|') {
      const d = s.charAt(i + 1)
      if (d === '|') {
        endSeg(i, false, i + 2)
        i += 2
      } else {
        const next = i + (d === '&' ? 2 : 1)
        endSeg(i, true, next)
        i = next
      }
      continue
    }
    let isArgument = false
    if (c === '(') {
      if (!isLegacy) {
        // An empty pair after a name defines a function: the words after it are its body.
        const close = skipSpaces(s, i + 1)
        if (s.charAt(close) === ')' && isFunctionHead()) {
          paren = { count: cur.words.length, count0: (cur.words0 ?? cur.words).length, at: close, next: close + 1, isCut: true }
          // The body follows: a `(` right behind opens it as a group (`f() ( command )`).
          lead = true
          firstRaw = ''
          i = close + 1
          continue
        }
        // Behind a command a `(` cannot open a group: it is zsh's glob group, one word with what is
        // glued to it (`ls (a|b)*`). Not where a case pattern is due, nor after `for x`.
        const isPatternDue = cases.length > 0 && cases[cases.length - 1] === 1
        isArgument = !lead && !LIST_HEADS.has(firstRaw) && !isPatternDue && s.charAt(close) !== ')'
        // A group opens here where a glob word stood before the third review round (see `leadWas`): one that
        // is never closed leaves the parse uncertain, as it did then. Not in the piece of a segment before a
        // cut, which ends where it was cut.
        const wasArgument = !leadWas && !LIST_HEADS.has(firstWas) && !isPatternDue && s.charAt(close) !== ')'
        if (!isArgument && wasArgument && !scanning.isPart && closeParen(s, i + 1) < 0) isUncertain = true
      }
      if (!isArgument) {
        // Grouping: the commands inside are segments like any other.
        i++
        continue
      }
    }
    if (c === ')') {
      // A `)` is remembered. Where a case pattern is due it ends the pattern, and the words after it
      // are the arm's command; anywhere else it ends a group (see `beforeWord`).
      const top = cases.length - 1
      const isPattern = top >= 0 && cases[top] === 1
      if (isPattern) {
        cases[top] = 2
        // The arm's commands follow: a `(` right behind the pattern opens a group (`b) ( command ) ;;`).
        lead = true
        firstRaw = ''
      }
      paren = { count: cur.words.length, count0: (cur.words0 ?? cur.words).length, at: i, next: i + 1, isCut: isLegacy || isPattern }
      i++
      continue
    }
    if (c === '<' || c === '>') {
      // A continuation inside a redirect sign is joined first by bash (`>\<newline>|`, `<\<newline><`,
      // `<\<newline>(`): the sign is read through it. `at2` is where its second character stands.
      let at2 = i + 1
      if (!isLegacy && s.charAt(at2) === '\\' && s.charAt(at2 + 1) === '\n') {
        const p = skipJoins(s, at2)
        if ('(<>|&'.includes(s.charAt(p)) && p < n) {
          at2 = p
          scanning.differs = true
        }
      }
      const d = s.charAt(at2)
      const open = d === '(' ? at2 : -1
      if (open >= 0) {
        // <( ... ) and >( ... ): a command runs inside.
        beforeWord()
        cur.hasSubst = true
        const k = closeParen(s, open + 1)
        const end = k < 0 ? n : k + 1
        if (k < 0) isUncertain = true
        keep(s.slice(open + 1, k < 0 ? n : k))
        const word: Word = { v: s.slice(i, end), raw: s.slice(i, end), hasVar: true }
        push(word, word)
        i = end
        continue
      }
      if (c === '<' && d === '<') {
        // The third character of `<<<` and `<<-`, behind a continuation too.
        let at3 = at2 + 1
        if (!isLegacy && s.charAt(at3) === '\\' && s.charAt(at3 + 1) === '\n') {
          const p = skipJoins(s, at3)
          if (s.charAt(p) === '<' || s.charAt(p) === '-') {
            at3 = p
            scanning.differs = true
          }
        }
        if (s.charAt(at3) === '<') {
          const at = skipBlanks(s, at3 + 1)
          const w = readWord(s, at, vars)
          take(w)
          const v0 = plain(w, at) ?? w.v
          cur.here = cur.here === null ? w.v : `${cur.here}\n${w.v}`
          cur.here0 = cur.here0 === null ? v0 : `${cur.here0}\n${v0}`
          i = Math.max(w.end, at3 + 1)
          continue
        }
        const isTabbed = s.charAt(at3) === '-'
        const from = skipBlanks(s, isTabbed ? at3 + 1 : at2 + 1)
        const w = readWord(s, from, null)
        take(w)
        if (w.v === '') isUncertain = true
        // A quote or a backslash anywhere in the delimiter: the shell takes the body as it stands.
        else pending.push({ seg: cur, delim: w.v, isTabbed, isQuoted: /['"\\]/.test(s.slice(from, w.end)) })
        i = Math.max(w.end, from)
        continue
      }
      let j = i + 1
      let isFd = false
      if (c === '>' && (d === '>' || d === '|')) j = at2 + 1
      else if (d === '&') {
        isFd = true
        j = at2 + 1
      } else if (c === '<' && d === '>') j = at2 + 1
      const at = skipBlanks(s, j)
      const mark = isFd ? '&' : ''
      const isOut = c === '>' || d === '>'
      const t = s.charAt(at)
      const inner = isLegacy || (t !== '<' && t !== '>') ? -1 : skipJoins(s, at + 1)
      if (inner >= 0 && s.charAt(inner) === '(') {
        // A process substitution as the target (`< <(cmd)`): what the command inside writes is what
        // this stage reads. It is the redirect's target, not a word of the command.
        const k = closeParen(s, inner + 1)
        const end = k < 0 ? n : k + 1
        if (k < 0) isUncertain = true
        scanning.differs = true
        cur.hasSubst = true
        keep(s.slice(inner + 1, k < 0 ? n : k))
        cur.redirects.push({ isOut, target: mark + t + s.slice(inner, end) })
        i = end
        continue
      }
      const w = readWord(s, at, vars)
      take(w)
      const target0 = plain(w, at)
      cur.redirects.push({ isOut, target: mark + w.v, ...(target0 !== undefined ? { target0: mark + target0 } : {}) })
      i = Math.max(w.end, j)
      continue
    }
    // A number glued to a redirect is its file descriptor, not a word.
    FD_AT.lastIndex = i
    let fd = FD_AT.exec(s)
    if (fd === null && !isLegacy) {
      FD_JOINED_AT.lastIndex = i
      fd = FD_JOINED_AT.exec(s)
      if (fd !== null) scanning.differs = true
    }
    if (fd !== null) {
      i += fd[0].length
      continue
    }
    beforeWord()
    vars.usedWeak = false
    const w = readWord(s, i, vars, isArgument)
    if (w.end <= i) {
      i++
      continue
    }
    take(w)
    const raw = s.slice(i, w.end)
    if (!isLegacy && raw === '}' && !lead) {
      // A `}` behind a command closes the group in zsh with no `;` before it (`{ command }`): it ends
      // the command like a group's `)`. For bash it is a word, which is the earlier reading.
      scanning.differs = true
      paren = { count: cur.words.length, count0: (cur.words0 ?? cur.words).length, at: i, next: w.end, isCut: false }
      i = w.end
      continue
    }
    if (!w.isExpanded) {
      const word: Word = { v: w.v, raw, ...(w.hasVar ? { hasVar: true } : {}) }
      push(word, word)
    } else {
      // A value replaced a variable: the word as the shell sees it (several words where an unquoted value
      // held blanks, none where it was empty), and beside it the one word as written.
      const isLit = !w.hasVar
      const isGone = w.v === '' && !/['"]/.test(raw)
      // A weak value is marked on the as-written word alone: that reading is where the variable is the target.
      const weak = vars.usedWeak ? { isWeak: true } : {}
      const word0: Word = { v: readWord(s, i, null, isArgument).v, raw, hasVar: true, ...(isLit && !isGone ? { vx: w.v } : {}), ...weak }
      if (w.pre) for (const part of w.pre) push({ v: part, raw: '', isLit: true }, null)
      push(isGone ? null : { v: w.v, raw, ...(w.hasVar ? { hasVar: true } : {}), ...(isLit ? { isLit: true } : {}), ...(vars.usedWeak ? { tookWeak: true } : {}) }, word0)
    }
    if (!isLegacy) {
      noteKeyword(raw)
      // `[[ ... ]]` is a command of its own: zsh takes a word after it for the next one (`if [[ -n $x ]] then ...`).
      if (raw === '[[') isInTest = true
      else if (raw === ']]' && isInTest) {
        isInTest = false
        paren = { count: cur.words.length, count0: (cur.words0 ?? cur.words).length, at: w.end, next: w.end, isCut: false }
      }
    }
    i = w.end
  }
  endSeg(n, false, n)
  if (pending.length > 0) isUncertain = true
  return { segs, comments, isUncertain, hasExpansions, differs: scanning.differs, isOpaque: scanning.isOpaque }
}

// ---------------------------------------------------------------- segments

/** Words that run the command after them; the flags listed take the next word as their value. */
const PREFIXES: Record<string, readonly string[]> = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'],
  nohup: [],
  // Added to the plan's lists: the value flags of `time`, `exec` and `env`, so a flag's value is not taken as the executable.
  time: ['-o', '-f', '--output', '--format'],
  exec: ['-a'],
  command: [],
  env: ['-u', '-C', '--unset', '--chdir'],
  nice: ['-n'],
  timeout: ['-s', '--signal', '-k', '--kill-after'],
  stdbuf: ['-i', '-o', '-e'],
  caffeinate: ['-t', '-w'],
  do: [],
  then: [],
  else: [],
  '!': [],
  '{': [],
  '(': [],
  // Added to the plan's list: the test of a condition is a command like any other.
  if: [],
  elif: [],
  while: [],
  until: [],
  // Added: `function name { command`; the word after it is the name.
  function: [],
}

const SSH_VALUE = ['-o', '-i', '-p', '-l', '-F', '-J', '-E', '-L', '-R', '-D', '-b', '-c', '-m', '-S', '-W', '-w', '-B', '-e', '-I', '-O', '-Q', '-P']

/** Whether a flag word takes the next word as its value: the flag itself, or a cluster of short flags that ends in one (`-tp 22`). */
function takesValue(flag: string, list: readonly string[]): boolean {
  if (list.includes(flag)) return true
  if (!/^-[A-Za-z0-9]{2,}$/.test(flag)) return false
  const letters = flag.slice(1)
  for (let k = 0; k < letters.length - 1; k++) {
    // A value flag earlier in the cluster has its value glued on (`-p2222`).
    if (list.includes(`-${letters.charAt(k)}`)) return false
  }
  return list.includes(`-${letters.charAt(letters.length - 1)}`)
}

const baseOf = (word: string): string => word.slice(word.lastIndexOf('/') + 1)
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/
const isAssignment = (w: Word): boolean => ASSIGNMENT.test(w.raw)

type Command = {
  exe: string | null
  /** The word the executable was read from. */
  word: Word | null
  rest: Word[]
  /** The names assigned in front of the executable (`NAME=value command`). */
  assigned: string[]
}

/** The executable of a segment after its assignments and prefixes, and the words after it. */
function commandOf(words: readonly Word[]): Command {
  const assigned: string[] = []
  let i = 0
  for (;;) {
    const w = words[i]
    if (!w) return { exe: null, word: null, rest: [], assigned }
    if (isAssignment(w)) {
      assigned.push(/^[A-Za-z_][A-Za-z0-9_]*/.exec(w.raw)?.[0] ?? '')
      i++
      continue
    }
    const name = baseOf(w.v)
    const values = Object.prototype.hasOwnProperty.call(PREFIXES, name) ? PREFIXES[name] : undefined
    if (values === undefined) return { exe: name, word: w, rest: words.slice(i + 1), assigned }
    i++
    for (;;) {
      const f = words[i]
      if (!f || !f.v.startsWith('-') || f.v === '-') break
      i++
      if (f.v === '--') break
      if (takesValue(f.v, values)) i++
    }
    if (name === 'timeout') i++ // its duration
    if (name === 'function') i++ // the function's name
  }
}

const READ_ONLY = new Set(
  (
    'cd pwd ls cat head tail less more wc grep egrep fgrep rg ag cut sort uniq tr echo printf file stat diff cmp whoami uname which type test [ true false sleep ps pgrep ' +
    'journalctl dmesg df du free uptime lsusb lsblk ping gpioinfo gpioget'
  ).split(' '),
)
const GIT_READ_ONLY = new Set('log show diff status grep blame rev-parse ls-files'.split(' '))

/**
 * Variables that change nothing a read-only command runs or writes. Any
 * other assignment in front of one (`GIT_PAGER=...`, `LESSOPEN=...`,
 * `PATH=...`) ends its exemption: the value may name a program.
 */
const HARMLESS_ENV = /^(LC_[A-Z_]+|LANG|LANGUAGE|TZ|TERM|COLUMNS|LINES|NO_COLOR|CLICOLOR|CLICOLOR_FORCE|FORCE_COLOR)$/

/** The file an option writes to: glued on after `=`, else the next word. */
const valueAfter = (rest: readonly Word[], i: number): string => {
  const v = rest[i]?.v ?? ''
  const eq = v.indexOf('=')
  return eq >= 0 ? v.slice(eq + 1) : (rest[i + 1]?.v ?? '')
}

/**
 * How a command of the read-only set is used (rule 5): null when it is not
 * in the set; else whether its own arguments make it run a program
 * (`git -c core.pager=...`) and the files they make it write (`sort -o`,
 * `uniq in out`, `--output`). Only a use that does neither is exempt; a
 * file is tried like a redirect.
 */
function readOnlyUse(exe: string, rest: readonly Word[]): { writes: string[]; runs: boolean } | null {
  const writes: string[] = []
  let runs = false
  if (exe === 'git') {
    let i = 0
    for (; i < rest.length; i++) {
      const v = rest[i]?.v ?? ''
      if (v === '-C') {
        i++
        continue
      }
      // A config value or a program folder given on the command line: git may run what it names
      // (`-c core.pager=...`, `-c diff.external=...`, `-c core.fsmonitor=...`).
      if (v === '-c') {
        runs = true
        i++
        continue
      }
      if (v.startsWith('--config-env') || v.startsWith('--exec-path')) runs = true
      if (!v.startsWith('-')) break
    }
    if (!GIT_READ_ONLY.has(rest[i]?.v ?? '')) return null
    for (let k = i + 1; k < rest.length; k++) {
      const v = rest[k]?.v ?? ''
      if (v === '--ext-diff' || v === '--textconv' || v.startsWith('-O') || v.startsWith('--open-files-in-pager')) runs = true
      if (v.startsWith('--output')) writes.push(valueAfter(rest, k))
    }
    return { writes, runs }
  }
  if (!READ_ONLY.has(exe)) return null
  // Added to the plan's rule: these two flags make a search or a sort run another program.
  if (exe === 'rg' && rest.some(w => w.v.startsWith('--pre'))) return null
  if (exe === 'sort') {
    for (let k = 0; k < rest.length; k++) {
      const v = rest[k]?.v ?? ''
      if (v.startsWith('--compress-program')) return null
      if (v.startsWith('--output')) writes.push(valueAfter(rest, k))
      else {
        // `-o file`, `-ofile`, and a cluster that holds the flag (`-uo file`).
        const m = /^-[A-Za-z]*?o(.*)$/.exec(v)
        if (m && !v.startsWith('--')) writes.push(m[1] !== '' ? (m[1] ?? '') : (rest[k + 1]?.v ?? ''))
      }
    }
  }
  if (exe === 'uniq') {
    // The second file operand is written.
    let files = 0
    for (let k = 0; k < rest.length; k++) {
      const v = rest[k]?.v ?? ''
      if (v === '-f' || v === '-s' || v === '-w') k++
      else if (!v.startsWith('-') && ++files === 2) writes.push(v)
    }
  }
  if (exe === 'diff') {
    for (let k = 0; k < rest.length; k++) {
      if ((rest[k]?.v ?? '').startsWith('--output')) writes.push(valueAfter(rest, k))
    }
  }
  return { writes, runs }
}

const SHELL = /^(bash|sh|zsh|fish)$/
const INTERPRETER = /^(python[\d.]*|node|ruby|perl)$/
const BENIGN_TARGETS = new Set(['/dev/null', '&1', '&2'])
/** Operands that make a shell or an interpreter read its program from standard input, like no operand at all. */
const STDIN_FILES = new Set(['/dev/stdin', '/dev/fd/0', '/proc/self/fd/0'])

/** bash's long options, which it takes with one dash as with two (`-login`, `--login`); the second set takes a value. */
const SHELL_LONG = new Set(['login', 'noprofile', 'norc', 'posix', 'restricted', 'verbose', 'noediting', 'debugger'])
const SHELL_LONG_VALUED = new Set(['rcfile', 'init-file'])

/**
 * A shell's options before its command, read as the shell reads them: a
 * long option is one word (two with its value), every `o` or `O` of a
 * cluster takes the next word as its value (`-euo pipefail`), a `c` makes
 * what follows the command string, an `s` makes the shell read its standard
 * input. `at` is the first word after the options.
 */
function shellFlags(rest: readonly Word[]): { at: number; hasC: boolean; hasS: boolean } {
  let j = 0
  let hasC = false
  let hasS = false
  for (; j < rest.length; j++) {
    const v = rest[j]?.v ?? ''
    if (v === '--' || v === '-') {
      j++
      break
    }
    if (v.startsWith('-')) {
      const long = v.replace(/^--?/, '')
      if (SHELL_LONG.has(long)) continue
      if (SHELL_LONG_VALUED.has(long)) {
        j++
        continue
      }
    }
    if (/^[-+][A-Za-z]+$/.test(v)) {
      if (v.includes('s')) hasS = true
      for (const ch of v) if (ch === 'o' || ch === 'O') j++
      if (v.startsWith('-') && v.includes('c')) {
        hasC = true
        j++
        break
      }
      continue
    }
    if (!v.startsWith('-') && !v.startsWith('+')) break
  }
  return { at: j, hasC, hasS }
}

/**
 * The command a shell is handed after its `-c` word, in the readings that
 * can hold: the words from `from` on read together (an option may still
 * stand among them: `-c -e 'command'`), and the first of them that is no
 * option read alone, since it is the command string and the words after it
 * are only its arguments (`-c 'command' arg0`).
 */
function commandStrings(rest: readonly Word[], from: number): string[] {
  const out = [
    rest
      .slice(from)
      .map(w => w.v)
      .join(' '),
  ]
  let k = from
  while (k < rest.length && /^[-+]/.test(rest[k]?.v ?? '')) k++
  if (k < rest.length && rest.length > from + 1) out.push(rest[k]?.v ?? '')
  return out
}

/**
 * The first version's reading of the same options: the first `-...c...` word
 * starts the command string, wherever it stands before the first word that
 * is neither an option nor an option's value. The index of the string's
 * first word, or -1. Kept beside `shellFlags`, for the spellings that one
 * does not know (zsh's glued `-oshwordsplit`), so no reading is lost.
 */
function firstC(rest: readonly Word[]): number {
  for (let j = 0; j < rest.length; j++) {
    const v = rest[j]?.v ?? ''
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(v)) return j + 1
    if (v === '-o' || v === '-O' || v === '+o' || v === '+O' || v === '--rcfile' || v === '--init-file') {
      j++
      continue
    }
    if (!v.startsWith('-') && !v.startsWith('+')) return -1
  }
  return -1
}

/** A variable's name or a special parameter, at a given place; the name may be of any length. */
const VARIABLE_AT = /[A-Za-z_][A-Za-z0-9_]*|[@*#?0-9]/y

/** Whether a text is nothing but variables and command substitutions (`"$CMD"`, `"$(cat cmd.txt)"`). */
function isOnlyVariables(text: string): boolean {
  noteText(text)
  let rest = ''
  let isFound = false
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text.charAt(i)
    if (c === '`') {
      const k = closeTick(text, i)
      isFound = true
      i = k < 0 ? n : k + 1
      continue
    }
    if (c === '$') {
      const d = text.charAt(i + 1)
      if (d === '(') {
        const k = closeParen(text, i + 2)
        isFound = true
        i = k < 0 ? n : k + 1
        continue
      }
      if (d === '{') {
        const k = closeBrace(text, i + 2, true, 0, { quote: false })
        isFound = true
        i = k < 0 ? n : k + 1
        continue
      }
      VARIABLE_AT.lastIndex = i + 1
      const name = VARIABLE_AT.exec(text)
      if (name) {
        isFound = true
        i += 1 + name[0].length
        continue
      }
    }
    rest += c
    i++
  }
  return isFound && /^[\s'"]*$/.test(rest)
}

/**
 * `echo` or `printf` of words that can be read, or `cat` of a heredoc or
 * here-string with no file. Not readable: an `echo` whose words, or a
 * `printf` whose arguments after the format, are nothing but variables as
 * written (a value carried forward does not change that); a segment with a
 * substitution; a `cat` whose body is nothing but variables; the last
 * command of a parenthesised group, which stands for the whole group's
 * output; and a command that stands after a case pattern or a function's
 * name.
 */
function isReadableProducer(seg: Seg): boolean {
  if (seg.isGroupEnd || seg.hasSubst || seg.cut > 0) return false
  const { exe, rest } = commandOf(seg.words.slice(seg.cut))
  if (exe === 'echo' || exe === 'printf') {
    let from = 0
    if (exe === 'echo') while (/^-[neE]+$/.test(rest[from]?.v ?? '')) from++
    else if (rest.length > 1) from = 1
    return !isOnlyVariables(
      rest
        .slice(from)
        .map(w => w.raw)
        .join(' '),
    )
  }
  if (exe === 'cat') {
    const bodies = bodiesOf(seg)
    return bodies.length > 0 && rest.every(w => w.v.startsWith('-')) && !bodies.some(isOnlyVariables)
  }
  return false
}

/** What a readable producer writes, as the text a shell fed by it would run. */
function producedText(seg: Seg): string {
  const { exe, rest } = commandOf(seg.words.slice(seg.cut))
  if (exe === 'cat') return bodiesOf(seg).join('\n')
  let from = 0
  if (exe === 'echo') while (/^-[neE]+$/.test(rest[from]?.v ?? '')) from++
  return rest
    .slice(from)
    .map(w => w.v)
    .join(' ')
    .replace(/\\n/g, '\n')
}

// ---------------------------------------------------------------- classification

type Run = {
  cfg: HoldConfig
  raw: string
  isUncertain: boolean
  /** The texts that were read a second time: as written (rule 2a), or the way the earlier scanner read them. */
  twins: Set<string>
  /** The first configured host a stage of the command was found to name, through a carried value too. */
  seen: string | null
  /** The characters handed to `classifyText` so far. */
  work: number
  /**
   * The earlier scanner's reading of some text was uncertain. That reading
   * is kept only so that none of its holds is lost: its doubt adds the raw
   * text's reasons like any other, and does not make the verdict uncertain.
   */
  isOldUncertain: boolean
  /** The configured host the raw command names, once it has been looked for. */
  named?: string | null
}

/** The first configured host the whole raw command names; looked for once, however many segments ask. */
function namedIn(run: Run): string | null {
  if (run.named === undefined) run.named = hostOf(run.raw, run.cfg.hosts)
  return run.named
}
type Ctx = {
  run: Run
  host: string | null
  /** The configured host whose shell runs this text, when it is known to be run by one (rule 3a). */
  remote: string | null
  depth: number
  /** The as-written reading (rule 2a): no value is carried forward in this text or in a text inside it. */
  isPlain: boolean
  /** Inside the earlier scanner's reading of some text (see `scan`). */
  isOld: boolean
  /** The text is the piece of a segment before a cut (a pattern, a function's name), not a whole command. */
  isPart?: boolean
}

/** The text in hand cannot be read with certainty: the raw command decides as well (rule 7). */
function doubt(ctx: Ctx): void {
  if (ctx.isOld) ctx.run.isOldUncertain = true
  else ctx.run.isUncertain = true
}
type Stage = {
  reasons: Reason[]
  /** Exempt: read-only (rule 5) or a stop (rule 6). */
  isExempt: boolean
  /** Read-only by rule 5, which is what an earlier stage of the pipeline asks of it. */
  isReadOnly: boolean
  isStop: boolean
  host: string | null
  /** A shell or interpreter with nothing to run but its standard input. */
  isBare: boolean
  /** An interpreter that is not a shell. */
  isInterpreter: boolean
  /** A remote shell that hands its standard input to a shell on this configured host. */
  feeds: string | null
}
type Out = {
  reasons: Reason[]
  total: number
  exempt: number
  isStop: boolean
  /** A stage reads its program from standard input. */
  hasBare: boolean
  /** Such a stage is a shell. */
  hasBareShell: boolean
  /** Such a stage is an interpreter that is not a shell. */
  hasBareInterpreter: boolean
  /** A stage is an interpreter that is not a shell, whatever it reads. */
  hasInterpreter: boolean
}

/** What a text that was not taken apart counts as: one segment, not exempt. */
const NO_STAGES: Out = {
  reasons: [],
  total: 1,
  exempt: 0,
  isStop: false,
  hasBare: false,
  hasBareShell: false,
  hasBareInterpreter: false,
  hasInterpreter: false,
}

const MAX_DEPTH = 8
/**
 * One command reads at most this many distinct texts a second time (as written beside the expanded
 * reading, the earlier scanner's way beside this one's). A text read again inside each reading of the
 * text around it counts once. Past it the reader stops short (`stopShort`).
 */
const MAX_TWINS = 64

/** Whether a text may be read a second time; false when the call has spent its second readings, which is a limit of the reader. */
function hasTwin(run: Run, key: string): boolean {
  if (run.twins.has(key)) return true
  if (run.twins.size >= MAX_TWINS) {
    stopShort()
    return false
  }
  run.twins.add(key)
  return true
}
/** A command longer than this is not taken apart: the raw text decides (rule 7). */
const MAX_PARSE = 400_000
/**
 * One command may hand this many characters in all to `classifyText`, its
 * nested texts counted each time they are read. Past it the raw text decides
 * (rule 7): nesting that reads the same text again at every level stays
 * within the time a hook has.
 */
const WORK_MAX = 3 * MAX_PARSE

const fullOf = (seg: Seg): string => [seg.raw, ...seg.bodies, ...(seg.here !== null ? [seg.here] : [])].filter(t => t !== '').join('\n')
const bodiesOf = (seg: Seg): string[] => [...seg.bodies, ...(seg.here !== null ? [seg.here] : [])]

const stage = (reasons: Reason[], host: string | null, more: Partial<Stage> = {}): Stage => ({
  reasons,
  isExempt: false,
  isReadOnly: false,
  isStop: false,
  host,
  isBare: false,
  isInterpreter: false,
  feeds: null,
  ...more,
})

const unreadable = (match: string, host: string): Reason => ({ kind: 'unreadable', match: clean(match.trim(), MATCH_MAX), host })

/** Rule 6: a segment that is neither read-only nor a shell reading text it was handed. */
function otherSegment(full: string, hasSubst: boolean, host: string | null, cfg: HoldConfig, more: Partial<Stage> = {}): Stage {
  const first = siteAndA(full, cfg, host)
  const second = classB(full, host)
  if (first.length === 0 && !hasSubst && hasStop(full, cfg)) {
    // A stop waives class B. Where the text holds several commands (a wrapper
    // typing them into a pane), a class B word in a part that is not the
    // stop still holds: added to the plan's rule.
    const strays =
      second.length > 0 && /[;&|\n]/.test(full)
        ? full
            .split(/[;&|\n]+/)
            .filter(part => !hasStop(part, cfg))
            .flatMap(part => classB(part, host))
        : []
    if (strays.length === 0) return stage([], host, { ...more, isExempt: true, isStop: true })
    return stage(strays, host, more)
  }
  return stage([...first, ...second], host, more)
}

/** The value of an ssh `-o` option that runs a command or names the host, by its key. */
const SSH_OPTION = /^\s*(remotecommand|proxycommand|localcommand|hostname)\s*(?:=|\s)\s*([\s\S]*)$/i

/** Rules 3 and 3a: a remote shell. Its remote text and its body are classified as commands of their own. */
function remoteShell(seg: Seg, isSsh: boolean, around: Around, rest: readonly Word[], ctx: Ctx): Stage {
  const { isLaterReadOnly, laterHost } = around
  const cfg = ctx.run.cfg
  const full = fullOf(seg)
  /** Commands an option makes the remote side run (`RemoteCommand`) and this side run (`ProxyCommand`, `LocalCommand`). */
  const remoteCommands: string[] = []
  const localCommands: string[] = []
  let hostName: string | null = null
  const option = (text: string): void => {
    const m = SSH_OPTION.exec(text)
    if (!m) return
    const key = (m[1] ?? '').toLowerCase()
    const value = m[2] ?? ''
    if (key === 'remotecommand') remoteCommands.push(value)
    else if (key === 'hostname') hostName = value
    else localCommands.push(value)
  }
  let j = 0
  /** Skips option words from `j`, reading the `-o` values that matter; a bare `--` is skipped only where `isDashSkipped`. */
  const options = (isDashSkipped: boolean): void => {
    while (j < rest.length) {
      const v = rest[j]?.v ?? ''
      if (v === '--') {
        if (!isDashSkipped) return
        j++
        continue
      }
      if (!v.startsWith('-') || v.length < 2) return
      const isValued = takesValue(v, SSH_VALUE)
      if (isValued && v.endsWith('o')) option(rest[j + 1]?.v ?? '')
      else if (!isValued && v.startsWith('-o')) option(v.slice(2))
      j += isValued ? 2 : 1
    }
  }
  options(true)
  const target = rest[j]
  if (!target || target.v === '') {
    // No target found: the parse is uncertain, and the words are matched as they stand.
    doubt(ctx)
    return otherSegment(full, seg.hasSubst, ctx.host ?? hostOf(full, cfg.hosts) ?? laterHost, cfg)
  }
  j++
  // OpenSSH goes on reading options after the host (`ssh host -t 'command'`); mosh does not.
  if (isSsh) options(false)
  // A target that is a variable with no value carried forward names a host this cannot know: the raw
  // text decides (rule 7), and for rule 3a the host is one the command names somewhere. A value that
  // was carried forward counts where it names a configured host; where it names none, the raw text
  // decides as before.
  const isCarried = target.isLit === true || target.vx !== undefined
  const isUnknownTarget = !isCarried && (target.hasVar === true || /[$`]/.test(target.raw))
  const named = hostOf(target.vx ?? target.v, cfg.hosts) ?? (hostName !== null ? hostOf(hostName, cfg.hosts) : null)
  // A weak value names the host for the rules below and leaves the parse uncertain, as an unknown target
  // does. It never takes a hold away: where it names no configured host the target stays an unresolved
  // one for rule 3a, since the shell may not use that value at all.
  if (isUnknownTarget || (isCarried && named === null) || target.isWeak === true) doubt(ctx)
  const targetHost = named ?? (isUnknownTarget || target.isWeak === true ? namedIn(ctx.run) : null)
  const host = targetHost ?? ctx.host ?? hostOf(full, cfg.hosts) ?? laterHost
  const inner: Ctx = { ...ctx, host: named ?? ctx.host, remote: targetHost ?? ctx.remote, depth: ctx.depth + 1 }
  let after = rest.slice(j)
  if (after[0]?.v === '--') after = after.slice(1)
  const remote = [after.map(w => w.v).join(' '), ...remoteCommands].filter(t => t.trim() !== '').join('\n')
  const bodies = bodiesOf(seg)

  const reasons: Reason[] = []
  let total = 0
  let exempt = 0
  let isStop = false
  // With no words after the target the far side starts a shell on its standard input, whatever an option adds.
  const hasWords = after.some(w => w.v.trim() !== '')
  let isBare = !hasWords
  let isInterpreter = false
  let hasInterpreter = false
  let isCode = false
  if (remote !== '') {
    const out = classifyText(remote, inner)
    addAll(reasons, out.reasons)
    total += out.total
    exempt += out.exempt
    isStop = out.isStop
    if (hasWords) isBare = out.hasBare
    // The body is an interpreter's code only when the interpreter is what reads standard input:
    // not one given a script or `-c`, and not beside a bare shell, which runs the body as commands.
    isInterpreter = out.hasBareInterpreter && !out.hasBareShell
    hasInterpreter = out.hasInterpreter
  }
  // A command an option runs on this side is a local command like any other.
  for (const text of localCommands) addAll(reasons, classifyText(text, { ...ctx, depth: ctx.depth + 1 }).reasons)

  // Rule 3a: input the rig's shell would run and this cannot read. Through
  // a jump host the rig is named in the remote text, whose own remote shell
  // hands its standard input on.
  const feedHost = targetHost ?? (isBare && remote !== '' ? hostOf(remote, cfg.hosts) : null)
  // A body goes to whatever reads standard input on the far side; only then is it that host's program.
  const bodyCtx: Ctx = isBare ? { ...inner, host: inner.host ?? feedHost, remote: inner.remote ?? feedHost } : { ...inner, remote: null }
  for (const body of bodies) {
    if (isBare && feedHost !== null && isOnlyVariables(body)) reasons.push(unreadable(body, feedHost))
    if (hasInterpreter) {
      // The body is that interpreter's code (rule 4). Where an interpreter is named but is not what
      // reads the body, the body is tried both ways: as code here, and as a command below.
      isCode = true
      const codeHost = bodyCtx.host ?? hostOf(body, cfg.hosts)
      addAll(reasons, siteAndA(body, cfg, codeHost))
      addAll(reasons, classB(literalsOf(body), codeHost))
    }
    if (!isInterpreter) {
      const out = classifyText(body, bodyCtx)
      addAll(reasons, out.reasons)
      total += out.total
      exempt += out.exempt
      if (out.isStop) isStop = true
    }
  }

  const file = seg.redirects.find(r => !r.isOut && !r.target.startsWith('&'))
  const isStdinRun = isBare && bodies.length === 0
  if (targetHost !== null && remote !== '' && isOnlyVariables(remote)) reasons.push(unreadable(remote, targetHost))
  else if (isStdinRun && feedHost !== null) {
    if (file) reasons.push(unreadable(`< ${file.target}`, feedHost))
    else if (around.blind !== null) reasons.push(unreadable(around.blind, feedHost))
  }

  const hasBadOut = seg.redirects.some(r => r.isOut && !BENIGN_TARGETS.has(r.target))
  // The remote side's output written to a local file or device: the outer words count after all.
  if (hasBadOut) addAll(reasons, siteAndA(seg.raw, cfg, host))
  const isAllExempt = total > 0 && exempt === total && !isCode && reasons.length === 0 && !hasBadOut
  // Rule 5a: read-only text that a later stage can run.
  if (isAllExempt && !isLaterReadOnly) addAll(reasons, everyClass([remote, ...bodies].join('\n'), cfg, host))
  const isExempt = isAllExempt && isLaterReadOnly
  // With no input of its own it runs whatever the standard input of the command around it holds.
  const isOpen = isStdinRun && !file
  return stage(reasons, host, { isExempt, isReadOnly: isExempt, isStop, isBare: isOpen, feeds: isOpen ? feedHost : null })
}

/** What a stage knows of its pipeline: the stages after it, already judged, and the stages before it. */
type Around = {
  /** Every later stage is read-only by rule 5. */
  isLaterReadOnly: boolean
  /** The host of the first later stage that has one. */
  laterHost: string | null
  /** An earlier stage is not a readable producer (rule 3a): its text, when there is one. */
  blind: string | null
  /** The stage right after this one, when there is one. */
  next: Stage | null
}

/** Rules 3 to 6 on one segment by its own executable, the stages after it already judged. */
function judgeOwn(seg: Seg, command: Command, around: Around, ctx: Ctx, host: string | null): Stage {
  const cfg = ctx.run.cfg
  const full = fullOf(seg)
  const { isLaterReadOnly } = around
  const { exe, rest } = command
  const hasBadOut = seg.redirects.some(r => r.isOut && !BENIGN_TARGETS.has(r.target))

  if (exe === 'ssh' || exe === 'mosh') return remoteShell(seg, exe === 'ssh', around, rest, ctx)

  if (exe !== null && SHELL.test(exe)) {
    // Rule 4: text handed to a shell is a command of its own. The options before it are read as the
    // shell reads them (`shellFlags`).
    const flags = shellFlags(rest)
    const { hasC, hasS } = flags
    const j = flags.at
    const operand = rest[j]?.v
    const texts: string[] = []
    if (hasC) addAll(texts, commandStrings(rest, j))
    // A script named on the command line is run by name; `/dev/stdin` as that name is standard input again.
    const isScript = !hasC && !hasS && operand !== undefined && !STDIN_FILES.has(operand)
    addAll(texts, bodiesOf(seg))
    const commands = texts.filter(t => t.trim() !== '')
    const inner: Ctx = { ...ctx, host, depth: ctx.depth + 1 }
    // Where that reader found no command string, the first version's rule is tried as well, and what
    // it takes for the string is read as a command beside the segment's own verdict.
    const reasons: Reason[] = []
    if (!hasC) {
      const k = firstC(rest)
      for (const text of k < 0 ? [] : commandStrings(rest, k)) {
        if (text.trim() !== '') addAll(reasons, classifyText(text, inner).reasons)
      }
    }
    if (commands.length === 0) {
      const own = otherSegment(full, seg.hasSubst, host, cfg, { isBare: !isScript || rest.some(w => w.v === '-s') })
      return reasons.length === 0 ? own : { ...own, reasons: [...own.reasons, ...reasons], isExempt: false, isReadOnly: false }
    }
    let total = 0
    let exempt = 0
    let isStop = false
    for (const text of commands) {
      const out = classifyText(text, inner)
      addAll(reasons, out.reasons)
      total += out.total
      exempt += out.exempt
      if (out.isStop) isStop = true
    }
    if (hasBadOut) addAll(reasons, siteAndA(seg.raw, cfg, host))
    const isAllExempt = total > 0 && exempt === total && reasons.length === 0 && !hasBadOut
    if (isAllExempt && !isLaterReadOnly) addAll(reasons, everyClass(commands.join('\n'), cfg, host))
    const isExempt = isAllExempt && isLaterReadOnly
    return stage(reasons, host, { isExempt, isReadOnly: isExempt, isStop })
  }

  if (exe !== null && INTERPRETER.test(exe)) {
    // Rule 4: text handed to an interpreter is code. No exemption inside it;
    // class B only inside its string literals, where a shell command would be.
    const valued = exe.startsWith('python') ? ['-W', '-X'] : exe === 'node' ? ['-r', '--require'] : ['-r', '-I']
    const codes: string[] = []
    let isScript = false
    let hasLoader = false
    for (let j = 0; j < rest.length; j++) {
      const v = rest[j]?.v ?? ''
      if (/^-[A-Za-z]*[ce]$/.test(v) || v === '--eval' || v === '-p' || v === '--print') {
        // After a flag that loads something first, the words are matched as they stand (rule 6), not as code.
        if (hasLoader) isScript = true
        else codes.push(rest[j + 1]?.v ?? '')
        break
      }
      // `-` and `/dev/stdin` are standard input, whatever arguments follow (`python3 - x 10`).
      if (v === '-' || STDIN_FILES.has(v)) break
      if (v === '-m') {
        isScript = true
        break
      }
      if (v === '-W' || v === '-X' || v === '-r' || v === '-I' || v === '--require') {
        hasLoader = true
        // The flag's value, where this interpreter gives it one and what follows is not another flag.
        if (valued.includes(v) && !(rest[j + 1]?.v ?? '-').startsWith('-')) j++
        continue
      }
      if (!v.startsWith('-')) {
        isScript = true
        break
      }
    }
    addAll(codes, bodiesOf(seg))
    const code = codes.filter(t => t.trim() !== '').join('\n')
    if (code === '') return otherSegment(full, seg.hasSubst, host, cfg, { isBare: !isScript, isInterpreter: true })
    return stage([...siteAndA(full, cfg, host), ...classB(literalsOf(code), host)], host, { isInterpreter: true })
  }

  const use = exe !== null ? readOnlyUse(exe, rest) : null
  // What the command's own arguments make it write is tried like a redirect to that file.
  const text = use !== null && use.writes.length > 0 ? `${full}\n${use.writes.map(t => `> ${t}`).join('\n')}` : full
  if (use !== null && !seg.hasSubst && !hasBadOut) {
    // Rule 5: exempt, every class waived, unless its own arguments run a program or write a file, or
    // an assignment in front of it may name a program.
    const isPlain = !use.runs && use.writes.length === 0 && command.assigned.every(name => HARMLESS_ENV.test(name))
    if (isPlain && isLaterReadOnly) return stage([], host, { isExempt: true, isReadOnly: true })
    if (!isLaterReadOnly) {
      // Rule 5a: a later stage can run its text. Where that stage is a shell reading its standard
      // input, what a readable producer writes is also read as the command it is.
      const reasons = everyClass(text, cfg, host)
      const next = around.next
      if (next !== null && next.isBare && !next.isInterpreter && isReadableProducer(seg)) {
        addAll(reasons, classifyText(producedText(seg), { ...ctx, host, remote: next.feeds ?? ctx.remote, depth: ctx.depth + 1 }).reasons)
      }
      return stage(reasons, host)
    }
  }

  // `su`, `sudo -i` and `sudo -s` are shells too: with nothing else to run they read their standard input.
  const isRootShell =
    exe === 'su' ||
    (exe === null &&
      seg.words.some(w => baseOf(w.v) === 'sudo') &&
      seg.words.some(w => /^-[A-Za-z]*[is]$/.test(w.v) || w.v === '--login' || w.v === '--shell'))
  return otherSegment(text, seg.hasSubst, host, cfg, isRootShell ? { isBare: true } : {})
}

/**
 * One segment of a pipeline. Beside its own verdict (`judgeOwn`), and never
 * in place of it: each substitution in it and each `eval` or `trap` string
 * is classified as a command of its own, each distinct text once; the words
 * before a case pattern's or a function name's `)` are tried as raw text
 * and read as a text of their own; input from a process substitution is
 * tried like text piped in; and under a configured host an executable that
 * is nothing but a variable is input that cannot be read. Any reason found
 * this way ends the segment's exemption, and a segment with a cut is exempt
 * only when the text before the cut is exempt too.
 */
function judge(seg: Seg, around: Around, ctx: Ctx): Stage {
  const cfg = ctx.run.cfg
  // Rule 6's host: the remote target this text sits under, else a host it names, else the host it feeds.
  const host = ctx.host ?? hostOf(fullOf(seg), cfg.hosts) ?? around.laterHost
  const command = commandOf(seg.cut > 0 ? seg.words.slice(seg.cut) : seg.words)
  const own = judgeOwn(seg, command, around, ctx, host)
  const { exe, word, rest } = command

  const inner: Ctx = { ...ctx, depth: ctx.depth + 1 }
  const texts = new Set<string>(seg.substs)
  if (exe === 'eval') texts.add(rest.map(w => w.v).join(' '))
  if (exe === 'trap') {
    // `trap 'command' SIGNAL`: the first word that is not an option; `-` resets and runs nothing.
    const action = rest.find(w => w.v === '-' || !w.v.startsWith('-'))?.v ?? ''
    if (action !== '-') texts.add(action)
  }
  const extra: Reason[] = []
  for (const text of texts) {
    if (text.trim() !== '') addAll(extra, classifyText(text, inner).reasons)
  }
  let isBeforeExempt = true
  if (seg.cut > 0) {
    if (seg.isCutRead) {
      // The words before the `)` are a pattern or a name. Read as a text of their own they give
      // nothing; where they are a command after all, they are judged as one.
      const before = classifyText(seg.cutText.replace(/\(\s*$/, ''), { ...inner, isPart: true })
      addAll(extra, before.reasons)
      isBeforeExempt = before.total > 0 && before.exempt === before.total
    }
    addAll(extra, everyClass(seg.cutText, cfg, host))
  }
  // `< <(cmd)`: what the command inside writes is fed to this stage, so its text is tried like text piped in (rule 5a).
  for (const r of seg.redirects) {
    if (!r.isOut && r.target.startsWith('<(')) addAll(extra, everyClass(r.target, cfg, host))
  }
  // Not where the as-written reading meets a variable whose value was carried forward: the other reading
  // has read it. A weak value does not count as carried here: it never takes a hold away.
  if (ctx.remote !== null && word !== null && word.hasVar === true && (word.vx === undefined || word.isWeak === true) && isOnlyVariables(word.v)) {
    extra.push(unreadable(word.raw, ctx.remote))
  }
  if (extra.length === 0 && isBeforeExempt) return own
  return { ...own, reasons: extra.length === 0 ? own.reasons : [...own.reasons, ...extra], isExempt: false, isReadOnly: false }
}


/**
 * The devices of class A by their paths alone. A write that only a full
 * reading shows (a file a command writes through its own arguments, a
 * redirect whose target is a carried value) is no pattern, so a text that
 * could not be read in full is held where it names one of these at all.
 */
const DEVICE_PATHS: [HoldKind, RegExp][] = [
  ['gpio-set', /\/sys\/class\/gpio\//],
  ['serial-write', new RegExp(SERIAL)],
]

/**
 * What a text that is too deep or too long to take apart gives, and what the whole raw command gives where the
 * reader stopped short anywhere in it: every pattern on it as it stands, a class A device it names, and rule 3a
 * by its host alone.
 */
function untaken(text: string, cfg: HoldConfig, host: string | null): Reason[] {
  const reasons = everyClass(text, cfg, host)
  const forms = formsOf(text)
  for (const [kind, re] of DEVICE_PATHS) {
    const m = hit(re, forms)
    if (m !== null) reasons.push({ kind, match: clean(m, MATCH_MAX), host })
  }
  // Rule 3a is not a pattern, so the raw text cannot show it: a text this cannot read that names a configured host is held.
  if (host !== null) reasons.push(unreadable(text.slice(0, MATCH_MAX), host))
  return reasons
}

/**
 * A text as a command of its own. Where a value was carried forward into it
 * (rule 2a) it is read twice, with the values in place and as written, and
 * the two readings are joined: every reason of either holds, and a segment
 * is exempt only when both readings exempt it. So a carried value can add a
 * hold and can name the host of a remote shell, and never takes a hold away.
 */
function classifyText(text: string, ctx: Ctx): Out {
  const run = ctx.run
  const cfg = run.cfg
  run.work += text.length
  if (ctx.depth > MAX_DEPTH || run.work > WORK_MAX) {
    // Too deep to follow, or the command has had its share of work: the raw text decides. Past the
    // budget the host is the one the whole command names, which is looked for once.
    stopShort()
    doubt(ctx)
    const host = ctx.host ?? ctx.remote ?? (ctx.depth > MAX_DEPTH ? hostOf(text, cfg.hosts) : namedIn(run))
    return { ...NO_STAGES, reasons: untaken(text, cfg, host) }
  }
  // A piece of a segment is scanned as one; the texts inside it are whole again.
  const isPart = ctx.isPart === true
  if (isPart) ctx = { ...ctx, isPart: false }
  const sc = scan(text, !ctx.isPlain, false, isPart)
  let out = readScan(sc, ctx, text)
  if (sc.isOpaque) {
    // Shells read a piece of this text in different ways: it counts like a text too deep to take apart.
    stopShort()
    doubt(ctx)
    out = { ...out, reasons: [...out.reasons, ...untaken(text, cfg, ctx.host ?? ctx.remote ?? hostOf(text, cfg.hosts))] }
  }
  if (!sc.differs) return out
  // This reading parted from the earlier scanner's (a `)` glued into a word, a group before `then`, a
  // continuation after a redirect sign, a `${` that runs past its first `}`). The text is read that
  // way too and the two readings are joined like those of rule 2a, so no hold of the earlier one is lost.
  if (!hasTwin(run, `old ${text}`)) {
    doubt(ctx)
    return out
  }
  return bothOf(out, readScan(scan(text, !ctx.isPlain, true, isPart), { ...ctx, isOld: true }, text))
}

/** One scan of `text` judged: with the values of rule 2a in place and, where any was carried, as written too. */
function readScan(sc: Scanned, ctx: Ctx, text: string): Out {
  if (sc.isUncertain) doubt(ctx)
  const out = judgeAll(sc, ctx)
  if (!sc.hasExpansions) return out
  if (!hasTwin(ctx.run, `${ctx.isOld ? 'plain, old' : 'plain'} ${text}`)) {
    doubt(ctx)
    return out
  }
  const plain = judgeAll({ segs: sc.segs.map(plainOf), comments: [] }, { ...ctx, isPlain: true })
  return {
    reasons: [...out.reasons, ...plain.reasons],
    total: out.total,
    exempt: Math.min(out.exempt, plain.exempt),
    isStop: out.isStop || plain.isStop,
    hasBare: out.hasBare || plain.hasBare,
    hasBareShell: out.hasBareShell || plain.hasBareShell,
    hasBareInterpreter: out.hasBareInterpreter || plain.hasBareInterpreter,
    hasInterpreter: out.hasInterpreter || plain.hasInterpreter,
  }
}

/** Two readings of one text joined: every reason of either holds, and the text is all exempt only when both readings are. */
function bothOf(a: Out, b: Out): Out {
  const isAllExempt = a.total > 0 && a.exempt === a.total && b.total > 0 && b.exempt === b.total
  const total = a.total === 0 && b.total === 0 ? 0 : Math.max(a.total, 1)
  return {
    reasons: [...a.reasons, ...b.reasons],
    total,
    exempt: isAllExempt ? total : Math.min(a.exempt, Math.max(total - 1, 0)),
    isStop: a.isStop || b.isStop,
    hasBare: a.hasBare || b.hasBare,
    hasBareShell: a.hasBareShell || b.hasBareShell,
    hasBareInterpreter: a.hasBareInterpreter || b.hasBareInterpreter,
    hasInterpreter: a.hasInterpreter || b.hasInterpreter,
  }
}

/** The segments of one text judged pipeline by pipeline, last stage first. */
function judgeAll(sc: { segs: readonly Seg[]; comments: readonly string[] }, ctx: Ctx): Out {
  const cfg = ctx.run.cfg
  const stages: Stage[] = new Array<Stage>(sc.segs.length)
  let end = sc.segs.length - 1
  while (end >= 0) {
    let start = end
    while (start > 0 && sc.segs[start - 1]?.isPiped === true) start--
    // The first stage of the pipeline that is not a readable producer: what follows it is fed input this cannot read.
    let firstBlind = -1
    for (let idx = start; idx < end && firstBlind < 0; idx++) {
      if (!isReadableProducer(sc.segs[idx] as Seg)) firstBlind = idx
    }
    let isLaterReadOnly = true
    let laterHost: string | null = null
    let next: Stage | null = null
    for (let idx = end; idx >= start; idx--) {
      const blind = firstBlind >= 0 && firstBlind < idx ? (sc.segs[firstBlind] as Seg).raw || '(a pipeline stage)' : null
      const judged = judge(sc.segs[idx] as Seg, { isLaterReadOnly, laterHost, blind, next }, ctx)
      stages[idx] = judged
      if (!judged.isReadOnly) isLaterReadOnly = false
      if (judged.host !== null) laterHost = judged.host
      next = judged
    }
    end = start - 1
  }
  const reasons: Reason[] = []
  let exempt = 0
  let isStop = false
  let hasBareShell = false
  let hasBareInterpreter = false
  let hasInterpreter = false
  for (const s of stages) {
    // A stage's host is always a configured one (`hostOf`, or the target of a remote shell that named one).
    if (s.host !== null) ctx.run.seen ??= s.host
    addAll(reasons, s.reasons)
    if (s.isExempt) exempt++
    if (s.isStop) isStop = true
    if (s.isInterpreter) hasInterpreter = true
    if (s.isBare && s.isInterpreter) hasBareInterpreter = true
    else if (s.isBare) hasBareShell = true
  }
  // A comment runs nothing and exempts nothing; the site patterns and class A are still tried on it.
  for (const comment of sc.comments) addAll(reasons, siteAndA(comment, cfg, ctx.host ?? hostOf(comment, cfg.hosts)))
  return { reasons, total: stages.length, exempt, isStop, hasBare: hasBareShell || hasBareInterpreter, hasBareShell, hasBareInterpreter, hasInterpreter }
}

function held(found: readonly Reason[], isCertain: boolean): Verdict {
  const seen = new Set<string>()
  const reasons: Reason[] = []
  for (const r of found) {
    const key = `${r.kind}\u0000${r.match}\u0000${r.host ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    reasons.push(r)
  }
  const host = reasons[0]?.host ?? null
  const kinds = new Set(reasons.map(r => r.kind))
  const phrases = PHRASES.filter(([kind]) => kinds.has(kind)).map(([, phrase]) => phrase)
  return { hold: true, reasons, summary: `${phrases.join(', ')}${host !== null ? ` on ${host}` : ''}`, host, isCertain }
}

const REMOTE_WORD = /\b(ssh|mosh)\b/

/** Rule 8: with a broken config, any remote shell and any class A match is held. */
function brokenReasons(raw: string): Reason[] {
  const forms = formsOf(raw)
  const remote = hit(REMOTE_WORD, forms)
  if (remote !== null) return [{ kind: 'config-error', match: remote, host: null }]
  const first = ruleReasons(CLASS_A, forms, null)[0]
  return first ? [{ kind: 'config-error', match: first.match, host: null }] : []
}

/**
 * The verdict for one Bash command under a config read. A pure function of
 * its two arguments; it never throws.
 */
export function classify(command: string, read: ConfigRead): Verdict {
  let raw = ''
  let cfg = EMPTY
  let isBroken = true
  try {
    raw = normalise(typeof command === 'string' ? command : String(command ?? ''))
    const status = isRecord(read) ? read.status : undefined
    // A read that is none of the three is treated as broken.
    isBroken = status !== 'ok' && status !== 'none'
    cfg = status === 'ok' && read.status === 'ok' ? read.config : EMPTY
    const run: Run = { cfg, raw, isUncertain: raw.length > MAX_PARSE, twins: new Set(), seen: null, work: 0, isOldUncertain: false }
    reading.isShort = false
    reading.steps = STEPS_FLAT
    noteText('')
    // Too long to take apart: a limit of the reader, and nothing of the command is read.
    if (run.isUncertain) stopShort()
    const out: Out = run.isUncertain
      ? NO_STAGES
      : classifyText(raw, { run, host: null, remote: null, depth: 0, isPlain: false, isOld: false })
    // Rule 7: where a reading was uncertain, every pattern is tried on the whole raw command, with no exemption.
    const isDoubted = run.isUncertain || run.isOldUncertain
    const reasons = [...(isBroken ? brokenReasons(raw) : []), ...out.reasons, ...(isDoubted ? everyClass(raw, cfg, namedIn(run)) : [])]
    // The one place a limit of the reader is acted on, whichever it was and wherever it was reached:
    // the whole raw command is decided like a text that cannot be taken apart. Every pattern is tried
    // on it, and a command that names a configured host (in its text, or through a value a stage was
    // read with) is held as input that cannot be read. The reasons found so far are kept.
    if (reading.isShort) addAll(reasons, untaken(raw, cfg, namedIn(run) ?? run.seen))
    if (reasons.length > 0) return held(reasons, !run.isUncertain && !reading.isShort)
    if (out.isStop) return { hold: false, why: 'stop' }
    if (out.total > 0 && out.exempt === out.total) return { hold: false, why: 'read-only' }
    return { hold: false, why: 'no-match' }
  } catch {
    // An internal error is a text that could not be taken apart: the raw text decides, and one that
    // names a configured host is held, as for a text too long or too deep (rule 7).
    try {
      const reasons = [...(isBroken ? brokenReasons(raw) : []), ...untaken(raw, cfg, hostOf(raw, cfg.hosts))]
      return reasons.length > 0 ? held(reasons, false) : { hold: false, why: 'no-match' }
    } catch {
      return {
        hold: true,
        reasons: [{ kind: 'config-error', match: '', host: null }],
        summary: 'use hardware while the site config is broken',
        host: null,
        isCertain: false,
      }
    }
  }
}
