import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { groundInWikidata, wikidataItem } from "./wikidata.js";

/** Q1049294 as the API returns it, cut to what grounding reads, beside a single of the same name. */
const snak = (id: string, rank = "normal") => ({ mainsnak: { datavalue: { value: { id } } }, rank });
const LABELS: Record<string, string> = {
  Q2001982: "notation", Q138619: "ideogram", Q29654788: "Unicode character", Q31963: "emoticon", Q24839054: "sticker", Q134556: "single",
};
const ENTITIES: Record<string, object> = {
  Q1049294: {
    id: "Q1049294", lastrevid: 2547880086, descriptions: { en: { value: "pictogram used in electronic messages" } }, sitelinks: { enwiki: {}, dewiki: {} },
    claims: { P31: [snak("Q2001982")], P279: [snak("Q138619"), snak("Q29654788")], P1889: [snak("Q31963"), snak("Q24839054", "deprecated")] },
  },
  Q138800472: { id: "Q138800472", lastrevid: 1, descriptions: { en: { value: "2026 single" } }, sitelinks: {}, claims: { P31: [snak("Q134556")] } },
};
const fake = async (url: string): Promise<unknown> => {
  const q = new URL(url).searchParams;
  if (q.get("action") === "wbsearchentities") {
    return { search: [{ id: "Q1049294", label: "emoji" }, { id: "Q138800472", label: "Emoji", description: "2026 single" }] };
  }
  const ids = (q.get("ids") ?? "").split("|");
  if (q.get("props")?.includes("claims")) return { entities: Object.fromEntries(ids.filter((id) => ENTITIES[id]).map((id) => [id, ENTITIES[id]])) };
  return { entities: Object.fromEntries(ids.map((id) => [id, { id, labels: { en: { value: LABELS[id] } } }])) };
};

const holds = (store: ConceptStore, id: string) => (store.get(id)?.relations ?? []).map((r) => format(r.claim));

test("a word is tied to the sense what was said fits, and takes its classifying relations from one import", async () => {
  const store = new ConceptStore();
  seed(store);
  const grounded = await groundInWikidata(store, "Emoji", { fetch: fake, said: "i put an emoji in my messages" });
  assert.equal(grounded?.item, "Q1049294", "the sense the messages fit, not the single");
  assert.deepEqual(holds(store, "Emoji").filter((r) => !r.startsWith("SameAs")), [
    "IsA(Notation())", "SubclassOf(Ideogram())", "SubclassOf(UnicodeCharacter())", "DistinctFrom(Emoticon())",
  ], "instance of and subclass of kept apart, and a deprecated claim skipped");
  assert.equal(wikidataItem(store, "Emoji"), "Q1049294");
  assert.equal(wikidataItem(store, "Emoticon"), "Q31963", "each target is tied to its own item");
  const isA = store.get("Emoji")!.relations.find((r) => format(r.claim) === "SubclassOf(Ideogram())")!;
  assert.equal(store.findStamp(isA.stamps![0].source!)?.identity, "Wikidata");
});

test("with nothing said to pick one, every sense is learned in its own context", async () => {
  const store = new ConceptStore();
  seed(store);
  const grounded = await groundInWikidata(store, "Emoji", { fetch: fake });
  assert.equal(grounded?.item, "Q1049294, Q138800472");
  const within = (context: string) =>
    store.get("Emoji")!.relations.filter((r) => r.context !== undefined && format(r.context) === context).map((r) => format(r.claim));
  assert.ok(within("Notation()").includes("IsA(Notation())"));
  assert.ok(within("Single()").includes('Means("2026 single")'));
  assert.equal(store.get("Emoji")!.relations.filter((r) => r.context === undefined && !format(r.claim).startsWith("SameAs")).length, 0);
});

test("a grounded kind answers as one: subclass chains, membership takes one step", async () => {
  const store = new ConceptStore();
  seed(store);
  await groundInWikidata(store, "Emoji", { fetch: fake, said: "an emoji in my messages" });
  store.addRelation("Ideogram", c("SubclassOf", c("Symbol")));
  // K2 is a volcano; a volcano is a kind of mountain: so K2 is a mountain.
  store.addRelation("Volcano", c("SubclassOf", c("Mountain")));
  store.addRelation("K2", c("IsA", c("Volcano")));
  const ask = async (text: string) => (await (await import("../runtime/turn.js")).turn(new Runtime(store), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered;
  assert.equal(await ask("is an emoji a symbol?"), "Answer(True())", "subclass chain");
  assert.equal(await ask("is k2 a mountain?"), "Answer(True())", "an instance, through its kind's superclass");
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
