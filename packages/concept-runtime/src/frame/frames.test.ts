import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { c, format, isCall, parse } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { frames } from "./frames.js";
import { sensesOf } from "./senses.js";

const { fixture } = JSON.parse(readFileSync(new URL("../../eval/frames/cases.json", import.meta.url), "utf8")) as { fixture: [string, string][] };
const graph = (facts = true) => {
  const store = new ConceptStore();
  seed(store, { packs: [] });
  if (facts) for (const [id, rel] of fixture) store.addRelation(id, parse(rel));
  return store;
};
const read = async (store: ConceptStore, message: string, history: { result: string }[] = []) => (await frames(new Runtime(store, {}), message, history)).framed;
async function talk(store: ConceptStore, messages: string[]) {
  const runtime = new Runtime(store, {});
  const history: { message: string; result: string; spoken?: string }[] = [];
  const out: { spoken: string; by?: string }[] = [];
  for (const message of messages) {
    const t = await turn(runtime, message, c("Execution"), { history: history.slice(-6), learn: false, keepReadings: true });
    history.push({ message, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    out.push({ spoken: t.spoken, by: t.hearingUsed });
  }
  return out;
}

test("a word's senses come from the graph: an operation with typed holes, a relation by what it is called, a kind, a word that only helps", async () => {
  const store = graph();
  const none = async () => undefined;
  const times = await sensesOf(store, "times", none);
  assert.ok(times.some((s) => s.type === "op" && s.target === "Multiply" && s.holes.join() === "Number,Number"));
  const born = (await sensesOf(store, "born", none)).filter((s) => s.type === "relation").map((s) => (s.type === "relation" ? s.head : "")).sort();
  assert.deepEqual(born, ["DateOfBirth", "PlaceOfBirth"]);
  assert.ok((await sensesOf(store, "movies", none)).some((s) => s.type === "kind" && s.head === "Film"));
  assert.ok((await sensesOf(store, "by", none)).every((s) => s.type === "glue"));
});

test("values are taken by the operations beside them, and which takes first is the graph's Binds", async () => {
  const store = graph(false);
  assert.equal(format((await read(store, "what is 2 plus 3 times 4"))!.result), "Answer(14)");
  assert.equal(format((await read(store, "what is 6 times 7 minus 2"))!.result), "Answer(40)");
  // A doing asked for gives what it comes to; a question is answered.
  assert.equal(format((await read(store, "subtract 3 from 10"))!.result), "7");
  assert.equal(format((await read(store, "what is (2+3)*4"))!.result), "Answer(20)");
  assert.equal(format((await read(store, "what is 12 divided by 4"))!.result), "Answer(3)");
});

test("which sense of a word is meant is chosen by its neighbours: born beside year is when, beside where is where", async () => {
  const store = graph();
  assert.equal(format((await read(store, "what year was steven spielberg born"))!.result), "Answer(1946)");
  assert.equal(format((await read(store, "where was steven spielberg born"))!.result), "Answer(Cincinnati())");
  assert.equal(format((await read(store, "what movies did steven spielberg direct"))!.result), "Answer(List(Jaws(), ET()))");
});

test("the sense taken is kept with the words beside it", async () => {
  const store = graph();
  await read(store, "what year was steven spielberg born");
  const kept = (store.get("DateOfBirth")?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === "ReadBeside").map((r) => format(r.claim));
  assert.deepEqual(kept, ['ReadBeside("born", "year")']);
});

test("a word a slip away is read as the word whose senses fit, by its neighbours", async () => {
  const store = graph(false);
  const framed = await read(store, "waht is 6 tims 7");
  assert.equal(framed?.text, "what is 6 times 7");
  assert.equal(format(framed!.result), "Answer(42)");
});

test("a message with a word no reading accounts for is left to the rules hearing", async () => {
  const store = graph(false);
  assert.equal(await read(store, "I bought a florp for my kid"), undefined);
  assert.equal(await read(store, "hello"), undefined);
});

test("a hole is asked for in the words said, and filled by the next message", async () => {
  const said = await talk(graph(false), ["what is 9 minus", "4"]);
  assert.deepEqual(said.map((s) => s.spoken), ["9 minus what?", "5."]);
  assert.deepEqual(said.map((s) => s.by), ["frames", "frames"]);
});

test("a pointing word is the last answer: he is the director just named", async () => {
  const said = await talk(graph(), ["who directed jaws", "what year was he born"]);
  assert.deepEqual(said.map((s) => s.spoken), ["Steven Spielberg.", "1946."]);
});

/** Wikidata as it answers, for Jaws and Steven Spielberg, and the properties and items they name. */
const item = (id: string) => ({ rank: "normal", mainsnak: { snaktype: "value", datatype: "wikibase-item", datavalue: { value: { id } } } });
const WIKIDATA: Record<string, Record<string, unknown>> = {
  Q8877: {
    id: "Q8877", labels: { en: { value: "Steven Spielberg" } }, descriptions: { en: { value: "American filmmaker" } }, sitelinks: { a: 1 },
    aliases: { en: [{ value: "Spielberg" }] },
    claims: {
      P31: [item("Q5")], P19: [item("Q43196")],
      P569: [{ rank: "normal", mainsnak: { snaktype: "value", datatype: "time", datavalue: { value: { time: "+1946-12-18T00:00:00Z", precision: 11 } } } }],
    },
  },
  Q189540: { id: "Q189540", labels: { en: { value: "Jaws" } }, descriptions: { en: { value: "1975 film by Steven Spielberg" } }, sitelinks: { a: 1 }, claims: { P31: [item("Q11424")], P57: [item("Q8877")] } },
  P569: { id: "P569", labels: { en: { value: "date of birth" } }, aliases: { en: [{ value: "born" }, { value: "birth date" }] } },
  P19: { id: "P19", labels: { en: { value: "place of birth" } }, aliases: { en: [{ value: "born in" }, { value: "birthplace" }] } },
  P57: { id: "P57", labels: { en: { value: "director" } }, aliases: { en: [{ value: "directed by" }] } },
  Q5: { id: "Q5", labels: { en: { value: "human" } } },
  Q11424: { id: "Q11424", labels: { en: { value: "film" } } },
  Q43196: { id: "Q43196", labels: { en: { value: "Cincinnati" } } },
};
const asked: string[] = [];
const wikidata = async (url: string): Promise<unknown> => {
  const u = new URL(url);
  const q = u.searchParams;
  if (u.hostname.endsWith("wikipedia.org")) return { query: { pages: {} } };
  if (q.get("action") === "wbsearchentities") {
    const want = (q.get("search") ?? "").toLowerCase();
    asked.push(want);
    return { search: Object.values(WIKIDATA).filter((e) => (e.labels as { en: { value: string } }).en.value.toLowerCase() === want).map((e) => ({ id: e.id, label: (e.labels as { en: { value: string } }).en.value })) };
  }
  const ids = (q.get("ids") ?? "").split("|").filter((id) => WIKIDATA[id]);
  const props = q.get("props") ?? "";
  return { entities: Object.fromEntries(ids.map((id) => [id, props.includes("claims") ? WIKIDATA[id] : { id, labels: WIKIDATA[id].labels, aliases: WIKIDATA[id].aliases }])) };
};

test("learned while reading: a thing the graph has never heard of is looked up, kept, and the question read again", async () => {
  const store = graph(false);
  asked.length = 0;
  const runtime = new Runtime(store, {});
  const history: { message: string; result: string; spoken?: string }[] = [];
  const said: string[] = [];
  const by: (string | undefined)[] = [];
  for (const message of ["who directed jaws", "what year was he born"]) {
    const t = await turn(runtime, message, c("Execution"), { history, fetch: wikidata });
    history.push({ message, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    said.push(t.spoken);
    by.push(t.hearingUsed);
  }
  assert.deepEqual(said, ["Steven Spielberg.", "1946."]);
  assert.deepEqual(by, ["frames", "frames"]);
  // Jaws was searched for by its name; Spielberg was already tied to his item by Jaws's import, so not searched.
  assert.deepEqual(asked, ["jaws"]);
  // Kept, sourced, and answered from the graph the next time, with nothing looked up.
  const again = await turn(new Runtime(store, {}), "where was steven spielberg born", c("Execution"), { fetch: wikidata });
  assert.equal(again.spoken, "Cincinnati.");
  assert.deepEqual(asked, ["jaws"]);
});
