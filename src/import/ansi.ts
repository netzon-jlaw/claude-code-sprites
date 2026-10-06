/**
 * ANSI import: parse SGR colour codes and block characters back into pixels.
 *
 * Handles 24-bit (38;2 / 48;2), 256-colour (38;5 / 48;5) and the basic 16
 * colours. Characters other than known block glyphs become transparent (or a
 * full block of the background if one is set).
 */
import { createSprite, type Sprite, type RenderMode } from "../core/sprite.js";
import { QUADRANT_MASK, HALF_MASK } from "../core/blocks.js";
import { rgbToHex } from "../core/color.js";

const BASIC16 = [
  "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
  "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
];

export function xterm256ToHex(n: number): string {
  if (n < 16) return BASIC16[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return rgbToHex({ r: v, g: v, b: v }); }
  const i = n - 16;
  const cube = [0, 95, 135, 175, 215, 255];
  return rgbToHex({ r: cube[Math.floor(i / 36)], g: cube[Math.floor(i / 6) % 6], b: cube[i % 6] });
}

interface Cell { ch: string; fg: string | null; bg: string | null }

/** Tokenise ANSI text into a grid of characters with their active colours. */
export function parseAnsiCells(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let fg: string | null = null, bg: string | null = null;
  let row: Cell[] = [];
  const chars = [...text.replace(/\r\n?/g, "\n")];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "\x1b" && chars[i + 1] === "[") {
      let j = i + 2, params = "";
      while (j < chars.length && /[0-9;:]/.test(chars[j])) params += chars[j++];
      const final = chars[j];
      i = j;
      if (final !== "m") continue; // ignore non-SGR sequences
      const p = params === "" ? [0] : params.split(/[;:]/).map((v) => (v === "" ? 0 : Number(v)));
      for (let k = 0; k < p.length; k++) {
        const code = p[k];
        if (code === 0) { fg = null; bg = null; }
        else if (code === 39) fg = null;
        else if (code === 49) bg = null;
        else if (code === 38 || code === 48) {
          let hex: string | null = null;
          if (p[k + 1] === 2) { hex = rgbToHex({ r: p[k + 2] ?? 0, g: p[k + 3] ?? 0, b: p[k + 4] ?? 0 }); k += 4; }
          else if (p[k + 1] === 5) { hex = xterm256ToHex(p[k + 2] ?? 0); k += 2; }
          if (code === 38) fg = hex; else bg = hex;
        }
        else if (code >= 30 && code <= 37) fg = BASIC16[code - 30];
        else if (code >= 90 && code <= 97) fg = BASIC16[code - 90 + 8];
        else if (code >= 40 && code <= 47) bg = BASIC16[code - 40];
        else if (code >= 100 && code <= 107) bg = BASIC16[code - 100 + 8];
      }
      continue;
    }
    if (ch === "\n") { rows.push(row); row = []; continue; }
    row.push({ ch, fg, bg });
  }
  if (row.length) rows.push(row);
  return rows;
}

export interface AnsiImportOptions { mode?: RenderMode; name?: string }

/** Guess the mode: half if no quadrant-only glyphs appear. */
function guessMode(cells: Cell[][]): RenderMode {
  for (const row of cells) for (const c of row) if (QUADRANT_MASK.has(c.ch) && !HALF_MASK.has(c.ch)) return "quadrant";
  return "half";
}

export function importAnsi(text: string, opts: AnsiImportOptions = {}): Sprite {
  const cells = parseAnsiCells(text);
  // Drop trailing blank rows and leading/trailing all-blank lines.
  while (cells.length && cells[cells.length - 1].every((c) => c.ch === " " && !c.bg)) cells.pop();
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const rows = Math.max(1, cells.length);
  const mode = opts.mode ?? guessMode(cells);
  const s = mode === "half" ? createSprite(cols, rows * 2, "half", opts.name) : createSprite(cols * 2, rows * 2, "quadrant", opts.name);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cells[cy]?.[cx];
      if (!c) continue;
      const masks = mode === "half" ? HALF_MASK : QUADRANT_MASK;
      const n = mode === "half" ? 2 : 4;
      let mask = masks.get(c.ch);
      let fg = c.fg;
      if (mask === undefined) {
        // Unknown glyph: treat as background only (any non-space char shows some fg, but we can't map it).
        mask = c.ch === " " ? 0 : (1 << n) - 1;
        if (c.ch !== " " && !fg) fg = "#ffffff";
      }
      for (let i = 0; i < n; i++) {
        const isFg = (mask >> i) & 1;
        const color = isFg ? fg : c.bg;
        if (!color) continue;
        if (mode === "half") s.pixels[cy * 2 + i][cx] = color;
        else s.pixels[cy * 2 + (i >> 1)][cx * 2 + (i & 1)] = color;
      }
    }
  }
  return s;
}
