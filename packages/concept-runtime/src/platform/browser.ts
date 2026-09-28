/**
 * The host's files, in a browser: the same surface as `node.ts`, held in memory and kept in
 * the origin private file system (OPFS). It runs in a dedicated Worker, where OPFS gives
 * synchronous access handles, so the runtime's reads and writes stay synchronous as they are
 * on Node.
 *
 *   mount(files)       what ships with the site (packs, dictionaries, corpora): read only
 *   restore(claimed)   what this browser wrote before, read back; `claimed` paths are opened
 *                      for synchronous writing now, and their exclusive handles are the lock
 *                      a second tab finds held (it then reads the graph only, as a second
 *                      Node process does)
 *
 * Every write is kept: through its open handle at once, or, for a path first written later,
 * as soon as a handle for it is open.
 */

export const home = (): string => "/home";
export const workingDir = (): string => "/work";
export const runtimeRoot = "/runtime";
export const moduleFile = (spec: string): string => `/modules/${spec}`;

/* ---- paths: POSIX, the only kind a browser host has ---- */

const normal = (path: string): string => {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
};
export const join = (...parts: string[]): string => normal(parts.join("/"));
export const resolve = (...parts: string[]): string => {
  const from = parts.reduce((at, p) => (p.startsWith("/") ? p : `${at}/${p}`), "/");
  return normal(from);
};
export const dirname = (path: string): string => normal(path).replace(/\/[^/]*$/, "") || "/";
export const basename = (path: string, ext?: string): string => {
  const name = normal(path).split("/").pop() ?? "";
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
};

/* ---- OPFS, as much of it as is used here ---- */

interface SyncHandle {
  read(buffer: Uint8Array, options: { at: number }): number;
  write(buffer: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}
interface FileEntry {
  kind: "file";
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createSyncAccessHandle(): Promise<SyncHandle>;
}
interface Storage {
  getDirectory(): Promise<Directory>;
  persist?(): Promise<boolean>;
}
interface Directory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileEntry>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<FileEntry | { kind: "directory" }>;
}
const storage = (): Storage => (globalThis as unknown as { navigator: { storage: Storage } }).navigator.storage;
const opfs = (): Promise<Directory> => storage().getDirectory();

/* ---- the files ---- */

const files = new Map<string, { text: string; mtime: number }>();
const handles = new Map<string, SyncHandle>();
/** Paths another tab holds: read here, never written. */
const heldElsewhere = new Set<string>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** One OPFS entry per path, flat, named by the whole path. */
const entryName = (path: string): string => encodeURIComponent(path);

let root: Promise<Directory> | undefined;
/** Set when this browser gives no file system to keep files in: they live in memory only. */
let inMemory = false;
/** Writes waiting on a handle, one chain per path so they land in order. */
const pending = new Map<string, Promise<void>>();

/** Files that ship with the site, readable and never persisted. */
export function mount(entries: Record<string, string>): void {
  for (const [path, text] of Object.entries(entries)) files.set(normal(path), { text, mtime: 0 });
}

/** Read back what this browser kept, and open `claimed` for synchronous writing. */
export async function restore(claimed: readonly string[] = []): Promise<void> {
  // Asked, not assumed: without it the browser may evict the graph when storage runs low.
  await storage().persist?.().catch(() => false);
  root ??= opfs();
  let dir: Directory;
  try {
    dir = await root;
  } catch {
    // No origin private file system (Safari's Private Browsing): what is learned lives in memory
    // for this visit, rather than nothing working at all.
    inMemory = true;
    return;
  }
  for await (const entry of dir.values()) {
    if (entry.kind !== "file") continue;
    const path = decodeURIComponent(entry.name);
    await open(entry, path);
  }
  for (const path of claimed.map(normal)) {
    if (handles.has(path) || heldElsewhere.has(path)) continue;
    await open(await dir.getFileHandle(entryName(path), { create: true }), path);
  }
}

async function open(entry: FileEntry, path: string): Promise<SyncHandle | undefined> {
  try {
    const handle = await entry.createSyncAccessHandle();
    const bytes = new Uint8Array(handle.getSize());
    handle.read(bytes, { at: 0 });
    handles.set(path, handle);
    if (bytes.length || !files.has(path)) files.set(path, { text: decoder.decode(bytes), mtime: Date.now() });
    return handle;
  } catch {
    // Another tab holds it: its text is still readable, just not writable here.
    heldElsewhere.add(path);
    files.set(path, { text: await (await entry.getFile()).text(), mtime: Date.now() });
    return undefined;
  }
}

/** Put `path`'s whole text on disk, opening a handle for it first when it has none. */
function persist(path: string): void {
  if (inMemory || heldElsewhere.has(path)) return;
  const handle = handles.get(path);
  const text = files.get(path)?.text;
  if (handle) {
    if (text === undefined) return;
    const bytes = encoder.encode(text);
    handle.truncate(0);
    handle.write(bytes, { at: 0 });
    handle.flush();
    return;
  }
  const before = pending.get(path) ?? Promise.resolve();
  pending.set(
    path,
    before.then(async () => {
      root ??= opfs();
      const dir = await root;
      if (!handles.has(path)) await open(await dir.getFileHandle(entryName(path), { create: true }), path).catch(() => undefined);
      if (handles.has(path)) persist(path);
    }).catch(() => undefined),
  );
}

export const read = (path: string): string | undefined => files.get(normal(path))?.text;
export const exists = (path: string): boolean => {
  const at = normal(path);
  return files.has(at) || [...files.keys()].some((k) => k.startsWith(`${at}/`));
};
export const mtime = (path: string): number => files.get(normal(path))?.mtime ?? 0;
export const list = (dir: string): string[] => {
  const prefix = `${normal(dir)}/`.replace(/^\/\//, "/");
  const names = new Set<string>();
  for (const k of files.keys()) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split("/")[0]!);
  return [...names];
};

export function write(path: string, text: string): void {
  const at = normal(path);
  files.set(at, { text, mtime: Date.now() });
  persist(at);
}
export function append(path: string, text: string): void {
  const at = normal(path);
  files.set(at, { text: (files.get(at)?.text ?? "") + text, mtime: Date.now() });
  const handle = handles.get(at);
  if (!handle) return persist(at);
  handle.write(encoder.encode(text), { at: handle.getSize() });
  handle.flush();
}
export function rename(from: string, to: string): void {
  const text = read(from);
  if (text === undefined) return;
  remove(from);
  write(to, text);
}
export function remove(path: string): void {
  const at = normal(path);
  files.delete(at);
  const handle = handles.get(at);
  handles.delete(at);
  handle?.close();
  void (root ??= opfs()).then((dir) => dir.removeEntry(entryName(at))).catch(() => undefined);
}

/** One writer per path: a second tab could not open its handle. */
export const claim = (path: string): boolean => !heldElsewhere.has(normal(path));
export const release = (_path: string): void => undefined;

/* ---- a digest ---- */

/**
 * Two polynomial hashes over the text, 16 hex digits: stable, and enough to tell
 * realizations and prompts apart. Not SHA-256, so a browser's hashes differ from Node's;
 * each host only compares hashes it made itself.
 */
export function digest(text: string): string {
  let a = 7;
  let b = 13;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = (a * 31 + code) % 4294967291;
    b = (b * 131 + code) % 4294967279;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** A browser host runs no code it is shown. */
export function runIsolated(_source: string, _timeoutMs = 1000): { value?: unknown; error?: string } {
  return { error: "running code is not offered in the browser" };
}
