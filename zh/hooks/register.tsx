// The zh mod: /zh translates an assistant reply of the main conversation into
// Simplified Chinese with one $.model.complete call (two for a reply over
// about 6,000 tokens, split at a paragraph boundary) and shows it in the `zh`
// pane (pane.tsx draws it). The last three translations stay in $.state
// (zh.items, with the index shown); nothing goes into the transcript. The call
// runs from a $.clock timer, never inside the command's or a press's hook.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, PluginOptions, Register } from 'claude-code'

import type { ZhItem, ZhModel } from '../types'
import {
  BUSY_TEXT,
  CALL_TIMEOUT_MS,
  COMMAND,
  KEEP,
  PANE,
  PANE_TITLE,
  RULES,
  USAGE,
  addUsage,
  costOf,
  emptyUsage,
  hashOf,
  inputOf,
  itemIdOf,
  locate,
  maxTokensFor,
  modelOf,
  parseArgs,
  piecesOf,
  reasonOf,
} from './kit'
import { drawPane } from './pane'

const items = atom({ plugin: 'zh', key: 'items' } as const, [])
const shown = atom({ plugin: 'zh', key: 'shown' } as const, 0)
const busy = atom({ plugin: 'zh', key: 'busy' } as const, null)

// One translation at a time. Set before any await, so a second /zh or press in
// the same moment sees it. A reload drops it with the environment.
let isRunning = false

/** What a request answers: the command's text, and whether a press should toast it (a refusal or a note). */
type Answer = { text: string; isNotice: boolean }

const notice = (text: string): Answer => ({ text, isNotice: true })

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The main conversation's assistant replies that carry text, the last first. */
async function repliesOf($: EngineInterface): Promise<string[]> {
  const all = await $.session.messages()
  const out: string[] = []
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]!
    if (m.role === 'assistant' && m.text.trim() !== '') out.push(m.text)
  }
  return out
}

/**
 * Re-places every kept translation in the conversation as it is now, so the
 * header names the right reply and prev/next start from it; answers the list.
 * The replies are read here unless given; failing that, the list stands.
 */
async function relabel($: EngineInterface, given?: string[]): Promise<ZhItem[]> {
  let replies: string[]
  try {
    replies = given ?? (await repliesOf($))
  } catch {
    return read($, items)
  }
  const hashes = replies.map(hashOf)
  const total = replies.length
  const place = (it: ZhItem): ZhItem => {
    const back = locate(hashes, it)
    return back === null || (back === it.back && it.total === total) ? it : { ...it, back, total }
  }
  const before = await read($, items)
  if (before.every(it => place(it) === it)) return before
  await update($, items, list => list.map(place))
  return read($, items)
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE)
  } catch {
    return false
  }
}

/** Opens (or retitles) the pane, without the keyboard: it is for reading. Answers a note when it waits undrawn. */
async function openPane($: EngineInterface): Promise<string> {
  const r = await $.ui.open({ id: PANE, title: PANE_TITLE })
  return r.isPlaced ? '' : ` (the pane waits undrawn: ${r.reason})`
}

/**
 * Shows the translation of the reply `back` replies back (1 = the last): the
 * kept one when this reply was translated with this model before, else a new
 * call, started from a timer, with the pane opened at once.
 */
async function show($: EngineInterface, options: PluginOptions, back: number): Promise<Answer> {
  if (isRunning) return notice(`A translation is running; wait for it (/${COMMAND} ${back}).`)
  isRunning = true
  let isStarted = false
  try {
    const replies = await repliesOf($)
    if (replies.length === 0) return notice('No assistant reply with text yet.')
    if (back > replies.length) {
      const n = replies.length
      return notice(`Only ${n} assistant ${n === 1 ? 'reply' : 'replies'} with text so far: /${COMMAND} 1 to /${COMMAND} ${n}.`)
    }
    const source = replies[back - 1]!
    const model = modelOf(options.model)
    const sourceHash = hashOf(source)
    const id = itemIdOf(sourceHash, model)
    const at = (await relabel($, replies)).findIndex(it => it.id === id)
    if (at >= 0) {
      const total = replies.length
      await update($, items, list => list.map((it, i) => (i === at ? { ...it, back, total } : it)))
      await update($, shown, () => at)
      const note = await openPane($)
      return { text: `Showing the kept translation of reply ${back} back (/${COMMAND} ${back}).${note}`, isNotice: false }
    }
    const wasOpen = await isPaneOpen($)
    await update($, busy, () => back)
    const note = await openPane($)
    $.ui.toast(BUSY_TEXT)
    $.clock.after(10, () => {
      void translateInto($, model, source, sourceHash, back, replies.length, wasOpen).catch(() => {})
    })
    isStarted = true
    return { text: `Translating reply ${back} back with ${model}; the pane shows it when done.${note}`, isNotice: false }
  } finally {
    if (!isStarted) {
      isRunning = false
      await update($, busy, () => null).catch(() => {})
    }
  }
}

/** A failed call: the reason as a toast, and the pane as it was (closed again when this request opened it). */
async function fail($: EngineInterface, why: string, back: number, wasOpen: boolean): Promise<void> {
  $.ui.toast(`Translation failed: ${why} (/${COMMAND} ${back} to try again)`)
  if (!wasOpen) await $.ui.close({ id: PANE }).catch(() => {})
}

/** The call(s), from a timer: the translation kept first and shown, or the failure toasted. */
async function translateInto(
  $: EngineInterface,
  model: ZhModel,
  source: string,
  sourceHash: string,
  back: number,
  total: number,
  wasOpen: boolean,
): Promise<void> {
  try {
    const t0 = await $.clock.now()
    const pieces = piecesOf(source)
    const results: ModelCompleteResult[] = await Promise.all(
      pieces.map(text =>
        $.model.complete({ model, system: RULES, prompt: text, maxTokens: maxTokensFor(text), timeoutMs: CALL_TIMEOUT_MS }),
      ),
    )
    const ms = (await $.clock.now()) - t0
    const failed = results.find(r => !r.isAnswered)
    if (failed) {
      await fail($, reasonOf(failed), back, wasOpen)
      return
    }
    const usage = results.reduce((u, r) => addUsage(u, r.usage), emptyUsage())
    const item: ZhItem = {
      id: itemIdOf(sourceHash, model),
      sourceHash,
      back,
      total,
      model,
      text: results.map(r => (r.isAnswered ? r.text.trim() : '')).join('\n\n'),
      ms,
      inputTokens: inputOf(usage),
      outputTokens: usage.output_tokens || 0,
      costUsd: costOf(model, usage),
      parts: pieces.length,
      at: await $.clock.now(),
    }
    await update($, items, list => [item, ...list.filter(it => it.id !== item.id)].slice(0, KEEP))
    await update($, shown, () => 0)
    // Replies that came while the call ran move this one (and the kept ones) back.
    const now = (await relabel($)).find(it => it.id === item.id)?.back ?? back
    // Closed by the person while the call ran: not opened again unasked.
    if (!(await isPaneOpen($))) $.ui.toast(`Translation of reply ${now} back is ready: /${COMMAND} ${now} shows it.`)
  } catch (err) {
    await fail($, whyOf(err), back, wasOpen)
  } finally {
    isRunning = false
    await update($, busy, () => null).catch(() => {})
  }
}

/** prev (+1, an older reply) or next (-1, a newer one) from the reply the pane shows. */
async function move($: EngineInterface, options: PluginOptions, step: 1 | -1): Promise<Answer> {
  // Where that reply sits now (the conversation may have grown since), by position, not by hash alone.
  const list = await relabel($)
  const it = list[await read($, shown)] ?? list[0]
  if (!it) return notice(`No translation yet: /${COMMAND} translates the last reply.`)
  const target = it.back + step
  if (target < 1) return notice(`Already the last reply (/${COMMAND} 1).`)
  return show($, options, target)
}

/** A press's work, from a timer (never inside the press); a refusal or note comes as a toast. */
function later($: EngineInterface, run: () => Promise<Answer>): void {
  $.clock.after(10, () => {
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
      name: 'zh',
      description: 'Translate the last assistant reply (or the n-th back) into Simplified Chinese in a pane; off closes it',
      argumentHint: '[n] | off',
    })
    // A reload while a call ran leaves no call behind it.
    await update($, busy, () => null).catch(() => {})
    return started
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'zh' }, async ($, e) => {
    const asked = parseArgs(e.args)
    switch (asked.kind) {
      case 'off':
        await $.ui.close({ id: PANE })
        return { text: 'Translation pane closed.' }
      case 'show':
        try {
          return { text: (await show($, options, asked.back)).text }
        } catch (err) {
          return { text: `/${COMMAND}: ${whyOf(err)}` }
        }
      default:
        return { text: USAGE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: 'zh' }, ($, e) =>
    drawPane($, e, {
      prev: () => later($, () => move($, options, 1)),
      next: () => later($, () => move($, options, -1)),
      close: () => later($, async () => {
        await $.ui.close({ id: PANE })
        return { text: '', isNotice: false }
      }),
    }),
  )
}
