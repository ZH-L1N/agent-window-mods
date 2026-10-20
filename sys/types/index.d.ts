// The sys mod's state contract.

/** The battery as `pmset -g batt` reports it. */
export type SysBattery = {
  /** Charge, a whole percentage. */
  percent: number
  /** True while it charges or is full (`charging`, `charged`, `finishing charge`); false when discharging or on AC without charging. */
  isCharging: boolean
}

/** One reading of the machine; a part that could not be read is null and left out of the row. */
export type SysReading = {
  /** The 1-minute load average over the cores, a whole percentage (may pass 100). */
  cpu: number | null
  /** Active + wired + compressor pages from vm_stat, and hw.memsize, in bytes. */
  ram: { used: number; total: number } | null
  /** Null on a machine with no battery. */
  battery: SysBattery | null
  /** When the reading was taken, `$.clock.now()` milliseconds. */
  readAt: number
}

declare module 'claude-code' {
  interface PluginState {
    sys: {
      /** The latest reading; null until the first one. */
      reading: SysReading | null
      /** /sys on|off as kept in the store; '' while the plugin option applies. */
      band: '' | 'on' | 'off'
    }
  }
}
