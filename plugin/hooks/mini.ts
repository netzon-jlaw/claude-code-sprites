// The terminal's party sprites: the same seven sprites as ./sprites.ts, drawn
// 16 pixels wide by up to 12 tall (16 columns by 6 rows of half blocks), each
// one flat body color with two near-black eye slits. Two idle frames: the
// second closes the top of the eyes, so a running agent blinks.
import { EYE, KEYS, PALETTE, SPRITES } from './sprites'

export const MINI_W = 16
export const MINI_H = 12

const KO_EYE = '#9E3B4B'
const grayOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const y = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
  const v = Math.min(255, Math.round(y * 0.6 + 80)).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
}

/**
 * The sprite's pixels, `MINI_H` rows of `MINI_W`: a color per cell, or
 * undefined where it's transparent. A shorter figure sits at the bottom.
 * `frame` 1 blinks (the eyes' top row takes the body color); `ko` washes the
 * figure out and reddens the eyes.
 */
export function miniPixels(cls: number, frame: number, ko: boolean): (string | undefined)[][] {
  const sp = SPRITES[cls] ?? SPRITES[1]!
  const grid: (string | undefined)[][] = sp.rows.map((row) =>
    row.split('').map((ch) => (ch === '.' ? undefined : PALETTE[KEYS.indexOf(ch)])),
  )
  while (grid.length < MINI_H) grid.unshift(new Array<string | undefined>(MINI_W).fill(undefined))
  if (frame % 2 === 1) {
    const y = grid.findIndex((row) => row.includes(EYE))
    const row = grid[y]
    if (row !== undefined) {
      const body = row.find((c) => c !== undefined && c !== EYE)
      grid[y] = row.map((c) => (c === EYE ? body : c))
    }
  }
  return grid.map((row) =>
    row.map((c) => {
      if (c === undefined || !ko) return c
      return c === EYE ? KO_EYE : grayOf(c)
    }),
  )
}
