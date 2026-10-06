/**
 * Color math: sRGB hex <-> linear RGB <-> OKLab <-> OKLCH, gamut mapping,
 * and the nearest xterm-256 color for terminals without truecolor support.
 */

export interface RGB { r: number; g: number; b: number }          // 0..255 integers
export interface OKLab { L: number; a: number; b: number }
export interface OKLCH { L: number; C: number; h: number }         // h in degrees

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(s: string): boolean {
  return HEX_RE.test(s);
}

/** Normalise any accepted hex form to lowercase "#rrggbb". */
export function normalizeHex(s: string): string {
  const m = HEX_RE.exec(s.trim());
  if (!m) throw new Error(`Invalid hex color: ${s}`);
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
}

/** Linear RGB (0..1 floats, possibly out of range) from OKLab. */
function oklabToLinear({ L, a, b }: OKLab): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklab({ r, g, b }: RGB): OKLab {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb(lab: OKLab): RGB {
  const [r, g, b] = oklabToLinear(lab);
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

export function oklabToOklch({ L, a, b }: OKLab): OKLCH {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToOklab({ L, C, h }: OKLCH): OKLab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function hexToOklch(hex: string): OKLCH {
  return oklabToOklch(rgbToOklab(hexToRgb(hex)));
}

const EPS = 1e-6;

function inGamut(lab: OKLab): boolean {
  const [r, g, b] = oklabToLinear(lab);
  return r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;
}

/**
 * Bring an OKLCH color into sRGB by reducing chroma (bisection), keeping
 * lightness and hue intact. Never clips individual channels.
 */
export function clampToGamut(c: OKLCH): OKLCH {
  const L = Math.max(0, Math.min(1, c.L));
  if (inGamut(oklchToOklab({ ...c, L }))) return { ...c, L };
  let lo = 0, hi = c.C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToOklab({ L, C: mid, h: c.h }))) lo = mid; else hi = mid;
  }
  return { L, C: lo, h: c.h };
}

export function oklchToHex(c: OKLCH): string {
  return rgbToHex(oklabToRgb(oklchToOklab(clampToGamut(c))));
}

/** Perceptual distance squared in OKLab. */
export function labDistance(a: string, b: string): number {
  const p = rgbToOklab(hexToRgb(a)), q = rgbToOklab(hexToRgb(b));
  return (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;
}

export function nearestHex(target: string, candidates: readonly string[]): string {
  let best = candidates[0], bestD = Infinity;
  for (const c of candidates) {
    const d = labDistance(target, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// ---------- xterm-256 fallback ----------

const CUBE = [0, 95, 135, 175, 215, 255];

function cubeIndex(v: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(CUBE[i] - v);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Nearest xterm-256 index (16..255) for a hex color. */
export function hexTo256(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const ci = cubeIndex(r), cj = cubeIndex(g), ck = cubeIndex(b);
  const cubeCol = { r: CUBE[ci], g: CUBE[cj], b: CUBE[ck] };
  const cubeD = labDistance(hex, rgbToHex(cubeCol));
  // gray ramp 232..255: 8 + 10*i
  const avg = (r + g + b) / 3;
  const gi = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const gv = 8 + gi * 10;
  const grayD = labDistance(hex, rgbToHex({ r: gv, g: gv, b: gv }));
  return grayD < cubeD ? 232 + gi : 16 + 36 * ci + 6 * cj + ck;
}
