/**
 * The Ears contract (ir-spec Part 9), in the shape that measured best.
 *
 * Three things here are measured rather than chosen:
 *  - assignment lines rather than one wrapped expression (100% vs 97% valid after repair)
 *  - the two mandatory rules below, which took interrogative coverage from 0/6 to 6/6 on
 *    "What is 5 times three?" and lexical errors from 4 to 0
 *  - a vocabulary carrying NO invented parameter names, worth 16 points of fidelity.
 *    `Tell(to, content)` taught the model to emit `Tell(to, content)` literally.
 */
import type { ConceptStore } from "../store/store.js";

const FORM = `Write one line for each phrase of the message, in the order the user said them.
A line is either a plain expression, or an assignment: $name = expression
Later lines use $name. Never nest one line inside another. No commas between lines.

Keep nesting at most 4 levels deep inside one line. If a value needs more, stop, assign it
to its own $name on its own line, and continue on the next line.

All arguments are positional. Never write name= inside a call.
Write plain "text" and plain numbers directly. Number("three") for a number written as a
word, and ONLY for an actual number. "double", "twice", "half" and "a dozen" are not
numbers — each is its own Concept: write Double(21), never Multiply(21, Number("double")).
Keep the user's original wording and misspellings inside strings.`;

const MARK = `Mark every retraction with Correction(old, new).
Mark every "not X" with Not(X).
Mark every vague word ("or whatever", "like", "those things") with Fuzzy(...).
Mark every stressed or capitalised word with Emphasis(...).
Mark a misspelled name with Misspelling("as written", Intended()).
Use Ref("verbatim phrase") for anything that refers to earlier conversation.
Write a line for every distinct thing the user said. Do not drop any.`;

const RULES = `TWO RULES YOU MUST NOT BREAK

1. If the message asks a question, the output MUST contain an interrogative:
   What, Who, When, Where, Why, How, HowMany, WhichOf, or Whether.
   "What is 5 times three?" is a question, so What(Multiply(5, Number("three"))) is right
   and Multiply(5, Number("three")) is WRONG — it states a fact instead of asking.

2. Every name MUST start with a capital letter and MUST be followed by parentheses.
   Write This(), not this. Write Tests(), not tests. Write ChangedFiles(), not changed_files.
   A bare lowercase word is never a value.`;

const QUESTIONS = `An interrogative goes WHERE THE UNKNOWN IS.
If an ARGUMENT is unknown, put the interrogative in that argument slot.
If the VALUE of the whole thing is unknown, wrap it.
Two unknowns cost nothing extra.

Never write ? for a value you do not have. Write $_ instead, or say what kind of
unknown it is: What(Multiply($_, $_)), not What(Multiply(?, ?)).`;

const EXAMPLES = `EXAMPLES

"What is 5 times three?"
What(Multiply(5, Number("three")))

"what is chess?"
What(Chess())

"what is double 21?"                  (a word that is not a number is its own Concept)
What(Double(21))

"what do we need to finish this?"
Need(We(), What())

"who ate what at the party?"
Ate(Who(), What(), At(Party()))

"uhmm soooo what is it?"        (they are pointing back at the last answer)
Fuzzy("uhmm")
Fuzzy("soooo")
What(Ref("it"))

"is that bigger than the other one?"
Whether(GreaterThan(Ref("that"), Ref("the other one")))

"how many r's are in strawberry?"
HowMany(Count(String("r"), String("strawberry")))

"is 10 greater than 3?"
Whether(GreaterThan(10, 3))

"what is the day after tomorrow?"     (compose; do not reach for arithmetic)
What(DayAfter(Tomorrow()))

"what time is it?"                    (the clock, not the calendar)
What(Time())

"and if we add 5 hours?"              (clock arithmetic, not numeric addition)
What(ShiftHours(Ref("it"), 5))

"what was it an hour ago?"                (one, so the named Concept fits)
What(HourBefore(Ref("it")))

"what time was it 3 hours ago?"           (a count, so shift by it; backwards is negative)
What(ShiftHours(Time(), -3))

"in 12 hour format?"                  (a follow-up: point back, do not re-name)
What(Format(Ref("it"), "12 hour"))

"what was the date two days ago?"
What(ShiftDays(Today(), -2))

"i went to virginya to visit my mom. it was crazy."
Fact(Visited(Me(), Misspelling("virginya", Virginia())))
Fact(Purpose(Visit(), Mother(Me())))
Aside("it was crazy.")

"get the size, sorry the length, of the files i sent, not the first one, the second, and total them and say if its bigger than before"
$measure = Correction(Field("size"), Field("length"))
$files = Qualify(Ref("the files i sent"), Not(Ordinal(1)), Ordinal(2))
$total = Sum(Property($files, $measure))
Do(Tell(Me(), Whether(GreaterThan($total, Ref("before")))))`;

const OUT = `Output only those lines. No prose, no markdown, no code fence, no numbering, no blank lines.`;

/**
 * The vocabulary is generated from the graph, so the prompt cannot drift from what the
 * network actually knows.
 *
 * Parameter names are deliberately omitted: `Tell(to, content)` measurably taught the
 * model to emit `Tell(to, content)` literally, at a cost of sixteen points of fidelity.
 * Argument order is taught by the EXAMPLES instead, using real values, which carries the
 * same information without offering a template to copy.
 */
const STRUCTURAL = /^(Code|Rest|CellRef|Timestamp|True|False)$/;

/** Required in every question by the rules above, so never droppable from the list. */
const INTERROGATIVES = [
  "What", "Who", "When", "Where", "Why", "How", "HowMany", "WhichOf", "Whether",
];

/**
 * What the Ears is shown, when the graph no longer fits.
 *
 * It used to be the first N identities in alphabetical order, which was fine at 150
 * Concepts and silently wrong at 572: the list ran A to "Requirement" and everything after
 * it vanished. `Time`, `Today`, `ShiftHours`, `Sequence` and `Whether` were all invisible
 * to the parser — training the graph had broken the parser's view of it, and alphabetically.
 *
 * Chosen by usefulness instead, in four bands:
 *
 *  0. The interrogatives. Rule 1 of the prompt requires one in every question, so a
 *     vocabulary that can drop them contradicts the instructions it sits beside.
 *  1. Concepts that REALIZE something. Naming one of these is the difference between an
 *     answer and a residual, so they are never crowded out.
 *  2. Concepts the message itself points at, by word. `Greeting` matters when someone says
 *     hello and never otherwise.
 *  3. The rest, alphabetically, so the prompt stays stable between turns and the model is
 *     not learning a new vocabulary every message.
 */
export function vocabulary(store: ConceptStore, limit = 400, message = ""): string {
  const all = store.all().filter((u) => !STRUCTURAL.test(u.identity));

  const chosen: string[] = [];
  const taken = new Set<string>();
  const take = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (chosen.length >= limit || taken.has(id)) continue;
      taken.add(id);
      chosen.push(id);
    }
  };

  const byName = (a: { identity: string }, b: { identity: string }) =>
    a.identity.localeCompare(b.identity);

  take([...INTERROGATIVES].filter((id) => store.has(id)));
  take(all.filter((u) => u.realizations.length).sort(byName).map((u) => u.identity));

  const words = message.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (words.length) {
    take(
      all
        .filter((u) => words.some((w) => u.identity.toLowerCase().includes(w)))
        .sort(byName)
        .map((u) => u.identity),
    );
  }

  take(all.sort(byName).map((u) => u.identity));

  const shown = [...chosen].sort((a, b) => a.localeCompare(b));
  return `VOCABULARY — these exist. Invent new CapitalizedNames freely when nothing fits.\n${shown
    .map((id) => `${id}(...)`)
    .join("  ")}`;
}

/**
 * Recent turns, so a back-reference has something to point at. The parser is not asked to
 * resolve them — only to notice that a reference is being made and mark it (ir-spec
 * Part 8.2). Resolution happens later, against memory.
 */
export function recent(history: readonly { message: string; result: string }[], limit = 4): string {
  if (!history.length) return "";
  const shown = history.slice(-limit);
  return `EARLIER IN THIS CONVERSATION — the user may refer back to any of it.

A word that POINTS at something already said is not a Concept. Write it as
Ref("the words they used") and let memory resolve it. This applies to it, that, this,
them, those, the answer, the result, the second one, before, last time.
  "what is it?"        -> What(Ref("it"))          NOT What(Concept()) and NOT What(It())
  "is that bigger?"    -> Whether(Bigger(Ref("that")))

${shown.map((t) => `they said: ${t.message}\nthe answer was: ${t.result}`).join("\n\n")}`;
}

export function earsPrompt(
  store: ConceptStore,
  history: readonly { message: string; result: string }[] = [],
  message = "",
): string {
  return [FORM, MARK, RULES, QUESTIONS, vocabulary(store, 400, message), EXAMPLES, recent(history), OUT]
    .filter(Boolean)
    .join("\n\n");
}
