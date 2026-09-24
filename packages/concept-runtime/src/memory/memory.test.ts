import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c, format, parse } from "../concept/expression.js";
import { concept } from "../concept/unit.js";
import { Runtime } from "../runtime/evaluator.js";
import { appendTrace, readTrace } from "../store/traces.js";
import { load, save } from "../store/persist.js";
import { ConceptStore } from "../store/store.js";
import { ConversationRepository } from "./conversations.js";

const withTemp = (fn: (dir: string) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-memory-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const relationsOf = (store: ConceptStore, identity: string) => store.get(identity)?.relations ?? [];

test("every relation the store takes in is stamped, and seq never repeats", () => {
  const store = new ConceptStore();
  store.seed(concept("Greg", { relations: ["IsA(Person())"] }));
  store.addRelation("Greg", parse("CoworkerOf(Me())"));
  const seqs = relationsOf(store, "Greg").flatMap((r) => r.stamps?.map((s) => s.seq) ?? []);
  assert.equal(seqs.length, 2);
  assert.equal(new Set(seqs).size, 2);
  assert.ok(seqs[1] > seqs[0]);
});

test("asserting a held claim again adds a stamp, not a second relation", () => {
  const store = new ConceptStore();
  const first = store.addRelation("Game_7", parse("Moved(White(), Knight(), F3())"));
  const again = store.addRelation("Game_7", parse("Moved(White(), Knight(), F3())"), undefined, first.seq);
  const held = relationsOf(store, "Game_7");
  assert.equal(held.length, 1);
  assert.deepEqual(held[0].stamps?.map((s) => s.seq), [first.seq, again.seq]);
  assert.equal(held[0].stamps?.[1].source, first.seq);
});

test("seeding again is not asserting again", () => {
  const store = new ConceptStore();
  store.seed(concept("Chess", { relations: ["IsA(Sport())"] }));
  store.seed(concept("Chess", { relations: ["IsA(Sport())"] }));
  assert.equal(relationsOf(store, "Chess")[0].stamps?.length, 1);
});

test("stamps and the sequence survive a restart", () =>
  withTemp((dir) => {
    const path = join(dir, "graph.json");
    const before = new ConceptStore();
    const s = before.addRelation("Greg", parse("CoworkerOf(Me())"));
    before.addRelation("Greg", parse("CoworkerOf(Me())"), undefined, s.seq);
    const next = before.sequence;
    save(before, path);

    const after = new ConceptStore();
    load(after, path);
    assert.deepEqual(relationsOf(after, "Greg")[0].stamps, relationsOf(before, "Greg")[0].stamps);
    assert.ok(after.sequence >= next);
    assert.ok(after.addRelation("Greg", parse("Likes(Cats())")).seq >= next);
  }));

test("a graph written before stamps loads, and every relation in it gets one", () =>
  withTemp((dir) => {
    const path = join(dir, "graph.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        savedAt: "2026-09-01T00:00:00.000Z",
        units: [{ identity: "Chess", relations: ["IsA(Sport())"], realizations: [] }],
      }),
    );
    const store = new ConceptStore();
    load(store, path);
    assert.equal(relationsOf(store, "Chess")[0].stamps?.length, 1);
  }));

test("a turn is recorded as Said, with the reply sourced from the message", () => {
  const store = new ConceptStore();
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  const heard = conversations.receive();
  const { said, reply } = conversations.record(id, {
    message: "a blorp is a small dog",
    parsed: parse("Mood(Declarative(), Blorp(IsA(Small(Dog()))))"),
    result: parse("Mood(Declarative(), Blorp(IsA(Small(Dog()))))"),
    spoken: "Noted.",
    heard,
  });
  assert.equal(said.seq, heard.seq);
  assert.equal(reply.source, said.seq);

  const claims = relationsOf(store, id).map((r) => format(r.claim));
  assert.ok(
    claims.includes('Said(Me(), Mood(Declarative(), Blorp(IsA(Small(Dog())))), text="a blorp is a small dog")'),
    claims.join("\n"),
  );
  const [turn] = conversations.turns(id);
  assert.equal(turn.message, "a blorp is a small dog");
  assert.equal(turn.parsed, "Mood(Declarative(), Blorp(IsA(Small(Dog()))))");
  assert.equal(turn.spoken, "Noted.");
});

test("the same words said twice are one Said with two stamps, and both turns survive", () => {
  const store = new ConceptStore();
  const conversations = new ConversationRepository(store);
  const { id } = conversations.create();
  conversations.record(id, { message: "hi", parsed: parse("Hi()"), result: parse("Hello()"), spoken: "Hello!" });
  conversations.record(id, { message: "what is 2 plus 2", parsed: parse("What(Plus(2, 2))"), result: 4, spoken: "4" });
  conversations.record(id, { message: "hi", parsed: parse("Hi()"), result: parse("Hello()"), spoken: "Hello again!" });

  const said = relationsOf(store, id).filter((r) => format(r.claim).startsWith("Said(Me(), Hi()"));
  assert.equal(said.length, 1);
  assert.equal(said[0].stamps?.length, 2);
  assert.deepEqual(
    conversations.turns(id).map((t) => [t.message, t.spoken]),
    [
      ["hi", "Hello!"],
      ["what is 2 plus 2", "4"],
      ["hi", "Hello again!"],
    ],
  );
});

test("conversations written as HasTurn still read back", () => {
  const store = new ConceptStore();
  store.seed(
    concept("Conversation_old", {
      relations: [
        'HasTurn(at="2026-09-20T00:00:00.000Z", message="hi", parsed="Hi()", result="Hello()", spoken="Hello!")',
      ],
    }),
  );
  const conversations = new ConversationRepository(store);
  conversations.record("Conversation_old", { message: "bye", parsed: parse("Bye()"), result: parse("Bye()"), spoken: "Bye!" });
  assert.deepEqual(
    conversations.turns("Conversation_old").map((t) => t.message),
    ["hi", "bye"],
  );
});

test("a turn's Said, what it taught, and its trace form one source chain", () =>
  withTemp(async (dir) => {
    const store = new ConceptStore();
    const conversations = new ConversationRepository(store);
    const { id } = conversations.create();
    const runtime = new Runtime(store);
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);

    // What the turn caused: something learned while answering it.
    store.addRelation("Blorp", parse("IsA(Dog())"), undefined, runtime.trace.cause);
    await runtime.evaluate(c("Blorp"));
    conversations.record(id, { message: "a blorp is a dog", parsed: parse("Blorp(IsA(Dog()))"), heard });

    const learned = relationsOf(store, "Blorp")[0].stamps![0];
    const cause = store.findStamp(learned.source!);
    assert.equal(cause?.identity, id);
    assert.equal(format(cause!.relation.claim).startsWith("Said(Me(), Blorp(IsA(Dog()))"), true);

    const path = join(dir, "trace.jsonl");
    appendTrace(path, runtime.trace.all());
    const stored = readTrace(path);
    assert.ok(stored.length > 0);
    assert.ok(stored.every((e) => e.saidSeq === heard.seq));
  }));
