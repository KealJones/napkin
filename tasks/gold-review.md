# Gold map review, case by case

Decisions from walking `packages/concept-runtime/eval/ears/gold.md` with Keal. Applied to
the gold in one pass once the review is done.

## Settled

- `simple-request`: agreed.
- `simple-request-time`: agreed, `Do(Set(Alarm(), For(Time(7, Am()))))`. A clock time is a
  reading, not an amount; no `Am`/`Pm` means a 24-hour clock.
- `simple-question-what`: agreed.
- `polite-request-please`: agreed.
- `polite-request`: drop `Whether`, and attach flatter:
  `Could(You(), Help(Me(), Write(CoverLetter(), For(Job(Barista())))))`.
- **Yes/no questions have no `Whether`.** A fronted auxiliary is the yes/no marker, the
  same way a fronted question word is: `Could(You(), ...)`, `Is(Chess(), Sport())`.

- `nonsense-keyboard-mash`: `Unclear("...")` agreed.
- **Interrogative first, as said** (measured: word order kept 89% to 96%, pass equal).
  **Fused form**, `WhoDid(Hamlet(), Kill())`, over nested `Who(Did(Hamlet(), Kill()))`:
  the Ears scored them the same, and fused realizes by identity. `WhoDid` is its own
  Concept (an object question), so it never competes with `Who(...)` patterns, which the
  selector could only order by declaration order. Neither is an argument reorder: both
  realize to the query `Kill(Hamlet(), $x)`. True synonyms (`WhatIs` for `What`) are plain
  `SynonymOf`.

- **Subject first for claims and questions about relations; verb first for orders and for
  computation over values** (measured tie: 57% vs 55%, word order 94% vs 93%, gold name
  match 59% vs 64%; decided on coherence). `Me(AllergicTo(Peanuts()))`,
  `Who(Killed(Hamlet()))`, `Close(Door())`, `Times(5, 3)`. The subject is the head when
  there is a subject that is a thing. Needs `ir-spec.md` changed, not only the prompt.
- **Object questions realize through inverses.** `WhoDid(Hamlet(), Kill())` becomes
  `Who(KilledBy(Hamlet()))`: past tense of the verb, then its inverse, then one lookup for
  units holding that relation. Inverse name by default is mechanical, past-tense name plus
  `By` (`KilledBy`, `ToldBy`); `Describe` gives the readable text. The Teacher is still
  asked once per relation whether it is symmetric or has an inverse at all.

- **"is a" is `IsA`, "is" is `Is`, by the words.** "chess is a sport" is
  `Chess(IsA(Sport()))`, the stored relation itself. "is chess a sport" is
  `Is(Chess(), Sport())` and answers by looking for that relation. "chess is a sport?" is a
  check question: `Checking(Chess(IsA(Sport())))`, the marker added by `mood.ts` when a
  "?" or a tag ("right?", "no?") is the only thing marking a question. A tag is kept as
  said: `Checking(It(Is(Tuesday())), Right())`. Realizes as a lookup answered as a
  confirmation or correction; `Describe` gives back the question-marked form it came from
  ("chess is a sport?"). Closes the open `check-question` case. Agreed.
- **Risk for `memory-spec.md` 5.4, narrowed:** `IsA` orders realization selection. "my code
  is a mess" is harmless: "my code" is a description, the enduring claim mints an individual
  (`Code_1 IsA(Mess())`, memory-spec 6.2), and only that individual is affected. The risk
  is an `IsA` on a bare kind from conversation ("code is a mess"), which changes selection
  for every use of the kind. Rule: an `IsA` asserted on a kind from conversation needs
  confirmation; one on an individual or a description does not.

- **Possessives wrap, like any describing word** (replaces gold convention 10). "my dad is
  a doctor" is `My(Dad(IsA(Doctor())))`; "my code is a mess" is `My(Code(IsA(Mess())))`,
  which lands on an individual, never on the kind `Code`. `Dad(Me())` is retired because a
  head must be a name, not a call.

- `nonsense-riddle`: `Why(Is(Raven(), Like(WritingDesk())))`. `IsA` fuses only when the
  words make a category claim; here "a" belongs to "a raven". `LikeA`, if written, is
  `SynonymOf(Like())`.
- `nonsense-angels` (Keal's shape): `HowMany(Angels(), Can(Dance(On(Head(Of(Pin()))))))`.
  The interrogative takes what it counts first, then the predicate.
- `fragment-one-word`: `Banana()` agreed.
- `greeting`: `Emphasis(HeyThere())`. A fixed phrase whose parts do not carry their own
  meaning is one name ("hey there", "what's up", "thank you"); anything whose parts mean
  themselves is never folded. No `Greeting` wrapper: use, not form, and the graph holds
  `HeyThere IsA Greeting`. A trailing "!" is whole-message `Emphasis`, added by `mood.ts`
  the way `Checking` is added from "?". Agreed.

- `steps-numbered-list`: agreed; each `Item(n, ...)` its own line, lifted into `Sequence`.
  "what failed" is `What(Failed())`.
- `steps-conditional`: agreed; `$up = Is(Server(), Up())`, no `Whether`.
- `markdown-task-brief`: `Heading(level, "text")` keeps the level; backticked text is
  `InlineCode("...")`, pairing with `Block` for fences; list entries stay one `Item(...)`
  per line (a wrapping `UnorderedList(...)` would lose the whole list to one slip).
- `code-write-function`: agreed.

- `markdown-product-brief` (Keal's version):
  ```
  $app = WebApp(Small(), For(My(JamBusiness())))
  Me(Building($app))
  Needs(Ref("it", $app), List(ProductPage(), Cart(), Checkout(With(Stripe()))))
  Keep(Ref("it", $app), List(Simple(), No(UserAccounts(), For(Now()))))
  Use(NextJs(), Tailwind())
  Can(You(), Give(Me(), Sequence(Plan(StepByStep()), Then(Code(For(ProductPage()))))))
  ```
  A `Ref` is never a head, so a sentence whose subject is a pointing word stays verb first.
- `code-fix-pasted-error`, `code-rename`: agreed.
- `code-review-pasted`: agreed. **Code in place as IR:** `Block("typescript", "...")` is
  imported into Concepts by a mechanical pass after the Ears, using the existing importer
  (`code/import.ts`, `ir-spec.md` Part 10). Other languages need their own importer; until
  then the block stays verbatim.

## Patterns in Keal's changes (applied to the drafts below)

1. **Said order wins.** Interrogative first, subject first, arguments in the order said.
2. **Fixed grammatical combinations fuse into one head** when they carry one meaning:
   `WhoDid`, `WhatIs` ("what's"), `IsA` ("is a"), `DoNot` ("don't"), `HeyThere`.
3. **No wrappers for use:** no `Whether`, `Greeting`, or `Do`-for-politeness. The graph reads use.
4. **Coordinate things are siblings, not nested:** `HowMany(Angels(), Can(...))`,
   `Write(CoverLetter(), For(...))`; several coordinated items go in `List(...)`.
5. **Surface signals are kept as structure:** "?" gives `Checking`, "!" and "??" give
   `Emphasis`, backticks give `InlineCode`, heading levels are kept, and "no" stays `No`
   (not `Not`).
6. **Pointing words and numbers are never heads,** so their sentences stay verb first.

## Drafts for the rest: all agreed 2026-09-23

| case | draft |
|---|---|
| code-run-command | `Run(InlineCode("pnpm test"))` / `Paste(Failures())` |
| pr-review | `Review(PullRequest(482), In(Cnocept()))` / `Focus(On(Changes(Memory())))` / `Leave(Comments())` / `But(DoNot(Approve()))` |
| pr-review-link | `$pr = "https://github.com/foo/bar/pull/12"` / `Can(You(), List(Look(At($pr)), Tell(Me(), If(Is(Ref("it", $pr), Safe(To(Merge())))))))` |
| context-same-thing | `Do(Ref("the same thing"), For(Ref("the other file")))`: here "do" is the verb, so the frame needs its rename |
| context-send-it | `Send(Ref("it"), To(Ref("him")))` |
| context-that-bug | `$bug = Ref("that bug we talked about last week")` / `Checking(Remember(You(), $bug))` / `Is(Ref("it", $bug), Fixed(), Yet())` |
| context-follow-up | `Aside("now")` / `Make(Ref("it"), Handle(Unicode()))` |
| context-ordinal-follow-up | `Tell(Me(), More(About(Ref("the second one"))))` |
| context-what-did-i-say | `WhatDid(Me(), Say(My(Sister(Name(Was())))))` |
| context-elliptical-why | `Why()` (open) |
| context-language-unstated | `Write(Function(That(Parses(Csv()))))` |
| context-make-it-faster | `Make(Ref("it"), Faster())` |
| context-the-usual | `Run(Ref("the usual"))` |
| missing-info-booking | `Book(Me(), Table(), For(Tonight()))` |
| missing-info-this | `Convert(Ref("this"), To(Celsius()))` |
| multi-intent | `Emphasis(Thanks())` / `Also(WhatIs(Weather(Tomorrow())))` / `Can(You(), Remind(Me(), Bring(Umbrella()), If(It(Rains()))))` |
| correction-mid-sentence | `Move(Meeting(), To(Correction(Tuesday(), Wednesday())))` |
| correction-not-that-one | `Not(Ref("that one"))` / `Ref("the blue one")`: no `Correction`, which is only for retracting one's own words; here the user rejects the system's pick |
| emphasis-prohibition | `Please(Emphasis(DoNot(Push(To(Main())))))`: the stress wraps the fused word holding "NOT"; which half was stressed is lost, acceptably. Agreed |
| fuzzy-quantity | `Give(Me(), Names(Fuzzy(Number("five")), For(Cat())))` |
| misspelling-common-word | `WhatIs(Misspelling("wether", Weather(In(Pittsburgh()))))` |
| choice-question | `$options = List(21, 27, 29, 33)` / `WhichOf(Ref("these", $options), IsA(Prime()))` |
| hypothetical-investment | `$invest = Me(Invest(Dollars(1000), At(Percent(5), Per(Year()))))` / `If($invest, HowMuch(Will(Me(), Have(In(Years(10))))))` |
| explain-like-five | `Explain(Like(Me(Am(Number("five")))), How(Vaccines(Work())))` |
| email-draft | `$email = Email(To(My(Landlord())))` / `$heater = Heater()` / `Draft($email, Saying(Is($heater, Broken(), Again())), Asking(When(They(Can(Fix(Ref("it", $heater)))))))` / `Keep(Ref("it", $email), Polite())` |
| forget-request | `Forget(Everything(Me(Told(You(), About(My(Ex()))))))` |
| chess-bare-move, chess-no-game | `E4()` |
| ambiguous-attachment | `Me(Saw(Man(), With(Telescope())))` (open) |
| check-question | `Checking(It(Is(Tuesday())), Right())` |
| long-rambling | `Aside("ok so basically")` / `$pi = My(RaspberryPi())` / `Me(HaveBeen(Trying(Get($pi, Connect(To(Wifi()))), For(Fuzzy(Hours(3))))))` / `Keeps(Ref("it", $pi), Dropping())` / `Me(Already(Tried(List(Rebooting(Ref("it", $pi)), Changing(Channel(On(Router())))))))` / `Emphasis(What(Else(), Should(Me(Try()))))` / `Is(Ref("its", $pi), Pi(4))` / `Aside("btw")` |

- **Markers are named `Mark*`** (`MarkCorrection`, `MarkMisspelling`, `MarkFuzzy`,
  `MarkEmphasis`, `MarkAside`), because "modifiers wrap" gave every adjective the marker
  shape: "my fuzzy bear" as `Fuzzy(Bear())` would have been projected as vagueness. A name
  rule, not a shape rule; not a privilege, since the host names none of them. Where the
  trigger words would otherwise be lost, the marker carries them first:
  `MarkFuzzy("or whatever", x)`, `MarkEmphasis("NOT", x)`, `MarkEmphasis("!", x)`. `Ref`
  keeps its name. Test sentence: "Ah hem, correction, that is a misspelling of my fuzzy
  bears name Ref, as an aside i dont mind too much." Agreed and applied everywhere.

## Being measured

- **Subject first for statements** (Keal): `Me(AllergicTo(Peanuts()))`,
  `Colorless(Green(Ideas(Sleep(Furiously()))))`. Matches how facts are stored (a relation
  on its subject) and the question form. Costs: realization looks up the head, numbers
  and Refs cannot be heads. Full-set run: nested predicate-first vs subject-first.
- ~~**Where the interrogative goes.**~~ settled above. Keal's position: first, as said, with the rest in the
  order it was said and every helper word kept. "who killed hamlet" is
  `Who(Killed(), Hamlet())`; "who did hamlet kill" is `Who(Did(Hamlet(), Kill()))` or
  `WhoDid(Hamlet(), Kill())`. Side-by-side run on the question cases: slot form vs nested
  vs fused, with a word-order measure.
- **The copula and helper words fused into interrogatives** (`WhatIs`, `WhoDid`) as graph
  synonyms of the plain ones. Same run.

## Proposed, not decided

- **One frame Concept, `Mood(kind, line)`:** `Mood(Imperative(), Close(Door()))`,
  `Mood(Declarative(), ...)`, `Mood(Checking(), ...)`. The name says what it does, in one
  two-argument shape, so a user saying "imperative" or "do" collides with nothing. `Do` is
  freed for the English verb. `mood.ts` writes it, never the Ears. Its realization runs
  the line with the mood added as a facet, `Context(Execution(), Imperative())`, so
  realizations select by mood through ordinary context specificity (the "can you X"
  request reading requires `Interrogative()`). Agreed.


## Follow-ups raised in review, not for the gold

- **Resolving `Ref` phrases:** "the second one", "the last one", "the previous" are read out
  of the verbatim phrase by memory resolution (code), not structured by the Ears.
- **"the usual"** resolves against a consolidated project habit (`memory-spec.md` 11), e.g.
  `My(Project(Usual(...)))` built from repeated "pnpm lint" / "pnpm format".

## Next: one pass

1. Rewrite `gold.md` to every decision above.
2. Prompt to match (interrogative first and fused, subject first for claims, no `Whether`,
   possessives wrap, `InlineCode`, `Heading(level, ...)`, clock readings), measured.
3. `mood.ts` emits `Mood(kind, line)`, plus `Checking` from a bare "?" and `Emphasis` from "!".
4. Seeds: `Mood` realization (mood as a facet), request reading of `Can(You(), $x)` under
   `Interrogative()`, `Checking`, `InlineCode`, `Heading(level, text)`; `Do` stops being a frame.
5. Scorer and `cases.json` expectations to the new forms; re-run the eval.
6. `ir-spec.md` and `seed-concepts.md` updated to match.
