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
- [ ] 2. Nested framing: "I told them that X" wraps X as reported; clauses joined by "and" split by
  their holes, not by a question-word check.
- [ ] 4. Inverse relation names as senses: import Wikidata's inverse labels so "directed" is
  Director by the graph, not by sharing five letters.
- [ ] 5. Learned scoring: corrections and confirmed answers adjust which sense won, which hole a word
  filled, which spelling held. Weights stop being hand-set.
- [ ] 6. Ask when two readings are close ("born when, or where?"), and keep the answer as a
  `ReadBeside` sense choice, instead of falling back to `Hear()`.
- [ ] 7. More computation senses: one-hole and list holes ("square root of", "average of",
  "percent of").
- [ ] 8. Answers you can trace: show which word filled which hole, and why, in the studio.
- [ ] 9. Hygiene: bound `trace.jsonl` (about 300 KB a turn); file reads only under the workspace.

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
