// The working pill: a Client surface module, so its animation runs on the
// drawing thread with its own frame clock (surface.every) and never wakes the
// hooks module. It is mounted only while a main-loop turn runs. For the first
// `delayMs` of the turn it draws blank cells, then a braille frame between
// caps. The elapsed time is the turn's age when the instance mounted plus the
// frames counted since.
//
// A surface module stands alone: it imports no value from the hooks modules,
// so the look's constants are repeated here (register.test.tsx holds them equal
// to pills.ts).
import type { ClientModule } from 'claude-code'

export type SpinProps = {
  /** When the turn started, epoch milliseconds. */
  startedAt: number
  /** When the hooks module drew the row, epoch milliseconds. */
  now: number
  /** How long the turn runs before the pill shows. */
  delayMs: number
  /** One frame. */
  frameMs: number
}

type SpinState = { initial: number; ticks: number }

/** The cells the pill takes: a space, two caps and one frame (WORK_W in pills.ts). */
export const SPIN_W = 4
export const SPIN_CAP_L = '\ue0b6'
export const SPIN_CAP_R = '\ue0b4'
/** Catppuccin Mocha lavender on the pills' surface colour. */
export const SPIN_COLOR = '#b4befe'
export const SPIN_SURFACE = '#313244'
export const FRAMES = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'] as const

/** The frame after `elapsedMs` at tick `tick`; null while the pill is still waiting. */
export const spinFrame = (elapsedMs: number, tick: number, delayMs: number): string | null =>
  elapsedMs >= delayMs ? (FRAMES[Math.abs(Math.trunc(tick)) % FRAMES.length] ?? FRAMES[0]) : null

const Spin: ClientModule<SpinProps, SpinState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const frameMs = props.frameMs > 0 ? props.frameMs : 150
  let s = surface.state
  if (s === undefined) {
    s = { initial: Math.max(0, props.now - props.startedAt), ticks: 0 }
    // Started once: the state is set right below, so no later call comes back here.
    surface.every(frameMs, () => {
      const cur = surface.state ?? { initial: 0, ticks: 0 }
      surface.setState({ initial: cur.initial, ticks: cur.ticks + 1 })
    })
    surface.setState(s)
  }
  const frame = spinFrame(s.initial + s.ticks * frameMs, s.ticks, props.delayMs)
  if (frame === null) return <Text>{' '.repeat(SPIN_W)}</Text>
  return (
    <Box flexDirection="row">
      <Text> </Text>
      <Text color={SPIN_SURFACE}>{SPIN_CAP_L}</Text>
      <Text color={SPIN_COLOR} backgroundColor={SPIN_SURFACE}>
        {frame}
      </Text>
      <Text color={SPIN_SURFACE}>{SPIN_CAP_R}</Text>
    </Box>
  )
}

export default Spin
