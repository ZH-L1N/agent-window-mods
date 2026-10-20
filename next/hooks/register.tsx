// The next mod: the ➜ NEXT row (row.tsx) offers 2 or 3 short prompts the
// person would likely send next, from one $.model.complete call (Haiku, or
// Sonnet by option) over the last reply and goal-meter's task list. /next asks
// for them; with the option auto=on (the default) a call also runs after every
// main-loop answer over 300 characters while no subagent is still running.
// 1 to 3 (framed Buttons pressed with the band focused, or /next <n>) put that text in
// the prompt box through $.prompt.fill; nothing is sent. 0 dismisses. Hidden
// while a turn runs; cleared when the person sends a prompt or a main-loop
// turn starts. Every call and fill runs from a $.clock timer, never inside a hook.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { NextModel } from '../types'
import {
  AUTO_MIN_CHARS,
  COMMAND,
  DELAY_MS,
  MAX_TOKENS,
  SYSTEM,
  TIMEOUT_MS,
  USAGE,
  autoOf,
  clean,
  modelOf,
  parseArgs,
  parseSuggestions,
  promptOf,
  reasonOf,
} from './kit'
import { drawRow } from './row'

const suggestions = atom({ plugin: 'next', key: 'suggestions' } as const, [])
const busy = atom({ plugin: 'next', key: 'busy' } as const, '')
const GOAL_METER = { plugin: 'goal-meter', key: 'goal' } as const

// One call at a time per generation: the generation whose call holds the lock,
// or null. Set before any await, so a second /next or an automatic call in the
// same moment sees it. A call left over from an earlier generation (its answer
// will be dropped) does not block a call for the current one, and releases the
// lock only while it still holds it. A reload drops it with the environment.
let lockGen: number | null = null
const isLocked = (): boolean => lockGen !== null && lockGen === generation
// Moves on every prompt sent, every main-loop turn start, a dismissal and a
// /clear: a call that finishes after any of them is about a reply the row no
// longer stands for, and its answer is dropped.
let generation = 0
// The last main-loop answer with text, for /next when the transcript cannot be read.
let lastAnswer = ''

/** The agent states that count as still running. */
const LIVE = new Set(['pending', 'running', 'waiting'])

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Whether any subagent or teammate of this session still runs; false when the list cannot be read. */
async function isAgentRunning($: EngineInterface): Promise<boolean> {
  try {
    return (await $.agent.list()).some(a => LIVE.has(a.status))
  } catch {
    return false
  }
}

/** goal-meter's task list as `{ title, status }`; [] when goal-meter is absent or has none. */
async function tasksOf($: EngineInterface): Promise<{ title: string; status: string }[]> {
  try {
    const g = (await $.state.get(GOAL_METER)).value
    if (!g || !Array.isArray(g.tasks)) return []
    return g.tasks.filter(t => t && typeof t.title === 'string').map(t => ({ title: clean(t.title), status: String(t.status) }))
  } catch {
    return []
  }
}

/** The main conversation's last assistant reply with text; the last answer this mod saw when the transcript cannot be read. */
async function lastReply($: EngineInterface): Promise<string> {
  try {
    const all = await $.session.messages()
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i]!
      if (m.role === 'assistant' && m.text.trim() !== '') return m.text
    }
  } catch {
    // The answer kept from turn.complete.
  }
  return lastAnswer
}

/** The row emptied: the suggestions and the asking line (a call still running is now stale). */
async function clearRow($: EngineInterface): Promise<void> {
  await update($, suggestions, () => [])
  await update($, busy, () => '')
}

/**
 * The call, from a timer: the suggestions shown, or (asked by /next) the
 * failure toasted. An automatic call fails silently. The lock and `busy`
 * were set by the caller; both are released here while this call still holds the lock.
 */
async function runCall($: EngineInterface, model: NextModel, reply: string, gen: number, isManual: boolean): Promise<void> {
  try {
    const r = await $.model.complete({
      model,
      system: SYSTEM,
      prompt: promptOf(reply, await tasksOf($)),
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
    })
    // A prompt was sent, a turn started or the row was dismissed meanwhile: the answer is stale.
    if (gen !== generation) return
    if (!r.isAnswered) {
      if (isManual) $.ui.toast(`Next steps failed: ${reasonOf(r)} (/${COMMAND} to try again)`)
      return
    }
    const list = parseSuggestions(r.text)
    if (list.length === 0) {
      if (isManual) $.ui.toast(`No usable next steps came back (/${COMMAND} to try again).`)
      return
    }
    await update($, suggestions, () => list)
  } catch (err) {
    if (isManual) $.ui.toast(`Next steps failed: ${whyOf(err)} (/${COMMAND} to try again)`)
  } finally {
    if (lockGen === gen) {
      lockGen = null
      await update($, busy, () => '').catch(() => {})
    }
  }
}

/** The automatic call after a long main-loop answer, from a timer: skipped while a call or a subagent runs. */
async function autoAsk($: EngineInterface, options: PluginOptions, answer: string, gen: number): Promise<void> {
  if (isLocked() || gen !== generation) return
  lockGen = gen
  let isStarted = false
  try {
    if (await isAgentRunning($)) return
    if (gen !== generation) return
    const model = modelOf(options.model)
    await update($, busy, () => model)
    isStarted = true
    await runCall($, model, answer, gen, false)
  } finally {
    if (!isStarted && lockGen === gen) lockGen = null
  }
}

/** /next with no argument: a call over the last reply, started from a timer. Answers the command's line. */
async function ask($: EngineInterface, options: PluginOptions): Promise<string> {
  if (isLocked()) return `Next steps are on their way; wait for them (/${COMMAND}).`
  const gen = generation
  lockGen = gen
  let isStarted = false
  try {
    const reply = await lastReply($)
    if (!reply.trim()) return `No assistant reply yet: /${COMMAND} works from the last one.`
    const model = modelOf(options.model)
    await update($, busy, () => model)
    $.clock.after(DELAY_MS, () => {
      void runCall($, model, reply, gen, true).catch(() => {})
    })
    isStarted = true
    return `Asking ${model} for next steps; they show above the prompt.`
  } finally {
    if (!isStarted && lockGen === gen) lockGen = null
  }
}

/**
 * Suggestion `n` into the prompt box (over any draft), from a timer: the
 * command's line, or for a press a toast only when it could not be done.
 */
async function pick($: EngineInterface, n: number): Promise<{ text: string; isNotice: boolean }> {
  const list = await read($, suggestions)
  if (list.length === 0) return { text: `No next steps shown: /${COMMAND} asks for some.`, isNotice: true }
  const text = list[n - 1]
  if (text === undefined) {
    const k = list.length
    return { text: `Only ${k} next ${k === 1 ? 'step' : 'steps'}: /${COMMAND} 1${k > 1 ? ` to /${COMMAND} ${k}` : ''}.`, isNotice: true }
  }
  $.clock.after(DELAY_MS, () => {
    void $.prompt
      .fill({ text, mode: 'replace' })
      .then(r => {
        if (!r.isFilled) $.ui.toast(`The prompt box did not take next step ${n}${r.refusal ? ` (${r.refusal})` : ''}: /${COMMAND} ${n} to try again.`)
      })
      .catch(err => $.ui.toast(`/${COMMAND} ${n}: ${whyOf(err)}`))
  })
  return { text: `Next step ${n} goes in the prompt box: ${text}`, isNotice: false }
}

/** /next 0 and the dismiss button: the row (and its asking line) cleared, and a call still running dropped. */
async function dismiss($: EngineInterface): Promise<string> {
  generation++
  await clearRow($)
  return 'Next steps dismissed.'
}

/** A press's work, from a timer (never inside the press); a refusal comes as a toast. */
function later($: EngineInterface, run: () => Promise<{ text: string; isNotice: boolean }>): void {
  $.clock.after(DELAY_MS, () => {
    void run()
      .then(a => {
        if (a.isNotice) $.ui.toast(a.text)
      })
      .catch(err => $.ui.toast(`/${COMMAND}: ${whyOf(err)}`))
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'next',
      description: 'NEXT row: ask for 2 or 3 likely next prompts, put one in the prompt box (1-3), or dismiss them (0)',
      argumentHint: '[1-3 | 0]',
    })
    // A reload while a call ran leaves no call behind it.
    await update($, busy, () => '').catch(() => {})
    return started
  })

  // A main-loop turn starts: the suggestions were for the reply before it.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId !== undefined) return started
    generation++
    try {
      await clearRow($)
    } catch {
      // The row is hidden while the turn runs; the next answer replaces it.
    }
    return started
  })

  // A main-loop answer: kept for /next, and with auto=on, over 300 characters,
  // an automatic call from a timer (which checks that no subagent still runs).
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    try {
      const answer = typeof e.answer === 'string' ? e.answer : ''
      if (answer.trim()) lastAnswer = answer
      if (autoOf(options.auto) === 'on' && e.reason === 'answer' && !e.isAborted && answer.trim().length > AUTO_MIN_CHARS) {
        const gen = generation
        $.clock.after(DELAY_MS, () => {
          void autoAsk($, options, answer, gen).catch(() => {})
        })
      }
    } catch {
      // No suggestions this turn.
    }
    return done
  })

  // A prompt the person sends (not a slash command, not a hidden one): the suggestions are done with.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.command && !e.isMeta && r.drop === undefined) {
        generation++
        await clearRow($)
      }
    } catch {
      // The row hides while the turn runs and clears when it starts.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A /clear or an in-process resume puts another conversation in this process.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      generation++
      lastAnswer = ''
      try {
        await clearRow($)
      } catch {
        // Nothing more to do.
      }
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'next' }, async ($, e) => {
    const asked = parseArgs(e.args)
    try {
      switch (asked.kind) {
        case 'ask':
          return { text: await ask($, options) }
        case 'pick':
          return { text: (await pick($, asked.n)).text }
        case 'dismiss':
          return { text: await dismiss($) }
        default:
          return { text: USAGE }
      }
    } catch (err) {
      return { text: `/${COMMAND}: ${whyOf(err)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) =>
    drawRow($, e, () => next(e), {
      pick: n => later($, () => pick($, n)),
      dismiss: () =>
        later($, async () => {
          await dismiss($)
          return { text: '', isNotice: false }
        }),
    }),
  )
}
