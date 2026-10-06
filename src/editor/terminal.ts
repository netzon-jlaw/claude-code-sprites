/**
 * Minimal raw-mode terminal layer: alternate screen, SGR mouse reporting,
 * and an input parser that turns bytes into key and mouse events.
 */
import { EventEmitter } from "node:events";

export interface KeyEvent {
  type: "key";
  /** Normalised key name: "a", "A", "up", "enter", "escape", "backspace", "tab", "space", "delete", "pageup", ... */
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  /** Raw sequence, for debugging. */
  raw: string;
}

export type MouseAction = "down" | "up" | "drag" | "move" | "wheelup" | "wheeldown";

export interface MouseEvent {
  type: "mouse";
  /** 0-based column / row. */
  x: number;
  y: number;
  button: 0 | 1 | 2 | 3; // left, middle, right, none
  action: MouseAction;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

export interface ResizeEvent { type: "resize"; cols: number; rows: number }

export type InputEvent = KeyEvent | MouseEvent | ResizeEvent;

const CSI_KEYS: Record<string, string> = {
  A: "up", B: "down", C: "right", D: "left", H: "home", F: "end", Z: "backtab",
  "1~": "home", "2~": "insert", "3~": "delete", "4~": "end", "5~": "pageup", "6~": "pagedown", "7~": "home", "8~": "end",
};

/**
 * Parse one complete input chunk into events. Exported for tests.
 * Incomplete trailing escape sequences are returned in `rest`.
 */
export function parseInput(data: string): { events: InputEvent[]; rest: string } {
  const events: InputEvent[] = [];
  let i = 0;
  const key = (name: string, raw: string, mods: Partial<KeyEvent> = {}): void => {
    events.push({ type: "key", name, ctrl: false, shift: false, meta: false, raw, ...mods });
  };
  while (i < data.length) {
    const ch = data[i];
    if (ch === "\x1b") {
      const next = data[i + 1];
      if (next === undefined) {
        // Lone ESC at the end of the chunk: treat as the escape key (we don't wait).
        key("escape", ch); i++; continue;
      }
      if (next === "[" || next === "O") {
        // CSI / SS3 sequence
        let j = i + 2, params = "";
        while (j < data.length && /[0-9;<?:]/.test(data[j])) params += data[j++];
        if (j >= data.length) return { events, rest: data.slice(i) };
        const final = data[j];
        const raw = data.slice(i, j + 1);
        i = j + 1;
        if (next === "[" && params.startsWith("<") && (final === "M" || final === "m")) {
          const [b, x, y] = params.slice(1).split(";").map(Number);
          const button = (b & 3) as 0 | 1 | 2 | 3;
          const motion = !!(b & 32), wheel = !!(b & 64);
          let action: MouseAction;
          if (wheel) action = (b & 1) ? "wheeldown" : "wheelup";
          else if (final === "m") action = "up";
          else if (motion) action = button === 3 ? "move" : "drag";
          else action = "down";
          events.push({ type: "mouse", x: x - 1, y: y - 1, button: wheel ? 3 : button, action, shift: !!(b & 4), meta: !!(b & 8), ctrl: !!(b & 16) });
          continue;
        }
        if (next === "[" && final === "u") {
          // kitty / CSI u: code;mods u
          const [code, mods] = params.split(";").map(Number);
          const m = (mods || 1) - 1;
          const name = code === 13 ? "enter" : code === 27 ? "escape" : code === 127 ? "backspace" : code === 9 ? "tab" : String.fromCodePoint(code);
          key(name, raw, { shift: !!(m & 1), meta: !!(m & 2), ctrl: !!(m & 4) });
          continue;
        }
        const parts = params.split(";");
        const modsNum = parts.length > 1 ? Number(parts[1]) - 1 : 0;
        const mods = { shift: !!(modsNum & 1), meta: !!(modsNum & 2), ctrl: !!(modsNum & 4) };
        const name = CSI_KEYS[final] ?? CSI_KEYS[parts[0] + final] ?? (final === "~" ? `f${parts[0]}` : `csi-${final}`);
        key(name, raw, mods);
        continue;
      }
      // Alt + key
      const { events: sub } = parseInput(data[i + 1]);
      if (sub[0]?.type === "key") events.push({ ...sub[0], meta: true, raw: data.slice(i, i + 2) });
      i += 2;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code === 13 || code === 10) key("enter", ch);
    else if (code === 9) key("tab", ch);
    else if (code === 127 || code === 8) key("backspace", ch);
    else if (code === 32) key("space", ch);
    else if (code < 32) key(String.fromCharCode(code + 96), ch, { ctrl: true });
    else {
      const s = String.fromCodePoint(code);
      key(s, s, { shift: s !== s.toLowerCase() && s === s.toUpperCase() });
      i += s.length - 1;
    }
    i++;
  }
  return { events, rest: "" };
}

export class Terminal extends EventEmitter {
  private buffer = "";
  private active = false;
  private onData = (d: Buffer | string): void => this.feed(d.toString());
  private onResize = (): void => { this.emit("event", { type: "resize", cols: this.cols, rows: this.rows } satisfies ResizeEvent); };

  constructor(private readonly input: NodeJS.ReadStream = process.stdin, private readonly output: NodeJS.WriteStream = process.stdout) {
    super();
  }

  get cols(): number { return this.output.columns || 80; }
  get rows(): number { return this.output.rows || 24; }

  feed(data: string): void {
    const { events, rest } = parseInput(this.buffer + data);
    this.buffer = rest;
    for (const e of events) this.emit("event", e);
  }

  enter(): void {
    if (this.active) return;
    if (!this.input.isTTY || !this.output.isTTY) throw new Error("The editor needs an interactive terminal (stdin and stdout must be TTYs).");
    this.active = true;
    this.input.setRawMode(true);
    this.input.setEncoding("utf8");
    this.input.resume();
    this.input.on("data", this.onData);
    this.output.on("resize", this.onResize);
    // alt screen, hide cursor, enable SGR mouse with drag reporting
    this.write("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1002h\x1b[?1006h");
  }

  leave(): void {
    if (!this.active) return;
    this.active = false;
    this.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?25h\x1b[0m\x1b[?1049l");
    this.input.off("data", this.onData);
    this.output.off("resize", this.onResize);
    this.input.setRawMode(false);
    this.input.pause();
  }

  write(s: string): void { this.output.write(s); }

  /** Replace the whole screen with the given lines. */
  draw(lines: string[]): void {
    let out = "\x1b[H";
    for (let i = 0; i < lines.length; i++) {
      out += lines[i] + "\x1b[0m\x1b[K";
      if (i < lines.length - 1) out += "\r\n";
    }
    out += "\x1b[0J";
    this.write(out);
  }
}
