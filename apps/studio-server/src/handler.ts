/**
 * Napkin Studio's API, as one Fetch handler: a `Request` in, a `Response` out.
 *
 * The Node server (`server.ts`) serves it over HTTP beside the built client; a browser host
 * runs it in a Worker over OPFS (`studio-client/src/napkin.worker.ts`). Both open the same
 * graph code on their own files, so the studio behaves the same wherever it runs.
 *
 * The interface is not a Concept and is not required to be (concept-spec Part 17.2): it
 * observes and presents, it does not decide behaviour.
 */
import {
  appendTrace,
  c,
  ConceptStore,
  ConversationRepository,
  evidenceStoreFor,
  format,
  parse,
  Relations,
  Runtime,
  openNapkinGraph,
  type ConceptUnit,
  type TraceEvent,
  turn as runTurn,
} from "@napkin/concept-runtime";
import { concept, realization } from "@napkin/concept-runtime";
import { codeLanguages, formatNcon, importSource, writeSource } from "@napkin/concept-runtime";

export interface StudioOptions {
  /** The journal (`store.ncon`), or an old `.json` snapshot. */
  graphPath: string;
  /** The trace beside it (concept-spec Part 13). */
  tracePath: string;
}

export interface Studio {
  handle(request: Request): Promise<Response>;
  store: ConceptStore;
  /** What the graph was opened with, for the host to report. */
  opened: Awaited<ReturnType<typeof openNapkinGraph>>;
  save(): void;
}

export async function createStudio(options: StudioOptions): Promise<Studio> {
  const { graphPath, tracePath } = options;
  const store = new ConceptStore();
  // The built-in packs, a user's own beside the graph (packs/*.ncon), then the journal.
  const opened = await openNapkinGraph(store, graphPath);
  /** Every change is already appended to the journal; a JSON graph is written whole. */
  const save = () => opened.save();
  const relations = new Relations(store);
  const conversations = new ConversationRepository(store);

  /** Every trace of every turn this host has served, newest first. */
  const traces: { traceId: string; startedAt: string; concept: string; events: TraceEvent[] }[] = [];

  async function handle(request: Request): Promise<Response> {
    try {
      return await route(request);
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = url.pathname;
    const method = request.method;

    if (method === "GET" && path === "/api/concepts") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? "100")));
      const units = query ? store.search(query, limit) : store.all().slice(0, limit);
      return json(200, {
        concepts: units.map(describeUnit),
        total: units.length,
        graph: { size: store.size(), path: graphPath },
      });
    }

    if (path.startsWith("/api/concepts/") && method === "GET") {
      const identity = decodeURIComponent(path.slice("/api/concepts/".length));
      const unit = store.get(identity);
      if (!unit) return json(404, { error: "Concept not found", cluster: relations.cluster(identity) });
      return json(200, { concept: describeUnit(unit), usage: usageOf(identity) });
    }

    // Editing a realization by hand is the whole point of a Concept browser.
    if (path.startsWith("/api/concepts/") && method === "PUT") {
      const identity = decodeURIComponent(path.slice("/api/concepts/".length));
      const body = await readJson(request);
      if (!isRecord(body) || body.identity !== identity) return json(400, { error: "Concept identity does not match its URL" });
      try {
        const saved = saveEdited(identity, body);
        save();
        return json(200, { concept: saved });
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (method === "GET" && path === "/api/conversations") {
      return json(200, { conversations: conversations.listActive() });
    }

    if (method === "POST" && path === "/api/conversations") {
      const body = await readJson(request);
      const persistent = !isRecord(body) || body.persistent !== false;
      const created = conversations.create(persistent);
      if (persistent) save();
      return json(201, { conversation: created });
    }

    if (path.startsWith("/api/conversations/") && method === "GET") {
      const id = decodeURIComponent(path.slice("/api/conversations/".length));
      const unit = conversations.get(id);
      if (!unit) return json(404, { error: "Conversation not found" });
      return json(200, { summary: conversations.listActive().find((x) => x.id === id), unit });
    }

    if (path.startsWith("/api/conversations/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/conversations/".length));
      if (!id.startsWith("IsolatedConversation_")) return json(400, { error: "Only isolated conversations can be closed this way" });
      const closed = conversations.closeIsolated(id);
      return json(closed ? 200 : 404, { closed });
    }

    if (method === "GET" && path === "/api/traces") {
      return json(200, {
        traces: traces.map((t) => ({ traceId: t.traceId, startedAt: t.startedAt, concept: t.concept, events: t.events.length })),
      });
    }

    if (path.startsWith("/api/traces/") && method === "GET") {
      const traceId = decodeURIComponent(path.slice("/api/traces/".length));
      const found = traces.find((t) => t.traceId === traceId);
      return json(200, { traceId, events: found?.events ?? [] });
    }

    if (method === "GET" && path === "/api/agenda") {
      return json(200, { graph: store.size(), path: graphPath });
    }

    // What this host offers, so the client shows only what works here.

    if (method === "POST" && path === "/api/chat/turn") return runChatTurn(request);


    if (path.startsWith("/api/code/")) return handleCode(path, request);

    return json(404, { error: "Not found" });
  }

  const describeUnit = (unit: ConceptUnit) => ({
    identity: unit.identity,
    // A relation says where it holds, when it holds somewhere in particular.
    relations: unit.relations.map((r) => (r.context === undefined ? format(r.claim) : `${format(r.claim)}  in ${format(r.context)}`)),
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
          properties: Array.isArray(r.properties) ? r.properties.filter((p): p is string => typeof p === "string").map(parse) : [],
        }),
      );
    }
    return describeUnit(store.get(identity)!);
  }

  async function runChatTurn(request: Request): Promise<Response> {
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.conversationId !== "string" || typeof body.text !== "string" || !body.text.trim()) {
      return json(400, { error: "A conversationId and non-empty text are required" });
    }
    const conversationId = body.conversationId;
    const text = body.text;
    if (body.inputMode !== undefined && body.inputMode !== "message" && body.inputMode !== "expression") {
      return json(400, { error: "inputMode must be message or expression" });
    }
    if (!conversations.get(conversationId)) return json(404, { error: "Conversation not found" });

    return stream(async (send) => {
      // NAPKIN_TRACE_QUIET=1 traces what quiet facets keep out (hearing's rounds), to debug them.
      const runtime = new Runtime(store, { tracePath, traceQuiet: process.env.NAPKIN_TRACE_QUIET === "1" });
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

        const result = await runTurn(runtime, text, c("Execution"), {
          learn: body.learn !== false,
          inputMode: body.inputMode === "expression" ? "expression" : "message",
          history,
          conversation: conversationId,
        });

        if (result.parsed) send({ type: "meaning", expression: result.parsed });
        if (result.resolved.length) send({ type: "resolved", resolved: result.resolved });

        conversations.record(conversationId, {
          message: text,
          ...(result.expression === undefined ? {} : { parsed: result.expression }),
          result: result.result ?? result.rendered,
          spoken: result.spoken,
          heard,
        });
        if (conversationId.startsWith("Conversation_")) {
          save();
          appendTrace(tracePath, events);
          // Keep the cached evidence in step, rather than re-reading the file.
          evidenceStoreFor(tracePath).append(events);
        }

        const traceId = `t${traces.length + 1}-${Date.now()}`;
        traces.unshift({ traceId, startedAt: new Date().toISOString(), concept: result.parsed ?? text, events: [...events] });
        if (traces.length > 200) traces.length = 200;

        send({
          type: "complete",
          traceId,
          // The sentence the user reads; the graph decided the answer, this only says it.
          message: result.spoken,
          result: result.rendered,
          resolved: result.resolved,
          heard: result.heard.raw.trim(),
          conversation: conversations.listActive().find((x) => x.id === conversationId),
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
      }
    });
  }

  /**
   * The code playground: source in a language read as Concepts by its pack's From rules, and
   * Concepts written as a language by its To rules, so either side can be edited.
   */
  async function handleCode(path: string, request: Request): Promise<Response> {
    const method = request.method;
    if (path === "/api/code/languages" && method === "GET") return json(200, { languages: codeLanguages() });
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.language !== "string") return json(400, { error: "A language is required" });
    const language = body.language;
    if (path === "/api/code/read" && method === "POST") {
      if (typeof body.source !== "string") return json(400, { error: "source is required" });
      try {
        const read = await importSource(body.source, language);
        if (!read) return json(400, { error: `No pack says how to read ${language}` });
        return json(200, { ir: formatNcon(format(read.expression)).trimEnd(), unsupported: read.unsupported });
      } catch (caught) {
        return json(200, { error: caught instanceof Error ? caught.message : String(caught) });
      }
    }
    if (path === "/api/code/write" && method === "POST") {
      if (typeof body.ir !== "string") return json(400, { error: "ir is required" });
      let expression;
      try {
        expression = parse(body.ir);
      } catch (caught) {
        return json(200, { error: `Not a Concept expression: ${caught instanceof Error ? caught.message : String(caught)}` });
      }
      const written = writeSource(expression, language);
      return json(200, { source: written.text, unwritable: written.unwritable });
    }
    return json(404, { error: "Unknown code endpoint" });
  }

  return { handle, store, opened, save };
}

const encoder = new TextEncoder();

/** Server-sent events: `run` sends each as it happens, and the stream ends when it returns. */
function stream(run: (send: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
      try {
        await run(send);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 2_000_000) throw new Error("Request body exceeds 2 MB");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
