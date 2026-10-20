// The here mod: the ◉ HERE row (row.tsx) says where the session is, with no
// model call by default. goal: goal-meter's goal name (read from its state),
// else the first line of the prompt that started the open task list;
// now: the main loop's last tool call as a verb and a path, or the spinner
// word until the turn's first tool call; you: the question lines of the last
// main-loop reply, dropped when the next prompt is sent. /here prints the
// three, /here on|off shows or hides the row. With the option rewrite=haiku,
// one Haiku call after each main-loop answer rewrites the three parts; it
// runs from a $.clock timer, never inside a hook.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { HereNow } from '../types'
import {
  COMMAND,
  QUESTION_KEEP,
  REWRITE_DELAY_MS,
  REWRITE_MAX_TOKENS,
  REWRITE_MODEL,
  REWRITE_SYSTEM,
  REWRITE_TIMEOUT_MS,
  STORE_BAND,
  firstLineOf,
  isBandOn,
  listGoalOf,
  nowOf,
  parseRewrite,
  partsOf,
  questionsOf,
  rewriteOf,
  rewritePrompt,
  summaryOf,
} from './kit'
import { live } from './live'
import { drawRow, nowText, peerGoal } from './row'

const now = atom({ plugin: 'here', key: 'now' } as const, null)
const you = atom({ plugin: 'here', key: 'you' } as const, [])
const band = atom({ plugin: 'here', key: 'band' } as const, '')
const rewrite = atom({ plugin: 'here', key: 'rewrite' } as const, null)
const goal = atom({ plugin: 'here', key: 'goal' } as const, null)

// The session's directory, for relative paths in `now`; read at session.start.
let cwd = ''
// Moves on every prompt sent and every main-loop turn start: a rewrite that
// finishes after either is about an answer the row no longer shows, and is dropped.
let generation = 0
// The first line of the last prompt the person sent: the fallback goal of a task list it starts.
let lastPrompt = ''
const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])

/** Writes a /here setting to the store; the words to add to the reply when it could not be kept. */
async function persist($: EngineInterface, key: string, value: unknown): Promise<string> {
  try {
    await $.store.set(key, value)
    return ''
  } catch {
    return ' (not saved for the next session)'
  }
}

/** One Haiku call that rewrites the three parts from the answer and the task list; best effort. */
async function runRewrite($: EngineInterface, answer: string, turnId: string, gen: number): Promise<void> {
  // A prompt was sent before the timer fired: the answer is no longer shown, so no call.
  if (gen !== generation) return
  const goal = await peerGoal($)
  const n = await read($, now)
  const qs = await read($, you)
  const r = await $.model.complete({
    model: REWRITE_MODEL,
    system: REWRITE_SYSTEM,
    prompt: rewritePrompt(answer, goal.tasks, { goal: goal.name, now: n?.text ?? '', you: qs[0] ?? '' }),
    maxTokens: REWRITE_MAX_TOKENS,
    effort: 'low',
    timeoutMs: REWRITE_TIMEOUT_MS,
  })
  if (!r.isAnswered || gen !== generation) return
  const parts = parseRewrite(r.text)
  if (!parts) return
  await update($, rewrite, () => ({ ...parts, turnId }))
}

const USAGE = `Usage: /${COMMAND} [on | off]`

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = typeof e.cwd === 'string' ? e.cwd : ''
    live.isTurnRunning = false
    live.spinnerWord = ''
    await $.command.register({
      name: 'here',
      description: 'HERE row: print the goal, what Claude is doing now and the questions the last reply asked; or turn the row on or off',
      argumentHint: 'on | off',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the row is on.
    }
    return started
  })

  // A main-loop turn starts: the last turn's `now` and rewrite are done with; the spinner word stands in until the first tool call.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId !== undefined) return started
    live.isTurnRunning = true
    generation++
    try {
      await update($, now, () => null)
      await update($, rewrite, () => null)
    } catch {
      // The row keeps the last `now` until the first tool call.
    }
    return started
  })

  // Each main-loop tool call is `now` from the moment it starts; a task-list
  // call that went through moves the fallback goal (TaskCreate's id is in its result).
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (e.agentId === undefined) {
      try {
        const text = nowOf(e.tool, input, cwd)
        const at = await $.clock.now()
        if (text) await update($, now, (): HereNow => ({ text, at }))
      } catch {
        // `now` is best effort: the call goes on whatever happens here.
      }
    }
    const ran = await next(e)
    if (e.agentId === undefined && LIST_TOOLS.has(e.tool) && ran.deny === undefined && !ran.isError) {
      try {
        await update($, goal, prev => listGoalOf(prev, e.tool, input, ran.result, lastPrompt))
      } catch {
        // The goal is best effort: the tool's result goes on whatever happens here.
      }
    }
    return ran
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The spinner's word, kept for the row until the turn's first tool call. Drawing
  // is pure: the word goes to the module (live.ts), never to $.state, and one
  // redraw is asked only when it changed, so the row picks it up. The tree is
  // the engine's, untouched.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    try {
      const word = e.surface === 'terminal' && typeof e.props.word === 'string' ? e.props.word.trim() : ''
      if (word && word !== live.spinnerWord) {
        live.spinnerWord = word
        if (live.isTurnRunning) $.ui.invalidate('ui.render')
      }
    } catch {
      // The spinner draws as the engine has it whatever happens here.
    }
    return next(e)
  })

  // A main-loop answer: its question lines are `you`; the spinner word goes with the turn.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    live.isTurnRunning = false
    live.spinnerWord = ''
    try {
      const answer = typeof e.answer === 'string' ? e.answer : ''
      const qs = questionsOf(answer)
      await update($, you, () => qs)
      await update($, rewrite, () => null)
      if (answer.trim() && rewriteOf(options.rewrite) === 'haiku' && isBandOn(await read($, band))) {
        const gen = generation
        const turnId = e.turnId
        // The call runs from a timer, never inside this hook.
        $.clock.after(REWRITE_DELAY_MS, () => {
          void runRewrite($, answer, turnId, gen).catch(() => {})
        })
      }
    } catch {
      // The row keeps what it had.
    }
    return done
  })

  // A prompt the person sends (not a slash command, not a hidden one) answers the questions: `you` is dropped.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.command && !e.isMeta && r.drop === undefined) {
        generation++
        lastPrompt = firstLineOf(e.text)
        await update($, you, () => [])
        await update($, rewrite, () => null)
      }
    } catch {
      // The questions stay until the next answer replaces them.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A /clear or an in-process resume puts another conversation in this process.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      live.isTurnRunning = false
      live.spinnerWord = ''
      generation++
      lastPrompt = ''
      try {
        await update($, now, () => null)
        await update($, you, () => [])
        await update($, rewrite, () => null)
        await update($, goal, () => null)
      } catch {
        // Nothing more to do.
      }
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'here' }, async ($, e) => {
    const [verb = ''] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    switch (verb) {
      case '': {
        const rw = rewriteOf(options.rewrite) === 'haiku' ? await read($, rewrite) : null
        const qs = (await read($, you)).map(q => q.slice(0, QUESTION_KEEP))
        const p = partsOf((await peerGoal($)).name, nowText(await read($, now)), qs, rw)
        return { text: summaryOf(p, isBandOn(await read($, band))) }
      }
      case 'on':
      case 'off': {
        await update($, band, () => verb)
        const note = await persist($, STORE_BAND, verb)
        return { text: `${verb === 'on' ? 'HERE row on.' : `HERE row off (/${COMMAND} still prints the three parts).`}${note}` }
      }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawRow($, e, () => next(e), options))
}
