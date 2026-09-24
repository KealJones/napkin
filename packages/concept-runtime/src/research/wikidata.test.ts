import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { groundInWikidata, wikidataItem } from "./wikidata.js";

/** Q1049294 as the API returns it, cut to what grounding reads. */
const snak = (id: string, rank = "normal") => ({ mainsnak: { datavalue: { value: { id } } }, rank });
const LABELS: Record<string, string> = {
  Q2001982: "notation", Q138619: "ideogram", Q29654788: "Unicode character", Q31963: "emoticon", Q24839054: "sticker",
};
const fake = async (url: string): Promise<unknown> => {
  const q = new URL(url).searchParams;
  if (q.get("action") === "wbsearchentities") {
    return { search: [{ id: "Q1049294", label: "emoji" }, { id: "Q138800472", label: "Emoji", description: "2026 single" }] };
  }
  const ids = (q.get("ids") ?? "").split("|");
  if (q.get("props") === "claims") {
    return { entities: { Q1049294: { id: "Q1049294", lastrevid: 2547880086, claims: {
      P31: [snak("Q2001982")], P279: [snak("Q138619"), snak("Q29654788")], P1889: [snak("Q31963"), snak("Q24839054", "deprecated")],
    } } } };
  }
  return { entities: Object.fromEntries(ids.map((id) => [id, { id, labels: { en: { value: LABELS[id] } } }])) };
};

const holds = (store: ConceptStore, id: string) => (store.get(id)?.relations ?? []).map((r) => format(r.claim));

test("a word is tied to its Wikidata item, and takes its classifying relations sourced from one import", async () => {
  const store = new ConceptStore();
  seed(store);
  const grounded = await groundInWikidata(store, "Emoji", { fetch: fake });
  assert.equal(grounded?.item, "Q1049294", "the everyday sense, not the single");
  assert.deepEqual(holds(store, "Emoji").filter((r) => !r.startsWith("SameAs")), [
    "InstanceOf(Notation())", "IsA(Ideogram())", "IsA(UnicodeCharacter())", "DistinctFrom(Emoticon())",
  ], "instance of and subclass of kept apart, and a deprecated claim skipped");
  assert.equal(wikidataItem(store, "Emoji"), "Q1049294");
  assert.equal(wikidataItem(store, "Emoticon"), "Q31963", "each target is tied to its own item");
  const isA = store.get("Emoji")!.relations.find((r) => format(r.claim) === "IsA(Ideogram())")!;
  assert.equal(store.findStamp(isA.stamps![0].source!)?.identity, "Wikidata");
});

test("a grounded kind answers as one: subclass chains, membership takes one step", async () => {
  const store = new ConceptStore();
  seed(store);
  await groundInWikidata(store, "Emoji", { fetch: fake });
  store.addRelation("Ideogram", c("IsA", c("Symbol")));
  const ask = async (text: string) => (await (await import("../runtime/turn.js")).turn(new Runtime(store), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered;
  assert.equal(await ask("is an emoji a symbol?"), "Answer(True())");
  assert.equal(await ask("is an emoji a notation?"), "Answer(True())");
  assert.equal(await ask("is an emoji an emoticon?"), "Answer(False())", "Wikidata says different from");
  assert.equal(await ask("is an emoticon an emoji?"), "Answer(False())", "and that holds both ways");
});

test("a personal individual is never looked up", async () => {
  const store = new ConceptStore();
  let asked = false;
  assert.equal(await groundInWikidata(store, "Greg_1", { fetch: async () => { asked = true; return {}; } }), undefined);
  assert.equal(asked, false);
});
