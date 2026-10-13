import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import { turn } from "../runtime/turn.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { eventsOf, follows, groundInConceptNet, lookedUp } from "./conceptnet.js";
import { feelingName, learnFeelings, valenceOf } from "./feeling.js";

// ConceptNet as it answers /query?start=..., for the events these tests tell of.
const EDGES: Record<string, [string, string, number][]> = {
  "/c/en/losing_your_job": [["Causes", "depression", 2], ["CausesDesire", "find a new job", 3], ["IsA", "bad thing", 2], ["Causes", "sadness", 1]],
  "/c/en/raining": [["Causes", "flooding", 2]],
};
function conceptnet() {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    const start = new URL(url).searchParams.get("start") ?? "";
    asked.push(start);
    return { edges: (EDGES[start] ?? []).map(([rel, end, weight]) => ({ rel: { label: rel }, start: { label: start, language: "en" }, end: { label: end, language: "en" }, weight })) };
  };
  return { asked, fetch };
}

test("an event is named the way ConceptNet names one: the doing as said and as its base, the speaker's my as your", () => {
  assert.deepEqual(eventsOf("I lost my job").slice(0, 2), ["losing your job", "lose your job"]);
  assert.deepEqual(eventsOf("My car broke down :("), ["breaking down", "break down"]);
});

test("what follows from an event is kept from one import stamp, only the relations that say what it leads to, and never asked twice", async () => {
  const store = new ConceptStore();
  const { asked, fetch } = conceptnet();
  const kept = await groundInConceptNet(store, "losing your job", { fetch });
  assert.deepEqual(kept.map(format).sort(), ["Causes(Depression())", "Causes(Sadness())", "CausesDesire(FindANewJob())"]);
  assert.ok(lookedUp(store, "losing your job"));
  await groundInConceptNet(store, "losing your job", { fetch });
  await groundInConceptNet(store, "flying a kite", { fetch });
  await groundInConceptNet(store, "flying a kite", { fetch });
  assert.deepEqual(asked, ["/c/en/losing_your_job", "/c/en/flying_a_kite"]);
  assert.equal(follows(store, "FlyingAKite").length, 0);
});

test("a word's feeling is learned from the lexicon onto the written word, once", () => {
  const store = new ConceptStore();
  assert.ok(learnFeelings(store, "my car broke down :(") >= 2);
  assert.equal(valenceOf(store, "broke"), -1.8);
  assert.equal(valenceOf(store, ":("), -1.9);
  assert.equal(feelingName(":("), "Word_x3ax28");
  assert.equal(learnFeelings(store, "it broke"), 0);
});

test("told an event, the reply says what follows from it and how it felt, not a corpus line", async () => {
  const store = new ConceptStore();
  seed(store);
  const { fetch } = conceptnet();
  const said = (m: string) => turn(new Runtime(store, {}), m, c("Execution"), { fetch });
  const lost = await said("I lost my job");
  assert.match(lost.spoken, /Losing your job can cause depression or sadness\. Do you want to find a new job\?/);
  // What it leads to counts for how it feels: losing a job is bad news, said back to whom it happened.
  assert.match(lost.spoken, /^Sorry to hear you lost your job\./);
  // Nothing known of the event: how it felt is still said, with what was told.
  assert.equal((await said("My car broke down :(")).spoken, "Sorry to hear your car broke down. Do you want to talk about it?");
  // Negated, a good word feels bad.
  assert.match((await said("I'm not happy")).spoken, /you are not happy/);
  // A statement kept still feels: "my mom is sick" is not answered "Got it."
  assert.match((await said("my mom is sick")).spoken, /^Sorry to hear your mom is sick\./);
  // Said of Napkin itself.
  assert.match((await said("you're awesome")).spoken, /^Thank you/);
  assert.match((await said("you are useless")).spoken, /What did I get wrong\?/);
  // Nothing felt: kept as before.
  assert.equal((await said("my name is Sam")).spoken, "Got it.");
});

test("a friend remembers: something bad told is asked after at the next small talk, once; a yes or no answers what was offered", async () => {
  const store = new ConceptStore();
  seed(store);
  const history: { message: string; result: string; spoken: string }[] = [];
  const say = async (m: string) => {
    const t = await turn(new Runtime(store, {}), m, c("Execution"), { learn: false, history: history.slice(-6) });
    history.push({ message: m, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    return t.spoken;
  };
  assert.equal(await say("my mom is sick"), "Sorry to hear your mom is sick. Do you want to talk about it?");
  assert.equal(await say("yeah"), "I'm listening. What's been going on?");
  assert.equal(await say("what is 2 plus 2"), "4.");
  assert.equal(await say("hi"), "Hello! By the way, how is your mom doing?");
  assert.equal(await say("hello"), "Hello!");
  await say("I lost my job");
  assert.equal(await say("nah"), "That's okay. I'm here if you change your mind.");
});

// Wikipedia as its API answers search and extracts, for the pages these tests read (text written
// for the test, shaped like the real pages).
const PAGES: Record<string, string> = {
  "Diffuse sky radiation":
    "Diffuse sky radiation is solar radiation reaching the Earth's surface after having been scattered from the direct solar beam by molecules or particulates in the atmosphere. " +
    "On a clear day the sky is blue because of Rayleigh scattering, which affects short wavelengths of light more than long ones. " +
    "Near sunrise and sunset, most of the light arrives at a low angle.",
  "Rayleigh scattering":
    "Rayleigh scattering is the scattering of light by particles much smaller than the wavelength of the light. It is named after Lord Rayleigh.",
};
function wikipedia() {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    const q = new URL(url).searchParams;
    asked.push(q.get("srsearch") ?? q.get("titles") ?? "");
    if (q.get("list") === "search") {
      const s = (q.get("srsearch") ?? "").toLowerCase();
      const hits = s.includes("rayleigh") ? ["Rayleigh scattering"] : s.includes("sky") ? ["Diffuse sky radiation"] : [];
      return { query: { search: hits.map((title) => ({ title })) } };
    }
    const title = q.get("titles") ?? "";
    const text = PAGES[title];
    return { query: { pages: text ? { "1": { title, extract: q.get("exintro") ? text.split(". ")[0] + "." : text } } : {} } };
  };
  return { asked, fetch };
}

test("why is answered by a chain put together from what is written: the cause, what the cause is, where each was read; then from the graph", async () => {
  const store = new ConceptStore();
  seed(store);
  const { asked, fetch } = wikipedia();
  const why = await turn(new Runtime(store, {}), "why is the sky blue?", c("Execution"), { fetch });
  assert.equal(
    why.spoken,
    "Because of Rayleigh scattering, which affects short wavelengths of light more than long ones. Rayleigh scattering is the scattering of light by particles much smaller than the wavelength of the light. (From Wikipedia: Diffuse sky radiation; Rayleigh scattering.)",
  );
  const n = asked.length;
  const again = await turn(new Runtime(store, {}), "why is the sky blue", c("Execution"), { fetch, learn: false });
  assert.equal(again.spoken, why.spoken);
  assert.equal(asked.length, n);
});
