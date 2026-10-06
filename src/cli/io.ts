import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseSprite, toJSON, type Sprite } from "../core/sprite.js";

export function isStdin(file: string | undefined): boolean {
  return !file || file === "-";
}

async function readStdin(): Promise<Buffer> {
  if (process.stdin.isTTY) throw new Error("No input file given and stdin is a terminal. Pass a file or pipe data in.");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export async function readInputBuffer(file: string | undefined): Promise<Buffer> {
  if (isStdin(file)) return readStdin();
  if (!existsSync(file!)) throw new Error(`File not found: ${file}`);
  return readFileSync(file!);
}

export async function readInputText(file: string | undefined): Promise<string> {
  return (await readInputBuffer(file)).toString("utf8");
}

export async function readSprite(file: string | undefined): Promise<Sprite> {
  return parseSprite(await readInputText(file));
}

export function writeOutput(data: string | Buffer, out: string | undefined): void {
  if (isStdin(out)) {
    process.stdout.write(data);
  } else {
    writeFileSync(out!, data);
  }
}

export function writeSprite(s: Sprite, out: string | undefined): void {
  writeOutput(toJSON(s), out);
}

export function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}
