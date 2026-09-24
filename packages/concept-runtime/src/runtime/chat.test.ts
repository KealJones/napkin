import assert from "node:assert/strict";
import { test } from "node:test";
import { c } from "../concept/expression.js";
import { say } from "../ears/say.js";
import { seed } from "../seed/seed.js";
import { ConceptStore } from "../store/store.js";
import { Runtime } from "./evaluator.js";
import { turn } from "./turn.js";

const store = new ConceptStore();
seed(store);
const ask = async (text: string) =>
  (await turn(new Runtime(store), text, c("Execution"), { backend: "rules", learn: false, speak: false })).rendered;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inDays = (n: number) => DAYS[new Date(Date.now() + n * 86_400_000).getDay()];

test("the when said after what is asked belongs to it", async () => {
  assert.equal(await ask("what day will it be tomorrow"), `Answer("${inDays(1)}")`);
  assert.equal(await ask("what day will it be in 5 days"), `Answer("${inDays(5)}")`);
  assert.match(await ask("what's the date tomorrow"), new RegExp(`weekday="${inDays(1)}"`));
  assert.equal(await ask("what day is it"), `Answer("${inDays(0)}")`);
});

test("roots and percents, said the way people say them", async () => {
  assert.equal(await ask("what is the square root of 144"), "Answer(12)");
  assert.equal(await ask("whats the cube root of 27"), "Answer(3)");
  assert.equal(await ask("what is 15% of 80"), "Answer(12)");
});

test("small talk is answered, not looked up", async () => {
  assert.equal(await ask("good morning"), "Answer(Hello())");
  assert.equal(await ask("how are you?"), "Answer(DoingWell())");
  assert.equal(await ask("cool"), "Answer(GladYouLikeIt())");
  assert.equal(await ask("ok"), "Answer(GotIt())");
  assert.equal(await ask("lol"), "Answer(Laughing())");
  assert.equal(await ask("thank you so much"), "Answer(YoureWelcome())");
  assert.equal(await ask("good night"), "Answer(Goodbye())");
  assert.equal(await say("cool", c("Answer", c("GladYouLikeIt"))), "Glad you like it!");
});

test("the system can say who it is and what it can do", async () => {
  assert.equal(await ask("what is your name"), 'Answer("Napkin")');
  assert.match(await ask("what can you do"), /^Answer\(List\(Arithmetic\(\), /);
  assert.match(await ask("who are you"), /IsA\(Assistant\(\)\)/);
  assert.doesNotMatch(await ask("who are you"), /CanDo/, "capabilities are answered when asked, not recited");
});
