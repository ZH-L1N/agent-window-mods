// The filetree mod's state contract.

/** One entry of a folder's listing, as the tree keeps it. */
export type Entry = { name: string; kind: 'file' | 'dir' | 'other' }

/** How a file was touched this turn; a write wins over a read. */
export type Touch = 'read' | 'write'

declare module 'claude-code' {
  interface PluginState {
    filetree: {
      /** The working folder the tree shows, absolute (`$.session.cwd()` at the session's start). */
      root: string
      /** The open folders, as paths relative to `root`. */
      open: string[]
      /** Each listed folder's entries, sorted and filtered, by path relative to `root` (`''` is the root). */
      listed: Record<string, Entry[]>
      /**
       * `git status --porcelain` codes by path relative to `root` (a folder git
       * lists whole ends in `/`; `''` alone when the root or a folder above it
       * is untracked as a whole), at most 5000 (`MARK_CAP`).
       */
      git: Record<string, string>
      /** The files read or written since the main loop's last turn started, by path relative to `root`. */
      touched: Record<string, Touch>
    }
  }
}
