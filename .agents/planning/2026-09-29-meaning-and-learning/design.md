# Meaning and learning: a design for an assistant made of concepts

Status: design, written 2026-09-29 from a working session with Keal, revised after independent
critiques (appendix A lists what each round changed). Not a build plan. It is written for a new
project, built from nothing: the existing prototype (Napkin) is inspiration and a place to lift
code from deliberately, never a constraint. Each section says what is decided, the evidence
behind it, and what is still open.

Source material, next to this file:

- `source/conversation.md` and `source/conversation.jsonl`: the session this came from (local;
  not committed while question 3 in section 30 is open).
- `~/.napkin/corpus/`: the analysed corpus (local only; it holds work messages). See section 26.

## 0. What we are building, and why

An assistant that understands and acts without a language model. Everything it knows is a graph
of concepts; understanding a message means turning it into concepts and working it out; acting
means reaching small pieces of code that do real things. It learns from sources and from being
corrected, and everything it learns is kept as the same kind of structure it runs on, so it can
read, extend and repair itself.

The long-term aim is explicit: the assistant should eventually **write its own source code**, to
fix its own issues and add features, the way it writes readings into its graph. That aim is not
part of the first experiment, and when it comes it works inside a protected base it can never
change (section 20).

In Keal's words:

> "the runtime should be so small ... the graph should be the thing crafting all this knowledge
> and actionable shit ... this isn't a rule implementer. I don't want grammars. I don't want to
> collect a bunch of pointless shit that we don't need in the graph ... it should still be dead
> simple."

> "the whole point of it being able to research and output in the same form as input is so it
> can write [its own graph] and add to or edit itself."

> "how can we get it so that i can stop asking you to fix it and IT can fix itself?"

### The core bet

Stated so it can fail:

A fixed runtime (a chart parser over word entries plus a learned scorer), a small counted seed
(core meanings, the function-word lexicon, and a bridge from verb meanings to primitives, all
written and frozen before any test data is looked at), and imported lexical resources together
produce the right act, arguments and referents for a useful share of real requests in one narrow
domain. Corrections on training requests then raise that share on unseen requests by more than
the measurement's uncertainty, the rate of needed corrections falls over use, the system beats a
simple keyword baseline, and no facts are added for the domain along the way.

Section 29 is the experiment that tests this, with go and stop numbers.

## 1. The project, the language, the files

- **A new project**, not an edit of Napkin. Napkin's store, journal and provenance stamps, its
  JavaScript-to-IR importer and formatter, its selection by specificity, its corpus runner and its
  Wikidata and Wiktionary fetchers are worth lifting, each deliberately and each reviewed against
  this design and the builder guide (`AGENTS.md` in this folder). Nothing is carried over by
  default. Before code, the new project writes its specs (section 27).
- **The language is N-Con**, the language of nested concepts, and its files are `.ncon`. (The name
  began as "napkin concept"; the N now stands for nested, which is what the language is:
  `Add(Milk(), To(My(List())))`.) N-Con is what the assistant hears into, reasons in, speaks from
  and acts on, and what its graph is written in.
- **The project's name** is open. Candidates are ranked in `names.md`; Keal is leaning toward
  Sandwich.
- **The store** behind the graph (`.ncon` files, a database, JSON) is open (section 30); whatever
  it is, the graph is readable and writable in N-Con.

## 2. Principles

1. **Everything is a concept.** A word, a sense, a thing, a kind, an action, a mode, a rule, a
   source.
2. **No string decides meaning.** Text from any source is understood into structure, or kept as
   content in a content store that concepts refer to (section 4). Keal: "just a straight up string
   that is never used is not helpful."
3. **Meaning is rewriting; acting is code at the bottom.** A word means what it expands to. It acts
   when the expansion reaches primitives, and only primitives are code.
4. **Words name states and results, not operations.** "left" in "how many are left" names what
   remains; subtraction is how it is computed.
5. **Kinds are weighted guesses, decided by evidence.**
6. **Several readings; a learned score picks** (section 9). Ask only when the score says the top two
   are close and would lead to different results.
7. **Honest when stuck**, and saying why (section 23).
8. **Answer by kind.**
9. **Everything learned carries provenance and a trust level** (section 20). Sources are concepts,
   and the list of sources is open: the user can add one, and the assistant can add one it found
   through its own research.
10. **Corrections are the main teacher.**
11. **The runtime executes concepts only as far as it has to.** The meat and potatoes are in the
    graph. The runtime knows no English and owns no meaning; it is a handful of algorithms (store,
    match, parse, score, rewrite, run, remember the conversation), and nothing in it is about any
    particular word.
12. **No grammar in the runtime; every rule lives on its word.** A rule like "When before something
    makes it a time" is not in the runtime. It is a fact or reading on the concept When, used at
    parse time. Taken together, the words' entries are a lexicalized grammar (every rule on a word,
    as in CCG or HPSG); that is exactly what Keal means by "no grammar": there is no grammar
    *outside* the words. The runtime has only a few universal combining steps that no word owns,
    listed in section 8.
13. **Same meaning, same reading.** Keal's phrasing, a plain paraphrase and a benchmark phrasing of
    one request are understood as the same expression (section 26 defines "same").

## 3. What the data says

1,595 items were analysed, each with a drafted expectation of what it means. The drafts, and the
tags behind the table below, were written by model subagents from a shared schema; they set
priorities, and they are validated by Keal's hand-check (section 26) before anything rests on them.

- **Real** (700): Keal's own prompts to AI coding assistants (Claude Code, Codex), across 50
  projects.
- **Bench** (775): 25 items from each of 31 benchmarks and assistant datasets: MASSIVE, CLINC150,
  SNIPS, MultiWOZ, Schema-Guided Dialogue, Taskmaster, Natural Questions, TriviaQA, HotpotQA,
  SQuAD v2, BoolQ, StrategyQA, GSM8K, ARC, CommonsenseQA, PIQA, SIQA, HellaSwag, WinoGrande,
  COPA, MMLU, TruthfulQA, WiC, DROP, FLUTE, PIE, IFEval, MT-Bench, WildChat, Dolly, Alpaca.
- **Test prompts** (120): prompts Keal typed while testing the prototype. Low weight.

Percent of items with each feature (model-tagged):

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

- Real prompts are hard on **understanding and the conversation**; benchmarks on **knowledge**.
- The analysts guessed how many benchmark items a concept graph could handle (372 fully, 359
  partly, 44 not at all). That is a **model-estimated upper bound, unvalidated**; several of these
  benchmarks were built to defeat knowledge-base methods, which have historically scored near
  chance on them.
- **Lists and reminders are almost absent from real use**: 8 of Keal's 3,449 real prompts. Files
  and git are everywhere. This decides the experiment's domain (section 29).

Focused cuts of the real prompts:

- **Call-outs** (120 real, from 180 candidates, each paired with what the assistant had just done):
  underdid 19, misread intent 18, did not verify 14, ignored an instruction 13, overreach (acted
  when it should have asked, or did more than asked) 10, asked instead of acting 8, hallucinated 7.
  **Both directions of the ask-or-act error occur**: too cautious (asked instead of acting 8,
  plus stopping early inside "underdid" 19) and too bold (overreach 10). The cautious direction is
  called out more often, and it is the one the threshold should lean against, while guards
  (section 13) keep the bold direction safe for consequential acts.
- **Files** (150): edit 22, read 20, create 9, fix 8, review 6, find 6, refactor 5. Named by path,
  as "the plan / the doc / the PR", by URL, by @mention, by convention, or as a bare path meaning
  "look at this and act on it".
- **Explanations** (150): about 45 need a record of what the assistant did and why; about 13% are
  really challenges, where the right answer corrects first.

## 4. The shape of a concept, and the content store

A concept has two kinds of content:

- **Facts**: what is true of it. A fact can hold only in a sense (section 5), and can carry a time.
- **Readings**: what it, applied to things, becomes.

A reading has:

- a **pattern** over lemmas and roles, so "spilled the beans", "the beans were spilled" and "don't
  spill the beans" match the same reading;
- **wants**: what it prefers of its arguments and neighbours (kinds, shapes), which become score
  features (section 9);
- **becomes**: another expression (a rewrite) or code (a primitive);
- **needs**: what must be known or obtained before it can act;
- **effects and checks**, for readings that act (section 15);
- a **mode**, when it only applies while speaking, supposing or doing (section 7).

Everything that turns into something else is a reading: a synonym, a multi-word name, an idiom
(`Let(Cat(Out(Of(Bag()))))` becomes `Reveal(Secret())` unless a literal cat is in play), an
indirect request (`Can(You(), $x)` becomes `$x` when `$x` is doable), a definition, a behaviour
(`Add($x, To($c))` with `$c` a Holder becomes the code that stores it).

**The content store** keeps text that is content, not meaning (file contents, a draft, a quote, a
URL, a source's original words) as blocks with ids that concepts refer to. Blocks never decide
meaning.

## 5. Words, senses, forms

- **A word is its forms.** "Alternative form of X" is identity for understanding. Forms come from a
  lexicon.
- **Senses are coarse, and split only where behaviour differs.** Fine-grained sense
  disambiguation has a long-standing ceiling around 65 to 72 percent; coarse groupings reach about
  80 percent in the literature, which is better, not solved. Senses start from supersense or
  OntoNotes-style groupings; a word keeps two senses apart where they lead to different facts or
  acts. Since acts are what the assistant does, the test "does the act differ" is applied as acts
  are added: two senses merged at import are split the first time a correction shows they need
  different acts.
- **A sense can be the user's own** ("ears means the hearing layer"), mapped to the same concept
  anyone else would use for that meaning, so the user's words and a paraphraser's reach one
  concept.
- **Part of speech is a fact about a word**; a statistical tagger is at most a tiebreak for words
  the graph does not know yet.
- **Pronunciation is a fact about a word** (from Wiktionary's IPA), so the assistant can match by
  sound (section 8).

## 6. The seed

Definitions are understood by the understander, which needs definitions. The circle needs a base,
and the base is hand-written, small, counted and frozen:

1. **Core meanings**: a few hundred, in the style of semantic primes and VerbNet's semantic
   predicates (someone, something, do, happen, have, be in, part of, cause, before, after, more,
   not, can, want, know, say, and similar).
2. **The function-word lexicon**: the entries for closed-class words, which no import supplies with
   machine-usable valence. "the" takes a thing after it; "when" opens a time; "near" takes a place;
   "if", "then", "only", "not", "every", "except" build the logical form (section 11); "and" joins
   two of the same kind; "then", "first", "after that" order steps; correction signals and tone
   words are marked as such. This is part of the seed, not the runtime; it lives on the words.
3. **The bridge**: a table from verb meanings (VerbNet predicates and frames) to primitives:
   `has_state` of containment to Store or Remove, `transfer` to Send, and so on. Without it, import
   alone reaches no primitive at all, so it is named, written once from the design (never from the
   test data), frozen before the experiment, and its entries are counted. Results are reported
   with and without it.

Every learned meaning must **bottom out** in the seed within a bounded number of expansion steps.
A definition that cannot is kept pending, and its unknown words go on the to-do list.

**Coverage and precision are both measured**: the fraction of the domain's lemmas whose senses
bottom out after import, and, for a sample of 50 bottomed-out senses graded by hand, whether the
expansion is right. Earlier "read the dictionary" projects (Cyc's knowledge acquisition, MindNet,
Extended WordNet's logical forms) reached coverage with poor precision; precision is the number
that matters.

The seed is reviewed by Keal, small enough to read in an afternoon, and every entry is counted.

## 7. Modes and evidence

"Context" was being used for two different things. Keal:

> "what I originally wanted for context was something more like that than like a very strict,
> this is what this means in this context"

- **Modes** are how something is being run: **Speaking** (saying a result), **Supposing** (working
  out what would happen, changing nothing), **Doing** (acting). A mode is set only by the
  primitive being run: Say runs Speaking, Suppose runs Supposing, and every other primitive runs
  Doing. Nothing in understanding sets a mode.
- **Evidence** is everything a thing is next to: other words, their kinds, what the conversation is
  about, what the user has been doing, the message's tone. Evidence is scored, never a switch.

## 8. Understanding a message

**Before the chart.**

- **Set aside what is not language**: tool wrappers, pasted file headers, image tags, transcript
  markers, pasted content (into the content store).
- **Segment** long messages into sentences and clauses, using facts on punctuation and on
  clause-opening words (section 6), so each chart is short (section 24).
- **Look up words** (lemma, forms, parts of speech, the user's own words) and propose corrections as
  competing tokens, never silently:
  - **by spelling**: edit distance, swapped letters and neighbouring keys ("teh", "taht", "cna");
  - **by sound**: words that sound alike, from pronunciation facts ("fone", "tuff");
  - **from the surroundings**: names that exist right now (files in the folder, branches, things in
    play), so "agent.md" where `agents.md` exists is the obvious reading;
  - and **the chart decides**: "taht" proposes *that* and *Taht* (a family name in Wikidata); *that*
    wins because it fits the sentence and is far more common, with no special rule.
- **Shapes propose kinds** (five digits, `#` and digits, a path, a URL, `snake_case`, "5pm"), from
  facts on shape kinds (`ZipCode HasShape(Digits(5))`), sourced where a source has them.

**The chart.** Lexicalized, head-driven chart parsing: every rule is on a word (principle 12). The
runtime's only universal combining steps are:

1. **Take**: a word whose entry takes an argument on a side (left or right, as its entry says)
   combines with an adjacent span that fits the argument's kind.
2. **Modify**: a word whose entry modifies a kind attaches to an adjacent span of that kind.
3. **Join**: a word whose entry joins (such as "and") combines two adjacent spans of the same kind.
4. **Skip**: a token is left out, at a learned cost, so a message with an unknown or garbled word
   still gets a partial parse instead of none.

Everything else (which side a head takes its arguments on, how passive or fronted phrases line up
their roles, what "the" or "when" do) is facts on words and forms. Multi-word names, idioms and
phrasal verbs are spans matched over lemmas and roles.

**Pruning**: the top k readings per span (k small, such as 4 to 8) by stage-one score. Spans give
pruning its constituents, so ambiguity is cut at every level instead of at the end.

**Partial parses** are always allowed. Keal's prompts are long, fragmentary and messy; a strict
parser that needs every word to fit is brittle in exactly the way symbolic language systems were
in the 1990s. So the first number measured is how often any parse (full or partial) exists on the
real prompts.

**Neighbours vote** through features: "server" near 8080 raises Port; "store near me" near 85257
raises ZipCode; "the author of" raises Dune the novel; "kill" makes Hamlet the character.

**Tone** (profanity, "lol", "like", "idk") is kept as the message's tone, not its content, and is
evidence available to everything downstream, including the correction detector (sarcasm is tone
read as a correction).

**No network during understanding.**

## 9. Choosing a reading: the score

Keal:

> "maybe we give it like a score ... this version is really good score. This version, yeah, it
> doesn't make a ton of sense how it's being said ... if they have almost the same score ... we
> just ask the user"

**Two stages, one after the other:**

1. **Stage one, in the chart**: a log-linear score over named features picks the top k readings
   per span and for the whole message, with no network and no effects. Features:
   - words used (and a cost per skipped word);
   - each role filled with a wanted kind;
   - shape fit;
   - neighbour features, with backoff: exact neighbour word, then its kind, then the conversation's
     topic;
   - sense frequency (from imported sense counts);
   - evidence from past picks and corrections.
2. **Stage two, a dry run**: each of the top few readings is evaluated with **Suppose**: effects
   are captured and not applied, and lookups use only what is cached. A second score reranks them
   using what the dry run found: whether it reached an act or an answer, whether its needs could be
   met, whether its effects' checks would pass.

Only then does **Doing** run, on the winner, or the assistant asks.

**Learning** is latent-variable structured perceptron. A correction or a pick gives the right act,
not the right parse, so the update moves toward the highest-scoring derivation that reaches the
right act, and away from the chosen one. Known risk: a wrong derivation that happens to reach the
right act gets reinforced. Mitigations: few feature templates in the experiment, a cap on how much
one correction can move a weight, and learning curves reported rather than one number (section
29).

**Asking** is a decision with an explicit cost. The top reading's probability is calibrated against
how often it was right; the assistant asks when the expected cost of acting on the top reading
(the probability it is wrong, times the cost of that mistake) exceeds the cost of asking. The costs
come from the call-outs: asking or stopping when the assistant should have acted is called out
more often than overreach, so asking is priced as expensive; consequential acts are separately
held by guards (section 13) whatever the score. If the top two readings lead to the same act, the
assistant never asks.

Every decision can be explained by which features fired.

## 10. Acting, expanding, and the primitives

Evaluating a reading rewrites it until it reaches primitives, which run. There is no fixed order of
"code first, then rewrite": the score picked the reading, and the reading says what it becomes. An
idiom reading like `Add(Value())` beats arithmetic because it scored higher (its pattern and wants
fit), not because idioms go first.

**Primitives** (the only code that touches the world, each declaring effects and checks):

- Holding: Store, Remove, Contains, Set (a property).
- Knowing: Remember (a fact about the user), Compare, Count, Rank, Filter, Sort, Arithmetic, Now.
  Knowledge from the world comes only through Know (section 21), which is not a primitive callers
  use directly.
- Reading and writing: Read (a file, a page, an image, into the content store), Write/Edit.
- Doing: Run (a command), Schedule. Operate (driving a UI or a browser) is a project of its own and
  is deferred.
- Talking: Say, Ask.
- Supposing: Suppose (evaluate with effects captured, not applied).
- Sequencing: Sequence (run steps in order, passing results). Planning is not a primitive: a plan
  is what expansion with needs produces (section 12).

Git verbs, Teach, Watch, Speak, Revert, Constrain and Delegate are readings over these.

## 11. States, time, negation, scope and modality

Keal, correcting "left/remaining means subtract":

> "fairly certain these mean like the result AFTER something like subtraction"

**Words name states.** "how many are left" names the remaining quantity; "turn left" a direction;
"he left" departed; "left it on the counter" was put somewhere. Neighbours score which state fits.

Readings produce a **small logical form** over concept expressions. Two families are kept apart:

- **Assertions** (claims about the world, evaluated to true, false or unknown).
- **Constraints** (filters and prohibitions on a plan, which decide what may run).

Scope is left open at parse time and settled by the score at evaluation, the way underspecified
semantics (MRS, Hole Semantics) does it. Rewriting may go under any operator, because a rewrite
keeps meaning; an act under a prohibition is never run.

Worked examples (the first ones to pass in the experiment):

| Said | Normal form | Evaluation rule |
|---|---|---|
| "don't push yet" | `Constraint(Not(Push(_)), until: Told())` | Push is blocked until the user says so |
| "only suggest, don't delete" | `Constraint(Only(Suggest(_)))`, `Constraint(Not(Delete(Any())))` over the plan | every step must be a suggestion; no Delete runs |
| "commit everything except the plan" | `Commit(Every(File, changed, except: Plan()))` | the set is the changed files minus the referent of "the plan" |
| "if it's already set up, add it to the readme" | `If(SetUp(It()), then: Add(It(), To(Readme())))` | check the condition in Suppose; run the branch only if true |
| "without committing, fix X" | `Constraint(Not(Commit(_)))` fronted, scoped over `Fix(X)` | scope is an attachment, scored; fronted constraints apply to what follows |
| "is it still broken?" | `Assert(Broken(It()), at: Now(), and: Broken(It()), before: LastFix())` | "still" means now and before the last change |
| "you should run the tests" (said to the assistant) | `Directive(Run(Tests()))` | "should" to the assistant is a request, not advice |
| "should I use tabs or spaces?" | `Advice(Choose(Tabs(), Spaces()), for: Me())` | "should I" asks for advice, answered conditionally |
| "delete all the branches except main" | `Delete(Every(Branch, except: Main()))` | guarded: a delete of many, offered first unless granted |
| "nothing is failing" | `Assert(Not(Some(Failing(_))))` | an assertion, checked, not a constraint |
| "any file that mentions X" | `Every(File, where: Mentions(X))` | a quantifier with a restriction |
| "revert that" | `Revert(That())` | "that" resolves to the last change made (section 16) |

## 12. Needs, plans and asking

A reading can say what it needs. When a need is not met: try to get it; if that fails, ask; if
that fails, stay unworked, honestly.

**Implied wants.** A bad state said to a helper implies wanting the good state ("ci is failing"
wants a fix; lost keys want finding, which needs a place last seen). Offer when the action has
consequences; act when it is only a lookup.

**A message is a plan**: ordered steps, later steps pointing at earlier results (including results
that do not exist yet when the message is heard, filled when the earlier step runs), conditions,
alternatives, constraints over the plan (scope scored like any attachment), mid-message
retraction ("actually nevermind"), and checkable output constraints with check-and-redo.

**State tracking**: who holds what, what is in what, a running balance, kept as facts with times,
changed only by primitives' declared effects.

## 13. Guards

Guards attach to **effect classes**, not to verbs or commands: deleting, overwriting history,
publishing, sending outside, spending money. Any primitive whose declared effects fall in a guarded
class is offered first ("I can delete these 12 branches; go ahead?") and runs when told, unless a
trusted grant lifts the guard (section 20). Because guards are by effect, a generic `Run` of a
shell command is guarded by what the command is known to do; an unknown command's effects are
unknown, and unknown is guarded.

## 14. The conversation is a structure

- **The last few readings with their choice points** and scores.
- **What is in play** (the list, the PR, the plan, the doc, the branch, the file just edited), with
  decay.
- **The last proposal and question**, so "sounds good", "1", "5b" resolve.
- **Open questions**, **standing rules**, **the reasons log**.
- **An event record** of what was done and what happened (edited, ran, failed), which references
  and salience need (section 16).

**Asides are not answers.** Keal:

> "i havent read your response (i do this alot, we should ensure that if a response says it
> hasnt read or acknowledged a prior message that its not interpreted as a response)"

**The reasons log** records why: which reading won and on which features, which need drove a
lookup, which rule or grant allowed an action.

**Presuppositions are checked**; a failed premise is itself the answer.

## 15. Effects, goals and verification

Two different checks:

- **The effect check**: did the primitive do what it declared? (Store: the holder contains the item.
  Edit: the file has the change. Run: the exit status and expected output.)
- **The goal check**: did the user's want get met? It comes from the implied want (section 12): "fix
  the failing test" means the test passes afterwards; "push it" means the remote ref matches.
  Where a goal check cannot be derived from the words and the kinds involved, the assistant says so
  ("I made the change; I can't tell whether that fixes it") instead of claiming done.

"Done" means both checks passed. This is the structural fix for Keal's most common call-outs (did
not verify 14, underdid 19, "still broken"). Declared effects bound the frame problem for the
assistant's own actions; changes by others (CI, the user, other processes) are observed, not
assumed.

## 16. References and fragments

- **Referents are ranked**: kind match first ("push it" wants something pushable), then salience
  from the event record (mentioned, acted on, just failed: "fix the test" means the one that
  failed), then recency.
- **Fragments fill holes**: a fragment ("github link", "look again?") fills the open need or choice
  point of the last reading whose kind it best matches; if none matches well enough, it is a new
  message.

## 17. Corrections and learning from picks

A correction is an operation on the last reading: go back to its choice points, flip the one the
correction names, run again, and update the score (section 9).

**Signals** ("no", "I said", "when I said X I meant Y", "still", "again", "stop", questions that are
corrections, sarcasm read from tone) are facts on words in the seed's function-word lexicon.

**What a correction records**: the chosen reading and its alternatives with scores; the wanted
reading or broken rule; the signal words and what they bind to; which features moved; one-off or
standing; provenance. A correction can target behaviour, not only the last answer.

**Picks teach the same way.**

**Lessons the call-outs taught**, most frequent first: don't stop mid-task once told to keep going;
verify before claiming done (section 15); when told "still broken", drop the last hypothesis; act on
exactly what the user named; check the real source when a claim is contradicted; take a term to
mean what the user says it means; stay inside the asked scope; "stop" and "discuss" mean no changes
until told; follow standing rules; finish every item asked.

## 18. Word lists live in the graph, and are counted

Order words, correction signals, tone words, question words, aside markers and shape kinds exist as
lexical facts. They live on words, in the graph (most in the seed's function-word lexicon), come from
imports, the seed or corrections, carry provenance, and every hand-written one is counted. In the
experiment, the seed is frozen: nothing is added by hand after it.

## 19. The instruction file

Keal:

> "what if napkin had its own agents.md style file that could be written in english and
> interpreted using napkins hearing and interpretation layers"

- The home instruction file (`~/.<project>/<PROJECT>.md`, named for the project) and the project's
  own are both read; the project's wins on conflict, within its trust level. A level without one
  falls back to that level's `AGENTS.md` (never CLAUDE.md).
- Each line is understood into a standing rule with its provenance; deleting the line deletes the
  rule; a line that cannot be understood is flagged.
- "From now on" corrections are written into the nearest instruction file (created if needed),
  never into AGENTS.md.
- Standing rules are checked before acting.

## 20. Trust and the protected base

Every fact carries a **trust level** from its source:

1. the user in the conversation, the home instruction file, and the config file;
2. the project's instruction file;
3. the project's `AGENTS.md`, READMEs, help text;
4. the web and other fetched pages.

- **Only level 1 grants permissions or lifts guards.** Level 2 sets standing rules for its project.
- **Readings from levels 3 and 4 are proposals**: they may not rewrite into a guarded effect class,
  and may not change the weights of readings from levels 1 and 2, until the user confirms them. A
  README that says "always force-push", or a page that redefines "clean up" as delete, cannot
  become behaviour on its own.
- **Derived trust is the minimum** of its inputs.
- **The protected base** is outside everything the assistant can write: the config, the guards, the
  trust table, the corpus and its expectations, the replay gate, and the scorer's evaluation code.
  No learned fact, reading or (later) self-written code can change them. Self-written runtime code,
  when it comes, is proposed as a diff for human review, never applied on its own. Self-modifying
  systems game their own checks (Eurisko's heuristic that credited itself is the classic case); the
  protected base is the answer to that.

**The config** (name and format open) grants access: which commands may run, credentials, and
blanket permissions ("bypass permissions" for an effect class or all). How to use a tool is
knowledge, in the graph.

## 21. Learning: one door

> "couldnt we have a LookUp or Research or Learn that has multiple sources for looking shit up and
> adding it to the graph ... it feels crazy to have just rawdog calls everywhere"

```
anything that needs to know:  Know(Cake(), Recipe())   Know("commit", Senses())
                 |
  Know ---- 1. does the graph hold it (and is it fresh)? return it
            2. else ask the live sources, in order of trust
            3. UNDERSTAND what came back (down to the seed), or keep it as content
            4. save it with provenance and trust; return it
                 |
  Live sources: Senses (Wikidata) · Claims (Wikidata) · Dictionary (Wiktionary)
                · Pages (sister projects) · Query (SPARQL) · Web
                 |
  Fetch (inside Know only): cached per URL, throttled, retrying, one polite user agent
```

- **Imported sources** (WordNet, VerbNet, wordfreq, ConceptNet, ATOMIC, Kaikki) are loaded once
  into packs (section 22); **live sources** answer at run time through Know.
- Sources are concepts with facts (what they answer, how they are reached, license, trust, whether
  their answers are kept, how long they stay fresh). The user can add one; the assistant can add
  one it found, at low trust until proven.
- One implementation per question; what comes back is understood or kept as content; saved once,
  one way (an import record, then facts stamped from it).
- What each live source returns, from what uses need: Senses (id, label, description, popularity,
  kinds with ids and labels, sister-page titles, main-article flag), Dictionary (senses per part of
  speech in page order, pointers parsed once, pronunciations), Claims (batched, labelled), Pages
  (namespaces, search, text, sections and lists, license as a fact), Query (SPARQL), Web (search,
  page lists and text).

## 22. The base graph

> "we need to teach like a lot of the basics, like the very most common English words and the most
> common phrasings ... build that base so that it can actually do things properly"

| Need | Source | License |
|---|---|---|
| Which words (top ~5000) | wordfreq | data CC BY-SA 4.0 |
| Senses and sense relations | Open English WordNet (coarsened) | CC BY 4.0 |
| Forms, alternative forms, pronunciations, idioms, phrasal verbs | Wiktionary (Kaikki / wiktextract) | CC BY-SA |
| What verbs do to their arguments | VerbNet 3.4 (through the bridge, section 6) | permissive |
| Frames and roles, fallback | FrameNet | to confirm before import |
| Commonsense needs and effects | ConceptNet 5.7, ATOMIC 2020 | CC BY-SA / CC BY 4.0 |
| Senses tied to things | Wikidata lexemes | CC0 |

- Measured before building on it: the share of the domain's words that get a sense with a reading
  reaching a primitive after import, and the graded precision (section 6).
- ConceptNet and ATOMIC enter at low trust; they are noisy and free text.
- ShareAlike sources stay in separable packs.
- Imported senses are candidates, weighed by use.
- **Packs are versioned**; learned facts refer to the pack version they were built on; a migration
  path exists before the first real import.

## 23. How it talks when it does not know

Honest responses in Speaking, keyed by why it is stuck: no sense for a word; no source; no
permission; a need not met; two readings too close. The rate of "I don't know" on the real prompts
is tracked alongside accuracy.

## 24. Performance

- Understanding a segment takes under 200 ms, with no network. Long messages are segmented first
  (section 8), because chart cost grows with the cube of the length.
- Lookups happen in evaluation, cached, throttled, cancellable.
- The base graph loads fast enough to start a session without waiting: indexed by lemma, senses
  loaded lazily.
- The replay gate replays only the cases that touch what changed, plus a full replay in batches.

## 25. Tools, code, writing

**Tools are learned readings.** Keal:

> "commit and push assumes git is in the house and then it sequences git commit (with a decent
> message describing the committed code and only including the correct code) along with pushing
> after that. It shouldn't need tools to do that ... I'd prefer the graph since it is adaptable to
> be able to learn a tool or learn how to use them effectively when provided."

- "commit and push" is a composition: Commit needs a repository (checked by looking); it chooses the
  files this work changed (from the event record), writes a message, runs the commit, then Push;
  effects, goal checks and guards apply.
- **Learning a tool is understanding its documentation** (`--help`, a man page, a README) into
  readings realized as commands, at trust level 3, so proposals until confirmed.

**Code is language.** The assistant reads, understands, changes and writes code as it does English:
code is heard into concepts (what a function takes, gives and does), changes are readings over them,
and the result is written back out. A language's syntax is facts on that language's words; there is
no hand-written "code version" of each instruction.

**Writing** is facts, an outline (genre shapes as loose defaults, never rigidly prescriptive), wording
(readings in Speaking), and a check against the stated constraints. Generating good prose without a
model is a research problem in its own right; the honest scope is letters, plans, summaries,
explanations, lists, reviews, commit messages built from the change's concepts, and transforming
given text. For long invented stories and scripts, the assistant says what it cannot do.

## 26. Evaluation

**The corpus**: 1,595 items with model-drafted expectations, normalized into test cases in
`~/.napkin/corpus/tests/` (1,895 cases with the focused cuts, plus 299 paraphrases).

**Making it trustworthy:**

- **Keal hand-checks** every item the experiment uses and a stratified sample of 100 across the
  corpus, in a separate session, recording verdicts to `checked.jsonl`. The agreement rate is
  reported and bounds how far the unchecked rest can be trusted.
- **Freeze before running**: the normal form and the mapping from drafted `acts` onto primitives are
  written and frozen before the system is run, so the target is not shaped by the system.
- **Argument match per kind**: exact for referents, times and files; for free text (a commit
  message, a draft), a content block that exists and passes its stated constraints, not a string
  match.
- **Understanding and task completion** are measured separately.
- **Same meaning, same reading** passes when a prompt and its paraphrase reach the same normal form.
- **Holdout**: 30 percent of the real prompts, never tuned on; in the experiment, split by
  conversation, not by prompt, so near-duplicates do not leak.
- **Intervals**: every number is reported with its confidence interval; conclusions only where the
  intervals allow.
- **Runtime tests** exist independently of the corpus (unit tests of the chart, the score, the
  primitives' checks, the trust rules).
- **The replay gate** keeps a learned change only if affected replays pass. It proves nothing
  regressed; the holdout and the hand-check measure rightness.

## 27. What the new project writes before code

Keal:

> "We should really lay out exactly everything from the IR structure/grammar tests and runtime rules
> and the best way to build a new concept if it has to be part of the built-in concepts."

1. **The N-Con spec**: concepts, facts, readings, the content store, provenance and trust, as data.
2. **The N-Con text format**: its grammar (of the file format, which is fine: the rule is about
   language, not file syntax), a formatter, and round-trip tests.
3. **The runtime rules**: what the runtime may and must not do (section 28), the four chart steps,
   the score interface, the primitives with effects and checks, the modes.
4. **Built-in concepts**: what is built in (the seed's three parts, the primitives, a handful of
   structural concepts), how to add one, and the test for whether something belongs there
   (would it be the same for chess, a jam website and the user's name? if not, it is learned).
5. **The test strategy**: the corpus, the hand-check, the holdout, the replay gate, runtime tests.

## 28. The runtime

It does only this: store concepts, facts, readings and content blocks, with provenance and trust;
match patterns over lemmas and roles; build and prune the chart with its four steps; score readings
in two stages; rewrite and run primitives; keep the conversation structure; learn weights from
corrections and picks.

It must not contain word lists, English wording, answer-shaping rules, special-cased concept names
beyond a handful of structural ones, or grammar rules. Each is a fact or a reading on a word.

## 29. The smallest experiment

**Domain**: files and git, about 8 acts: status, diff, commit, push, branch, revert, read or open a
named file, find in files. (Keal's choice; the real prompts have plenty of these and almost no
lists.)

**Data**: about 150 real prompts in that domain from the corpus, every one hand-checked by Keal,
split in half by conversation.

**Written and frozen first**, in this order, before the test half is looked at: the seed (core
meanings, function-word lexicon, bridge), each part counted.

**Arms**:

- **A. Import alone**: the seed plus imports, no corrections.
- **B. Oracle corrections**: the right act is given on the training half, in sequence; learning
  alone is tested.
- **C. Typed corrections**: Keal's own correction phrasings, which the system must also understand.
- **D. Definitions**: whether the glosses of the domain's verbs (commit, push, branch, revert, diff,
  find) are understood into readings that bottom out correctly, graded by hand. This tests bet 2
  directly; if it is not ready, it is deferred and the report says so.

**Baselines**: a keyword baseline (keywords to the 8 acts), and a small trained classifier that is
not a language model (for example, logistic regression over words) as a comparison ceiling.

**Reported**, each with intervals:

- parse coverage (any full or partial parse);
- correct act, arguments and referents, for each arm and both baselines, with and without the bridge;
- learning curves at 10, 25, 50 and 75 corrections;
- the correction rate over sequential replay (do fewer corrections get needed over time?);
- the count of facts it was tempting to add (none are added).

**Go**: after corrections, the system beats the keyword baseline on the held-out half by more than
the confidence interval and by at least 15 points, the gains carry across conversations, and the
correction rate falls.

**Stop or rethink**: import plus bridge is at or below the keyword baseline, or gains from
corrections do not carry to held-out conversations, or the correction rate does not fall.

**Time**: months, not weeks. The chart, the logical form, the function-word lexicon, the importers,
the normal-form scorer, the latent learner and 150 checked items are real work.

## 30. Open questions

Decided in the session (recorded so they are not reopened): a new project, with Napkin as
inspiration; the language is N-Con (nested concepts), files `.ncon`; "no grammar" means no rule in
the runtime, every rule on its word; the runtime executes only as far as it has to; sources are
concepts, the list is open; writing its own code is a long-term aim, outside the first experiment,
inside a protected base; code is understood as language; facts and readings as the whole data
model; modes set only by primitives, everything else evidence; text understood into structure,
content kept as content; offer for consequential implied actions, act for lookups; corrections and
picks as the main teacher; the corpus kept in `~/.napkin`; writing from facts and loose templates;
tools as learned readings, config for access; the instruction file falls back to AGENTS.md, never
CLAUDE.md; permissions grantable up to all actions, by the user only; the experiment's domain is
files and git; both correction arms; Keal hand-checks in a separate session.

Open:

1. **The project's name** (Sandwich leading; `names.md`).
2. **The store**: `.ncon` files, a database, JSON, or something else.
3. **The transcript next to this file**: about 36 MB, includes summaries of work prompts, and the
   repo is public. Commit both, only the readable `.md`, or keep both local?
4. **Word and sense**: one concept per word with sense-scoped facts, or a concept per sense?
5. **When to understand definitions**: at import, or when a word is first used?
6. **Imports versus use**: how much weight an imported sense gets before use confirms it.
7. **A definition that cannot be understood yet**: kept pending (the current default), or dropped?
8. **The config file**: name, format, where it lives.
9. **Seed size**: a cap on each of the seed's three parts, so its growth is a decision.

## Appendix A. What the critiques changed

**Round 1**: the score defined; understanding given an algorithm; definitions given a base case;
evaluation honest about circularity; feasibility numbers relabelled; the core made precise; word
lists counted; modes set by primitives; a content store; coarse senses; a logical form; effects and
checks; ranked referents; trust levels; freshness; versioned packs; honest responses; performance;
the core bet and the smallest experiment. Kept as decided: "no grammars" and a small core, made
precise rather than dropped.

**Round 2**:

- The experiment's domain moved to files and git (lists have almost no real prompts), with both
  correction arms, a definitions arm, baselines, learning curves, a correction-rate curve, intervals,
  a conversation-level split, and months rather than weeks.
- The function-word lexicon and the verb-to-primitive bridge are named as parts of the seed,
  hand-written, counted, frozen, and reported with and without.
- Principle 12 says plainly that the words' entries form a lexicalized grammar, and the chart's four
  universal steps (take, modify, join, skip) are listed.
- Learning is latent-variable structured perceptron, with its known risk stated.
- The ask-or-act evidence was misstated; it now gives both directions with counts, and asking is a
  cost-based decision.
- Scoring and evaluation are two stages (chart score, then a dry run with Suppose), removing the
  fixed "code first" order; Suppose is a primitive; Fetch is internal to Know; Operate is deferred.
- The logical form separates assertions from constraints, leaves scope open until evaluation, and
  has worked examples.
- Trust closes the injection hole through readings; guards attach to effect classes; a protected
  base is outside the self-writable surface; self-writing is outside the first experiment.
- Partial parses, segmentation and skipped tokens handle messy input; spelling correction adds sound
  and surroundings.
- Effect checks and goal checks are separate.
- The evaluation freezes its targets first, matches arguments by kind, and separates understanding
  from task completion.
- Added: the event record, runtime tests independent of the corpus, what the new project writes
  before code, and a seed-size question.
