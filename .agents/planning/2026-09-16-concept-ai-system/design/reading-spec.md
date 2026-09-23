# Reading Specification

Status: draft 1, 2026-09-23. Derived from the gold review (`tasks/gold-review.md`) and the

**Amendment, 2026-09-23, after draft 1.** Markers are named `Mark*`: `MarkCorrection`,
`MarkMisspelling`, `MarkFuzzy`, `MarkEmphasis`, `MarkAside`. Wherever this document writes
`Correction`, `Misspelling`, `Fuzzy`, `Emphasis` or `Aside` as a marker, read the `Mark`
form. Reason: describing words wrap one thing, which is the marker shape, so "my fuzzy
bear" as `Fuzzy(Bear())` would have been projected as vagueness. A name rule is simpler for
the model than a shape rule. `MarkFuzzy` and `MarkEmphasis` carry their trigger words first
(`MarkFuzzy("or whatever", x)`, `MarkEmphasis("NOT", x)`), which also keeps those words,
per "nothing is dropped". `Ref` keeps its name. Decision record: `tasks/gold-review.md`.
session behind it (`research/sessions/2026-09-22-spec-review-and-ears.md`). Nothing here
is built beyond what `lift.ts` and `mood.ts` already do.

A **reading** is the Concept expression that stands for one message: what the Ears writes,
plus what the mechanical passes add after it. This document says what a reading looks
like and why.

**Supersedes**, where they differ:

- `ir-spec.md` Part 9.7 (worked examples), entirely.
- `ir-spec.md` Part 7's marker table and Part 8.2's one-argument `Ref`, which this extends.
- `seed-concepts.md` Part 10 (request vocabulary), entirely: the rule that an interrogative
  goes where the unknown is, `Whether`, and `Fact` and `Do` as frames.
- `seed-concepts.md` Part 9's marker table, which gains `Unclear`, `InlineCode`, `Heading`,
  `Item` and `Mood`.

**Leaves standing:** `ir-spec.md` Parts 1 to 6 (grammar, primitives, variables, `Sequence`,
`List`), 7.1 (markers project or stay), 8.1 (invent, say nothing), 8.3 (the re-parse loop),
9.1 to 9.6 (lines and lift, positional arguments, depth limit, completeness), and Part 10
(the code IR).

Reference convention as in `ir-spec.md`: a bare `Part N` is this document.

---

## 1. The requirement

Unchanged from `ir-spec.md` Part 1.1. A reading holds **the exact structure and intent of
what was said** and is **realizable**, at once. Residual evaluation is what makes both
possible (`ir-spec.md` Part 2): the reading records, and evaluation projects.

The review sharpened what "exact structure" means. It is not only the words. It is their
**order**, their **tense**, and which words **belong together**. "who killed hamlet" and
"who did hamlet kill" are different questions in different tenses, and any reading that
writes them alike has lost what was said.

---

## 2. Principles

Eight principles. Each decision in the review is a consequence of one or more of them.

| Principle | Generates |
|---|---|
| P1 Said order | interrogative first, subject first, verb first for orders, possessives and describing words wrap, arguments in order |
| P2 A head is a name | numbers, strings, variables and `Ref`s never head; their sentences go verb first |
| P3 Head position says data or call | subject first for claims and questions, verb first for orders and computation, inverses |
| P4 One meaning, one name | `WhoDid`, `WhatIs`, `IsA`, `DoNot`, `HeyThere`, `CoverLetter`; never a compositional phrase |
| P5 Form, not use | no `Whether`, no `Greeting`, no `Do` for politeness; mood added mechanically |
| P6 Keep everything, mark what the message did | `Aside`, `Correction`, `Emphasis`, `Checking`, `No` stays `No` |
| P7 Understood things are structure | `Time(7, Am())`, `Hours(3)`, strings only for the verbatim |
| P8 Point with `Ref`, hold with `$` | `Ref("words")` outside, `Ref("words", $x)` inside |

### P1. Said order: the first thing said is the head

**What follows a word goes inside it, in the order said.** Coordinate things are siblings.

| Message | Reading |
|---|---|
| who killed hamlet | `Who(Killed(Hamlet()))` |
| i'm allergic to peanuts | `Me(AllergicTo(Peanuts()))` |
| chess is a sport | `Chess(IsA(Sport()))` |
| my dad is a doctor | `My(Dad(IsA(Doctor())))` |
| colorless green ideas sleep furiously | `Colorless(Green(Ideas(Sleep(Furiously()))))` |
| turn off the lights | `Turn(Off(), Lights())` |
| how many angels can dance on the head of a pin | `HowMany(Angels(), Can(Dance(On(Head(Of(Pin()))))))` |

Consequences:

- **Questions put the interrogative first**, because English does. There is no hole in a
  slot. Measured: word order kept rose from 89% to 96% at equal pass rate (`gold-review.md`).
- **Claims put the subject first.** An order has no subject, so its verb is first.
- **A describing word wraps what it describes**, because it is said first. Possessives are
  describing words: `My(Dad(...))`. `Dad(Me())` is retired (P2: a head cannot be a call).
- **Post-modifiers are arguments**, because they are said after: `Sleep(Furiously())`,
  `Checkout(With(Stripe()))`.
- **Coordinate things are siblings:** `Write(CoverLetter(), For(...))`, not
  `Write(CoverLetter(For(...)))`. Several coordinated items go in `List(...)`.
- **Markers are the exception, by design.** They wrap their scope wherever the word was said:
  "grab me the latest numbers please" is `Please(Grab(...))`. A marker is about the line,
  not a word in it (P6).

Why: the order is part of what was said, and the model keeps it better when asked to. It
also makes a claim read the way it is stored: `Greg(CoworkerOf(Me()))` in a message is
`Greg_1  CoworkerOf(Keal_1())` in memory (`memory-spec.md` Part 3.2).

### P2. A head is a name

A head is a `CapitalizedName` that stands for a thing or an act by itself. A number, a
string, a variable, a `Ref` and a coordination cannot be heads: the grammar forbids the
first three (`ir-spec.md` Part 3), and the last two do not name what the claim is about.

When the subject cannot head, the verb does:

| Message | Reading | Why verb first |
|---|---|---|
| what is 5 times 3 | `What(Times(5, 3))` | a number |
| it needs a product page, a cart... | `Needs(Ref("it", $app), List(...))` | a `Ref` |
| the heater is broken again | `Is($heater, Broken(), Again())` | a variable |
| greg and emmy are coworkers | `Are(List(Greg(), Emmy()), Coworkers())` | a coordination (Part 6, R8) |

Pronouns that are Concepts (`Me`, `You`, `We`, `They`, dummy `It`) are names, so they head.

### P3. Head position says data or call

This is the principle that makes P1 realizable.

- **A thing at the head means the line is a relation:** a claim (`Hamlet(Killed(Polonius()))`)
  or a query about one (`Who(Killed(Hamlet()))`, `Is(Chess(), Sport())`). A relation is
  asserted or looked up, never evaluated (`concept-spec.md` Part 5.1).
- **A verb at the head means the line is a call:** an order (`Close(Door())`) or a
  computation over values (`Times(5, 3)`). It is evaluated.

So `s(R(x))` and `R(s, x)` are **the same claim** in two shapes, and realization accepts
both: "chess is a sport" gives `Chess(IsA(Sport()))`, "7 is a prime" gives `IsA(7, Prime())`
by P2, and both are the relation `IsA` on a subject.

Questions follow directly. `Who(R(x))` means "find the units holding `R(x)`": one lookup on
the two-way relation index (`concept-spec.md` Part 5.1.1). An object question uses the
inverse, so both directions are the same lookup:

```
who killed hamlet      Who(Killed(Hamlet()))         find X holding Killed(Hamlet())
who did hamlet kill    WhoDid(Hamlet(), Kill())      realizes to Who(KilledBy(Hamlet()))
```

The inverse name is mechanical: the relation's past-tense name plus `By` (`KilledBy`,
`ToldBy`, `WroteBy`). `Describe` gives readable text. Whether a relation has an inverse at
all, or is its own (`FriendOf` is symmetric), is still asked of the Teacher once per
relation (`concept-spec.md` Part 5.3).

Why: before this, subject first had a cost. Realization is looked up by head, and
`Me(...)` has no realization for allergies. P3 removes the cost: a subject-first line is
never looked up by its head. It is read as data by the mood realization (Part 5.2).

### P4. One meaning, one name

**Adjacent words that form one grammatical unit and carry one meaning fuse into one head.**
Words whose parts mean themselves never fuse.

| Fuses | Because | Does not fuse |
|---|---|---|
| "who did" `WhoDid` | one question shape | "who ... hamlet" |
| "what's" `WhatIs` | contraction | |
| "is a" `IsA` (a category claim) | one relation | "why is a raven": "a" belongs to "raven" |
| "don't" `DoNot` | contraction | |
| "have been" `HaveBeen` | adjacent auxiliaries | "will i have": `Will(Me(), Have(...))` |
| "hey there", "thank you" | parts do not mean themselves | "a typescript function" |
| "cover letter", "pull request" | a lexicalized compound | "jam business" (Part 7, T6) |
| "allergic to", "coworker of" | a relation with its governed preposition | "look at" in an order (Part 7, T7) |

A fused interrogative is one of two things, and the difference matters:

- **A synonym** when the helper adds nothing: `WhatIs SynonymOf What`. Plain `SynonymOf`.
- **Its own Concept** when the helper changes the question's shape: `WhoDid`, `WhatDid`
  are object questions. Selected by identity, so they never compete with `Who(...)`
  patterns (Part 5.6).

Why: fused and nested scored the same on the Ears side (67% each, 96% word order), and
fused realizes by identity where nested would need a deep pattern on `Who` ordered only by
declaration order.

### P5. Form, not use

The reading records the grammar of what was said. What it is used for is the graph's
business.

- **No wrappers for use.** No `Whether`, no `Greeting`, no `Do` for politeness. "hey there!"
  is `Emphasis(HeyThere())`; the graph holds `HeyThere IsA Greeting`.
- **A yes/no question is marked by its fronted auxiliary**, the way a wh-question is marked
  by its question word: `Could(You(), Help(...))`, `Is(Chess(), Sport())`, `Did(Tests(), Pass())`.
- **An embedded yes/no question keeps its own word:** "tell me if it's safe" is
  `Tell(Me(), If(...))`. `Whether` appears only when the user said "whether".
- **Mood is added after the Ears**, mechanically, as `Mood(kind, line)` (Part 4). The Ears
  never writes it.
- **"could you X" is a question.** Reading it as a request is one realization in the graph,
  gated on the mood (Part 5.5).

Why: every use-wrapper was a decision the small model made badly and the graph can make
from context. `Do` also collided with the English verb ("do the same thing").

### P6. Keep everything, mark what the message did

Nothing is dropped. `ir-spec.md` Part 7 stands, with these settled:

| Marker | Rule |
|---|---|
| `Aside("verbatim")` | filler, "btw", "ok so": kept, never structured |
| `Correction(old, new)` | **only** for retracting one's own words. Rejecting the system's pick is `Not(Ref("that one"))` |
| `Emphasis(x)` | wraps the smallest head holding the stressed word: `Please(Emphasis(DoNot(Push(...))))`. Which half of a fused word was stressed is lost, acceptably |
| `Misspelling("wrote", Meant())` | content words only (`ir-spec.md` Part 7.3) |
| `Fuzzy(x)` | "like", "or so", "or whatever" |
| `Unclear("verbatim")` | nothing readable: a keyboard mash |
| `No(x)` | "no" stays `No`; `Not` is for "not" |

Surface signals are structure too, added mechanically (Part 3): a trailing "!" or "??" gives
`Emphasis`, a bare "?" on statement order gives `Checking`.

**Articles are absorbed, not kept.** "the", "a" and "an" survive only where they fuse
(`IsA`) or where they are inside a `Ref`'s verbatim words. This is the one standing
exception to "nothing is dropped", and it was never written down (Part 6, R12).

### P7. Understood things are structure

A string is opaque: something would have to parse it again before it could run. So a
string holds **only what is not meant to be understood**: URLs, paths, identifiers,
commands, quotations, code.

- **Amounts** are unit around number: `Hours(3)`, `Dollars(1000)`, `Percent(5)`.
- **Points** are readings: `Time(7, Am())`, `Time(19, 0)` (no `Am`/`Pm` means 24-hour),
  `Date(2024, 10, 15)`. `Time()` alone is now.
- **Numbers stay as written:** `5` stays a digit, "five" is `Number("five")`
  (`ir-spec.md` Part 3.1). The producer never normalizes or computes.
- **Code:** backticks are `InlineCode("...")`, fences are `Block("lang", "...")`. A
  TypeScript block is imported into Concepts after the Ears (Part 3); other languages stay
  verbatim until they have an importer.
- **Headings** keep their text verbatim, `Heading(2, "Task")`, as titles (Part 7, T9).

### P8. Point with `Ref`, hold with `$`

- A pointing word whose referent is **outside** the message: `Ref("the other file")`,
  resolved against memory (`runtime/references.ts`).
- A pointing word whose referent is **inside** it: bind the thing once, then
  `Ref("it", $app)`. The word survives and the Ears' reading of it is visible. `lift.ts`
  names the second argument `resolvedTo`.
- A dummy "it" ("it rains") is `It()`, a name, and can head.
- Bind only when reused, corrected, or to stay inside the depth limit (`ir-spec.md` Part 5.4).
- A `Ref` is never a head (P2).
- Phrases like "the second one" or "the usual" stay verbatim inside the `Ref`. Reading the
  ordinal out of them is memory's job, in code.

### Layout

Layout is kept as layout: `Heading(level, "text")`, `Item(n, x)` numbered or `Item(x)`
bulleted, one per line, `Block(lang, text)`, `InlineCode(text)`. A wrapping
`UnorderedList(...)` is rejected: one slip would lose the whole list, where one line per item
loses one item (`ir-spec.md` Part 9.2).

---

## 3. Division of labour

**Anything deterministic comes off the model.** The Ears does only what needs
understanding. Everything that can be read off the text or the reading mechanically is a
pass, and everything that needs the graph is a realization.

| Layer | Does | Where |
|---|---|---|
| **Ears** | names in the user's words; said order; nesting and siblings; fusion; which pointing words are `Ref`s and what inner ones point at; bindings; `Correction`, `Misspelling`, `Fuzzy`, stress `Emphasis`, `Aside`, `Unclear`, `Please` | `prompt.ts` |
| **Lift** | lines to `Sequence`, `$x =` to `Let`, `Ref("w", $x)` to `resolvedTo=` | `lift.ts` |
| **Repairs** | parens, single quotes, stray `?`, truncation salvage, `Number` slips | `lift.ts` |
| **Mood** | `Mood(kind, line)`; `Checking` from a bare "?"; `Emphasis` from "!" and "??" | `mood.ts` |
| **Code import** | `Block("typescript", ...)` to Concepts | `code/import.ts` |
| **Graph** | request reading, inverses, tense, synonyms, fused interrogatives, claim storage, `IsA` confirmation, `Ref` resolution, layout projection | realizations |

Candidates to move off the model next, each deterministic:

1. **Verbatim spans.** Backticks, fences, URLs and quoted strings can be cut out before the
   Ears and pre-bound (`$c1 = InlineCode("pnpm test")`), so the model never copies verbatim
   text. Copying is where it slips.
2. **Layout.** `#` levels and list numbers are markdown. A pass can write `Heading` and `Item`
   and hand the Ears only the content.
3. **Fusion of closed-class words.** "don't", "what's", "who did" come from a fixed list. A
   check can flag a reading that failed to fuse them, without the prompt teaching each.

---

## 4. Mood

### 4.1 The frame

One frame Concept, `Mood(kind, line)`, added by `mood.ts`, never the Ears.

| Kind | When | Example |
|---|---|---|
| `Imperative()` | an order: verb first, no subject | `Mood(Imperative(), Close(Door()))` |
| `Declarative()` | a claim: statement order | `Mood(Declarative(), Me(AllergicTo(Peanuts())))` |
| `Interrogative()` | a question word or a fronted auxiliary | `Mood(Interrogative(), Who(Killed(Hamlet())))` |
| `Checking()` | statement order marked only by "?" or a tag | `Mood(Checking(), Chess(IsA(Sport())))` |

The name says what the Concept does, in one two-argument shape. "it is imperative you watch this" is
`ItIs(Imperative(You(), Watch(Ref("this"))))`, the user's word nested in a sentence, and
nothing framed it.

### 4.2 Placement

Outermost to innermost: layout, then `Mood`, then line markers (`Please`, `Emphasis`), then
content.

```
Item(1, Mood(Imperative(), Clone(Repo())))
Mood(Imperative(), Please(Emphasis(DoNot(Push(To(Main()))))))
Mood(Interrogative(), Emphasis(What(Else(), Should(Me(Try())))))
```

No mood on: a binding (`$up = Is(Server(), Up())`), which takes the mood of the line that
uses it; a fragment or interjection (`Banana()`, `E4()`, `Emphasis(HeyThere())`,
`Emphasis(Thanks())`); `Aside`, `Heading`, `Unclear`.

### 4.3 Detection

`mood.ts` reads the sentence surface today with a word list, and it misreads adjective-first
statements ("colorless green ideas" came out as an order). Under P1 the **reading itself**
carries most of the mood:

| Reading's head | Mood |
|---|---|
| an interrogative, or a fused one | `Interrogative` |
| an auxiliary (`Is`, `Can`, `Did`) with the subject as first argument | `Interrogative`, unless the sentence was in statement order (P2's verb-first claims) |
| a thing, a describing word, or a deictic | `Declarative`, or `Checking` with a bare "?" |
| a verb | `Imperative` |

The surface decides only the one case the shape cannot: an auxiliary-headed line from a
non-name subject ("the heater is broken" vs "is it fixed"), where the sentence's word order
tells them apart. Telling a verb from a thing at the head needs the graph for unknown words
(Part 6, R14).

---

## 5. Realization

### 5.1 Mood is a facet

`Mood(k, line)` evaluates `line` with `k` added to the active context:

```
Mood(Imperative(), Close(Door()))   runs Close(Door())   in Context(Execution(), Imperative())
```

Realizations then select by mood through ordinary context specificity
(`concept-spec.md` Parts 7.2 and 9). Nothing new is needed.

### 5.2 Claims and queries are data

Under `Declarative()`, the mood realization reads a subject-first line as a relation and
hands it to `Believe` (`memory-spec.md` Part 5.4), which decides whether it becomes lasting.
It does not evaluate the line, so `Me(...)` is never looked up for an allergy realization.

Finding the subject: descend through describing words to the first thing whose argument is a
relation or verb. `My(Dad(IsA(Doctor())))` is `IsA(Doctor())` on "my dad", a description,
which lands on an individual when believed (`memory-spec.md` Part 6.2), never on the kind
`Dad`.

**`IsA` from conversation on a bare kind needs confirmation** before it changes selection,
because `IsA` orders realization selection (`seed-concepts.md` Part 1.1). "code is a mess"
waits for the Teacher, research or a repeat. "my code is a mess" does not: it lands on
`Code_1`.

### 5.3 Fused interrogatives, tense and inverses

`WhoDid($s, $v)` realizes in three graph steps:

1. **Tense:** `Did` plus `Kill` is `Killed`, from `Killed PastOf Kill`.
2. **Inverse:** `Killed InverseOf KilledBy`, mechanical by default.
3. **Lookup:** `Who(KilledBy(Hamlet()))`, the same lookup a subject question uses.

One realization on `WhoDid` serves every verb whose tense and inverse the graph knows. Where
it knows neither, the question stays residual and goes to the learner. `Did(Tests(), Pass())`
uses step 1 alone. Building `KilledBy(...)` from a computed name needs a code body
(`api.call`), since no pattern variable binds a head name.

### 5.4 Checking

`Mood(Checking(), x)` looks `x` up as a yes/no question would, then answers as a
confirmation or correction ("yes, it is" / "actually, no"). Under `Describe()` it gives
back the question-marked form it came from ("chess is a sport?").

### 5.5 The request reading

`Can(You(), $x)` (and `Could`, `Would`, `Will`) under `Interrogative()` realizes as `$x`.
"you can close the door" is `You(Can(Close(Door())))` under `Declarative()`: a different
shape and a different facet, so it never triggers.

### 5.6 Layout and markers

`Heading` and `Aside` have no execution realization. `Item(n, x)` projects to `x`; the lift
already makes the lines a `Sequence`. Markers project under `Execution()` and stay under
`Describe()` (`ir-spec.md` Part 7.1).

### 5.7 What the selector needs

| Need | Why | Status |
|---|---|---|
| Pattern specificity for overlapping patterns on one Concept | today they are ordered only by declaration order (`concept-spec.md` Part 9.4). Fused heads sidestep it; nothing else does | gap |
| Typed pattern variables (`$p` is a relation) | to tell a predicate argument from a modifier: `Hamlet(Killed(x))` vs `Code(For(x))`; and to stop a local one-argument realization capturing a claim: `Date($when)` would match `Date(IsA(Thing()))` and win by locality (`concept-spec.md` Part 9.2) | gap |
| A head-name variable | to build `KilledBy(...)` from a computed name. A code body covers it | workaround |
| `PastOf` in the relation vocabulary | step 1 of Part 5.3 | unseeded |
| Mechanical inflection | the past tense of a verb the graph has no `PastOf` for: regular "-ed" plus a fixed irregular list, deterministic | unbuilt |

Part 5.2 is what keeps the second gap from being urgent: claims are read as data under
their mood, not selected by head. It still bites on nested claims.

---

## 6. Implied rules

Rules the decisions imply that nobody wrote down. Confidence says how directly they follow.

**R1. Passive voice is the inverse relation.** "hamlet was killed by laertes" is
`Hamlet(Was(KilledBy(Laertes())))`. The mechanical inverse name *is* the English passive,
so a passive claim is stored under the inverse and answers "who killed hamlet" through
`InverseOf`. Follows from P1, P3 and the inverse naming. High.
Test: "who was hamlet killed by" gives `WhoWas(Hamlet(), KilledBy())`, realizing to
`Who(Killed(Hamlet()))`.

**R2. Tense stays in the verb's name; auxiliaries are their own heads.** `Killed`, `Kills`,
`Rains`, `Dropping` as said; `Will(...)`, `Did(...)`, `HaveBeen(...)` as heads. The graph
links tenses with `PastOf`. A query crosses tense only through that link. From the user's
"kill vs killed" objection and P1. High.
Test: "did hamlet kill polonius" gives `Did(Hamlet(), Kill(Polonius()))`, answered from a
stored `Hamlet(Killed(Polonius()))`.

**R3. A negated fronted auxiliary fuses and leans.** "didn't you finish?" is
`DidNot(You(), Finish())`: fused like `DoNot`, a yes/no question by its fronted auxiliary.
The speaker expects "yes", so it realizes like `Checking` on the positive proposition.
From P4, P5 and the `Checking` rationale. Medium.
Test: "isn't chess a sport" gives `IsNot(Chess(), Sport())`, answered as a confirmation.

**R4. A relative clause is an argument of its noun, and a nested question word is
relative.** "the man who sold the car" is `Man(Who(Sold(Car())))`, like
`Function(That(Parses(Csv())))`. An interrogative asks only as a line's head (or the head
of an embedded question); inside a noun it means "the one holding". This works because a
query's body is matched as data, not evaluated (P3). From P1 and P3. Medium.
Test: "who is the man who sold the car" gives `WhoIs(Man(Who(Sold(Car()))))`, one hole.

**R5. Only the first question word heads; later ones stay in place.** "who ate what" is
`Who(Ate(What()))`, a two-hole query. From P1. Medium.
Test: "which tests fail on which platforms" gives
`WhichOf(Tests(), Fail(On(WhichOf(Platforms()))))`.

**R6. Quantifiers and determiners wrap, like possessives.** "every test failed" is
`Every(Tests(Failed()))`, "some tests failed" is `Some(Tests(Failed()))`, "no user
accounts" is `No(UserAccounts(), ...)`. Wrapping also gives the logically right scope: the
quantifier scopes over the claim. A quantified claim on a kind is a kind-level claim, so an
`IsA` in it needs confirmation (Part 5.2). From P1 and possessives-wrap. Medium.
Test: "every dog is an animal" gives `Every(Dog(IsA(Animal())))`, held for confirmation.

**R7. An order with a subject is written as a claim.** "you go first" is `You(Go(First()))`,
Declarative by shape. The order reading is a realization of a second-person present claim,
exactly as the request reading is of `Can(You(), $x)`. Truly ambiguous messages ("you're
taking the car") stay Declarative and go to the ambiguity policy when it matters. From P1
and P5. Medium.
Test: "somebody fix this" gives `Somebody(Fix(Ref("this")))`.

**R8. A coordinated subject goes verb first.** "greg and emmy are coworkers" is
`Are(List(Greg(), Emmy()), Coworkers())`: `List` would be the head and it is not what the
claim is about (P2). A reciprocal claim realizes through `Symmetric()`. From P2 and
siblings-in-`List`. Medium.
Test: "greg and emmy are married" is believed as one symmetric relation, not two.

**R9. A number subject goes verb first, and the shape then equals the question.** "7 is
prime" is `Is(7, Prime())`, the same as "is 7 prime". Only `Mood` tells them apart, so for
auxiliary-headed lines the mood pass is load-bearing, not optional. From P2 and P5. High.
Test: "7 is prime" gives `Mood(Declarative(), Is(7, Prime()))`; "is 7 prime" gives
`Mood(Interrogative(), Is(7, Prime()))`.

**R10. Questions inside orders keep their own shape; the outer mood wins.** "tell me who
called" is `Mood(Imperative(), Tell(Me(), Who(Called())))`. The embedded `Who` is a query
value that `Tell` delivers. `ir-spec.md` 9.7's `Do(Tell(Me(), Whether(...)))` becomes
`Tell(Me(), If(...))`. From P1 and P5. High.
Test: "tell me if the tests passed" gives `Tell(Me(), If(Tests(Passed())))`.

**R11. A comparative is a relation with its "than".** "greg is taller than emmy" is
`Greg(TallerThan(Emmy()))`, the same rule as `AllergicTo`. Over values it goes verb first:
"is 7 bigger than 5" is `Is(7, BiggerThan(5))`. From P3, P4 and P2. Medium.
Test: "who is taller than emmy" gives `Who(TallerThan(Emmy()))`, one lookup.

**R12. Articles are absorbed.** Stated in P6. Every gold reading already drops them;
nothing said so. High.
Test: "the lights" and "lights" read the same; "a raven" never yields `IsA`.

**R13. Fixed phrase vs compositional: the parts test.** Fold when the parts do not mean
themselves in this phrase ("kick the bucket" as an idiom is `KickTheBucket`); never when
they do ("kick the ball"). A literal/idiom ambiguity is the Ears' call and cannot be
repaired mechanically. From P4. Medium.
Test: "what's up" is `WhatsUp()`; "what's up there" is `WhatIs(Up(There()))`.

**R14. Head position depends on part of speech, which the graph supplies for known
words.** Whether `Report` in "report the bug" is a verb or a noun decides Imperative vs
Declarative. For unknown words mood detection falls back to the surface tagger. From P3
and Part 4.3. Medium.
Test: "report is done" gives `Report(Is(Done()))` under `Declarative()`.

**R15. A bound clause has no mood and is never believed by itself.** `$invest =
Me(Invest(...))` is claim-shaped but lives inside `If(...)`. Only the using line's mood
applies; a claim under `If` is hypothetical (`memory-spec.md` Part 5.4). From Part 4.2 and
`Believe`. High.
Test: "if i invest $1000..." asserts nothing about the user.

**R16. The confirmation rule covers every relation the evaluator reads structurally, not
only `IsA`.** A `SynonymOf`, `InverseOf` or `PastOf` asserted on a kind from conversation
("times means multiply") changes realization just as `IsA` does. From the `IsA` rule's own
reason. Medium.
Test: "banana means yes" is recorded as said and not asserted until confirmed.

**R17. A mechanical inverse is provisional.** It can be created on first need, but whether
the relation is symmetric or has no inverse is the Teacher's once-per-relation answer; until
then the inverse is marked unconfirmed. From the inverse-naming decision. Medium.
Test: "who is greg a friend of" must not produce `FriendOfBy`.

**R18. A proper name is a head, resolved to an individual by `Named`.** "hamlet" is
`Hamlet()`, "greg" is `Greg()`; resolution maps them to `Greg_1` through `Named("Greg")`
(`memory-spec.md` Part 3.2). A name the user *gives* as a value stays a string:
`My(Name(Is("keal")))`. From P7 and memory's minting. Medium.
Test: "greg called" gives `Greg(Called())`, attached to `Greg_1` without minting a second
Greg.

**R19. Rejecting the system's output is a feedback signal.** `Not(Ref("that one"))` is the
implicit negative of `concept-spec.md` Part 9.4, visible in the parse. From the `Correction`
scope decision. High.
Test: after a pick, "not that one, the blue one" lowers the tie-broken realization only.

---

## 7. Contradictions and tensions

**T1. `Checking` as a marker vs a mood kind.** `gold-review.md` writes
`Checking(It(Is(Tuesday())), Right())`; `Mood` makes it `Mood(Checking(), ...)`; the
rewritten gold splits the tag into its own line, `Right()`. A separate line detaches the tag
from what it checks. **Recommend** the kind carries the tag: `Mood(Checking(Right()),
It(Is(Tuesday())))`, keeping `Mood` two-argument and `Describe` able to put "right?" back
at the end.

**T2. `Interrogative()` is both a mood kind and the parent of the question words.** The
existing `Interrogative` Concept is what `Who` and `What` are `IsA`. Using it as a facet is
legal, but any realization declared on `Interrogative` is inherited by every question word.
**Recommend** keeping one identity (two names for one idea is worse, `seed-concepts.md`
Part 4.1) and declaring nothing on it but relations.

**T3. "!" is whole-message `Emphasis` vs per-line.** The review says whole-message; the
gold applies it to one line (`Emphasis(Thanks())` among three). **Recommend** per
sentence: it marks the sentence it ends.

**T4. Describing words wrap vs adjectives as arguments.** P1 and possessives-wrap give
`Colorless(Green(Ideas(...)))`, but agreed readings still have `Numbers(Latest())`,
`Job(Barista())`, `Function(Python(), ...)`, `Engineer(Senior(), Rust())`,
`WebApp(Small(), ...)`, and `ir-spec`'s `Sweater(Red(), Wool())`. **Recommend** wrapping
throughout (`Latest(Numbers())`, `Barista(Job())`, `Small(WebApp(For(...)))`): one rule,
said order, and it is what "possessives wrap, like any describing word" already says. Cost:
the head of most noun phrases becomes an adjective, so subject-finding must descend
(Part 5.2).

**T5. The copula is sometimes dropped.** `Me(AllergicTo(Peanuts()))` drops "am", while
`It(Is(Tuesday()))`, `Me(Am(Number("five")))` and `My(Name(Is("keal")))` keep it. "nothing
is dropped" and the tense decision (R2) both say keep. **Recommend** the copula is kept
unless it fuses into a relation name (`IsA`), and a present-tense copula before a relation
phrase is absorbed by that relation (`AllergicTo` is "be allergic to"). Any other tense is
always kept: "i was allergic" is `Me(Was(AllergicTo(...)))`. Needs a yes.

**T6. "Parts that mean themselves never fold" vs compound nouns.** `JamBusiness`,
`ProductPage` and `UserAccounts` fold parts that mean themselves; `CoverLetter` and
`PullRequest` are lexicalized. **Recommend** folding only lexicalized compounds (a
dictionary would list them) and composing the rest: `Jam(Business())`.

**T7. Governed prepositions fuse in claims but not in orders.** `AllergicTo`, `CoworkerOf`,
`KilledBy` fuse; `Look(At(...))`, `Focus(On(...))`, `Send(x, To(y))` do not. **Recommend**
making it a rule: in a claim, the predicate is a relation, and a relation's name includes
its governed preposition because that is what gets stored and inverted; in an order the
preposition is an argument marker. Medium confidence; it asks the Ears to know which it is
writing, which it does (it chose subject or verb first). The same rule explains
"greg is my coworker" as `Greg(CoworkerOf(Me()))` rather than P1's literal
`Greg(Is(My(Coworker())))`: the claim is written as the relation it stores. That is a
departure from said order and needs a yes.

**T8. A fronted `Is` marks a question vs verb-first statements.** `Is($heater, Broken(),
Again())` is a statement and `Is(Ref("it", $bug), Fixed(), Yet())` a question, identical in
shape. **Resolve** as R9: mood decides, from the sentence's word order. "A fronted auxiliary
marks yes/no" is true of the message, not of the reading.

**T9. Heading text is a string, but strings are only for what is not understood.**
**Recommend** keeping `Heading(2, "Task")` and naming the class: a title is verbatim, like
a quotation, because it names a section rather than saying anything.

**T10. Mood inside list items.** The rewritten gold writes `Item(1, Clone(Repo()))` with no
`Mood`, so "can you X" as a list item would never get the request reading. **Recommend**
`Item(n, Mood(kind, x))` (Part 4.2).

**T11. `Please` said last, written first.** Said order wins for content, but markers wrap
their scope. Not a contradiction once stated (P1); it was never stated.

---

## 8. Open questions

1. **"my name is keal".** The review never settled it; the gold has `My(Name(Is("keal")))`.
   Whether `NameIs` fuses, and whether the name is a string or a head, is open (R18).
2. **Subject-finding for unknown words.** Part 5.2 descends to the first relation or verb,
   which needs part of speech the graph may not have yet.
3. **`ambiguous-attachment` and `context-elliptical-why`** stay open cases.
4. **How far to take Part 3's candidates.** Pre-binding verbatim spans changes what the Ears
   sees; it needs an eval run before it is a rule.
5. **Tense in synonym interrogatives.** `WhatIs SynonymOf What` is fine; `WhatWas` is not a
   pure synonym, since the tense matters. Whether it is its own Concept like `WhoDid` is
   undecided.
6. **Other code languages.** `Block("rust", ...)` stays verbatim until a Rust importer exists.

---

## 9. Changes to existing documents

| Document | Change |
|---|---|
| `ir-spec.md` Part 9.7 | replace with a pointer here; its examples use `Whether`, `Fact`, `Do` and slot holes |
| `ir-spec.md` Part 7 table | add `Unclear`; restrict `Correction` to one's own words; point to P6 |
| `ir-spec.md` Part 8.2 | add the two-argument `Ref("words", $x)` and `resolvedTo` |
| `ir-spec.md` Part 11.3 | record the interrogative-first and subject-first measurements |
| `seed-concepts.md` Part 10 | replace: interrogatives head, fused interrogatives, no `Whether`, `Mood` and its four kinds, `Tell` without `Do` |
| `seed-concepts.md` Part 9 | add `Unclear`, `InlineCode`, `Heading(level, text)`, `Item(n, x)`; `Checking` as a mood kind |
| `seed-concepts.md` Part 2 | add `PastOf`; note mechanical inverse names |
| `seed-concepts.md` Part 11 | add `Time(h, m?, Am()/Pm()?)` beside `Date` |
| `memory-spec.md` Part 5.4 | `Believe` keys on `Mood(Declarative(), ...)`; `Checking`, `Interrogative` and bound clauses are not believed; the kind-level confirmation rule (Part 5.2, R16) |
| `memory-spec.md` Part 3.2 | proper names resolve through `Named` (R18) |
| `concept-spec.md` Part 9 | the two selector gaps in Part 5.7 |
| `src/ears/AGENTS.md` | "Mood, not use" and "Where holes go" rewritten: interrogative first, no `Whether`, `Mood` from `mood.ts`; closed vocabulary gains `InlineCode`, `Unclear`, `DoNot` |
| `src/ears/mood.ts` | emit `Mood(kind, line)` instead of `Do`/`Fact`/`Whether`; `Checking` and `Emphasis` from punctuation; detect from the reading's head first (Part 4.3) |
| `src/seed/seed.ts` | `Do` stops being a frame; `Mood` realization; request reading under `Interrogative()`; `WhoDid`/`WhatDid` realizations |
| `eval/ears/gold.md` | conventions 3, 4, 9 and 10 rewritten to P1 to P5; T4 and T6 applied if agreed |
