import { describe, it, expect } from "vitest";
import { Editor } from "../src/editor/editor.js";
import { EditorState } from "../src/editor/state.js";
import { Terminal } from "../src/editor/terminal.js";
import { computeLayout, drawFrame } from "../src/editor/view.js";

class FakeTerminal extends Terminal {
  frames: string[][] = [];
  constructor(private c = 100, private r = 36) { super(); }
  override get cols() { return this.c; }
  override get rows() { return this.r; }
  override enter() {}
  override leave() {}
  override draw(lines: string[]) { this.frames.push(lines); }
}

function setup(w = 8, h = 4) {
  const st = EditorState.blank({ width: w, height: h });
  st.writer = () => {};
  const term = new FakeTerminal();
  const ed = new Editor(st, term, "truecolor", "t.sprite.json");
  const done = ed.run();
  const layout = computeLayout(st, term.cols, term.rows);
  return { st, term, ed, done, layout };
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("editor harness", () => {
  it("draws a frame with title, canvas, zoom, palette and status", () => {
    const { term, layout } = setup();
    const f = term.frames.at(-1)!.map(strip);
    expect(f[0]).toContain("unicode-sprite  t.sprite.json");
    expect(f[layout.statusRow]).toContain("pencil (p)");
    expect(f[layout.statusRow]).toContain("8×4 quadrant");
    expect(layout.zoom).not.toBeNull();
    expect(f[layout.zoom!.y - 1]).toContain("zoom ×");
    expect(f[layout.palette!.y - 1]).toContain("palette");
  });
  it("mouse drag in the zoom view paints one stroke; right-drag erases", () => {
    const { st, term, layout } = setup();
    const z = layout.zoom!, f = layout.zoomFactor;
    const sx = (px: number) => z.x + px * 2 * f + 1, sy = (py: number) => z.y + py * f;
    term.feed(`\x1b[<0;${sx(0) + 1};${sy(0) + 1}M`);
    term.feed(`\x1b[<32;${sx(3) + 1};${sy(0) + 1}M`);   // drag straight to x=3: line fill paints 1 and 2 too
    term.feed(`\x1b[<0;${sx(3) + 1};${sy(0) + 1}m`);
    expect(st.sprite.pixels[0].slice(0, 4)).toEqual(["#d77757", "#d77757", "#d77757", "#d77757"]);
    expect(st.history.undoDepth).toBe(1);
    expect(st.cursor).toEqual({ x: 3, y: 0 });
    term.feed(`\x1b[<2;${sx(1) + 1};${sy(0) + 1}M\x1b[<34;${sx(2) + 1};${sy(0) + 1}M\x1b[<2;${sx(2) + 1};${sy(0) + 1}m`);
    expect(st.sprite.pixels[0].slice(0, 4)).toEqual(["#d77757", null, null, "#d77757"]);
    expect(st.history.undoDepth).toBe(2);
    term.feed("u");
    expect(st.sprite.pixels[0][1]).toBe("#d77757");
    term.feed("\x19"); // ctrl+y
    expect(st.sprite.pixels[0][1]).toBe(null);
  });
  it("clicking a swatch selects it; middle click picks from the canvas", () => {
    const { st, term, layout } = setup();
    const p = layout.palette!;
    const entry = layout.paletteGrid[2][8]!; // blue base
    term.feed(`\x1b[<0;${p.x + 8 * layout.swatchW + 1};${p.y + 2 + 1}M\x1b[<0;${p.x + 8 * layout.swatchW + 1};${p.y + 2 + 1}m`);
    expect(st.color).toBe(entry.hex);
    expect(st.colorName).toBe("blue");
    term.feed(" "); // paint at cursor 0,0
    term.feed("]");
    expect(st.colorName).toBe("blue-600");
    const z = layout.zoom!;
    term.feed(`\x1b[<1;${z.x + 1};${z.y + 1}M\x1b[<1;${z.x + 1};${z.y + 1}m`);
    expect(st.colorName).toBe("blue");
  });
  it("keyboard: tools, cursor, prompts for hex and resize, mode toggle, help", () => {
    const { st, term } = setup();
    term.feed("e");
    expect(st.tool).toBe("eraser");
    term.feed("p\x1b[C\x1b[B "); // pencil, right, down, paint
    expect(st.sprite.pixels[1][1]).toBe("#d77757");
    term.feed("#");
    expect(st.modal.kind).toBe("prompt");
    term.feed("#00ff00\r");
    expect(st.modal.kind).toBe("none");
    expect(st.color).toBe("#00ff00");
    term.feed("#nope\r");
    expect(st.message).toContain("not a colour");
    term.feed("r\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f12 6\r");
    expect(st.sprite.width).toBe(12);
    expect(st.sprite.height).toBe(6);
    term.feed("m");
    expect(st.sprite.mode).toBe("half");
    term.feed("?");
    expect(st.modal.kind).toBe("help");
    expect(strip(term.frames.at(-1)!.join("\n"))).toContain("press any key to close");
    term.feed("x");
    expect(st.modal.kind).toBe("none");
  });
  it("quit prompts when dirty and saves on y", async () => {
    const { st, term, done } = setup();
    let saved = "";
    st.writer = (t) => { saved = t; };
    term.feed(" ");
    term.feed("q");
    expect(st.modal.kind).toBe("confirm-quit");
    term.feed("\x1b");
    expect(st.modal.kind).toBe("none");
    term.feed("q");
    term.feed("y");
    await done;
    expect(saved).toContain('"width": 8');
    expect(st.quitRequested).toBe(true);
  });
  it("flags merged cells in the zoom view and fits layout in a small terminal", () => {
    const st = EditorState.blank({ width: 4, height: 2 });
    st.setColor("#ff0000"); st.applyAt(0, 0);
    st.setColor("#00ff00"); st.applyAt(1, 0);
    st.setColor("#0000ff"); st.applyAt(0, 1); st.applyAt(1, 1);
    const l = computeLayout(st, 60, 20);
    const f = drawFrame(st, l, "truecolor", "x").map(strip);
    expect(f[l.zoom!.y]).toContain("×");
    const tiny = computeLayout(EditorState.blank({ width: 64, height: 32 }), 40, 12);
    expect(tiny.zoom).toBeNull();
    expect(drawFrame(EditorState.blank({ width: 64, height: 32 }), tiny, "256", "x").length).toBe(12);
  });
});
