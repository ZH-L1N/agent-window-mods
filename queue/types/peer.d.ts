// The values of other plugins this mod reads, declared for the type checker
// only, in the few fields it reads. Any plugin may read another's state; only
// its owner writes it. plugin.json names index.d.ts as this mod's contract,
// not this file. One block per owner, each under its own marker line (the
// word peer, a colon and the owner's name) and self-contained, so the commit
// gate can lift one out as a stub for an owner that is not in the repo, and
// check against the owner's real contract when it is.
export {}

// peer: agents
declare module 'claude-code' {
  interface PluginState {
    agents: {
      /**
       * The agents mod's runs: subagents (`kind` 'agent', or none on older
       * records), background shells, watches and crons. The queue reads only
       * `status` and `kind`, to hold its automatic send while a subagent runs.
       */
      runs: { status: string; kind?: string }[]
    }
  }
}
