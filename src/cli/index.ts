#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { existsSync } from "node:fs";
import { createSprite, setPixel, type RenderMode, FILE_EXT } from "../core/sprite.js";
import { renderAnsi, detectColorMode, fgCode, bgCode, RESET, type ColorMode } from "../core/render.js";
import { PALETTE, paletteRows, resolveColor } from "../core/palette.js";
import { exportSprite, extensionFor, EXPORT_FORMATS, type ExportFormat } from "../export/index.js";
import { importPng } from "../import/png.js";
import { importAnsi } from "../import/ansi.js";
import { readSprite, writeSprite, writeOutput, readInputBuffer, isStdin, fail } from "./io.js";

// Exit quietly when the reader closes the pipe early (e.g. `| head`).
process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); throw e; });

const program = new Command();

function intArg(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new InvalidArgumentError("must be an integer");
  return n;
}
function modeArg(v: string): RenderMode {
  if (v === "half" || v === "quadrant") return v;
  throw new InvalidArgumentError("must be 'half' or 'quadrant'");
}
function colorModeArg(v: string): ColorMode {
  if (v === "truecolor" || v === "256") return v;
  throw new InvalidArgumentError("must be 'truecolor' or '256'");
}
function formatArg(v: string): ExportFormat {
  if ((EXPORT_FORMATS as readonly string[]).includes(v)) return v as ExportFormat;
  throw new InvalidArgumentError(`must be one of ${EXPORT_FORMATS.join(", ")}`);
}

program
  .name("unicode-sprite")
  .description("Draw small pixel-art sprites that render in the terminal with Unicode block characters and 24-bit color.\n\nCommands read from stdin and write to stdout when no file is given, so they can be piped together.")
  .version("0.1.0")
  .showHelpAfterError();

program
  .command("new [file]")
  .description("Create a blank sprite (written to stdout when no file is given)")
  .option("-W, --width <n>", "width in pixels", intArg, 16)
  .option("-H, --height <n>", "height in pixels", intArg, 8)
  .option("-m, --mode <mode>", "render mode: half or quadrant", modeArg, "quadrant")
  .option("-n, --name <name>", "sprite name")
  .option("-f, --force", "overwrite an existing file")
  .action((file: string | undefined, o) => {
    try {
      if (!isStdin(file) && existsSync(file!) && !o.force) fail(`${file} already exists (use --force to overwrite)`);
      writeSprite(createSprite(o.width, o.height, o.mode, o.name), file);
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("edit <file>")
  .description("Open the interactive editor (creates the file if it does not exist)")
  .option("-W, --width <n>", "width for a new file", intArg, 16)
  .option("-H, --height <n>", "height for a new file", intArg, 8)
  .option("-m, --mode <mode>", "render mode for a new file", modeArg, "quadrant")
  .action(async (file: string, o) => {
    try {
      const { runEditor } = await import("../editor/editor.js");
      await runEditor(file, { width: o.width, height: o.height, mode: o.mode });
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("render [file]")
  .description("Print a sprite to the terminal")
  .option("-c, --color <mode>", "truecolor or 256 (default: detect from COLORTERM)", colorModeArg)
  .option("-i, --indent <text>", "prefix each line", "")
  .action(async (file: string | undefined, o) => {
    try {
      const s = await readSprite(file);
      process.stdout.write(renderAnsi(s, { colorMode: o.color ?? detectColorMode(), indent: o.indent }));
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("export [file]")
  .description("Export a sprite: ansi, sh, js, ts, py, png, html or txt")
  .requiredOption("-f, --format <format>", `one of ${EXPORT_FORMATS.join(", ")}`, formatArg)
  .option("-o, --out <path>", "output path (default: stdout)")
  .option("-c, --color <mode>", "truecolor or 256", colorModeArg, "truecolor")
  .option("-s, --scale <n>", "png: pixels per sprite pixel", intArg, 8)
  .option("-b, --background <hex>", "png: background colour (default transparent)")
  .option("-n, --var-name <name>", "js/ts/py: constant name")
  .option("--no-pre", "html: emit spans only, without the <pre> wrapper")
  .action(async (file: string | undefined, o) => {
    try {
      const s = await readSprite(file);
      if (o.format === "png" && isStdin(o.out) && process.stdout.isTTY) {
        fail("refusing to write PNG bytes to a terminal; pass -o <file.png> or pipe the output");
      }
      const data = exportSprite(s, o.format, { colorMode: o.color, scale: o.scale, background: o.background, varName: o.varName, pre: o.pre });
      writeOutput(data, o.out);
      if (!isStdin(o.out)) process.stderr.write(`wrote ${o.out}\n`);
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("import [file]")
  .description("Import a PNG image or an ANSI text file as a sprite")
  .option("-W, --width <n>", "target width in pixels (png)", intArg)
  .option("-H, --height <n>", "target height in pixels (png; default keeps aspect ratio)", intArg)
  .option("-m, --mode <mode>", "half or quadrant", modeArg)
  .option("-o, --out <path>", "output path (default: stdout)")
  .option("-n, --name <name>", "sprite name")
  .option("--keep-colors", "png: keep original colours instead of snapping to the palette")
  .option("-a, --alpha <n>", "png: alpha threshold 0-255", intArg, 128)
  .option("-t, --type <type>", "force input type: png or ansi (default: detect)")
  .action(async (file: string | undefined, o) => {
    try {
      const buf = await readInputBuffer(file);
      const isPng = o.type === "png" || (o.type !== "ansi" && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);
      const name = o.name ?? (file && !isStdin(file) ? file.replace(/^.*\//, "").replace(/\.[^.]+$/, "") : undefined);
      const s = isPng
        ? importPng(buf, { width: o.width, height: o.height, mode: o.mode, palette: !o.keepColors, alphaThreshold: o.alpha, name })
        : importAnsi(buf.toString("utf8"), { mode: o.mode, name });
      writeSprite(s, o.out);
      if (!isStdin(o.out)) process.stderr.write(`wrote ${o.out} (${s.width}x${s.height} ${s.mode})\n`);
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("palette")
  .description("Print the palette as colour swatches with hex codes and names")
  .option("-c, --color <mode>", "truecolor or 256 (default: detect)", colorModeArg)
  .option("--json", "print as JSON")
  .action((o) => {
    if (o.json) { process.stdout.write(JSON.stringify(PALETTE.map(({ name, hex }) => ({ name, hex })), null, 2) + "\n"); return; }
    const cm: ColorMode = o.color ?? detectColorMode();
    for (const row of paletteRows()) {
      let line = row[0].hueName.padEnd(8);
      for (const p of row) line += bgCode(p.hex, cm) + "    " + RESET + " ";
      process.stdout.write(line + "\n" + " ".repeat(8));
      for (const p of row) process.stdout.write(fgCode(p.hex, cm) + p.hex.slice(1).padEnd(5) + RESET);
      process.stdout.write("\n" + " ".repeat(8) + row.map((p) => p.name.replace(p.hueName, "").replace(/^-/, "").padEnd(5)).join("") + "\n\n");
    }
  });

/** Parse "[file] x y [color]" style arguments; file omitted means stdin -> stdout. */
function pixelArgs(args: string[], withColor: boolean): { file?: string; x: number; y: number; color?: string } {
  const need = withColor ? 3 : 2;
  if (args.length !== need && args.length !== need + 1) {
    throw new Error(`expected ${withColor ? "[file] <x> <y> <color>" : "[file] <x> <y>"}`);
  }
  const file = args.length === need + 1 ? args.shift() : undefined;
  const x = intArg(args[0]), y = intArg(args[1]);
  return { file, x, y, color: withColor ? args[2] : undefined };
}

program
  .command("set")
  .argument("<args...>", "[file] <x> <y> <color>")
  .description("Set one pixel to a palette name or hex colour (edits the file in place, or stdin -> stdout)")
  .option("-o, --out <path>", "write to this path instead of in place")
  .action(async (args: string[], o) => {
    try {
      const { file, x, y, color } = pixelArgs(args, true);
      const s = await readSprite(file);
      if (!setPixel(s, x, y, resolveColor(color!)) && (x < 0 || y < 0 || x >= s.width || y >= s.height)) {
        fail(`(${x}, ${y}) is outside the ${s.width}x${s.height} canvas`);
      }
      writeSprite(s, o.out ?? file);
    } catch (e) { fail((e as Error).message); }
  });

program
  .command("clear")
  .argument("<args...>", "[file] <x> <y>")
  .description("Make one pixel transparent (edits the file in place, or stdin -> stdout)")
  .option("-o, --out <path>", "write to this path instead of in place")
  .action(async (args: string[], o) => {
    try {
      const { file, x, y } = pixelArgs(args, false);
      const s = await readSprite(file);
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) fail(`(${x}, ${y}) is outside the ${s.width}x${s.height} canvas`);
      setPixel(s, x, y, null);
      writeSprite(s, o.out ?? file);
    } catch (e) { fail((e as Error).message); }
  });

program.addHelpText("after", `
Examples:
  unicode-sprite new mascot${FILE_EXT} --width 16 --height 8 --mode quadrant
  unicode-sprite edit mascot${FILE_EXT}
  unicode-sprite render mascot${FILE_EXT}
  unicode-sprite export mascot${FILE_EXT} --format js -o mascot.js
  unicode-sprite import logo.png --width 24 -o logo${FILE_EXT}
  unicode-sprite new -W 4 -H 4 | unicode-sprite set 0 0 orange | unicode-sprite render
`);

program.parseAsync(process.argv).catch((e) => fail((e as Error).message));
