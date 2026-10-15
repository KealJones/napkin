# Frames: from hearing by rules to hearing by senses and holes

Design: `.agents/planning/2026-09-16-concept-ai-system/design/frames.md`. Measure every step with
`node packages/concept-runtime/scripts/compare-hearing.mjs` and add the cases it is for to
`eval/frames/cases.json`.

- [x] 3. Learn while reading (0.7.0): a word frames have no sense for, or a thing with no facts, is looked up
  (Wikidata, Wiktionary) during the turn, its senses kept, and the message read again, instead of
  handing it to `Hear()`.
- [x] 1. Statements and commands as frames (0.8.0; "is"-statements and "remember that", not yet other verbs like "I live in Phoenix") ("my name is Sam", "remember that ...", "Tom is taller
  than Ann"): a relation word with holes for the thing and the value, stored as a fact. The step
  that starts retiring `Hear()`.
- [x] 2. Nested framing (0.9.0): "I told them that X" wraps X as reported; clauses joined by "and" split by
  their holes, not by a question-word check.
- [x] 4. Inverse relation names as senses (0.10.0): import Wikidata's inverse labels so "directed" is
  Director by the graph, not by sharing five letters.
- [x] 5. Learned scoring (0.11.0; feature weights from picks, "yes" and "no"; the hand-set costs remain as the prior): corrections and confirmed answers adjust which sense won, which hole a word
  filled, which spelling held. Weights stop being hand-set.
- [x] 6. Ask when two readings are close (0.11.0) ("born when, or where?"), and keep the answer as a
  `ReadBeside` sense choice, instead of falling back to `Hear()`.
- [x] 7. More computation senses (0.12.0): one-hole and list holes ("square root of", "average of",
  "percent of").
- [x] 8. Answers you can trace (0.13.0): show which word filled which hole, and why, in the studio.
- [x] 9. Hygiene (0.13.1; also: the studio API answers only its own page): bound `trace.jsonl` (about 300 KB a turn); file reads only under the workspace.

# Frames, round two

Found by running unseen prompts after round one (see the 0.14.0 commit message).

- [x] 10. (0.15.0) "who is lily" answered "Stated.": frames describe a thing from its facts ("Lily is a doctor,
  older than you") instead of the rules recall reading a frame's display as an answer.
- [x] 11. (0.15.0) Dates as values: "my birthday is june 3", "when is my birthday".
- [x] 12. (0.15.0) "The X of Y is Z" statements: "the capital of france is paris" keeps France Capital(Paris).
- [x] 13. (0.15.0) "equal to", "equals", "the same as" said for "is" in claims: "is 10 times 10 equal to 100".
- [x] 14. (0.16.0) Statements with other verbs: "i live in phoenix", "i ate an apple", read back by "where do
  i live", "what did i eat"; the newest of the same relation wins.

# Frames, round three

Found by the unseen probe after 0.16.0 (17 of 24 right, 1 asked, 5 honest misses, 1 wrong).

- [x] 15. "what did i say my name was" answered "Dog." (the rules recall): a question about what was
  said should read the conversation's kept facts, and never answer with an unrelated thing.
- [x] 16. Postfix operations: "3 squared", "5 cubed" (Squared/Cubed are Power($x, n) in the
  quantities pack; frames read a one-hole operation said after its value, never a word that marks
  what follows, like "in").
- [x] 17. A number said of a person ("tom is 30") kept as what it most likely is
  (`Someone NumberIs(Age())`), read back by "how old is tom" (`Old Asks(Age())`, which the
  asked-fact reader counts as naming the relation). Still to do: asking when it is unclear.
- [x] 18. "was born in 1990": DateOfBirth and PlaceOfBirth are in the world pack as Wikidata has them
  (P569, P19, Called(Born()), TakesValue(Date()/Place())); a declared Wikidata property is a relation
  sense before anything holds it; "X was born in Y" keeps the one that takes Y (a year is a date).
- [x] 19. Reminders and tasks: a word the graph says keeps what follows (`Remember KeepsAs(ToDo())`,
  need, have) + "to" + a doing keeps ToDo(Buy(Milk())) of whoever is to do it; "what do i need to
  buy" is what is kept of that doing ("Milk and eggs.").
- [x] 19b. Someone named in a fact told ("Gunter is my friend", "my coworker is greg", "tom's
  brother is sam") is an individual of their own (Gunter_1, Named "Gunter", IsA Person), held by the
  owner (Me Friend(Gunter_1())); "who is gunter?" is who holds them ("Your friend.", "Tom's
  brother."). A name held as a name ("my name is Bob") is not someone.

# Packs and replies (audit 2026-10-12, research/pack-audit.md)

- [x] 20. Pack audit: `scripts/audit-packs.mjs` (usage, removal with dependents, `--alone=`), report.
- [x] 21. Told events answered by what follows (ConceptNet, lazily, per event) and how they feel
  (VADER valence, learned per word): packs/follows.ncon; the corpus reply only when close.
- [x] 22. Pursue answers what was not asked ("what is todays date?" "Yes."; "how you doing?"
  "Arithmetic."): an answer must account for the question, as frames' `AnsweredBy` does.
- [x] 23. Judge answers a choice with nothing grounded ("Both are kinds of elephant."): now "I couldn't
  find enough about mouse and elephant to compare them yet."
- [ ] 24. code-hearing (10.5k lines) is off the live path (code blocks are read by tree-sitter and the
  TypeScript reader). Kept: it is the design's direction (code heard word by word, as concepts).
  Next: run it beside readCode on the coding tests and switch over where it reads the same.
  Run beside (scripts/compare-code-hearing.mjs, 2026-10-14): of 87 programs the readers read whole,
  hearing reads 47 the same, 36 differently (nearly all type annotations, which hearing does not
  hear yet; one Python `and`/`not`), 4 not at all (a generic arrow `<T,>`). Next: type annotations
  heard as Claims (tasks/typescript-claims.md), then switch.
- [x] 25. ATOMIC 2020 (CC BY) for everyday events (src/research/atomic.ts): looked up when a message
  tells of one, through the Hugging Face dataset server's search over Estwld/atomic2020-origin; only
  rows whose event is the one told are kept (XReact, XWant, XEffect, XNeed, XIntent, OReact, OWant on
  the event, one import stamp each), and the reply says how one feels and asks after what one wants
  ("You must be feeling frustrated. Do you want to call a mechanic?"). The server's first search of
  the dataset can take a minute (its index is built); such a lookup is tried again later. Next: the
  Parquet files at build, searched locally, for no cold starts.
- [ ] 26. DailyDialog is CC BY-NC-SA (non-commercial): being replaced. Measuring: SODA (CC BY 4.0, built from ATOMIC) is the coverage set now (frames-coverage.mjs; first run 4/19 frames, 7 "don't know", 3 machinery). Replying: packs/dialogue.ncon's nearest-utterance replies (which leak corpus lines: "Hi Jane, you look great.") to go, how a message is heard and answered taught instead (teacher, kept), then DailyDialog removed.
- [ ] SODA misses to fix: a Wikimedia file name said as an answer ("Montage of Our Solar System.jpg", "Frequency Of First Names In The Netherlands2010"); "Are me talking is a helper, a be verb"; "How about you?" answered "I'm Napkin"; "What can I do for you?" unknown; a name at the start ("Sarah, it's so nice") read into the feeling.
- [x] 27. Chat ("when you say hello?") and focus ("supplies list") fixed; pursue's "cake recipe" reads Wikibooks, so it passes only with the network: run it in CI with the live-probe workflow's `test` input (passes, 3aedfc0).
  "cake recipe").
- [x] 28. Code sent alone (a fenced block, nothing asked) is explained instead of "I see."
- [x] 29. sources/grounding regenerates packs/grounding.ncon again: the hand edits (a one-letter
  definition kept, PartsOfSpeech and CanBe) are in the sources; the rebuilt pack holds the same
  Concepts as the committed one.
- [x] 31. What was told is said back to whom it happened ("Sorry to hear your car broke down."), by
  what "my"/"I" and "your"/"you" Refer to; a kept statement that felt strongly is answered as it felt
  ("my mom is sick"); what an event leads to counts for how it feels; said of Napkin ("you're
  awesome", "you are useless") is thanked for or owned.
- [x] 32. Frames keep wrong facts from some statements: "my mom is sick" as `Me Mom(Sick())`, "i was
  late to work" as `Me IsA(LateWork())`. Now `Mom HasProperty(Sick())`; "is a" needs a/an/the.
- [x] 33. Remembering: a bad thing told is a Concern, asked after at the next small talk, once; a yes
  or no answers what the last reply offered.
- [x] 34. Why-questions explained as a chain from what is written (research/why.ts): the sentence that
  says why (a `CausalConnective`), the cause taken from it, what the cause is from its own page,
  sources; kept as HasCause.
- [x] 36. "she"/"he" point by kind: the last thing in play that is what the word points at
  (`She PointsAt(Female())`; `Mom SexOrGender(Female())`), never the ones talking; said back as
  what it points at ("your mom has the flu"). Only forms of "be" are copulas ("has" is not).
- [x] 37. Replies said differently from the last one; only yes/no questions are offers; a feeling
  told is asked after as "how are you feeling now?".
- [x] 35. Explanations past one link (why the cause is so, from its own page); still to do: follow HasCause of the cause (and Wikidata "has cause",
  P828) for a second "because"; "how does X work" by the same chain over HasPart/UsedFor.
- [x] 30. "how you doing?" is How(You(Doing())): self.ncon answers it as "how are you", said
  without its "are".
- [x] 38. What a question word asks for constrains what is looked up for the word it asks about:
  "who is gunter?" takes only a Wikidata sense that is a person or a name (`Someone
  WikidataClass("Q215627")`, Q82799), "where is X" a place; never the dictionary's gunter rig. Asked
  who and nothing found: a name. Still to do: the same constraint on answers already held.

# Understanding word problems and lists (GSM8K 0/50, 2026-10-13: scripts/bench.mjs, live-probe workflow)

Failures seen: names the text introduces looked up as world things ("Siobhan" a Korean singer, "In"
a postal service); every sentence heard alone; quantities as words; 14 of 50 timed out.

- [x] W1. (situation/situation.ts; pointing words inside it still to do) A message of several sentences is one situation: each sentence read into it, pointing
  words resolved inside it ("she" is Janet), a name the text introduces is a person of the text,
  never looked up.
- [x] W2. Quantities as values with units: "16 eggs" Quantity(16, Egg), "$2 per egg" a rate,
  "a dozen" 12, "twice as many" a ratio (units pack, number words).
- [x] W3. (packs/quantities.ncon) What a doing does to quantities, as facts on its Concept (eat, use, sell, give take
  away from the one doing it; buy, get, earn add; "per", "each" multiply), so a verb learned once
  works in every problem.
- [x] W4. The question names the unknown and its unit ("how much money", "how many eggs"); it is
  found by combining the situation's quantities whose units come out as the unit asked
  (dimensional analysis), each step shown.
- [ ] W7. CI with learning on (first 50, partly looked at while building): 7/50 (8826f4a), 8/50 (d58bfd7), 9/50 (f8285dc), 14/50 (c6e4850), 13/50 (c426a36), 15/50 (beeb3d5), 16/50 (6bf92ee), from 0/50. Unseen 650 test items (12-661): 104 right (16%); a non-whole count is never said (it was never right). Scratch after conversions: 47/250 unseen test items (12-261), 53% of "sure" answers right. CI d58bfd7: 8/50. Scratch, learning off, after nesting and each-rates: 15/100 unseen test items right (was 4), 18/150 on a fresh slice; about 8% of
  answers right on the train slice tuned against. Most misses need what it does not read yet: an
  unknown solved for ("8 times as many packages as meals ... 27 combined"), state as it goes ("a
  quarter of what is left"), "the rest" of a whole split by shares, nested comparisons ("5 less than
  half as many"). Next: amounts as each holder's state through the sentences, "what is left" as that
  state; one unknown solved for by a linear equation.
- [x] W8. (Superseded by W9, W13 and W15.) Words learned from worked examples (situation/learnwords.ts, scripts/learn-words.mjs): the
  packs' word facts forgotten, each word beside the amounts supposed each way, the answer counting
  for and against. 1500 train items, 3 passes: 108 facts, 30 as the packs say, 7 otherwise, 71 new
  (many noise at 2 for, 0 against). Test 0-99: packs 25, none 16, learned only 19. Next: a stricter
  bar; evidence pooled over a word's neighbors (its lemma, SynonymOf, IsA, antonyms say the opposite);
  a person's correction ("no, it's 15") counted as evidence too.
- [x] W9. Words learned from worked solutions (situation/worked.ts, scripts/learn-workings.mjs): each
  amount the question says is found in its working's steps; how the working uses it (taken away,
  added, carried through what it is multiplied into) votes for the words beside it, against how often
  words are taken away at all; doings learned apart for money and things ("sell"). From the 7,473
  train workings, the packs' word facts forgotten: 61 facts, 23 as the packs say, none otherwise.
  Test 0-399: packs 71, none 48, learned only 65, both 69. Company (situation/company.ts) finds a
  word's role but not its way: opposites keep the same company ("older"/"younger" 0.94).
- [x] W10. (Done as W16: learned weights kept in packs/situations.ncon.) The solver's weights as features (situation.ts PRIOR, `Situations Weighs(...)` over it),
  with each step's doings as features too ("minus|eat"). Learned from train: a perceptron shrank
  them (test 71 -> 65); hill-climbing on cached readings, held out, 71 -> 70; a softmax ranking with
  L2 to the prior on 4,000 train, 71 -> 76 (held-out 106 -> 107: not yet clearly real, not kept).
  The ceiling: on test 0-399 a right answer is among the ~29 readings in 163, ranked first in 71,
  and many of the 163 hit it by chance. The reading is the bottleneck: 237 have no right reading.
- [x] W11. Read again when nothing comes out as asked (each thing counted tried as the thing asked,
  then all as things); questions by their mark or a doing told ("Calculate ..."), not openings.
  Test 0-399: 71 -> 78; read 351 -> 380; a right answer among the readings 163 -> 187.
- [x] W12. (2026-10-14) What a carried number does is learned from how the working uses it: a
  number it divides by is a share (`third DividesBy(3)`, half, fourth, fifths), a word the tagger
  takes for a number is that number (eight), any other multiplies (`thrice Multiplies(3)`, twice,
  double); a common number is told apart by standard errors above its base rate, and a number
  carried by a more general word said beside it ("%" beside "tax") is that word's. The lexicon reads
  Multiplies/DividesBy as factors. Learned only, test 0-399: 78 (packs 84, none 46; was 69 before).
  Noise left: average DividesBy(3), a few names Multiplies(2).
  Before: numbers words carry, learned from workings by lift (scripts/learn-carried.mjs): "fifteen"
  15, "dozen" 12, "dime" 0.1, "minute" 60, "week" 7, "percent" 100, "leg" 4, from the numbers a
  working uses that its question never says. As counting words in place of the packs': 75 (packs
  78, none 72). Next: tell counting words from units and shares by where they stand and what the
  working does with the number (x n, / n), so "minute" learns Holds(Second(), 60) and "third"
  DividesBy(3); then every word fact learned at once, the packs' forgotten.
- [x] W13. Meanings as the graph's own facts: "eight" SynonymOf(Number(8)) (a synonym of a value
  forwards as that value: Eight() is Number(8), so "six times seven" is 42 anywhere); shares and
  multiples by definition (Third($x) = Divide($x, 3), read for the factor, as Half and Twice are);
  doings Removes() / Adds(), money apart (Sell Adds(Money())). Learning is general
  (learn/associate.ts: Associations by lift, Directions by base rate or majority) and writes those
  facts (situation/fromworkings.ts). All of the packs' word meanings forgotten and learned from the
  7,473 train workings: test 0-399 69 (packs 78, none 52), 78 learned, none against the packs.
- [x] W14. A unit known as IsA(UnitOfTime()) (as Wikidata grounding writes it) made the frames
  hearing misread "waht is 6 tims 7": a kind was found by every word of its name ("time" for unit of
  time). Now by its whole name or the word it is a kind of ("unit").
- [x] W15. Learning from being told (situation/correct.ts): after a worked answer, a short reply
  that names one amount and no thing of its own ("no, it's 15") is the answer; the reading that
  comes to it is said; each word of what was told (not the question's) is tried each way, and the
  ways that alone bring the answer out are kept as Told(...) evidence on the least known of them
  ("zorped" before "has"), the meaning itself once two tellings agree and none disagree; only a
  telling no word explains moves the weights (newest Situations Weighs(...) wins).
- [x] W16. Learned reading weights kept as graph facts: rank-weights.mjs (softmax, L2 to PRIOR,
  3,000 train / 750 held out / 400 test) learned weights, keep-weights.mjs writes each weight
  differing from PRIOR by more than 0.05 as Concept(Situations(), Weighs("feature", v)) into
  sources/situations and packs/situations.ncon (1,139 weights). Held-out 110 -> 123 of 750; the
  "ask|word|op" features (question words x the operator a working uses) added. Still to measure:
  learned-only and combined against test, chosen on train alone.
- [x] W17. Word problems and names go on instead of stopping. (The 0/50 CI number was a stale
  live-probe ref read locally; CI really read 15/50, as offline.) A word problem in several
  sentences whose thing asked is not told ("What is their average guess?") is read loosely, as
  asking a plain number; a doing told after a comma ("If ..., calculate ...") asks. A word written
  as a name where it was said, found nowhere, is IsA(Name()): looked up while reading, after the
  gaps' research, and in a statement noted ("Marie bought 5 apples." is kept, not "I don't know
  what marie is"). Still open: "Gunter is my friend" then "who is Gunter?" says only "a name"
  (recall left the seed); a name Wikidata finds only as a given name is not yet taken as a name.
  Pre-existing failures: ncon "core holds every Concept the host names" (Noun/Pronoun/Value),
  write "every source file reads back", pursue "what a line leaves undone".
- [x] W5. Lists of things: a run joined by commas and "and" ("apples, pears and plums") is a List in
  doings told ("Tom bought ..."), to-dos (each kept apart) and lists held (holding pack, already).
- [ ] W6. Speed: long messages read in parts; no lookup of words the text itself defines. The
  solver scores readings as they are built (weights summed, features merged and steps said only for
  what is kept): the slowest GSM8K item of the first 50 11.8 s -> about 4 s, the same answers.
  Still: eight amounts make 3^8 subset pairs; prune by unit before combining.

# Games, learned

Not a pack per game (2026-10-14: the chess pack was dropped). A game is learned the way anything
is: its pieces, places and moves told ("a knight moves in an L", "you win when ..."), shown by
play, or read from where the world writes the rules, kept as ordinary Concepts and relations, and
played by the general machinery that works out what follows from what is held.

- [ ] Reusable Concepts a game's rules can be told in: places on a board (geometry), pieces as
  individuals with a place, a turn, what a move changes, what ends it.
- [ ] Rules told in words kept as realizations over those ("a rook moves any number of squares in a
  straight line"), checked against play, corrected when a move is said to be wrong.
- [ ] Rules read from a page (Wikipedia, Wikibooks) the same way, with their source.
- [ ] A session in conversation: what is in play takes what is said to it first (any activity, not
  one game), moves heard, answered from what is held, taken back, a rule changed with consent.

# One reader (asked 2026-10-15, in the user's words)

> I want 1 general reader that can identify all those fixed frames by the concepts collective decided sense, it should be able to break up large prompts retain references in earlier parts back fill from later references and look for prior conversation messages or memory  or file/system references to fill possibly missing holes or ask if it cannot determine/infer them. All the like backfill lookup should probably be like one "context lookup" that we can add more lookup sources to later. Then finally refs that require results from execution should be done in the order that the holes that require them are not in said order. Then additionally it would be great if there could also be a layer that tries to identify "goals"/"intent"/"objectives" and creating steps to achieve that goal that were not in the prompt. Like napkin should pursue its own learning by looking through its own learning sources until it gets one that is the best fit. It should persue the the goal by looking shit up, creating steps for itself to achieve that goal. How that happens maybe it has a conversation with itself where it' asks itself questions (the same path a normal user would) and uses its own responses to create the plan or execute different steps (sub goals?) or something. And this can happen back and forth till it achieves. Like it can look up snippets do all its normal learning and piecing together.

- [ ] One reader: the hole-driven composer reads every message; the fixed frames readers, the situation reader and the rules parser become what the words' senses decide, then are removed. Measured: GSM8K with frames alone ≥ the situation reader's 15/50; SODA coverage; all tests.
- [ ] Long messages: broken into parts, read in order, one reading across them: a reference fills from earlier parts, and a hole left open fills from a later part.
- [ ] One context lookup for open holes, its sources pluggable: this message, earlier messages, memory (the graph), files/system, then the learning sources; asked of the person when none can say.
- [ ] Holes needing a result run when that result exists: the order is what each hole needs, not the order the words came in.
- [ ] Order said is order kept (asked 2026-10-15): "Also, like in my last prompt, I say to do multiple things. But one thing "before" the others, we should see if any order like that exists before starting any executions as well to ensure proper desired ordering." Before anything runs, the whole message is read for order words ("before", "first", "then", "after", "once"), and the plan honours them along with what each hole needs.
- [ ] Goals: what is wanted, and the steps to it the message did not say; pursued by asking itself, the same path a message takes, using its own answers to plan and do sub-goals, back and forth until done or stuck (then ask). Builds on packs/pursue.ncon.

# A teacher for what Napkin is missing

- [x] Wired (research/teacher.ts): Gemini via the worker, asked last for a word (word / misspelling / name, in Means, IsA, PartOf, UsedFor, HasProperty) or an event (ATOMIC relations), stamped `Teacher Taught(term)`, asked once; on in the studio and CLI (`--no-teacher`), off in tests. Live probe: ~1-2 s per lesson; "my sourdough starter died" answered from what it taught; a made-up word taught as unknown, not guessed.
- Taught facts are said plainly, like anything learned (decided 2026-10-15); retracted only when contradicted.
- [ ] Measured: teacher's ATOMIC answers against ATOMIC's own on events it has.

A small model, run locally (in the browser or the host), asked only when Napkin has a gap the graph
and the sources leave open: it TEACHES (facts in the graph's own relations, with itself as the
source), and Napkin answers from what it then holds, never with the model's text. The old Teacher
was taken out because it invented facts ("emoji SynonymOf(emoticon)"), so:

- [ ] Grounded first: the model reads a page Napkin fetched (Wikipedia, Wiktionary) and writes the
  relations the page says, rather than recalling from its weights.
- [x] Constrained: it answers only in relations the graph already has, for the gap asked, checked
  by parsing; anything else is dropped.
- [x] Kept plainly: stamped with the model as source (separable), said like anything learned.

# Ideas

- [ ] Types as Claims, written as TypeScript: kinds carried as `claim=` on binding sites (no wrapper), author annotations kept, a `Claim` Concept infers the rest, interfaces/aliases as `Kind(...)`, cross-file kinds resolved for inference. Plan: `tasks/typescript-claims.md`.
