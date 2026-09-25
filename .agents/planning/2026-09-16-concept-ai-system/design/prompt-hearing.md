# Prompt hearing: words that find each other

Status: spec and plan, not built. First written 2026-09-25 as an idea; this version says
how it would work.

## 1. Why

What should the Ears be? Two answers kept fighting:

1. **Faithful.** The Ears keeps what was said and the graph works out what it means.
2. **Interpreting.** The Ears makes a clean, structured, executable expression.

Neither is right alone. A "faithful" structure is already an interpretation: deciding that
"work" is a noun, or that "by Paul Weitz" belongs to "co-produced", is a guess. But the
words of a message do relate to each other, and a bag of words throws that away.

The way out: **the faithful record is the words**, in order, as typed. Structure is
interpretation, and interpretation belongs in the graph, where it can be learned, traced
and redone. Keeping the words is what lets an old message be read again once the graph
knows more.

Hearing becomes the words of a message finding their relations to each other, each word
doing what it knows how to do, in the graph.

## 2. The model

### 2.1 Prompt

A message becomes a `Prompt`: its words in order, each with what is known about it before
any grammar runs.

```
Prompt(
  Word("american", at=0, tags=List(Adjective(), ProperNoun())),
  Word("pie", at=1, tags=List(Noun(), Singular())),
  Word("is", at=2, tags=List(Copula(), Verb())),
  Word("a", at=3, tags=List(Determiner())),
  Word("1999", at=4, tags=List(Value(), Year())),
  ...
)
```

- The text of each word is kept exactly as typed. The Prompt plus the message text is the
  record of what was said.
- `tags` come from the tagger (compromise) and from the word's shape (digits, capitals,
  camel case). They are proposals, not facts.
- Verbatim spans (code blocks, backticked text, URLs, quotes, arithmetic in symbols) stay a
  pre-pass, as today, and come in as one `Word` holding the verbatim value.
- Tokenizing and tagging are a host facility (`api.words(text)`), generic like `lemma`. The
  host names no word's role.

### 2.2 Links

Hearing produces links between positions. A link is a Concept:

```
Link(from=4, to=9, role=Modifies())
```

The roles are few, and they are a closed vocabulary of the IR, like the markers:

| Role | Meaning | Example |
|---|---|---|
| `Modifies` | `from` says something about `to`, the thing | "teen" to "film" |
| `Takes` | `from` holds `to` as what it acts on | "by" to "weitz", "directed" to "by" |
| `Joins` | `from` groups the words either side of it | "and" between "directed" and "co-produced" |
| `Absorbs` | `from` is part of how `to` is said, adding nothing to run | "the" to "car" |
| `Marks` | `from` marks `to` (or the whole line) as asked, negated, blurred, stressed | "?", "not", "maybe" |
| `Names` | `from` and `to` are one name | "paul" to "weitz" |

Every word ends with **at most one parent** (the word it links to). The links form a tree,
or a forest when a message has several parts. That is dependency structure (Tesnière), with
each link carrying a named role.

### 2.3 Hearing behaviour

Each word Concept can have realizations in the `Hearing()` context. A hearing realization
is called with the Prompt, its own position, and the links so far, and it answers with the
links it proposes:

```
Concept(And(),
  Realization(And($prompt, $at, $links),
    context = Hearing(),
    body = Code(ir = ...)))   // proposes Joins to its neighbours of the same kind
```

Realizations are not the limit here. A word can have one hearing realization or several,
and they are ordinary Concept behaviour: traced, replaceable, and chosen by context and
inheritance like any other.

Small helpers in a `hearing.ncon` pack let a behaviour look around: `WordAt($prompt, $i)`,
`Before($prompt, $at)`, `After($prompt, $at)`, `ParentOf($links, $i)`, `KindAt($prompt,
$i)`. Positions are just numbers in the Prompt, the way `Position` already works in
predict.ncon.

### 2.4 Which behaviour a word uses: inheritance, down to the universal parent

When position `i` hears, the dispatcher (`Hear`) evaluates the word's own call,
`<Word>($prompt, $i, $links)`, under `Hearing()`. Selection is the usual lineage walk:

1. **The word's own Concept.** "and" is `And`, "by" is `By`. The closed class (determiners,
   prepositions, conjunctions, helpers, pronouns, question words: a few hundred words)
   carries most of the grouping and has behaviour of its own.
2. **What the word is.** A Concept that is a kind of thing (`IsA`/`SubclassOf` reaching
   `Category`) hears as a thing. `Pie` hears as a thing because it is one.
3. **The universal parent, `Concept`.** Its hearing realization is the default for every
   word, and it is where an unknown word lands (2.5).

A word's tags are also Concepts with hearing behaviour: `Noun()`, `Verb()`, `Adjective()`,
`Value()`, `Determiner()`. The default in step 3 hears as the word's tags do.

### 2.5 A word that is not a Concept yet

"americanpie" has no Concept, so it has no hearing behaviour of its own. It still hears,
the same way folds reach every head:

- **Every head inherits from `Concept`**, whether or not it exists in the graph. So
  `Americanpie($prompt, 7, $links)` under `Hearing()` falls through to the universal
  parent's hearing realization.
- **That default hears as what the word looks like.** It reads the word's tags from the
  Prompt and hears as each: `Noun($prompt, 7, $links)`. The tag Concepts carry the generic
  grammar: a noun is a thing that other words can describe; an adjective describes the next
  thing; a verb takes what follows.
- **With no tags at all** (the tagger has never seen it), it hears as a thing. Its
  neighbours then decide: "the" before it claims it (`Absorbs`), so it is a thing; "to"
  before it and no noun after could claim it as a doing. This is what the rules parser does
  today ("a word the tagger could not place, after an owner or a determiner, is a thing"),
  moved onto the Concept it is about.

Hearing gives an unknown word a role, not a meaning. It still reaches the output as
`Americanpie()`, still leaves a gap, and learning still looks it up. Once learned (say
`IsA(Film())`), it hears as a thing by inheritance (2.4, step 2), with no hearing rule
written for it.

So nothing that is not a Concept needs self-executing rules of its own. It borrows its
kind's rules, and when nothing is known about its kind, the universal parent's.

## 3. Settling

Hearing runs in rounds until nothing changes:

```
links = []
for round in 1..(words + 2):
  proposals = for each position i without a parent: Hear(prompt, i, links)
  accepted = Settle(proposals, links)
  if accepted is empty: stop
  links += accepted
```

- **Monotone.** Links are only added, and a position with a parent keeps it. So it always
  stops, within words + 2 rounds.
- **Later rounds see earlier links.** "and" can only join its neighbours once each has
  found what it is. Round 1 settles noun phrases, round 2 prepositions and joins, round 3
  clauses. Nothing orders the rounds; it falls out of what each behaviour waits for.

### 3.1 When proposals compete

Two proposals conflict when they give one position two parents. `Settle` decides, in order:

1. **Specificity.** A proposal from the word's own behaviour beats one from its kind, which
   beats one from the universal parent. This is the same ranking realization selection
   already uses (distance in the lineage).
2. **Predict.** Which link has the graph accepted before, in this shape? Every accepted
   link is remembered as `Heard(Link(role, fromKind, toKind))`, counted by Predict's
   back-off (word, then kind, then tag). "Like" after "i" was a verb 40 times and a
   preposition twice.
3. **Judge, by the graph.** Which reading makes sense to what the graph holds: "by Paul
   Weitz" attaches to "directed", not to "1999", because a year does nothing by anyone.
   This is `Judge` asked about two attachments, with `NoLean` when it cannot tell.
4. **Nearest.** The closer head wins.

If `Judge` still has no lean, both readings are kept: the output is `Readings(A, B)` (that
Concept exists) and the graph decides later, or asks.

## 4. Emitting the expression

When settled, each tree is written as a Concept expression. A word's expression is its
Concept, with its dependents as arguments, in the order they were said:

- `Modifies` dependents become arguments: "my old car" is `Car(My(), Old())`, "ice cream"
  is `Cream(Ice())`, and "a 1999 American teen comedy film" is
  `Film(1999, American(), Teen(), Comedy())`. The thing is always the head.
- `Takes` dependents are arguments too: `Directed(By(Weitz(Paul())))`.
- `Joins` becomes `And(...)` of the joined words, or `Or(...)`.
- `Absorbs` leaves nothing in the expression. The link is kept in the Prompt.
- `Marks` becomes the marker: `Mood(Interrogative(), ...)`, `Not(...)`, `MarkFuzzy(...)`.
- `Names` makes one head from the words: `PaulWeitz()`, only where the words linked as a
  name.

Nothing is emitted that was not said. `Is` appears where "is" was said. "American Pie, a
1999 film" links the two things through the comma, and no verb is invented.

`Emit` is a Concept, so the output conventions are graph behaviour, not parser code. While
the rules parser is still the reference, `Emit` can write the rules parser's current
conventions (`My(Old(Car()))`, a claim inside its subject), so nothing downstream changes.
The thing-as-head form is a switch in `Emit`, made once and measured.

## 5. Worked example

"American Pie is a 1999 American teen comedy film directed and co-produced by Paul Weitz"

Round 1 (things and their describers):

- "a" at 3 absorbs into the next thing, and "1999", "american", "teen", "comedy" (4 to 7)
  describe the next thing: all of them link to "film" at 8.
- "american" at 0 describes "pie" at 1.
- "paul" at 13 names with "weitz" at 14.

Round 2 (what takes what):

- "by" at 12 takes "weitz" (14).
- "co-produced" at 11 takes "by" (12).
- "and" at 10 joins "directed" (9) and "co-produced" (11), and the one "by" is shared.
- "directed" at 9 is a doing after a thing with no helper, so it describes "film" (8).
  This is the reduced relative clause, heard from the word's own behaviour, not a rule
  about definitions.

Round 3 (the clause):

- "is" at 2 takes "pie" (1) before it and "film" (8) after it.

Emitted:

```
Is(Pie(American()),
   Film(1999, American(), Teen(), Comedy(),
        And(Directed(), CoProduced(By(PaulWeitz())))))
```

Everything said is there, nothing is added, and "and" is kept. That "by Paul Weitz"
belongs to both doings is interpretation. The graph does it later (`And` sharing its
`Takes`), like folding `Pie(American())` into `AmericanPie`.

## 6. Across sentences and paragraphs

A message can be many sentences, in many paragraphs, and a later one can be about an
earlier one: "I need toilet paper and cheese sticks", a paragraph about recycling, then
"oh, I also need chips".

**Word links stay local.** Each sentence settles on its own (section 3). Nothing tries to
link "chips" to "cheese sticks" across two paragraphs, which keeps long messages
tractable. The message's Prompt holds every sentence, each with its position in the
message (paragraph, sentence, word), so later steps can see how far apart two things were
said.

**A few words point back.** Most words link sideways. Some point at something said before,
and that is their whole job:

| Word | Points at |
|---|---|
| "too", "also", "as well", "again", "another" | an earlier claim of the same shape, adding one more |
| "it", "that", "this", "them", "those" | an earlier thing, or the last answer |
| "the" + a noun ("the file", "the bug") | a thing of that kind already known in this conversation |
| "he", "she", "they" | an earlier person |
| "the first one", "the other one" | one of several things just listed or offered |

Their hearing behaviour proposes a link to an earlier position instead of a neighbour:

```
Link(from=<"too", sentence 4>, to=<"need", sentence 2>, role=Adds())
Link(from=<"it", sentence 3>, to=<"file", sentence 1>, role=PointsAt())
```

`Adds` and `PointsAt` are two more roles for section 2.2. A backward link is found the way
section 7 finds any reference, starting from inside the message.

**Grouping claims of the same shape is interpretation.** Two claims linked by `Adds`, with
the same shape once the thing that differs is taken out, line up. That is anti-unification,
which Predict already uses to find the rule behind a sequence:

```
Need(Me(), And(ToiletPaper(), CheeseSticks()))
Need(Me(), Chips())
  gives  Need(Me(), $x)  with  $x = ToiletPaper, CheeseSticks, Chips
```

The graph's interpretation is `Need(Me(), List(ToiletPaper(), CheeseSticks(), Chips()))`.
What was heard stays as the sentences that were said.

With no pointer word ("oh, and chips"), the same-shape match against earlier sentences
still runs, but as a guess. One clear fit groups it there. Several fits leave it separate,
or ask.

## 7. References: where a pointer looks

A reference is something said that means something else: "it", "that bug", "the auth
thing", "Greg", "the file I sent you". Today `references.ts` matches words against this
conversation only, takes the best word overlap, and has no notion of "none" or "two". This
section is what it should become.

### 7.1 A reference asks for a kind

Like a question word, a reference says what it wants (Answer by kind, AGENTS.md):

- "he", "she", "Greg" want a `Person`.
- "that file", "the config" want a `File`.
- "it" wants anything, preferring the last thing talked about.
- "the bug", "that meeting" want a `Bug`, a `Meeting`: the noun is the kind.

A candidate of another kind is passed over, however well its words match.

### 7.2 Where it looks, nearest first

The search widens one scope at a time and stops at the first scope that has a candidate
that fits:

1. **This message.** Earlier in the same Prompt ("I wrote a function. It fails.").
2. **This conversation.** Earlier turns, most recent first: the `Said` lines, and what was
   answered.
3. **What Napkin holds.** The graph: known individuals (`Greg_1`), things learned, and
   earlier conversations through the mention index (`store.mentioning`), ranked by
   activation, so something talked about yesterday outranks something from a month ago.
4. **The user's world.** Sources the user has connected: a workspace folder, a repository,
   a calendar. "The auth thing" may be `src/auth/session.ts`, never mentioned in any
   conversation. A source here is searched the way Wikidata is for world knowledge: by
   name, then by what is inside, with what was found recorded with provenance
   (`Workspace Found("src/auth/session.ts")`).
5. **The world.** Wikidata and the web, only for names ("Paul Weitz"), never for pointing
   words: the world does not know what "it" is.

Each scope is a Concept (`InMessage`, `InConversation`, `InMemory`, `InWorkspace`,
`InWorld`) with a `Find($reference, $kind)` realization, so a new source is a new Concept,
not a change to the resolver. Scope 4 does not exist yet: it needs the user to say which
folders or services Napkin may look in, and it is off until they do.

### 7.3 Deciding

In each scope, candidates are scored by fit: the kind (7.1), the words the reference and
the candidate share, how recently the candidate came up (activation), and whether it plays
the same part (the thing a fix is asked about is more likely a bug than a person). Then:

- **One clear candidate:** resolved, recorded in place (`Ref("that bug", resolvedTo=
  Bug_3())`), once, at write time (memory-spec Part 8.3). History never changes when the
  ranking does.
- **Two or more close:** asked with the one `Which` mechanism that already asks for
  people and senses: "Which file do you mean: session.ts, or login.ts?" The reply picks
  it, and the message is heard again with that choice.
- **None in any scope:** said plainly and asked: "I don't know which bug you mean. Where
  is it?" It is never guessed. The unresolved `Ref` stays in the reading and is a gap of
  kind `reference`, so a later message that answers it ("the one in auth.ts") resolves it.

Names, senses and references are then one pattern: find candidates, fit by kind and
context, take one, ask between several, admit none.

## 8. Where it runs

- `ears.ts` gets a `prompt` backend: words, Prompt, `Hear` rounds, `Emit`. `Mood` is a
  `Marks` link from the final "?" or the word order, not a separate pass.
- During migration it runs in **shadow**: the rules parser answers, the Prompt reading is
  computed beside it, and differences are logged to the trace. Nothing the user sees changes
  until the Prompt reading is at least as good on the measured set.
- `Said` keeps the text and the Prompt (words and links), so any message can be heard again
  later with more knowledge.

## 9. Plan

Each stage ends measured, and none is written for one sentence.

**Stage 0: scaffolding.**
- `api.words(text)`: tokens with tags, from the tokenizer and tagger rules.ts already uses.
- `hearing.ncon`: the `Hearing()` facet, `Prompt`, `Word`, `Link` and its roles, the
  helpers (2.3), `Hear` (dispatch), `Settle`, `Emit`.
- A shadow runner and a score: for each case in rules.test.ts (24 tests, 86 assertions)
  and gold.md (56 cases), is the Prompt reading identical to the rules reading,
  equivalent, or different?

Done when an empty grammar runs end to end (every word unlinked, emitted flat) and is
scored.

**Stage 1: things.** Hearing on `Concept` (the default), `Noun`, `Adjective`, `Value`,
`Determiner`, `Possessive`. Noun phrases: "my old car", "ice cream", "a 1999 American teen
comedy film", "the second one". Unknown words hear as things.

Done when the noun-phrase cases match.

**Stage 2: the closed class.** Prepositions (take the next thing, attach to the nearest
doing or thing), `And`/`Or` (join like with like), helpers and the copula, question words,
pronouns and pointing words (`Ref`), names (`Names`).

Done when the question and claim cases in rules.test.ts match.

**Stage 3: clauses and marks.** Subject, verb and object; the reduced relative ("film
directed by"); orders; `Mood`; `Please`; negation (`DoNot`); `MarkFuzzy`; `MarkEmphasis`.
Settling uses Predict (3.1, step 2) from here on. Links heard so far are remembered as
`Heard(Link(...))`.

Done when the Prompt reading is at least as good as the rules reading on all measured
cases, plus a new set of about 50 sentences: Wikipedia first sentences and real messages
with "and", numbers, "by" and fragments.

**Stage 3b: across sentences and references.** Backward-pointing words (`Adds`,
`PointsAt`), same-shape grouping (section 6), and the scoped resolver (section 7) for scopes
1 to 3, replacing `references.ts`. Measured on messages with pronouns, "too" and "also",
and references to earlier turns. Scope 4 comes later, once the user can connect a source.

**Stage 4: switch.** The Prompt backend becomes the default. The rules parser stays as the
fallback, and is deleted rule by rule as nothing uses it.

**Stage 5: learning to hear.** When a word's reading keeps losing to what the conversation
then shows it meant, the word gets its own hearing realization, kept like Chunk keeps a
route: seen, kept, with provenance. `Judge` (3.1, step 3) gets stronger as the graph grows.

## 10. What is still open

- **Cost.** Roughly words times rounds evaluations per message, each small. It needs
  measuring against the rules parser. If it is slow, the rounds can start from the rules
  parser's links and only settle what it was unsure of.
- **The tagger.** compromise's tags are guesses too. Stage 3 could weigh them like any other
  proposal instead of trusting them.
- **Spelling.** Corrections become proposals too: "americanpie" proposes "american pie",
  and both readings go forward, with the one the graph or the world knows winning. That is
  the rule from 2026-09-25: learn both, use the one that makes more sense.
- **Emit conventions.** Thing as head (`Car(My(), Old())`) against the current
  `My(Old(Car()))`, and statements as said (`Is(X, Y)` where "is" was said) against a
  claim inside its subject. Decided once, in `Emit`, and measured.
- **Several sentences.** Each sentence gets its own Prompt, and references across them
  (`Ref`) resolve as today.

## 11. Prior art

- Word expert parsing (Small and Rieger, early 1980s): every word is a small program that
  knows how it combines.
- Link grammar (Sleator and Temperley): words carry connectors that must link to their
  neighbours.
- Categorial grammars (combinatory categorial grammar, Steedman): a word's type says how it
  combines with what is on its left and right.
- Dependency grammar (Tesnière): structure as head-to-dependent links.
- Attention in transformers: every token looks at every other one, learned and opaque. The
  difference here is that every link is a named Concept with a reason, in the graph.
