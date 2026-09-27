/**
 * The host's files, for Node: the real file system. `#platform` resolves here everywhere
 * but a browser bundle, which gets `browser.ts` (the same surface over OPFS).
 *
 * Paths are plain absolute strings on both hosts, so the runtime names `~/.napkin/store.ncon`
 * or `<runtime>/packs` the same way whichever host holds them.
 */
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export { basename, dirname, join, resolve } from "node:path";

/** Where `~` is. */
export const home = (): string => process.env.HOME ?? homedir();
/** Where the host was started: the files a message names are found from here. */
export const workingDir = (): string => process.env.NAPKIN_WORKSPACE ?? process.cwd();
/** The runtime package: `packs/`, `data/`, `eval/`. */
export const runtimeRoot = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
/** A file inside an installed package, `an-array-of-english-words/index.json`. */
export const moduleFile = (spec: string): string => createRequire(import.meta.url).resolve(spec);

export function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
export const exists = (path: string): boolean => existsSync(path);
export const mtime = (path: string): number => statSync(path).mtimeMs;
export const list = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []);

/** Written beside it and renamed, so an interruption cannot leave half a file. */
export function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text, "utf8");
  renameSync(`${path}.tmp`, path);
}
export function append(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, text, "utf8");
}
export const rename = (from: string, to: string): void => renameSync(from, to);
export const remove = (path: string): void => unlinkSync(path);

/** SHA-256, hex: what the traces and eval runs on disk were hashed with. */
export const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Whether a process id is running. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Take the one writer's place on `path`, answering false when another running process holds
 * it. Released when this process exits; a stale lock is harmless, its pid is not running.
 */
export function claim(path: string): boolean {
  const lock = `${path}.lock`;
  const pid = Number(read(lock)?.trim());
  if (pid && pid !== process.pid && alive(pid)) return false;
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, String(process.pid), "utf8");
  process.once("exit", () => release(path));
  return true;
}
export function release(path: string): void {
  const lock = `${path}.lock`;
  try {
    if (read(lock)?.trim() === String(process.pid)) unlinkSync(lock);
  } catch {
    // As above: a stale lock is harmless.
  }
}

/**
 * JavaScript run apart from the host: a fresh context with no require, no process, no file or
 * network, stopped after a second. For code a person shows Napkin and asks it to run.
 */
export function runIsolated(source: string, timeoutMs = 1000): { value?: unknown; error?: string } {
  try {
    return { value: runInNewContext(source, Object.create(null), { timeout: timeoutMs }) };
  } catch (error) {
    // An error from the other context is not this context's Error: read its message.
    const message = error !== null && typeof error === "object" && "message" in error ? (error as { message: unknown }).message : undefined;
    return { error: typeof message === "string" ? message : String(error) };
  }
}
