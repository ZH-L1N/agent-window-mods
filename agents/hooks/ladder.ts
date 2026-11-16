// The mascot behaviour ladder (0.5.0): what a card's mascot shows, as pure
// functions of its record and the time.
//
// - A reaction (a run that finished or failed, a tool call that failed) cuts
//   in at once and lasts REACT_MS.
// - An ambient change (running to waiting, a rest after a reaction) waits for
//   the clip to end: a clip is the two-frame bob cycle, CLIP_MS long.
// - The clip clock restarts only when the pose changes.
// - Only an observed event makes a reaction: a record read back after a reload,
//   or settled by the tick, never starts one.
//
// The records live in state (`agents.mascots`); the tick and the event hooks
// write them, the pane draws `shown(settle(rec, wanted, at), at)`.
import type { MascotRec, ReactionKind } from '../types'

export type { MascotRec, ReactionKind } from '../types'

/** One clip: the bob's rest frame for its first half, the bobbed frame for its second. */
export const CLIP_MS = 2000
/** How long a reaction shows. */
export const REACT_MS = 3000

const HALF_MS = CLIP_MS / 2

/** True on the odd half clips counted from `from`. */
const isOddHalf = (from: number, at: number): boolean => Math.floor((at - from) / HALF_MS) % 2 === 1

/**
 * The record moved on to `at` with `wanted` as the ambient pose: started at
 * first sight; unchanged while a reaction runs; at a reaction's end the wanted
 * pose from its `until`; otherwise a new pose only once the current clip ran in
 * full, its clip starting at the latest clip boundary at or before `at`. An
 * unchanged record is returned as the same object.
 */
export function settle(rec: MascotRec | undefined, wanted: string, at: number): MascotRec {
  if (!rec) return { pose: wanted, clipAt: at }
  const r = rec.reaction
  if (r) return at < r.until ? rec : { pose: wanted, clipAt: r.until }
  if (rec.pose === wanted || at - rec.clipAt < CLIP_MS) return rec
  return { pose: wanted, clipAt: rec.clipAt + Math.floor((at - rec.clipAt) / CLIP_MS) * CLIP_MS }
}

/** The record with a reaction cutting in at `at`: its ambient pose and clip kept (started at `pose` and `at` with no record). */
export function react(rec: MascotRec | undefined, kind: ReactionKind, pose: string, at: number): MascotRec {
  return { pose: rec?.pose ?? pose, clipAt: rec?.clipAt ?? at, reaction: { kind, pose, at, until: at + REACT_MS } }
}

/**
 * What the mascot shows at `at`: during a reaction its pose, bobbed on the odd
 * half clips from the reaction's start; otherwise the ambient pose, bobbed on
 * the odd half clips from `clipAt`. The drawing decides whether a bob shows.
 */
export function shown(rec: MascotRec, at: number): { pose: string; isBobbed: boolean; isReacting: boolean } {
  const r = rec.reaction
  if (r && at < r.until) return { pose: r.pose, isBobbed: isOddHalf(r.at, at), isReacting: true }
  return { pose: rec.pose, isBobbed: isOddHalf(rec.clipAt, at), isReacting: false }
}

/** True while the record, settled at `at`, still reacts or still waits to show `wanted`: the tick keeps running. */
export function isPending(rec: MascotRec, wanted: string, at: number): boolean {
  const next = settle(rec, wanted, at)
  return next.reaction !== undefined || next.pose !== wanted
}
