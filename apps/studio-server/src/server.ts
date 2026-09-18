import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  application,
  formatExpression,
  namedArgument,
  parseExpression,
  type Expr,
} from "@cnocept/concept-runtime/expression";
import {
  ConceptEvaluator,
  ConversationRepository,
  seedCoreConcepts,
  SQLiteConceptStore,
  type TraceEvent,
} from "@cnocept/concept-runtime";

const databasePath = resolve(
  process.env.CNOCEPT_DB ?? resolve(homedir(), ".cnocept/concepts.sqlite"),
);
const port = Number(process.env.CNOCEPT_PORT ?? 4173);
const clientBuildPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../studio-client/dist",
);
await mkdir(dirname(databasePath), { recursive: true });
const store = new SQLiteConceptStore(new DatabaseSync(databasePath));
seedCoreConcepts(store);
const conversations = new ConversationRepository(store);
const evaluator = new ConceptEvaluator(store);
const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("Cnocept Studio running at http://127.0.0.1:" + port);
  console.log("Concept store: " + databasePath);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/concepts") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const concepts = query
      ? store.searchConcepts(query, limit)
      : store.listConcepts().slice(0, Math.max(1, Math.min(500, limit)));
    sendJson(response, 200, {
      concepts: concepts.map((concept) => ({
        ...concept,
        usage: store.getConceptUsage(concept.identity),
      })),
      total: concepts.length,
    });
    return;
  }
  if (path.startsWith("/api/concepts/") && request.method === "GET") {
    const identity = decodeURIComponent(path.slice("/api/concepts/".length));
    const concept = store.getConcept(identity);
    if (!concept)
      return sendJson(response, 404, { error: "Concept not found" });
    sendJson(response, 200, {
      concept,
      usage: store.getConceptUsage(identity),
    });
    return;
  }
  if (path.startsWith("/api/concepts/") && request.method === "PUT") {
    const identity = decodeURIComponent(path.slice("/api/concepts/".length));
    const body = await readJson(request);
    if (!isRecord(body) || body.identity !== identity) {
      return sendJson(response, 400, {
        error: "Concept identity does not match its URL",
      });
    }
    const concept = store.saveConcept(body as never);
    sendJson(response, 200, { concept });
    return;
  }
  if (request.method === "GET" && path === "/api/conversations") {
    sendJson(response, 200, { conversations: conversations.listActive() });
    return;
  }
  if (request.method === "POST" && path === "/api/conversations") {
    const body = await readJson(request);
    const persistent = !isRecord(body) || body.persistent !== false;
    sendJson(response, 201, { conversation: conversations.create(persistent) });
    return;
  }
  if (path.startsWith("/api/conversations/") && request.method === "GET") {
    const id = decodeURIComponent(path.slice("/api/conversations/".length));
    const unit = conversations.get(id);
    if (!unit)
      return sendJson(response, 404, { error: "Conversation not found" });
    sendJson(response, 200, {
      summary: conversations
        .listActive()
        .find((conversation) => conversation.id === id),
      unit,
    });
    return;
  }
  if (path.startsWith("/api/conversations/") && request.method === "DELETE") {
    const id = decodeURIComponent(path.slice("/api/conversations/".length));
    if (!id.startsWith("IsolatedConversation_")) {
      return sendJson(response, 400, {
        error: "Only isolated conversations can be closed this way",
      });
    }
    const closed = conversations.closeIsolated(id);
    return sendJson(response, closed ? 200 : 404, { closed });
  }
  if (request.method === "GET" && path === "/api/traces") {
    sendJson(response, 200, { traces: store.listTraces(200) });
    return;
  }
  if (path.startsWith("/api/traces/") && request.method === "GET") {
    const traceId = decodeURIComponent(path.slice("/api/traces/".length));
    sendJson(response, 200, { traceId, events: store.getTraceEvents(traceId) });
    return;
  }
  if (request.method === "POST" && path === "/api/chat/turn") {
    await runChatTurn(request, response);
    return;
  }
  if (request.method === "GET" && !path.startsWith("/api/")) {
    await serveClientFile(path, response);
    return;
  }
  sendJson(response, 404, { error: "Not found" });
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

async function runChatTurn(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readJson(request);
  if (
    !isRecord(body) ||
    typeof body.conversationId !== "string" ||
    typeof body.text !== "string" ||
    body.text.trim().length === 0
  ) {
    return sendJson(response, 400, {
      error: "A conversationId and non-empty text are required",
    });
  }
  const conversationId = body.conversationId;
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return sendJson(response, 404, { error: "Conversation not found" });
  }
  const text = body.text;
  const model = typeof body.model === "string" ? body.model : "qwen3.5:4b";
  const endpoint =
    typeof body.endpoint === "string"
      ? body.endpoint.replace(/\/$/, "")
      : "http://127.0.0.1:11434";
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return sendJson(response, 400, { error: "Ollama endpoint URL is invalid" });
  }
  if (
    parsedEndpoint.protocol !== "http:" &&
    parsedEndpoint.protocol !== "https:"
  ) {
    return sendJson(response, 400, {
      error: "Endpoint must use HTTP or HTTPS",
    });
  }

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const turnEvents: TraceEvent[] = [];
  const eventsById = new Map<string, TraceEvent>();
  const teacherRoots = new Set<string>();
  let teacherUsed = false;
  let teacherLesson: Expr | null = null;
  let teacherResponse: Expr | null = null;
  const send = (event: Record<string, unknown>) => {
    if (!response.writableEnded)
      response.write("data: " + JSON.stringify(event) + "\n\n");
  };
  const onTrace = (event: TraceEvent) => {
    turnEvents.push(event);
    eventsById.set(event.id, event);
    if (event.concept === "AskTeacher") {
      teacherUsed = true;
      teacherRoots.add(event.id);
      send({ type: "teacher", used: true, status: event.outcome });
      if (event.outcome !== "running" && event.output !== null) {
        teacherResponse = event.output;
        send({
          type: "teacher",
          used: true,
          status: event.outcome,
          response: formatExpression(event.output),
        });
      }
    }
    let parent = event.parentEventId;
    let insideTeacher = false;
    while (parent) {
      if (teacherRoots.has(parent)) {
        insideTeacher = true;
        break;
      }
      parent = eventsById.get(parent)?.parentEventId ?? null;
    }
    if (
      insideTeacher &&
      event.outcome === "success" &&
      (event.concept === "Concept" || event.concept === "SaveConcept")
    ) {
      teacherLesson = event.input;
      send({
        type: "teacher",
        used: true,
        status: "learned",
        lesson: formatExpression(event.input),
      });
    }
  };
  const input = application("PromptInput", [
    { name: "input", value: text },
    { name: "model", value: model },
    { name: "endpoint", value: endpoint },
  ]);

  try {
    const interpreted = await evaluator.evaluate({
      input,
      useContext: parseExpression("NaturalLanguage()"),
      caller: "ChatInterface",
      persistTrace: false,
      onTrace,
    });
    const meaning = findPromptMeaning(turnEvents);
    if (meaning)
      send({ type: "meaning", expression: formatExpression(meaning) });
    const parseFailed = turnEvents.some(
      (event) => event.parentEventId === null && event.outcome === "failure",
    );
    let assistantText: string;
    if (parseFailed) {
      assistantText =
        "I could not complete that request. The Concept evaluation returned: " +
        formatExpression(interpreted.value);
    } else {
      const outputEvents: TraceEvent[] = [];
      const rendered = await evaluator.evaluate({
        input: application("NaturalLanguageOutput", [
          { name: "result", value: interpreted.value },
          { name: "source", value: text },
          { name: "model", value: model },
          { name: "endpoint", value: endpoint },
        ]),
        useContext: parseExpression("NaturalLanguage()"),
        caller: "ChatInterface",
        persistTrace: false,
        onTrace: (event) => {
          outputEvents.push(event);
          onTrace(event);
        },
      });
      assistantText =
        typeof rendered.value === "string"
          ? rendered.value
          : formatExpression(rendered.value);
      if (outputEvents.some((event) => event.outcome === "failure")) {
        assistantText =
          "I completed the Concept evaluation, but the response renderer failed. Result: " +
          formatExpression(interpreted.value);
      }
    }
    const summary = conversations.appendTurn(conversationId, {
      userText: text,
      assistantText,
      promptMeaning: meaning ?? null,
      result: interpreted.value,
      traceIds: [],
      teacherUsed,
      teacherLesson,
      teacherResponse,
    });
    send({
      type: "complete",
      message: assistantText,
      result: formatExpression(interpreted.value),
      meaning: meaning ? formatExpression(meaning) : null,
      teacherUsed,
      teacherLesson: teacherLesson ? formatExpression(teacherLesson) : null,
      teacherResponse: teacherResponse
        ? formatExpression(teacherResponse)
        : null,
      conversation: summary,
    });
  } catch (error) {
    send({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    response.end();
  }
}

function findPromptMeaning(events: TraceEvent[]): Expr | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.concept !== "Prompt") continue;
    const meaning =
      namedArgument(event.input, "meaning") ??
      namedArgument(event.output, "meaning");
    if (meaning !== undefined) return meaning;
  }
  return undefined;
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
