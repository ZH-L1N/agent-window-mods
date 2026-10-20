import { expect, test } from 'claude-code/testing'

import {
  ALPHABET,
  CODEX_POOL,
  DONE_POOL,
  ERROR_POOL,
  HUB_POOL,
  POSES,
  RUNNING_POOL,
  SHELL_PALETTE,
  SHELL_POSE,
  SHELL_POSES,
  WAIT_POOL,
  boxOf,
  codexPose,
  donePose,
  errorPose,
  hubPose,
  mascotCells,
  mascotWidth,
  pixelsOf,
  runningPose,
  waitPose,
} from './mascots'
import type { PackPose, Pose, ShellPose } from './mascots'
import { decode } from './test-kit'

const UPPER = 0x2580
const LOWER = 0x2584
const SPACE = 0x20
const DEFAULT = 0x01000000

const PACK = Object.keys(POSES) as PackPose[]
const SHELLS = Object.keys(SHELL_POSES) as ShellPose[]
const ALL: Pose[] = [...PACK, ...SHELLS]
const rowsOf = (pose: Pose): readonly string[] => (Object.hasOwn(SHELL_POSES, pose) ? SHELL_POSES[pose as ShellPose] : POSES[pose as PackPose].rows)

/** The pools as the 0.4.0 brief lists them. */
const BRIEF = {
  running: [
    'repairing-with-tools',
    'writing-software-code',
    'building-colorful-blocks',
    'debugging-system-bugs',
    'reading-data-document',
    'thinking-in-code',
    'examining-green-globe',
    'lab-science-testing',
    'holding-ancient-scroll',
    'visualizing-tree-data',
    'managing-server-rack',
    'processing-logic-symbols',
    'planting-small-trees',
    'user-profile-settings',
  ],
  waiting: ['sleeping-soundly', 'thinking-pixel-bubble', 'in-constant-loop', 'it-depends-sign'],
  finished: [
    'with-success-checkmark',
    'success-achievement-milestone',
    'happy-pixel-celebrating',
    'rocket-launch-success',
    'api-success-pixel',
    'in-glowing-aura',
    'love-cloud-pixel',
  ],
  error: [
    'confusion-spiral-pixel',
    'dizzy-failed-state',
    'error-state-pixel',
    'failed-process-error',
    'system-error-alert',
    'marking-critical-error',
    'crying-sad-reaction',
    'angry-at-laptop',
    'broken-heart-sad',
    'disconnected-plug-pixel',
  ],
  hub: ['artboard-25cla', 'multi-window-workflow', 'developer-pair-programming-scene'],
}

test('mascots: the pools hold the poses the brief lists, every pack pose in exactly one pool, each a rectangle at most 30 wide', () => {
  expect([...RUNNING_POOL]).toEqual(BRIEF.running)
  expect([...WAIT_POOL]).toEqual(BRIEF.waiting)
  expect([...DONE_POOL]).toEqual(BRIEF.finished)
  expect([...ERROR_POOL]).toEqual(BRIEF.error)
  expect([...HUB_POOL]).toEqual(BRIEF.hub)
  const pooled = [...RUNNING_POOL, ...WAIT_POOL, ...DONE_POOL, ...ERROR_POOL, ...HUB_POOL]
  expect(new Set(pooled).size).toBe(pooled.length)
  expect([...PACK].sort()).toEqual([...pooled].sort())
  expect(PACK.length).toBe(38)
  for (const pose of ALL) {
    const { w, h } = pixelsOf(pose)
    expect(h).toBeGreaterThan(0)
    expect(w).toBeLessThanOrEqual(30)
    for (const row of rowsOf(pose)) expect(row.length).toBe(w)
  }
  expect(mascotWidth()).toBe(Math.max(...ALL.map(p => pixelsOf(p).w)))
  expect(mascotWidth()).toBeLessThanOrEqual(30)
})

test('mascots: a pack pose uses palette letters only, each naming a colour of its own palette, and every colour is drawn', () => {
  for (const pose of PACK) {
    const { palette, rows } = POSES[pose]
    expect(palette.length).toBeGreaterThan(0)
    expect(palette.length).toBeLessThanOrEqual(ALPHABET.length)
    for (const c of palette) {
      expect(Number.isInteger(c)).toBe(true)
      expect(c >= 0 && c <= 0xffffff).toBe(true)
    }
    const used = new Set<number>()
    for (const row of rows) {
      for (const ch of row) {
        if (ch === '.') continue
        const i = ALPHABET.indexOf(ch)
        expect(i >= 0 && i < palette.length).toBe(true)
        used.add(i)
      }
    }
    expect(used.size).toBe(palette.length)
  }
})

test('mascots: our shell candidates and codex fuzzies, C for shells and a hashed fuzzy for codex, in palette letters only', () => {
  expect([...SHELLS].sort()).toEqual(['codex-blue-cap', 'codex-hex-badge', 'fuzzy-blue-beret', 'fuzzy-green-square', 'fuzzy-pink-headphones', 'fuzzy-purple-heart', 'fuzzy-yellow-triangle', 'shell-terminal-face', 'shell-window'])
  expect(SHELL_POSE).toBe('shell-window')
  expect(CODEX_POOL.length).toBe(5)
  expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(codexPose)).size).toBeGreaterThan(1)
  expect(codexPose('x')).toBe(codexPose('x'))
  for (const pose of SHELLS) {
    expect(pixelsOf(pose).w).toBe(20)
    for (const row of SHELL_POSES[pose]) for (const ch of row) if (ch !== '.') expect(Object.hasOwn(SHELL_PALETTE, ch)).toBe(true)
  }
  // The blue beret fuzzy's blue is drawn: some pixel is 0x3d9bff.
  const cells = decode(mascotCells('fuzzy-blue-beret'))
  expect([...cells].includes(0x3d9bff)).toBe(true)
})

test('mascots: every pose decodes to its box, in ▀ ▄ and spaces, in its own palette colours, never the default foreground', () => {
  for (const pose of ALL) {
    const { w, h } = pixelsOf(pose)
    const box = boxOf(pose)
    expect(box).toEqual({ columns: w, rows: Math.ceil((h + 1) / 2) })
    const cells = decode(mascotCells(pose))
    expect(cells.length).toBe(box.columns * box.rows * 3)
    const colours = new Set<number>(Object.hasOwn(POSES, pose) ? POSES[pose as PackPose].palette : Object.values(SHELL_PALETTE))
    let drawn = 0
    for (let i = 0; i < cells.length; i += 3) {
      const [glyph, fg, bg] = [cells[i], cells[i + 1], cells[i + 2]]
      expect([UPPER, LOWER, SPACE]).toContain(glyph)
      expect(fg).not.toBe(DEFAULT)
      if (glyph === SPACE) expect(bg).toBe(DEFAULT)
      if (glyph === LOWER) expect(bg).toBe(DEFAULT)
      if (glyph !== SPACE) {
        drawn++
        expect(colours.has(fg ?? -1)).toBe(true)
        if (glyph === UPPER && bg !== DEFAULT) expect(colours.has(bg ?? -1)).toBe(true)
      }
    }
    expect(drawn).toBeGreaterThan(0)
  }
})

// The pixel at (x, y) of a decoded mascot, or null where empty.
const pixelAt = (cells: Uint32Array, columns: number, x: number, y: number): number | null => {
  const i = (Math.floor(y / 2) * columns + x) * 3
  const glyph = cells[i]
  const isTop = y % 2 === 0
  if (glyph === UPPER) return isTop ? (cells[i + 1] ?? null) : cells[i + 2] === DEFAULT ? null : (cells[i + 2] ?? null)
  if (glyph === LOWER) return isTop ? null : (cells[i + 1] ?? null)
  return null
}

test('mascots: the bob shifts the pose down one pixel row', () => {
  for (const pose of ALL) {
    const { w, h } = pixelsOf(pose)
    const still = decode(mascotCells(pose))
    const bobbed = decode(mascotCells(pose, { isBobbed: true }))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(pixelAt(bobbed, w, x, y + 1)).toBe(pixelAt(still, w, x, y))
    }
    for (let x = 0; x < w; x++) expect(pixelAt(bobbed, w, x, 0)).toBeNull()
  }
})

test('mascots: the tint blends every pixel halfway toward amber', () => {
  for (const pose of [errorPose('a1'), errorPose('a2'), errorPose('a3')]) {
    const { w, h } = pixelsOf(pose)
    const plain = decode(mascotCells(pose))
    const tinted = decode(mascotCells(pose, { tint: 0xf59e0b }))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = pixelAt(plain, w, x, y)
        const t = pixelAt(tinted, w, x, y)
        if (c === null) expect(t).toBeNull()
        else {
          const half = (s: number, a: number) => Math.round(((c >> s) & 0xff) * 0.5 + a * 0.5)
          expect(t).toBe((half(16, 0xf5) << 16) | (half(8, 0x9e) << 8) | half(0, 0x0b))
        }
      }
    }
  }
})

test('mascots: each state picks from its pool by the run id: stable for one id, spread across ids', () => {
  const pools: [(id: string) => Pose, readonly Pose[], number][] = [
    [runningPose, RUNNING_POOL, 8],
    [waitPose, WAIT_POOL, 3],
    [donePose, DONE_POOL, 5],
    [errorPose, ERROR_POOL, 6],
    [hubPose, HUB_POOL, 2],
  ]
  const ids = Array.from({ length: 80 }, (_, i) => `agent-${i}`)
  for (const [pick, pool, spread] of pools) {
    expect(pick('a1')).toBe(pick('a1'))
    for (const id of ids) expect(pool).toContain(pick(id))
    expect(new Set(ids.map(pick)).size).toBeGreaterThanOrEqual(spread)
  }
  // Two runs that finish together seldom look the same: of the ten first ids, several finish in different poses.
  expect(new Set(Array.from({ length: 10 }, (_, i) => donePose(`a${i + 1}`))).size).toBeGreaterThan(2)
})
