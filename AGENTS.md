# Napkin: how to think about changes

Napkin is a concept graph that works answers out. The goal is never "make this prompt
answer correctly". It is "give Napkin what it needs to find this kind of answer itself".

## The one test

Before seeding a Concept or a realization, ask: **would this be the same code for chess, a
jam website, and the user's name?**

- Yes: a mechanism (search, compare, predict, read the store, arithmetic, say a result). Seed it.
- No: domain knowledge or an answer path. Don't write it. Let Napkin learn it, research it,
  or derive it.

Hand-author Concepts that help Napkin find answers. Never hand-author the answers, or a
per-question route to them. Hardcoded word lists that decide meaning, and bodies that know
what a particular question means, are answer paths even when they look general.

## Rules of the architecture

- **Everything is a Concept.** Host code names no semantic Concept (the six structural
  identities stay six). Host facilities are generic and reached through `api` (`readText`,
  `lemma`, `properNoun`, `store.mentioning`). A Concept the host must name lives in core.
- **A residual is a value, not an error.** Something that realized to itself is the signal
  to look further (`Pursue`) or to learn. Never paper over it with a guess.
- **Behaviour comes from context and inheritance, not dispatch.** Give a Concept a
  realization in a context (`Speaking()`, `Hypothetical()`, `Interrogative()`), or on a
  parent it `IsA` (an `Interjection` answers as talk by inheritance). When two meanings
  collide (`Mean` as average, `Mean` as signify), a more specific context separates them.
- **Derive instead of author.** `SynonymOf` derives forwarding. Pursue keeps the route that
  worked as a realization (Chunk). Multi-word Concept names should derive their own folds.
  If you are about to write fifty similar lines, write the derivation.
- **Where answers come from, in order:** what the graph holds, what the user said (matched
  by shape and by base form), behaviour the question names, then the world (Wikidata,
  Wiktionary, web pages, the DailyDialog corpus). The Teacher (a model) is the last resort.
  No model hears or speaks by default, and none should be added back to those paths.
- **Pick the sense that makes the question make sense,** never the first label: the sense
  that has the property asked for (Dune the novel has an author), the senses that share a
  kind (python the language beside javascript), the part of speech the word's use calls
  for. Taking the nearest label is how Keep became a castle keep and Means a family name.
- **Answer by kind.** Question words say what they ask for (`Who` asks `Someone`); an
  answer of another kind is passed over, not returned.
- **Be honest when stuck.** `Unknown`, `NoCommonKind`, a conditional answer ("if you want
  X, A; if Y, B") beat a confident guess. Judgment never stores value verdicts.
- **Everything learned carries provenance** (a stamp, `from=`, `Chunked(...)`), so it can
  be traced and deleted.

## How to build a mechanism

- A realization body is IR. Write it as JavaScript, convert it with `importTypeScript`
  (`src/code/import.ts`) into `Code(ir=...)`, and put it in a pack. Every pack must pass
  `formatNcon` (a test checks this).
- Keep each piece its own Concept (`Mentions`, `Extends`, `Pursue`) so it can be called,
  traced and replaced alone. Existing examples: `packs/pursue.ncon`, `predict.ncon`,
  `judge.ncon`, `words.ncon`, `dialogue.ncon`, `english.ncon`. The design and what each
  answers are in `.agents/planning/2026-09-16-concept-ai-system/design/pursue-predict.md`.
- A new result Concept needs an English wording: a realization in `Speaking()` in
  `packs/english.ncon`. Never route it to a model.

## How to verify

- **Try real prompts, not only the test suite.** `pnpm napkin --no-learn "..."` (add
  `--fresh` for a throwaway graph), and replay saved conversations (the `Said(...)` lines in
  `~/.napkin/store.ncon`) through `turn()` the way the studio does. Read the trace.
- When the user names a conversation id, find it in `~/.napkin/store.ncon`, work out why
  each turn failed, and fix the cause, not the one prompt.
- Behaviour removed on purpose keeps its tests as `{ todo }` targets, not deleted.

## The graph

- Use the real graph, `~/.napkin/store.ncon`. Back it up before editing. Never touch
  `store.ncon.old`.
- While Napkin is young, delete wrong learned facts outright (after the backup) instead of
  retracting them. Retraction is for facts that genuinely changed.
- The studio server holds the store while it runs; restart it to pick up changes.
- Commit straight to `main` unless asked otherwise.
