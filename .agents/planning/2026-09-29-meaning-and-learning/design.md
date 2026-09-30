# Meaning and learning: a design for an assistant made of concepts

Status: design, written 2026-09-29 from a working session with Keal, then revised after an
independent critique (appendix A lists what changed and why). Not a build plan. It is written as
for a new project: nothing that exists today is assumed to be right or to stay. Each section says
what is decided, the evidence behind it, and what is still open.

Source material, next to this file:

- `source/conversation.md` and `source/conversation.jsonl`: the session this came from (local;
  not committed while question 8 in section 27 is open).
- `~/.napkin/corpus/`: the analysed corpus (local only; it holds work messages). 1,595 items, each
  with a drafted expectation of what it means. See section 23.

## 0. What we are building, and why

An assistant that understands and acts without a language model. Everything it knows is a graph
of concepts; understanding a message means turning it into concepts and working it out; acting
means reaching small pieces of code that do real things. It learns from sources and from being
corrected, and everything it learns is kept as the same kind of structure it runs on, so it can
read, extend and repair itself.

The long-term aim is explicit: the assistant should eventually **write its own source code**, to
fix its own issues and add features when it needs them, the same way it writes readings into its
graph. Everything below is chosen so that is possible: the graph is in a form it reads and writes,
the core is small enough to understand, and every change it makes is checked (section 23) and can
be traced and undone.

The direction, in Keal's words:

> "the runtime should be so small ... the graph should be the thing crafting all this knowledge
> and actionable shit ... this isn't a rule implementer. I don't want grammars. I don't want to
> collect a bunch of pointless shit that we don't need in the graph ... it should still be dead
> simple."

> "the whole point of it being able to research and output in the same form as input is so it
> can write [its own graph] and add to or edit itself."

> "how can we get it so that i can stop asking you to fix it and IT can fix itself?"

### The core bet

Stated precisely, so it can fail:

1. A **learned scoring function** over readings that come **from the words themselves** (what each
   word is, what it takes, what it becomes) picks the intended meaning of ordinary messages well
   enough to act on them.
2. The words' readings can be built mostly by **importing structured resources** and by
   **understanding their definitions**, down to a small hand-checked seed.
3. The remaining gaps and wrong weights are fixed by **user corrections**, and corrections get
   rarer over time instead of piling up.
4. Nowhere are there per-question rules, domain-specific hand-written readings, or a language
   model.

Section 26 is the smallest experiment that tests this bet, and what result would stop the
project.

## 1. Principles

1. **Everything is a concept.** A word, a sense, a thing, a kind, an action, a mode, a rule.
2. **No string decides meaning.** Text from any source (a definition, a description, a page, a help
   text, a line of the assistant's instruction file) is something that was said, and is understood
   into structure the way a message is. Text that is content rather than meaning (a file's
   contents, a message to send, a quoted error, a URL) lives in a content store that concepts
   refer to (section 3). Keal: "just a straight up string that is never used is not helpful."
3. **Meaning is rewriting; acting is code at the bottom.** A word means what it expands to. It acts
   when the expansion reaches primitives, and only primitives are code.
4. **Words name states and results, not operations.** "left" in "how many are left" names what
   remains; subtraction is how it is computed.
5. **Kinds are weighted guesses, decided by evidence.** A thing's shape and the words around it
   vote on what it is.
6. **Several readings; a learned score picks** (section 8). Ask only when the score says the top
   two are close and would lead to different results.
7. **Honest when stuck.** "I don't know", "not specified", or a conditional answer beat a
   confident guess, and the assistant says why it is stuck (section 20).
8. **Answer by kind.** A question asks for a kind of answer; an answer of another kind is passed
   over.
9. **Everything learned carries provenance and a trust level** (section 17), so it can be traced,
   weighed and deleted. Sources are themselves concepts, and the list of sources is open: the
   user can add one, and the assistant can add one it found through its own research.
10. **Corrections are the main teacher.**
11. **The runtime executes concepts only as far as it has to.** The meat and potatoes come from
    the graph (in `.ncon` files, or whatever store replaces them: a database or JSON is fine if it
    serves better). The runtime knows no English and owns no meaning; it is a handful of
    algorithms (store, match, parse, score, rewrite, run, remember the conversation), and nothing
    in it is about any particular word.
12. **No grammar in the runtime; every rule lives on its word.** A rule like "When before something
    makes it a time" is not in the runtime. It is a reading, relation or realization on the concept
    When, used at parse time. Structure comes only from what each word says about itself: what it
    takes, what it attaches to, what it makes of its neighbours. Keal: "I don't want grammars"; the
    words are "acting on another word that it wraps".
13. **Same meaning, same reading.** Keal's phrasing, a plain paraphrase and a benchmark phrasing of
    one request are understood as the same expression (section 23 defines "same").

## 2. What the data says

1,595 items were analysed, each with a drafted expectation of what it means (section 23 has the
method and its limits):

- **Real** (700): Keal's own prompts to AI coding assistants (Claude Code, Codex), across 50
  projects, including long multi-part ones.
- **Bench** (775): 25 items from each of 31 benchmarks and assistant datasets: MASSIVE, CLINC150,
  SNIPS, MultiWOZ, Schema-Guided Dialogue, Taskmaster, Natural Questions, TriviaQA, HotpotQA,
  SQuAD v2, BoolQ, StrategyQA, GSM8K, ARC, CommonsenseQA, PIQA, SIQA, HellaSwag, WinoGrande,
  COPA, MMLU, TruthfulQA, WiC, DROP, FLUTE, PIE, IFEval, MT-Bench, WildChat, Dolly, Alpaca.
- **Test prompts** (120): prompts Keal typed while testing an earlier prototype. Low weight.

Percent of items with each feature (as tagged by the analysts):

| | Test prompts | Real | Bench |
|---|---|---|---|
| Needs an expansion (indirect request, idiom, filler, slang, typo) | 58 | 75 | 33 |
| Points at something ("it", "that", "the plan") | 43 | 62 | 31 |
| Real ambiguity to decide | 23 | 39 | 34 |
| Several asks in one message | 8 | 23 | 3 |
| Conditions ("if", "unless", "only if") | 1 | 22 | 2 |
| Constraints (don't X, length, format, scope) | 3 | 27 | 17 |
| Negation | 0 | 16 | 5 |
| Typo / slang / profanity | 8 / 8 / 0 | 20 / 21 / 14 | 3 / 0 / 0 |
| Comparison / quantity / date-time | 3 / 6 / 8 | 12 / 15 / 5 | 16 / 13 / 11 |
| Code / file / UI reference | 3 / 0 / 0 | 23 / 12 / 11 | 1 / 0 / 0 |
| Correction | 4 | 10 | 1 |

- Real prompts are hard on **understanding and the conversation**. Benchmarks are hard on
  **knowledge**. The design needs both, and neither is only Keal's.
- The analysts also guessed how many benchmark items a concept graph could handle (372 fully, 359
  partly, 44 not at all). That is a **model-estimated upper bound, unvalidated**. Several of these
  benchmarks (HellaSwag, PIQA, WinoGrande) were built to defeat knowledge-base and surface methods,
  and symbolic systems have historically scored near chance on them. Treat the number as a
  prompt for measurement, not a finding.

Focused cuts of the real prompts:

- **Call-outs** (120 real, from 180 candidates, paired with what the assistant had just done):
  underdid 19, misread intent 18, did not verify 14, ignored an instruction 13, overreach 10, asked
  instead of acting 8, hallucinated 7. Keal never called out an assistant for asking when it
  should have acted; stopping early and not checking are about half.
- **Files** (150): edit 22, read 20, create 9, fix 8, review 6, find 6, refactor 5. Named by path,
  as "the plan / the doc / the PR", by URL, by @mention, by convention, or as a bare path meaning
  "look at this and act on it".
- **Explanations** (150): about 45 need a record of what the assistant did and why; about 13% are
  really challenges, where the right answer corrects first.

## 3. The shape of a concept, and the content store

A concept has two kinds of content:

- **Facts**: what is true of it. `Paris IsA City`. A fact can hold only in a sense (section 5),
  and can carry a time (section 11).
- **Readings**: what it, applied to things, becomes.

A reading has:

- a **pattern** over lemmas and roles (not surface words), so "spilled the beans", "the beans were
  spilled" and "don't spill the beans" match the same reading (section 7);
- **wants**: what it prefers of its arguments and neighbours, as kinds and shapes; these become
  features for the score (section 8);
- **becomes**: another expression (a rewrite) or code (a primitive);
- **needs**: what must be known or obtained before it can act;
- **effects**, for readings that act: what changes, and how to check that it did (section 13);
- a **mode**, when it only applies while speaking, supposing or doing (section 4).

Everything that turns into something else is a reading: a synonym (`Plus($a, $b)` becomes
`Add($a, $b)`), a multi-word name, an idiom (`Let(Cat(Out(Of(Bag()))))` becomes
`Reveal(Secret())` unless a literal cat is in play), an indirect request (`Can(You(), $x)` becomes
`$x` when `$x` is doable), a definition (`Note()` becomes
`Message(Written(), From(Someone()), To(Someone()))` in one sense), a behaviour (`Add($x, To($c))`
with `$c` a Holder becomes the code that stores it).

**The content store.** Text that is content, not meaning (file contents, a draft, a quote, a URL,
the original words of a source), is kept as a block with an id. Concepts refer to blocks
(`Draft(Content("c-41"))`); blocks never decide meaning.

## 4. Modes and evidence

"Context" was being used for two different things. Keal:

> "what I originally wanted for context was something more like that than like a very strict,
> this is what this means in this context"

- **Modes** are how something is being run: Speaking (saying a result), Supposing (working out
  what would happen, changing nothing), Doing (acting). A mode is set only by the primitive being
  run: Say runs Speaking; working out a hypothetical runs Supposing; everything else runs Doing.
  Nothing in understanding sets a mode, so there is no hidden dispatcher.
- **Evidence** is everything a thing is next to: other words, their kinds, what the conversation is
  about, what the user has been doing. Evidence is always scored, never a switch. Mood (asking,
  telling, commanding) is evidence.
- Whether to act or only offer (section 10) is a decision of the score plus the guards, not a mode.

## 5. Words, senses, forms

- **A word is its forms.** "ate" and "eaten" are forms of eat. "Alternative form of X" is identity
  for understanding. Forms come from a lexicon.
- **Senses are coarse, and split only where behaviour differs.** Fine-grained sense
  disambiguation (WordNet granularity) has a long-standing ceiling around 65 to 72 percent, below
  the agreement between human annotators. So senses are grouped (supersense or OntoNotes-style
  granularity) and a word keeps two senses apart only when they lead to different facts or
  different acts. List as holder and list as the verb to enumerate differ; "class" as a group of
  people and as a school lesson may not need to, for an assistant. Keal's framing of what matters
  ("can this thing HOLD shit?") is the test: the split is where the act differs.
- **A sense can be the user's own.** A word the user defines ("ears means the hearing layer") is
  kept as that user's sense, mapped to the same concept anyone else would use for that meaning.
  That is how the user's senses and "same meaning, same reading" fit together: Keal's word and a
  paraphraser's word both reach one concept.
- **Part of speech is a fact about a word.** A statistical tagger is at most a tiebreak for words
  the graph does not know yet.

Open: whether senses are separate concepts or one concept with sense-scoped facts (section 27).

## 6. The seed

Definitions are understood by the understander, which needs definitions. That circle needs a base:

- **A small hand-checked seed**: the primitives (section 9), plus a few hundred core meanings in the
  style of semantic primes and VerbNet's semantic predicates (someone, something, do, happen,
  have, be in, part of, cause, before, after, more, not, can, want, know, say, good, bad, and
  similar). The seed is written once, reviewed by Keal, and small enough to read in an afternoon.
- **Every learned meaning must bottom out** in the seed within a bounded number of expansion
  steps. A definition that cannot is kept as pending (open question 6 decides whether pending ones
  are kept), and its unknown words go on the to-do list.
- **Coverage is measured, not assumed**: the fraction of the top 5,000 lemmas whose senses bottom
  out in the seed after import. If it is under about 60 percent, principle 3 is not reachable yet,
  and the project says so (section 26).
- This is where earlier "read the dictionary" projects stalled (Cyc's knowledge acquisition,
  MindNet, Extended WordNet's logical forms). The difference here is narrow: coarse senses, a
  seed that is only the meanings acts need, and corrections as the repair channel. Whether that
  difference is enough is exactly what the smallest experiment tests.

## 7. Understanding a message

Understanding builds a small set of candidate readings, driven by what the words say about
themselves.

**The algorithm: a chart over word valence.**

1. **Words and forms.** Split into tokens; look each up (lemma, forms, parts of speech, the user's
   own words); propose spelling corrections from known vocabulary as competing tokens, never
   silently.
2. **Shapes and kinds.** Each token proposes kinds from its shape (five digits, `#` and digits, a
   path, a URL, `snake_case`, a time like "5pm"), from facts on shape kinds
   (`ZipCode HasShape(Digits(5))`, sourced where a source has one, such as Wikidata format
   constraints).
3. **Build a chart bottom up.** Adjacent spans combine when one word's valence takes the other
   (a head and a filler for one of its roles). Multi-word names, idioms and phrasal verbs are
   spans too, matched over lemmas and roles. Every span in the chart is a partial reading with a
   score (section 8).
4. **Prune per span.** Keep the top k readings for each span (k small, such as 4 to 8) by score.
   Spans give the constituents that pruning needs, so the sense-times-attachment blowup is cut
   at every level instead of at the end.
5. **Read off full readings** for the whole message (several clauses become a plan, section 12)
   and hand the top few to evaluation.

This is lexicalized, head-driven chart parsing: the only structure is what words say they take,
which is what principle 12 means. It is a known, well-behaved family of algorithms (the cost is
polynomial in message length times k), not a new invention.

**Where the rules are.** Every step above reads facts and readings on words and kinds; none of
it is written into the runtime. "When" says it opens a time; "near" says it takes a place; "the"
says a thing follows; a five-digit shape says it can be a ZipCode. The runtime only builds the
chart and asks each word what it does.

**What else understanding does:**

- **Neighbours vote** through features: "server" near 8080 raises Port; "zipcode" or "store near
  me" near 85257 raises ZipCode; "the author of" raises Dune the novel; "kill" makes Hamlet the
  character.
- **Non-language is set aside first**: tool wrappers, pasted file headers, image tags, transcript
  markers.
- **Tone is kept apart.** Profanity, "lol", "like", "idk" become the message's tone (emphasis,
  frustration, playfulness), not content. Profanity alone does not mean a correction.
- **No network during understanding.** Lookups happen in evaluation (section 18), so understanding
  has a predictable cost (section 21).

## 8. Choosing a reading: the score

Keal:

> "maybe we give it like a score ... this version is really good score. This version, yeah, it
> doesn't make a ton of sense how it's being said ... if they have almost the same score ... we
> just ask the user"

The score is a **log-linear model over named features**, one weight vector, learned:

- **What is scored**: a reading (full or partial, for a span in the chart).
- **Features** (each a named concept, so the reasons log can say which ones decided):
  - every word used (no leftover words);
  - each role filled with a wanted kind (per want of each reading);
  - shape fit (a five-digit number filling a ZipCode role);
  - neighbour features, with backoff: exact neighbour word, then neighbour kind, then conversation
    topic;
  - sense frequency prior (from sense counts in the imports);
  - needs that can be met from the graph or the conversation;
  - evidence from past picks and corrections (section 15);
  - after evaluation: whether it reached an answer or an act.
- **Combination**: a weighted sum of features, turned into a probability per candidate for the
  same span or message (softmax).
- **Learning**: a perceptron-style update when a correction or a pick says which reading was
  right: raise the features of the right one, lower the features of the chosen wrong one, with a
  cap on how much one correction can move any weight, so one angry correction cannot flip a
  common sense.
- **Calibration and asking**: the probability of the top reading is checked against how often it
  was right on the corpus. The assistant **asks** when the top probability is below a threshold
  and the top two lead to different acts or answers; if they lead to the same result, it does not
  ask. The threshold is tuned against Keal's call-outs, which cost differently: he never called
  out asking when it should have acted, so under-asking and stopping early are the expensive
  errors.

This makes "the score is the whole ballgame" a defined, testable, debuggable thing: a result can
always be explained by which features fired, and a bug can be told from a weight.

## 9. Acting, expanding, and the primitives

Evaluating an expression tries its readings, most fitting first:

1. **A code reading fits**: do it (a primitive).
2. **A rewrite reading fits**: expand, and evaluate the result.
3. **Nothing fits**: it is unworked. Look it up, learn a reading, or ask.

A word acts when its expansion reaches primitives. "get rid of milk": GetRidOf becomes Remove, and
Remove on a Holder runs. "what value do you add" matches the idiom reading of `Add(Value())` and
becomes Contribute before any arithmetic reading gets a chance. Whether to act or expand is fit
and score, not a separate rule.

**Primitives** (the only code that touches the world):

- Holding: Store, Remove, Contains, Set (a property).
- Knowing: LookUp, Remember (a fact about the user), Compare, Count, Rank, Filter, Sort,
  Arithmetic, Now.
- Reading and writing: Read (a file, a page, an image), Write/Edit, Fetch, Search.
- Doing: Run (a command), Operate (drive a UI or a browser), Schedule.
- Talking: Say, Ask.
- Sequencing: Sequence (run steps in order, passing results). Planning itself is not a primitive:
  a plan is what expansion with needs produces (section 12); Sequence only runs it.

Git verbs, Teach, Watch, Speak, Revert, Constrain and Delegate are readings over these, not
primitives.

## 10. Verbs act on what they are given

The same verb does different things depending on the kinds of its arguments. Add to a Holder:
store it. Add Numbers: a sum. Add a property to an Object: set it. `Add(Value())`, said of someone
in conversation: contribute. The kind checks come from the words' meanings (a List is a Holder
because a list holds items), not from a list of container types. Keal:

> "can this thing HOLD shit? its a list... does this mean to get rid of, or take something away,
> its remove. is it a verb that means that the state of the thing it acts on changes somehow?"

Verb resources (VerbNet's semantic predicates: cause, has_state, transfer, motion, change_value)
supply what a verb does to its arguments and feed the seed (section 6).

## 11. States, time, negation, scope and modality

Keal, correcting "left/remaining means subtract":

> "fairly certain these mean like the result AFTER something like subtraction"

**Words name states.** "how many are **left**" names the remaining quantity; "turn **left**" a
direction; "he **left**" departed; "**left** it on the counter" was put somewhere. Neighbours score
which state fits. Operations are how states are reached.

Rewriting terms does not give scope, negation, time or modality for free, and real prompts need
all four (16% negation, 22% conditions). So readings produce a **small logical form** on top of
concept expressions:

- **Negation** over a sub-expression: `Not(Delete(...))`, and over a plan: "only suggest, don't
  delete" is `Only(Suggest(...))` plus `Not(Delete(Any()))` over the whole plan.
- **Quantifiers** with a restriction: `Every(File, restricted to: InFolder(X))`, "any", "all
  except the plan" as `Every(File, except: Plan())`.
- **Time**: facts and events carry a time index; tense and aspect words ("yesterday", "still",
  "again", "was") are readings over that index ("still broken" means broken now and before the
  last fix).
- **Modality**: "should", "could", "might", "must" mark what is being asked (advice, permission,
  possibility, requirement) and change the act (advise versus do).
- **Conditions**: `If(condition, then, else)`, checked at evaluation.

This logical form is part of the seed and is tested first on the constraint and condition items.

## 12. Needs, plans and asking

A reading can say what it needs. When a need is not met: try to get it (look it up, reason from
what is known, make it); if that fails, ask; if that fails, stay unworked, honestly.

**Implied wants.** A bad state said to a helper implies wanting the good state: "ci is failing"
wants a fix; "I was looking for my keys and couldn't find them" wants the keys found, and finding
needs a place last seen, so the assistant checks what it was told ("I put my keys on the counter")
or asks. Decided: offer when the action has consequences; act when it is only a lookup.

**A message is a plan.** Several asks become an ordered sequence:

- **Order** from the words ("then", "after that", "before", "first") or the spoken order.
- **Later steps point at earlier results**, including things that do not exist yet when the
  message is heard ("create the ticket, then add its id to the PR"): such a reference is a hole
  filled when the earlier step runs.
- **Conditions and alternatives**: "if it's already set up", "if not", "whichever is easiest".
- **Constraints over the plan**: "only suggest, don't delete", "no commit before review". Their
  scope is an attachment decision like any other, scored in the chart; most come last and apply
  to what came before, but some come first ("without committing, fix X").
- **Retraction mid-message**: "actually nevermind".
- **Checkable output constraints** (length, format, keywords, case, language) are checked on the
  result, with check and redo before saying done.
- **Guards on consequential actions** (delete, force-push, submit, send, purchase): offer first,
  act when told, unless a grant from a trusted source lifts the guard (section 17).

**State tracking.** Who holds what, what is in what, a running balance: kept as facts with times,
changed only by primitives' declared effects (section 13).

## 13. Effects and verification

Every primitive declares its **effects** and a **check** for them: Store's check is that the
holder now contains the item; Edit's is that the file now has the change; Run's is the exit status
and the expected output. "Done" means the checks passed. A step whose check fails is not done, and
the assistant says so and tries the next hypothesis.

This is the structural fix for Keal's most common call-outs: "did not verify" (14), "underdid"
(19), and "still broken" (the last fix was wrong: change the hypothesis). It also bounds the frame
problem: only declared effects change state; everything else stays as it was.

## 14. The conversation is a structure

Half of real prompts point at something, and the conversation is the most common source of what a
message needs. It is a structure the assistant keeps:

- **The last few readings with their choice points** (senses, referents, which reading won and
  what it beat, with scores).
- **What is in play**: the list, the PR, the plan, the doc, the branch, the file just edited, the
  person just discussed. Items decay as the conversation moves on.
- **The last proposal and the last question**, so "sounds good", "yes and", "1", "5b" resolve.
- **Open questions**, **standing rules** (section 17) and **the reasons log**.

**Referents are ranked**, not just taken by recency: kind match first ("it" in "push it" wants
something pushable), then salience (mentioned, acted on, just failed: "fix the test" means the one
that failed), then recency. The corpus scores references as their own metric.

**Fragments fill holes.** A fragment ("the animal?", "github link", "look again?") fills the open
need or choice point of the last reading whose kind it best matches. If none matches well enough,
it is a new message.

**Asides are not answers.** Keal:

> "i havent read your response (i do this alot, we should ensure that if a response says it
> hasnt read or acknowledged a prior message that its not interpreted as a response)"

A message that says it has not read the last reply leaves the assistant's open question open.

**The reasons log** records why, not only what: which reading won and on which features, which
need drove a lookup, which rule or grant allowed an action. "Why did you do that?" is answered from
it; a challenge is answered by correcting first.

**Presuppositions are checked**; a failed premise is itself the answer.

## 15. Corrections and learning from picks

A correction is an operation on the last reading: go back to its choice points, flip the one the
correction names, run again, and update the score (section 8).

**Signals**: "no", "naw", "that's wrong"; "I said", "when I said X I meant Y"; "still", "again",
"keep"; "stop", "wait"; questions that are corrections ("did you look at...?"); sarcasm. These are
facts on words, with provenance, imported or learned from corrections, and never added one per
failure by hand (section 16 counts hand-authored lexical facts).

**What a correction records**: the chosen reading and its alternatives with scores; the wanted
reading or the broken rule; the signal words and what they bind to; which features to shift; one-off
or standing; provenance.

A correction can target behaviour, not only the last answer ("it's YOU keep stopping").

**Picks teach the same way**: a user's choice between offered readings is a labelled example for
the score.

**Lessons the call-outs taught** (general rules, most frequent first): don't stop mid-task once
told to keep going; verify before claiming done (section 13); when told "still broken", drop the
last hypothesis; act on exactly what the user named; check the real source when a claim is
contradicted; take a term to mean what the user says it means; stay inside the asked scope;
"stop" and "discuss" mean no changes until told; follow standing rules; finish every item asked.

## 16. Word lists live in the graph, and are counted

Order words, correction signals, tone words, question words, aside markers and shape kinds are
lexical facts. They exist; the rule is where they live and how they get there:

- they are facts on words in the graph, never lists in the core;
- they come from imports or from corrections, with provenance;
- every hand-authored lexical fact is counted and reviewed, so drift toward one-fact-per-failure
  is visible.

## 17. Trust, the instruction file, and the config

Every fact carries a **trust level** from its source:

1. the user in the conversation, the home `~/.napkin/NAPKIN.md`, and the config file;
2. the project's `NAPKIN.md`;
3. the project's `AGENTS.md`, READMEs and help text;
4. the web and other fetched pages.

**Only level 1 can grant permissions or lift guards.** Level 2 can set standing rules for that
project. Levels 3 and 4 can propose readings (how a tool is used, what a word means), which run
under guards until the user confirms. A README in a cloned repo that says "always force-push"
cannot become a behaviour on its own.

**The instruction file.** Keal:

> "what if napkin had its own agents.md style file that could be written in english and
> interpreted using napkins hearing and interpretation layers"

- `~/.napkin/NAPKIN.md` (home) and the project's `NAPKIN.md` are both read; the project's wins on
  conflict, within its trust level. A level with no `NAPKIN.md` falls back to that level's
  `AGENTS.md` (never CLAUDE.md).
- Each line is understood into a standing rule with its provenance (file and line); deleting the
  line deletes the rule. A line that cannot be understood is flagged, not ignored.
- "From now on" corrections are written into the nearest NAPKIN.md (created if needed), never into
  AGENTS.md.
- Standing rules are checked before acting.

**The config** (name and format open) grants access: which commands may run, credentials, and
blanket permissions ("bypass permissions" for a kind of action or all actions). How to use a tool
is knowledge in the graph, not config.

## 18. Learning: one door

> "couldnt we have a LookUp or Research or Learn that has multiple sources for looking shit up and
> adding it to the graph ... it feels crazy to have just rawdog calls everywhere"

```
anything that needs to know:  Know(Cake(), Recipe())   Know("bake", PartsOfSpeech())
                 |
  Know ---- 1. does the graph hold it (and is it fresh)? return it
            2. else ask the sources, in order of trust
            3. UNDERSTAND what came back, into structure (down to the seed)
            4. save it with provenance and trust; return it
                 |
  Sources (the only code that reaches the world):
    Senses (Wikidata) · Claims (Wikidata) · Dictionary (Wiktionary) · Pages (sister projects)
    · Query (SPARQL) · Web
                 |
  Fetch: one place; cached per URL, throttled, retrying, one polite user agent
```

- Nothing but Know asks the world; callers never fetch.
- One implementation per question: a word's senses, a thing's claims, a dictionary page.
- **Sources are concepts, and the list grows.** Each source is a concept with facts: what it
  answers, how it is reached, its license, its trust level, whether its answers are kept. A user
  can add a source ("use the MDN docs for JavaScript questions"), and the assistant can add one it
  found while researching, at a low trust level until it has proven reliable. Every fact names the
  source it came from.
- What comes back is understood (definitions become readings, descriptions facts, aliases other
  names) or kept in the content store; unknown words in a definition go on the to-do list.
- Saved once, one way: an import record for the source, then facts stamped from it.
- **Freshness is a fact about a source**: exchange rates and weather are not kept; facts about the
  user carry a date and are re-checked when old; items in play decay.

What each source returns, from what uses need:

- **Senses(word)**: per sense, id, label, description, popularity, kinds (ids and labels),
  sister-project page titles, and whether it is the main encyclopedia article for the word; main
  article first, then popularity; internal bookkeeping items dropped. The asker ranks on top by
  what the question needs.
- **Dictionary(word)**: senses per part of speech in the page's order, cleaned once, and pointers
  parsed once (alternative form of, plural of, superlative of).
- **Claims(ids, properties)**: batched, labels included.
- **Pages**: namespaces, search, page text, and a page read into sections, lists, links and
  categories; the license is a fact on the site.
- **Query**: SPARQL for questions no single item answers.
- **Web**: search and reading a page's lists and text.

## 19. The base graph

> "we need to teach like a lot of the basics, like the very most common English words and the most
> common phrasings ... build that base so that it can actually do things properly"

| Need | Source | License |
|---|---|---|
| Which words (top ~5000) | wordfreq | data CC BY-SA 4.0 |
| Senses and sense relations | Open English WordNet (coarsened, section 5) | CC BY 4.0 |
| Forms, alternative forms, idioms, phrasal verbs | Wiktionary (Kaikki / wiktextract) | CC BY-SA |
| What verbs do to their arguments | VerbNet 3.4 | permissive |
| Frames and roles, fallback | FrameNet | to confirm before import |
| Commonsense needs and effects | ConceptNet 5.7, ATOMIC 2020 | CC BY-SA / CC BY 4.0 |
| Senses tied to things | Wikidata lexemes | CC0 |

- **Measure before building on it**: after import alone, what fraction of the corpus's words get a
  sense with a reading that reaches a primitive? That number is reported, and decides how much of
  the corpus is even reachable.
- ConceptNet is noisy and ATOMIC is free text, so both must be understood before use and inherit
  the seed's limits (section 6). Low precision is expected; they enter at a low trust level.
- ShareAlike sources stay in separate packs with provenance, so they can be dropped.
- Imported senses are candidates, weighed by use; evidence from use outranks the import.
- **Packs are versioned**; learned facts refer to the pack version they were built on, and a
  migration path exists before the first real import (reimporting, or changing the data model,
  must not strand learned facts).

## 20. How it talks when it does not know

"Stays unworked" needs a voice. A small set of honest responses in the Speaking mode, keyed by why
it is stuck:

- no sense for a word: "I don't know what X means yet. What is it?";
- no source: "I couldn't find that anywhere I can look.";
- no permission: "I can do that if you let me: [what it would do].";
- a need not met: "To do that I need [need]. [Ask for it.]";
- two readings too close: "Did you mean A or B?" (section 8).

The rate of "I don't know" on the real prompts is a tracked number, alongside accuracy.

## 21. Performance

- **Understanding** a message takes under 200 ms, with no network (section 7).
- **Lookups** happen during evaluation, cached, throttled, and cancellable.
- **Loading** the base graph (tens of thousands of senses) must be fast enough to start a session
  without waiting; index by lemma and load senses lazily.
- **The replay gate** replays only the cases that touch what changed (an index from concepts to
  corpus cases), plus a full replay in batches.

## 22. Tools, writing and output

**Tools are learned readings.** Keal:

> "commit and push assumes git is in the house and then it sequences git commit (with a decent
> message describing the committed code and only including the correct code) along with pushing
> after that. It shouldn't need tools to do that ... I'd prefer the graph since it is adaptable
> to be able to learn a tool or learn how to use them effectively when provided."

- "commit and push" is a composition: Commit needs a repository (checked by looking); it expands
  to choosing the files this work changed (from what is in play and the reasons log), writing the
  message by summarizing the change, running the commit, then Push; effects and checks as in
  section 13.
- **Learning a tool is understanding its documentation** (`--help`, a man page, a README), into
  readings realized as running the command; learned at trust level 3, so under guards until
  confirmed.
- Tools can be taught in NAPKIN.md. The config grants access.

**Code is language too.** The assistant is an assistant, so it reads code, understands it,
changes it and writes it back, as it does English: code is heard into concepts (what a function
takes, gives and does), and changes are readings over those concepts, written back out in the
language. There is no separate, hand-written "code version" of each instruction; code-specific
readings exist only where they have to (a language's syntax is facts on that language's words),
and descriptions or answers about code are derived from its concepts like any other.

**Writing** is facts, an outline (genre shapes as loose defaults, never rigidly prescriptive; the
user's constraints override them), wording (readings in the Speaking mode), and a check against
every checkable constraint, then redo. Honest for letters, plans, summaries, explanations, lists,
reviews, and transforming given text. For long invented stories and scripts, it says plainly what
it cannot do.

## 23. Evaluation

**What the corpus is.** 1,595 items, each with an expectation drafted by model subagents from a
shared schema (intent, gist, a nested-expression sketch, expansions, kinds, references, needs, acts,
ambiguity), in `~/.napkin/corpus/` and normalized into test cases in `~/.napkin/corpus/tests/`.

**Its limits, and what is done about them.**

- **Circularity.** The expectations were drafted by language models, for a system meant to work
  without one. So they are a to-do list and a draft, not ground truth, until checked. **Keal
  hand-checks a stratified sample of 100** (across groups and intents); the rate at which he agrees
  with the drafted expectations is reported, and it bounds how much the rest can be trusted.
- **Normalization before scoring.** The drafted `acts` use hundreds of free labels; they are mapped
  onto the primitives of section 9. The drafted `intent` labels come from intent classifiers, not
  this design; intent is kept only as a derived label (what the top reading's act is), not a
  checked target. The nested-expression sketch is scored by a graded match after normalization:
  the same primitives, the same argument kinds, the same references.
- **Same meaning, same reading** is defined on that normal form: a real prompt and its paraphrase
  pass when their normal forms are equal.
- **Holdout.** 30 percent of the real prompts are held out and never tuned on.
- **Small samples.** 25 items per benchmark gives confidence intervals of roughly plus or minus 20
  points; per-benchmark numbers are reported only with intervals, and conclusions are drawn only
  across groups.
- **Weighting.** Tuned on the training part of Keal's real prompts; the benchmarks check it is not
  only learning Keal; the test prompts are a smoke test.
- **The replay gate.** A learned fact, reading or correction is kept only if affected replays still
  pass (section 21). It proves nothing regressed, not that the new meaning is right; the holdout
  and the hand-checked sample are what measure rightness.

## 24. The core

The core does only this: store concepts, facts, readings and content blocks, with provenance and
trust; match patterns over lemmas and roles; build and prune the chart; score readings; rewrite
and run primitives; keep the conversation structure; learn weights from corrections and picks.

The core must not contain: word lists, English wording, answer-shaping rules, special-cased concept
names beyond a handful of structural ones, or grammar rules. Each of those is a fact or a reading
on a word, in the graph.

The graph is written in the same form the assistant reads and writes, so the assistant can
inspect, extend and repair its own readings.

## 25. Risks

- **The seed may not be enough** for definitions to bottom out (section 6). Measured early.
- **Scoring may not generalize** from corrections to new messages (sparsity). Measured on the
  holdout.
- **Hard benchmarks may stay near chance** (commonsense completion). Accepted; they are a check,
  not the target.
- **Asking too much or too little.** Calibrated on the call-outs (section 8).
- **Cycles in definitions.** Expansion stops at the seed or at something already visited.
- **Scale.** Loading, the chart, and the replay gate have budgets (section 21).
- **Licenses.** ShareAlike sources kept separable; FrameNet's license confirmed before import.
- **Security.** Text from untrusted sources becoming behaviour; bounded by trust levels (section
  17).

## 26. The smallest experiment

Before building wide, test the core bet in one domain with a real act.

- **Domain**: lists and reminders (Store, Remove, Contains, Schedule, Say) or files and git.
- **Data**: about 150 held-out real prompts in that domain, from the corpus, with Keal-checked
  expectations.
- **Built by hand**: only the core, the primitives, and the seed. **No readings for the domain.**
- **Imported**: WordNet (coarsened), VerbNet and wordfreq, for that vocabulary.
- **Measured**:
  1. how often the right act and arguments come out of import alone;
  2. after running corrections on a training half, how often on the held-out half;
  3. how many hand-written facts were tempting to add (none are added).
- **Go**: import alone reaches at least 50 percent correct acts, corrections lift the held-out half
  by a real margin, and nothing was hand-authored for the domain.
- **Stop or rethink**: import alone is under 30 percent, or gains from corrections do not carry
  over to held-out prompts.

This takes weeks, not months, and says whether building the rest is worth it.

## 27. Open questions

Decided in the session (recorded so they are not reopened): "no grammars" means no rule in the
runtime, with every rule on its word's concept (principle 12); the runtime executes only as far as
it has to, the graph holds the substance; sources are concepts and the list is open; writing its
own source code is an explicit goal; code is understood as language; facts and readings as the
whole data model; modes as switches, everything else evidence; text understood into structure, content kept as
content; offer for consequential implied actions, act for lookups; corrections and picks as the
main teacher; the corpus kept in `~/.napkin`; writing from facts and loose templates; tools as
learned readings, config for access; NAPKIN.md falling back to AGENTS.md, never CLAUDE.md;
permissions grantable up to all actions.

Open:

1. **Word and sense**: one concept per word with sense-scoped facts and readings, or a concept per
   sense?
2. **When to understand definitions**: at import, or when a word is first used?
3. **Imports versus use**: how much weight an imported sense gets before use confirms it.
4. **The primitive list**: anything missing from section 9?
5. **Starting point**: a new project from nothing, or a new base alongside the existing prototype?
6. **A definition that cannot be understood yet**: kept as pending, or dropped?
7. **The config file**: name, format, where it lives.
8. **The transcript next to this file**: about 36 MB, includes summaries of work prompts, and the
   repo is public. Commit both, only the readable `.md`, or keep both local?
9. **The store**: `.ncon` files, a database, JSON, or something else; whichever serves reading,
   writing and loading tens of thousands of concepts best.
10. **Trust levels** (section 17): may a project's own NAPKIN.md grant permissions, or only you?
11. **The hand-checked sample**: will you check 100 items, and which domain for the smallest
    experiment (lists and reminders, or files and git)?
12. **Stop criteria**: are the go and stop numbers in section 26 the right ones?

## Appendix A. What the critique changed

An independent reviewer critiqued the first version as hard as possible. What changed:

- **The score is defined** (section 8): log-linear features, learned weights, a capped perceptron
  update, calibrated asking. Before, it was "a handful of signals, tuned".
- **Understanding has an algorithm** (section 7): a chart over word valence with per-span pruning.
  "No grammars" is kept as Keal's intent: no rule in the runtime; every rule, including "When
  before something makes it a time", lives on its word's concept (principle 12, confirmed by
  Keal).
- **Definitions have a base case**: a small hand-checked seed, bounded bottoming out, and a
  coverage measure (section 6).
- **Evaluation is honest about circularity** (section 23): model-drafted expectations are a draft;
  a hand-checked sample, normalization to primitives, intent as derived only, a holdout, intervals.
- **Feasibility numbers are relabeled** as an unvalidated upper bound (section 2).
- **"The core is tiny" is made precise**: the runtime executes concepts only as far as it has to;
  the substance is in the graph (principle 11, section 24, confirmed by Keal).
- **Word lists** exist as lexical facts in the graph, from imports or corrections, counted (section
  16).
- **Modes** are set only by the primitive being run (section 4).
- **"No loose strings"** becomes "no string decides meaning", with a content store (principle 2,
  section 3).
- **Senses are coarse**, split only where behaviour differs (section 5), because of the known
  ceiling on fine-grained sense disambiguation.
- **Added**: a small logical form for negation, quantifiers, time, modality and conditions (section
  11); effects and checks on primitives, making "verify before done" structural (section 13);
  ranked referents and a defined fragment merge (section 14); trust levels on sources (section 17);
  freshness and decay (section 18); versioned packs and migration (section 19); honest responses
  keyed by why it is stuck (section 20); a performance budget (section 21); the core bet and the
  smallest experiment with go and stop numbers (sections 0 and 26).
- **Idiom patterns** match over lemmas and roles, not surface words (section 3).
- **Planning** is not a primitive; Sequence runs a plan that expansion produces (section 9).
- **Constraint scope** is scored like any attachment, not assumed to reach backwards (section 12).
- **Kept as decided in the session**, where the critique suggested otherwise: Keal's "no grammars"
  (made precise, not dropped), and a small core as the aim (made precise, not dropped).
