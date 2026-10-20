// Pixel art from the "Claude Mascot Pack" by getillustrations.com
// (https://getillustrations.com/illustration-pack/claude-mascot-pack),
// "Commercial and personal use license", pack downloaded 2026-10-19; the pack
// itself is not redistributed, only the pixels of the poses used (POSES).
//
// The grey shell and codex mascots (SHELL_POSES, at the end) are not from the
// pack: drawn by Zehui/Claude 2026-10-19 in the pack's proportions.
//
// Each pose is drawn as a half-block Raster: one column per pixel, one row per
// two pixels (top pixel the foreground of ▀, bottom pixel its background).
//
// Every state has a pool of poses (0.4.0): a run keeps the pose its id hashes
// to for as long as it stays in that state, so a card never changes pose
// within a state, and two runs that finish together seldom look the same.

/** Raster colour for the terminal's default (bit 24 alone). */
const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const SPACE = 0x20
// An empty cell still names a colour for its glyph, never the terminal's default foreground.
const BLANK_FG = 0x000000

/** The characters a pack pose's rows use, each the index of a colour in that pose's palette. */
export const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A pose from the pack. */
export type PackPose = keyof typeof POSES
/** A shell or codex mascot of our own. */
export type ShellPose = keyof typeof SHELL_POSES
export type Pose = PackPose | ShellPose

/** Running poses. */
export const RUNNING_POOL: readonly PackPose[] = [
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
]
/** A run waiting on a tool's result (or the person) for a while. */
export const WAIT_POOL: readonly PackPose[] = ['sleeping-soundly', 'thinking-pixel-bubble', 'in-constant-loop', 'it-depends-sign']
/** A finished run. */
export const DONE_POOL: readonly PackPose[] = [
  'with-success-checkmark',
  'success-achievement-milestone',
  'happy-pixel-celebrating',
  'rocket-launch-success',
  'api-success-pixel',
  'in-glowing-aura',
  'love-cloud-pixel',
]
/** A run that ended in an error. */
export const ERROR_POOL: readonly PackPose[] = [
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
]
/** The main loop's card, while two or more subagents run. */
export const HUB_POOL: readonly PackPose[] = ['artboard-25cla', 'multi-window-workflow', 'developer-pair-programming-scene']

/**
 * The background shell's card mascot: candidate C (`shell-window`), Zehui's
 * pick on 2026-10-19; A (`shell-terminal-face`) is the other choice.
 */
export const SHELL_POSE: ShellPose = 'shell-window'
/**
 * A shell running a coding agent's CLI (codex, opencode, claude -p) shows one
 * of the five Codex fuzzies, chosen by a hash of the run id (see codexPose);
 * `codex-blue-cap` and `codex-hex-badge` are the earlier grey-bot candidates.
 */
export const CODEX_POOL: readonly ShellPose[] = [
  'fuzzy-pink-headphones',
  'fuzzy-blue-beret',
  'fuzzy-yellow-triangle',
  'fuzzy-green-square',
  'fuzzy-purple-heart',
]
export const CODEX_POSE: ShellPose = CODEX_POOL[0] ?? 'fuzzy-blue-beret'

const isShellPose = (pose: Pose): pose is ShellPose => Object.hasOwn(SHELL_POSES, pose)

const poseRows = (pose: Pose): readonly string[] => (isShellPose(pose) ? SHELL_POSES[pose] : POSES[pose].rows)

/** A row character's colour in `pose`, or undefined for none. */
const colourOf = (pose: Pose, ch: string): number | undefined => {
  if (isShellPose(pose)) return Object.hasOwn(SHELL_PALETTE, ch) ? SHELL_PALETTE[ch] : undefined
  const palette: readonly number[] = POSES[pose].palette
  const i = ALPHABET.indexOf(ch)
  return i >= 0 ? palette[i] : undefined
}

/** A pose's pixel width and height. */
export const pixelsOf = (pose: Pose): { w: number; h: number } => {
  const rows = poseRows(pose)
  return { w: rows[0]?.length ?? 0, h: rows.length }
}

/**
 * The Raster box a pose takes: one column per pixel, and rows for its height
 * plus the one-pixel bob, so a bobbing mascot never changes its card's height.
 * The card is as tall as its pose (or its text, when that is taller).
 */
export const boxOf = (pose: Pose): { columns: number; rows: number } => {
  const { w, h } = pixelsOf(pose)
  return { columns: w, rows: Math.ceil((h + 1) / 2) }
}

/**
 * The widest pose: the mascot column of every card, so the cards' text lines up.
 * A function, since the pixel data is declared below the code.
 */
export const mascotWidth = (): number =>
  Math.max(...([...Object.keys(POSES), ...Object.keys(SHELL_POSES)] as Pose[]).map(p => pixelsOf(p).w))

/** FNV-1a of a run id, for stable picks. */
const hashOf = (id: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable pick from `pool` for an id. */
const pickOf = <P extends Pose>(pool: readonly P[], id: string, fallback: P): P => pool[hashOf(id) % pool.length] ?? fallback

/** A stable pick from the running pool for a run id. */
export const runningPose = (id: string): Pose => pickOf(RUNNING_POOL, id, 'thinking-in-code')

/** A stable pick from the waiting pool for a run id. */
export const waitPose = (id: string): Pose => pickOf(WAIT_POOL, id, 'sleeping-soundly')

/** A stable pick from the finished pool for a run id. */
export const donePose = (id: string): Pose => pickOf(DONE_POOL, id, 'with-success-checkmark')

/** A stable pick from the error pool for a run id. */
export const errorPose = (id: string): Pose => pickOf(ERROR_POOL, id, 'confusion-spiral-pixel')

/** The main loop's pose: a stable pick from the hub pool for the session's id (or its main turn's). */
export const hubPose = (id: string): Pose => pickOf(HUB_POOL, id, 'artboard-25cla')

/** A stable pick from the codex fuzzies for a shell's run id. */
export const codexPose = (id: string): ShellPose => pickOf(CODEX_POOL, id, CODEX_POSE)

/** Blends a colour toward `tint` by `k` (0..1). */
const blend = (c: number, tint: number, k: number): number => {
  const mix = (shift: number) => Math.round(((c >> shift) & 0xff) * (1 - k) + ((tint >> shift) & 0xff) * k)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

export type MascotOptions = {
  /** Shifts the pose down one pixel row (the bob on odd seconds). */
  isBobbed?: boolean
  /** Blends every pixel halfway toward this 0xRRGGBB colour (the error pulse). */
  tint?: number
}

const memo = new Map<string, string>()
const MEMO_MAX = 128

/**
 * A pose's Raster cells, row-major base64 u32 triplets [codePoint, fg, bg], in
 * the box `boxOf(pose)` gives. Both pixels set: ▀ with the top as foreground
 * and the bottom as background; only the top: ▀; only the bottom: ▄; neither:
 * a space. The background of a half-filled cell is the terminal's default.
 */
export function mascotCells(pose: Pose, options: MascotOptions = {}): string {
  const shift = options.isBobbed ? 1 : 0
  const key = `${pose}|${shift}|${options.tint ?? ''}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const rows = poseRows(pose)
  const { columns, rows: cellRows } = boxOf(pose)
  const pixel = (x: number, y: number): number | null => {
    const ch = rows[y - shift]?.[x]
    if (ch === undefined || ch === '.') return null
    const c = colourOf(pose, ch)
    if (c === undefined) return null
    return options.tint === undefined ? c : blend(c, options.tint, 0.5)
  }
  const words = new Uint32Array(columns * cellRows * 3)
  for (let r = 0; r < cellRows; r++) {
    for (let x = 0; x < columns; x++) {
      const top = pixel(x, r * 2)
      const bottom = pixel(x, r * 2 + 1)
      const i = (r * columns + x) * 3
      if (top !== null) {
        words[i] = UPPER
        words[i + 1] = top
        words[i + 2] = bottom ?? DEFAULT
      } else if (bottom !== null) {
        words[i] = LOWER
        words[i + 1] = bottom
        words[i + 2] = DEFAULT
      } else {
        words[i] = SPACE
        words[i + 1] = BLANK_FG
        words[i + 2] = DEFAULT
      }
    }
  }
  // The hooks environment has the web's Uint8Array.prototype.toBase64; the es2023 lib does not type it.
  const cells = (new Uint8Array(words.buffer) as Uint8Array & { toBase64: () => string }).toBase64()
  if (memo.size >= MEMO_MAX) memo.clear()
  memo.set(key, cells)
  return cells
}

// --- pixel data (generated from the pack's 1x PNGs with tools/pixgrid.py, grid count 46; see the header)

/**
 * Each pack pose: its own palette (0xRRGGBB, most used first) and its pixel
 * rows, top to bottom; '.' is empty, any other character indexes the pose's
 * palette (0-9, a-z, A-Z). One palette per pose keeps every colour exact.
 */
export const POSES = {
  'repairing-with-tools': {
    palette: [0xd97757, 0xf4e84d, 0x7296aa, 0x5b39c9, 0xffffff, 0x2f2f38],
    rows: [
      '...........11...........',
      '.......1111111111.......',
      '......111111111111......',
      '.....11111111111111.....',
      '.....11111111111111.....',
      '.....11111111111111...2.',
      '....1111111111111111..2.',
      '2..2.00000000000000...2.',
      '2222.00000000000000...2.',
      '.22..00000000000000...2.',
      '.22..00000000000000...2.',
      '.22..00050000005000..333',
      '.22..00000400400000...3.',
      '.2000000000440000000003.',
      '.2000000000000000000003.',
      '22000000000000000000003.',
      '2..2.0..0......0..0..333',
      '....0..0........0..0....',
    ],
  },
  'writing-software-code': {
    palette: [0xd97757, 0x3bf497, 0x2c8c5e, 0x15586d, 0xffffff, 0x2f2f38],
    rows: [
      '..........222......2........',
      '.......111.......2...2......',
      '............................',
      '.......00000000000000.2.....',
      '111....00000001110000.......',
      '...333.00001110000000.......',
      '.......000000000000001...1..',
      '.......00005000005001001..1.',
      '....00000000000000010001...1',
      '....00000000044400001001..1.',
      '....002200000000000001...1..',
      '....11.00000000000000.......',
      '.......0..0......0..0.......',
      '......0..0......0..0........',
    ],
  },
  'building-colorful-blocks': {
    palette: [0xd97757, 0xda64dd, 0x6d61e0, 0xf9f950, 0x3f6a99, 0x39e5bc, 0x2ee565, 0xff6f48, 0x5ab1ff, 0xb726ed, 0x2f2f38, 0xffffff],
    rows: [
      '...00000000000000...',
      '...00000000000000...',
      '...00000000000000...',
      '...0000a0000a0000...',
      '...000a0a00a0a000...',
      '...00000b00b00000...',
      '000000000bb000000000',
      '00000000000000000000',
      '00000000000000000000',
      '...0..0......0..0...',
      '...0..0......0..0...',
      '..1111222255553333..',
      '..1111222255553333..',
      '..1111222255553333..',
      '44446666777788889999',
      '44446666777788889999',
      '44446666777788889999',
      '..2222333311114444..',
      '..2222333311114444..',
      '..2222333311114444..',
    ],
  },
  'debugging-system-bugs': {
    palette: [0xd97757, 0x456ec9, 0x25cc50, 0x8a46c6, 0xcaf419, 0x1414c9, 0x2f2f38],
    rows: [
      '..1.........33.......',
      '1111.......3333......',
      '11111......3333......',
      '155511......33.......',
      '115111.......3.......',
      '111100000000000000...',
      '....0000000000002222.',
      '....0000000000002222.',
      '....0000000000002222.',
      '....0000000006002222.',
      '...0000000000000002.2',
      '000000000000000000000',
      '000000440000000000000',
      '...004444....00.00...',
      '...0.4444.....0......',
      '......44.............',
    ],
  },
  'reading-data-document': {
    palette: [0xd97757, 0xdbe00b, 0xa50e97, 0xbcbc2b, 0x598dd8, 0xffffff, 0x2f2f38],
    rows: [
      '..00000000000000..',
      '..00000000000000..',
      '..00222000022200..',
      '..02464222246420..',
      '..00222000022200..',
      '.00000005500000000',
      '.00000005500000000',
      '.11111100000000000',
      '001333100000000000',
      '00113331....0..0..',
      '...111111.........',
      '....111111........',
    ],
  },
  'thinking-in-code': {
    palette: [0xd97757, 0x27ff69, 0x2f2f38, 0xffffff],
    rows: [
      '...1..............1...',
      '...1..............1...',
      '..1..........1.....1..',
      '.1..........1.......1.',
      '1..........1.........1',
      '11..00000100000000..11',
      '..1.00001000000000.1..',
      '...1000000000000001...',
      '...1000000000000001...',
      '....00020000002000....',
      '....00000300300000....',
      '.00000000000000000000.',
      '.00000000000000000000.',
      '....0..0......0..0....',
      '....0..0......0..0....',
      '....0..0......0..0....',
    ],
  },
  'examining-green-globe': {
    palette: [0xd97757, 0xaaff15, 0x17aaa3, 0x3b3bcc, 0x68e0bb, 0xffffff, 0x2f2f38],
    rows: [
      '..111.................',
      '..111.................',
      '.12221................',
      '1242421...............',
      '1422241.00000000000000',
      '1122211.00000000600000',
      '..111.3.00000000000000',
      '.......300000550000000',
      '.......300000550000000',
      '.....00030000000000000',
      '.....00003000000000000',
      '.....00000030000000000',
      '........0.0.3000...0.0',
      '........0.0..300...0.0',
    ],
  },
  'lab-science-testing': {
    palette: [0xd97757, 0xb5b3ba, 0x8557ce, 0x1327e2, 0x351daa, 0x11ea82, 0x3340c1, 0xffffff, 0x2f2f38],
    rows: [
      '.........................5',
      '.111....................5.',
      '..1..................5.5..',
      '..1...................5...',
      '..2.......................',
      '.222.................11111',
      '26262.................111.',
      '626260..............00333.',
      '...000..............00343.',
      '...0000000000000000000434.',
      '......00000000000000..343.',
      '......00008000080000..434.',
      '......00000700700000...4..',
      '......00000077000000......',
      '......00000000000000......',
      '......00000000000000......',
      '......00000000000000......',
      '......00000000000000......',
      '.....0...0......0...0.....',
      '.....0...0......0...0.....',
    ],
  },
  'holding-ancient-scroll': {
    palette: [0xd97757, 0xffd255, 0xeab839, 0xf9f2de, 0x2f2f38],
    rows: [
      '....333.................',
      '...3...3................',
      '..3....000..............',
      '1131221100..............',
      '.132332100..............',
      '..132211..000000000000..',
      '..111111..000000000000..',
      '..122221..044004000000..',
      '.1111111..000000000000..',
      '.1222211..000330000000..',
      '11111111..000000000000..',
      '1111111...00000000000000',
      '..........00000000000000',
      '..........00000000000000',
      '..........0...0......0.0',
      '.........0....0.....0..0',
    ],
  },
  'visualizing-tree-data': {
    palette: [0xd97757, 0x6240e2, 0x30ef4b, 0xffffff],
    rows: [
      '...............2........',
      '...............1..11..1.',
      '..............211.11.1.2',
      '...............1..111.1.',
      '.000000000000.....11....',
      '.0000000000000....11....',
      '.0000000000000....11....',
      '.0000000000000...1111...',
      '.0000000003000..1.11.1..',
      '.0000000000000...1..1...',
      '00000000000000001.......',
      '0000000000000000........',
      '0000000000000000........',
      '0.00.....00.00..........',
      '0........0...0..........',
    ],
  },
  'managing-server-rack': {
    palette: [0xd97757, 0x6f6ad3, 0x4139aa, 0x4c4ce0, 0xffffff, 0x2f2f38, 0x82ef2e],
    rows: [
      '..............000...........',
      '..............0003333333222.',
      '0000000000000000111111111222',
      '00000000500050..111111111222',
      '00000000040400...3333333222.',
      '00000000004000..111111111222',
      '00000000004000..111111111222',
      '00000000000000..111161111222',
      '0000000000000000011111111222',
      '0000000000000000011111111222',
      '0..0......0..0..111161111222',
      '0..0......0..0..111111111222',
    ],
  },
  'processing-logic-symbols': {
    palette: [0xd97757, 0xd322a5, 0x2f2f38, 0xe83c00, 0x38e540, 0x7d3ec6, 0x5a39e2, 0x359cf9],
    rows: [
      '...1......................',
      '..111................3.3..',
      '..111................3.3..',
      '...100..............003...',
      '...000..............0303..',
      '...000..............000...',
      '......00000000000000......',
      '44....00000000000000...666',
      '4400..00020000002000..006.',
      '4400..00020000002000..006.',
      '.000..00202000020200..000.',
      '.000..00000000000000..000.',
      '..7...00000000000000..5.5.',
      '..700.00000000000000.050..',
      '.7700.00000000000000.0555.',
      '..000.0.0........0.0.000..',
      '..000.0.0........0.0.000..',
      '.......0.0......0.0.......',
    ],
  },
  'planting-small-trees': {
    palette: [0xd97757, 0x4f4aa8, 0x7c7cce, 0xffeb99, 0x6de26d, 0xefd760, 0x13ce1b, 0x828293, 0xffffff],
    rows: [
      '.....00000000000000..',
      '.....00000000000000..',
      '.....00000000000000..',
      '.....00000000000000..',
      '.12..00000000000000..',
      '2122.00000000000000..',
      '121104600080000000000',
      '.12006400000000000000',
      '.7000470000000000000.',
      '35335350......0...0..',
    ],
  },
  'user-profile-settings': {
    palette: [0xd97757, 0xdbd235, 0x42c642, 0xf2e970, 0x7667e8, 0xffffff, 0xd89336, 0x6251b7, 0x2f2f38],
    rows: [
      '.2222222222...............',
      '22522552222...............',
      '22222222222...............',
      '1111111111100000000000000.',
      '1444666661100000000000000.',
      '1474111111100000000000000.',
      '1444333333100080000008000.',
      '1777111111100000005000000.',
      '1111333331100000550000000.',
      '.1111111110000000000000000',
      '.........00000000000000000',
      '.........00000000000000000',
      '...........0...0......0.0.',
      '...........0...0......0.0.',
    ],
  },
  'sleeping-soundly': {
    palette: [0xd97757, 0x5b1fdd, 0x1a9643, 0x2f2f38, 0xffe05c, 0xff6136, 0x70ed20, 0xffffff],
    rows: [
      '......1111..........',
      '........1....44.....',
      '.......1......44....',
      '.2222.1111..........',
      '...2.........55.....',
      '..2...........55....',
      '.2222......66.......',
      '...00000000066000...',
      '...00000000000000...',
      '...00000000000000...',
      '...00303000030300...',
      '...00030000003000...',
      '...00000000000000...',
      '00000000070000000000',
      '00000000000000000000',
      '00000000000000000000',
      '...0..0......0..0...',
      '....0..0......0..0..',
    ],
  },
  'thinking-pixel-bubble': {
    palette: [0xd97757, 0x3cd694, 0x2f2f38, 0x3d45d3, 0xffffff],
    rows: [
      '..................111111..',
      '.................11111111.',
      '................1111111111',
      '................1131131111',
      '................1111111111',
      '.................11111111.',
      '..................111111..',
      '................1.........',
      '................11........',
      '..000000000000000.........',
      '..00000000000001000.......',
      '..00000000000000000.......',
      '..00022200002220000.......',
      '..000000000000000.........',
      '..000000040000000.........',
      '00000000000000000.........',
      '00000000000000000.........',
      '00000000000000000.........',
      '..0..00.....00..0.........',
      '..0..00.....00..0.........',
    ],
  },
  'in-constant-loop': {
    palette: [0xd97757, 0x9c17e2, 0x2f2f38, 0xffffff],
    rows: [
      '............1...............',
      '.............1..............',
      '.........111111...11........',
      '........1....1......1.1.....',
      '.......1....1........11.....',
      '......1.............111.....',
      '............................',
      '..1....00000000000000...1...',
      '.111...00000000000000....1..',
      '1.1.1..00000000000000....1..',
      '..1....00202000020200....1..',
      '..1.00000020000002000000.1..',
      '..1.00000000000000000000.1..',
      '..1.00000000033000000001.1.1',
      '..1....00000000000000...111.',
      '...1...00000000000000....1..',
      '......0..0.......0...0......',
      '.....111..0.....0...01......',
      '.....11........1....1.......',
      '.....1.1......1....1........',
      '........11...111111.........',
      '..............1.............',
      '...............1............',
    ],
  },
  'it-depends-sign': {
    palette: [0xd97757, 0xef509c, 0xaded51, 0xffffff, 0x8c7670],
    rows: [
      '1111111111111111111111......',
      '1112112211111111111111......',
      '1111111111111111111111......',
      '1111111111111111111111......',
      '1121122122122122212211......',
      '1122121122121121212121......',
      '1121122111122111212211......',
      '.11111111141111111111.......',
      '..........4.................',
      '.........0000000000000000...',
      '........00000000000000000...',
      '........00000000000000000...',
      '.........0000000000000000...',
      '..........400000333300000...',
      '...........00000000000000...',
      '...........00000000000000000',
      '...........00000000000000000',
      '...........00000000000000000',
      '...........00000000000000000',
      '...........0..0......0..0...',
      '...........0............0...',
    ],
  },
  'with-success-checkmark': {
    palette: [0xd97757, 0x15aa51, 0x3aedb2, 0x2f2f38, 0xffffff],
    rows: [
      '.......111111.......',
      '...2..11111111..2...',
      '.2...1111111111...2.',
      '.....1111111211.....',
      '2....1111112111....2',
      '.....1112121111.....',
      '000..1111211111..000',
      '000...11111111...000',
      '000....111111....000',
      '...00000000000000...',
      '...00000000000000...',
      '...00030000003000...',
      '...00303000030300...',
      '...00000400400000...',
      '...00000044000000...',
      '...00000000000000...',
      '...00000000000000...',
      '...00000000000000...',
      '...0..0......0..0...',
      '..0...0......0...0..',
    ],
  },
  'success-achievement-milestone': {
    palette: [0xd97757, 0xfcfc56, 0x64e2a6, 0x2f2f38, 0xffffff],
    rows: [
      '........2.........1.....',
      '........2...............',
      '........2...............',
      '.......2..........1.....',
      '...2...2........1.1.1...',
      '....2.2..........212....',
      '...0000000000000021211.1',
      '...00000000000001.1.1...',
      '...00030000003000.1.....',
      '...00030000003000.1.....',
      '...00303000030300.......',
      '...00000000000000.1.....',
      '00000000044000000000....',
      '00000000000000000000....',
      '...00000000000000.......',
      '...0..0......0..0.......',
      '...0..0......0..0.......',
      '...0..0......0..0.......',
    ],
  },
  'happy-pixel-celebrating': {
    palette: [0xd97757, 0x50ffb4, 0x873be0, 0xffff39, 0xaa399f, 0x2f2f38, 0x1fa028, 0xffffff, 0xf4552a],
    rows: [
      '......1............2......',
      '...001.1..........2.200...',
      '...0001............2000...',
      '...000..............000...',
      '..........................',
      '......................3...',
      '...4.................3.3..',
      '.0404.00000000000000..300.',
      '.004..00000000000000..000.',
      '.000..00000000000000..000.',
      '......00000000000000......',
      '......00550000005500......',
      '.6....00000700700000....8.',
      '6.600.00000077000000.008.8',
      '.6000.00000000000000.0008.',
      '..000.00000000000000.000..',
      '......0..0......0..0......',
      '.......0..0....0..0.......',
    ],
  },
  'rocket-launch-success': {
    palette: [0xd97757, 0x96f916, 0xffbd03, 0xea3f54, 0x1944f7, 0xffffff, 0x3564f9, 0x2f2f38, 0x7697ff],
    rows: [
      '.......................466',
      '......................1146',
      '.................2...31814',
      '................2...11311.',
      '...................13113..',
      '................3341131...',
      '...............3..4411....',
      '............2....2044..2..',
      '...........2...0022.3.2...',
      '.00000000000000020..3.....',
      '.00000000000000000.3......',
      '.00007000000700...........',
      '.00000050050000...2.......',
      '.00000005500000..2........',
      '.00000000000000...........',
      '.00000000000000000........',
      '.00000000000000000........',
      '.00000000000000000........',
      '.0..0......0..0...........',
      '0..0........0..0..........',
    ],
  },
  'api-success-pixel': {
    palette: [0xd97757, 0xc6c1e0, 0x4f37db, 0x23d8b5, 0xffffff, 0x2f2f38],
    rows: [
      '.22222222222................',
      '1111111111111.......3333333.',
      '1112112221211......111111111',
      '1121212121111......111111311',
      '1122212221211......111113111',
      '1121212111211000000113131111',
      '1111111111111000000111311111',
      '.11111111111000000001111111.',
      '.......00000000000000.......',
      '.......00050000005000.......',
      '.......00000000000000.......',
      '....00000000444400000000....',
      '....00000000000000000000....',
      '....00000000000000000000....',
      '.......0..0......0..0.......',
      '.......0..0......0..0.......',
    ],
  },
  'in-glowing-aura': {
    palette: [0xd97757, 0xdddddd, 0x2f2f38, 0xffffff],
    rows: [
      '...1.....11.....1...',
      '..111....11....111..',
      '...111...11...111...',
      '...111...11...111...',
      '....1..........1....',
      '....................',
      '...00000000000000...',
      '11100000000000000111',
      '11100202000020200111',
      '...00020000002000...',
      '...00020000002000...',
      '...00000300300000...',
      '00000000033000000000',
      '00000000000000000000',
      '...0..0......0..0...',
      '....1..0....0..1....',
      '...111........111...',
      '...111........111...',
      '..111....11....111..',
      '...1.....11.....1...',
      '.........11.........',
    ],
  },
  'love-cloud-pixel': {
    palette: [0xf1ff6c, 0xd97757, 0xdd3e68, 0xffcf6e, 0xffffff, 0x2f2f38, 0xed6992],
    rows: [
      '..2.222.................',
      '.2226622................',
      '.2222222................',
      '..22222.................',
      '..2222...00000000000000.',
      '...2....000000000000000.',
      '....1111111111111100000.',
      '....1111111111111100000.',
      '....1111111111111100000.',
      '....1115111111511100000.',
      '..111111511111111111110.',
      '..111111141114111111110.',
      '..111111114441111111110.',
      '.0001111111111111100000.',
      '000011111111111111000000',
      '000133313331133133000000',
      '000100010001100100000000',
      '000000000000000000000000',
      '.0000000000000000000000.',
      '..000000000000000000000.',
    ],
  },
  'confusion-spiral-pixel': {
    palette: [0xd97757, 0x602aad, 0x674bef, 0x2f2f38, 0xffffff],
    rows: [
      '....1.21212121..1...',
      '.....1..2121..2.....',
      '....2..1....2.1.2...',
      '....2..1....2.1.2...',
      '....1.2..12.1.2.....',
      '....2.1.21.12.1.2...',
      '....1.2...2...2.1...',
      '....21.1212121.12...',
      '......2.......2.....',
      '...01001212121001...',
      '...01001212121001...',
      '...00000000000000...',
      '...00030000003000...',
      '...00303000030300...',
      '00000000044000000000',
      '00000000000000000000',
      '00000000000000000000',
      '00000000000000000000',
      '...00000000000000...',
      '...0..0......0..0...',
      '....0..0....0..0....',
    ],
  },
  'dizzy-failed-state': {
    palette: [0xd97757, 0xb51f8a, 0xe058c0, 0xffffff, 0x2f2f38, 0xf75b2b],
    rows: [
      '..111.................',
      '.11311................',
      '1111111...............',
      '13111311....5.........',
      '11131131.....5....2..2',
      '11311111...........2..',
      '1111111.............2.',
      '.11111....22......2..2',
      '.....00002222000000...',
      '.....00000000000000...',
      '.....00000000000000...',
      '.....00000000000000...',
      '.....00400000004000...',
      '.....00443000304000...',
      '..0000000033300000000.',
      '.000000000000000000000',
      '.000000000000000000000',
      '..0000000000000000000.',
      '.....0..0......0.00...',
    ],
  },
  'error-state-pixel': {
    palette: [0xd97757, 0xff97d0, 0x5a9bcc, 0x2f2f38, 0xffffff, 0x8659ce],
    rows: [
      '...........1...1............',
      '...........1...1............',
      '............1.1.....22222...',
      '.............1.....2111112..',
      '............1.1...211111112.',
      '.000000000000001.21114141112',
      '.00030000003000..21111411112',
      '.00303000030300..21114141112',
      '.00303000030300..21114141112',
      '.00030000003000...214111412.',
      '.00000044000000...52111112..',
      '000000000000000005..22222...',
      '000000000000000500..........',
      '.0..0......0..0.............',
      '0..0......0..0..............',
      '0..0......0..0..............',
    ],
  },
  'failed-process-error': {
    palette: [0xd97757, 0x1620d8, 0x5ccc71, 0xcc5eb0, 0xffffff, 0x0c9379, 0x2f2f38],
    rows: [
      '...22222....................',
      '..2111112...................',
      '.211111112..................',
      '21131313112..00000000000000.',
      '21113331112..00000000000000.',
      '21313331312..00000000000000.',
      '21113331112..00060000060000.',
      '.213131312...00000000000000.',
      '..21111125...00000444000000.',
      '...22222..500000040004000000',
      '..........050000000000000000',
      '..........005000000000000000',
      '.............0..0......0..0.',
      '..............0..0......0..0',
    ],
  },
  'system-error-alert': {
    palette: [0xd97757, 0xffc0ff, 0xe842e0, 0xfc277e, 0xffffff, 0xec8fef, 0xe5d942, 0x2f2f38],
    rows: [
      '.22222222222222...............',
      '2262626222222222..............',
      '2222222222222222..............',
      '1111131111111111..............',
      '1111333111111111..............',
      '1113343311111111..............',
      '1113343311113111..............',
      '11333333311131110000000000000.',
      '11333433311111110000000000000.',
      '13333333331131110700070000000.',
      '11111111111111110000000000000.',
      '11155555111111110044400000000.',
      '11111111111111110000000000000.',
      '11111111111110000000000000000.',
      '.............00000000000000000',
      '.............00000000000000000',
      '................0..0......0..0',
      '................0..0......0..0',
    ],
  },
  'marking-critical-error': {
    palette: [0xd97757, 0xad2aad, 0xff7b8e, 0x2f2f38, 0xffffff],
    rows: [
      '.......111111.......',
      '...2..11111111..2...',
      '.2...1121111211...2.',
      '.....1112112111.....',
      '..2..1111221111..2..',
      '.....1112112111.....',
      '.....1121111211.....',
      '......11111111......',
      '.......111111.......',
      '...00000000000000...',
      '...00303000030300...',
      '...00030000003000...',
      '...00303044030300...',
      '...00000400400000...',
      '...00000000000000...',
      '00000000000000000000',
      '00000000000000000000',
      '00000000000000000000',
      '...0..0......0..0...',
      '..0....0....0....0..',
    ],
  },
  'crying-sad-reaction': {
    palette: [0xd97757, 0x3eadff, 0x83d0ff, 0xffffff, 0x2f2f38],
    rows: [
      '.....2..........2.....',
      '..120020000000020021..',
      '.1..20010000001002..1.',
      '1...00000000000000...1',
      '....01040000004010....',
      '..001110003300011100..',
      '..001110003300011100..',
      '..012111000000111210..',
      '..021211000000112120..',
      '..112111100001111211..',
      '...11111.0..0.11111...',
      '....111........111....',
    ],
  },
  'angry-at-laptop': {
    palette: [0xd97757, 0xffc431, 0x5b30d1, 0xff6833, 0xaf32ce, 0x2f2f38, 0xffffff],
    rows: [
      '................1........',
      '.................1..3....',
      '................11.313...',
      '.........1.....111..3....',
      '........131..1.11........',
      '.........1..1..131.......',
      '............111311.1..1..',
      '000.........1133311..1...',
      '000..........11311..111.1',
      '00000000000000111...1131.',
      '...00000000000000....111.',
      '...00000000000000........',
      '...00000000000000..222222',
      '...00005000005000.222422.',
      '...00000500050000.224222.',
      '...00000006000000222222..',
      '...000000000000444444....',
      '...00000000000000000.....',
      '...0..0......0..0........',
      '....0..0......0..0.......',
    ],
  },
  'broken-heart-sad': {
    palette: [0xd97757, 0xe03890, 0x2f2f38, 0x993add, 0x50a8ff, 0xffffff],
    rows: [
      '..13.11.............',
      '.113.111............',
      '.1113.11............',
      '..13.11.............',
      '...3.1..............',
      '...00000000000000...',
      '...00000000000000...',
      '...00000000000000...',
      '...00202000020200...',
      '...04020000002040...',
      '...40000055000004...',
      '00000000500500000000',
      '00000000000000000000',
      '00000000000000000000',
      '...0..0......0..0...',
      '..0..0......0..0....',
    ],
  },
  'disconnected-plug-pixel': {
    palette: [0xd97757, 0x6e31f4, 0x3381f2, 0x2f2f38, 0xffffff, 0xffd939],
    rows: [
      '......2225.1112.....',
      '.....1222..11121....',
      '....1.2225.1212.1...',
      '....1.2225.1212.1...',
      '....1..22..111...1..',
      '...1..............1.',
      '...1..............1.',
      '000..............000',
      '000..............000',
      '1..00000000000000..1',
      '1..00000000000000..1',
      '1..00000000000000..1',
      '.1.00030000003000.1.',
      '...00030000003000...',
      '...00000044000000...',
      '...00000400400000...',
      '...00000000000000...',
      '...00000000000000...',
      '...00000000000000...',
      '..0...0......0...0..',
      '..0...0......0...0..',
    ],
  },
  'artboard-25cla': {
    palette: [0xd97757, 0x2f2f38, 0xffffff],
    rows: [
      '.......00000000000000.......',
      '.......00000000000000.......',
      '.......00000000000000.......',
      '.......00000000000000.......',
      '.......00010000001000.......',
      '.......00000200200000.......',
      '....00000000022000000000....',
      '....00000000000000000000....',
      '....00000000000000000000....',
      '.......0..0......0..0.......',
      '.00000.0..0......0..0.00000.',
      '.01010................01010.',
      '0000000..00000..0000.0000000',
      '0.0.0.0..01010..0101.0.0.0.0',
      '........0000000.0000........',
      '........0.0.0.0.0..0........',
    ],
  },
  'multi-window-workflow': {
    palette: [0xd97757, 0xc5e2dd, 0xe3c0ff, 0xffd89f, 0xc15bb9, 0x51e5c8, 0x4735ef, 0xf4a321, 0xffffff, 0x9d33e2, 0x2f2f38],
    rows: [
      '...................44444444.',
      '............999...2222222222',
      '...........22222..2222222222',
      '...........22222..2222222222',
      '.5555555...22222..2222222222',
      '111111111.........2222222222',
      '111111111...................',
      '111111111000000000000.......',
      '111111111000000000000.......',
      '111111111000000000000.......',
      '111111111000000000000666666.',
      '.......000a000000a0011111111',
      '.......000008008000011111111',
      '....000000000880000011111111',
      '....000000000000000011111111',
      '....77777700000000000000....',
      '...33333333......0..0.......',
      '...33333333......0..0.......',
      '...33333333.................',
      '...33333333.................',
    ],
  },
  'developer-pair-programming-scene': {
    palette: [0xd97757, 0x27d834, 0x7af4d4, 0x9736a8, 0x3b35aa, 0xefa262, 0xffffff],
    rows: [
      '...................44.....',
      '....................4544..',
      '.........1..11.......555..',
      '........1...11..1....55...',
      '........1...1...1....55...',
      '........1..1....1....111..',
      '.........1.1........11111.',
      '...................1111111',
      '...0000000000000...1111111',
      '...00000000000000..5111111',
      '...00000000000000..5511115',
      '...00000000000000..5511115',
      '...00000000000222222222225',
      '...00000000000022222222233',
      '00000000060000022222222233',
      '0000000000000000222222233.',
      '000000000000000004444443..',
      '..00.00.....00.00.333.33..',
      '...0..0......0..0.333.33..',
      '..................333.33..',
      '..................333.33..',
      '..................444444..',
    ],
  },
} as const

// --- shell and codex mascots: drawn by Zehui/Claude 2026-10-19, not from the pack

/** The shell mascots' colours, as 0xRRGGBB, by the letter their rows use. */
export const SHELL_PALETTE: Readonly<Record<string, number>> = {
  g: 0x8a8f98,
  G: 0x5b606a,
  k: 0x1a1c22,
  w: 0xf5f5f4,
  n: 0x19c3a6,
  o: 0xd97757,
  y: 0xffe05c,
  b: 0x3d9bff,
  p: 0xd16bff,
  // the codex fuzzies' colours (drawn by us after Codex's own mascots, not copied)
  r: 0xff7ab6,
  R: 0xd94f8e,
  B: 0x1f5fd6,
  Y: 0xd99c0a,
  l: 0x7ad12a,
  L: 0x55a318,
  v: 0xb04cff,
  V: 0x862fd1,
}

/** Each shell mascot's pixel rows, top to bottom: '.' is empty, a letter a SHELL_PALETTE key. */
export const SHELL_POSES = {
  // A. grey bot with a terminal face (">_" in mint): background shells
  'shell-terminal-face': [
    '.......GGGGGG.......',
    '.......G....G.......',
    '...GGGGGGGGGGGGGG...',
    '...GggggggggggggG...',
    '...GgkkkkkkkkkkgG...',
    '...Gknn.kkkkkkkkgG..',
    '...GkknnkkkkkkkkgG..',
    '...GkknnkknnnnkkgG..',
    '...GknnkkkkkkkkkgG..',
    '...GgkkkkkkkkkkgG...',
    '...GggggggggggggG...',
    'GGGGggggggggggggGGGG',
    'GGGGggggggggggggGGGG',
    '...Gg.gg....gg.gG...',
    '...Gg.gg....gg.gG...',
  ],
  // B. grey bot with a white hexagon badge on the chest: codex
  'codex-hex-badge': [
    '.......GGGGGG.......',
    '.......G....G.......',
    '...GGGGGGGGGGGGGG...',
    '...GggggggggggggG...',
    '...GgkkkkkkkkkkgG...',
    '...GgkwwkkkkwwkgG...',
    '...GgkwwkkkkwwkgG...',
    '...GgkkkkkkkkkkgG...',
    '...GggggggggggggG...',
    '...Ggggg.ww.ggggG...',
    '...Gggg.w..w.gggG...',
    'GGGGggg.w..w.gggGGGG',
    'GGGGgggg.ww.ggggGGGG',
    '...Gg.gg....gg.gG...',
    '...Gg.gg....gg.gG...',
  ],
  // C. a terminal window with a cursor, no character: background shells
  'shell-window': [
    'GGGGGGGGGGGGGGGGGGGG',
    'GoGyGnGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGGGGGG',
    'Gkkkkkkkkkkkkkkkkk.G',
    'Gknkkkkkkkkkkkkkkk.G',
    'Gkknkkkkkkkkkkkkkk.G',
    'Gknkkkkkkkkkkkkkkk.G',
    'Gkkkknnnnnnkkkkkkk.G',
    'Gkkkkkkkkkkkkkkkkk.G',
    'Gkkkkkkkkkkkkkkkkk.G',
    'Gkkkkkkkkkkkkkkkkk.G',
    'Gkkkkkkkkkkkkkkkkk.G',
    'GGGGGGGGGGGGGGGGGGGG',
  ],
  // D. grey bot wearing a small blue cap with a "C": codex
  'codex-blue-cap': [
    '......bbbbbbb.......',
    '.....bbwwbbbbb......',
    '.....bbwbbbbbb......',
    '.....bbwwbbbbbbb....',
    '...GGGGGGGGGGGGGG...',
    '...GggggggggggggG...',
    '...GgkkkkkkkkkkgG...',
    '...GgkwwkkkkwwkgG...',
    '...GgkkkkkkkkkkgG...',
    '...GggggggggggggG...',
    '...GggggggggggggG...',
    'GGGGggggggggggggGGGG',
    'GGGGggggggggggggGGGG',
    '...Gg.gg....gg.gG...',
    '...Gg.gg....gg.gG...',
  ],
  // Codex fuzzies, five shapes: a codex shell picks one by a hash of its id
  'fuzzy-pink-headphones': [
    '......rrrrrrrr......',
    '....rrrrrrrrrrrr....',
    '...rrrrrrrrrrrrrr...',
    '..kkrrrrrrrrrrrkk...',
    '.kkkrrrrrrrrrrrrkkk.',
    '.kkkrrkkrrrrkkrrkkk.',
    '.kkkrrrkkrrrrkkrkkk.',
    '.kkkrrrrrrrrrrrkkkk.',
    '..kkrrrrrrrrrrrkk...',
    '...rrrrrrrrrrrrrr...',
    '....rrrrrrrrrrrr....',
    '......RRRRRRRR......',
  ],
  'fuzzy-blue-beret': [
    '....kkkkkk..........',
    '..kkkkkkkkkkk.......',
    '.kkkkkkkkkkkkkk.....',
    '...bbbbbbbbbbb......',
    '..bbbbbbbbbbbbbb....',
    '.bbbbbbbbbbbbbbbbb..',
    'bbbbbbkkbbbbbkkbbbb.',
    'bbbbbbkkbbbbbkkbbbbb',
    'bbbbbbbbbbbbbbbbbbbb',
    '.bbbbbbbbbbbbbbbbbb.',
    '..bbbbbbbbbbbbbbbb..',
    '....BBBBBBBBBBBB....',
  ],
  'fuzzy-yellow-triangle': [
    '.........yy.........',
    '........yyyy........',
    '.......yyyyyy.......',
    '......yyyyyyyy......',
    '.....kkkkykkkky.....',
    '....ykwkkykkwkyy....',
    '...yykkkkykkkkyyy...',
    '..yyyyyyyyyyyyyyyy..',
    '.yyyyyyyyyyyyyyyyyy.',
    'yyyyyyyykkkkyyyyyyyy',
    'yyyyyyyyykkyyyyyyyyy',
    'YYYYYYYYkkkkYYYYYYYY',
  ],
  'fuzzy-green-square': [
    '....llllllllllll....',
    '..llllllllllllllll..',
    '.llllllllllllllllll.',
    '.lllwwwwllllwwwwlll.',
    '.llwwkkwwllwwkkwwll.',
    '.llwwkkwwllwwkkwwll.',
    '.lllwwwwllllwwwwlll.',
    '.llllllllllllllllll.',
    '.llllllllllllllllll.',
    '.llllllllllllllllll.',
    '..llllllllllllllll..',
    '....LLLLLLLLLLLL....',
  ],
  'fuzzy-purple-heart': [
    '..vvvvvv....vvvvvv..',
    '.vvvvvvvv..vvvvvvvv.',
    'vvvvvvvvvvvvvvvvvvvv',
    'vvkkkkkvvvvvvkkkkkvv',
    'vvkwwwkvkkkkvkwwwkvv',
    'vvkwkwkvvvvvvkwkwkvv',
    'vvkkkkkvvvvvvkkkkkvv',
    '.vvvvvvvvvvvvvvvvvv.',
    '..vvvvvvvvvvvvvvvv..',
    '....vvvvvvvvvvvv....',
    '......vvvvvvvv......',
    '........VVVV........',
  ],
} as const
