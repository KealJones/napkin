# Frames: reading by senses and holes

**Status (2026-10-15): superseded in part.** The fixed readers described here (computations,
facts, statements, reports, …) are off the chat path. Every message is read by one reader that
composes words by their holes (`src/frame/compose.ts`, holes as graph facts in
`packs/reading.ncon`), with the context lookup (`src/frame/context.ts`) for holes the words
leave open. The senses table below is still how a word's senses are found. Plan and progress:
`tasks/todo.md`, "One reader".

Status (2026-10-12): built beside `Hear()` for arithmetic, claims, holes and fact questions
(`src/frame/`). Frames read first; a message frames cannot account for word by word goes to
`Hear()` as before. `napkin --hear rules` turns frames off. Measured with
`node scripts/compare-hearing.mjs` on `eval/frames/cases.json`.

## The idea

The ears do not compose. A message is a row of words, and each word brings its senses:

| Sense | Read from the graph | Holes |
|---|---|---|
| value | a number, or a number word through `Number` | none |
| op | a realization that runs on values (not `Lossy`, not `Effectful`, arguments evaluated), one or two plain-variable holes, typed, or untyped when it works something out (a `Program`, or a body composed of other Concepts); a helper word only with typed holes | its holes; `Binds` says how tightly |
| entity | the store holds facts of it, either way round | none |
| relation | used as a fact's predicate (not only in a context); found by its name or what it is `Called`, each word and its base forms; read backwards by what it is `InverseCalled` | the thing it is a fact of, and the value |
| kind | things are `IsA` it; found the same ways | keeps answers of that kind |
| question | `IsA(Interrogative())`; `Asks(...)` says what it wants | the hole a fact leaves open |
| pointer | `IsA(Pointing())` | the last answer the graph holds facts of |
| glue | `Helper`, `Determiner`, `Preposition`, `Conjunction`; `MarksFirst` swaps order | none |

A word typed wrong also has the senses of the words it may have meant (a slip, two words typed as
one, one typed as two, a reading the user taught), each at a cost.

## How a reading is chosen

- Values are a number, a number word, or a list of them parted by commas or "and" ("3, 5 and 10").
  A one-hole operation takes the value after it, past an "of" ("square root of 144", "average of
  3, 5 and 10"); a result still holding an operation it was built from did not run, and is no reading.
  A doing asked for ("sort 3, 1, 2", the word a verb said first) gives what it comes to; a thing named
  that works out to a value ("average of ...") is answered.
- Values are taken by the operations beside them, in any span (a chart). Which operation takes its
  neighbour first is the graph's `Binds`, not a grammar. Brackets close a group.
- A fact question pairs a thing with one of the relation senses of a word near it, in either
  direction, and every other word must say something of the answer: a part of it ("year"), its kind
  ("movies"), or another word for the same relation. A word left over rules the reading out.
- Every reading of the whole row is scored together; one that accounts for every word that says
  something is used only when no reading meaning something else fits nearly as well.

## Statements

A word that says what something is ("is", "was", "am": a `Helper` read as a copula) with what it is
said of before it and what is said after, every other word accounted for:

| Said | Kept | Read back by |
|---|---|---|
| "my name is Sam", "tom's age is 30" | `Me Name(Sam())`, `Tom Age(30)`: whose (`Possessive` that `Refers`, or a name's 's) and which | "what is my name", "what is tom's age" |
| "jaws is a film" | `Jaws IsA(Film())` | "is jaws a film" |
| "tom is taller than ann" | `Tom TallerThan(Ann())`: the tagger's `Comparative`, then "than" | "who is taller than ann", "is tom taller than ann" |
| "the capital of france is paris" | `France Capital(Paris())`: which, "of", whose | "what is the capital of france" |
| "my birthday is june 3rd", "... the 12th of may" | `Me Birthday(Date(month=6, day=3))`: a month beside a day (and maybe a year) is a date | "when is my birthday" ("June 3") |
| "i live in phoenix", "i ate an apple", "my sister lives in denver" | `Me LiveIn(Phoenix())`, `Me Eat(Apple())`, `Sister LiveIn(Denver())`: a thing (or whose), the tagger's verb, maybe the word that marks what it takes, a thing or value; named by the verb's base form and that word; the newest replaces the old | "where do i live", "what did i eat", "where does my sister live" |
| "remember that ..." | the statement, by a word that `Takes(Statement())` | as above |

"who is lily" describes what is known of a thing (`Describes`, worded by the graph: "Lily is a
doctor, older than you"). A word that `SaysSame` ("equal", "equals", "same") reads as "is" in a
claim, with a helper word beside it ("equal to", "the same as").

What is said again of whose and which retracts what was said of it before (`Retracts`), so "my name
is Bob" replaces Sam and Sam stays as history. A statement is never read from a respelled real word
("i ate an apple" is not "i are an apple"). A question's answer must be of the shape its question
word asks for (`AnsweredBy`: someone or a place is a thing named, an amount a number, a time a
date), so "who is my favorite number" is not answered 7.

## Frames inside frames

- A word that reports (`Takes(Statement())` and `Reports()`: tell, say, think) takes the statement
  after it as its hole, past who it was said to and a "that"; every place the statement could start
  is read, and the readings decide. The statement is read as its own frame, with pointing words
  inside it meaning the one who said it ("he told me his name is Bob"). A claim in it is checked
  ("I told them that 2 plus two was 5": "It's actually 4, not 5."); anything else is noted as
  reported and kept as nothing true.
- A message no reading accounts for whole is split at an "and" when each part reads whole on its
  own, the second read after the first, so a pointing word in it is the first's answer ("who
  directed jaws and what year was he born"). "add 3 and 4" reads whole, so is not split.

## Learning while reading

With learning on, a question no reading accounts for looks up what it is missing, then is read
again, all in the same turn (`frames(..., { lookup })`, Wikidata through `groundInWikidata`):

1. Things it names that the graph knows only by name (tied to an item, or the object of a fact,
   with no facts of their own): "he", after Jaws was learned, is Steven Spielberg, tied to his item
   by Jaws's import, so his own facts are fetched without a search.
2. Words the graph holds nothing of, nouns only (the tagger says which): a run of them as one name
   first ("steven spielberg"), then each word.

It stops as soon as a reading accounts for every word, and after three lookups. What is found is
kept and sourced like anything else learned (the import's `Imported` stamp), so the next question
about it is answered from the graph with nothing looked up. A property's aliases ("born", "directed
by") are kept as what its relation is `Called`, which is what gives "born" its senses.

## Relation words

A relation's words are its own name and its Wikidata aliases (`Called`), indexed by every base form
(`bases`: "directed" is direct, "movies" movie), so "what did he direct" finds Director through its
alias "directed by", not by sharing letters. Where a Wikidata property names an inverse (P1696:
father's is child), the inverse's label and aliases are kept on the relation as `InverseCalled`,
and a word for them reads the relation from its other end: "who is boris's child" is whoever holds
Father(Boris). A word that only helps say the others ("did") takes no relation sense by its base
form. An alias hearing cannot take as one thing ("directed by") is kept as the name its words make.

## Asking, and learning from the answer

Every reading carries its choices as named features: what kind of reading it is (`read:fact`), which
sense each word took (`sense:born=DateOfBirth`), which operation a word stood for
(`op:times=Multiply`), which slip was read as which word (`spell:pluss=plus`). Feedback is kept on
`Frames` as stamps, `Confirmed(feature)` and `Corrected(feature)`, and a feature's weight is
0.5 × (ln(1 + confirmed) − ln(1 + corrected)), added to every reading made with it.

- Readings that mean different things and score within 0.5 of each other, none of them telling the
  graph anything, are asked about: "Do you mean Acme (ran company) or Boston (ran marathon)?". The
  reply's words pick one ("the company"); its features are confirmed and the others' corrected, so
  the same question is answered without asking the next time.
- After a message the frames read (its choices are kept as `LastRead`), a reply whose first word is
  an `Agreement` or `Thanking` ("yes", "ok", "thanks") confirms them; a `Refusal` ("no", "nope")
  corrects them.

## Why, shown

Every frames reading says why, in plain words (`explain`): each word read as another, the sense a
word took and what else it could have been, how the other words were used ("year" named a part
only date of birth has; "movies" kept only films), what each operation or relation took into its
holes, what feedback weighed for it, and the next best reading with both scores. It is `why` on the
turn, shown by `napkin` and in the studio as "Why this reading" beside the input expression. A
conversation reloaded right after a turn keeps the live panel (its trace and why), which the stored
turn does not carry.

## Where it got stuck

When no reading accounts for every word and the answer is a "don't know" (from the rules hearing
too), the reply says where reading got stuck (`Stuck`, worded in packs/frames.ncon): the reading of
the whole message (its slips read) that came nearest, and what it could not fit ("I read 10 times
10, but couldn't fit "equal" and "100" into it"), or could not take as one thing in a statement
("couldn't tell what "the capital of france" is as one thing"), and the words it has nothing for. The
studio shows it as "Where it got stuck".

## What it learns

- The sense taken for a word with more than one is kept on the relation with the words beside it:
  `DateOfBirth` holds `ReadBeside("born", "year")`, a stamp each time. It counts for that sense the
  next time those words are beside it.
- A slip read as another word is kept as `WrittenAs`, as the reading search does.

## Not yet

- A doing whose object is not one plain thing or value ("I bought a florp for my kid", "i went to a
  wat in thailand"), talk to the one spoken to ("i love you"), commands beyond arithmetic and
  "remember", multi-sentence messages: all still `Hear()`.
- "No": "is ann taller than tom" stays unknown until a relation can say it runs one way.
- The costs and bonuses inside each reading are still set by hand; feedback weighs on top of them.
- Statements about something not yet known are not looked up here (only questions are).
