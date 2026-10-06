/**
 * PNG import: downscale with a box filter, threshold alpha, and optionally
 * snap to the palette.
 */
import { PNG } from "pngjs";
import { createSprite, type Sprite, type RenderMode } from "../core/sprite.js";
import { rgbToHex } from "../core/color.js";
import { nearestPalette } from "../core/palette.js";

export interface PngImportOptions {
  width?: number;
  height?: number;
  mode?: RenderMode;
  /** Snap to the themed palette (default true). */
  palette?: boolean;
  /** Alpha threshold 0..255; below becomes transparent (default 128). */
  alphaThreshold?: number;
  name?: string;
}

export function importPng(data: Buffer, opts: PngImportOptions = {}): Sprite {
  const png = PNG.sync.read(data);
  const srcW = png.width, srcH = png.height;
  let width = opts.width ?? (opts.height ? Math.max(1, Math.round((opts.height * srcW) / srcH)) : Math.min(srcW, 32));
  let height = opts.height ?? Math.max(1, Math.round((width * srcH) / srcW));
  width = Math.max(1, Math.min(512, width));
  height = Math.max(1, Math.min(512, height));
  const threshold = opts.alphaThreshold ?? 128;
  const s = createSprite(width, height, opts.mode ?? "quadrant", opts.name);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * srcH) / height), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * srcW) / width), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / width));
      let r = 0, g = 0, b = 0, a = 0, n = 0, opaque = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * srcW + sx) * 4;
          const pa = png.data[i + 3];
          a += pa; n++;
          if (pa >= threshold) { r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; opaque++; }
        }
      }
      if (n === 0 || a / n < threshold || opaque === 0) continue;
      let hex = rgbToHex({ r: r / opaque, g: g / opaque, b: b / opaque });
      if (opts.palette !== false) hex = nearestPalette(hex);
      s.pixels[y][x] = hex;
    }
  }
  return s;
}
