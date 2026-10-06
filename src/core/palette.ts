/**
 * The themed palette. Everything tweakable lives here.
 *
 * Every hue shares the baseline's OKLCH lightness and chroma, so the whole
 * set feels like siblings of Claude orange. Tints and shades step lightness;
 * neutrals keep a sliver of the baseline hue at very low chroma.
 */
import { clampToGamut, hexToOklch, oklchToHex, nearestHex, normalizeHex } from "./color.js";

export const BASELINE_HEX = "#d77757";

/** Hue names and OKLCH hue angles (degrees). The baseline keeps its own angle. */
export const HUES: ReadonlyArray<{ name: string; hue: number | "baseline" }> = [
  { name: "red",    hue: 25 },
  { name: "orange", hue: "baseline" },
  { name: "amber",  hue: 70 },
  { name: "yellow", hue: 95 },
  { name: "lime",   hue: 125 },
  { name: "green",  hue: 150 },
  { name: "teal",   hue: 180 },
  { name: "cyan",   hue: 215 },
  { name: "blue",   hue: 255 },
  { name: "indigo", hue: 280 },
  { name: "purple", hue: 305 },
  { name: "pink",   hue: 345 },
];

/** Lightness deltas for the five steps: 2 tints, base, 2 shades. */
export const STEPS: ReadonlyArray<{ suffix: string; dL: number }> = [
  { suffix: "-200", dL: +0.22 },
  { suffix: "-300", dL: +0.11 },
  { suffix: "",     dL: 0 },
  { suffix: "-600", dL: -0.12 },
  { suffix: "-700", dL: -0.24 },
];

/** Neutral row: lightness values from warm off-white to warm near-black. */
export const NEUTRAL_L: readonly number[] = [0.96, 0.86, 0.74, 0.62, 0.50, 0.38, 0.26, 0.16];
export const NEUTRAL_CHROMA = 0.012;

export interface PaletteEntry { name: string; hex: string; hueName: string; step: string }

function build(): PaletteEntry[] {
  const base = hexToOklch(BASELINE_HEX);
  const out: PaletteEntry[] = [];
  for (const { name, hue } of HUES) {
    const h = hue === "baseline" ? base.h : hue;
    for (const { suffix, dL } of STEPS) {
      const hex = suffix === "" && hue === "baseline"
        ? BASELINE_HEX
        : oklchToHex(clampToGamut({ L: base.L + dL, C: base.C, h }));
      out.push({ name: name + suffix, hex, hueName: name, step: suffix });
    }
  }
  NEUTRAL_L.forEach((L, i) => {
    out.push({
      name: `neutral-${i + 1}`,
      hex: oklchToHex({ L, C: NEUTRAL_CHROMA, h: base.h }),
      hueName: "neutral",
      step: String(i + 1),
    });
  });
  return out;
}

export const PALETTE: readonly PaletteEntry[] = build();
export const PALETTE_HEXES: readonly string[] = PALETTE.map((p) => p.hex);

const byName = new Map(PALETTE.map((p) => [p.name, p]));
const byHex = new Map(PALETTE.map((p) => [p.hex, p]));

export function paletteByName(name: string): PaletteEntry | undefined {
  return byName.get(name);
}

export function paletteNameFor(hex: string): string | undefined {
  return byHex.get(normalizeHex(hex))?.name;
}

/** Resolve a palette name or hex to "#rrggbb". */
export function resolveColor(input: string): string {
  const p = byName.get(input);
  if (p) return p.hex;
  return normalizeHex(input);
}

export function nearestPalette(hex: string): string {
  return nearestHex(normalizeHex(hex), PALETTE_HEXES);
}

/** Palette as rows: one row per hue (5 steps) plus the neutral row. */
export function paletteRows(): PaletteEntry[][] {
  const rows: PaletteEntry[][] = [];
  for (const { name } of HUES) rows.push(PALETTE.filter((p) => p.hueName === name));
  rows.push(PALETTE.filter((p) => p.hueName === "neutral"));
  return rows;
}
