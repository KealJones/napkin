/**
 * The graph side of the Ears conventions (`src/ears/AGENTS.md`, `eval/ears/gold.md`):
 * whatever the Ears keeps from what was said, evaluation projects to something runnable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { c, format } from "../concept/expression.js";
import { lift } from "../ears/lift.js";
import { resolveReferences } from "../runtime/references.js";
import { Runtime } from "../runtime/evaluator.js";
import { ConceptStore } from "../store/store.js";
import { seed } from "./seed.js";

const EXEC = c("Execution");
const run = async (lines: string) => {
  const store = new ConceptStore();
  seed(store);
  return format(await new Runtime(store).evaluate(lift(lines).expression!, EXEC));
};

test("an imperative is performed", async () => {
  assert.equal(await run("Do(Multiply(6, 7))"), "42");
  assert.equal(await run("Do(Please(Multiply(6, 7)))"), "42");
});

test("please stays where it was said and projects to what it asks", async () => {
  assert.equal(await run("Please(Multiply(6, 7))"), "42");
});

test("a polite question about what you can do is read as the request, and only as a question", async () => {
  assert.equal(await run("Mood(Interrogative(), Can(You(), Multiply(6, 7)))"), "42");
  assert.equal(await run("Mood(Interrogative(), Could(You(), Multiply(6, 7)))"), "42");
  assert.notEqual(await run("Mood(Declarative(), Can(You(), Multiply(6, 7)))"), "42", "\"you can multiply\" is a claim, not a request");
});

test("a mood runs its line with the mood as a facet", async () => {
  assert.equal(await run("Mood(Imperative(), Multiply(6, 7))"), "42");
  assert.equal(await run('Mood(Imperative(), InlineCode("pnpm test"))'), '"pnpm test"');
});

test("a yes/no question that is not about you is still a yes/no question", async () => {
  assert.equal(await run("Whether(True())"), "Answer(True())");
});

test("layout projects to its content", async () => {
  assert.equal(await run("Item(1, Multiply(6, 7))"), "42");
  assert.equal(await run("Item(Multiply(6, 7))"), "42");
  assert.equal(await run('Block("rust", "fn main() {}")'), '"fn main() {}"');
});

test("a reference inside the message is named, resolves to its binding, and survives history", () => {
  const lifted = lift('$x = Multiply(6, 7)\nDo(Double(Ref("it", $x)))').expression!;
  assert.match(format(lifted), /Ref\("it", resolvedTo=\$x\)/);
  const { expression } = resolveReferences(lifted, [{ message: "what is 2 plus 2", result: "4" }]);
  assert.equal(format(expression!), format(lifted), "history must not overwrite a resolved Ref");
});

test("a resolved in-message reference evaluates to what it points at", async () => {
  assert.equal(await run('$x = Multiply(6, 7)\nRef("it", $x)'), "42");
});

test("a clock time as said realizes to the clock's value record, and a record is never re-read", async () => {
  assert.equal(await run("Time(7, Am())"), 'Time(hour=7, minute=0, spoken="7:00 AM")');
  assert.equal(await run("Time(3, 30, Pm())"), 'Time(hour=15, minute=30, spoken="3:30 PM")');
  assert.equal(await run("Time(12, Am())"), 'Time(hour=0, minute=0, spoken="12:00 AM")');
  assert.equal(await run("Time(19, 0)"), 'Time(hour=19, minute=0, spoken="7:00 PM")');
  assert.match(await run("ShiftHours(Time(7, Am()), 2)"), /hour=9/);
});

test("durations shift dates and clock times, through In, Ago, Add and Subtract", async () => {
  const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const in5 = new Date(); in5.setDate(in5.getDate() + 5);
  assert.match(await run("What(Day(Will(Be(In(Days(5))))))"), new RegExp(names[in5.getDay()]));
  assert.equal(await run("Add(Today(), Days(5))"), await run("ShiftDays(Today(), 5)"));
  assert.equal(await run("Subtract(Today(), Weeks(1))"), await run("ShiftDays(Today(), -7)"));
  assert.equal(await run("Ago(Days(1))"), await run("Yesterday()"));
  assert.match(await run("Subtract(Time(7, Am()), Hours(2))"), /spoken="5:00 AM"/);
  assert.match(await run("Add(Time(11, 30, Pm()), Minutes(45))"), /spoken="12:15 AM"/);
  assert.equal(await run("Add(2, 3)"), "5");
  assert.equal(await run('In(Pittsburgh())'), "In(Pittsburgh())", "In is still a preposition everywhere else");
});

test("a date at a clock time is a moment, and shifting its time carries into its date", async () => {
  const tomorrow = await run("Tomorrow()");
  const at = await run("At(Tomorrow(), Time(11, Pm()))");
  assert.match(at, /time=Time\(hour=23, minute=0/);
  const later = await run("Add(At(Tomorrow(), Time(11, Pm())), Hours(2))");
  assert.match(later, /time=Time\(hour=1, minute=0/);
  assert.notEqual(later.replace(/, time=.*$/, ""), tomorrow.replace(/\)$/, ""), "crossing midnight moves the date");
  assert.match(await run("Add(At(Today(), Time(9, Am())), Days(1))"), /time=Time\(hour=9/);
  assert.equal(await run("Add(Today(), Hours(2))"), "Add(" + (await run("Today()")) + ", Hours(2))", "a bare date has no time to shift");
});
