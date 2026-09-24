import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { ConversationRepository } from "../memory/conversations.js";
import { ConceptStore } from "../store/store.js";
import { appendTrace, readTrace } from "../store/traces.js";
import { Runtime } from "./evaluator.js";
import { EvidenceStore, evidenceStoreFor, resetEvidenceCache } from "./evidence.js";
import { followUpSignal } from "./turn-signal.js";

const withTemp = (fn: (dir: string) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-evidence-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/* ---------------- Phase 0: candidate count and tie-break ---------------- */

test("a uniquely specific selection records one candidate and no tie-break", async () => {
  const store = new ConceptStore();
  store.seed(concept("Solo", { realizations: [realization({ pattern: "Solo()", body: parse("Done()") })] }));
  const runtime = new Runtime(store);
  await runtime.evaluate(parse("Solo()"));
  const event = runtime.trace.all().find((e) => e.concept === "Solo");
  assert.equal(event?.candidateCount, 1);
  assert.equal(event?.tieBroken, false);
});

test("two equally specific realizations record the candidate count and that tie-break decided", async () => {
  const store = new ConceptStore();
  store.seed(
    concept("Duo", {
      realizations: [
        realization({ pattern: "Duo()", body: parse("Old()") }),
        realization({ pattern: "Duo()", body: parse("New()") }),
      ],
    }),
  );
  const runtime = new Runtime(store);
  await runtime.evaluate(parse("Duo()"));
  const event = runtime.trace.all().find((e) => e.concept === "Duo");
  assert.equal(event?.candidateCount, 2);
  assert.equal(event?.tieBroken, true);
});

test("events survive a restart, with candidate count and tie-break intact", () =>
  withTemp(async (dir) => {
    const store = new ConceptStore();
    store.seed(
      concept("Duo", {
        realizations: [
          realization({ pattern: "Duo()", body: parse("Old()") }),
          realization({ pattern: "Duo()", body: parse("New()") }),
        ],
      }),
    );
    const runtime = new Runtime(store);
    await runtime.evaluate(parse("Duo()"));

    const path = join(dir, "trace.jsonl");
    appendTrace(path, runtime.trace.all());

    // A fresh read, as a restarted process would do it.
    const stored = readTrace(path);
    assert.ok(stored.length > 0);
    assert.ok(stored.some((e) => e.concept === "Duo" && e.tieBroken && e.candidateCount === 2));
    assert.ok(stored.every((e) => typeof e.realizationHash === "string" || e.realizationHash === null));

    const restarted = EvidenceStore.fromFile(path);
    assert.equal(restarted.all().length, stored.length);
  }));

/* ---------------- turn-level signals (Phase 0 item 2) ---------------- */

test("a retry, the same request said again, is a negative follow-up signal", () => {
  const store = new ConceptStore();
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const request = parse("Buy(Widget())");
  const first = conversations.receive();
  conversations.record(id, { message: "buy it", parsed: request, heard: first });
  const second = conversations.receive();
  conversations.record(id, { message: "buy it", parsed: request, heard: second });
  assert.equal(followUpSignal(store, first.seq), "negative");
  // The last turn has no following turn yet, so it carries no signal.
  assert.equal(followUpSignal(store, second.seq), "none");
});

test("Not(Ref(...)), rejecting a prior answer by reference, is a negative follow-up signal", () => {
  const store = new ConceptStore();
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const first = conversations.receive();
  conversations.record(id, { message: "the blue one", parsed: parse('Ref("the blue one")'), heard: first });
  const second = conversations.receive();
  conversations.record(id, { message: "no, not that one", parsed: parse('Not(Ref("that one"))'), heard: second });
  assert.equal(followUpSignal(store, first.seq), "negative");
});

test("an ordinary next turn carries no signal", () => {
  const store = new ConceptStore();
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const first = conversations.receive();
  conversations.record(id, { message: "buy a widget", parsed: parse("Buy(Widget())"), heard: first });
  const second = conversations.receive();
  conversations.record(id, { message: "and a gadget", parsed: parse("Buy(Gadget())"), heard: second });
  assert.equal(followUpSignal(store, first.seq), "none");
});

/* ---------------- Phase 1 demo ---------------- */

test("evidence beats recency after retries, blame stays narrow, and back-off carries the preference", () =>
  withTemp(async (dir) => {
    const tracePath = join(dir, "trace.jsonl");
    const store = new ConceptStore();
    // Two equally specific realizations of the same pattern: recency alone would always
    // favour the one added second (concept-spec Part 9.4, "ties fall back to declaration
    // order", here, to whichever tier 3 currently prefers).
    store.seed(
      concept("Order", {
        realizations: [
          realization({ pattern: "Order($x)", body: parse("ShipStandard($x)") }), // A, older
          realization({ pattern: "Order($x)", body: parse("ShipExpress($x)") }), // B, newer
        ],
      }),
    );
    const conversations = new ConversationRepository(store);
    const { id } = conversations.create();
    const request = parse("Order(Widget())");
    const shopping = c("Topic", "shopping");

    const ask = async (context = shopping) => {
      resetEvidenceCache(tracePath);
      const runtime = new Runtime(store, { tracePath });
      const heard = conversations.receive();
      runtime.trace.said(heard.seq);
      const result = await runtime.evaluate(request, context);
      conversations.record(id, { message: "order it", parsed: request, result, heard });
      appendTrace(tracePath, runtime.trace.all());
      evidenceStoreFor(tracePath).append(runtime.trace.all());
      return result;
    };

    // Turn 1: no evidence yet, so recency decides, the newer realization, B.
    assert.equal(format(await ask()), "ShipExpress(Widget())");
    // Turns 2 and 3: the user asks again, a retry, twice, the weak implicit-negative
    // signal (concept-spec Part 9.4), landing on the two turns it followed.
    await ask();
    await ask();

    // Turn 4, same context: B carries two retries against it and A carries none, so A
    // wins even though B is still the more recently declared realization.
    assert.equal(format(await ask()), "ShipStandard(Widget())");

    // Turn 5: a context that shares the trained facet (Topic("shopping")) but adds one the
    // evidence was never recorded under. The exact facet set has no evidence, so back-off
    // drops the extra facet and finds A's advantage under the shared one.
    const related = c("Context", shopping, c("Mode", "urgent"));
    assert.equal(format(await ask(related)), "ShipStandard(Widget())");
  }));

test("uniquely specific selections record no blame, even after a retry", () =>
  withTemp(async (dir) => {
    const tracePath = join(dir, "trace.jsonl");
    const store = new ConceptStore();
    store.seed(concept("Ping", { realizations: [realization({ pattern: "Ping()", body: parse("Pong()") })] }));
    const conversations = new ConversationRepository(store);
    const { id } = conversations.create();
    const request = parse("Ping()");

    for (let i = 0; i < 2; i += 1) {
      resetEvidenceCache(tracePath);
      const runtime = new Runtime(store, { tracePath });
      const heard = conversations.receive();
      runtime.trace.said(heard.seq);
      const result = await runtime.evaluate(request);
      conversations.record(id, { message: "ping", parsed: request, result, heard });
      appendTrace(tracePath, runtime.trace.all());
      evidenceStoreFor(tracePath).append(runtime.trace.all());
    }

    // The second "ping" is a retry of the first, but Ping() has only one realization: no
    // tie-break happened, so there is nothing to blame it for.
    const stored = readTrace(tracePath);
    const pings = stored.filter((e) => e.concept === "Ping");
    assert.ok(pings.length > 0);
    assert.ok(pings.every((e) => !e.tieBroken));

    resetEvidenceCache(tracePath);
    const fresh = EvidenceStore.fromFile(tracePath);
    assert.equal(fresh.score(pings[0].realizationHash!, [], store), undefined);
  }));
