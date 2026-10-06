import { describe, it, expect } from "vitest";
import { resolveCell, pickTwoColors, resolveSprite, conflictMap, cellSize } from "../src/core/resolve.js";
import { createSprite, setPixel } from "../src/core/sprite.js";

const A = "#ff0000", B = "#0000ff", C = "#00ff00", D = "#fe0000"; // D is nearly A

describe("two-color-per-cell resolution", () => {
  it("empty cell is a space with no colours", () => {
    const c = resolveCell([null, null, null, null], "quadrant");
    expect(c).toMatchObject({ ch: " ", fg: null, bg: null, conflict: false });
  });
  it("single colour, all four pixels -> full block, no background", () => {
    const c = resolveCell([A, A, A, A], "quadrant");
    expect(c).toMatchObject({ ch: "█", fg: A, bg: null, conflict: false });
  });
  it("single colour with transparency -> partial glyph, no background", () => {
    const c = resolveCell([A, null, null, A], "quadrant");
    expect(c).toMatchObject({ ch: "▚", fg: A, bg: null, conflict: false });
  });
  it("two colours use foreground + background", () => {
    const c = resolveCell([A, B, A, B], "quadrant");
    expect(c.conflict).toBe(false);
    expect(c.ch).toBe("▌");
    expect(c.fg).toBe(A);
    expect(c.bg).toBe(B);
  });
  it("ranks the more frequent colour as foreground", () => {
    const c = resolveCell([B, A, A, A], "quadrant");
    expect(c.fg).toBe(A);
    expect(c.bg).toBe(B);
    expect(c.ch).toBe("▟");
  });
  it("three colours merge the odd one to the nearest and flag the cell", () => {
    const c = resolveCell([A, B, D, B], "quadrant");
    expect(c.conflict).toBe(true);
    expect(c.shown).toEqual([A, B, A, B]); // D snapped to A
    expect(c.fg).toBe(B); // B appears twice; A and D once each
    expect(c.bg).toBe(A);
  });
  it("transparent + two colours keeps only the dominant colour and flags", () => {
    const c = resolveCell([A, A, C, null], "quadrant");
    expect(c.conflict).toBe(true);
    expect(c.bg).toBe(null);
    expect(c.fg).toBe(A);
    expect(c.shown).toEqual([A, A, A, null]);
    expect(c.ch).toBe("▛");
  });
  it("pickTwoColors is deterministic for ties (first seen wins)", () => {
    expect(pickTwoColors([A, B, C, null]).colors).toEqual([A]);
    expect(pickTwoColors([A, B, C, A]).colors).toEqual([A, B]);
  });
  it("half mode resolves pairs", () => {
    expect(resolveCell([A, null], "half")).toMatchObject({ ch: "▀", fg: A, bg: null });
    expect(resolveCell([null, A], "half")).toMatchObject({ ch: "▄", fg: A, bg: null });
    expect(resolveCell([A, B], "half")).toMatchObject({ ch: "▀", fg: A, bg: B });
  });
  it("conflict map marks all pixels of a conflicting cell", () => {
    const s = createSprite(4, 4, "quadrant");
    setPixel(s, 0, 0, A); setPixel(s, 1, 0, B); setPixel(s, 0, 1, C); setPixel(s, 1, 1, B);
    setPixel(s, 2, 0, A);
    const m = conflictMap(s);
    expect(m[0][0] && m[0][1] && m[1][0] && m[1][1]).toBe(true);
    expect(m[0][2]).toBe(false);
    expect(cellSize(s)).toEqual({ cols: 2, rows: 2 });
    expect(resolveSprite(s)[0][1].ch).toBe("▘");
  });
  it("odd dimensions pad with transparency", () => {
    const s = createSprite(3, 3, "quadrant");
    setPixel(s, 2, 2, A);
    const cells = resolveSprite(s);
    expect(cells.length).toBe(2);
    expect(cells[1][1]).toMatchObject({ ch: "▘", fg: A, bg: null });
    const h = createSprite(1, 3, "half");
    setPixel(h, 0, 2, A);
    expect(resolveSprite(h)[1][0].ch).toBe("▀");
  });
});
