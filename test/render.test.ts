import { describe, it, expect } from "vitest";
import { renderAnsi, renderPlain, detectColorMode, fgCode, bgCode, RESET } from "../src/core/render.js";
import { createSprite, setPixel } from "../src/core/sprite.js";

describe("render", () => {
  it("emits truecolor codes and resets each line", () => {
    const s = createSprite(2, 2, "quadrant");
    setPixel(s, 0, 0, "#d77757");
    const out = renderAnsi(s, { colorMode: "truecolor" });
    expect(out).toBe("\x1b[38;2;215;119;87m▘\x1b[0m\n");
  });
  it("transparent pixels emit no background code", () => {
    const s = createSprite(2, 2, "quadrant");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 1, 1, "#ff0000");
    expect(renderAnsi(s, { colorMode: "truecolor" })).not.toContain("[48;");
  });
  it("two colours emit fg and bg", () => {
    const s = createSprite(2, 2, "quadrant");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 1, 0, "#0000ff"); setPixel(s, 0, 1, "#ff0000"); setPixel(s, 1, 1, "#0000ff");
    expect(renderAnsi(s, { colorMode: "truecolor" })).toBe("\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▌\x1b[0m\n");
  });
  it("resets when moving from an opaque background to a transparent cell", () => {
    const s = createSprite(4, 2, "half");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 0, 1, "#0000ff");
    setPixel(s, 1, 0, "#ff0000");
    const out = renderAnsi(s, { colorMode: "truecolor" });
    // red fg, blue bg, ▀, then reset, then red fg ▀, then two spaces, reset
    expect(out).toBe(`\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀${RESET}\x1b[38;2;255;0;0m▀  ${RESET}\n`);
  });
  it("256-colour fallback", () => {
    expect(fgCode("#ff0000", "256")).toBe("\x1b[38;5;196m");
    expect(bgCode("#000000", "256")).toBe("\x1b[48;5;16m");
    expect(detectColorMode({ COLORTERM: "truecolor" })).toBe("truecolor");
    expect(detectColorMode({ TERM: "xterm-256color" })).toBe("256");
  });
  it("plain render has no escapes", () => {
    const s = createSprite(2, 2, "half");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 1, 1, "#ff0000");
    expect(renderPlain(s)).toBe("▀▄\n");
  });
});
