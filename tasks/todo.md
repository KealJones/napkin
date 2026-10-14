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

- [ ] 15. "what did i say my name was" answered "Dog." (the rules recall): a question about what was
  said should read the conversation's kept facts, and never answer with an unrelated thing.
- [ ] 16. Postfix operations: "3 squared", "5 cubed".
- [ ] 17. A number said of a person ("tom is 30") kept as what it most likely is, asked when unclear
  ("is 30 tom's age?"), read back by "how old is tom".
- [ ] 18. "was born in 1990" and other passives: "born" to the relation it is Called by, the year as
  a date; "when was i born".
- [ ] 19. Reminders and tasks ("remember to buy milk", "what do i need to buy"): a doing to do, kept
  as a task, not a fact.

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
- [ ] 25. ATOMIC 2020 (CC BY) for everyday events (xReact, xWant, xEffect), fetched at build like
  DailyDialog; ConceptNet has little for "my car broke down".
- [ ] 26. DailyDialog is CC BY-NC-SA (non-commercial): decide whether the corpus stays.
- [x] 27. Chat ("when you say hello?") and focus ("supplies list") fixed; pursue's "cake recipe" reads Wikibooks, so it passes only with the network: run it in CI with the live-probe workflow's `test` input (passes, 3aedfc0).
  "cake recipe").
- [x] 28. Code sent alone (a fenced block, nothing asked) is explained instead of "I see."
- [ ] 29. sources/grounding no longer regenerates packs/grounding.ncon as committed (the pack was
  edited by hand); bring the sources back in line.
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
- [ ] 30. "how you doing?" is How(You(Doing())): should reach self's "how are you".

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
- [ ] W8. Words learned from worked examples (situation/learnwords.ts, scripts/learn-words.mjs): the
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
- [ ] W10. The solver's weights as features (situation.ts PRIOR, `Situations Weighs(...)` over it),
  with each step's doings as features too ("minus|eat"). Learned from train: a perceptron shrank
  them (test 71 -> 65); hill-climbing on cached readings, held out, 71 -> 70; a softmax ranking with
  L2 to the prior on 4,000 train, 71 -> 76 (held-out 106 -> 107: not yet clearly real, not kept).
  The ceiling: on test 0-399 a right answer is among the ~29 readings in 163, ranked first in 71,
  and many of the 163 hit it by chance. The reading is the bottleneck: 237 have no right reading.
- [ ] W5. Lists of things, not only numbers: a run of the same kind joined by commas and "and"
  ("eggs, milk and bread"), taken whole by a word whose hole takes many.
- [ ] W6. Speed: long messages read in parts; no lookup of words the text itself defines.

# Concept games and chess

- [ ] Add reusable collection, record, geometry, and persistent-state Concepts.
- [ ] Seed chess movement, legality, transitions, outcomes, and evaluation as composed realizations.
- [ ] Add game sessions, action matching, simulation, corrections, and consent-controlled rule changes.
- [ ] Connect the game interaction to chat through Concepts and expose the expressions for inspection.
- [ ] Test ordinary play, illegal/ambiguous requests, special moves, variants, persistence, and actual chat use.
- [ ] Run workspace checks and document usage and remaining limits.

Domain behavior belongs in the saved Concept units. Seed files author ordinary units; no chess dispatch is added to the evaluator. Host code is limited to reusable operations on values, collections, geometry, storage, and external model transport.

# Ideas

- [ ] Types as Claims, written as TypeScript: kinds carried as `claim=` on binding sites (no wrapper), author annotations kept, a `Claim` Concept infers the rest, interfaces/aliases as `Kind(...)`, cross-file kinds resolved for inference. Plan: `tasks/typescript-claims.md`.
