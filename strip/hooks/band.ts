// The band's background: one colour behind every row above the prompt, so the
// band stands apart from the conversation. Pure: the shades by name, the
// default and the reading of a choice. The list hook (register.tsx) wraps the
// band in the colour.

/**
 * Shades by name, for the `bandColor` option and /strip band. All are dark:
 * the pills' own grey (#313244) would swallow the pills, so it has no name.
 */
export const BAND_SHADES = {
  black: '#0b0b0f',
  crust: '#11111b',
  mantle: '#181825',
  raised: '#24273a',
  navy: '#16203a',
  plum: '#241b36',
  teal: '#12262b',
  moss: '#18271d',
  cocoa: '#2a1f1d',
} as const

export type BandShade = keyof typeof BAND_SHADES

export const BAND_NAMES = Object.keys(BAND_SHADES) as BandShade[]

/** The shade drawn when nothing else is chosen. */
export const BAND_DEFAULT: BandShade = 'moss'

/** What the choice reads as when the band has no background. */
export const BAND_OFF = 'off'

const HEX = /^#[0-9a-f]{6}$/

const isShade = (name: string): name is BandShade => Object.prototype.hasOwnProperty.call(BAND_SHADES, name)

/**
 * A choice as typed or configured: a shade's name, `#rrggbb` or `off`, in any
 * letter case. Answers the colour (lowercase), `off`, or null when it is none
 * of these.
 */
export function bandColorOf(choice: unknown): string | null {
  if (typeof choice !== 'string') return null
  const c = choice.trim().toLowerCase()
  if (c === BAND_OFF) return BAND_OFF
  if (isShade(c)) return BAND_SHADES[c]
  return HEX.test(c) ? c : null
}

/** A colour with its name where it has one: `moss #18271d`, else the colour alone. */
export function bandLabel(color: string): string {
  const name = BAND_NAMES.find(n => BAND_SHADES[n] === color)
  return name ? `${name} ${color}` : color
}
