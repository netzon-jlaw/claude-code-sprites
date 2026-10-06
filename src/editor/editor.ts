/**
 * The interactive editor: wires terminal input to the editor state and draws.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Terminal, type InputEvent, type KeyEvent, type MouseEvent } from "./terminal.js";
import { EditorState, type EditorOptions, type Tool } from "./state.js";
import { computeLayout, drawFrame, zoomHit, canvasHit, paletteHit, type Layout } from "./view.js";
import { parseSprite, assertDim } from "../core/sprite.js";
import { detectColorMode, type ColorMode } from "../core/render.js";
import { normalizeHex, isHex } from "../core/color.js";
import { resolveColor } from "../core/palette.js";

export async function runEditor(file: string, opts: EditorOptions = {}): Promise<void> {
  let st: EditorState;
  if (existsSync(file)) {
    st = new EditorState(parseSprite(readFileSync(file, "utf8")));
  } else {
    st = EditorState.blank(opts);
    st.message = `new file ${file} (press s to save)`;
  }
  st.writer = (text) => writeFileSync(file, text);
  const term = new Terminal();
  const cm = detectColorMode();
  await new Editor(st, term, cm, basename(file)).run();
}

export class Editor {
  private layout!: Layout;
  private strokeButton: number | null = null;
  private strokeTool: Tool | null = null;
  private lastPainted: { x: number; y: number } | null = null;

  constructor(private st: EditorState, private term: Terminal, private cm: ColorMode, private fileName: string) {}

  run(): Promise<void> {
    return new Promise((resolve, reject) => {
      try { this.term.enter(); } catch (e) { reject(e); return; }
      const finish = (): void => { this.term.leave(); resolve(); };
      this.term.on("event", (e: InputEvent) => {
        try {
          this.handle(e);
        } catch (err) {
          this.st.message = `error: ${(err as Error).message}`;
        }
        if (this.st.quitRequested) finish(); else this.redraw();
      });
      this.redraw();
    });
  }

  redraw(): void {
    this.layout = computeLayout(this.st, this.term.cols, this.term.rows);
    this.term.draw(drawFrame(this.st, this.layout, this.cm, this.fileName));
  }

  handle(e: InputEvent): void {
    if (e.type === "resize") return;
    if (!this.layout) this.layout = computeLayout(this.st, this.term.cols, this.term.rows);
    if (this.st.modal.kind !== "none") { if (e.type === "key") this.handleModalKey(e); return; }
    if (e.type === "mouse") this.handleMouse(e); else this.handleKey(e);
  }

  // ---------- modals ----------

  private handleModalKey(k: KeyEvent): void {
    const st = this.st;
    const m = st.modal;
    if (m.kind === "help" || m.kind === "message") { st.modal = { kind: "none" }; return; }
    if (m.kind === "confirm-quit") {
      if (k.name === "y") { st.save(); st.quitRequested = true; }
      else if (k.name === "n") st.quitRequested = true;
      else if (k.name === "escape" || k.name === "q" || (k.ctrl && k.name === "c")) st.modal = { kind: "none" };
      return;
    }
    if (m.kind === "prompt") {
      if (k.name === "escape" || (k.ctrl && k.name === "c")) { st.modal = { kind: "none" }; return; }
      if (k.name === "enter") {
        st.modal = { kind: "none" };
        const err = m.onSubmit(m.value.trim());
        if (err) st.message = err;
        return;
      }
      if (k.name === "backspace") { m.value = m.value.slice(0, -1); return; }
      if (k.name === "space") { m.value += " "; return; }
      if (!k.ctrl && !k.meta && [...k.name].length === 1) m.value += k.name;
    }
  }

  private prompt(label: string, initial: string, onSubmit: (v: string) => string | void): void {
    this.st.modal = { kind: "prompt", label, value: initial, onSubmit };
  }

  // ---------- keys ----------

  private handleKey(k: KeyEvent): void {
    const st = this.st;
    st.message = "";
    if (k.ctrl) {
      switch (k.name) {
        case "c": st.requestQuit(); return;
        case "z": if (k.shift) st.redo(); else st.undo(); return;
        case "y": st.redo(); return;
        case "s": st.save(); return;
        case "l": return; // redraw
      }
      return;
    }
    switch (k.name) {
      case "up": case "k": st.moveCursor(0, -1); return;
      case "down": case "j": st.moveCursor(0, 1); return;
      case "left": case "h": st.moveCursor(-1, 0); return;
      case "right": case "l": st.moveCursor(1, 0); return;
      case "home": st.setCursor(0, st.cursor.y); return;
      case "end": st.setCursor(st.sprite.width - 1, st.cursor.y); return;
      case "space": case "enter": st.applyAtCursor(); return;
      case "backspace": case "delete": case "x": st.applyAtCursor("eraser"); return;
      case "p": st.setTool("pencil"); return;
      case "e": st.setTool("eraser"); return;
      case "i": st.setTool("eyedropper"); return;
      case "u": st.undo(); return;
      case "Z": case "U": st.redo(); return;
      case "s": st.save(); return;
      case "q": st.requestQuit(); return;
      case "?": st.modal = { kind: "help" }; return;
      case "[": st.cycleColor(-1); return;
      case "]": st.cycleColor(1); return;
      case "t": st.showPalette = !st.showPalette; return;
      case "z": if (st.zoom === 0) { st.zoom = 2; st.zoomAuto = true; } else st.zoom = 0; return;
      case "+": case "=": st.setZoom(Math.max(1, this.layout.zoomFactor + 1)); return;
      case "-": st.setZoom(Math.max(1, this.layout.zoomFactor - 1)); return;
      case "m": st.toggleMode(); return;
      case "#": case "c":
        this.prompt("hex colour or palette name", "", (v) => {
          try { st.setColor(resolveColor(v)); } catch { return `not a colour: ${v}`; }
        });
        return;
      case "r":
        this.prompt("new size (width height)", `${st.sprite.width} ${st.sprite.height}`, (v) => {
          const [w, h] = v.split(/[\sx×,]+/).map(Number);
          try { assertDim(w, h); } catch (err) { return (err as Error).message; }
          st.resize(w, h);
        });
        return;
    }
  }

  // ---------- mouse ----------

  private handleMouse(m: MouseEvent): void {
    const st = this.st;
    const l = this.layout;
    if (m.action === "wheelup") { st.cycleColor(-1); return; }
    if (m.action === "wheeldown") { st.cycleColor(1); return; }

    if (m.action === "up") {
      if (this.strokeButton !== null) { st.endStroke(); this.strokeButton = null; this.strokeTool = null; this.lastPainted = null; }
      return;
    }
    if (m.action === "move") return;

    const zp = zoomHit(l, m.x, m.y);
    if (m.action === "down") {
      const sw = paletteHit(l, m.x, m.y);
      if (sw) { st.setColor(sw.hex); if (st.tool === "eraser") st.setTool("pencil"); return; }
      const cp = canvasHit(l, st, m.x, m.y);
      if (cp && !zp) { st.setCursor(cp.x, cp.y); if (!l.zoom) this.startStroke(m, cp); return; }
      if (zp) { this.startStroke(m, zp); return; }
      return;
    }
    // drag
    if (this.strokeButton === null || !zp) return;
    st.setCursor(zp.x, zp.y);
    this.paintLine(zp);
  }

  private startStroke(m: MouseEvent, p: { x: number; y: number }): void {
    const st = this.st;
    const tool: Tool = m.button === 2 ? "eraser" : m.button === 1 ? "eyedropper" : st.tool;
    st.setCursor(p.x, p.y);
    if (tool === "eyedropper") { st.applyAt(p.x, p.y, "eyedropper"); return; }
    this.strokeButton = m.button;
    this.strokeTool = tool;
    st.beginStroke();
    st.applyAt(p.x, p.y, tool);
    this.lastPainted = p;
  }

  /** Paint along a line from the last painted pixel so fast drags leave no gaps. */
  private paintLine(to: { x: number; y: number }): void {
    const from = this.lastPainted ?? to;
    const dx = to.x - from.x, dy = to.y - from.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(from.x + (dx * i) / steps), y = Math.round(from.y + (dy * i) / steps);
      this.st.applyAt(x, y, this.strokeTool ?? undefined);
    }
    this.lastPainted = to;
  }
}

export { normalizeHex, isHex };
