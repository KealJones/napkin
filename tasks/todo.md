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
- [ ] 22. Pursue answers what was not asked ("what is todays date?" "Yes."; "how you doing?"
  "Arithmetic."): an answer must account for the question, as frames' `AnsweredBy` does.
- [ ] 23. Judge answers a choice with nothing grounded ("Both are kinds of elephant."): don't.
- [ ] 24. code-hearing (10.5k lines) is off the live path: keep as the code-hearing experiment, or
  remove (the user's call).
- [ ] 25. ATOMIC 2020 (CC BY) for everyday events (xReact, xWant, xEffect), fetched at build like
  DailyDialog; ConceptNet has little for "my car broke down".
- [ ] 26. DailyDialog is CC BY-NC-SA (non-commercial): decide whether the corpus stays.
- [ ] 27. Three unit tests fail on main (chat "when you say hello?", focus "supplies list", pursue
  "cake recipe").

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
