import { describe, it, expect } from "vitest";
import { EditorState } from "../src/editor/state.js";
import { parseInput } from "../src/editor/terminal.js";

describe("editor state", () => {
  it("pencil strokes group into one undo step; eraser clears", () => {
    const e = EditorState.blank({ width: 4, height: 4 });
    e.setColor("#ff0000");
    e.beginStroke();
    e.applyAt(0, 0); e.applyAt(1, 0); e.applyAt(2, 0);
    e.endStroke();
    expect(e.sprite.pixels[0]).toEqual(["#ff0000", "#ff0000", "#ff0000", null]);
    expect(e.history.undoDepth).toBe(1);
    e.setTool("eraser");
    e.applyAt(1, 0);
    expect(e.sprite.pixels[0][1]).toBe(null);
    e.undo(); e.undo();
    expect(e.sprite.pixels[0]).toEqual([null, null, null, null]);
    e.redo();
    expect(e.sprite.pixels[0][2]).toBe("#ff0000");
  });
  it("eyedropper picks a colour and returns to the pencil", () => {
    const e = EditorState.blank({ width: 2, height: 2 });
    e.setColor("#123456"); e.applyAt(1, 1);
    e.setColor("#ffffff");
    e.setTool("eyedropper");
    expect(e.applyAt(0, 0)).toBe(false);
    expect(e.color).toBe("#ffffff");
    e.applyAt(1, 1);
    expect(e.color).toBe("#123456");
    expect(e.tool).toBe("pencil");
  });
  it("cursor clamps and keyboard paint works", () => {
    const e = EditorState.blank({ width: 3, height: 2 });
    e.moveCursor(10, 10);
    expect(e.cursor).toEqual({ x: 2, y: 1 });
    e.applyAtCursor();
    expect(e.sprite.pixels[1][2]).toBe("#d77757");
    e.moveCursor(-10, -10);
    expect(e.cursor).toEqual({ x: 0, y: 0 });
  });
  it("resize and mode switches are undoable and track dirty state", () => {
    const e = EditorState.blank({ width: 2, height: 2, mode: "quadrant" });
    const saved: string[] = [];
    e.writer = (t) => saved.push(t);
    e.applyAt(1, 1);
    e.resize(4, 3);
    e.toggleMode();
    expect(e.sprite.mode).toBe("half");
    expect(e.sprite.width).toBe(4);
    e.undo();
    expect(e.sprite.mode).toBe("quadrant");
    e.undo();
    expect(e.sprite.width).toBe(2);
    expect(e.sprite.pixels[1][1]).toBe("#d77757");
    expect(e.dirty).toBe(true);
    e.save();
    expect(saved.length).toBe(1);
    expect(e.dirty).toBe(false);
    e.requestQuit();
    expect(e.quitRequested).toBe(true);
  });
  it("quit with unsaved changes asks first", () => {
    const e = EditorState.blank();
    e.applyAt(0, 0);
    e.requestQuit();
    expect(e.quitRequested).toBe(false);
    expect(e.modal.kind).toBe("confirm-quit");
  });
  it("cycles colours through the palette", () => {
    const e = EditorState.blank();
    e.setColor("#000001");
    e.cycleColor(1);
    expect(e.colorName).toBe("red-200");
    e.cycleColor(-1);
    expect(e.colorName).toBe("neutral-8");
  });
});

describe("input parser", () => {
  it("parses keys", () => {
    const { events } = parseInput("a\x1b[A\x1a\r\x7f ");
    expect(events.map((e) => e.type === "key" && [e.name, e.ctrl])).toEqual([["a", false], ["up", false], ["z", true], ["enter", false], ["backspace", false], ["space", false]]);
  });
  it("parses SGR mouse down/drag/up/wheel", () => {
    const { events } = parseInput("\x1b[<0;5;3M\x1b[<32;6;3M\x1b[<0;6;3m\x1b[<64;1;1M\x1b[<2;2;2M");
    expect(events).toEqual([
      { type: "mouse", x: 4, y: 2, button: 0, action: "down", shift: false, meta: false, ctrl: false },
      { type: "mouse", x: 5, y: 2, button: 0, action: "drag", shift: false, meta: false, ctrl: false },
      { type: "mouse", x: 5, y: 2, button: 0, action: "up", shift: false, meta: false, ctrl: false },
      { type: "mouse", x: 0, y: 0, button: 3, action: "wheelup", shift: false, meta: false, ctrl: false },
      { type: "mouse", x: 1, y: 1, button: 2, action: "down", shift: false, meta: false, ctrl: false },
    ]);
  });
  it("keeps incomplete sequences for the next chunk and handles CSI u", () => {
    const r = parseInput("x\x1b[<0;5");
    expect(r.events.length).toBe(1);
    expect(r.rest).toBe("\x1b[<0;5");
    const { events } = parseInput("\x1b[122;6u");
    expect(events[0]).toMatchObject({ name: "z", ctrl: true, shift: true });
  });
});
