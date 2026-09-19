/**
 * The studio: browse the Concept graph, and watch a turn happen.
 *
 * The interface is not a Concept and is not required to be (concept-spec Part 17.2). It
 * observes and presents; it does not decide behaviour.
 */
import { createServer } from "node:http";
import {
  c,
  ConceptStore,
  format,
  load,
  parse,
  Relations,
  Runtime,
  save,
  seed,
  turn,
  modelAvailable,
} from "@cnocept/concept-runtime";
import { page } from "./page.js";

const PORT = Number(process.env.PORT ?? 4317);
const GRAPH = process.env.CNOCEPT_GRAPH ?? `${process.env.HOME}/.cnocept/graph.json`;

const store = new ConceptStore();
seed(store);
const loaded = load(store, GRAPH);
const relations = new Relations(store);

const json = (res: import("node:http").ServerResponse, body: unknown, status = 200) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
};

const readBody = (req: import("node:http").IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page());
      return;
    }

    if (url.pathname === "/api/graph") {
      const units = store.all().map((u) => ({
        identity: u.identity,
        relations: u.relations.length,
        realizations: u.realizations.length,
        realizable: u.realizations.length > 0,
      }));
      json(res, { size: store.size(), loaded, graph: GRAPH, units: units.sort((a, b) => a.identity.localeCompare(b.identity)) });
      return;
    }

    if (url.pathname.startsWith("/api/concept/")) {
      const identity = decodeURIComponent(url.pathname.slice("/api/concept/".length));
      const unit = store.get(identity);
      if (!unit) {
        json(res, { identity, known: false, cluster: relations.cluster(identity) }, 404);
        return;
      }
      json(res, {
        identity,
        known: true,
        stored: unit.relations.map(format),
        // Derived, not stored: a symmetric relation is findable from the end that does
        // not hold it.
        derived: relations.of(identity).map((t) => format(t.expr)),
        cluster: relations.cluster(identity),
        realizations: unit.realizations.map((r) => ({
          pattern: format(r.pattern),
          context: r.context ? format(r.context) : "any",
          body: format(r.body),
          properties: r.properties.map(format),
          retired: r.retired ?? false,
        })),
      });
      return;
    }

    if (url.pathname === "/api/ask" && req.method === "POST") {
      const { message, learn } = JSON.parse((await readBody(req)) || "{}") as {
        message?: string;
        learn?: boolean;
      };
      if (!message) return json(res, { error: "no message" }, 400);
      if (!(await modelAvailable())) return json(res, { error: "no local model at 127.0.0.1:11434" }, 503);

      const runtime = new Runtime(store);
      const result = await turn(runtime, message, c("Execution"), { learn: Boolean(learn) });
      if (result.learned.length) save(store, GRAPH);
      json(res, {
        message,
        heard: result.heard.raw.trim(),
        parsed: result.parsed,
        result: result.rendered,
        problems: result.heard.problems,
        rejected: result.heard.rejected,
        gaps: result.gaps,
        learned: result.learned,
        ambiguities: result.ambiguities,
        trace: runtime.trace.all(),
        size: store.size(),
      });
      return;
    }

    if (url.pathname === "/api/realize" && req.method === "POST") {
      const { expression, context } = JSON.parse((await readBody(req)) || "{}") as {
        expression?: string;
        context?: string;
      };
      if (!expression) return json(res, { error: "no expression" }, 400);
      const runtime = new Runtime(store);
      const parsed = parse(expression);
      const out = await runtime.evaluate(parsed, context ? parse(context) : c("Execution"));
      json(res, { parsed: format(parsed), result: format(out), trace: runtime.trace.all() });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (caught) {
    json(res, { error: caught instanceof Error ? caught.message : String(caught) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`cnocept studio  http://localhost:${PORT}`);
  console.log(`graph ${GRAPH} — ${store.size()} Concepts (${loaded} loaded)`);
});
