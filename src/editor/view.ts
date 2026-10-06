/**
 * Layout and drawing for the editor. Produces an array of screen lines and a
 * layout description the editor uses to hit-test mouse events.
 */
import type { EditorState } from "./state.js";
import { renderRow, fgCode, bgCode, RESET, type ColorMode } from "../core/render.js";
import { resolveSprite, cellSize, cellOf } from "../core/resolve.js";
import { paletteRows, HUES, STEPS, type PaletteEntry } from "../core/palette.js";
import { hexToOklch } from "../core/color.js";

export interface Rect { x: number; y: number; w: number; h: number }

export interface Layout {
  cols: number;
  rows: number;
  canvas: Rect;          // real-size preview, in cells
  zoom: Rect | null;     // zoom view, in screen cells
  zoomFactor: number;
  palette: Rect | null;  // swatch grid area
  swatchW: number;
  /** Palette entries by grid position [row][col]. */
  paletteGrid: (PaletteEntry | null)[][];
  statusRow: number;
}

const PAD = 1;
const FIXED_ROWS = 3; // title + status + hint

function paletteGrid(): (PaletteEntry | null)[][] {
  // rows = steps (tints first), columns = hues; then a neutral row.
  const rows = paletteRows();          // one row per hue, then neutrals
  const grid: (PaletteEntry | null)[][] = [];
  for (let s = 0; s < STEPS.length; s++) grid.push(HUES.map((_, h) => rows[h][s]));
  const neutrals = rows[rows.length - 1];
  grid.push(HUES.map((_, i) => neutrals[i] ?? null));
  return grid;
}

export function computeLayout(st: EditorState, cols: number, rows: number): Layout {
  const sz = cellSize(st.sprite);
  const grid = paletteGrid();
  const swatchW = 3;
  const palRows = st.showPalette ? grid.length + 2 : 0; // + header + custom line
  const top = 1;
  const availRows = Math.max(1, rows - FIXED_ROWS - palRows - 2);
  const canvas: Rect = { x: PAD, y: top + 1, w: sz.cols, h: sz.rows };

  let zoom: Rect | null = null;
  let z = st.zoom;
  if (z > 0) {
    const zx = canvas.x + canvas.w + 2 + PAD;
    const availCols = cols - zx - 1;
    if (st.zoomAuto) {
      z = 1;
      while (z < 6 && st.sprite.width * 2 * (z + 1) <= availCols && st.sprite.height * (z + 1) <= availRows) z++;
    }
    while (z > 1 && (st.sprite.width * 2 * z > availCols || st.sprite.height * z > availRows)) z--;
    if (st.sprite.width * 2 * z <= availCols && st.sprite.height * z <= availRows) {
      zoom = { x: zx, y: top + 1, w: st.sprite.width * 2 * z, h: st.sprite.height * z };
    } else {
      z = 0;
    }
  }
  const areaH = Math.max(canvas.h, zoom?.h ?? 0);
  const palY = top + 1 + areaH + 1;
  const palette: Rect | null = st.showPalette ? { x: PAD, y: palY + 1, w: HUES.length * swatchW, h: grid.length } : null;
  const statusRow = rows - 2;
  return { cols, rows, canvas, zoom, zoomFactor: z, palette, swatchW, paletteGrid: grid, statusRow };
}

/** Which pixel a screen cell maps to in the zoom view, or null. */
export function zoomHit(l: Layout, x: number, y: number): { x: number; y: number } | null {
  if (!l.zoom || l.zoomFactor === 0) return null;
  if (x < l.zoom.x || y < l.zoom.y || x >= l.zoom.x + l.zoom.w || y >= l.zoom.y + l.zoom.h) return null;
  return { x: Math.floor((x - l.zoom.x) / (2 * l.zoomFactor)), y: Math.floor((y - l.zoom.y) / l.zoomFactor) };
}

/** Which pixel (top-left of the cell) a click on the real-size canvas maps to. */
export function canvasHit(l: Layout, st: EditorState, x: number, y: number): { x: number; y: number } | null {
  const c = l.canvas;
  if (x < c.x || y < c.y || x >= c.x + c.w || y >= c.y + c.h) return null;
  const cx = x - c.x, cy = y - c.y;
  return st.sprite.mode === "half" ? { x: cx, y: cy * 2 } : { x: cx * 2, y: cy * 2 };
}

export function paletteHit(l: Layout, x: number, y: number): PaletteEntry | null {
  const p = l.palette;
  if (!p || x < p.x || y < p.y || x >= p.x + p.w || y >= p.y + p.h) return null;
  return l.paletteGrid[y - p.y]?.[Math.floor((x - p.x) / l.swatchW)] ?? null;
}

// ---------- drawing ----------

const DIM = "\x1b[2m", BOLD = "\x1b[1m", INV = "\x1b[7m";

/** Pick black or white text for a background colour. */
function contrastFg(hex: string, cm: ColorMode): string {
  return fgCode(hexToOklch(hex).L > 0.6 ? "#000000" : "#ffffff", cm);
}

function set(lines: string[][], x: number, y: number, v: string): void {
  if (y >= 0 && y < lines.length && x >= 0 && x < lines[y].length) lines[y][x] = v;
}

function put(lines: string[][], x: number, y: number, text: string): void {
  // lines[y] is an array of "cell strings" (each may carry escape codes). We
  // write plain text one visible char at a time.
  if (y < 0 || y >= lines.length) return;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) if (x + i >= 0 && x + i < lines[y].length) lines[y][x + i] = chars[i];
}

function putStyled(lines: string[][], x: number, y: number, text: string, style: string): void {
  if (y < 0 || y >= lines.length) return;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) if (x + i >= 0 && x + i < lines[y].length) lines[y][x + i] = style + chars[i] + RESET;
}

function box(lines: string[][], r: Rect, title: string, style = DIM): void {
  const x0 = r.x - 1, y0 = r.y - 1, x1 = r.x + r.w, y1 = r.y + r.h;
  putStyled(lines, x0, y0, "┌" + "─".repeat(r.w) + "┐", style);
  putStyled(lines, x0, y1, "└" + "─".repeat(r.w) + "┘", style);
  for (let y = r.y; y < y1; y++) { putStyled(lines, x0, y, "│", style); putStyled(lines, x1, y, "│", style); }
  if (title && title.length + 2 <= r.w) putStyled(lines, x0 + 1, y0, " " + title + " ", style);
}

export function drawFrame(st: EditorState, l: Layout, cm: ColorMode, fileName: string): string[] {
  const lines: string[][] = [];
  for (let y = 0; y < l.rows; y++) lines.push(new Array<string>(l.cols).fill(" "));

  // Title
  const title = ` unicode-sprite  ${fileName}${st.dirty ? " *" : ""}`;
  putStyled(lines, 0, 0, title.padEnd(l.cols), BOLD);
  putStyled(lines, Math.max(0, l.cols - 9), 0, "? help  ", DIM);

  // Real-size canvas
  const cells = resolveSprite(st.sprite);
  box(lines, l.canvas, "preview");
  const curCell = cellOf(st.sprite, st.cursor.x, st.cursor.y);
  cells.forEach((row, cy) => {
    row.forEach((c, cx) => {
      const style = (c.ch !== " " && c.fg ? fgCode(c.fg, cm) : "") + (c.bg ? bgCode(c.bg, cm) : "");
      const isCur = !l.zoom && cx === curCell.cx && cy === curCell.cy;
      set(lines, l.canvas.x + cx, l.canvas.y + cy, style + (isCur ? INV : "") + c.ch + RESET);
    });
  });

  // Zoom view
  if (l.zoom) {
    const z = l.zoomFactor;
    box(lines, l.zoom, `zoom ×${z}`);
    for (let py = 0; py < st.sprite.height; py++) {
      for (let px = 0; px < st.sprite.width; px++) {
        const { cx, cy } = cellOf(st.sprite, px, py);
        const cell = cells[cy][cx];
        const idx = st.sprite.mode === "half" ? py & 1 : (px & 1) | ((py & 1) << 1);
        const actual = st.sprite.pixels[py][px];
        const shown = cell.shown[idx];
        const isCur = px === st.cursor.x && py === st.cursor.y;
        const merged = cell.conflict && actual !== shown;
        for (let dy = 0; dy < z; dy++) {
          for (let dx = 0; dx < 2 * z; dx++) {
            const sx = l.zoom.x + px * 2 * z + dx, sy = l.zoom.y + py * z + dy;
            let ch = " ", style = "";
            if (shown) {
              style = bgCode(shown, cm);
              if (merged) { ch = "×"; style += contrastFg(shown, cm); }
            } else {
              ch = (px + py) % 2 === 0 ? "·" : " ";
              style = DIM;
            }
            if (isCur) {
              const edge = dx === 0 || dx === 2 * z - 1;
              if (edge) { ch = dx === 0 ? "[" : "]"; style = (shown ? bgCode(shown, cm) + contrastFg(shown, cm) : INV); }
            }
            set(lines, sx, sy, style + ch + RESET);
          }
        }
      }
    }
    // Cell grid guide: dim marks on the border every cell, so you can see cell boundaries.
    const stepX = st.sprite.mode === "half" ? 2 * z : 4 * z;
    for (let x = stepX; x < l.zoom.w; x += stepX) putStyled(lines, l.zoom.x + x, l.zoom.y + l.zoom.h, "┴", DIM);
    for (let y = 2 * z; y < l.zoom.h; y += 2 * z) putStyled(lines, l.zoom.x + l.zoom.w, l.zoom.y + y, "┤", DIM);
  }

  // Palette
  if (l.palette) {
    const p = l.palette;
    putStyled(lines, p.x, p.y - 1, "palette  ([ ] cycle, click to pick, # custom hex)", DIM);
    l.paletteGrid.forEach((row, ry) => {
      row.forEach((entry, rx) => {
        if (!entry) return;
        const sel = entry.hex === st.color;
        const style = bgCode(entry.hex, cm) + contrastFg(entry.hex, cm);
        const text = sel ? "[●]" : "   ";
        for (let i = 0; i < l.swatchW; i++) set(lines, p.x + rx * l.swatchW + i, p.y + ry, style + text[i] + RESET);
      });
    });
    const cy = p.y + p.h;
    const sw = bgCode(st.color, cm) + "   " + RESET;
    put(lines, p.x, cy, " ".repeat(l.cols - p.x));
    set(lines, p.x, cy, sw); set(lines, p.x + 1, cy, ""); set(lines, p.x + 2, cy, "");
    put(lines, p.x + 4, cy, `${st.color} ${st.colorName}`);
  }

  // Status bar
  const toolLabel = { pencil: "pencil (p)", eraser: "eraser (e)", eyedropper: "eyedropper (i)" }[st.tool];
  const status = ` ${toolLabel} │ ${st.color} ${st.colorName} │ cursor ${st.cursor.x},${st.cursor.y} │ ${st.sprite.width}×${st.sprite.height} ${st.sprite.mode} │ ${st.dirty ? "unsaved changes" : "saved"}`;
  putStyled(lines, 0, l.statusRow, status.padEnd(l.cols), INV);
  const hint = st.message ? ` ${st.message}` : " arrows/hjkl move · space paint · u undo · ctrl+y redo · s save · q quit · m mode · r resize · z zoom · ? help";
  putStyled(lines, 0, l.statusRow + 1, hint.slice(0, l.cols), DIM);

  // Modal overlays
  drawModal(st, l, lines);

  return lines.map((row) => row.join(""));
}

const HELP = [
  "Tools        p pencil   e eraser   i eyedropper",
  "Paint        click/drag in the zoom view · space/enter at cursor",
  "             right-drag erases · middle-click picks a colour",
  "             backspace/delete erases at cursor",
  "Move         arrows or h j k l · click the preview",
  "Colour       [ ] cycle palette · click a swatch · # custom hex · wheel",
  "History      u / ctrl+z undo · ctrl+y / Z / ctrl+shift+z redo",
  "Canvas       r resize · m toggle half/quadrant · z toggle zoom · + - zoom",
  "File         s save · q quit (asks if unsaved)",
  "View         t toggle palette panel",
  "",
  "Cells marked × show colours merged to fit two per cell.",
  "",
  "press any key to close",
];

function drawModal(st: EditorState, l: Layout, lines: string[][]): void {
  const m = st.modal;
  if (m.kind === "none") return;
  if (m.kind === "help") {
    const w = Math.min(l.cols - 2, Math.max(...HELP.map((h) => h.length)) + 4);
    const h = HELP.length + 2;
    const x0 = Math.max(0, Math.floor((l.cols - w) / 2)), y0 = Math.max(0, Math.floor((l.rows - h) / 2));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lines[y0 + y]) lines[y0 + y][x0 + x] = " ";
    box(lines, { x: x0 + 1, y: y0 + 1, w: w - 2, h: h - 2 }, "help", "");
    HELP.forEach((t, i) => put(lines, x0 + 2, y0 + 1 + i, t.slice(0, w - 4)));
    return;
  }
  let text = "";
  if (m.kind === "prompt") text = ` ${m.label}: ${m.value}█`;
  else if (m.kind === "confirm-quit") text = " Unsaved changes. [y] save and quit · [n] quit without saving · [esc] cancel";
  else if (m.kind === "message") text = ` ${m.text}`;
  putStyled(lines, 0, l.statusRow + 1, text.padEnd(l.cols).slice(0, l.cols), INV + BOLD);
}
