import { describe, it, expect } from "vitest";
import { History } from "../src/core/history.js";
import { createSprite, resizeSprite, cloneSprite } from "../src/core/sprite.js";

const R = "#ff0000", G = "#00ff00";

describe("history", () => {
  it("single paints are individual steps", () => {
    const s = createSprite(4, 4);
    const h = new History();
    h.paint(s, 0, 0, R);
    h.paint(s, 1, 0, G);
    expect(h.undoDepth).toBe(2);
    h.undo(s);
    expect(s.pixels[0][1]).toBe(null);
    expect(s.pixels[0][0]).toBe(R);
    h.undo(s);
    expect(s.pixels[0][0]).toBe(null);
    expect(h.canUndo).toBe(false);
    h.redo(s); h.redo(s);
    expect(s.pixels[0][1]).toBe(G);
    expect(h.canRedo).toBe(false);
  });
  it("a stroke is one undo step and keeps the first before-value", () => {
    const s = createSprite(4, 4);
    const h = new History();
    h.beginStroke();
    h.paint(s, 0, 0, R); h.paint(s, 1, 0, R); h.paint(s, 0, 0, G); // repaint same pixel
    h.endStroke();
    expect(h.undoDepth).toBe(1);
    expect(s.pixels[0][0]).toBe(G);
    h.undo(s);
    expect(s.pixels[0][0]).toBe(null);
    expect(s.pixels[0][1]).toBe(null);
    h.redo(s);
    expect(s.pixels[0][0]).toBe(G);
    expect(s.pixels[0][1]).toBe(R);
  });
  it("painting the same colour is a no-op and empty strokes are discarded", () => {
    const s = createSprite(2, 2);
    const h = new History();
    expect(h.paint(s, 0, 0, null)).toBe(false);
    h.beginStroke(); h.endStroke();
    expect(h.undoDepth).toBe(0);
    expect(h.paint(s, 5, 5, R)).toBe(false);
  });
  it("new edits clear the redo stack", () => {
    const s = createSprite(2, 2);
    const h = new History();
    h.paint(s, 0, 0, R);
    h.undo(s);
    h.paint(s, 1, 1, G);
    expect(h.canRedo).toBe(false);
  });
  it("holds at least 100 steps and drops the oldest beyond capacity", () => {
    const s = createSprite(20, 20);
    const h = new History(100);
    for (let i = 0; i < 150; i++) h.paint(s, i % 20, Math.floor(i / 20), i % 2 ? R : G);
    expect(h.undoDepth).toBe(100);
    for (let i = 0; i < 100; i++) h.undo(s);
    expect(h.canUndo).toBe(false);
    expect(s.pixels[0][0]).toBe(G); // the first 50 steps are gone, so pixel 0 stays painted
    expect(s.pixels[7][9]).toBe(null); // step 149 undone
  });
  it("snapshots undo structural changes", () => {
    let s = createSprite(2, 2);
    const h = new History();
    h.paint(s, 1, 1, R);
    const before = cloneSprite(s);
    s = resizeSprite(s, 4, 4);
    h.pushSnapshot("resize", before, s);
    expect(s.width).toBe(4);
    s = h.undo(s);
    expect(s.width).toBe(2);
    expect(s.pixels[1][1]).toBe(R);
    s = h.redo(s);
    expect(s.width).toBe(4);
  });
  it("tracks dirty state across save marks", () => {
    const s = createSprite(2, 2);
    const h = new History();
    expect(h.dirty).toBe(false);
    h.paint(s, 0, 0, R);
    expect(h.dirty).toBe(true);
    h.markSaved();
    expect(h.dirty).toBe(false);
    h.undo(s);
    expect(h.dirty).toBe(true);
    h.redo(s);
    expect(h.dirty).toBe(false);
  });
});
