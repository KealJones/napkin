# Ears gold readings

The intended reading for each message after the Ears and the mechanical passes: the source
of truth the harness scores against. Best effort, not the only acceptable answer. A reading
is scored on what the gold one commits to (its moods, markers, interrogatives, references,
the words and numbers it keeps) and softly on name overlap and word order. It never asks
for an exact match.

Rebuilt 2026-09-23 from the case-by-case review in `tasks/gold-review.md`, which records
every decision and its reason. The principles are in `design/reading-spec.md`.

Rules for this file:

- **Never copy a message from here into the prompt** (`src/ears/AGENTS.md`, rule 5).
- **Names are the user's words.** A gold reading never uses a name because the graph
  realizes it.
- `status: open` marks a case the IR cannot express cleanly yet; those are reported apart.

## Conventions

1. **Nothing is dropped.** Filler goes in `MarkAside`.
2. **The first thing said is the head.** The question word first; the subject first for a
   claim about a thing; the verb first for an order or for computation over values. A
   number or a `Ref` is never a head.
3. **Fixed combinations fuse** when they carry one meaning: `IsA`, `DoNot`, `HeyThere`. A
   helper after a question word is kept and holds the rest: `Who(Did(Hamlet(), Kill()))`.
4. **Mood is added after the Ears** as `Mood(kind, line)`: `Imperative`, `Declarative`,
   `Interrogative`, `Checking` (a question marked only by "?" or a tag). A trailing "!" is
   `MarkEmphasis("!", line)`. No `Whether`: a fronted auxiliary marks a yes/no question.
11. **Markers start with `Mark`** (`MarkCorrection`, `MarkMisspelling`, `MarkFuzzy`,
   `MarkEmphasis`, `MarkAside`), so a marker word said as a word stays a word: "my fuzzy
   bear" is `Fuzzy(Bear())`. A marker whose trigger words would otherwise be lost carries
   them first: `MarkFuzzy("or whatever", x)`, `MarkEmphasis("NOT", x)`.
5. **References are `Ref("words")`,** or `Ref("words", $x)` when they point inside the message.
6. **Possessives and modifiers wrap** what they describe: `My(Dad())`, `Old(Car())`.
7. **Coordinate things are siblings;** several go in `List(...)`.
8. **Verbatim strings only for what is not meant to be understood.** `InlineCode`, `Block`,
   `Heading(level, text)` and `Item(...)` keep markup as structure.
9. **Amounts are unit around number** (`Hours(3)`); clock times and dates are readings
   (`Time(7, Am())`).
10. **Missing information is not a hole.**

---

## simple-request
category: request

```message
turn off the lights
```

```reading
Mood(Imperative(), Turn(Off(), Lights()))
```

Why: An order, verb first. `Off` stays a part, so "turn on the lights" differs by one name.

## simple-request-time
category: request

```message
set an alarm for 7am
```

```reading
Mood(Imperative(), Set(Alarm(), For(Time(7, Am()))))
```

Why: A clock time is a reading, not an amount and not a string. `Am()` says which half of the 12-hour clock.

## simple-question-what
category: question

```message
what's the capital of france?
```

```reading
Mood(Interrogative(), What(Is(Capital(France()))))
```

Why: "what's" is "what is", so the helper is kept and holds what is asked. `Is` is a
`Helper`, and a question word reads through one.

## simple-question-who
category: question

```message
who wrote hamlet
```

```reading
Mood(Interrogative(), Who(Wrote(Hamlet())))
```

Why: The question word first, the rest in the order said. Realizes as a lookup for units holding `Wrote(Hamlet())`.

## polite-request
category: request

```message
could you help me write a cover letter for a barista job?
```

```reading
Mood(Interrogative(), Could(You(), Help(Me(), Write(CoverLetter(), For(Job(Barista()))))))
```

Why: A yes/no question in form, marked by the fronted "could". Under the `Interrogative()` facet the graph reads `Could(You(), $x)` as the request `$x`.

## polite-request-please
category: request

```message
grab me the latest numbers please
```

```reading
Mood(Imperative(), Please(Grab(Me(), Numbers(Latest()))))
```

Why: `Please` wraps what it asks and projects to it; where "please" sat in the sentence carries nothing.

## statement-fact
category: statement

```message
i'm allergic to peanuts
```

```reading
Mood(Declarative(), Me(AllergicTo(Peanuts())))
```

Why: A claim about a thing is subject first: exactly the relation stored on `Me`.

## statement-name
category: statement

```message
my name is keal
```

```reading
Mood(Declarative(), My(Name(Is("keal"))))
```

Why: Possessives wrap. A name is text, so a string is right here, and "is" stays because it was said.

## statement-grammatical-nonsense
category: nonsense

```message
colorless green ideas sleep furiously
```

```reading
Mood(Declarative(), Colorless(Green(Ideas(Sleep(Furiously())))))
```

Why: Modifiers wrap what they describe, and the predicate sits inside its subject. Nonsense still gets a faithful reading.

## nonsense-keyboard-mash
category: nonsense
status: open

```message
asdkjh qwe zzz
```

```reading
Unclear("asdkjh qwe zzz")
```

Why: Nothing here names anything. `Unclear` keeps it verbatim so the system can say it did not understand.

## nonsense-riddle
category: nonsense

```message
why is a raven like a writing desk
```

```reading
Mood(Interrogative(), Why(Is(Raven(), Like(WritingDesk()))))
```

Why: `IsA` fuses only when the words make a category claim; here "a" belongs to "a raven".

## nonsense-angels
category: nonsense

```message
how many angels can dance on the head of a pin
```

```reading
Mood(Interrogative(), HowMany(Angels(), Can(Dance(On(Head(Of(Pin())))))))
```

Why: The interrogative takes what it counts first, then the predicate. `Can` is ability here, inside the structure.

## fragment-one-word
category: fragment

```message
banana
```

```reading
Banana()
```

Why: One word, one name, no mood.

## greeting
category: social

```message
hey there!
```

```reading
MarkEmphasis("!", HeyThere())
```

Why: A fixed phrase whose parts do not mean themselves is one name. The "!" is whole-message emphasis. No `Greeting` wrapper: the graph holds `HeyThere IsA Greeting`.

## steps-numbered-list
category: steps

```message
1. clone the repo
2. install deps
3. run the tests
4. tell me what failed
```

```reading
Item(1, Clone(Repo()))
Item(2, Install(Deps()))
Item(3, Run(Tests()))
Item(4, Tell(Me(), What(Failed())))
```

Why: Numbering kept, one item per line. "what failed" puts the question word first.

## steps-conditional
category: steps

```message
first check if the server is up, then if it is restart the worker, otherwise page me
```

```reading
$up = Is(Server(), Up())
Mood(Imperative(), First(Check($up)))
Mood(Imperative(), Then(If(Ref("it is", $up), Restart(Worker()), Otherwise(Page(Me())))))
```

Why: An embedded yes/no question marked by the fronted "is". "it is" points at the check, inside the message.

## markdown-task-brief
category: long

```message
## Task
Refactor `parseConfig` in src/config.ts.

### Requirements
- keep the public API the same
- add tests for the yaml path
- don't touch the CLI

Thanks!
```

```reading
Heading(2, "Task")
Mood(Imperative(), Refactor(InlineCode("parseConfig"), In("src/config.ts")))
Heading(3, "Requirements")
Item(Keep(PublicAPI(), Same()))
Item(Add(Tests(For(Path(Yaml())))))
Item(DoNot(Touch(CLI())))
MarkEmphasis("!", Thanks())
```

Why: Heading levels and backticks are kept as structure; list entries are one `Item` per line.

## markdown-product-brief
category: long

```message
I'm building a small web app for my jam business. It needs a product page, a cart, and checkout with Stripe. Keep it simple, no user accounts for now. Use Next.js and Tailwind.

Can you give me a step by step plan and then the code for the product page?
```

```reading
$app = WebApp(Small(), For(My(JamBusiness())))
Mood(Declarative(), Me(Building($app)))
Mood(Declarative(), Needs(Ref("it", $app), List(ProductPage(), Cart(), Checkout(With(Stripe())))))
Mood(Imperative(), Keep(Ref("it", $app), List(Simple(), No(UserAccounts(), For(Now())))))
Mood(Imperative(), Use(NextJs(), Tailwind()))
Mood(Interrogative(), Can(You(), Give(Me(), Sequence(Plan(StepByStep()), Then(Code(For(ProductPage())))))))
```

Why: A `Ref` is never a head, so sentences whose subject is "it" stay verb first. Missing details are not holes.

## code-write-function
category: code

```message
write a python function that returns the nth fibonacci number, with memoization
```

```reading
Mood(Imperative(), Write(Function(Python(), Returns(Nth(FibonacciNumber())), With(Memoization()))))
```

Why: Every part survives; the target language is a part like any other.

## code-fix-pasted-error
category: code

````message
fix this bug:
```
TypeError: Cannot read properties of undefined (reading 'map')
    at List (List.tsx:14)
```
````

```reading
$error = Block("TypeError: Cannot read properties of undefined (reading 'map')\n    at List (List.tsx:14)")
Mood(Imperative(), Fix(Bug(Ref("this", $error))))
```

Why: The pasted block is verbatim; "this bug" points at it inside the message.

## code-review-pasted
category: code

````message
act as a senior rust engineer and review my code:

```rust
fn main() {
    let v = vec![1, 2, 3];
    println!("{}", v[3]);
}
```
````

```reading
Mood(Imperative(), Act(As(Engineer(Senior(), Rust()))))
$code = Block("rust", "fn main() {\n    let v = vec![1, 2, 3];\n    println!(\"{}\", v[3]);\n}")
Mood(Imperative(), Review(Ref("my code", $code)))
```

Why: The fence tag is kept with the block. A TypeScript block would be imported into Concepts by a mechanical pass.

## code-rename
category: code

```message
rename getUser to fetchUser everywhere in src/ and update the tests
```

```reading
Mood(Imperative(), Rename("getUser", To("fetchUser"), Everywhere(In("src/"))))
Mood(Imperative(), Update(Tests()))
```

Why: Identifiers and paths are strings. Two orders, two lines.

## code-run-command
category: code

```message
run `pnpm test` and paste the failures
```

```reading
Mood(Imperative(), Run(InlineCode("pnpm test")))
Mood(Imperative(), Paste(Failures()))
```

Why: Backticked text is `InlineCode`.

## pr-review
category: code

```message
review PR #482 in cnocept, focus on the memory changes and leave comments but don't approve
```

```reading
Mood(Imperative(), Review(PullRequest(482), In(Cnocept())))
Mood(Imperative(), Focus(On(Changes(Memory()))))
Mood(Imperative(), Leave(Comments()))
Mood(Imperative(), But(DoNot(Approve())))
```

Why: Each order its own line. "don't" fuses to `DoNot`; "but" is kept around what it contrasts.

## pr-review-link
category: code

```message
can you look at https://github.com/foo/bar/pull/12 and tell me if it's safe to merge
```

```reading
$pr = "https://github.com/foo/bar/pull/12"
Mood(Interrogative(), Can(You(), List(Look(At($pr)), Tell(Me(), If(Is(Ref("it", $pr), Safe(To(Merge()))))))))
```

Why: "can you" governs both halves, so they are a `List` under it. "it" is the link.

## context-same-thing
category: context

```message
do the same thing for the other file
```

```reading
Mood(Imperative(), Do(Ref("the same thing"), For(Ref("the other file"))))
```

Why: Here "do" is the verb, which is why the mood frame is `Mood` and never `Do`.

## context-send-it
category: context

```message
send it to him
```

```reading
Mood(Imperative(), Send(Ref("it"), To(Ref("him"))))
```

Why: Pronouns with nothing in the message to point at. Where each `Ref` sits is the context memory resolves it with.

## context-that-bug
category: context

```message
remember that bug we talked about last week? is it fixed yet
```

```reading
$bug = Ref("that bug we talked about last week")
Mood(Checking(), Remember(You(), $bug))
Mood(Interrogative(), Is(Ref("it", $bug), Fixed(), Yet()))
```

Why: "remember ...?" is marked only by its "?", so `Checking`. The later "it" points at the phrase, inside the message.

## context-follow-up
category: context

```history
user: write a function that reverses a string
answer: Here is reverse(s), which returns the characters of s in reverse order.
```

```message
now make it handle unicode
```

```reading
MarkAside("now")
Mood(Imperative(), Make(Ref("it"), Handle(Unicode())))
```

Why: "it" is the function from the last turn. "now" is kept.

## context-ordinal-follow-up
category: context

```history
user: list three dog breeds
answer: Labrador, Poodle, Beagle.
```

```message
tell me more about the second one
```

```reading
Mood(Imperative(), Tell(Me(), More(About(Ref("the second one")))))
```

Why: The ordinal is read out of the phrase by memory resolution, not structured by the Ears.

## context-what-did-i-say
category: context

```message
what did i say my sister's name was?
```

```reading
Mood(Interrogative(), What(Did(Me(), Say(My(Sister(Name(Was())))))))
```

Why: "what did" fuses. Memory answers from `Said`.

## context-elliptical-why
category: context
status: open

```history
user: is a tomato a fruit
answer: Yes, botanically a tomato is a fruit.
```

```message
why?
```

```reading
Mood(Interrogative(), Why())
```

Why: An elliptical follow-up has no phrase to copy into a `Ref`.

## context-language-unstated
category: context

```message
write a function that parses csv
```

```reading
Mood(Imperative(), Write(Function(That(Parses(Csv())))))
```

Why: No language, and the Ears does not pick one.

## context-make-it-faster
category: context

```message
make it faster
```

```reading
Mood(Imperative(), Make(Ref("it"), Faster()))
```

Why: With no history, "it" is still a reference; resolution fails honestly and asks.

## context-the-usual
category: context

```message
run the usual
```

```reading
Mood(Imperative(), Run(Ref("the usual")))
```

Why: Resolves against a consolidated project habit (`memory-spec.md` 11).

## missing-info-booking
category: missing

```message
book me a table for tonight
```

```reading
Mood(Imperative(), Book(Me(), Table(), For(Tonight())))
```

Why: No restaurant, no party size, and the Ears adds neither.

## missing-info-this
category: missing

```message
convert this to celsius
```

```reading
Mood(Imperative(), Convert(Ref("this"), To(Celsius())))
```

Why: "this" points outside a message that holds no value.

## multi-intent
category: mixed

```message
thanks! also what's the weather tomorrow and can you remind me to bring an umbrella if it rains
```

```reading
MarkEmphasis("!", Thanks())
Mood(Interrogative(), Also(What(Is(Weather(Tomorrow())))))
Mood(Interrogative(), Can(You(), Remind(Me(), Bring(Umbrella()), If(It(Rains())))))
```

Why: The "it" in "it rains" points at nothing, so it is `It()`.

## correction-mid-sentence
category: markers

```message
move the meeting to tuesday, no wait, wednesday
```

```reading
Mood(Imperative(), Move(Meeting(), To(MarkCorrection(Tuesday(), Wednesday()))))
```

Why: The user retracts their own word; "no wait" is what `Correction` records.

## correction-not-that-one
category: markers

```message
not that one, the blue one
```

```reading
Not(Ref("that one"))
Ref("the blue one")
```

Why: No `Correction`: the user rejects the system's pick and retracts nothing they said.

## emphasis-prohibition
category: markers

```message
please do NOT push to main
```

```reading
Mood(Imperative(), Please(MarkEmphasis("NOT", DoNot(Push(To(Main()))))))
```

Why: The stress wraps the fused word holding "NOT".

## fuzzy-quantity
category: markers

```message
give me like five-ish names for a cat
```

```reading
Mood(Imperative(), Give(Me(), Names(MarkFuzzy("like five-ish", Number("five")), For(Cat()))))
```

Why: "like" and "-ish" make the count vague, which `Fuzzy` records.

## misspelling-common-word
category: markers

```message
whats the wether in pittsburgh
```

```reading
Mood(Interrogative(), What(Is(MarkMisspelling("wether", Weather(In(Pittsburgh()))))))
```

Why: "wether" names what is asked about, so both forms are kept.

## choice-question
category: question

```message
which of these is a prime: 21, 27, 29, 33?
```

```reading
$options = List(21, 27, 29, 33)
Mood(Interrogative(), WhichOf(Ref("these", $options), IsA(Prime())))
```

Why: "these" points forward at the options, inside the message; "is a" is `IsA`.

## hypothetical-investment
category: question

```message
if i invest 1000 dollars at 5% a year, how much will i have in 10 years?
```

```reading
$invest = Me(Invest(Dollars(1000), At(Percent(5), Per(Year()))))
Mood(Interrogative(), If($invest, HowMuch(Will(Me(), Have(In(Years(10)))))))
```

Why: Amounts are their unit around their number. "how much" is `HowMuch`, distinct from `HowMany`; "will" stays.

## explain-like-five
category: request

```message
explain like i'm five how vaccines work
```

```reading
Mood(Imperative(), Explain(Like(Me(Am(Number("five")))), How(Vaccines(Work()))))
```

Why: An embedded question puts its question word first inside the order.

## email-draft
category: request

```message
draft an email to my landlord saying the heater is broken again and asking when they can fix it, keep it polite
```

```reading
$email = Email(To(My(Landlord())))
$heater = Heater()
Mood(Imperative(), Draft($email, Saying(Is($heater, Broken(), Again())), Asking(When(They(Can(Fix(Ref("it", $heater))))))))
Mood(Imperative(), Keep(Ref("it", $email), Polite()))
```

Why: Two "it"s point at different things inside the message, so each `Ref` names its own binding.

## forget-request
category: memory

```message
forget everything i told you about my ex
```

```reading
Mood(Imperative(), Forget(Everything(Me(Told(You(), About(My(Ex())))))))
```

Why: An explicit request to forget (`memory-spec.md` 10.5).

## chess-bare-move
category: game

```history
user: let's play chess, you're black
answer: Game started. Your move.
```

```message
e4
```

```reading
E4()
```

Why: Bare notation stays as said; routing picks the game.

## chess-no-game
category: context

```message
e4
```

```reading
E4()
```

Why: The same reading with no game; realization finds none and says so.

## ambiguous-attachment
category: ambiguity
status: open

```message
i saw the man with the telescope
```

```reading
Mood(Declarative(), Me(Saw(Man(), With(Telescope()))))
```

Why: "with the telescope" attaches to seeing or to the man; waiting on the `Ambiguous` node.

## check-question
category: question

```message
it's tuesday, right?
```

```reading
Mood(Checking(), It(Is(Tuesday())))
Right()
```

Why: Marked only by the tag and "?", so `Checking`; the tag is kept as its own line.

## long-rambling
category: long

```message
ok so basically i've been trying to get my raspberry pi to connect to wifi for like 3 hours and it keeps dropping, i already tried rebooting it and changing the channel on the router, what else should i try?? its a pi 4 btw
```

```reading
MarkAside("ok so basically")
$pi = My(RaspberryPi())
Mood(Declarative(), Me(HaveBeen(Trying(Get($pi, Connect(To(Wifi()))), For(MarkFuzzy("like", Hours(3)))))))
Mood(Declarative(), Keeps(Ref("it", $pi), Dropping()))
Mood(Declarative(), Me(Already(Tried(List(Rebooting(Ref("it", $pi)), Changing(Channel(On(Router()))))))))
Mood(Interrogative(), MarkEmphasis("??", What(Else(), Should(Me(Try())))))
Mood(Declarative(), Is(Ref("its", $pi), Pi(4)))
MarkAside("btw")
```

Why: Many short lines, nothing dropped. "??" is emphasis on the question.
---

## Open questions these cases found

| Case | Waiting on |
|---|---|
| `nonsense-keyboard-mash` | `Unclear` seeded as a marker |
| `context-elliptical-why` | a way to point at the last answer when no phrase does |
| `ambiguous-attachment` | the `Ambiguous` node |
| `markdown-product-brief` | the word "code" and the structural identity `Code` share a name |
| `multi-intent` | `mood.ts` cannot tie lines to sentences when their counts differ |
