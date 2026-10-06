import { describe, it, expect } from "vitest";
import { PALETTE, BASELINE_HEX, HUES, STEPS, paletteByName, resolveColor, nearestPalette, paletteRows } from "../src/core/palette.js";
import { hexToOklch } from "../src/core/color.js";

describe("palette", () => {
  it("baseline orange is exactly #D77757", () => {
    expect(paletteByName("orange")?.hex.toUpperCase()).toBe("#D77757");
    expect(BASELINE_HEX.toUpperCase()).toBe("#D77757");
  });
  it("includes all required hues with 5 steps each plus neutrals", () => {
    for (const n of ["red","orange","amber","yellow","lime","green","teal","cyan","blue","indigo","purple","pink"]) {
      expect(paletteByName(n)).toBeDefined();
      expect(paletteByName(n + "-200")).toBeDefined();
      expect(paletteByName(n + "-700")).toBeDefined();
    }
    expect(PALETTE.length).toBe(HUES.length * STEPS.length + 8);
    expect(paletteRows().length).toBe(HUES.length + 1);
  });
  it("base hues share the baseline lightness (within gamut-limited tolerance)", () => {
    const base = hexToOklch(BASELINE_HEX);
    for (const { name } of HUES) {
      const c = hexToOklch(paletteByName(name)!.hex);
      expect(Math.abs(c.L - base.L)).toBeLessThan(0.02);
      expect(c.C).toBeLessThanOrEqual(base.C + 0.01);
    }
  });
  it("tints are lighter and shades darker", () => {
    const L = (n: string) => hexToOklch(paletteByName(n)!.hex).L;
    expect(L("blue-200")).toBeGreaterThan(L("blue-300"));
    expect(L("blue-300")).toBeGreaterThan(L("blue"));
    expect(L("blue")).toBeGreaterThan(L("blue-600"));
    expect(L("blue-600")).toBeGreaterThan(L("blue-700"));
  });
  it("all entries are unique valid hex", () => {
    const set = new Set(PALETTE.map((p) => p.hex));
    expect(set.size).toBe(PALETTE.length);
    for (const p of PALETTE) expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("resolves names and hex, and snaps to nearest", () => {
    expect(resolveColor("orange")).toBe("#d77757");
    expect(resolveColor("#FFF")).toBe("#ffffff");
    expect(nearestPalette("#d87858")).toBe("#d77757");
  });
});
