/**
 * Napkin Studio server: the studio's API (`handler.ts`) over HTTP, beside the built client,
 * on the graph in `~/.napkin`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createStudio } from "./handler.js";

// The packs plus the journal of what was learned on top of them (store/journal.ts). A
// NAPKIN_GRAPH ending .json is an old snapshot, read and saved whole.
const graphPath = resolve(process.env.NAPKIN_GRAPH ?? resolve(homedir(), ".napkin/store.ncon"));
// The third store, beside the graph it joins to by `saidSeq` (concept-spec Part 13).
const tracePath = resolve(dirname(graphPath), "trace.jsonl");
const port = Number(process.env.NAPKIN_PORT ?? 4173);
const clientBuildPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../studio-client/dist");

await mkdir(dirname(graphPath), { recursive: true });
const studio = await createStudio({ graphPath, tracePath });
const { opened, store } = studio;
if (opened.journal?.migratedFrom) console.log(`Migrated ${opened.journal.migratedFrom} to ${graphPath} (kept as ${opened.journal.migratedFrom}.migrated)`);
if (opened.journal?.readOnly) console.warn(`${graphPath} is open in another process: reading it only, and nothing learned here is kept.`);
for (const [pack, n] of Object.entries(opened.journal?.overMissing ?? {})) console.warn(`${n} change(s) in the graph are over the pack ${pack}, which is not loaded: they are kept.`);
if (opened.journal?.skipped.length) console.warn(`Skipped ${opened.journal.skipped.length} unreadable line(s) in ${graphPath}`);

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("Napkin Studio running at http://127.0.0.1:" + port);
  console.log(`Concept graph: ${graphPath}`);
  console.log(`${store.size()} Concepts (${opened.seeded.created} seeded, ${opened.units} loaded)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    studio.save();
    server.close(() => process.exit(0));
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith("/api/")) {
    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
    const headers = Object.entries(request.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)] as [string, string]]));
    const answer = await studio.handle(new Request(url, { method, headers, ...(body === undefined ? {} : { body }) }));
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    // Streamed as it comes, so a chat turn's trace reaches the client step by step.
    if (answer.body) for await (const chunk of answer.body) response.write(chunk);
    response.end();
    return;
  }
  if (request.method === "GET") {
    await serveClientFile(url.pathname, response);
    return;
  }
  response.writeHead(404).end();
}

async function serveClientFile(
  path: string,
  response: ServerResponse,
): Promise<void> {
  const relative = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const requestedPath = resolve(clientBuildPath, relative);
  if (
    requestedPath !== clientBuildPath &&
    !requestedPath.startsWith(clientBuildPath + sep)
  ) {
    response.writeHead(403).end();
    return;
  }

  let filePath = requestedPath;
  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    if (extname(path)) {
      response.writeHead(404).end();
      return;
    }
    filePath = resolve(clientBuildPath, "index.html");
    try {
      content = await readFile(filePath);
    } catch {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      response.end("Studio client has not been built yet.");
      return;
    }
  }

  const contentType: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  response.writeHead(200, {
    "content-type":
      contentType[extname(filePath)] ?? "application/octet-stream",
    "cache-control":
      extname(filePath) === ".html"
        ? "no-store"
        : "public, max-age=31536000, immutable",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

/** A request's body, refused past 2 MB. */
async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 2_000_000) throw new Error("Request body exceeds 2 MB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
