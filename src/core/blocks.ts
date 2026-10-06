/**
 * Block character tables.
 *
 * A quadrant cell is a 4-bit mask of which sub-pixels show the FOREGROUND
 * color: bit 0 = top-left, bit 1 = top-right, bit 2 = bottom-left,
 * bit 3 = bottom-right. Index the table with the mask.
 */
export const TL = 1, TR = 2, BL = 4, BR = 8;

export const QUADRANT_CHARS: readonly string[] = [
  " ", // 0000
  "▘", // TL
  "▝", // TR
  "▀", // TL+TR
  "▖", // BL
  "▌", // TL+BL
  "▞", // TR+BL
  "▛", // TL+TR+BL
  "▗", // BR
  "▚", // TL+BR
  "▐", // TR+BR
  "▜", // TL+TR+BR
  "▄", // BL+BR
  "▙", // TL+BL+BR
  "▟", // TR+BL+BR
  "█", // all
];

export const QUADRANT_MASK: ReadonlyMap<string, number> = new Map(QUADRANT_CHARS.map((c, i) => [c, i]));

/** Half-block cell: bit 0 = top, bit 1 = bottom show the foreground. */
export const HALF_CHARS: readonly string[] = [" ", "▀", "▄", "█"];
export const HALF_MASK: ReadonlyMap<string, number> = new Map(HALF_CHARS.map((c, i) => [c, i]));

export function quadrantChar(tl: boolean, tr: boolean, bl: boolean, br: boolean): string {
  return QUADRANT_CHARS[(tl ? TL : 0) | (tr ? TR : 0) | (bl ? BL : 0) | (br ? BR : 0)];
}

export function halfChar(top: boolean, bottom: boolean): string {
  return HALF_CHARS[(top ? 1 : 0) | (bottom ? 2 : 0)];
}

/** Every block character we understand, for the ANSI importer. */
export const ALL_BLOCK_CHARS: ReadonlySet<string> = new Set([...QUADRANT_CHARS, ...HALF_CHARS]);
