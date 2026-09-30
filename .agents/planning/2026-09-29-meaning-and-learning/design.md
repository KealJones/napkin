# Meaning and learning: a design for an assistant made of concepts

Status: design, written 2026-09-29 from a working session with Keal. Not a build plan. It is
written as for a new project: nothing that exists today is assumed to be right or to stay. Each
section says what is decided, the evidence behind it, and what is still open.

Source material, next to this file:

- `source/conversation.md` and `source/conversation.jsonl`: the session this came from (local;
  not committed while the question in section 22 is open).
- `~/.napkin/corpus/`: the analysed corpus (local only; it holds work messages). 1,595 items, each
  with the meaning it should be understood as. See section 19.

## 0. What we are building, and why

An assistant that understands and acts without a language model. Everything it knows is a graph
of concepts; understanding a message means turning it into concepts and working it out; acting
means reaching small pieces of code that do real things. It learns from sources and from being
corrected, and everything it learns is kept as the same kind of structure it runs on, so it can
read, extend and repair itself.

The direction, in Keal's words:

> "the runtime should be so small ... the graph should be the thing crafting all this knowledge
> and actionable shit ... this isn't a rule implementer. I don't want grammars. I don't want to
> collect a bunch of pointless shit that we don't need in the graph ... it should still be dead
> simple."

> "the whole point of it being able to research and output in the same form as input is so it
> can write [its own graph] and add to or edit itself."

> "how can we get it so that i can stop asking you to fix it and IT can fix itself?"

## 1. Principles

1. **Everything is a concept.** A word, a sense, a thing, a kind, an action, a mode, a rule.
2. **No loose strings.** Text from any source (a definition, a description, a web page, a help
   text, a line of the assistant's own instruction file) is something that was said. It is
   understood the same way a message is, and kept as structure. The original text survives only
   as provenance. If nothing can ever match or evaluate a piece of data, it does not belong in
   the graph.
3. **Meaning is rewriting; acting is code at the bottom.** A word means what it expands to. It
   acts when the expansion reaches primitives, and only primitives are code.
4. **Words name states and results, not operations.** "left" in "how many are left" names what
   remains; subtraction is how it is computed. Questions ask for states; the work is derived.
5. **Kinds are weighted guesses, decided by evidence.** A thing's shape and the words around it
   vote on what it is.
6. **Several readings; the one that works out wins.** Ask only when two are close and would give
   different results.
7. **Honest when stuck.** "I don't know", "not specified", or a conditional answer ("if you mean
   X, A; if Y, B") beat a confident guess. What cannot be worked out stays visibly unworked.
8. **Answer by kind.** A question asks for a kind of answer ("who" asks for someone, "when" for a
   time); an answer of another kind is passed over.
9. **Everything learned carries provenance**, so it can be traced and deleted.
10. **Corrections are the main teacher.** They are specific, frequent, and free.
11. **The core is tiny.** Language and meaning live in the graph as facts and readings on words,
    never in the core's code and never as word lists inside a procedure.
12. **Same meaning, same reading.** Keal's phrasing, a plain paraphrase, and a benchmark's phrasing
    of one request are understood as the same expression. One meaning space for everyone.

## 2. What the data says

1,595 items were analysed, each with the meaning it should be understood as (section 19 has the
method):

- **Real** (700): Keal's own prompts to AI coding assistants (Claude Code, Codex), across 50
  projects, including long multi-part ones.
- **Bench** (775): 25 items from each of 31 benchmarks and assistant datasets: MASSIVE, CLINC150,
  SNIPS, MultiWOZ, Schema-Guided Dialogue, Taskmaster, Natural Questions, TriviaQA, HotpotQA,
  SQuAD v2, BoolQ, StrategyQA, GSM8K, ARC, CommonsenseQA, PIQA, SIQA, HellaSwag, WinoGrande,
  COPA, MMLU, TruthfulQA, WiC, DROP, FLUTE, PIE, IFEval, MT-Bench, WildChat, Dolly, Alpaca.
- **Test prompts** (120): prompts Keal typed while testing an earlier prototype. Low weight: they
  are test-style, not how he talks to a capable assistant.

Percent of items with each feature:

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

- Real prompts are hard on **understanding and the conversation**: stacked plans, conditions,
  constraints, pointing, messy words. Benchmarks are hard on **knowledge**: commonsense, facts,
  comparisons, quantities. The design needs both, and neither is only Keal's: standard English
  still needs an expansion a third of the time and points at something a third of the time.
- Of the 775 benchmark items, the analysts judged a concept graph with the right sources could do
  372 fully and 359 partly (a missing source, tool or private data, not a missing meaning); 44
  are out of reach (long invented stories and scripts, expert legal reasoning, items truncated in
  the data).

Focused cuts of the real prompts:

- **Call-outs** (120, from 180 candidates, each paired with what the assistant had just done):
  underdid 19, misread intent 18, did not verify 14, ignored an instruction 13, overreach 10,
  asked instead of acting 8, hallucinated 7. Keal never called out an assistant for asking when
  it should have acted; stopping early and not checking are about half.
- **Files** (150): edit 22, read 20, create 9, fix 8, review 6, find 6, refactor 5. Files are
  named by path (77), as "the plan / the doc / the PR" meaning the most recent one (22), by URL,
  by @mention, by convention ("the readme"), or as a bare path with no verb, which means "look at
  this and act on it".
- **Explanations** (150): about 45 need a record of what the assistant did and why; about 13%
  are really challenges ("why did you do that?!"), where the right answer corrects first and
  explains second.

## 3. The shape of a concept

A concept has two kinds of content:

- **Facts**: what is true of it. `Paris IsA City`. `List HasPart Item`. A fact can hold only in a
  sense (section 5).
- **Readings**: what it, applied to things, becomes.

A reading has:

- a **pattern**: the shape it applies to (`Add($x, To($c))`);
- **wants**: what it prefers of its arguments and neighbours, as weighted kinds and shapes (`$c`
  should be a Holder; a five-digit number near a Place word);
- **becomes**: another expression (a rewrite) or code (a primitive);
- **needs**: what must be known or obtained before it can act (`Send($msg, $to)` needs an address
  for `$to`);
- a **mode**, when it only applies while speaking, supposing, or doing (section 4).

Everything that turns into something else is a reading:

| What it is | As a reading |
|---|---|
| A synonym | `Plus($a, $b)` becomes `Add($a, $b)`, always |
| A multi-word name | `Work(In(Progress()))` becomes `WorkInProgress()` |
| An idiom | `Let(Cat(Out(Of(Bag()))))` becomes `Reveal(Secret())`, unless a literal cat is in play |
| An indirect request | `Can(You(), $x)` becomes `$x`, when `$x` is something the assistant can do |
| A definition | `Note()` becomes `Message(Written(), From(Someone()), To(Someone()))`, in one sense |
| A behaviour | `Add($x, To($c))` with `$c` a Holder becomes code: store `Contains($x)` on `$c` |

Two kinds of content, one of which (readings) covers synonyms, phrases, idioms, indirect
requests, definitions and behaviour. That is the whole data model.

## 4. Modes and evidence

"Context" was being used for two different things. Keal:

> "what I originally wanted for context was something more like that than like a very strict,
> this is what this means in this context"

- **Modes**: how something is being run. Speaking (saying a result in words), Supposing
  (working out what would happen, changing nothing), Doing (acting). A reading can be for one
  mode. Modes are switches.
- **Evidence**: everything a thing is next to: the other words, their kinds, what the
  conversation is about, what the user has been doing. A reading says what it likes ("likely near
  Place words"; "needs five digits") and the evidence scores it. Evidence is never a switch.

Mood (asking, telling, commanding) is evidence too: a question is recognised from its words
("what", a question mark) and shifts which readings fit.

## 5. Words, senses, forms

- **A word is its forms.** "ate" and "eaten" are forms of eat; "bananas" of banana. "Alternative
  form of X" is identity for understanding, not a relation with a string in it. Forms come from a
  lexicon.
- **A word has senses.** List the holder, list the verb (to enumerate), list the lean of a ship.
  Each sense has its own facts and readings; the word's readings pick among them by evidence (the
  part of speech the position calls for, the kinds of the neighbours, frequency).
- **A sense can be the user's own.** A word the user defines ("ears means the hearing layer") is
  kept as that user's sense. It wins in their conversations and never leaks into the dictionary
  senses.
- **Part of speech is a fact about a word.** The graph knows what each word can be. A statistical
  tagger is at most a tiebreak for words the graph does not know yet.

Open: whether senses are separate concepts or one concept with sense-scoped facts (section 22).

## 6. Understanding a message

Understanding turns words into a few candidate expressions, driven by what the words know about
themselves:

- **Word classes from the lexicon.**
- **Attachment from what heads take.** A verb's readings say what they take (put takes a thing and
  a place; find takes a thing, and optionally where and when). Words attach to the head whose
  roles they fit.
- **Shapes propose kinds.** Five digits, `#` and digits, `v` and digits, a path, a URL,
  `snake_case`, `camelCase`, "5pm". A shape is a fact on a kind (`ZipCode HasShape(Digits(5))`),
  sourced where a source has it (Wikidata property format constraints), declared otherwise.
- **Neighbours vote.** "server" makes 8080 a Port; "zipcode" or "store near me" makes 85257 a
  ZipCode; "the author of" makes Dune the novel; "kill" makes Hamlet the character, not the play.
- **A few readings are kept,** pruned as they are built (the top few per phrase), and decided by
  how they work out.
- **What is not language is set aside** before understanding: tool wrappers, pasted file headers,
  image tags, transcript markers.
- **Tone is separate from content.** Profanity, "lol", "like", "idk" carry feeling or emphasis.
  They are kept as the message's tone and left out of what is evaluated. Profanity alone does not
  mean a correction ("no bullshit" can be a constraint).
- **Typos and dictation.** About a fifth of real prompts have typos ("cna", "jsut", "straberry",
  "cloud.md" for CLAUDE.md). Corrections are proposed from the known vocabulary (the lexicon plus
  the user's own words) as competing readings, never silently.

## 7. Acting and expanding

Evaluating an expression tries its readings, most fitting first:

1. **A code reading fits**: do it. These are the primitives.
2. **A rewrite reading fits**: expand, and evaluate the result.
3. **Nothing fits**: it is unworked. Look it up, learn a reading, or ask.

A word acts when its expansion reaches primitives. "remove milk from my list": Remove on a Holder
acts. "get rid of milk": GetRidOf becomes Remove, and the same code runs. "what value do you add"
matches the idiom reading of `Add(Value())` and becomes `Contribute(...)` before any arithmetic
reading gets a chance.

Whether to act or expand is not a separate rule; it is fit. A reading whose pattern, wants and
mode fit more closely wins. Code readings are usually the most specific (Add of a thing to a
Holder), so they act when they fit; general meanings expand.

**Primitives**, first cut (the corpus confirmed these):

- Holding: Store, Remove, Contains, Set (a property).
- Knowing: LookUp (graph or world), Remember (a fact about the user), Compare, Count, Rank,
  Filter, Sort, Arithmetic, Now.
- Reading and writing: Read (a file, a page, an image), Write/Edit, Fetch, Search.
- Doing: Run (a command), Operate (drive a UI or a browser), Schedule.
- Talking: Say, Ask.
- Structure: Plan (an ordered sequence), Delegate (hand to a sub-task).

Asked for by the analysts, and probably readings over the above rather than primitives: Git verbs,
Teach ("X is Y"), Watch (fetch and read a transcript), Speak (text to speech), Revert, Constrain (a
guard on other acts).

## 8. Verbs act on what they are given

The same verb does different things depending on the kinds of its arguments. Add:

- to a Holder: store it;
- to Numbers: a sum;
- a property to an Object: set it;
- `Add(Value())`, said of someone in conversation: contribute.

The kind checks come from the words' own meanings: a List is a Holder because a list holds items,
which is in its definition, understood as structure. Keal:

> "can this thing HOLD shit? its a list... does this mean to get rid of, or take something away,
> its remove. is it a verb that means that the state of the thing it acts on changes somehow?"

So "can it hold things" is answered by the definition graph, not by a list of container types.
Verb resources (VerbNet's semantic predicates: cause, has_state, transfer, motion, change_value)
say what a verb does to its arguments, and become the bottom of each verb sense's readings.

## 9. Words name states

Keal, correcting "left/remaining means subtract":

> "fairly certain these mean like the result AFTER something like subtraction"

Words describe states and quantities; operations are how they are reached.

- "how many are **left**": the remaining quantity.
- "turn **left**": a direction.
- "he **left**": departed.
- "**left** it on the counter": was put somewhere.
- "in total": a sum as a state; "twice as many": a quantity relative to another; "the rest": what
  remains.

Each reading of the word names a state; the neighbours score which state fits. This is evidence
(section 4) applied to one word, and it is what makes word problems readable: they decompose into
quantities and the states they are asked in, over a running balance.

## 10. Needs, plans and asking

A reading can say what it needs. Evaluating something that lacks a need:

1. try to get it (look it up, reason from what is known, make it);
2. if that fails, ask the user;
3. if that fails, stay unworked, honestly.

**Implied wants.** A statement of a bad state, said to a helper, implies wanting the good state:

- "ci is failing": the want is to fix CI.
- "the parens color doesn't match anymore": a fix request.
- "I was looking for my keys and couldn't find them": the keys are lost, so the want is to find
  them. Finding needs a place last seen: check what the user said ("I put my keys on the counter")
  or ask ("Where did you last have them?"). Nothing here is about keys; it comes from what find
  and lost mean.

Decided: offer when the implied action has consequences ("Want me to look at the CI?"); act when
it is only a lookup.

**Planning is expansion with needs.** "Write me an essay about X" needs facts about X, an order,
and wording (section 18): a plan built from what each reading needs, not a separate planner.

**State tracking.** Some meanings need a running state: who holds what, what is in what, a
running balance ("16 eggs, eats 3, bakes 4, sells the rest").

## 11. A message is a plan

About a quarter of real prompts carry several asks and a fifth carry conditions. A message is an
ordered sequence of readings:

- **Order** from the words ("then", "after that", "before", "first") or from the spoken order.
- **Later steps point at earlier results**: "make a shopping list and add milk to it"; "create the
  ticket, then add its id to the PR title".
- **Conditions**: "if it's already set up, add it to the readme"; "if not, build something
  better"; "whichever is easiest".
- **Constraints over the whole plan**: "only suggest, don't delete"; "leave comments but don't
  submit"; "no commit before review". They usually come last and apply to everything before them.
- **Retraction mid-message**: "an apple is red... actually nevermind, you can add 2 + 2".
- **Checkable output constraints** (length, format, keywords, case, language) are concepts
  checked on the result, with a check-and-redo loop before saying done.

**Guards on consequential actions.** Delete, force-push, submit, send, purchase: offer first, act
when told. A guard is lifted by an explicit grant (section 14), in the conversation, in the
instruction file, or in the config, for a kind of action or for all actions.

## 12. The conversation is a structure

Half of real prompts point at something, and the conversation is the most common source of what a
message needs (ahead of stored knowledge and the world). So the conversation is a structure the
assistant keeps, not a history it searches:

- **The last few readings, with their choice points still open**: which sense, which referent,
  which reading won and what it beat.
- **What is in play**: the list, the PR, the plan, the doc, the branch, the file just edited, the
  person just discussed. "the plan" means the most recent plan.
- **The last proposal and the last question**, so "sounds good", "yes and", "1", "5b" resolve
  against them.
- **Open questions**: what the assistant asked and has not had answered.
- **Standing rules** (section 14) and **the reasons log**.

**Fragments are patches.** "the animal?", "look again?", "github link" are readings with a hole,
merged into the last reading. One mechanism covers follow-ups, answers to "which did you mean",
and corrections.

**Asides are not answers.** Keal often replies before reading:

> "i havent read your response (i do this alot, we should ensure that if a response says it
> hasnt read or acknowledged a prior message that its not interpreted as a response)"

"I haven't read it yet" marks a message as an aside; the assistant's open question stays open.

**The reasons log.** "Why did you do that?" is answered from a record of why, not only what: which
reading was chosen and what it beat, which need drove a lookup, which rule allowed an action. A
challenge ("what the fuck is this?") is answered by correcting first.

**Presuppositions are checked.** A question resting on a false premise (a claimed earlier run that
did not happen, a city not in the country named) is answered by saying so.

## 13. Corrections and learning from picks

A correction is an operation on the last reading: go back to its choice points, flip the one the
correction names, run again. "no, I meant the math one"; "look again?"; "when I said revert I
meant the skill"; "still broken" (the last fix was wrong: change the hypothesis).

**Signals**: a bare "no" or "naw"; "I said", "I asked", "when I said X I meant Y"; "still",
"again", "keep"; "stop", "wait", "hold on"; a question that is really a correction ("did you look
at...?"); sarcasm ("love that you didn't even try").

**What a correction records**:

- what was chosen: the reading, the sense per ambiguous word, the alternatives and their scores;
- what was wanted: the corrected reading, or the rule that was broken;
- the signal: which words marked it, and what they bind to (the last turn, or an earlier
  instruction);
- what to shift: a word's sense weight given these neighbours, or a standing rule that should have
  applied;
- lifetime: one-off, or standing ("from now on");
- provenance, so it can be traced and deleted.

A correction can target behaviour, not only the last answer ("the app is not the issue, it's YOU
keep stopping").

**Picks teach the same way.** When the user picks between readings the assistant offered, the pick
is recorded against the words and neighbours present, so the same mix leans that way next time.

**Lessons the call-outs taught**, most frequent first: don't stop mid-task once told to keep going;
verify before claiming done; when told "still broken", drop the last hypothesis; act on exactly
what the user named; check the real source when a claim is contradicted; take a term to mean what
the user says it means; stay inside the asked scope; "stop" and "discuss" mean no changes until
told; follow standing rules; finish every item asked.

## 14. The instruction file and the config

The assistant has its own instruction file, `NAPKIN.md`, written in plain English and understood
by the assistant's own understanding:

> "what if napkin had its own agents.md style file that could be written in english and
> interpreted using napkins hearing and interpretation layers"

- **Where**: `~/.napkin/NAPKIN.md` (home) and the project's `NAPKIN.md`. Both are read; the
  project's wins on conflict. A level with no `NAPKIN.md` falls back to that level's `AGENTS.md`
  (never CLAUDE.md).
- **Understood on load.** Each line becomes a standing rule with its provenance (file and line), so
  deleting the line deletes the rule. A line the assistant cannot understand is flagged, not
  ignored. AGENTS.md is written for other agents, so some of its lines will not apply; those are
  flagged quietly.
- **Written by the assistant.** A "from now on" correction is written into the nearest NAPKIN.md
  (created if needed), never into AGENTS.md. Everything it learned about how to behave is readable
  and editable in one place.
- **Standing rules are checked before acting**: keep going until done; reviews stay pending; PRs
  are drafts.
- **Permissions** are granted in the conversation, in NAPKIN.md, or in a config file (name open):
  per kind of action or for all actions, lifting the guards of section 11. The config grants
  access (which commands may run, credentials); how to use them is knowledge, in the graph.

## 15. Learning: one door

> "couldnt we have a LookUp or Research or Learn that has multiple sources for looking shit up and
> adding it to the graph ... it feels crazy to have just rawdog calls everywhere"

```
anything that needs to know:  Know(Cake(), Recipe())   Know("bake", PartsOfSpeech())
                 |
  Know ---- 1. does the graph hold it? return it
            2. else ask the sources, in order
            3. UNDERSTAND what came back, into structure
            4. save it with provenance; return it
                 |
  Sources (the only code that reaches the world):
    Senses (Wikidata) · Claims (Wikidata) · Dictionary (Wiktionary) · Pages (sister projects)
    · Query (SPARQL) · Web
                 |
  Fetch: one place; cached per URL, throttled, retrying, one polite user agent
```

- **Nothing but Know asks the world.** Callers ask for what they need; they never fetch.
- **One implementation per question.** A word's senses, a thing's claims, a dictionary page: each
  fetched and parsed in one place, the same way for everyone.
- **What comes back is understood.** A definition becomes a reading; a description becomes facts;
  an alias becomes another name for the same concept. Unknown words in a definition go on the
  to-do list.
- **Saved once, one way**: an import record for the source, then the facts stamped from it.
- **"Don't keep" is a fact about a source.** Exchange rates and weather change; the graph knows
  which sources' answers are kept.

What each source should return, from what the uses need:

- **Senses(word)**: per sense, the id, label, description, popularity, kinds (ids and labels),
  sister-project page titles, and whether it is the main encyclopedia article for the word. Ordered
  main article first, then popularity; internal bookkeeping items dropped. The asker ranks on top
  by what the question needs ("has the property asked", "shares kinds", "fits what was said").
- **Dictionary(word)**: senses per part of speech in the page's order, cleaned once, plus pointers
  parsed once (alternative form of, plural of, superlative of).
- **Claims(ids, properties)**: batched, labels included.
- **Pages**: a site's namespaces, page search, page text, and reading a page into sections, lists,
  links and categories; the license is a fact on the site.
- **Query**: SPARQL for questions no single item answers ("the tallest mountain").
- **Web**: search and reading a page's lists and text.

## 16. The base graph

> "we need to teach like a lot of the basics, like the very most common English words and the most
> common phrasings ... build that base so that it can actually do things properly"

A strong base is imported once; live learning fills the long tail (people, places, works, recipes,
news).

| Need | Source | License | Notes |
|---|---|---|---|
| Which words (top ~5000) | wordfreq | data CC BY-SA 4.0 | cut by lemma; avoid proprietary lists |
| Senses and sense relations | Open English WordNet | CC BY 4.0 | hypernym, meronym, antonym, entailment, cause, derivation; sense frequency from SemCor |
| Forms, alternative forms, idioms, phrasal verbs | Wiktionary (Kaikki / wiktextract) | CC BY-SA | |
| What verbs do to their arguments | VerbNet 3.4 | permissive | roles, selectional restrictions, frames, semantic predicates; linked to WordNet senses |
| Frames and roles, fallback | FrameNet | CC BY (version to confirm) | |
| Commonsense needs and effects | ConceptNet 5.7, ATOMIC 2020 | CC BY-SA / CC BY 4.0 | HasPrerequisite, Causes, UsedFor, AtLocation; needs, effects, wants, reactions |
| Senses tied to things | Wikidata lexemes | CC0 | sparse for English |

- ShareAlike sources stay in separate packs with provenance, so they can be dropped without
  touching the rest.
- Imported senses are candidates, weighed by use: WordNet's list is "a database containing an
  ordered array of items", a poor fit for a shopping list. Evidence from use outranks the import.
- Roughly 5,000 lemmas expand to an estimated 15,000 to 25,000 senses.

## 17. Tools are learned readings

> "commit and push assumes git is in the house and then it sequences git commit (with a decent
> message describing the committed code and only including the correct code) along with pushing
> after that. It shouldn't need tools to do that ... I'd prefer the graph since it is adaptable
> to be able to learn a tool or learn how to use them effectively when provided."

- "commit and push" is a composition of readings. Commit needs a repository (checked by looking),
  and expands to: choose the files this work changed (from what is in play and the reasons log),
  write the message by summarizing the change, run the commit, then push.
- **Learning a tool is understanding its documentation.** `--help`, a man page or a README is text,
  understood into readings: "`gh pr create --draft` creates a draft pull request" becomes
  `Create(PullRequest(Draft()))`, realized as running that command.
- Tools can be taught in NAPKIN.md ("use gh for PRs; PRs are always drafts").
- The config grants access; the graph holds how to use them; guards apply unless lifted.

## 18. Writing and output

Writing is facts, an outline, wording, and a check:

1. facts to say (the graph, or Know);
2. an outline: genre shapes as loose defaults, never rigidly prescriptive; the user's stated
   constraints override them;
3. wording: readings in the Speaking mode, connectives, register, a repeat guard;
4. a check against every checkable constraint, then redo.

Honest for letters, plans, summaries, explanations, lists, reviews, and transforming given text.
For long invented stories and scripts, the assistant says plainly what it cannot do.

## 19. Evaluation

- **The corpus is the test set.** 1,595 items with the meaning each should be understood as, in
  `~/.napkin/corpus/` (local; it contains work messages), normalized into test cases in
  `~/.napkin/corpus/tests/`. The expectations describe intent, what is wanted, the actions, the
  kinds, the references, the needs, the constraints and the answer. They are
  implementation-neutral: the nested expressions in them are sketches, not a required output
  format.
- **Weighting**: tuned on Keal's real prompts; benchmarks check it is not only learning Keal; the
  test prompts are a smoke test.
- **Same meaning, same reading.** Real prompts are paired with plain paraphrases (and, where one
  fits, a benchmark-style one); all must be understood as the same expression. Measured alongside
  benchmark accuracy.
- **Replay gate.** A learned fact, reading or correction is kept only if replaying known
  conversations still works.
- **Caveats**: the analyses were drafted by model subagents from a shared schema; some slices thin
  toward the end, and some benchmark gold labels are wrong or noisy (noted per item). The
  expectations are a strong draft, to be corrected as they are used.

## 20. The core, and what it must not contain

The core does only this:

- store concepts, facts and readings, with provenance, append-only, deletable;
- match patterns and check wants against evidence;
- rewrite, and run a primitive when one fits;
- keep a few readings and score them;
- keep the conversation structure;
- run the primitives, which are the only code that touches files, commands, the network, or the
  clock.

The core must not contain: word lists (pronouns, fillers, question words, number words, months),
English wording, answer-shaping rules, special-cased concept names beyond a handful of structural
ones, or parsing rules. Each of those is a fact or a reading on a word, in the graph. If a part of
the core starts to know English, it is in the wrong place.

The graph is written in the same form the assistant reads and writes, so the assistant can inspect,
extend and repair its own readings.

## 21. Risks

- **Understanding definitions is only as good as understanding.** Bad understanding makes bad
  meanings makes worse understanding. The replay gate is the guard; learned meanings are
  candidates until they have worked.
- **Ambiguity explodes.** Ten words with three senses each is 59,000 readings. Scoring must be
  cheap and local, pruning per phrase as it goes.
- **The score is the whole ballgame.** A bad score gives confident wrong answers. A handful of
  signals (every word used, roles filled with the right kinds, needs met, an actual answer, prior
  evidence), tuned on the corpus.
- **Asking too much is annoying.** Ask only when the top two are close and would differ.
- **Cycles in definitions** ("big" means large, "large" means big). Expansion stops at primitives
  or at something already visited.
- **Import scale and load time.** Tens of thousands of senses must load fast.
- **Licenses.** ShareAlike sources kept separable.

## 22. Open questions

Decided in the session (recorded so they are not reopened):

- Two kinds of content, facts and readings; readings cover synonyms, phrases, idioms, indirect
  requests, definitions and behaviour.
- Modes are switches; everything else is evidence.
- Every text from a source is understood into structure; no loose strings.
- Offer for consequential implied actions; act for lookups.
- Corrections and picks are the main learning signal.
- The analysed corpus is the test set, kept in `~/.napkin`.
- Writing from facts and loose templates, honest about invented stories.
- Tools as learned readings; the graph first; config for access.
- NAPKIN.md, falling back to AGENTS.md, never CLAUDE.md; permissions grantable, including all
  actions.

Open:

1. **Word and sense**: one concept per word with sense-scoped facts and readings, or a concept per
   sense?
2. **When to understand definitions**: at import (slow, once) or when a word is first used?
3. **Imports versus use**: how much weight an imported sense gets before use confirms it.
4. **The primitive list**: anything missing from section 7?
5. **Starting point**: a new project from nothing, or a new base alongside the existing prototype,
   moving over piece by piece?
6. **A definition that cannot be understood yet**: kept as pending, or dropped until it can be?
7. **The config file**: name, format, and where it lives.
8. **The transcript next to this file**: `source/conversation.jsonl` (about 36 MB) and
   `source/conversation.md` hold the whole session, including summaries of work prompts, and the
   repo is public. Commit both, only the readable `.md`, or keep both local?
