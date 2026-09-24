import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { c, format, parse } from "../concept/expression.js";
import { concept, realization } from "../concept/unit.js";
import { formatNcon } from "../code/format.js";
import { seed } from "../seed/seed.js";
import { closeGraph, compact, openGraph } from "./journal.js";
import { load, save } from "./persist.js";
import { ConceptStore } from "./store.js";

const home = () => mkdtempSync(join(tmpdir(), "journal-"));
const packs = (store: ConceptStore) => seed(store).packs;

/** What a store holds that matters: each unit's claims with their stamps, and what it does. */
const view = (store: ConceptStore) =>
  store
    .all()
    .map((u) => ({
      identity: u.identity,
      relations: u.relations.map((r) => `${format(r.claim)}${r.context ? `@${format(r.context)}` : ""} ${(r.stamps ?? []).filter((s) => !s.pack).map((s) => `#${s.seq}<${s.source ?? ""}`).join(",")}`),
      // What selection sees: for each pattern and context, the newest live body, which shadows the rest.
      live: Object.entries(
        Object.fromEntries(u.realizations.filter((r) => !r.retired).map((r) => [`${format(r.pattern).replace(/\$\w+/g, "$")}|${format(r.context ?? null)}`, format(r.body)])),
      )
        .map(([k, v]) => `${k}=${v}`)
        .sort(),
    }))
    .sort((a, b) => a.identity.localeCompare(b.identity));

function changeAGraph(store: ConceptStore): void {
  const user = store.mint("User");
  const heard = store.addRelation(user, parse('Named("Keal")'));
  store.addRelation(user, parse("IsA(Engineer())"), undefined, heard.seq);
  store.addRelation("Game_7", parse("Moved(X(), A1())"), c("Game"));
  store.addRealization("Double", realization({ pattern: "Double($x)", body: parse("Multiply($x, 2)") }));
  store.seed(concept("Wibble", { relations: ["IsA(Thing())"] }));
  const add = store.get("Add")!;
  store.replaceRealizations("Add", add.realizations.map((r, i) => (i === 0 ? { ...r, retired: true } : r)));
  const gone = store.addRelation(user, parse("Likes(Money())"));
  store.collect(new Set([gone.seq]));
}

test("a graph reopened from its journal holds what it held, stamps and all", () => {
  const path = join(home(), "store.ncon");
  const first = new ConceptStore();
  openGraph(first, path, packs);
  changeAGraph(first);
  closeGraph(first, path);

  const again = new ConceptStore();
  const report = openGraph(again, path, packs);
  closeGraph(again, path);
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(view(again), view(first));
  // What was collected is gone from the file, not only undone by a later line.
  assert.ok(!readFileSync(path, "utf8").includes("Likes(Money())"));
});

test("compacting keeps what the graph holds and drops the rest", () => {
  const path = join(home(), "store.ncon");
  const first = new ConceptStore();
  openGraph(first, path, packs);
  changeAGraph(first);
  compact(first, path);
  closeGraph(first, path);
  const again = new ConceptStore();
  openGraph(again, path, packs);
  closeGraph(again, path);
  assert.deepEqual(view(again), view(first));
});

test("a pack's facts keep their stamps across loads, so retracting one holds", () => {
  const a = new ConceptStore();
  const b = new ConceptStore();
  packs(a);
  packs(b);
  const seqOf = (s: ConceptStore) => s.get("Plus")!.relations[0].stamps![0].seq;
  assert.equal(seqOf(a), seqOf(b));
  assert.ok(seqOf(a) < 0, "before anything said");
});

test("a change over a pack that is not loaded is kept, and reported", () => {
  const path = join(home(), "store.ncon");
  writeFileSync(path, 'Journal(version = 1, sequence = 10)\nAssert(Queen(), Likes(Tea()), seq = 5, at = "2026-09-24T00:00:00.000Z", over = Pack("chess"))\n');
  const store = new ConceptStore();
  const report = openGraph(store, path, (s) => seed(s).packs.filter((p) => p !== "chess"));
  closeGraph(store, path);
  assert.deepEqual(report.overMissing, { chess: 1 });
  assert.ok(store.get("Queen")!.relations.some((r) => format(r.claim) === "Likes(Tea())"));
});

test("a torn last line is skipped, and the rest loads", () => {
  const path = join(home(), "store.ncon");
  const first = new ConceptStore();
  openGraph(first, path, packs);
  first.addRelation(first.mint("User"), parse('Named("Keal")'));
  closeGraph(first, path);
  appendFileSync(path, 'Assert(User_1(), Likes(Te');
  const again = new ConceptStore();
  const report = openGraph(again, path, packs);
  closeGraph(again, path);
  assert.equal(report.skipped.length, 1);
  assert.ok(again.get("User_1")!.relations.some((r) => format(r.claim) === 'Named("Keal")'));
});

test("a graph.json beside it is migrated into the journal, and kept", () => {
  const dir = home();
  const old = new ConceptStore();
  packs(old);
  changeAGraph(old);
  save(old, join(dir, "graph.json"));
  const store = new ConceptStore();
  const report = openGraph(store, join(dir, "store.ncon"), packs);
  closeGraph(store, join(dir, "store.ncon"));
  assert.equal(report.migratedFrom, join(dir, "graph.json"));
  assert.ok(existsSync(join(dir, "graph.json.migrated")) && !existsSync(join(dir, "graph.json")));
  const reference = new ConceptStore();
  load(reference, join(dir, "graph.json.migrated"));
  packs(reference);
  assert.deepEqual(view(store), view(reference));
});

test("another process holding the graph opens it to read only", () => {
  const path = join(home(), "store.ncon");
  // The parent of this process is running, and is not this process.
  writeFileSync(`${path}.lock`, String(process.ppid));
  const store = new ConceptStore();
  const report = openGraph(store, path, packs);
  assert.ok(report.readOnly);
  store.mint("User");
  assert.ok(!existsSync(path), "nothing written");
});

test("the formatter leaves a journal as it is written", () => {
  const text = "// a journal\nJournal(version = 1, sequence = 3)\nAssert(User_1(),Named(\"Keal\"),seq=1,at=\"x\")\n";
  assert.equal(formatNcon(text), text);
});
