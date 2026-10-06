import { describe, it, expect } from "vitest";
import { QUADRANT_CHARS, quadrantChar, halfChar, QUADRANT_MASK, TL, TR, BL, BR } from "../src/core/blocks.js";

describe("quadrant character selection", () => {
  it("has 16 distinct glyphs, one per mask", () => {
    expect(QUADRANT_CHARS.length).toBe(16);
    expect(new Set(QUADRANT_CHARS).size).toBe(16);
    for (let m = 0; m < 16; m++) expect(QUADRANT_MASK.get(QUADRANT_CHARS[m])).toBe(m);
  });
  const expected: Record<number, string> = {
    0: " ", [TL]: "▘", [TR]: "▝", [TL|TR]: "▀", [BL]: "▖", [TL|BL]: "▌", [TR|BL]: "▞", [TL|TR|BL]: "▛",
    [BR]: "▗", [TL|BR]: "▚", [TR|BR]: "▐", [TL|TR|BR]: "▜", [BL|BR]: "▄", [TL|BL|BR]: "▙", [TR|BL|BR]: "▟", 15: "█",
  };
  for (let m = 0; m < 16; m++) {
    it(`mask ${m.toString(2).padStart(4, "0")} -> ${expected[m]}`, () => {
      expect(quadrantChar(!!(m & TL), !!(m & TR), !!(m & BL), !!(m & BR))).toBe(expected[m]);
    });
  }
  it("half block glyphs", () => {
    expect(halfChar(false, false)).toBe(" ");
    expect(halfChar(true, false)).toBe("▀");
    expect(halfChar(false, true)).toBe("▄");
    expect(halfChar(true, true)).toBe("█");
  });
});
