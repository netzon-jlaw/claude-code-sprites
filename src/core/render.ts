/**
 * Render a sprite to ANSI escape sequences.
 */
import type { Sprite } from "./sprite.js";
import { resolveSprite, type ResolvedCell } from "./resolve.js";
import { hexToRgb, hexTo256 } from "./color.js";

export type ColorMode = "truecolor" | "256";

export const RESET = "\x1b[0m";

/** Choose the color mode from the environment. */
export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  const ct = (env.COLORTERM ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return "truecolor";
  const term = (env.TERM ?? "").toLowerCase();
  const prog = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (term.includes("truecolor") || term.includes("24bit")) return "truecolor";
  if (["iterm.app", "vscode", "ghostty", "wezterm", "hyper", "apple_terminal"].includes(prog)) return "truecolor";
  if (env.KITTY_WINDOW_ID || env.ALACRITTY_WINDOW_ID || env.WT_SESSION) return "truecolor";
  return "256";
}

export function fgCode(hex: string, mode: ColorMode): string {
  if (mode === "256") return `\x1b[38;5;${hexTo256(hex)}m`;
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bgCode(hex: string, mode: ColorMode): string {
  if (mode === "256") return `\x1b[48;5;${hexTo256(hex)}m`;
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

export interface RenderOptions {
  colorMode?: ColorMode;
  /** Prefix each line (e.g. indentation). */
  indent?: string;
}

/**
 * Render one row of resolved cells to a string. Emits a colour code only when
 * it differs from the previous cell, and resets at the end of the line.
 */
export function renderRow(cells: readonly ResolvedCell[], colorMode: ColorMode): string {
  let out = "";
  let curFg: string | null = null, curBg: string | null = null;
  let dirty = false;
  for (const c of cells) {
    const wantFg = c.ch === " " ? null : c.fg;
    const wantBg = c.bg;
    if (wantBg !== curBg && wantBg === null) {
      // Dropping the background requires a full reset.
      out += RESET; curFg = null; curBg = null; dirty = false;
    }
    if (wantFg !== null && wantFg !== curFg) { out += fgCode(wantFg, colorMode); curFg = wantFg; dirty = true; }
    if (wantBg !== null && wantBg !== curBg) { out += bgCode(wantBg, colorMode); curBg = wantBg; dirty = true; }
    out += c.ch;
  }
  if (dirty) out += RESET;
  return out;
}

export function renderLines(s: Sprite, opts: RenderOptions = {}): string[] {
  const colorMode = opts.colorMode ?? detectColorMode();
  const indent = opts.indent ?? "";
  return resolveSprite(s).map((row) => indent + renderRow(row, colorMode));
}

export function renderAnsi(s: Sprite, opts: RenderOptions = {}): string {
  return renderLines(s, opts).join("\n") + "\n";
}

/** Plain text: block characters only, no colour codes. */
export function renderPlain(s: Sprite): string {
  return resolveSprite(s).map((row) => row.map((c) => c.ch).join("")).join("\n") + "\n";
}
