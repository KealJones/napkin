/**
 * Napkin Studio server.
 *
 * Serves the built client and exposes the Concept graph, conversations, traces, and one
 * chat turn as a stream. The interface is not a Concept and is not required to be
 * (concept-spec Part 17.2): it observes and presents, it does not decide behaviour.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  appendTrace,
  c,
  ConceptStore,
  ConversationRepository,
  format,
  load,
  parse,
  Relations,
  Runtime,
  save,
  seed,
  type ConceptUnit,
  type Expr,
  type TraceEvent,
  turn as runTurn,
} from "@napkin/concept-runtime";
import { concept, realization } from "@napkin/concept-runtime";
import {
  compareEars,
  earsCases,
  earsPrompt,
  hashEarsPrompt,
  listEarsRuns,
  logEarsConversion,
  openEarsRun,
  recentEarsConversions,
  hear,
  latestEarsRun,
  lift,
  rescoreEars,
  runEars,
  saveEarsRun,
  summarizeEars,
  type EarsRun,
} from "@napkin/concept-runtime";

const graphPath = resolve(process.env.NAPKIN_GRAPH ?? resolve(homedir(), ".napkin/graph.json"));
// The third store, beside the graph it joins to by `saidSeq` (concept-spec Part 13).
const tracePath = resolve(dirname(graphPath), "trace.jsonl");
const port = Number(process.env.NAPKIN_PORT ?? 4173);
const clientBuildPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../studio-client/dist");

await mkdir(dirname(graphPath), { recursive: true });
const store = new ConceptStore();
// Load before seeding, so a stale copy of a seeded realization cannot shadow the current
// one: newer shadows older, and the seed must be newer.
const loaded = load(store, graphPath);
const seedReport = seed(store);
const relations = new Relations(store);
const conversations = new ConversationRepository(store);

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("Napkin Studio running at http://127.0.0.1:" + port);
  console.log(`Concept graph: ${graphPath}`);
  console.log(`${store.size()} Concepts (${seedReport.created} seeded, ${loaded} loaded)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    save(store, graphPath);
    server.close(() => process.exit(0));
  });
}

/** Every trace of every turn this process has served, newest first. */
const traces: { traceId: string; startedAt: string; concept: string; events: TraceEvent[] }[] = [];

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/concepts") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? "100")));
    const units = query ? store.search(query, limit) : store.all().slice(0, limit);
    sendJson(response, 200, {
      concepts: units.map(describeUnit),
      total: units.length,
      graph: { size: store.size(), path: graphPath },
    });
    return;
  }

  if (path.startsWith("/api/concepts/") && request.method === "GET") {
    const identity = decodeURIComponent(path.slice("/api/concepts/".length));
    const unit = store.get(identity);
    if (!unit) {
      sendJson(response, 404, { error: "Concept not found", cluster: relations.cluster(identity) });
      return;
    }
    sendJson(response, 200, { concept: describeUnit(unit), usage: usageOf(identity) });
    return;
  }

  // Editing a realization by hand is the whole point of a Concept browser.
  if (path.startsWith("/api/concepts/") && request.method === "PUT") {
    const identity = decodeURIComponent(path.slice("/api/concepts/".length));
    const body = await readJson(request);
    if (!isRecord(body) || body.identity !== identity) {
      sendJson(response, 400, { error: "Concept identity does not match its URL" });
      return;
    }
    try {
      const saved = saveEdited(identity, body);
      save(store, graphPath);
      sendJson(response, 200, { concept: saved });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (request.method === "GET" && path === "/api/conversations") {
    sendJson(response, 200, { conversations: conversations.listActive() });
    return;
  }

  if (request.method === "POST" && path === "/api/conversations") {
    const body = await readJson(request);
    const persistent = !isRecord(body) || body.persistent !== false;
    const created = conversations.create(persistent);
    if (persistent) save(store, graphPath);
    sendJson(response, 201, { conversation: created });
    return;
  }

  if (path.startsWith("/api/conversations/") && request.method === "GET") {
    const id = decodeURIComponent(path.slice("/api/conversations/".length));
    const unit = conversations.get(id);
    if (!unit) {
      sendJson(response, 404, { error: "Conversation not found" });
      return;
    }
    sendJson(response, 200, {
      summary: conversations.listActive().find((x) => x.id === id),
      unit,
    });
    return;
  }

  if (path.startsWith("/api/conversations/") && request.method === "DELETE") {
    const id = decodeURIComponent(path.slice("/api/conversations/".length));
    if (!id.startsWith("IsolatedConversation_")) {
      sendJson(response, 400, { error: "Only isolated conversations can be closed this way" });
      return;
    }
    const closed = conversations.closeIsolated(id);
    sendJson(response, closed ? 200 : 404, { closed });
    return;
  }

  if (request.method === "GET" && path === "/api/traces") {
    sendJson(response, 200, {
      traces: traces.map((t) => ({
        traceId: t.traceId,
        startedAt: t.startedAt,
        concept: t.concept,
        events: t.events.length,
      })),
    });
    return;
  }

  if (path.startsWith("/api/traces/") && request.method === "GET") {
    const traceId = decodeURIComponent(path.slice("/api/traces/".length));
    const found = traces.find((t) => t.traceId === traceId);
    sendJson(response, 200, { traceId, events: found?.events ?? [] });
    return;
  }

  if (request.method === "GET" && path === "/api/agenda") {
    sendJson(response, 200, { graph: store.size(), path: graphPath });
    return;
  }

  if (request.method === "POST" && path === "/api/chat/turn") {
    await runChatTurn(request, response);
    return;
  }

  if (path.startsWith("/api/ears/")) {
    await handleEarsLab(path, request, response);
    return;
  }

  if (request.method === "GET" && !path.startsWith("/api/")) {
    await serveClientFile(path, response);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const describeUnit = (unit: ConceptUnit) => ({
  identity: unit.identity,
  // A relation says where it holds, when it holds somewhere in particular.
  relations: unit.relations.map((r) =>
    r.context === undefined ? format(r.claim) : `${format(r.claim)}  in ${format(r.context)}`,
  ),
  // Derived, not stored: a symmetric relation is findable from the end that does not hold it.
  derived: relations.of(unit.identity).map((t) => format(t.expr)),
  cluster: relations.cluster(unit.identity),
  realizations: unit.realizations.map((r) => ({
    pattern: format(r.pattern),
    context: r.context === undefined ? "" : format(r.context),
    body: format(r.body),
    properties: r.properties.map(format),
    retired: r.retired ?? false,
  })),
  realizable: unit.realizations.length > 0,
  updatedAt: unit.updatedAt,
});

const usageOf = (identity: string) => {
  let selected = 0;
  let residual = 0;
  for (const t of traces) {
    for (const e of t.events) {
      if (e.concept !== identity) continue;
      if (e.outcome === "residual") residual += 1;
      else if (e.outcome === "success") selected += 1;
    }
  }
  return { selected, residual };
};

/**
 * Realizations are append-only (concept-spec Part 3.1), so an edit ADDS rather than
 * replacing. The previous realization is retained and simply shadowed.
 */
function saveEdited(identity: string, body: Record<string, unknown>) {
  const incoming = Array.isArray(body.realizations) ? body.realizations : [];
  const existing = store.get(identity);
  const known = new Set(
    (existing?.realizations ?? []).map((r) => `${format(r.pattern)}|${r.context ? format(r.context) : ""}|${format(r.body)}`),
  );
  if (Array.isArray(body.relations)) {
    // The editor sends every relation back. Only a new one is an assertion; re-adding the
    // rest would stamp them all as said again.
    const held = new Set((existing?.relations ?? []).filter((r) => r.context === undefined).map((r) => format(r.claim)));
    for (const relation of body.relations) {
      if (typeof relation !== "string" || !relation.trim()) continue;
      const claim = parse(relation);
      if (!held.has(format(claim))) store.addRelation(identity, claim);
    }
  }
  if (!store.has(identity)) store.seed(concept(identity));
  for (const r of incoming) {
    if (!isRecord(r) || typeof r.pattern !== "string" || typeof r.body !== "string") continue;
    const contextText = typeof r.context === "string" && r.context.trim() ? r.context : undefined;
    const key = `${format(parse(r.pattern))}|${contextText ? format(parse(contextText)) : ""}|${format(parse(r.body))}`;
    if (known.has(key)) continue;
    store.addRealization(
      identity,
      realization({
        pattern: parse(r.pattern),
        ...(contextText ? { context: parse(contextText) } : {}),
        body: parse(r.body),
        properties: Array.isArray(r.properties)
          ? r.properties.filter((p): p is string => typeof p === "string").map(parse)
          : [],
      }),
    );
  }
  return describeUnit(store.get(identity)!);
}

async function runChatTurn(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.conversationId !== "string" || typeof body.text !== "string" || !body.text.trim()) {
    sendJson(response, 400, { error: "A conversationId and non-empty text are required" });
    return;
  }
  const conversationId = body.conversationId;
  if (!conversations.get(conversationId)) {
    sendJson(response, 404, { error: "Conversation not found" });
    return;
  }
  const model = typeof body.model === "string" ? body.model : "qwen3.5:4b";
  const endpointText = typeof body.endpoint === "string" ? body.endpoint.replace(/\/$/, "") : "http://127.0.0.1:11434";
  let endpoint: URL;
  try {
    endpoint = new URL(endpointText);
  } catch {
    sendJson(response, 400, { error: "Ollama endpoint URL is invalid" });
    return;
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    sendJson(response, 400, { error: "Endpoint must use HTTP or HTTPS" });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (event: Record<string, unknown>) => {
    if (!response.writableEnded) response.write("data: " + JSON.stringify(event) + "\n\n");
  };

  const runtime = new Runtime(store);
  // Heard before it is read, so the trace and anything learned point at it.
  const heard = conversations.receive();
  runtime.trace.said(heard.seq);
  const events: TraceEvent[] = [];
  // Live observation: every step reaches the client as it happens.
  const unlisten = runtime.trace.listen((event) => {
    const at = events.findIndex((e) => e.id === event.id);
    if (at >= 0) events[at] = event;
    else events.push(event);
    send({ type: "trace", event });
  });

  try {
    // What was said earlier, so a back-reference has something to point at.
    const history = conversations
      .turns(conversationId)
      .slice(-6)
      // The parser is shown `spoken`; resolution uses `result`, which is the IR.
      .map((t) => ({ message: t.message, result: t.result, spoken: t.spoken || t.result }));

    const result = await runTurn(runtime, body.text, c("Execution"), {
      model,
      endpoint: endpoint.origin,
      learn: body.learn !== false,
      history,
      ...(body.backend === "model" || body.backend === "rules" || body.backend === "hybrid" ? { backend: body.backend } : {}),
    });
    const reader = { reader: result.heard.backend ?? "model", fallback: result.heard.fallback ?? null };

    if (result.parsed) send({ type: "meaning", expression: result.parsed, ...reader });
    if (result.resolved.length) send({ type: "resolved", resolved: result.resolved });

    const taught = result.learned.filter((l) => l.how === "teacher");
    if (taught.length) {
      send({
        type: "teacher",
        used: true,
        lesson: taught.map((l) => l.detail).join("\n\n"),
        response: taught.map((l) => `${l.identity}: ${l.detail}`).join("\n"),
      });
    }

    conversations.record(conversationId, {
      message: body.text,
      ...(result.expression === undefined ? {} : { parsed: result.expression }),
      result: result.result ?? result.rendered,
      spoken: result.spoken,
      heard,
    });
    if (conversationId.startsWith("Conversation_")) {
      save(store, graphPath);
      appendTrace(tracePath, events);
    }

    const traceId = `t${traces.length + 1}-${Date.now()}`;
    traces.unshift({
      traceId,
      startedAt: new Date().toISOString(),
      concept: result.parsed ?? body.text,
      events: [...events],
    });
    if (traces.length > 200) traces.length = 200;

    send({
      type: "complete",
      traceId,
      // The sentence the user reads; the graph decided the answer, this only says it.
      message: result.spoken,
      result: result.rendered,
      resolved: result.resolved,
      heard: result.heard.raw.trim(),
      ...reader,
      conversation: conversations.listActive().find((x) => x.id === conversationId),
      teacherUsed: taught.length > 0,
      teacherLesson: taught.map((l) => l.detail).join("\n\n") || null,
      teacherResponse: null,
      externalExchanges: result.learned.filter((l) => l.how === "research").length,
      problems: result.heard.problems,
      rejected: result.heard.rejected,
      gaps: result.gaps,
      learned: result.learned,
      ambiguities: result.ambiguities,
      events,
      size: store.size(),
    });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    unlisten();
    if (!response.writableEnded) response.end();
  }
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 2_000_000) throw new Error("Request body exceeds 2 MB");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}


/* ------------------------------------------------------------------ *
 * Ears lab: try a prompt on one message, or run it against the eval cases and the gold.
 * Observes only; nothing here changes the graph or the saved prompt.
 * ------------------------------------------------------------------ */
let earsEvalRunning = false;

const plain = (summary: ReturnType<typeof summarizeEars>) => ({
  ...summary,
  bySource: Object.fromEntries(summary.bySource),
  byCheck: Object.fromEntries(summary.byCheck),
});

/** One case of a run, with what it was scored against: the gold reading, or its checks. */
function caseView(run: EarsRun) {
  const known = new Map(earsCases().map((c) => [c.id, c]));
  return run.cases.map((c) => {
    const passes = c.samples.filter((s) => Object.values(s.checks).every(Boolean)).length;
    const def = known.get(c.id);
    return {
      id: c.id,
      source: c.status === "open" ? "gold open" : c.inPrompt ? "in prompt" : c.source,
      message: c.message,
      rate: c.samples.length ? passes / c.samples.length : 0,
      failed: [...new Set(c.samples.flatMap((s) => Object.entries(s.checks).filter(([, ok]) => !ok).map(([k]) => k)))],
      readings: c.samples.map((s) => s.reading ?? s.raw),
      gold: c.target ?? def?.target ?? null,
      expect: def?.expect ?? null,
    };
  });
}

async function handleEarsLab(path: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (path === "/api/ears/prompt" && request.method === "GET") {
    sendJson(response, 200, { prompt: earsPrompt(store) });
    return;
  }

  if (path === "/api/ears/runs" && request.method === "GET") {
    const runs = listEarsRuns().map(({ file, run }) => {
      const scored = openEarsRun(file) ?? run;
      const s = summarizeEars(scored);
      return {
        file, label: run.label, date: run.date, promptHash: run.promptHash, promptChars: run.promptChars, unfused: run.unfused === true,
        cases: run.cases.length, samples: run.samples,
        headline: s.headline, retained: s.retained, order: s.order, match: s.match, copyRate: s.copyRate, ruled: s.ruled,
      };
    });
    sendJson(response, 200, { runs });
    return;
  }

  if (path.startsWith("/api/ears/runs/") && request.method === "GET") {
    const unfused = new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get("unfused");
    const run = openEarsRun(decodeURIComponent(path.slice("/api/ears/runs/".length)), unfused === null ? undefined : unfused === "1");
    if (!run) {
      sendJson(response, 404, { error: "Run not found" });
      return;
    }
    sendJson(response, 200, { label: run.label, date: run.date, prompt: run.prompt, unfused: run.unfused === true, summary: plain(summarizeEars(run)), cases: caseView(run) });
    return;
  }

  if (path === "/api/ears/conversions" && request.method === "GET") {
    sendJson(response, 200, { conversions: recentEarsConversions() });
    return;
  }

  if (path === "/api/ears/convert" && request.method === "POST") {
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
      sendJson(response, 400, { error: "A non-empty message is required" });
      return;
    }
    const system = typeof body.system === "string" && body.system.trim() ? body.system : undefined;
    const started = Date.now();
    // The lab always says who reads, so a change to the chat's default never changes the lab.
    const backend = body.backend === "rules" || body.backend === "hybrid" ? body.backend : "model";
    const heard = await hear(store, body.message, {
      ...(system ? { system } : {}),
      backend,
      ...(typeof body.model === "string" ? { model: body.model } : {}),
    });
    const before = lift(heard.raw).expression;
    logEarsConversion({
      date: new Date().toISOString(),
      promptHash: hashEarsPrompt(system ?? earsPrompt(store)),
      message: body.message,
      raw: heard.raw,
      reading: heard.expression === undefined ? null : format(heard.expression),
    });
    sendJson(response, 200, {
      raw: heard.raw,
      lifted: before === undefined ? null : format(before),
      reading: heard.expression === undefined ? null : format(heard.expression),
      problems: heard.problems,
      rejected: heard.rejected,
      backend: heard.backend ?? "model",
      fallback: heard.fallback ?? null,
      ms: Date.now() - started,
    });
    return;
  }

  if (path === "/api/ears/eval" && request.method === "POST") {
    if (earsEvalRunning) {
      sendJson(response, 409, { error: "An eval is already running; the model runs one call at a time." });
      return;
    }
    const body = await readJson(request);
    const options = isRecord(body) ? body : {};
    const system = typeof options.system === "string" && options.system.trim() ? options.system : undefined;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: Record<string, unknown>) => {
      if (!response.writableEnded) response.write("data: " + JSON.stringify(event) + "\n\n");
    };
    earsEvalRunning = true;
    const backend = options.backend === "rules" || options.backend === "hybrid" ? options.backend : "model";
    try {
      const run = await runEars({
        label: backend === "model" ? "lab" : `lab-${backend}`,
        ...(system ? { system } : {}),
        samples: typeof options.samples === "number" ? Math.max(1, Math.min(5, options.samples)) : 1,
        ...(typeof options.only === "string" && options.only ? { only: options.only } : {}),
        questions: options.questions === true,
        ...(options.unfused === true ? { unfused: true } : {}),
        backend,
        onCase: (result, done, total) =>
          send({
            type: "case",
            done,
            total,
            id: result.id,
            rate: result.samples.filter((s) => Object.values(s.checks).every(Boolean)).length / result.samples.length,
            reading: result.samples[0]?.reading ?? result.samples[0]?.raw ?? "",
          }),
      });
      const file = saveEarsRun(run);
      const previous = latestEarsRun((label) => !label.startsWith("lab") && !label.includes("rescored"));
      const baseline: EarsRun | undefined = previous ? rescoreEars(previous, options.unfused === true) : undefined;
      const diff = baseline ? compareEars(baseline, run) : undefined;
      send({
        type: "done",
        file: file.split("/").slice(-1)[0],
        summary: plain(summarizeEars(run)),
        baseline: baseline && diff ? { label: previous!.label, shared: diff.shared, before: plain(diff.before), after: plain(diff.after) } : null,
        cases: caseView(run),
      });
    } catch (error) {
      send({ type: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      earsEvalRunning = false;
      response.end();
    }
    return;
  }

  sendJson(response, 404, { error: "Unknown Ears lab endpoint" });
}
