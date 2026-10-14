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
  assert.equal(await read(store, "hello there"), undefined);
});

test("a word that is itself something said, a word that points at the moment, a word for a question word, and what only the speaker can tell", async () => {
  const said = await talk(graph(false), ["hello", "what time is it", "calculate 100 minus 1", "what is my name"]);
  assert.equal(said[0]!.spoken, "Hello!");
  assert.match(said[1]!.spoken, /^It is \d+:\d\d [AP]M\.$/);
  assert.equal(said[2]!.spoken, "99.");
  assert.equal(said[3]!.spoken, "I don't know your name yet.");
  assert.deepEqual(said.map((s) => s.by), ["frames", "frames", "frames", "frames"]);
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

test("a statement is kept as a fact of what it is about, and read back by a question", async () => {
  const said = await talk(graph(false), [
    "my name is Sam", "what is my name", "my name is Bob", "what is my name",
    "tom is taller than ann", "who is taller than ann", "is tom taller than ann", "is ann taller than tom",
    "remember that my dog's name is Rex", "what is my dog's name",
  ]);
  // What it does not know is said so first, then where reading it got stuck.
  assert.deepEqual(said.map((s) => (s.spoken.startsWith("I don't know yet.") ? "I don't know yet." : s.spoken)), [
    "Got it.", "Sam.", "Got it.", "Bob.",
    "Got it.", "Tom.", "Yes.", "I don't know yet.",
    "Got it, I'll remember that.", "Rex.",
  ]);
});

test("what is said again of whose and which replaces what was said before, and the old stays as history", async () => {
  const store = graph(false);
  await talk(store, ["my name is Sam", "my name is Bob"]);
  const names = (store.get("Me")?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === "Name");
  assert.deepEqual(names.map((r) => [format(r.claim), store.retracted("Me", r.claim)]), [["Name(Sam())", true], ["Name(Bob())", false]]);
});

test("what someone is said to have said is read as its own frame: a claim is checked, nothing is kept as true", async () => {
  const store = graph();
  const said = await talk(store, ["I told them that 2 plus two was 5", "who directed jaws", "he told me his name is Bob", "what is my name"]);
  assert.deepEqual(said.map((s) => s.spoken).slice(0, 3), ["It's actually 4, not 5.", "Steven Spielberg.", "Got it."]);
  assert.equal(said[2].by, "frames");
  assert.ok(!(store.get("StevenSpielberg")?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "Name"), "a reported statement is not kept as a fact");
  assert.ok(!(store.get("Me")?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "Name"));
});

test("two parts joined by and are split by the frames when each reads whole, the second after the first", async () => {
  const store = graph();
  const said = await talk(store, ["who directed jaws and what year was he born", "add 3 and 4", "my name is Sam and what is 6 times 7", "what is my name"]);
  // A reply of parts says the answer, and the statement beside it is kept without being said back.
  assert.deepEqual(said.map((s) => s.spoken), ["Steven Spielberg. 1946.", "7", "42.", "Sam."]);
});

test("a relation's inverse names are its words read the other way: child asks a father fact from its other end", async () => {
  const family: Record<string, Record<string, unknown>> = {
    Q100: { id: "Q100", labels: { en: { value: "Anna" } }, descriptions: { en: { value: "person" } }, sitelinks: { a: 1 }, claims: { P22: [item("Q101")] } },
    Q101: { id: "Q101", labels: { en: { value: "Boris" } } },
    P22: { id: "P22", labels: { en: { value: "father" } }, aliases: { en: [{ value: "dad" }] }, claims: { P1696: [item("P40")] } },
    P40: { id: "P40", labels: { en: { value: "child" } }, aliases: { en: [{ value: "children" }, { value: "daughter" }] } },
  };
  const get = async (url: string): Promise<unknown> => {
    const u = new URL(url);
    const q = u.searchParams;
    if (u.hostname.endsWith("wikipedia.org")) return { query: { pages: {} } };
    if (q.get("action") === "wbsearchentities") return { search: (q.get("search") ?? "").toLowerCase() === "anna" ? [{ id: "Q100", label: "Anna" }] : [] };
    const ids = (q.get("ids") ?? "").split("|").filter((id) => family[id]);
    return { entities: Object.fromEntries(ids.map((id) => [id, family[id]])) };
  };
  const store = graph(false);
  const { groundInWikidata } = await import("../research/wikidata.js");
  await groundInWikidata(store, "Anna", { fetch: get });
  assert.ok((store.get("Father")?.relations ?? []).some((r) => format(r.claim) === "InverseCalled(Child())"));
  const said = await talk(store, ["who is anna's father", "who is anna's dad", "who is boris's child", "who are boris's children", "who is boris's daughter"]);
  assert.deepEqual(said.map((s) => s.spoken), ["Boris.", "Boris.", "Anna.", "Anna.", "Anna."]);
});

test("readings too close to choose between are asked about, and the pick is learned: the same question is answered next time", async () => {
  const store = graph(false);
  for (const [id, rel] of [["Ada", "RanCompany(Acme())"], ["Ada", "RanMarathon(Boston())"], ["RanCompany", "Called(Ran())"], ["RanMarathon", "Called(Ran())"]] as const) store.addRelation(id, parse(rel));
  const said = await talk(store, ["what did ada run", "the company", "what did ada run"]);
  assert.match(said[0].spoken, /^Do you mean .*\(ran company\) or .*\(ran marathon\)\?$/i);
  assert.deepEqual(said.slice(1).map((s) => s.spoken), ["Acme.", "Acme."]);
  const { weight } = await import("./frames.js");
  assert.ok(weight(store, "sense:run=RanCompany") > 0 && weight(store, "sense:run=RanMarathon") < 0);
});

test("yes after a reading confirms its choices, no corrects them", async () => {
  const store = graph();
  const { weight } = await import("./frames.js");
  await talk(store, ["who directed jaws", "yes"]);
  assert.ok(weight(store, "sense:directed=Director") > 0);
  await talk(store, ["what year was steven spielberg born", "no"]);
  assert.ok(weight(store, "sense:born=DateOfBirth") < 0);
});

test("one hole, a list, or two joined by of: square root of 144, average of 3, 5 and 10, 17 percent of 240", async () => {
  const store = graph(false);
  const got = async (m: string) => format((await read(store, m))!.result);
  assert.equal(await got("what is the square root of 144"), "Answer(12)");
  assert.equal(await got("average of 3, 5 and 10"), "Answer(6)");
  assert.equal(await got("sort 3, 1, 2"), "List(1, 2, 3)", "a doing asked for gives what it comes to");
  assert.equal(await got("what is the largest of 4, 17, 2"), "Answer(17)");
  assert.equal(await got("what is the sum of 1, 2 and 3"), "Answer(6)");
  assert.match(await got("what is 17 percent of 240"), /^Answer\(40\.8/);
  // A word whose realization takes what it is given unworked ("want") is not an operation on values.
  assert.equal(await got("waht is 6 tims 7"), "Answer(42)");
});

test("when it does not know, it says where reading got stuck: the nearest reading, what it could not fit, the words it has nothing for", async () => {
  const said = await talk(graph(false), ["what is 10 times 10 in roman numerals", "who is the mayor of gotham"]);
  assert.match(said[0].spoken, /Where I got stuck: I read 10 times 10, but couldn't fit "in", "roman" and "numerals" into it\. I have nothing for "roman" yet\.$/);
  assert.match(said[1].spoken, /Where I got stuck: I have nothing for "mayor" and "gotham" yet\.$/);
  // An answer it has is said alone.
  assert.deepEqual((await talk(graph(false), ["what is 2 plus 2"])).map((s) => s.spoken), ["4."]);
});

test("round two: who is, dates, the X of Y, and other ways to say is", async () => {
  const said = await talk(graph(false), [
    "my sister's name is Lily", "lily is a doctor", "who is lily",
    "my birthday is june 3rd", "when is my birthday", "remember that my anniversary is the 12th of may", "when is my anniversary",
    "the capital of france is paris", "what is the capital of france",
    "is 10 times 10 equal to 100", "2 plus 2 equals 5", "is 3 times 3 the same as 9",
  ]);
  assert.deepEqual(said.map((s) => s.spoken), [
    "Got it.", "Got it.", "Lily is a doctor.",
    "Got it.", "June 3", "Got it, I'll remember that.", "May 12",
    "Got it.", "Paris.",
    "Yes, that's 100.", "It's actually 4, not 5.", "Yes, that's 9.",
  ]);
});

test("a doing is kept as a relation named by it, the newest winning, and read back by a question", async () => {
  const said = await talk(graph(false), [
    "i live in phoenix", "i ate an apple", "my sister lives in denver",
    "where do i live?", "what did i eat?", "where does my sister live?",
    "i live in tucson", "where do i live",
  ]);
  assert.deepEqual(said.map((s) => s.spoken), ["Got it.", "Got it.", "Got it.", "Phoenix.", "Apple.", "Denver.", "Got it.", "Tucson."]);
  assert.ok(said.every((s) => s.by === "frames"));
});

test("\"bday means birthday\" teaches a reading; a word after \"my\" is never looked up; a recalled answer says where it came from", async () => {
  const { knownFrom } = await import("../store/provenance.js");
  const store = new ConceptStore();
  seed(store);
  const looked: string[] = [];
  const fetch = async (url: string) => {
    looked.push(url);
    return {};
  };
  const runtime = () => new Runtime(store, {});
  await turn(runtime(), "my birthday is march 5 1991", c("Execution"), { fetch });
  await turn(runtime(), "what is my bday", c("Execution"), { fetch });
  assert.ok(!looked.some((u) => /search=bday|titles=bday/.test(u)), "bday was looked up as a thing in the world");
  assert.equal((await turn(runtime(), "bday means birthday", c("Execution"), { fetch })).hearingUsed, "frames");
  const asked = await turn(runtime(), "what is my bday", c("Execution"), { fetch });
  assert.equal(asked.spoken, "Tuesday, March 5, 1991");
  // Told outside a conversation here, so known by the fact itself (in a conversation: "You told me ...").
  assert.match(knownFrom(store, asked.result, asked.expression)[0] ?? "", /Me Birthday\(Date\(year=1991/);
});

test("a doing said of someone not named yet, or of a count of things, is kept: he is not she, and a count is said back as told", async () => {
  const store = new ConceptStore();
  seed(store);
  const said = (await talk(store, ["He bought a car.", "She bought 5 apples.", "What did she buy?", "What did he buy?", "Mishka bought 3 pairs of shorts.", "What did Mishka buy?"])).map((x) => x.spoken);
  assert.deepEqual([said[2], said[3], said[5]], ["5 apples.", "Car.", "3 pairs of shorts."]);
});

test("a word Wikidata knows only as a name (a female given name, a kind of given name, a kind of name) is kept as a name", async () => {
  const { groundInWikidata } = await import("../research/wikidata.js");
  const items: Record<string, Record<string, unknown>> = {
    Q1: { id: "Q1", labels: { en: { value: "Siobhan" } }, descriptions: { en: { value: "female given name" } }, sitelinks: {}, claims: { P31: [item("Q2")] } },
    Q2: { id: "Q2", labels: { en: { value: "female given name" } }, claims: { P279: [item("Q3")] } },
    Q3: { id: "Q3", labels: { en: { value: "given name" } }, claims: { P279: [item("Q4")] } },
    Q4: { id: "Q4", labels: { en: { value: "name" } }, claims: {} },
  };
  const get = async (url: string): Promise<unknown> => {
    const u = new URL(url);
    if (u.hostname.endsWith("wikipedia.org")) return { query: { pages: {} } };
    if (u.searchParams.get("action") === "wbsearchentities") return { search: Object.values(items).filter((e) => (e.labels as { en: { value: string } }).en.value.toLowerCase() === (u.searchParams.get("search") ?? "").toLowerCase()).map((e) => ({ id: e.id, label: (e.labels as { en: { value: string } }).en.value })) };
    const ids = (u.searchParams.get("ids") ?? "").split("|").filter((id) => items[id]);
    return { entities: Object.fromEntries(ids.map((id) => [id, items[id]])) };
  };
  const store = graph(false);
  await groundInWikidata(store, "Siobhan", { fetch: get });
  assert.ok(store.get("Siobhan")!.relations.some((r) => format(r.claim) === "IsA(Name())"));
});

test("postfix operations, and a bare number said of someone kept as their age and read back by how old", async () => {
  const store = new ConceptStore();
  seed(store);
  const said = (await talk(store, ["what is 3 squared", "5 cubed", "tom is 30", "how old is tom", "pi is 3.14159"])).map((x) => x.spoken);
  assert.deepEqual(said.slice(0, 2), ["9.", "125."]);
  assert.equal(said[3], "30.");
  assert.ok(!store.get("Pi")?.relations.some((r) => format(r.claim).startsWith("Age(")));
});

test("being born is told and asked by the relation that takes what was said: a year is a date of birth, a city a place", async () => {
  const store = new ConceptStore();
  seed(store);
  const said = (await talk(store, ["i was born in 1990", "what year was i born", "tom was born in paris", "where was tom born"])).map((x) => x.spoken);
  assert.deepEqual([said[1], said[3]], ["1990.", "Paris."]);
});

test("someone named in a fact told is an individual of their own, and who they are is what holds them", async () => {
  const store = new ConceptStore();
  seed(store);
  const said = (await talk(store, ["Gunter is my friend.", "who is gunter?", "who is my friend?", "tom's brother is sam", "who is sam", "my name is Bob"])).map((x) => x.spoken);
  assert.deepEqual(said.slice(1, 3), ["Your friend.", "Gunter."]);
  assert.equal(said[4], "Tom's brother.");
  assert.ok(store.get("Gunter_1")?.relations.some((r) => format(r.claim) === 'Named("Gunter")'));
  assert.ok(store.get("Me")?.relations.some((r) => format(r.claim) === "Name(Bob())"), "a name told as a name is not someone");
});

test("doings kept for later: remember to, need to, have to; asked back by the doing", async () => {
  const store = new ConceptStore();
  seed(store);
  const said = (await talk(store, ["remember to buy milk", "i need to buy eggs", "what do i need to buy", "i have to call mom", "what do i have to call"])).map((x) => x.spoken);
  assert.deepEqual([said[2], said[4]], ["Milk and eggs.", "Mom."]);
});

test("what a question word asks for constrains what is looked up: who is someone (or a name), never a thing the word also means", async () => {
  const { groundInWikidata, classesOf } = await import("../research/wikidata.js");
  const items: Record<string, Record<string, unknown>> = {
    Q10: { id: "Q10", labels: { en: { value: "Gunter" } }, descriptions: { en: { value: "sailing rig" } }, sitelinks: {}, claims: { P31: [item("Q11")] } },
    Q11: { id: "Q11", labels: { en: { value: "rig" } }, claims: { P279: [item("Q12")] } },
    Q12: { id: "Q12", labels: { en: { value: "device" } }, claims: {} },
    Q20: { id: "Q20", labels: { en: { value: "Ada" } }, descriptions: { en: { value: "mathematician" } }, sitelinks: {}, claims: { P31: [item("Q5")] } },
    Q5: { id: "Q5", labels: { en: { value: "human" } }, claims: { P279: [item("Q215627")] } },
    Q215627: { id: "Q215627", labels: { en: { value: "person" } }, claims: {} },
  };
  const get = async (url: string): Promise<unknown> => {
    const u = new URL(url);
    if (u.hostname.endsWith("wikipedia.org")) return { query: { pages: {} } };
    if (u.searchParams.get("action") === "wbsearchentities") return { search: Object.values(items).filter((e) => (e.labels as { en: { value: string } }).en.value.toLowerCase() === (u.searchParams.get("search") ?? "").toLowerCase()).map((e) => ({ id: e.id, label: (e.labels as { en: { value: string } }).en.value })) };
    const ids = (u.searchParams.get("ids") ?? "").split("|").filter((id) => items[id]);
    return { entities: Object.fromEntries(ids.map((id) => [id, items[id]])) };
  };
  const store = new ConceptStore();
  seed(store);
  const kinds = classesOf(store, ["Someone"]);
  assert.ok(kinds.includes("Q215627"));
  assert.equal(await groundInWikidata(store, "Gunter", { fetch: get, kinds }).then((g) => g?.relations.length ?? 0), 0, "a sailing rig is not someone");
  assert.ok(((await groundInWikidata(store, "Ada", { fetch: get, kinds }))?.relations.length ?? 0) > 0, "a person is");
});
