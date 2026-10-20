// The images mod: the ▣ IMAGES row (row.tsx) draws a tile for each
// `[Image #n]` tag in the prompt box, the tag and the tile's size beneath, and
// drops it when the tag leaves the box. The box is followed through
// `prompt.edit` (typing and pastes: the box `next(e)` resolves) and
// `prompt.change` (history, clear, undo, a plugin's fill: the box as it
// stands); a sent prompt and a /clear empty the list. Tiles are placeholders:
// the engine hands a plugin no pasted image's bytes before the prompt is sent
// (`$.prompt.media` answers only a managed settings install, inside its
// `prompt.submit` hook), there is no image cache on disk, and the hooks
// environment has no zlib or DecompressionStream to inflate a PNG with.
// /images lists the tags; /images on|off shows or hides the tiles (kept in the
// store); the row's `hide` Button is /images off, run from a timer.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { COMMAND, DELAY_MS, STORE_BAND, USAGE, isBandOn, isSameTags, listText, parseArgs, tagsOf } from './kit'
import { drawRow } from './row'

const tags = atom({ plugin: 'images', key: 'tags' } as const, [])
const band = atom({ plugin: 'images', key: 'band' } as const, '')

// The tags last written, so a keystroke that leaves them as they were writes
// nothing; null when not known (a fresh module after a hot reload, which keeps
// the state; a session start; a failed write), when the next edit compares
// with the state itself, an empty list included.
let lastTags: number[] | null = null

const whyOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The box's tags written to the state when they changed; best effort. */
async function noteBox($: EngineInterface, text: string): Promise<void> {
  const now = tagsOf(text)
  const was = lastTags ?? (await read($, tags))
  lastTags = now
  if (isSameTags(now, was)) return
  try {
    await update($, tags, () => now)
  } catch {
    // The row keeps the last list; not known what the state holds, so the next change of the box writes again.
    lastTags = null
  }
}

/** Writes /images on|off to the store; the words to add to the reply when it could not be kept. */
async function persist($: EngineInterface, value: 'on' | 'off'): Promise<string> {
  try {
    await $.store.set(STORE_BAND, value)
    return ''
  } catch {
    return ' (not saved for the next session)'
  }
}

/** /images on|off and the hide button: the reply's line. */
async function setBand($: EngineInterface, value: 'on' | 'off'): Promise<string> {
  await update($, band, () => value)
  const note = await persist($, value)
  return value === 'on' ? `Image tiles on.${note}` : `Image tiles off: /${COMMAND} on shows them again.${note}`
}

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lastTags = null
    await $.command.register({
      name: 'images',
      description: 'IMAGES row: list the [Image #n] tags in the prompt box, or show (on) or hide (off) their tiles',
      argumentHint: 'on | off',
    })
    try {
      const stored = await $.store.get(STORE_BAND)
      await update($, band, () => (stored === 'on' || stored === 'off' ? stored : ''))
    } catch {
      // No store: the tiles are on.
    }
    return started
  })

  // Typing and pastes: the box the editor will show.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    try {
      if (box && typeof box.text === 'string') await noteBox($, box.text)
    } catch {
      // The tiles follow the next change.
    }
    return box
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // History, a clear (a sent prompt), an undo, a plugin's fill: the box as it stands.
  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    try {
      await noteBox($, typeof e.text === 'string' ? e.text : '')
    } catch {
      // The tiles follow the next change.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A prompt sent from the box takes its tags with it.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.origin?.kind === 'composer') await noteBox($, '')
    } catch {
      // The clear's prompt.change empties the list too.
    }
    return r
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // A /clear or an in-process resume puts another conversation in this process.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') {
      try {
        await noteBox($, '')
      } catch {
        // Nothing more to do.
      }
    }
    return result
  })

  // The command and its matcher are spelled literally, so the host reads it as answering its own command.
  on('command.run', { command: 'images' }, async ($, e) => {
    const asked = parseArgs(e.args)
    try {
      switch (asked.kind) {
        case 'list':
          return { text: listText(await read($, tags), isBandOn(await read($, band))) }
        case 'on':
        case 'off':
          return { text: await setBand($, asked.kind) }
        default:
          return { text: USAGE }
      }
    } catch (err) {
      return { text: `/${COMMAND}: ${whyOf(err)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) =>
    drawRow($, e, () => next(e), options, {
      // The press's work runs from a timer, never inside the press; the toast names the command twin.
      hide: () =>
        $.clock.after(DELAY_MS, () => {
          void setBand($, 'off')
            .then(text => $.ui.toast(text))
            .catch(err => $.ui.toast(`/${COMMAND} off: ${whyOf(err)}`))
        }),
    }),
  )
}
