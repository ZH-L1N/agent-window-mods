export type Runner = 'vitest' | 'jest' | 'pytest' | 'cargo' | 'go' | 'bun' | 'deno'

/** One failing test, as its runner printed it. */
export type Failure = {
  /** Suites and test joined with ` > ` */
  name: string
  file?: string
  /** The first line of the error */
  message: string
  /** The error as printed, indentation kept, at most 30 lines */
  detail: string[]
}

/** What one run's output came to. */
export type Parsed = {
  runner: Runner
  passed: number
  failed: number
  skipped: number
  durationMs?: number
  /** `packages` when go ran without -v and listed no passing test */
  unit: 'tests' | 'packages'
  failures: Failure[]
}

/** A parsed run, kept in the history. */
export type Run = Parsed & {
  id: string
  command: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    redgreen: {
      runs: Run[]
      /** The run the pane shows; null follows the latest */
      viewing: string | null
      /** The failure whose detail is open, by index in the shown run */
      picked: number
    }
  }
}
