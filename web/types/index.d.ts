// The web mod's state contract and the shape web_read returns.

/** One link of a capture: its words and its address cut to origin + pathname. */
export type WebLink = {
  /** The anchor's text, whitespace collapsed, at most 200 characters. */
  text: string
  /** `origin + pathname` only: no query string, no fragment. */
  href: string
}

/**
 * What web_read returns for a page, after ui-selector's CaptureV1 data
 * contract: page identity is origin + pathname, never the query or hash, and
 * everything left out is named in `omitted`.
 */
export type WebCapture = {
  origin: string
  pathname: string
  /** The document's title, at most 300 characters. */
  title: string
  /** The main readable text (main, else article, else body) with scripts, styles, nav, header, footer and aside removed, at most 20,000 characters. */
  text: string
  /** The first 50 distinct http(s) links of the page. */
  links: WebLink[]
  /** What the capture never carries, plus what was cut. */
  omitted: string[]
}

declare module 'claude-code' {
  interface PluginState {
    web: {
      /** The herdr pane /web opened in this session; '' when none. */
      pane: string
    }
  }
}
