/**
 * The sprite data model and its JSON form.
 *
 * Pixels are "#rrggbb" strings or null (transparent). In the JSON file a pixel
 * may also be a palette name, which is resolved on load.
 */
import { normalizeHex, isHex } from "./color.js";
import { paletteByName } from "./palette.js";

export type Pixel = string | null;
export type RenderMode = "half" | "quadrant";

export interface Sprite {
  version: 1;
  name?: string;
  width: number;
  height: number;
  mode: RenderMode;
  /** Optional named colors local to this file, e.g. { "skin": "#d77757" }. */
  palette?: Record<string, string>;
  pixels: Pixel[][];
}

export const MAX_DIM = 512;

export function createSprite(width: number, height: number, mode: RenderMode = "quadrant", name?: string): Sprite {
  assertDim(width, height);
  const pixels: Pixel[][] = [];
  for (let y = 0; y < height; y++) pixels.push(new Array<Pixel>(width).fill(null));
  const s: Sprite = { version: 1, width, height, mode, pixels };
  if (name) s.name = name;
  return s;
}

export function assertDim(width: number, height: number): void {
  for (const [label, v] of [["width", width], ["height", height]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > MAX_DIM) {
      throw new Error(`${label} must be an integer between 1 and ${MAX_DIM}, got ${v}`);
    }
  }
}

export function cloneSprite(s: Sprite): Sprite {
  return { ...s, palette: s.palette ? { ...s.palette } : undefined, pixels: s.pixels.map((r) => r.slice()) };
}

export function inBounds(s: Sprite, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.width && y < s.height;
}

export function getPixel(s: Sprite, x: number, y: number): Pixel {
  return inBounds(s, x, y) ? s.pixels[y][x] : null;
}

/** Mutates in place. Returns true if the pixel changed. */
export function setPixel(s: Sprite, x: number, y: number, color: Pixel): boolean {
  if (!inBounds(s, x, y)) return false;
  const v = color === null ? null : normalizeHex(color);
  if (s.pixels[y][x] === v) return false;
  s.pixels[y][x] = v;
  return true;
}

/** Returns a new sprite resized to the given dimensions, anchored top-left. */
export function resizeSprite(s: Sprite, width: number, height: number): Sprite {
  assertDim(width, height);
  const out = createSprite(width, height, s.mode, s.name);
  if (s.palette) out.palette = { ...s.palette };
  for (let y = 0; y < Math.min(height, s.height); y++) {
    for (let x = 0; x < Math.min(width, s.width); x++) out.pixels[y][x] = s.pixels[y][x];
  }
  return out;
}

// ---------- JSON ----------

export const FILE_EXT = ".sprite.json";

/** Resolve a stored pixel value to "#rrggbb" or null. */
function resolvePixel(v: unknown, local: Record<string, string> | undefined, where: string): Pixel {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (typeof v !== "string") throw new Error(`Invalid pixel at ${where}: ${JSON.stringify(v)}`);
  if (local && v in local) return normalizeHex(local[v]);
  const p = paletteByName(v);
  if (p) return p.hex;
  if (isHex(v)) return normalizeHex(v);
  throw new Error(`Unknown color at ${where}: ${v}`);
}

export function parseSprite(text: string): Sprite {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`Not valid JSON: ${(e as Error).message}`); }
  return fromJSON(raw);
}

export function fromJSON(raw: unknown): Sprite {
  if (!raw || typeof raw !== "object") throw new Error("Sprite file must be a JSON object");
  const o = raw as Record<string, unknown>;
  const width = Number(o.width), height = Number(o.height);
  assertDim(width, height);
  const mode = o.mode === "half" ? "half" : o.mode === "quadrant" || o.mode === undefined ? "quadrant" : null;
  if (!mode) throw new Error(`Unknown render mode: ${String(o.mode)}`);
  let palette: Record<string, string> | undefined;
  if (o.palette !== undefined) {
    if (!o.palette || typeof o.palette !== "object") throw new Error("palette must be an object");
    palette = {};
    for (const [k, v] of Object.entries(o.palette as Record<string, unknown>)) {
      if (typeof v !== "string") throw new Error(`palette.${k} must be a hex string`);
      palette[k] = normalizeHex(v);
    }
  }
  if (!Array.isArray(o.pixels)) throw new Error("pixels must be an array of rows");
  const pixels: Pixel[][] = [];
  for (let y = 0; y < height; y++) {
    const rowRaw = o.pixels[y];
    const row: Pixel[] = [];
    if (Array.isArray(rowRaw)) {
      for (let x = 0; x < width; x++) row.push(resolvePixel(rowRaw[x], palette, `${x},${y}`));
    } else if (typeof rowRaw === "string") {
      // Compact row form: space-separated tokens, "-" for transparent.
      const toks = rowRaw.trim().length ? rowRaw.trim().split(/\s+/) : [];
      for (let x = 0; x < width; x++) row.push(resolvePixel(toks[x], palette, `${x},${y}`));
    } else if (rowRaw === undefined) {
      for (let x = 0; x < width; x++) row.push(null);
    } else {
      throw new Error(`Row ${y} must be an array or string`);
    }
    pixels.push(row);
  }
  const s: Sprite = { version: 1, width, height, mode, pixels };
  if (typeof o.name === "string") s.name = o.name;
  if (palette) s.palette = palette;
  return s;
}

/**
 * Serialise to readable JSON. Rows are written as compact strings so a
 * 16x8 sprite is 8 short lines. Colors matching a local palette entry are
 * written by name.
 */
export function toJSON(s: Sprite, { names = true }: { names?: boolean } = {}): string {
  const nameFor = new Map<string, string>();
  if (names && s.palette) for (const [k, v] of Object.entries(s.palette)) if (!nameFor.has(v)) nameFor.set(v, k);
  const rows = s.pixels.map((row) => row.map((p) => (p === null ? "-" : nameFor.get(p) ?? p)).join(" "));
  const head: string[] = ['  "version": 1'];
  if (s.name) head.push(`  "name": ${JSON.stringify(s.name)}`);
  head.push(`  "width": ${s.width}`, `  "height": ${s.height}`, `  "mode": ${JSON.stringify(s.mode)}`);
  if (s.palette && Object.keys(s.palette).length) {
    head.push(`  "palette": ${JSON.stringify(s.palette, null, 4).replace(/\n/g, "\n  ")}`);
  }
  const body = rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  return "{\n" + head.join(",\n") + `,\n  "pixels": [\n${body}\n  ]\n}\n`;
}

/** Distinct opaque colors used, in first-seen order. */
export function usedColors(s: Sprite): string[] {
  const seen = new Set<string>();
  for (const row of s.pixels) for (const p of row) if (p !== null) seen.add(p);
  return [...seen];
}
