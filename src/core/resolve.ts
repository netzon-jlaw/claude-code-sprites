/**
 * Resolve the pixels of one terminal cell to at most one foreground and one
 * background color. This is the only place the "two colors per cell" rule
 * is enforced, so renderers are correct by construction.
 */
import type { Pixel, Sprite, RenderMode } from "./sprite.js";
import { nearestHex } from "./color.js";
import { QUADRANT_CHARS, HALF_CHARS } from "./blocks.js";

export interface ResolvedCell {
  /** Character to print. */
  ch: string;
  /** Foreground color or null when the glyph is a space. */
  fg: string | null;
  /** Background color or null (transparent: emit no background code). */
  bg: string | null;
  /** True when the cell needed 3+ colors and some were merged. */
  conflict: boolean;
  /** Pixels as they will actually appear after merging, in cell order. */
  shown: Pixel[];
}

/**
 * Pick the two colors a cell will use. Returns them ranked by frequency, then
 * first-seen order, so the result is stable for the same input.
 */
export function pickTwoColors(pixels: readonly Pixel[]): { colors: string[]; conflict: boolean } {
  const counts = new Map<string, number>();
  for (const p of pixels) if (p !== null) counts.set(p, (counts.get(p) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const hasTransparent = pixels.some((p) => p === null);
  // With a transparent sub-pixel the cell can only show one color (foreground).
  const limit = hasTransparent ? 1 : 2;
  return { colors: ranked.slice(0, limit), conflict: ranked.length > limit };
}

/**
 * Resolve a list of sub-pixels (length 2 for half mode, 4 for quadrant mode,
 * in cell order) to a glyph and a colour pair.
 */
export function resolveCell(pixels: readonly Pixel[], mode: RenderMode): ResolvedCell {
  const { colors, conflict } = pickTwoColors(pixels);
  const chars = mode === "half" ? HALF_CHARS : QUADRANT_CHARS;
  if (colors.length === 0) {
    return { ch: " ", fg: null, bg: null, conflict: false, shown: pixels.map(() => null) };
  }
  // Snap each opaque pixel to the nearest of the chosen colours.
  const shown: Pixel[] = pixels.map((p) => (p === null ? null : colors.length === 1 ? colors[0] : nearestHex(p, colors)));
  const fg = colors[0];
  const bg = colors.length === 2 ? colors[1] : null;
  let mask = 0;
  shown.forEach((p, i) => { if (p === fg) mask |= 1 << i; });
  const full = (1 << pixels.length) - 1;
  if (mask === full && bg === null) return { ch: "█", fg, bg: null, conflict, shown };
  if (mask === full) return { ch: "█", fg, bg, conflict, shown }; // unreachable in practice (bg would be unused)
  return { ch: chars[mask], fg, bg, conflict, shown };
}

/** Sub-pixels of the cell at (cx, cy) in cell order; out-of-range pixels are transparent. */
export function cellPixels(s: Sprite, cx: number, cy: number): Pixel[] {
  const get = (x: number, y: number): Pixel => (x < s.width && y < s.height ? s.pixels[y][x] : null);
  if (s.mode === "half") {
    return [get(cx, cy * 2), get(cx, cy * 2 + 1)];
  }
  const x = cx * 2, y = cy * 2;
  return [get(x, y), get(x + 1, y), get(x, y + 1), get(x + 1, y + 1)];
}

export function cellSize(s: Sprite): { cols: number; rows: number } {
  return s.mode === "half"
    ? { cols: s.width, rows: Math.ceil(s.height / 2) }
    : { cols: Math.ceil(s.width / 2), rows: Math.ceil(s.height / 2) };
}

/** Pixel -> cell coordinate. */
export function cellOf(s: Sprite, x: number, y: number): { cx: number; cy: number } {
  return s.mode === "half" ? { cx: x, cy: Math.floor(y / 2) } : { cx: Math.floor(x / 2), cy: Math.floor(y / 2) };
}

/** Resolve every cell. */
export function resolveSprite(s: Sprite): ResolvedCell[][] {
  const { cols, rows } = cellSize(s);
  const out: ResolvedCell[][] = [];
  for (let cy = 0; cy < rows; cy++) {
    const row: ResolvedCell[] = [];
    for (let cx = 0; cx < cols; cx++) row.push(resolveCell(cellPixels(s, cx, cy), s.mode));
    out.push(row);
  }
  return out;
}

/** True if the pixel at (x, y) sits in a cell that had to merge colours. */
export function conflictMap(s: Sprite): boolean[][] {
  const cells = resolveSprite(s);
  const map: boolean[][] = [];
  for (let y = 0; y < s.height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < s.width; x++) {
      const { cx, cy } = cellOf(s, x, y);
      row.push(cells[cy][cx].conflict);
    }
    map.push(row);
  }
  return map;
}
