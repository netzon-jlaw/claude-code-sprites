import { describe, it, expect } from "vitest";
import { hexToRgb, rgbToHex, hexToOklch, oklchToHex, clampToGamut, hexTo256, normalizeHex, nearestHex } from "../src/core/color.js";

describe("color", () => {
  it("round-trips hex through OKLCH", () => {
    for (const h of ["#d77757", "#000000", "#ffffff", "#123456", "#abcdef"]) {
      expect(oklchToHex(hexToOklch(h))).toBe(h);
    }
  });
  it("normalizes short and uppercase hex", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#D77757")).toBe("#d77757");
    expect(() => normalizeHex("zzz")).toThrow();
  });
  it("clamps out-of-gamut colors by reducing chroma, keeping L and h", () => {
    const wild = { L: 0.7, C: 0.5, h: 150 };
    const c = clampToGamut(wild);
    expect(c.L).toBe(0.7);
    expect(c.h).toBe(150);
    expect(c.C).toBeLessThan(0.5);
    expect(c.C).toBeGreaterThan(0);
    const rgb = hexToRgb(oklchToHex(c));
    for (const v of [rgb.r, rgb.g, rgb.b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
  });
  it("maps to nearest 256 color", () => {
    expect(hexTo256("#000000")).toBe(16);
    expect(hexTo256("#ffffff")).toBe(231);
    expect(hexTo256("#ff0000")).toBe(196);
    expect(hexTo256("#808080")).toBeGreaterThanOrEqual(232);
  });
  it("finds nearest hex", () => {
    expect(nearestHex("#fe0101", ["#0000ff", "#ff0000", "#00ff00"])).toBe("#ff0000");
    expect(rgbToHex({ r: 300, g: -1, b: 12.4 })).toBe("#ff000c");
  });
});
