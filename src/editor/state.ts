/**
 * Editor state and operations, independent of the terminal so they can be
 * unit tested. The view layer renders this; the editor wires input to it.
 */
import { cloneSprite, createSprite, getPixel, resizeSprite, toJSON, type Pixel, type RenderMode, type Sprite } from "../core/sprite.js";
import { History } from "../core/history.js";
import { PALETTE, paletteNameFor, BASELINE_HEX } from "../core/palette.js";
import { normalizeHex } from "../core/color.js";

export type Tool = "pencil" | "eraser" | "eyedropper";

export type Modal =
  | { kind: "none" }
  | { kind: "help" }
  | { kind: "prompt"; label: string; value: string; onSubmit: (v: string) => string | void }
  | { kind: "confirm-quit" }
  | { kind: "message"; text: string };

export interface EditorOptions { width?: number; height?: number; mode?: RenderMode }

export class EditorState {
  sprite: Sprite;
  history = new History(200);
  tool: Tool = "pencil";
  color: string = BASELINE_HEX;
  cursor = { x: 0, y: 0 };
  /** Zoom view: 0 hides it, otherwise each pixel is 2z columns by z rows. */
  zoom = 2;
  zoomAuto = true;
  showPalette = true;
  modal: Modal = { kind: "none" };
  message = "";
  stroking = false;
  quitRequested = false;
  /** Called by save(); set by the editor to write the file. */
  writer: ((text: string) => void) | null = null;

  constructor(sprite: Sprite) { this.sprite = sprite; }

  static blank(opts: EditorOptions = {}): EditorState {
    return new EditorState(createSprite(opts.width ?? 16, opts.height ?? 8, opts.mode ?? "quadrant"));
  }

  get dirty(): boolean { return this.history.dirty; }
  get colorName(): string { return paletteNameFor(this.color) ?? "custom"; }

  // ---------- cursor ----------

  moveCursor(dx: number, dy: number): void {
    this.cursor.x = Math.max(0, Math.min(this.sprite.width - 1, this.cursor.x + dx));
    this.cursor.y = Math.max(0, Math.min(this.sprite.height - 1, this.cursor.y + dy));
  }

  setCursor(x: number, y: number): void {
    this.cursor.x = Math.max(0, Math.min(this.sprite.width - 1, x));
    this.cursor.y = Math.max(0, Math.min(this.sprite.height - 1, y));
  }

  // ---------- tools ----------

  setTool(t: Tool): void { this.tool = t; this.message = ""; }

  setColor(hex: string): void { this.color = normalizeHex(hex); }

  /** Cycle the current colour through the palette. */
  cycleColor(delta: number): void {
    const i = PALETTE.findIndex((p) => p.hex === this.color);
    const n = PALETTE.length;
    const next = i < 0 ? (delta > 0 ? 0 : n - 1) : (i + delta + n) % n;
    this.color = PALETTE[next].hex;
  }

  /** Apply the current tool at a pixel. Returns true if the sprite changed. */
  applyAt(x: number, y: number, toolOverride?: Tool): boolean {
    const tool = toolOverride ?? this.tool;
    if (x < 0 || y < 0 || x >= this.sprite.width || y >= this.sprite.height) return false;
    if (tool === "eyedropper") {
      const p = getPixel(this.sprite, x, y);
      if (p) { this.color = p; this.tool = "pencil"; this.message = `picked ${p}`; }
      else this.message = "transparent pixel (nothing picked)";
      return false;
    }
    const value: Pixel = tool === "eraser" ? null : this.color;
    return this.history.paint(this.sprite, x, y, value);
  }

  /** Paint at the cursor as a single step. */
  applyAtCursor(toolOverride?: Tool): boolean {
    return this.applyAt(this.cursor.x, this.cursor.y, toolOverride);
  }

  beginStroke(): void { this.history.beginStroke(); this.stroking = true; }
  endStroke(): void { this.history.endStroke(); this.stroking = false; }

  // ---------- history ----------

  undo(): void { this.sprite = this.history.undo(this.sprite); this.clampCursor(); this.message = this.history.canUndo ? "undo" : "nothing to undo"; }
  redo(): void { this.sprite = this.history.redo(this.sprite); this.clampCursor(); this.message = "redo"; }

  private clampCursor(): void { this.setCursor(this.cursor.x, this.cursor.y); }

  // ---------- structure ----------

  resize(width: number, height: number): void {
    const before = cloneSprite(this.sprite);
    const after = resizeSprite(this.sprite, width, height);
    this.history.pushSnapshot("resize", before, after);
    this.sprite = after;
    this.clampCursor();
    this.zoomAuto = true;
    this.message = `resized to ${width}x${height}`;
  }

  setMode(mode: RenderMode): void {
    if (this.sprite.mode === mode) return;
    const before = cloneSprite(this.sprite);
    const after = { ...cloneSprite(this.sprite), mode };
    this.history.pushSnapshot("mode", before, after);
    this.sprite = after;
    this.message = `render mode: ${mode}`;
  }

  toggleMode(): void { this.setMode(this.sprite.mode === "half" ? "quadrant" : "half"); }

  setZoom(z: number): void { this.zoom = Math.max(0, Math.min(6, z)); this.zoomAuto = false; }

  // ---------- file ----------

  save(): void {
    if (!this.writer) throw new Error("no writer configured");
    this.writer(toJSON(this.sprite));
    this.history.markSaved();
    this.message = "saved";
  }

  requestQuit(): void {
    if (this.dirty) this.modal = { kind: "confirm-quit" };
    else this.quitRequested = true;
  }
}
