/**
 * The Ears contract (ir-spec Part 9), in the shape that measured best.
 *
 * Read `AGENTS.md` in this directory before changing anything here, and measure every
 * change with `pnpm eval:ears`. The prompt teaches form and marking only. It never
 * teaches the graph's names, translations for particular phrasings, or domain rules: the
 * graph owns those, through synonyms, learning and the re-parse loop.
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
Write plain "text" and plain numbers directly. A digit stays a digit: 10 is 10. A number
spelled as a word is Number("three"). Number(...) is only ever a number.

Use the user's own words, and write what was said, never what it comes to. Do not work
anything out: no arithmetic, no converting, no steps the message did not state.
Keep every word: one that carries nothing for the request ("ok so", "btw", "lol") goes in
MarkAside("verbatim").`;

const ORDER = `The first thing said is the head, and the rest follows inside it in the order said.
A claim about a thing starts with the thing: "i'm allergic to peanuts" is
  Me(AllergicTo(Peanuts())), and "the old car broke" is Old(Car(Broke())).
An order starts with its verb: "close the door" is Close(Door()).
A number or a Ref is never a head: "5 times 3" is Times(5, 3).
Words that describe or own a thing wrap it: "my old car" is My(Old(Car())).
Things said side by side are side by side; several go in List(...).
A few words that always go together become one name: "is a" is IsA, "what's" is WhatIs,
"don't" is DoNot. A phrase whose words each mean themselves is never folded into one name.`;

const MARK = `Markers always start with Mark, so they never look like the user's own words.
Mark every retraction of the user's own words with MarkCorrection(old, new).
Mark every "not X" with Not(X), and every "no X" with No(X).
Mark every vague word with MarkFuzzy("the vague words", what they blur):
  "the scores or whatever" is MarkFuzzy("or whatever", Scores()).
Mark every capitalised word with MarkEmphasis("the word", what it stresses):
  "ALWAYS run it" is Run(Ref("it"), MarkEmphasis("ALWAYS", Always())).
Mark a misspelled name with MarkMisspelling("as written", Intended()). Only a name of a
thing. Never a grammar slip such as todays.
A word that points at something is Ref("the words used").
  Pointing outside the message: Ref("it"), Ref("those things"), Ref("the second one").
  Pointing at something earlier in the same message: bind that thing once with $name, and
  point at the binding, Ref("it", $name).
An amount is its unit around its number: "3 hours" is Hours(3), "5%" is Percent(5).
A clock time is written as said: "7am" is Time(7, Am()), "3pm" is Time(3, Pm()).
A string is only for words not meant to be understood: a link, a path, a name, a quote.
Keep layout: Heading(2, "text") for a "## text" heading, Item(1, ...) for a numbered entry,
Item(...) for a bullet, InlineCode("text") for \`text\`, Block("lang", "verbatim") for a
fenced block.
Write a line for every distinct thing the user said. Do not drop any.`;

const RULES = `TWO RULES YOU MUST NOT BREAK

1. If the message asks a question, the output MUST start that line with the question word
   or the helper word that asks it: What, Who, When, Where, Why, How, HowMany, HowMuch,
   WhichOf, or Is, Can, Could, Did, Does and the like.
   "What is 5 times three?" is What(Times(5, Number("three"))), and Times(5, Number("three"))
   is WRONG: it states a fact instead of asking.

2. Every name MUST start with a capital letter and MUST be followed by parentheses.
   Write This(), not this. Write Tests(), not tests. Write ChangedFiles(), not changed_files.
   A bare lowercase word is never a value.`;

const QUESTIONS = `A question starts with its question word, and the rest follows in the order said:
"who wrote this" is Who(Wrote(Ref("this"))).
A helper word right after the question word joins it: "who did hamlet kill" is
WhoDid(Hamlet(), Kill()), and "where is my phone" is WhereIs(My(Phone())).
A yes/no question starts with its helper word, as said: "is chess a sport" is
Is(Chess(), Sport()), and "could you close the door" is Could(You(), Close(Door())).
Put a question word only where the message asks something. A request or a statement asks
nothing, even when it mentions a person, a time or a thing.

Never write ? for a value you do not have. Write $_ instead.

Keep who the message is about. "how are you" is about you.`;

const EXAMPLES = `EXAMPLES

"who ate what at the party?"
Who(Ate(What(), At(Party())))

"what do we need to finish this?"
WhatDo(We(), Need(Finish(Ref("this"))))

"how was the movie?"
HowWas(Movie())

"could you close the window please"
Could(You(), Please(Close(Window())))

"will it still be raining in 3 hours?"
Will(It(Still(Be(Raining(In(Hours(3)))))))

"write a short poem about the sea for my mom"
Write(Poem(Short(), About(Sea()), For(My(Mom()))))

"we moved to sacremento last year. what a mess lol"
We(Moved(To(MarkMisspelling("sacremento", Sacramento())), Last(Year())))
MarkAside("what a mess lol")

"check the prices, sorry the totals or whatever, on the orders i sent, not the first one, the second, and add them up and tell me if its more than last week"
$field = MarkCorrection(Field("prices"), MarkFuzzy("or whatever", Field("totals")))
$orders = Qualify(Ref("the orders i sent"), Not(Ordinal(1)), Ordinal(2))
$sum = AddUp(Property(Ref("them", $orders), $field))
Tell(Me(), If(Is(Ref("its", $sum), MoreThan(Ref("last week")))))`;

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
 *  1. Concepts the message itself points at, by word. `Greeting` matters when someone says
 *     hello and never otherwise. These come before band 2 because a seeded domain (chess
 *     alone adds ~50 realizing helpers) can fill the whole budget alphabetically and push
 *     out `Time` for "what time is it".
 *  2. Concepts that REALIZE something. Naming one of these is the difference between an
 *     answer and a residual.
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
  const words = message.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (words.length) {
    take(
      all
        .filter((u) => words.some((w) => u.identity.toLowerCase().includes(w)))
        .sort(byName)
        .map((u) => u.identity),
    );
  }
  take(all.filter((u) => u.realizations.length).sort(byName).map((u) => u.identity));

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
export function recent(
  history: readonly { message: string; result: string; spoken?: string }[],
  limit = 4,
): string {
  if (!history.length) return "";
  const shown = history.slice(-limit);
  return `EARLIER IN THIS CONVERSATION — the user may refer back to any of it.

This is history, not an example. Never copy an earlier answer as your reading of a new
message.

A word that POINTS at something already said is not a Concept. Write it as
Ref("the words they used") and let memory resolve it. This applies to it, that, this,
them, those, the answer, the result, the second one, before, last time.
  "what is it?"        -> What(Ref("it"))          NOT What(Concept()) and NOT What(It())
  "is that bigger?"    -> Whether(Bigger(Ref("that")))

${shown.map((t) => `they said: ${t.message}\nthe answer was: ${t.spoken ?? t.result}`).join("\n\n")}`;
}

export function earsPrompt(
  store: ConceptStore,
  history: readonly { message: string; result: string }[] = [],
  message = "",
  showVocabulary = false,
): string {
  return [
    FORM,
    ORDER,
    MARK,
    RULES,
    QUESTIONS,
    showVocabulary ? vocabulary(store, 400, message) : "",
    EXAMPLES,
    recent(history),
    OUT,
  ]
    .filter(Boolean)
    .join("\n\n");
}
