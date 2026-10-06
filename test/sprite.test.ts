import { describe, it, expect } from "vitest";
import { createSprite, setPixel, parseSprite, toJSON, resizeSprite, usedColors } from "../src/core/sprite.js";

describe("sprite json", () => {
  it("round-trips through compact JSON with names", () => {
    const s = createSprite(3, 2, "half", "demo");
    s.palette = { skin: "#d77757" };
    setPixel(s, 0, 0, "#d77757"); setPixel(s, 2, 1, "#123456");
    const text = toJSON(s);
    expect(text).toContain('"skin - -"');
    const back = parseSprite(text);
    expect(back).toEqual(s);
  });
  it("accepts array rows, palette names and global palette names", () => {
    const s = parseSprite(JSON.stringify({ width: 2, height: 2, mode: "quadrant", pixels: [["orange", null], ["#FFF", "-"]] }));
    expect(s.pixels).toEqual([["#d77757", null], ["#ffffff", null]]);
  });
  it("rejects bad input", () => {
    expect(() => parseSprite("{")).toThrow(/JSON/);
    expect(() => parseSprite('{"width":0,"height":1,"pixels":[]}')).toThrow(/width/);
    expect(() => parseSprite('{"width":1,"height":1,"pixels":[["nope"]]}')).toThrow(/Unknown color/);
    expect(() => parseSprite('{"width":1,"height":1,"mode":"x","pixels":[]}')).toThrow(/mode/);
  });
  it("resizes anchored top-left", () => {
    const s = createSprite(2, 2); setPixel(s, 1, 1, "#ff0000");
    const big = resizeSprite(s, 3, 3);
    expect(big.pixels[1][1]).toBe("#ff0000");
    expect(big.pixels[2][2]).toBe(null);
    const small = resizeSprite(big, 1, 1);
    expect(small.pixels).toEqual([[null]]);
    expect(usedColors(big)).toEqual(["#ff0000"]);
  });
});
