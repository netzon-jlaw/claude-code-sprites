// The sprite-party plugin's state contract: what it keeps in `$.state` for the
// session. The hooks module imports these types from here.

/** One subagent of the session, as a party member. */
export type PartyMember = {
  /** The agent id `$.agent.list()` names it by. */
  id: string
  /** Its party name, given at spawn. */
  name: string
  /** Index into the party classes (0 Front-end … 6 Project Management), and so into SPRITES. */
  cls: number
  /** The subagent type it runs as (`Explore`, `general-purpose`, …). */
  type: string
  /** The model it resolved to. */
  model: string
  /** The Agent tool's short description of its task. */
  mission: string
  /** The start of the prompt it was given. */
  task?: string
  /** Its transcript file, once known (from the SubagentStart hook event). */
  transcriptPath?: string
  startedAt: number
  endedAt?: number
  status: 'run' | 'done' | 'ko'
  /** Why it stopped, once it has. */
  reason?: string
  /** Tool calls so far. */
  moves: number
  /** The tool of its latest move; absent while it thinks. */
  tool?: string
  /** What that move was aimed at (a command, a path, a pattern). */
  target?: string
  lastMoveAt: number
  /** Context tokens its last model request carried. */
  ctxTokens: number
  /** Its model's context window, in tokens. */
  ctxWindow: number
}

/** The guild ledger: XP earned across sessions, kept in `$.store` too. */
export type PartyGuild = {
  quests: number
  kos: number
  moves: number
  xp: number
}

declare module 'claude-code' {
  interface PluginState {
    'sprite-party': {
      members: PartyMember[]
      finishedOpen: boolean
      /** The member whose detail view the pane shows; null for the party list. */
      detail: string | null
      /** The clock the pane draws elapsed times against; ticks while someone runs. */
      now: number
      guild: PartyGuild
    }
  }
}
