/**
 * Undo/redo for sprite edits. Each entry is a group of pixel changes so one
 * click-and-drag stroke is a single step.
 */
import type { Pixel, Sprite } from "./sprite.js";
import { setPixel } from "./sprite.js";

export interface PixelChange { x: number; y: number; before: Pixel; after: Pixel }

export interface HistoryEntry {
  label: string;
  changes: PixelChange[];
  /** Whole-sprite snapshots for structural edits (resize, mode change). */
  before?: Sprite;
  after?: Sprite;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private open: HistoryEntry | null = null;
  /** Position of the last "mark" (save), to know if there are unsaved changes. */
  private savedDepth = 0;

  constructor(public readonly capacity = 200) {}

  get canUndo(): boolean { return this.undoStack.length > 0 || (this.open?.changes.length ?? 0) > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoDepth(): number { return this.undoStack.length; }
  get dirty(): boolean { return this.savedDepth !== this.undoStack.length || this.open !== null; }

  markSaved(): void { this.savedDepth = this.undoStack.length; }

  /** Start a stroke. Subsequent paint() calls are grouped until endStroke(). */
  beginStroke(label = "stroke"): void {
    if (this.open) this.endStroke();
    this.open = { label, changes: [] };
  }

  /** Paint one pixel, recording it in the open stroke (or as its own step). */
  paint(s: Sprite, x: number, y: number, color: Pixel): boolean {
    const before = s.pixels[y]?.[x];
    if (before === undefined) return false;
    if (!setPixel(s, x, y, color)) return false;
    const change = { x, y, before, after: s.pixels[y][x] };
    if (this.open) {
      // Keep the first "before" for a pixel painted twice in one stroke.
      const prior = this.open.changes.find((c) => c.x === x && c.y === y);
      if (prior) prior.after = change.after; else this.open.changes.push(change);
    } else {
      this.push({ label: "paint", changes: [change] });
    }
    return true;
  }

  endStroke(): void {
    if (!this.open) return;
    const entry = this.open;
    this.open = null;
    if (entry.changes.length) this.push(entry);
  }

  /** Record a structural change: pass the sprite before and the sprite after. */
  pushSnapshot(label: string, before: Sprite, after: Sprite): void {
    this.endStroke();
    this.push({ label, changes: [], before, after });
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack = [];
    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift();
      this.savedDepth = Math.max(-1, this.savedDepth - 1);
    }
  }

  /** Undo the last step. Returns the sprite to use afterwards (may be a new object). */
  undo(s: Sprite): Sprite {
    this.endStroke();
    const e = this.undoStack.pop();
    if (!e) return s;
    this.redoStack.push(e);
    if (e.before) return e.before;
    for (let i = e.changes.length - 1; i >= 0; i--) { const c = e.changes[i]; s.pixels[c.y][c.x] = c.before; }
    return s;
  }

  redo(s: Sprite): Sprite {
    const e = this.redoStack.pop();
    if (!e) return s;
    this.undoStack.push(e);
    if (e.after) return e.after;
    for (const c of e.changes) s.pixels[c.y][c.x] = c.after;
    return s;
  }
}
