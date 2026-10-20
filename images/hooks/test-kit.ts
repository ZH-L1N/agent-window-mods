// Shared setup for the images mod's tests (imported by *.test.ts files only).
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fromBase64, toBase64 } from './kit'

export const PLUGIN = 'images'
export const T0 = Date.parse('2026-10-20T12:00:00Z')
export const HOME = '/Users/me'
export const CWD = '/Users/me/repo'
export const SESSION = 'sess-1'
export const IMAGES = `/private/tmp/claude-501/-Users-me-repo/${SESSION}/images`
export const CACHE = `${HOME}/.cache/zehui-mods/images`

/** One pixel's red, green and blue. */
export type Rgb = readonly [number, number, number]

/**
 * A BMP as a writer would make it: 24 bits (BI_RGB, 40-byte header) or 32 bits
 * (BI_BITFIELDS with BGRA masks, a 124-byte V5 header, the pixels at 138 as
 * sips writes them), bottom-up or top-down, rows padded to 4 bytes.
 */
export function makeBmp(width: number, height: number, bpp: 24 | 32, isTopDown: boolean, pixel: (x: number, y: number) => Rgb): Uint8Array {
  const header = bpp === 32 ? 124 : 40
  const offset = 14 + header
  const stride = Math.floor((bpp * width + 31) / 32) * 4
  const size = offset + stride * height
  const bytes = new Uint8Array(size)
  const v = new DataView(bytes.buffer)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  v.setUint32(2, size, true)
  v.setUint32(10, offset, true)
  v.setUint32(14, header, true)
  v.setInt32(18, width, true)
  v.setInt32(22, isTopDown ? -height : height, true)
  v.setUint16(26, 1, true)
  v.setUint16(28, bpp, true)
  v.setUint32(30, bpp === 32 ? 3 : 0, true)
  v.setUint32(34, stride * height, true)
  if (bpp === 32) {
    v.setUint32(54, 0x00ff0000, true)
    v.setUint32(58, 0x0000ff00, true)
    v.setUint32(62, 0x000000ff, true)
    v.setUint32(66, 0xff000000, true)
  }
  for (let y = 0; y < height; y++) {
    const fileRow = isTopDown ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const at = offset + fileRow * stride + x * (bpp / 8)
      bytes[at] = b
      bytes[at + 1] = g
      bytes[at + 2] = r
      if (bpp === 32) bytes[at + 3] = 255
    }
  }
  return bytes
}

/** A Raster's cells as [codePoint, fg, bg] triplets. */
export function decodeCells(cells: string): [number, number, number][] {
  const bytes = fromBase64(cells)
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  const out: [number, number, number][] = []
  for (let i = 0; i < words.length; i += 3) out.push([words[i]!, words[i + 1]!, words[i + 2]!])
  return out
}

/** The BMP sips "writes" by default: 48 by 24 pixels, red on top, blue below (a 2:1 image). */
export const DEFAULT_BMP = makeBmp(48, 24, 32, true, (_x, y) => (y < 12 ? [255, 0, 0] : [0, 0, 255]))

export type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  store: Map<string, unknown>
  /** The fake disk: text or bytes by path. */
  files: Map<string, string | Uint8Array>
  /** Every argv $.process.run was called with, and its init. */
  runs: string[][]
  inits: unknown[]
  /** How many times `$.fs.exists` was asked. */
  existsCalls: () => number
  state: (key: string) => unknown
  start: () => Promise<void>
  /** The engine writes `[Image #n]`'s PNG to the session's images folder, now or `afterMs` later on the clock. */
  paste: (n: number, afterMs?: number) => void
  /** A prompt sent from the box (or `origin`), then (unless `isTurn` is false) the main loop's turn starts. */
  send: (text: string, opts?: { origin?: string; isTurn?: boolean; command?: { name: string; args: string }; turnId?: string }) => Promise<void>
  /** A turn starts: the main loop's, or a subagent's with `agentId`. */
  turn: (agentId?: string) => Promise<void>
  sessionEnd: (reason: string) => Promise<void>
  command: (args: string) => Promise<string>
  /** Moves the clock on far enough for a run whose files are all there. */
  settle: () => Promise<void>
}

export type WorldShape = {
  /** Beneath the row, the engine's own placeholder instead of another mod's Text. */
  isEngineBeneath?: boolean
  /** Beneath the band, a column of zehui-mods rows keyed as listed, then another mod's band keyed `other-band`. */
  stackBeneath?: string[]
  stored?: Record<string, unknown>
  /** The session's directory; CWD by default. */
  cwd?: string
  /** What /private/tmp lists; claude-501 among others by default. */
  tmp?: { name: string; kind: 'file' | 'dir' | 'other' }[]
  /** sips is missing: every run fails as a missing command does. */
  isNoSips?: boolean
  /** The BMP sips writes for a PNG, by n; DEFAULT_BMP otherwise. */
  bmps?: Record<number, Uint8Array>
  /** What `sips -g` answers for the PNG's own size; 1376 by 688 by default. */
  pngSize?: { w: number; h: number }
  /** HOME unset. */
  isNoHome?: boolean
  /** sips writes part of the BMP, then exits 1 (`exit`) or is still running at its time limit (`timeout`). */
  sipsBreaks?: 'exit' | 'timeout'
  /** Every PNG is a symbolic link to a file elsewhere. */
  isPngLinked?: boolean
}

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = (code = 1) => ({ exitCode: code, stdout: '', stderr: 'mock: no answer', isStdoutTruncated: false, isStderrTruncated: false })

/**
 * The world beneath the plugin: a mocked clock, store, environment and disk,
 * sips that writes the BMP the shape names for a PNG that is there, toasts,
 * and another mod's band beneath (a Text `beneath`). No command runs for real.
 */
export async function world($: Engine, on: On, shape: WorldShape = {}): Promise<World> {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, shape.isNoHome ? {} : { HOME })
  const toasts: string[] = []
  const latest = new Map<string, unknown>()
  const store = new Map<string, unknown>(Object.entries(shape.stored ?? {}))
  const files = new Map<string, string | Uint8Array>()
  const runs: string[][] = []
  const inits: unknown[] = []
  const cwd = shape.cwd ?? CWD
  const sessionDir = `/private/tmp/claude-501/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${SESSION}`
  const imagesDir = `${sessionDir}/images`
  // The engine makes the session's folder when it starts.
  files.set(`${sessionDir}/scratchpad/.keep`, '')
  const tmp = shape.tmp ?? [
    { name: 'cc-socks', kind: 'dir' as const },
    { name: 'claude-501', kind: 'dir' as const },
    { name: 'claude-notes.txt', kind: 'file' as const },
  ]
  let existsCalls = 0
  let turns = 0

  on('state.set', async (_$, e, next) => {
    const w = e as { plugin?: string; key?: string; value?: unknown }
    const done = await next(e)
    if (w.plugin === PLUGIN && w.key && (done as { isSet?: boolean }).isSet !== false) latest.set(w.key, w.value)
    return done
  })
  on('store.get', (_$, e) => ({ value: store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const s = e as { key: string; value: unknown }
    store.set(s.key, s.value)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', async () => ({ value: {} }) as never)
  on('session.id', () => ({ value: SESSION }) as never)
  on('session.cwd', () => ({ value: cwd }) as never)
  on('fs.list', (_$, e) => {
    const path = (e as { path: string }).path
    return (path === '/private/tmp' ? { value: tmp.map(t => ({ ...t, size: 0, mtimeMs: 0, isLink: false })) } : { deny: 'ENOENT' }) as never
  })
  // A path exists as a file, or as a folder when a file is beneath it.
  const isThere = (path: string) => files.has(path) || [...files.keys()].some(k => k.startsWith(`${path}/`))
  on('fs.exists', (_$, e) => {
    existsCalls++
    return { value: isThere((e as { path: string }).path) } as never
  })
  on('fs.stat', (_$, e) => {
    const r = e as { path: string; resolve: boolean }
    if (!isThere(r.path)) return { deny: 'ENOENT' } as never
    const isLinked = shape.isPngLinked === true && r.path.endsWith('.png')
    const kind = files.has(r.path) ? 'file' : 'dir'
    const realPath = isLinked ? '/Users/me/secret.png' : r.path
    return { value: { kind, size: 0, mtimeMs: 0, isLink: isLinked, ...(r.resolve ? { realPath } : {}) } } as never
  })
  on('fs.read', (_$, e) => {
    const r = e as { path: string; as: string }
    const f = files.get(r.path)
    if (f === undefined) return { deny: 'ENOENT' } as never
    if (r.as === 'bytes') return { value: { base64: toBase64(typeof f === 'string' ? new TextEncoder().encode(f) : f) } } as never
    return { value: typeof f === 'string' ? f : new TextDecoder().decode(f) } as never
  })
  on('fs.write', (_$, e) => {
    const w = e as { path: string; text: string }
    files.set(w.path, w.text)
    return { value: undefined } as never
  })
  on('process.run', async (_$, e) => {
    const w = e as { argv: string[]; init?: unknown }
    runs.push([...w.argv])
    inits.push(w.init)
    if (w.argv[0] !== 'sips') return { value: fail() } as never
    if (shape.isNoSips) return { value: fail(127) } as never
    if (w.argv[1] === '-g') {
      const png = w.argv[5]!
      const size = shape.pngSize ?? { w: 1376, h: 688 }
      return { value: files.has(png) ? ok(`${png}\n  pixelWidth: ${size.w}\n  pixelHeight: ${size.h}\n`) : fail() } as never
    }
    const png = w.argv[6]!
    const bmp = w.argv[8]!
    if (!files.has(png)) return { value: fail() } as never
    if (shape.sipsBreaks) {
      files.set(bmp, DEFAULT_BMP.slice(0, 20))
      return (shape.sipsBreaks === 'exit' ? { value: fail() } : { deny: 'still running' }) as never
    }
    const n = Number(/(\d+)\.png$/.exec(png)?.[1])
    files.set(bmp, shape.bmps?.[n] ?? DEFAULT_BMP)
    return { value: ok(`${png}\n  ${bmp}\n`) } as never
  })
  on('ui.render', async ($$, e) => {
    if ((e as { component?: string }).component === 'AbovePrompt') {
      if (shape.isEngineBeneath) return { type: 'engine', ref: 0 } as never
      if (shape.stackBeneath) return stackTree(shape.stackBeneath) as never
    }
    const { Text } = $$.ui.resolve(e as never) as unknown as { Text: (p: { key: string; children: string }) => never }
    return Text({ key: 'beneath', children: 'beneath' })
  })
  on('session.start', async () => ({ cwd }) as never)
  on('session.end', async (_$, e) => ({ sessionId: (e as { sessionId: string }).sessionId }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('turn.start', async (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)

  const turn = async (agentId?: string) => {
    turns++
    await $.turn.start({ text: '', turnId: `t${turns}`, ...(agentId !== undefined ? { agentId } : {}) } as never)
  }

  return {
    clock,
    toasts,
    store,
    files,
    runs,
    inits,
    existsCalls: () => existsCalls,
    state: key => latest.get(key),
    start: async () => {
      await $.session.start({ cwd, surface: 'terminal', isInteractive: true } as never)
    },
    paste: (n, afterMs = 0) => {
      const put = () => files.set(`${imagesDir}/${n}.png`, 'png')
      if (afterMs <= 0) put()
      else void clock.sleep(afterMs).then(put)
    },
    send: async (text, opts = {}) => {
      await $.prompt.submit({
        text,
        wait: false,
        origin: { kind: opts.origin ?? 'composer' },
        ...(opts.command ? { command: opts.command } : {}),
        ...(opts.turnId ? { turnId: opts.turnId } : {}),
      } as never)
      if (opts.isTurn !== false) await turn()
    },
    turn,
    sessionEnd: async reason => {
      await $.session.end({ sessionId: SESSION, reason } as never)
    },
    command: async args => ((await $.command.run({ command: 'img', args } as never)) as { text?: string }).text ?? '',
    settle: async () => {
      await clock.advance(50)
    },
  }
}

/** The band's props at `bodyColumns` and `maxRows`. */
export const bandProps = (bodyColumns = 160, hasSurvey = false, maxRows = 40) =>
  ({ hasSurvey, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} }) as never

export type MountOpts = { hasSurvey?: boolean; maxRows?: number; surface?: 'terminal' | 'desktop' }

export const mountRow = ($: Engine, cols = 160, opts: MountOpts = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: opts.surface ?? 'terminal', component: 'AbovePrompt', props: bandProps(cols, opts.hasSurvey, opts.maxRows) })

/** What the row shows: each Raster's key, columns and rows, the captions, the `+n more` note ('' when absent); null when the row is hidden. */
export async function rowView(
  $: Engine,
  cols = 160,
  opts: MountOpts = {},
): Promise<{ tiles: { key: string; columns: number; rows: number }[]; captions: string[]; more: string } | null> {
  const ui = await mountRow($, cols, opts)
  const drawn = await ui.find({ key: 'images-chip' })
  if (!drawn) {
    await ui.unmount()
    return null
  }
  const tiles = (await ui.findAll({ type: 'Raster' })).map(r => {
    const p = (r.props ?? {}) as { key?: string; columns?: number; rows?: number }
    return { key: p.key ?? String((r as { key?: unknown }).key ?? ''), columns: p.columns ?? 0, rows: p.rows ?? 0 }
  })
  const captions = (await ui.findAll({ type: 'Text', text: /^\[Image #/ })).map(t => t.text)
  const more = (await ui.find({ type: 'Text', text: /^\+\d+ more$/ }))?.text ?? ''
  await ui.unmount()
  return { tiles, captions, more }
}

/** A lower band tree for the stack-order test: zm rows as listed, then a non-zm Box. */
export const stackTree = (keys: readonly string[]) => ({
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [
    ...keys.map(key => ({ type: 'Box', props: { key }, children: [{ type: 'Text', props: {}, children: [key] }] })),
    { type: 'Box', props: { key: 'other-band' }, children: [{ type: 'Text', props: {}, children: ['beneath'] }] },
  ],
})

/** The keys of a drawn tree's direct children, in order. */
export const childKeys = (tree: unknown): string[] =>
  (((tree as { children?: unknown[] }).children ?? []) as { props?: { key?: string } }[]).map(c => c.props?.key ?? '')
