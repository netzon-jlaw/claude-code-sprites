import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { createSprite, setPixel, parseSprite, toJSON } from "../src/core/sprite.js";
import { exportSprite, exportAnsi, exportHtml, exportShell, exportJs, exportPython, exportPng } from "../src/export/index.js";
import { importAnsi, parseAnsiCells, xterm256ToHex } from "../src/import/ansi.js";
import { importPng } from "../src/import/png.js";
import { renderAnsi } from "../src/core/render.js";

function sample() {
  const s = createSprite(6, 4, "quadrant", "smile");
  const O = "#d77757", K = "#2a1a14";
  for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) setPixel(s, x, y, O);
  setPixel(s, 1, 1, null); setPixel(s, 4, 1, null);      // transparent eyes
  setPixel(s, 2, 3, K); setPixel(s, 3, 3, K);            // mouth (two colours in a cell)
  return s;
}

describe("round trip JSON -> ANSI -> JSON", () => {
  it("quadrant sprite survives the round trip", () => {
    const s = sample();
    const ansi = exportAnsi(s, { colorMode: "truecolor" });
    const back = importAnsi(ansi, { name: "smile" });
    expect(back.mode).toBe("quadrant");
    expect(back.width).toBe(s.width);
    expect(back.height).toBe(s.height);
    expect(back.pixels).toEqual(s.pixels);
    expect(parseSprite(toJSON(back))).toEqual(s);
  });
  it("half sprite survives the round trip", () => {
    const s = createSprite(5, 4, "half", "h");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 0, 1, "#0000ff"); setPixel(s, 4, 3, "#00ff00"); setPixel(s, 2, 2, "#d77757");
    const back = importAnsi(renderAnsi(s, { colorMode: "truecolor" }));
    expect(back.mode).toBe("half");
    expect(back.pixels).toEqual(s.pixels);
  });
  it("parses 256-colour and basic codes", () => {
    const cells = parseAnsiCells("\x1b[38;5;196m\x1b[44m█\x1b[0m \x1b[91mX");
    expect(cells[0][0]).toEqual({ ch: "█", fg: "#ff0000", bg: "#0000ee" });
    expect(cells[0][1]).toEqual({ ch: " ", fg: null, bg: null });
    expect(cells[0][2].fg).toBe("#ff0000");
    expect(xterm256ToHex(231)).toBe("#ffffff");
    expect(xterm256ToHex(232)).toBe("#080808");
  });
  it("conflicting cells round-trip to the merged colours", () => {
    const s = createSprite(2, 2, "quadrant");
    setPixel(s, 0, 0, "#ff0000"); setPixel(s, 1, 0, "#0000ff"); setPixel(s, 0, 1, "#fe0000"); setPixel(s, 1, 1, "#0000ff");
    const back = importAnsi(exportAnsi(s, {}));
    expect(back.pixels).toEqual([["#ff0000", "#0000ff"], ["#ff0000", "#0000ff"]]);
  });
});

describe("exporters", () => {
  const s = sample();
  it("shell script uses printf with \\033", () => {
    const sh = exportShell(s, {});
    expect(sh.startsWith("#!/bin/sh\n")).toBe(true);
    expect(sh).toContain("printf '\\033[38;2;215;119;87m");
    expect(sh).not.toContain("\x1b");
  });
  it("js/ts/py constants escape ESC and join lines", () => {
    const js = exportJs(s, { varName: "mascot" }, false);
    expect(js).toContain("export const MASCOT = [");
    expect(js).toContain('"\\x1b[38;2;215;119;87m');
    expect(exportJs(s, {}, true)).toContain("export const SMILE: string = [");
    const py = exportPython(s, {});
    expect(py).toContain('SMILE = "\\n".join([');
    expect(py).toContain("\\x1b[0m");
    // Evaluate the JS to make sure it is valid and equals the ANSI render.
    const body = js.replace("export const MASCOT = ", "globalThis.__m = ");
    new Function(body)();
    expect((globalThis as { __m?: string }).__m + "\n").toBe(exportAnsi(s, {}));
  });
  it("html emits coloured spans", () => {
    const html = exportHtml(s, {});
    expect(html).toContain("<pre");
    expect(html).toContain('color:#d77757');
    expect(html).toContain('color:#d77757;background:#2a1a14');
    expect(exportHtml(s, { pre: false })).not.toContain("<pre");
    expect(exportSprite(s, "txt", {})).toBe("▛█▜\n█▀█\n");
  });
  it("png export and import round-trip at scale", () => {
    const buf = exportPng(s, { scale: 4 });
    const png = PNG.sync.read(buf);
    expect(png.width).toBe(24);
    expect(png.height).toBe(16);
    const back = importPng(buf, { width: 6, palette: false, name: "smile" });
    expect(back.height).toBe(4);
    expect(back.pixels).toEqual(s.pixels);
    const withBg = PNG.sync.read(exportPng(s, { scale: 1, background: "#ffffff" }));
    expect(withBg.data[(1 * 6 + 1) * 4 + 3]).toBe(255); // eye now opaque white
  });
  it("png import snaps to palette and thresholds alpha", () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([0xd8, 0x78, 0x58, 255, 0, 0, 0, 10]);
    const sp = importPng(PNG.sync.write(png), { width: 2, height: 1 });
    expect(sp.pixels).toEqual([["#d77757", null]]);
  });
});
