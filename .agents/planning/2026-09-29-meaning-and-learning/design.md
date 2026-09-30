# Meaning and learning: what Napkin knows, how it hears, and how it acts

Status: design, written 2026-09-29 from a working session with Keal. Not a build plan. Every
section says what was decided, what the data behind it is, and what is still open. Where this
disagrees with the 2026-09-16 specs, this is newer; the old specs are not yet updated.

Source material, next to this file:

- `source/conversation.jsonl`: the session's exact transcript.
- `source/conversation.md`: the same, as readable user and assistant text only.
- `~/.napkin/corpus/`: the analysed corpus (local only, not in the repo, because it holds work
  messages). 1,595 items, each with the meaning it should be heard as. See section 19.

## 0. Why this document exists

The session began with a bug: Napkin found `Recipe(Cake())` could not be worked out and then did
nothing about it. Fixing that one layer led to the question underneath all of them:

> "why does it identify residuals and then DO NOTHING? dont fix this just for this case fix it
> for literally everything forever"

and then to the real one:

> "how can we get it so that i can stop asking you to fix it and IT can fix itself?"
> "the whole point of it being able to research and output in the same form as input is so it
> can write ncon and add to or edit itself."

Looking at how learning works today showed about twenty separate places that each fetch, parse
and store (or throw away) their own results, and a graph that keeps what it learns as loose
strings nothing ever reads. Keal's direction, in his words:

> "the runtime should be so fucking small ... the graph should be the thing crafting all this
> knowledge and actionable shit ... this isn't a rule implementer. I don't want grammars. I don't
> want to collect a bunch of pointless shit that we don't need in the graph ... if we need to
> rethink how a concept is constructed ... it should still be dead simple."

This document is that rethink: a small core, a graph that holds meaning as structure, and a
hearing and acting loop that works for how Keal actually talks and for standard English.

## 1. Principles

Kept from AGENTS.md, and still true: everything is a Concept; a residual is a value that means
"look further"; derive instead of author; answer by kind; honest when stuck; provenance on
everything learned; no language model hears, speaks or teaches.

New, from this session:

1. **No loose strings.** A string from any source (a gloss, a description, a page, a help text,
   a line of NAPKIN.md) is something that was said. It is heard, the same way a message is heard,
   and kept as structure. The original text survives only as provenance (the quote it came from).
   Test: if nothing can ever match or evaluate it, it does not earn a place in the graph.
2. **Meaning is rewriting; acting is code at the bottom.** A word means what it expands to. It
   acts when the expansion reaches primitives, and only primitives are code.
3. **Words name states and results, not operations.** "left" in "how many are left" names what
   remains; subtraction is only how it is computed. The question asks for a state; the work to
   get it is derived.
4. **Kinds are weighted guesses, decided by evidence.** A thing's shape and the words around it
   vote on what it is. 85257 beside "store near me" is a ZipCode; alone it is a Number.
5. **Several readings, the one that works out wins.** Keep a few, score them by how well they
   work out, ask only when two are close and would give different results.
6. **Corrections are the main teacher.** They are specific, frequent, and free.
7. **The runtime is small and stays small.** Language and meaning knowledge lives in the graph,
   as facts and readings on words, never in host code or in monolithic bodies.
8. **Same meaning, same reading.** Keal's phrasing, a plain paraphrase and a benchmark phrasing of
   one request must be heard as the same expression. One meaning space for everyone.

## 2. What the data says (the short version)

1,595 items were analysed, each with the meaning it should be heard as (section 19 has the
method). Three groups:

- **Real** (700): Keal's own prompts to Claude Code and Codex, sampled across 50 projects,
  including long multi-part ones.
- **Bench** (775): 25 items from each of 31 benchmarks and assistant datasets (MASSIVE,
  CLINC150, SNIPS, MultiWOZ, SGD, Taskmaster, NQ, TriviaQA, HotpotQA, SQuAD v2, BoolQ, StrategyQA,
  GSM8K, ARC, CommonsenseQA, PIQA, SIQA, HellaSwag, WinoGrande, COPA, MMLU, TruthfulQA, WiC, DROP,
  FLUTE, PIE, IFEval, MT-Bench, WildChat, Dolly, Alpaca).
- **Napkin** (120): Keal's test prompts to Napkin itself. Low weight: they are test-style, not
  how he talks to a competent assistant (3.4% of everything he typed, but they were oversampled).

Percent of items with each feature:

| | Napkin | Real | Bench |
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

What it means:

- Real prompts are hard on **hearing and the conversation**: stacked plans, conditions,
  constraints, pointing, messy words. Benchmarks are hard on **knowledge**: commonsense, facts,
  comparisons, quantities. The design needs both, and neither is only Keal's.
- Standard English still needs an expansion a third of the time and points at something a third
  of the time. Keal uses those mechanisms about twice as much.
- For the benchmark items, the analysts judged a symbolic graph with the right sources could do
  372 fully, 359 partly (a missing source, tool or private data, not a missing meaning), and 44
  not at all (long invented stories and scripts, expert legal reasoning, items truncated in the
  data).

Focused cuts of the real prompts:

- **Call-outs** (120 real call-outs from 180 candidates, each paired with what the assistant had
  just done): underdid 19, misread intent 18, did not verify 14, ignored an instruction 13,
  overreach 10, asked instead of acting 8, hallucinated 7. Keal never once called out an
  assistant for asking when it should have acted; stopping early and not checking are about half.
- **Files** (150): edit 22, read 20, create 9, fix 8, review 6, find 6, refactor 5. Files are
  named by path (77), as "the plan / the doc / the PR" meaning the most recent one (22), by URL,
  by @mention, by convention ("the readme"), or as a bare path with no verb meaning "look at this
  and act on it".
- **Explanations** (150): about 45 need a record of what the assistant did and why; about 13% of
  "explain" messages are really a challenge ("why did you do that?!"), where the right answer
  corrects first and explains second.

## 3. The shape of a Concept

A Concept has two kinds of content, and both already exist in the runtime:

- **Facts** (relations): what is true of it. `Paris IsA City`. `List HasPart Item`.
- **Readings** (realizations): what it, applied to things, becomes.

A reading has:

- a **pattern**: the shape it applies to (`Add($x, To($c))`);
- **wants**: what it prefers of its arguments and neighbours, as weighted kinds and shapes (`$c`
  should be a Holder; a five-digit number near a Place word);
- **becomes**: either another expression (a rewrite) or code (a primitive);
- **needs**: what must be known or obtained before it can act (`Send($msg, $to)` needs an address
  for `$to`);
- a **mode**, when it only applies while speaking, supposing, or executing.

Everything that turns into something else is a reading. What used to be separate mechanisms are
the same thing:

| Old mechanism | As a reading |
|---|---|
| `SynonymOf(Add)` on Plus | `Plus($a, $b)` becomes `Add($a, $b)`, always |
| A fold | `Work(In(Progress()))` becomes `WorkInProgress()` |
| An idiom | `Let(Cat(Out(Of(Bag()))))` becomes `Reveal(Secret())`, unless a literal cat is in play |
| An indirect request | `Can(You(), $x)` becomes `$x`, when `$x` is something Napkin can do |
| A definition | `Note()` becomes `Message(Written(), From(Someone()), To(Someone()))`, in one sense |
| A behaviour | `Add($x, To($c))` with `$c` a Holder becomes code: store `Contains($x)` on `$c` |

The Concept's internals barely change. What changes is the discipline: meaning goes only into
facts and readings, never into strings, host code or word lists inside bodies.

Open: whether a word and its senses are one Concept or several (section 5).

## 4. Modes and evidence (what "context" becomes)

Today a context is a hard switch: in `Interrogative()`, this realization applies. Keal's point:

> "what I originally wanted for context was something more like that than like a very strict,
> this is what this means in this context"

Two different things were sharing the word:

- **Modes**: how something is being run. `Speaking()` (saying a result in words),
  `Hypothetical()` (supposing, changing nothing), `Execution()` (doing it). These stay, and they
  are not really "context" at all; they are modes.
- **Evidence**: everything a thing is next to. Other words, their kinds, what the conversation is
  about, what the user has been doing. A reading says what it likes ("likely near Place words";
  "needs five digits") and the evidence scores it.

Moods (asking, telling, commanding) sit between: a question is heard as a question from its words
("what", a question mark), and that shifts which readings fit, but it is evidence, not a switch.

## 5. Words, senses, forms

- **A word is its forms.** "ate" and "eaten" are forms of eat; "bananas" is a form of banana.
  "Alternative form of X" (Wiktionary's `FormOf`/`AltOf`) is identity for hearing: the same
  Concept, not a relation with a string in it. Forms come from the lexicon (Wiktionary via
  Kaikki), not from the tagger.
- **A word has senses.** List the holder, list the verb (to enumerate), list the lean of a ship.
  Each sense has its own facts and readings, and the word's readings pick among them by evidence
  (part of speech the position calls for, the kinds of the neighbours, frequency).
- **A sense can be the user's own.** "ears", "teacher", "soup", "tick" mean what Keal said they
  mean. Told once ("ears means the hearing layer"), it is kept as his sense of the word. It wins in
  his conversations and never leaks into the dictionary senses.
- **Part of speech is a fact about a word, not a guess by a library.** Today the graph depends on
  the compromise tagger's tag set, and most of this session's hearing bugs were the tagger
  guessing wrong ("list" and "written" taken as verbs). With a lexicon, the graph knows what each
  word can be; the tagger drops to a tiebreak for words the graph does not know.

Open: whether senses are separate Concepts (`List` with senses `ListOfItems`, `Enumerate`) or
contexts on one Concept (today's `Note` in `LiteraryGenre()`). Both work; separate Concepts make
facts per sense simpler, one Concept keeps the word's identity simpler.

## 6. Hearing

Hearing turns words into a few candidate expressions. It should be driven by what the words know
about themselves, not by rules in a body.

- **Word classes from the lexicon**, as above.
- **Attachment from what heads take.** A verb's readings say what they take (put takes a thing
  and a place; find takes a thing, and optionally where and when). VerbNet has exactly this data:
  roles, the kinds each role accepts, and syntactic frames. Hearing attaches words to the head
  whose roles they fit, instead of guessing structure from tags.
- **Shapes propose kinds.** Five digits, `#` and digits, `v` and digits, a path, a URL,
  `snake_case`, `camelCase`, a time like `5pm`. A shape is a fact on a kind
  (`ZipCode HasShape(Digits(5))`), from Wikidata where it has one (property format constraints),
  declared otherwise. Shapes are few enough to be facts, not code.
- **Neighbours vote.** "server" makes 8080 a Port; "zipcode" or "store near me" makes 85257 a
  ZipCode; "the author of" makes Dune the novel; "kill" makes Hamlet the character, not the play.
- **Keep a few readings, not one.** Ambiguity is carried to evaluation instead of decided at
  hearing. Prune as you go: keep the top few per phrase, not every combination.
- **Strip what is not language.** Harness wrappers ("# In app browser", pasted file headers,
  `<image>` tags, transcript markers) are recognised and set aside before hearing.
- **Tone is kept apart from content.** Profanity, "lol", "like", "idk" carry feeling or emphasis,
  not meaning. They are heard as tone on the message (frustration, playfulness) and stripped from
  what is evaluated. Profanity alone does not mean a correction; it appears in plain instructions
  too ("no bullshit" as a constraint).
- **Typos and dictation.** About a fifth of real prompts have typos ("cna", "jsut", "straberry",
  "cloud.md" for CLAUDE.md). Spelling tolerance comes from the known vocabulary (the lexicon plus
  the user's own words), proposing corrections as competing readings, not silently replacing.

## 7. Acting and expanding

The core loop. Evaluating an expression tries its readings, most fitting first:

1. **A code reading fits**: do it. These are the primitives.
2. **A rewrite reading fits**: expand into what it becomes, and evaluate that.
3. **Nothing fits**: it is residual. Look it up, learn a reading, or ask.

A word acts when its expansion bottoms out in primitives. "remove milk from my list": Remove is a
code reading on a Holder. "get rid of milk": GetRidOf is a rewrite to Remove, then the same code
runs. "What value do you add" matches the idiom reading of `Add(Value())` and becomes
`Contribute(...)` in conversation, before any arithmetic reading gets a chance.

**When to act and when to expand** is not a separate rule: it is specificity and fit. A reading
whose pattern, wants and mode fit more closely wins. Code readings are usually the most specific
(`Add` of a thing to a Holder), so they act when they fit; general meanings expand.

**Primitives** (first cut; the corpus confirmed most and added a few):

- Holding: Store (put in), Remove, Contains, Set (a property of a thing).
- Knowing: Get/LookUp (graph or world), Remember (a fact about the user), Compare, Count, Rank,
  Filter, Sort, Arithmetic, Time/Now.
- Reading and writing: Read (a file, a page, an image), Write/Edit, Fetch, Search.
- Doing: Run (a command), Operate (drive a UI or browser), Schedule/Remind.
- Talking: Say, Ask.
- Structure: Plan (an ordered sequence of the above), Delegate (hand to a sub-task).

The corpus analysts asked for Git verbs, Teach ("X is Y"), Watch (a video: Fetch plus Read of a
transcript), Speak (text to speech), Revert/Undo and Constrain (a guard on other acts). Most of
those are readings over the primitives above, not new primitives (section 17).

## 8. Verbs act on what they are given

The same verb does different things depending on the kinds of its arguments. "Add":

- to a Holder: Store (`Contains`);
- to Numbers: Arithmetic (a sum);
- a property to an Object: Set;
- `Add(Value())`, said of someone in conversation: Contribute.

The kind checks come from the words' own meanings: `List IsA Holder` because a list holds items,
which is in its definition, heard into structure. Keal:

> "can this thing HOLD shit? its a fucking list... does this mean to get rid of, or take
> something away, its remove. is it a verb that means that the state of the thing it acts on
> changes somehow?"

So "can it hold things" is answered by the definition graph, not by hardcoding `Collection`.
VerbNet's semantic predicates (`cause`, `has_state`, `transfer`, `motion`, `change_value`) say
what a verb does to its arguments, and become the bottom of each verb sense's readings.

## 9. Words name states

Keal's correction of "left/remaining means subtract":

> "fairly certain these mean like the result AFTER something like subtraction"

The general form: words describe states and quantities; operations are how they are reached.

- "how many are **left**": the remaining quantity (`Remainder(of, after)`).
- "turn **left**": a direction.
- "he **left**": departed, a change of place.
- "**left** it on the counter": was put somewhere (the keys case).
- "in total" is a sum as a state; "twice as many" is a quantity relative to another; "the rest"
  is what remains.

Each reading of the word names a state; the question asks for that state; the neighbours ("how
many", "turn", "it on the counter") score which state fits. This is the evidence-based context of
section 4, applied to one word. It also makes word problems readable: GSM8K items decompose into
quantities and the states they are asked in, with a running balance (section 10).

## 10. Needs, plans and asking

A reading can say what it needs. Evaluating something that lacks a need:

1. try to get it: look it up, reason from what is known, or make it;
2. if that fails, ask the user;
3. if that fails, stay residual, honestly.

**Implied wants.** A statement about a bad state, said to a helper, implies wanting the good state:

- "ci is failing" means `Failing(CI)`, so the want is `Fix(CI)`.
- "the parens color doesnt match anymore" means a fix request.
- "I was looking for my keys and couldn't find them" means `Lost(Keys, of = Me)`, so the want is
  `Find(Keys)`. Find needs a place last seen: Napkin checks what it was told ("I put my keys on
  the counter" is remembered) or asks ("Where did you last have them?"). None of that is about
  keys; it comes from what find and lost mean.

Decided: offer when the implied action has consequences ("Want me to look at the CI?"); act when
it is only a lookup.

**Planning is expansion with needs.** "Write me an essay about X": the essay needs facts about X
(pursue and learn), an order (outline), and wording (section 18). That is a plan built from what
each reading needs, not a planner with its own rules.

**State tracking.** Some meanings need a running state: who holds what, what is in what, a
running balance ("16 eggs, eats 3, bakes 4, sells the rest"). Benchmarks (GSM8K, WinoGrande,
PIQA) lean on it, and so do lists and plans.

## 11. A message is a plan

About a quarter of real prompts carry several asks, and a fifth carry conditions. A heard message
is an ordered sequence of readings:

- **Order** from the words ("then", "after that", "before", "first") or from the spoken order.
- **Later steps point at earlier results**: "make a shopping list and add milk to it", "create the
  ticket, then add its id to the PR title".
- **Conditions**: "if it's already set up, add it to the readme", "if not, build something
  better", "whichever is easiest".
- **Constraints over the whole plan**: "only suggest, don't delete", "leave comments but don't
  submit", "no commit before review", "no coming-soon stubs". They usually come last and apply to
  everything before them.
- **Mid-message retraction**: "an apple is red... actually nevermind none of that matters, you
  can add 2 + 2". "Actually" and "nevermind" cancel what came before.
- **Checkable output constraints** (IFEval style: length, format, keywords, case, language)
  become Concepts that are checked on the result, with a check-and-redo loop before saying done.

**Guards on destructive actions.** Delete, force-push, submit, send, purchase: offer first, act
only when told. A guard can be lifted by an explicit grant (section 14): in the conversation, in
NAPKIN.md, or in the config file, for a kind of action or for all actions ("bypass permissions").

## 12. The conversation is a structure

Half of real prompts point at something, and the conversation is the most common source of what a
message needs (ahead of the graph and the world). So the conversation is not a history to search;
it is a structure Napkin keeps:

- **The last few readings, with their choice points still open** (which sense, which referent,
  which reading won and what it beat).
- **What is in play**: the list, the PR, the plan, the doc, the branch, the file just edited,
  Steven Spielberg. "the plan" means the most recent plan.
- **The last proposal and the last question**, so "sounds good", "yes and", "1", "5b" resolve
  against them.
- **Open questions**: what Napkin asked and has not had answered.
- **Standing rules** (section 14) and **the reasons log** (below).

**Fragments are patches.** "the animal?", "look again?", "github link", "sweet pie" are readings
with a hole, merged into the last reading. One mechanism covers follow-ups, answers to "which did
you mean", and corrections.

**Asides are not answers.** Keal often replies before reading:

> "i havent read your response (i do this alot, we should ensure that if a response says it
> hasnt read or acknowledged a prior message that its not interpreted as a response/result)"

"I haven't read it yet", "didn't read all your ideas yet" mark a message as an aside: what Napkin
last asked stays open.

**The reasons log.** About 45 of 150 "explain" messages ask why the assistant did something. The
trace records what ran; it must also record why: which reading was chosen and what it beat, which
need drove a lookup, which standing rule allowed an action. "Why did you do that?" is answered
from it, and a challenge ("what the fuck is this?") is answered by correcting first.

**Presuppositions are checked.** Several questions rest on a false premise (a claimed prior run
that did not happen, a country that does not contain the city). Check the premise before
answering; a failed premise is itself the answer.

## 13. Corrections and learning from picks

A correction is an operation on the last reading: go back to its choice points, flip the one the
correction names, re-run. "no, I meant the math one", "look again?", "when I said revert I meant
the skill", "still broken" (the last fix was wrong: change the hypothesis).

**Signals**: a bare "no", "naw", "that's wrong"; "I said", "I asked", "when I said X I meant Y";
"still", "again", "keep"; "stop", "wait", "hold on"; a question that is really a correction ("did
you look at...?", "you didn't add X?"); sarcasm ("love that you didn't even try").

**What a correction records** (from the call-out analysis):

- what was chosen: the reading, the sense per ambiguous word, the alternatives with their scores;
- what was wanted: the corrected reading, or the constraint that was broken;
- the signal: which words marked it, and what they bind to (the last turn, or an earlier
  instruction);
- what to shift: the word-to-sense weight given these neighbours, or the standing rule that
  should have fired;
- lifetime: one-off, or standing ("from now on");
- provenance, so it can be traced and deleted.

A correction can move the blame from the output to the behaviour ("the app is not the issue, it's
YOU keep stopping"), so behaviour is a possible target, not only the last answer.

**Picks teach the same way.** When Napkin asks "did you mean A or B" and the user picks, the pick
is recorded against the words and neighbours that were there. Next time the same mix leans that
way on its own.

Lessons the call-outs taught (general rules Napkin should hold, most frequent first): don't stop
mid-task once told to keep going; verify before claiming done; when told "still broken", drop the
last hypothesis; read exactly what the user named; check the real source when a claim is
contradicted; match a term to what the user says it is; stay inside the asked scope; "stop" and
"discuss" mean no changes until told; follow standing rules; finish every item asked.

## 14. NAPKIN.md and napkin.conf

Napkin gets its own instruction file, written in plain English and heard by Napkin's own hearing:

> "what if napkin had its own agents.md style file that could be written in english and
> interpreted or parsed using napkins hearing and interpretation layers"

- **Where**: `~/.napkin/NAPKIN.md` (home) and the project's `NAPKIN.md`. Both are read; the
  project's wins on conflict. A level with no `NAPKIN.md` falls back to that level's `AGENTS.md`.
  Not CLAUDE.md.
- **Heard on load.** Each line becomes a standing rule, with its provenance (file and line), so
  deleting the line deletes the rule. A line Napkin cannot hear is flagged ("I don't understand
  line 12"), not ignored. AGENTS.md is written for AI agents, so some lines will not apply;
  those are flagged quietly.
- **Written by Napkin.** "From now on, ..." corrections are written into the nearest NAPKIN.md
  (created if needed), never into AGENTS.md. Everything Napkin learned about how to behave is then
  readable and editable in one place.
- **Standing rules are checked before acting**: keep going until done, reviews stay pending, PRs
  are drafts, never use a scratch graph.
- **Permissions** can be granted in the conversation, in NAPKIN.md, or in `napkin.conf` (name
  open): per kind of action or all actions, lifting the destructive-action guards of section 11.
  The config grants access (which commands, credentials); the knowledge of how to use them lives in
  the graph.

## 15. Learning: one door, heard results, saved once

Today about twenty places reach the outside world, each fetching, parsing and deciding for itself
whether to save. Keal:

> "couldnt we have a LookUp or Research or Learn that has multiple sources for looking shit up
> and adding it to the graph if a concept needs to look something up or learn something? it feels
> crazy to have just rawdog calls everywhere"

The shape:

```
callers ask:  Know(Cake(), Recipe())   Know("bake", PartsOfSpeech())
                 |
  Know ---- 1. does the graph hold it? return it
            2. else ask the sources, in order
            3. HEAR what came back into structure
            4. save it with provenance, return it
                 |
  Sources (the only code that fetches):
    WikidataSenses · WikidataClaims · WiktionaryEntry · SisterPages · Sparql · Web
                 |
  Fetch: one place, cached per URL, throttled, retries, one polite user agent
```

- **One Fetch.** Today only the host TypeScript path throttles and retries; pack bodies and
  SPARQL hit Wikimedia unthrottled (a likely cause of flaky tests).
- **One implementation per question.** Wikidata senses are implemented twice today (host and
  pack), and can disagree. Wiktionary's page for a word is fetched and parsed three times with
  three cleanups. `NumericValue`, `InSI`, `CurrencyCode` are one body three times, differing only
  in the property.
- **Hear what comes back.** A gloss, a description, a page, an alias: heard into structure
  (section 1). `Means("written message from one to another")` becomes the reading
  `Note()` becomes `Message(Written(), From(Someone()), To(Someone()))`. Words in a gloss that are
  not known yet go on the to-do list; a gloss that cannot be heard yet is kept as pending (open:
  keep pending or drop until it can be heard).
- **Saved once, one way.** An `Imported` record for the source, then the facts stamped from it.
  Today that pattern is copy-pasted in five places, and some lookups save names with no source at
  all.
- **"Don't keep" is a fact.** Rates and weather change; whether a source's answers are kept is
  something the graph knows about the source, not something each caller decides.

What each source must return, from what every current caller reads (the full inventory was part of
the session; summary):

- **WikidataSenses(word)**: per sense, the id, label, description, popularity (sitelink count),
  kinds with both ids and labels (Judge intersects ids, grounding reads labels), sitelink titles
  per sister project (so Written stops fetching them), and whether it is Wikipedia's main article
  for the word. Ordered main-article first, then popularity; Wikimedia-internal items dropped.
  Callers keep their own ranking on top ("has the property asked", "shares kinds", "fits what was
  said"), because that is about the question, not the source.
- **WiktionaryEntry(word)**: senses per part of speech, in the page's order, cleaned once, plus
  pointers parsed once (alternative form of, plural of, superlative of). `PartsOfSpeech` becomes a
  read of the part-of-speech heads; `Senses(word, pos)` a read of one; `Meaning` a pick plus
  following a pointer. Stored as `CanBe` and meaning facts, per part of speech, with the source.
- **SisterPages**: site namespaces, page search (with sort, namespace, title and category terms),
  raw page text, and reading a page into sections, lists, links and categories. The license comes
  from a fact on the site, not hardcoded. Written keeps only "where things of this kind are
  written".
- **WikidataClaims(ids, props)**: batched (the API caps at 50 ids), labels included. Replaces the
  ad hoc claim fetches in Superlative, Judge, Written, the units bodies and host grounding.
- **Sparql(query)**: already generic.
- **Web**: search and page reading, with the list-extraction of plan's Missing and the wikitext
  list-extraction of Written sharing one "a page's lists" reader.

## 16. The base graph

> "we need to teach like a lot of the basics, like the very most common English words and the most
> common phrasings ... build that base so that it can actually do things properly"

Import a strong base once, instead of learning everything live:

| Need | Source | License | Notes |
|---|---|---|---|
| Which words (top ~5000) | wordfreq (zipf scores) | data CC BY-SA 4.0 | cut by lemma; COCA is proprietary, avoid |
| Senses and sense relations | Open English WordNet | CC BY 4.0 | hypernym, meronym, antonym, entailment, cause, derivation; SemCor counts for sense frequency |
| Forms, alternative forms, idioms, phrasal verbs | Wiktionary via Kaikki/wiktextract | CC BY-SA | forms[], form_of, alt_of, phrase entries |
| What verbs do to their arguments | VerbNet 3.4 | permissive (VerbNet license) | roles, selectional restrictions, frames, semantic predicates; members carry WordNet keys |
| Frames and roles, fallback | FrameNet | CC BY (version to confirm) | |
| Commonsense needs and effects | ConceptNet 5.7, ATOMIC 2020 | CC BY-SA / CC BY 4.0 | HasPrerequisite, Causes, UsedFor, AtLocation; xNeed, xEffect, xWant |
| Senses tied to things | Wikidata lexemes (P5137) | CC0 | sparse for English |

- ShareAlike sources (Wiktionary, ConceptNet, wordfreq data) stay in separate packs with
  provenance, so they can be dropped without touching the permissive core.
- Imported senses are **candidates, weighed by use**, not gospel: WordNet's list is "a database
  containing an ordered array of items", which is a poor fit for a shopping list. Evidence from
  use (corrections, picks, what worked) outranks the import.
- Expect roughly 5,000 lemmas to expand to 15,000 to 25,000 senses (an estimate).
- Live learning (Wikidata, the web, sister pages) then fills the long tail: people, places, works,
  recipes, news.

## 17. Tools are learned readings

> "commit and push assumes git is in the house and then it sequences git commit (with a decent
> message describing the committed code and only including the correct code) along with pushing
> after that. It shouldn't need tools to do that ... I'd prefer the graph since it is adaptable
> to be able to learn a tool or learn how to use them effectively when provided."

- "commit and push" is a composition of readings. `Commit` needs a repo (a fact Napkin checks by
  looking), expands to: choose the files this work changed (from what is in play and the reasons
  log), write the message by summarizing the diff, `Run(git commit ...)`, then `Push`.
- **Learning a tool is hearing its docs.** `--help`, a man page or a README is text; heard into
  readings. "`gh pr create --draft` creates a draft pull request" becomes `Create(PullRequest(
  Draft()))` that realizes to `Run("gh pr create --draft")`.
- Tools can also be taught in NAPKIN.md ("use gh for PRs; PRs are always drafts"), heard into
  facts and standing rules.
- `napkin.conf` grants access (which commands may run, credentials); the graph holds how to use
  them. Guards still apply unless lifted (section 14).

## 18. Writing and output

Writing is facts, an outline, wording, and a check:

1. facts to say (the graph, or Know);
2. an outline: genre shapes as loose defaults (what a letter, a plan, a summary usually has),
   never "stupidly aggressively prescriptive"; stated constraints override them;
3. wording: the Speaking readings, connectives, register and synonym choice, a repeat guard;
4. a check against every checkable constraint (count, pattern, keyword, case, language), then
   redo.

Honest for letters, plans, summaries, explanations, lists, reviews, and transforming given text.
For long invented stories and scripts, Napkin says plainly what it cannot do.

## 19. Evaluation

- **The corpus is the test set.** 1,595 items with the meaning each should be heard as, in
  `~/.napkin/corpus/` (local; it contains work messages): `rout*.jsonl` and `out*.jsonl` (real and
  Napkin prompts), `fout`/`xout`/`cout` (files, explanations, call-outs), `bout_*.jsonl`
  (benchmarks), `bench.jsonl` (items with gold answers), `SPEC.md` (the analysis schema).
- **Weighting**: tune on Keal's real prompts; the benchmarks check it is not only learning Keal;
  the Napkin prompts are a smoke test.
- **Same meaning, same reading.** For each real prompt, write a plain paraphrase (and, where one
  fits, a benchmark-style one). All must be heard as the same expression. Measure that rate
  alongside benchmark accuracy. It is the direct test of principle 8.
- **Replay gate.** A learned fact, reading or correction is kept only if replaying known
  conversations still works. This is the guard against hearing definitions badly and then hearing
  everything worse.
- The analyses were written by model subagents from a shared spec; depth thins toward the end of
  some slices, and some benchmark gold labels are wrong or noisy (noted per item). Treat the
  expected readings as a strong draft, to be corrected as they are used.

## 20. What this changes in the current runtime

From the audit of the code as it is (runtime 0.3.0):

- About 1,300 lines of English knowledge sit in host TypeScript: pronoun and pointing lists,
  question words, fillers, number words, months, articles, canned replies and person flips in
  `say.ts`, yes/yeah regexes. Under this design each becomes a fact or reading on its word
  (`He IsA Pronoun`, `Um IsA Filler`, `Twelve` means 12), and the host shrinks to mechanism.
- `Hear` (about 1,000 lines) and `Pursue` (about 750) are graph-resident but monolithic procedures
  with word lists inside. They become many small readings on words and kinds.
- The graph depends on the compromise tagger's tag set; with the lexicon, tags are graph facts
  and the tagger is a fallback.
- The "six structural identities" claim is not true of the code (select, context and turn name
  more); the smaller core should make it true again.
- `Hear(text, "rules")` and `Hear(text)` are two output shapes; production uses only the first,
  and the hearing tests exercise the second. One shape, tested as production hears.
- About twenty lookup call sites collapse behind Know and the sources (section 15).

What stays: the store, stamps and journal, the evaluator and selection by specificity, types and
`Fits`, handover, Pursue's idea (a residual means look further, and the route that worked is
kept), provenance, answer by kind, honest residuals, and the IR-in-packs approach, which is what
lets Napkin read and write its own readings.

## 21. Risks

- **Hearing definitions is only as good as hearing.** Bad hearing makes bad meanings makes worse
  hearing. The replay gate is the guard; learned meanings are candidates until they have worked.
- **Ambiguity explodes.** Ten words with three senses each is 59,000 readings. Scoring must be
  cheap and local, pruning per phrase as it goes.
- **The score is the whole ballgame.** A bad score makes confident wrong answers. A handful of
  signals (every word used, roles filled with the right kinds, needs met, an actual answer, prior
  evidence), tuned on the corpus, not guessed.
- **Asking too much is annoying.** Ask only when the top two are close and would give different
  results; if both reach the same answer, don't ask.
- **Cycles in definitions** ("big" means large, "large" means big). Expansion stops at primitives
  or at something already visited.
- **Import scale and load time.** Tens of thousands of senses must load fast.
- **Licenses.** ShareAlike sources kept separable.
- **Losing what works.** Build a new base under the same runtime and move over pack by pack, with
  the replay gate, rather than a rewrite that breaks everything at once (open: section 22).

## 22. Open questions

Settled in the session (recorded so they are not reopened):

- Readings as the one primitive for meaning: yes (it is mostly realizations already).
- Modes stay; context as evidence: yes.
- Hear every gloss into structure: the core bet.
- Offer for consequential implied actions, act for lookups: yes.
- Corrections as the main learning signal: yes.
- The corpus as the test set, in `~/.napkin`: yes.
- Writing from facts and loose templates, honest about invented stories: yes.
- Tools as learned readings, graph first, config for access: yes.
- NAPKIN.md, falling back to AGENTS.md, never CLAUDE.md; permissions grantable: yes.

Still open:

1. **Word and sense**: one Concept per word with senses as contexts, or a Concept per sense?
2. **When to hear glosses**: at import (slow, once) or lazily when a word is first used?
3. **Imports versus derivation**: how much weight an imported sense gets before use confirms it.
4. **The primitive list**: is anything missing from section 7?
5. **Alongside or clean break**: a new base next to the current graph, switching over pack by pack,
   or a clean start?
6. **A gloss that cannot be heard yet**: kept as pending, or dropped until it can be heard?
7. **The config file**: name (`napkin.conf`?), format, and where it lives.
8. **Committing this folder's transcript**: `source/conversation.jsonl` is about 36 MB and holds
   the whole session, including summaries of work prompts; commit it, keep only the readable
   `.md`, or keep both local?
