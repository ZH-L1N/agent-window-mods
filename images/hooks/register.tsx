// The images mod: after a prompt is sent, the ▣ IMAGES row (row.tsx) draws
// each pasted `[Image #n]` as a half-block thumbnail. `prompt.submit` notes
// the sent prompt's tags (before `next`, since the main loop's `turn.start`
// runs inside it); the next main-loop `turn.start` starts the pipeline
// (pipeline.ts) from a $.clock timer, one image after another, each tile
// written to $.state `images.tiles` (at most 6, newest last) as it is built.
// The next prompt clears the row (option linger: turn, 2min or
// until-cleared). /img shows the last tiles again, /img <n> draws one image of
// this session, /img off|on (kept in the store) and /img clear; the row's
// `clear` Button is /img clear, run from a timer.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, PromptSubmitInput, Register, Timer } from 'claude-code'

import type { ImageTile } from '../types'
import { COMMAND, DELAY_MS, LINGER_MS, STORE_BAND, USAGE, captionOf, isAutoOn, lingerOf, parseArgs, sizeOf, tagText, tagsOf, withTile } from './kit'
import { buildTile, pipelineOf } from './pipeline'
import { drawRow } from './row'

const tiles = atom({ plugin: 'images', key: 'tiles' } as const, [])
const shown = atom({ plugin: 'images', key: 'shown' } as const, false)
const band = atom({ plugin: 'images', key: 'band' } as const, '')

// The tags of the last sent prompt, waiting for its main-loop turn.start.
let pending: number[] = []
// Bumped by every sent prompt, new batch, /img off, /img clear and session change: a run
// that started under an older value stops and writes nothing.
let generation = 0
// linger=2min: the timer that clears the row.
let lingerTimer: Timer | null = null

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const stopLinger = () => {
  lingerTimer?.cancel()
  lingerTimer = null
}

/** The row hides; the tiles stay for /img. */
async function hide($: EngineInterface): Promise<void> {
  stopLinger()
  await update($, shown, () => false)
}

/** The row shows; with linger=2min it clears two minutes later. */
async function show($: EngineInterface, options: PluginOptions): Promise<void> {
  stopLinger()
  await update($, shown, () => true)
  if (lingerOf(options.linger) === '2min') {
    lingerTimer = $.clock.after(LINGER_MS, () => {
      lingerTimer = null
      void update($, shown, () => false).catch(() => {})
    })
  }
}

/** A built tile into the state: a hidden row's tiles are replaced, a shown row's added to (at most 6, newest last). */
async function addTile($: EngineInterface, tile: ImageTile, options: PluginOptions): Promise<void> {
  const isShown = await read($, shown)
  await update($, tiles, list => (isShown ? withTile(list, tile) : [tile]))
  if (!isShown) await show($, options)
}

/** A sent prompt's images, one after another; stops when a newer prompt, batch or clear comes. */
async function runBatch($: EngineInterface, list: readonly number[], options: PluginOptions): Promise<void> {
  const mine = ++generation
  const p = await pipelineOf($, () => mine === generation)
  for (const n of list) {
    const tile = await buildTile($, n, sizeOf(options.size), p)
    if (tile === null || mine !== generation) return
    await addTile($, tile, options)
  }
}

/** /img <n>: that image of this session; a toast when only its tag could be drawn. */
async function runOne($: EngineInterface, n: number, options: PluginOptions): Promise<void> {
  const mine = generation
  const p = await pipelineOf($, () => mine === generation)
  const tile = await buildTile($, n, sizeOf(options.size), p)
  if (tile === null || mine !== generation) return
  await addTile($, tile, options)
  if (!tile.cells) await $.ui.toast(`${tagText(n)}: no thumbnail (not in this session's images folder, or no sips) (/${COMMAND} ${n})`)
}

/** /img clear and the clear button: no tiles, no row, any run stopped. */
async function clearAll($: EngineInterface): Promise<void> {
  generation++
  pending = []
  stopLinger()
  await update($, tiles, () => [])
  await update($, shown, () => false)
}

/** Writes /img on|off to the store; the words to add to the reply when it could not be kept. */
async function persist($: EngineInterface, value: 'on' | 'off'): Promise<string> {
  try {
    await $.store.set(STORE_BAND, value)
    return ''
  } catch {
    return ' (not saved for the next session)'
  }
}

/** A prompt the person sent: typed or from the bridge, not a slash command, not one they do not see. */
const isPersonPrompt = (e: PromptSubmitInput): boolean =>
  !e.command && !e.isMeta && (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge')

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    pending = []
    generation++
    stopLinger()
    await $.command.register({
      name: 'img',
      description: 'IMAGES row: show the last image tiles again, draw [Image #n] of this session, turn the automatic tiles on or off, or clear them',
      argumentHint: '<n> | on | off | clear',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the auto option applies.
    }
    return started
  })

  // A sent prompt clears the row (unless linger=until-cleared) and leaves its
  // tags for its turn. Done before next: the main loop's turn.start runs inside it.
  on('prompt.submit', async ($, e, next) => {
    let mine: number[] = []
    try {
      if (isPersonPrompt(e)) {
        generation++
        pending = []
        if (lingerOf(options.linger) !== 'until-cleared') await hide($)
        if (isAutoOn(await read($, band), options.auto)) mine = tagsOf(e.text)
        pending = mine
      }
    } catch {
      // The row keeps what it shows; the next prompt tries again.
    }
    const r = await next(e)
    try {
      if (pending === mine && mine.length > 0) {
        if (r.drop !== undefined) {
          pending = []
        } else if (e.turnId !== undefined) {
          // Typed over a running turn: no turn.start of its own may come soon, so the run starts now.
          pending = []
          $.clock.after(DELAY_MS, () => {
            void runBatch($, mine, options).catch(() => {})
          })
        }
      }
    } catch {
      // The tags wait for the next turn.start.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // The main loop's turn: the sent prompt's images, from a timer.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    try {
      if (e.agentId === undefined && pending.length > 0) {
        const list = pending
        pending = []
        $.clock.after(DELAY_MS, () => {
          void runBatch($, list, options).catch(() => {})
        })
      }
    } catch {
      // Nothing drawn for this prompt; /img <n> draws one.
    }
    return started
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A /clear or an in-process resume puts another conversation in this process.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      try {
        await clearAll($)
      } catch {
        // Nothing more to do.
      }
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'img' }, async ($, e) => {
    const asked = parseArgs(e.args)
    try {
      switch (asked.kind) {
        case 'show': {
          const list = await read($, tiles)
          if (list.length === 0) return { text: `No image tiles yet: send a prompt with a pasted image, or /${COMMAND} <n> for [Image #n] of this session.` }
          await show($, options)
          return { text: `Showing ${list.map(captionOf).join(', ')}.` }
        }
        case 'draw': {
          const n = asked.n
          $.clock.after(DELAY_MS, () => {
            void runOne($, n, options).catch(err => $.ui.toast(`/${COMMAND} ${n}: ${whyOf(err)}`))
          })
          return { text: `Drawing ${tagText(n)} of this session above the prompt.` }
        }
        case 'on': {
          await update($, band, () => 'on')
          return { text: `Image tiles on: a sent prompt's images are drawn above the prompt.${await persist($, 'on')}` }
        }
        case 'off': {
          await update($, band, () => 'off')
          // A run in flight stops before its next tile, so the row stays hidden.
          generation++
          pending = []
          await hide($)
          return { text: `Image tiles off: /${COMMAND} on turns them on again; /${COMMAND} <n> still draws one.${await persist($, 'off')}` }
        }
        case 'clear':
          await clearAll($)
          return { text: 'Image tiles cleared.' }
        default:
          return { text: USAGE }
      }
    } catch (err) {
      return { text: `/${COMMAND}: ${whyOf(err)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) =>
    drawRow($, e, () => next(e), {
      // The press's work runs from a timer, never inside the press; the toast names the command twin.
      clear: () =>
        $.clock.after(DELAY_MS, () => {
          void clearAll($)
            .then(() => $.ui.toast(`Image tiles cleared (/${COMMAND} clear).`))
            .catch(err => $.ui.toast(`/${COMMAND} clear: ${whyOf(err)}`))
        }),
    }),
  )
}
