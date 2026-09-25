# Pursue, Predict, Plan, Judge

Status: draft 2, 2026-09-24. Pursue, Predict, Continue and Judge are built (section 8). Builds on `emergent-judgment-plan.md` (which it
narrows and reorders) and `compression-as-prediction.md`. Grounded in a trace audit of nine
real prompts and a seed audit, both run 2026-09-24 against a fresh `store.ncon`.

---

## 1. The problem, measured

Napkin evaluates expressions well. It does not look for a way to answer. When no realization
catches the parse, the turn ends in a residual. The audit:

| Prompt | What caught it | Result |
|---|---|---|
| what is my name? (after "my name is Keal") | `My` in memory.ncon | `Answer("Keal")` |
| What is 5 times three? | `Multiply` via `Times` synonym | `Answer(15)` |
| haha that's hilarious | nothing | residual |
| you're doing great, keep going | `Believe`; `Keep` went to learning | residual, plus `Keep` grounded as a castle keep (deleted) |
| let's build a website to sell jam together | nothing past `Let` | residual |
| should I use tabs or spaces? | nothing | residual |
| what comes next: 2, 4, 8, 16 | describe path | `NoDescription(...)` |
| wedding plan, "what am I missing?" | `Believe`, then nothing | `Unknown()` |

The two that work, work because someone wrote the answering path. The rest fail because
there is no mechanism that would find one. Four gaps:

1. **No search.** A residual is the end of the turn, not the start of looking.
2. **No prediction.** Nothing fills a hole from its surroundings.
3. **No choice.** `Or(Tabs(), Spaces())` has no reader.
4. **Dispatch by mood, not act.** A joke and a compliment are `Declarative()`, so they go to
   `Believe`, which files them as claims.

The seed shows the same thing from the other side. memory.ncon is 29,791 lines, 62% of the
seed, and most of it is a few blocks: `Believe` (6,802 lines), nine
`What/Who/Where x Do/Does/Did` blocks of about 1,176 lines each that differ only in their
head, `Who` and `What` (about 1,900 more), and a board game (`Board`, `Move`, squares) that
has nothing to do with memory. `Interrogative` (basic.ncon:1168) hardcodes eleven time words.
These are answer paths written by hand, which is what this design exists to replace.

## 2. The rule for what may be seeded

A seeded realization is legitimate when it would be the same code for chess, jam, and a
user's name. Search, compare, predict, store reads, arithmetic, collections, and compile
targets pass. Domain facts, word lists that decide meaning, and per-question answer paths
fail, and should be learned, researched, or derived.

## 3. The loop

```
message -> Ears -> expression -> Realize
                                   |
                     answered? ----+---- residual or tie
                        |                     |
                     Respond            Pursue(hole)
                                              |
                          Candidates: Mentions + IsA, ranked by Activation
                                              |
                          Attempt each under Hypothetical()
                                              |
                     a candidate Fills the hole?  -- its own missing input: Pursue(input)
                        |              |
                       yes            none
                        |              |
                  Chunk the path    Research(x), then retry
                        |              |
                     Respond        still none: conditional answer or honest residual
```

Pursue and Predict are two directions of one loop. Predict calls Pursue to find a rule
("2, 4, 8, 16": find `f` with `f(a_i) = a_(i+1)`, which is `Multiply(_, 2)`). Pursue calls
Predict to rank candidates when more than one could fill the hole.

## 4. Concepts

Everything below is a Concept with realizations. Host code gains no new identity.

### 4.1 Shared

| Concept | Exists | Meaning |
|---|---|---|
| hole | yes | the interrogative hole already used by `What(...)`. No new identity |
| `Hypothetical()` | no | facet declaring `Suppresses(Effectful())`, so an attempt cannot touch the world. `Suppresses` exists in basic.ncon |
| `Mentions(x)` | no | every relation and realization naming `x`, read from the store's existing mention index (`store.ts`, `byMention`) |
| `Fills(result, hole)` | no | the result is not residual and `IsA` what the hole asks for |
| `Budget` | no | facet carrying depth and step limits |
| `Activation` | yes | ranks candidates (memory.ncon) |
| `Evidence` | yes | reads the trace (judgment.ncon) |

No signatures are authored. `Name` is itself the type: to produce a name, look at what
mentions `Name` through relations or realizations. A Code body that returns a name without
mentioning `Name` stays invisible to search, and that is treated as a defect of the body.

### 4.2 Pursue

| Concept | Meaning |
|---|---|
| `Pursue(goal)` | find and run a path that fills the goal's hole |
| `Candidates(hole)` | `Mentions` of the hole's Concept and of what it `IsA`, ranked by `Activation` |
| `Attempt(candidate, hole)` | evaluate the candidate under `Hypothetical()` |
| `Research(x)` | exists in basic.ncon. The fallback when there are no candidates: Wikidata, Wikipedia, web, Teacher last |
| `Chunk(path)` | save the winning path as a realization, stamped with the path it came from |

A candidate's own missing input becomes `Pursue(input)`. That recursion is the system
talking to itself, and the trace is the transcript.

### 4.3 Predict

| Concept | Meaning |
|---|---|
| `Predict(hole, around)` | fill a hole from what surrounds it. "Next" has a left side, "middle" has both |
| `Corpus(x)` | what candidates are scored against: a given document, the trace, researched text |
| `DescriptionLength(expr)` | dropped. Surface length means nothing: a one-word Concept can realize to a 600-step chain. Scoring is by counts instead (surprisal), where a Concept reference is one symbol whatever it expands to |
| `Counts` | PPM-style context counts, derived from the corpus at query time, never stored |
| `BackOff` | drop context one level at a time when counts are thin. Shared with `Evidence` |
| `AntiUnify(a, b)` | least general pattern of two expressions; predicts structure |
| `Surprise` | a prediction that missed, added to the agenda |

"What am I missing" in a plan: research the plan's topic, take the source's structure as a
reference shape, anti-unify the user's plan against it. The unfilled slots are the answer.

### 4.4 Plan

`Plan` is a `List` of goals, some with holes. `Pursue` walks it, `Predict` fills a missing
step, `Judge` picks between alternative plans. A question is a one-step plan. The turn
itself (`turn.ts`) becomes a plan once these exist: hear, resolve, pursue, respond.

### 4.5 Judge

Stays inside `judgment-research.md`: no stored value verdicts, no seeded `Better`.

1. Ground each option, researching the unknown ones.
2. Find aligned dimensions: the options' shared parent, shared Wikidata properties, and
   criteria listed in "X vs Y" or "how to choose X" sources.
3. Dominance: at least as good on every dimension and better on one.
4. No dominance: a conditional answer, one line per non-dominated option naming the
   dimensions it wins on.
5. Frugal tie-breaks: recognition (Wikidata sitelink count as prominence), then take-the-best
   (decide on the first dimension that separates the options).
6. Still tied: ask about the dimension that splits the options most cleanly, and store the
   answer as `For(User)` evidence so back-off carries it forward.

### 4.6 Act

Dispatch reads the act, not only the mood: ask, tell, joke, encourage, vent, collaborate.
Each act predicts a kind of reply (conversation analysis: adjacency pairs). "What do I say
back" is `Predict(next turn, this turn)`. A question predicts an answer, which triggers
Pursue; encouragement predicts thanks, with no Pursue at all. Dialogue corpora with act
labels (DailyDialog) are a grounding source that is not the Teacher.

## 5. Build order

Each step ends in a real prompt answered end to end.

1. `Hypothetical()`, `Mentions`, `Fills`, `Budget`.
2. `Pursue` without `Chunk`. Demo: "what is my name?" answered with the name-specific path in
   `My` removed.
3. `Chunk`. Demo: the second ask selects the chunked realization, no search in the trace.
4. `DescriptionLength` and `Counts`. Demo: next word from a given document and starter.
5. `Predict` over items, calling Pursue for rules. Demo: "what comes next: 2, 4, 8, 16".
6. `AntiUnify`. Demo: the wedding plan's missing steps from a researched source.
7. `Plan`, then `Judge`. Demo: tabs or spaces answered conditionally.
8. Act dispatch. Demo: the joke and the compliment get replies, and neither becomes a claim.

Later, once these carry real traffic: the Ears ranking candidate parses by `Predict`
instead of keyword rules, the Ears and `turn.ts` expressed in IR, and the Teacher reduced to
the last source `Research` tries.

## 6. Seed cleanup, before step 1

- Drop chess.ncon. Only `chess.test.ts` depends on it.
- Move the board game out of memory.ncon (or drop it with chess).
- Drop the `Holiday` individuals in everyday.ncon.
- Leave the nine question blocks, `Interrogative`'s word list, and `My` in place for now.
  They are what step 2 and step 5 are measured against, and they get deleted as the
  mechanism that replaces each one lands.

## 7. Risks

- **Search blow-up.** Budget and activation pruning are the defence; unmeasured at scale.
- **Wrong chunks.** A saved path can be wrong. It carries provenance and is deleted or
  retracted like any fact.
- **Research quality caps judgment quality.** Bad parsing of a source gives confident bad
  criteria.
- **Unattended learning writes bad facts.** The audit hit this: "keep going" grounded `Keep`
  as a castle keep. Research needs a relevance check against the sentence it came from
  before anything is saved.

## 8. What was built, 2026-09-24

Measured on real prompts through the CLI, not only the test suite.

| Asked | Answer | How |
|---|---|---|
| my name is Keal / what is my name? | `Answer(Keal())` | Pursue: what was said, matched by shape (`Extends`) |
| my dog's name is Bolt / what is my dog's name? | `Answer(Bolt())` | same, no code about dogs or names |
| what is the capital of germany? | `Answer(Berlin())` | Pursue: world lookup, "capital" as property, "germany" as item |
| who is the author of dune? | `Answer(FrankHerbert())` | the sense that has the property (the novel, not the landform) |
| what is the currency of japan? (twice) | `Answer(Yen())` | second ask read from the graph, kept in the asked shape |
| what comes next: 2, 4, 8, 16 | `Predicted(32, Multiply(Previous(), 2))` | Predict: rule found among the graph's operations |
| what is next in 1, 1, 2, 3, 5, 8 | `Predicted(13, Add(BeforePrevious(), Previous()))` | second-order rule |
| what's next after 1, 4, 9, 16? | `Predicted(25, RaiseToPower(Position(), 2))` | positional rule |
| should I get a cat or a dog? | life expectancy 15 vs 9, meow vs bark, ... | Judge: shared-kind senses, aligned differences |
| should i learn python or javascript? | designers, typing discipline, inception | Judge: the language senses, not the snake |
| should I use tabs or spaces? | `NoCommonKind()` | no sense of each shares a kind; said so instead of guessing |

Pieces, each a Concept: `Mentions`, `Extends`, `Pursue`, `Fetch`, `WikidataSenses`,
`WikidataFind`, `LookUp` (packs/pursue.ncon); `Hypothetical` (basic); `Predict`, `Next`,
`After`, `Continue` (packs/predict.ncon); `Judge`, `Or` in questions (packs/judge.ncon).

Also changed: a statement is `Noted`, not run; a question nothing answered is pursued from
`Mood`, whatever word starts it; a residual the answer no longer holds is not a gap; bare
Concepts named side by side are peers and not lifted as facets; the CLI keeps a conversation
across runs.

### Known gaps

- "who founded microsoft" answers a date: "founded" matches an alias of inception. A who
  question should only accept someone. Pursue does not yet know what kind the question asks
  for.
- Judge has no direction on a dimension (is a longer life expectancy better?), so it can set
  differences side by side but not yet say "if you want X, pick A". That needs a goal
  (`For(...)`) or the user's past choices.
- Act dispatch (joke, encouragement) is not built. The design calls for predicting the reply
  from a dialogue corpus, which means downloading one (DailyDialog). Not done without asking.
- Plans ("what am I missing") are not built. Wikidata has no parts for a wedding; the next
  source to try is consensus across several web checklists.
- Recall that went with memory.ncon (who, where, did, beliefs about other people) is not
  recovered yet. Its tests are kept as todo targets.
- Continue copies long runs from its text, the same weakness the gzip model had.
