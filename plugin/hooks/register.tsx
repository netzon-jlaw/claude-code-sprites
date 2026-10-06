// sprite-party: a party panel for the session's subagents.
//
// Every subagent the Agent tool spawns joins the party as one of seven
// sprites (crab, lemon, clover, diamond, rocket, crown, bunny: flat two-color
// pixel figures in the style of the Claude Code mascot, compiled from the
// repository's examples/ into ./sprites.ts), each standing for a class. The
// pane shows each member's mission, its current move, HP (context left), MP
// (moves taken), elapsed time, and a guild ledger of XP that outlives the
// session.
import { atom, read, update } from 'claude-code'
import type { ModelUsage, Register, TurnStopReason } from 'claude-code'

import type { PartyGuild, PartyMember } from '../types'
import { MINI_H, MINI_W, miniPixels } from './mini'
import { KEYS, PALETTE, SPRITES } from './sprites'

const PANE = 'sprite-party'
const STORE_KEY = 'guild'
const MOVE_BUDGET = 100
/** CSS pixels per art pixel on surfaces that draw SVG, and the sprite's width then. */
const SPRITE_SCALE = 4
const SPRITE_PX = 16 * SPRITE_SCALE

const members = atom({ plugin: 'sprite-party', key: 'members' } as const, [])
const finishedOpen = atom({ plugin: 'sprite-party', key: 'finishedOpen' } as const, false)
const detail = atom({ plugin: 'sprite-party', key: 'detail' } as const, null)
const now = atom({ plugin: 'sprite-party', key: 'now' } as const, 0)
const guild = atom({ plugin: 'sprite-party', key: 'guild' } as const, { quests: 0, kos: 0, moves: 0, xp: 0 })

// ------------------------------------------------------------------ flavour

const NAMES = ['Pip', 'Oren', 'Brann', 'Sera', 'Kip', 'Wren', 'Tam', 'Nell', 'Jory', 'Ilse', 'Dax', 'Mira', 'Rook', 'Fen', 'Lio', 'Vesna']

/** Class index for a subagent type: by what the type is for. */
export function classOf(type: string): number {
  const t = type.toLowerCase()
  if (/plan|manage|coordinat/.test(t)) return 6 // Project Management
  if (/explore|search|research|find|fetch/.test(t)) return 4 // Data Engineering
  if (/review|verif|secur|guard|audit|test/.test(t)) return 5 // Security & Governance
  if (/art|design|ux|pixel|draw|paint/.test(t)) return 2 // UX Design
  if (/deploy|devops|cloud|infra|setup|statusline|ops|ci/.test(t)) return 3 // Cloud & DevOps
  if (/guide|doc|front|web|ui|write/.test(t)) return 0 // Front-end
  return 1 // Back-end: general-purpose and the rest
}

const VERBS: Record<string, string> = {
  Bash: 'Casting',
  Read: 'Studying',
  Edit: 'Forging',
  Write: 'Forging',
  NotebookEdit: 'Forging',
  Grep: 'Scouting',
  Glob: 'Mapping',
  WebFetch: 'Scouting afar',
  WebSearch: 'Scouting afar',
  Agent: 'Summoning',
  Skill: 'Reading the tome',
}

/** What a move was aimed at, from the tool's own arguments. */
export function targetOf(tool: string, args: Record<string, unknown>): string {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = args[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }
  switch (tool) {
    case 'Bash':
      return pick('description', 'command')
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return pick('file_path', 'notebook_path')
    case 'Grep':
    case 'Glob':
      return pick('pattern')
    case 'WebFetch':
    case 'WebSearch':
      return pick('url', 'query')
    case 'Agent':
      return pick('description')
    case 'Skill':
      return pick('skill')
    default:
      return pick('description', 'query', 'path', 'file_path', 'command')
  }
}

/** `claude-sonnet-5-5` → `Sonnet 5.5`; an alias stays as given. */
export function prettyModel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  if (!m) return id
  return `${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}`
}

const windowOf = (model: string) => (/\[1m\]|-1m\b/.test(model) ? 1_000_000 : 200_000)

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}
const fmtK = (n: number) => (n >= 100_000 ? `${Math.round(n / 1000)}k` : `${Math.round(n / 100) / 10}k`)
const clamp = (frac: number) => Math.max(0, Math.min(1, frac))
/** The terminal's meter: a thin line, the filled part in color over a dim track. */
const bar = (frac: number, cells: number) => {
  const on = Math.round(clamp(frac) * cells)
  return { on: '━'.repeat(on), off: '─'.repeat(cells - on) }
}
/** The desktop's meter: the design's 4px pill, a light track with the fill on it. */
const pillSvg = (frac: number, color: string, width: number) => {
  const on = Math.round(clamp(frac) * width)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="6" viewBox="0 0 ${width} 6"><rect x="0" y="1" width="${width}" height="4" rx="2" fill="#E8E6DC"/>${on > 0 ? `<rect x="0" y="1" width="${on}" height="4" rx="2" fill="${color}"/>` : ''}</svg>`
}
const level = (xp: number) => Math.floor(Math.sqrt(xp / 25)) + 1

// ------------------------------------------------------------------ sprites

const hexToInt = (hex: string) => parseInt(hex.slice(1), 16)
/** The knocked-out look: the artifact's washed-out gray. */
const gray = (hex: string) => {
  const n = hexToInt(hex)
  const y = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
  const v = Math.min(255, Math.round(y * 0.6 + 80)).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
}
const colorAt = (row: string, x: number, ko: boolean): string | undefined => {
  const ch = row.charAt(x)
  if (ch === '.' || ch === '') return undefined
  const hex = PALETTE[KEYS.indexOf(ch)]
  return hex === undefined ? undefined : ko ? gray(hex) : hex
}

/** An SVG of the sprite, one rect per run of a color, drawn pixel-crisp. */
export function svgOf(cls: number, ko: boolean, scale: number): { source: string; width: number; height: number } {
  const sp = SPRITES[cls] ?? SPRITES[1]!
  let rects = ''
  sp.rows.forEach((row, y) => {
    let x = 0
    while (x < sp.w) {
      const c = colorAt(row, x, ko)
      let run = 1
      while (x + run < sp.w && colorAt(row, x + run, ko) === c) run++
      if (c !== undefined) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`
      x += run
    }
  })
  const width = sp.w * scale
  const height = sp.h * scale
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sp.w} ${sp.h}" width="${width}" height="${height}" shape-rendering="crispEdges">${rects}</svg>`
  return { source, width, height }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += b === undefined ? '=' : B64.charAt((n >> 6) & 63)
    out += c === undefined ? '=' : B64.charAt(n & 63)
  }
  return out
}

const DEFAULT = 0x01000000
/**
 * The terminal's sprite as cells: the small 2D figure (./mini.ts), two pixels
 * per cell with half blocks, on `frame` 0 or 1 of its idle fidget.
 */
export function rasterOf(cls: number, ko: boolean, frame: number): { columns: number; rows: number; cells: string } {
  const grid = miniPixels(cls, frame, ko)
  const rows = Math.ceil(MINI_H / 2)
  const words = new Uint32Array(MINI_W * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < MINI_W; x++) {
      const top = grid[2 * r]?.[x]
      const bottom = grid[2 * r + 1]?.[x]
      // Foreground glyphs wherever possible: a painted background shows the
      // terminal's line gap as a stripe between rows. Only a two-tone cell
      // needs one.
      let cp = 0x20
      let fg = DEFAULT
      let bg = DEFAULT
      if (top !== undefined && bottom !== undefined && top === bottom) {
        cp = 0x2588
        fg = hexToInt(top)
      } else if (top !== undefined && bottom !== undefined) {
        cp = 0x2580
        fg = hexToInt(top)
        bg = hexToInt(bottom)
      } else if (top !== undefined) {
        cp = 0x2580
        fg = hexToInt(top)
      } else if (bottom !== undefined) {
        cp = 0x2584
        fg = hexToInt(bottom)
      }
      const at = (r * MINI_W + x) * 3
      words[at] = cp
      words[at + 1] = fg
      words[at + 2] = bg
    }
  }
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, i) => {
    bytes[i * 4] = w & 255
    bytes[i * 4 + 1] = (w >> 8) & 255
    bytes[i * 4 + 2] = (w >> 16) & 255
    bytes[i * 4 + 3] = (w >>> 24) & 255
  })
  return { columns: MINI_W, rows, cells: base64(bytes) }
}

// ------------------------------------------------------------------- colors
// The site's own tokens and world palette (src/styles/variables.css,
// src/assets/pixel-art/source/palette.mjs).
const INK_MUTED = '#8A7A60' // path-4
const GOLD = '#D8B66A'
const GREEN = '#6F8F55' // grass-3
const RED = '#C25A6A' // roof-1
const WATER = '#5F8C7E' // water-3

const isGuild = (v: unknown): v is PartyGuild =>
  typeof v === 'object' && v !== null && ['quests', 'kos', 'moves', 'xp'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number')

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'party', description: 'Show the subagent party panel (mascots, HP, MP, guild XP)' })
    const saved = await $.store.get(STORE_KEY)
    if (isGuild(saved)) await update($, guild, () => saved)
    if (e.isInteractive) void $.ui.open({ id: PANE, title: 'Party' })
    $.clock.every(1000, async () => {
      const list = await read($, members)
      if (list.some((m) => m.status === 'run')) await update($, now, () => Date.now())
    })
    return next(e)
  })

  on('command.run', { command: 'party' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Party', focus: true })
    const list = await read($, members)
    const running = list.filter((m) => m.status === 'run').length
    return { text: running === 0 ? 'Party panel opened. Your party is resting.' : `Party panel opened: ${running} on a quest.` }
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.agentId === undefined) return ran
    const id = ran.agentId
    const at = Date.now()
    await update($, members, (list) => {
      if (list.some((m) => m.id === id)) return list
      const member: PartyMember = {
        id,
        name: e.name ?? NAMES[list.length % NAMES.length]!,
        cls: classOf(e.subagentType),
        type: e.subagentType,
        model: ran.model,
        mission: e.description,
        task: e.prompt.length > 400 ? `${e.prompt.slice(0, 400)}…` : e.prompt,
        startedAt: at,
        status: 'run',
        moves: 0,
        lastMoveAt: at,
        ctxTokens: 0,
        ctxWindow: windowOf(ran.model),
      }
      return [...list, member].slice(-40)
    })
    await update($, now, () => at)
    return ran
  })

  // The settings-hook event carries the session's transcript path; the
  // subagent's own sits beside it as <session>/subagents/agent-<id>.jsonl.
  on('classic.SubagentStart', async ($, e, next) => {
    const id = e.agent_id
    const main = e.transcript_path
    if (main.endsWith('.jsonl')) {
      const transcriptPath = `${main.slice(0, -'.jsonl'.length)}/subagents/agent-${id}.jsonl`
      await update($, members, (all) => all.map((m) => (m.id === id ? { ...m, transcriptPath } : m)))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    const list = await read($, members)
    if (!list.some((m) => m.id === id && m.status === 'run')) return next(e)
    const tool = String(e.tool)
    const target = targetOf(tool, e as unknown as Record<string, unknown>)
    const at = Date.now()
    await update($, members, (all) => all.map((m) => (m.id === id ? { ...m, moves: m.moves + 1, tool, target, lastMoveAt: at } : m)))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)
    const list = await read($, members)
    if (!list.some((m) => m.id === id && m.status === 'run')) return yield* next(e)
    // A new request: the member is thinking until its next tool call.
    await update($, members, (all) => all.map((m) => (m.id === id ? { ...m, tool: undefined, target: undefined } : m)))
    const stream = next(e)
    let usage: ModelUsage | null = null
    let stop: TurnStopReason = null
    for await (const chunk of stream) {
      if (chunk.kind === 'stop') {
        usage = chunk.usage
        stop = chunk.stopReason
      }
      yield chunk
    }
    const result = await stream.result
    const seen = usage
    if (seen !== null) {
      const ctxTokens = seen.input_tokens + seen.cache_read_input_tokens + seen.cache_creation_input_tokens
      const out = stop === 'model_context_window_exceeded'
      const at = Date.now()
      await update($, members, (all) =>
        all.map((m) => (m.id === id ? { ...m, ctxTokens, ...(out ? { status: 'ko' as const, reason: 'ran out of context', endedAt: at } : {}) } : m)),
      )
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    const list = await read($, members)
    const member = list.find((m) => m.id === id && m.status === 'run')
    if (member === undefined) return next(e)
    const at = Date.now()
    const done = e.reason === 'answer'
    const reason = done ? undefined : e.reason === 'aborted' ? 'interrupted' : e.reason === 'refusal' ? 'refused' : 'an API error'
    await update($, members, (all) =>
      all.map((m) => (m.id === id ? { ...m, status: done ? ('done' as const) : ('ko' as const), reason, endedAt: at } : m)),
    )
    const ledger = await update($, guild, (g) => ({
      quests: g.quests + (done ? 1 : 0),
      kos: g.kos + (done ? 0 : 1),
      moves: g.moves + member.moves,
      xp: g.xp + (done ? 10 : 2) + Math.floor(member.moves / 10),
    }))
    await $.store.set(STORE_KEY, ledger)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = await read($, members)
    const open = await read($, finishedOpen)
    const clock = await read($, now)
    const ledger = await read($, guild)
    const detailId = await read($, detail)
    const width = Math.max(24, e.props.bodyColumns)
    const terminal = e.surface === 'terminal'
    const stacked = terminal && width < 40
    // The avatar column: the mascot's 16 cells on the terminal, the 64px SVG
    // elsewhere; the bars under it take that width and no more, as in the
    // design.
    const avatarCols = terminal ? MINI_W : 8
    const textCols = stacked ? width - 2 : width - avatarCols - 6
    // The terminal figure's idle fidget: a frame per second while it runs.
    const frameOf = (m: PartyMember) => (m.status === 'run' ? Math.floor(clock / 1000) % 2 : 0)

    const figure = (m: PartyMember) => {
      const ko = m.status === 'ko'
      const sp = SPRITES[m.cls] ?? SPRITES[1]!
      const alt = `${sp.name} (${sp.cls})${ko ? ', knocked out' : ''}`
      if (e.surface === 'terminal') {
        const { Raster } = $.ui.resolve(e)
        const r = rasterOf(m.cls, ko, frameOf(m))
        return <Raster key={`sprite-${m.id}`} columns={r.columns} rows={r.rows} cells={r.cells} />
      }
      const { Svg } = $.ui.resolve(e)
      const s = svgOf(m.cls, ko, SPRITE_SCALE)
      return <Svg source={s.source} alt={alt} width={s.width} height={s.height} />
    }

    const statsOf = (m: PartyMember) => {
      const hp = m.ctxWindow > 0 ? Math.max(0, 1 - m.ctxTokens / m.ctxWindow) : 1
      const mp = Math.max(0, 1 - m.moves / MOVE_BUDGET)
      const hpColor = hp > 0.5 ? GREEN : hp > 0.2 ? GOLD : RED
      const endAt = m.endedAt ?? Math.max(clock, m.startedAt)
      let action: string
      let actionColor = INK_MUTED
      if (m.status === 'done') {
        action = 'Quest complete'
        actionColor = GREEN
      } else if (m.status === 'ko') {
        action = `Knocked out: ${m.reason ?? 'stopped'}`
        actionColor = RED
      } else if (m.tool === undefined) {
        action = 'Pondering the next move…'
      } else {
        action = `${VERBS[m.tool] ?? 'Using'} ${m.target ? m.target : m.tool}`
      }
      const ctxLeft = fmtK(Math.max(0, m.ctxWindow - m.ctxTokens))
      const hpTip = `Context: ${ctxLeft} left of ${fmtK(m.ctxWindow)} (${Math.round(hp * 100)}%)`
      const mpTip = `Moves: ${m.moves} of ${MOVE_BUDGET} used (${Math.round(mp * 100)}% left)`
      const idle = m.status === 'run' ? fmtTime(Math.max(0, endAt - m.lastMoveAt)) : undefined
      return { hp, mp, hpColor, endAt, action, actionColor, ctxLeft, hpTip, mpTip, idle, cls: SPRITES[m.cls]?.cls ?? 'Back-end' }
    }

    // A bar in color over a light track; its figures appear in a tip beside
    // it on hover. `cols` cells wide on the terminal, `px` wide elsewhere.
    const meter = (key: string, frac: number, color: string, tip: string, label: string, cols = avatarCols, px = SPRITE_PX) => {
      let drawn
      if (e.surface === 'terminal') {
        const b = bar(frac, cols)
        drawn = (
          <Text>
            <Text color={color}>{b.on}</Text>
            <Text dimColor>{b.off}</Text>
          </Text>
        )
      } else {
        const { Svg } = $.ui.resolve(e)
        drawn = <Svg source={pillSvg(frac, color, px)} alt={`${label}: ${tip}`} width={px} height={6} />
      }
      return (
        <Box key={key} flexDirection="row">
          {drawn}
          <Box position="absolute" top={0} left={cols + 1} display="none" hover={{ display: 'flex' }} paddingX={1} backgroundColor="#2E2418">
            <Text color="#F4EDE0">{tip}</Text>
          </Box>
        </Box>
      )
    }

    const transcriptLink = (m: PartyMember, label: string) => {
      if (m.transcriptPath === undefined) return null
      const href = `file://${encodeURI(m.transcriptPath)}`
      return <Markdown text={`[${label}](${href})`} />
    }

    // ---------------------------------------------------------- detail view
    const focus = detailId === null ? undefined : list.find((m) => m.id === detailId)
    if (focus !== undefined) {
      const m = focus
      const s = statsOf(m)
      let moves: { tool: string; target: string }[] = []
      let movesNote: string | undefined
      try {
        const got = await $.session.messages({ agentId: m.id })
        if ('deny' in got) movesNote = `Moves unavailable: ${got.deny}`
        else {
          moves = got
            .flatMap((msg) => msg.toolUses.map((t) => ({ tool: t.tool, target: targetOf(t.tool, t.input) })))
            .slice(-8)
            .reverse()
        }
      } catch (err) {
        movesNote = `Moves unavailable: ${err instanceof Error ? err.message : String(err)}`
      }
      const tile = (label: string, value: string) => (
        <Box flexDirection="column" paddingX={1} borderStyle="round" borderDimColor>
          <Text dimColor>{label}</Text>
          <Text>{value}</Text>
        </Box>
      )
      const barCols = Math.max(8, width - 4)
      const barPx = Math.max(SPRITE_PX, Math.min(360, barCols * 7))
      return (
        <Box flexDirection="column" gap={1} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Button key="back" plain onPress={() => update($, detail, () => null)}>
              ‹ Party
            </Button>
            <Text color={s.actionColor}>{m.status === 'run' ? 'Running' : m.status === 'done' ? 'Complete' : 'Knocked out'}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Box flexShrink={0} width={avatarCols}>
              {figure(m)}
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} width={textCols}>
              <Text bold>{m.name}</Text>
              <Text dimColor wrap="truncate-end">
                {s.cls} · {m.type} ({prettyModel(m.model)})
              </Text>
              <Text wrap="wrap">{m.mission}</Text>
            </Box>
          </Box>
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Context</Text>
              <Text dimColor>
                {s.ctxLeft} left of {fmtK(m.ctxWindow)}
              </Text>
            </Box>
            {meter(`hp-${m.id}`, s.hp, s.hpColor, s.hpTip, 'HP', barCols, barPx)}
            <Box flexDirection="row" justifyContent="space-between" marginTop={terminal ? 0 : 1}>
              <Text>Moves</Text>
              <Text dimColor>
                {m.moves} of {MOVE_BUDGET}
              </Text>
            </Box>
            {meter(`mp-${m.id}`, s.mp, WATER, s.mpTip, 'MP', barCols, barPx)}
            {m.status === 'run' && s.hp <= 0.2 && (
              <Text color={RED} wrap="wrap">
                Low on context. {m.name} may stop before finishing.
              </Text>
            )}
          </Box>
          <Box flexDirection="column">
            <Text dimColor>Now</Text>
            <Text color={s.actionColor} wrap="wrap">
              {s.action}
            </Text>
          </Box>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {tile('Model', prettyModel(m.model))}
            {tile('Time', fmtTime(s.endAt - m.startedAt))}
            {tile('Tool uses', String(m.moves))}
            {tile('Last move', s.idle === undefined ? '—' : `${s.idle} ago`)}
          </Box>
          <Box flexDirection="column">
            <Text dimColor>Task</Text>
            <Text wrap="wrap">{m.task ?? m.mission}</Text>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>Recent moves</Text>
            {movesNote !== undefined && <Text dimColor wrap="wrap">{movesNote}</Text>}
            {movesNote === undefined && moves.length === 0 && <Text dimColor>No moves yet.</Text>}
            {moves.map((mv, i) => (
              <Box key={`move-${m.id}-${i}`} flexDirection="row" gap={1}>
                <Box width={13} flexShrink={0}>
                  <Text wrap="truncate-end">{mv.tool}</Text>
                </Box>
                <Text dimColor wrap="truncate-end">
                  {mv.target}
                </Text>
              </Box>
            ))}
          </Box>
          {transcriptLink(m, 'Open the full transcript')}
        </Box>
      )
    }

    // ----------------------------------------------------------- party list
    const card = (m: PartyMember) => {
      const s = statsOf(m)
      return (
        <Box key={`card-${m.id}`} flexDirection={stacked ? 'column' : 'row'} gap={1} paddingX={1} borderStyle="round" borderColor={m.status === 'run' ? GOLD : INK_MUTED} borderDimColor={m.status !== 'run'}>
          <Box flexDirection="column" flexShrink={0} width={avatarCols} alignItems="flex-start">
            {figure(m)}
            <Box flexDirection="column" marginTop={terminal ? 0 : 1}>
              {meter(`hp-${m.id}`, s.hp, s.hpColor, s.hpTip, 'HP')}
              {meter(`mp-${m.id}`, s.mp, WATER, s.mpTip, 'MP')}
            </Box>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} width={textCols}>
            <Box flexDirection="row" gap={1}>
              <Text bold>{m.name}</Text>
              <Text dimColor wrap="truncate-end">
                {s.cls} · {m.type} ({prettyModel(m.model)})
              </Text>
            </Box>
            <Text wrap="truncate-end">{m.mission}</Text>
            <Text color={s.actionColor} wrap="truncate-end">
              {s.action}
            </Text>
            <Box flexDirection="row" gap={1}>
              <Text dimColor wrap="truncate-end">
                {fmtTime(s.endAt - m.startedAt)}
                {s.idle === undefined ? '' : ` · last move ${s.idle} ago`}
              </Text>
              <Button key={`view-${m.id}`} plain dimColor onPress={() => update($, detail, () => m.id)}>
                View transcript
              </Button>
            </Box>
          </Box>
        </Box>
      )
    }

    const running = list.filter((m) => m.status === 'run')
    const finished = list.filter((m) => m.status !== 'run').reverse()
    return (
      <Box flexDirection="column" gap={0} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Party</Text>
          <Text dimColor>Running {running.length}</Text>
        </Box>
        {running.length === 0 && (
          <Box paddingY={1}>
            <Text dimColor wrap="wrap">
              No sub-agents running. Your party is resting.
            </Text>
          </Box>
        )}
        <Box flexDirection="column" gap={1}>
          {running.map(card)}
        </Box>
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Button key="toggle-finished" plain dimColor onPress={() => update($, finishedOpen, (v) => !v)}>
            {`${open ? '▾' : '▸'} Finished ${finished.length}`}
          </Button>
          {finished.length > 0 && (
            <Button key="clear-finished" plain dimColor onPress={() => update($, members, (all) => all.filter((m) => m.status === 'run'))}>
              Clear
            </Button>
          )}
        </Box>
        {open && (
          <Box flexDirection="column" gap={1}>
            {finished.map(card)}
          </Box>
        )}
        <Box marginTop={1} borderStyle="single" borderDimColor paddingX={1}>
          <Text dimColor wrap="truncate-end">
            {`Guild · Lv ${level(ledger.xp)} · ${ledger.xp} XP · ${ledger.quests} quests · ${ledger.kos} KO · ${ledger.moves} moves`}
          </Text>
        </Box>
      </Box>
    )
  })
}
