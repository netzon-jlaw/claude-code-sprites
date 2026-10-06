# sprite-party

The Claude Code plugin of the claude-code-sprites repository. Its manifest
name is `sprite-party` (names starting with `claude-` are reserved for
Anthropic's own plugins); its install folder is `claude-code-sprites`.

A party panel for Claude Code's subagents. Every subagent the Agent tool spawns
joins the party as one of seven sprites from this repository's `examples/`, and
a pane shows each one's mission, current move, HP (context left), MP (moves
taken), elapsed time and a guild ledger of XP that outlives the session.

The sprites are a rainbow family of flat pixel figures in the style of the
Claude Code mascot: one body color and two near-black eye slits, no mouth.
Each stands for a class, picked from the subagent's type:

| Sprite         | Class                 | Subagent types                              |
| -------------- | --------------------- | ------------------------------------------- |
| blue diamond   | Front-end             | guide, docs, web, UI and writing agents      |
| indigo rocket  | Back-end              | general-purpose and anything else            |
| pink bunny     | UX Design             | art, design and pixel agents                 |
| green clover   | Cloud & DevOps        | deploy, infra, setup and CI agents           |
| red crab       | Data Engineering      | Explore, search, research and fetch agents   |
| violet crown   | Security & Governance | review, verify, audit and test agents        |
| yellow lemon   | Project Management    | Plan and coordination agents                 |

It is a Claude Code plugin of function hooks: one folder, no build step, no
dependencies. It runs in the terminal and in the desktop app's Code tab.

## What you get

- **A `Party` pane** with one card per subagent: the sprite, its party name,
  class, agent type and model, the task description, what it is doing right
  now ("Casting npm test", "Studying src/app.ts", "Pondering the next move…"),
  and how long it has run.
- **HP and MP meters** under the sprite. HP is the share of the model's context
  window still free, green to gold to red. MP is moves left of a budget of 100
  tool calls. Hover a meter for the figures.
- **States.** A running card has a gold border and its sprite blinks. A
  finished one reads "Quest complete". A knocked-out one (interrupted, API
  error, or out of context) is drawn gray with red eyes and says why.
- **A transcript view.** "View transcript" on a card opens a detail view in the
  pane: status, full-width meters, the current move, model, time, tool uses,
  last move, the task it was given, its recent moves read live from its own
  conversation, and a link to its transcript file on disk.
- **Finished** is a collapsible list with a Clear button, and a **Guild** footer
  keeps XP, level, quests, knockouts and moves across sessions and projects.
- **`/party`** opens or focuses the pane.

## Install

Claude Code loads a plugin from a skills folder at session start. The plugin is
the `plugin/` folder of this repository; copy that folder, not the whole repo.

**For you, in every project:**

```bash
git clone https://github.com/netzon-jlaw/claude-code-sprites.git /tmp/claude-code-sprites
cp -R /tmp/claude-code-sprites/plugin ~/.claude/skills/claude-code-sprites
```

**For a repository, for everyone who opens it:** copy the folder to
`<repo>/.claude/skills/claude-code-sprites/` and commit it. If the
repository's `.gitignore` ignores `.claude/`, add a negation so the folder is
tracked.

**For one session only, without copying:**

```bash
claude --plugin-dir /path/to/claude-code-sprites/plugin
```

Then start a new Claude Code session (or restart the current one) and type
`/party`. The pane opened automatically at start waits for a wide window (144
columns in a terminal); the command seats it at any width. In a terminal the
pane docks beside the transcript in the fullscreen layout and otherwise opens
inline above the prompt.

To check an install:

```bash
claude plugin validate ~/.claude/skills/claude-code-sprites
claude plugin test ~/.claude/skills/claude-code-sprites
```

### Install with Claude Code

Paste this into a Claude Code session in the target repository:

```text
Install the sprite-party Claude Code plugin into this repository.

The plugin is the plugin/ folder of https://github.com/netzon-jlaw/claude-code-sprites

Steps:
1. Clone the repository to a temporary directory and copy its plugin/ folder to
   .claude/skills/claude-code-sprites/ in this repository, keeping its layout:
   .claude-plugin/plugin.json, hooks/, types/, tests/, scripts/ and README.md. Do not
   copy a .claude-plugin/types/ folder or a tsconfig.json if present; the engine writes
   those itself.
2. Run `claude plugin validate .claude/skills/claude-code-sprites` and `claude plugin test
   .claude/skills/claude-code-sprites`. Both must pass. Paste their output in your report.
3. Add a short "Claude Code plugins" section to this repository's README.md that says the
   party panel loads automatically in Claude Code sessions opened in this repo, that
   `/party` opens it, and links to .claude/skills/claude-code-sprites/README.md for
   details. If the repository has no README.md, create one with just that section.
4. If this repository's .gitignore ignores .claude/, add a negation so
   .claude/skills/claude-code-sprites/ is tracked.
5. Commit the new folder and the README change on a new branch and open a pull
   request. Do not merge it.

Do not change anything inside the plugin itself.
```

## Using it

- `/party` opens the pane with focus. Esc hands the keys back to the prompt.
- Hover an HP or MP meter for "Context: 142k left of 200k (71%)" or
  "Moves: 23 of 100 used".
- "View transcript" opens the detail view; "‹ Party" returns to the list.
  "Open the full transcript" at the bottom opens the agent's transcript file.
- "Finished n" expands the finished list; "Clear" empties it. The guild
  footer keeps counting.

## Changing the sprites

The seven sprites are compiled into `hooks/sprites.ts` from the `.sprite.json`
files in this repository's `examples/` (the format the `unicode-sprite` CLI
writes). Each must be a 16-wide quadrant-mode sprite with exactly one body
color plus the eye color `#2a1a14`. To swap one, edit or replace the file
(`unicode-sprite edit examples/crab.sprite.json`), or change the class-to-name
table in `scripts/build-sprites.mjs`, then regenerate:

```bash
node plugin/scripts/build-sprites.mjs                     # from examples/
node plugin/scripts/build-sprites.mjs path/to/sprites     # from another folder
node plugin/scripts/build-sprites.mjs examples preview.ppm # also write a preview image
```

Never edit `hooks/sprites.ts` by hand.

## How it works

- `hooks/register.tsx` is the whole plugin. It hooks `agent.spawn` to add a
  member, `tool.call` for moves, `turn.step` for context usage and knockouts,
  `turn.complete` for the outcome and guild XP, the `SubagentStart` settings
  hook for the transcript path, and `ui.render` for the pane.
- `hooks/sprites.ts` holds the seven sprites as generated by
  `scripts/build-sprites.mjs`; the desktop draws them as crisp SVGs.
- `hooks/mini.ts` draws the same sprites for the terminal in half blocks,
  bottom-aligned in a 16 by 12 grid, with the blink frame and the knocked-out
  look.
- `types/index.d.ts` declares the state the plugin keeps for the session. The
  guild ledger is also written to the plugin store, which is how it survives.
- Context windows are taken as 200k tokens, or 1M for a model id carrying
  `[1m]`.

## Developing

```bash
claude plugin validate plugin   # what the engine sees, and anything it would refuse
claude plugin test plugin       # tests/party.test.tsx on the terminal and desktop surfaces
```

A session that loaded the folder watches it: saving a file reloads the plugin.
Once it has loaded, `.claude-plugin/types/` holds this build's API declarations
and `tsc -p .` type-checks the plugin against them.

This plugin began as the `range-party` mod for
[jlawcordova.github.io](https://jlawcordova.github.io), with its seven Range
outfits swapped for this repository's sprites.
