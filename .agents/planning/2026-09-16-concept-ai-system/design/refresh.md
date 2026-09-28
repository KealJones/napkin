# Refresh: every Concept, every source, kept current

Status: planned, not built. Written 2026-09-28.

## The problem

Napkin learns about a Concept once, with whatever the learning code could do that day, and
never again:

- A thing is grounded in Wikidata only while nothing but its name is held
  (`unknownAnswer`, `describedAlready` in `src/learn/learn.ts`). After that it is never asked
  again.
- A relation's metadata (aliases, symmetry) is skipped if it is already tied to its property
  (`describeRelation` in `src/research/wikidata.ts`).
- So a graph keeps every old format and every gap forever. Examples from 2026-09-28: aliases
  kept as text (`Called("wife")`, meaningless to the graph) before they were kept as heard
  Concepts (`Called(Wife())`); Spouse facts without the start and end dates grounding now keeps;
  things grounded before item aliases were read have none.
- Pack Concepts (`Human`, `Male`, `Sequence`, `List`) and learned words are never asked about
  at all, even when a source knows a great deal.
- A fact that changed in the world (a new spouse, a new population) never changes here.

## The idea

Every Concept keeps a record of which sources have been asked about it, when, and by which
version of the code that asks. A refresh asks each source that applies and whose record is
missing or older than the current code, adds what is new, retracts what the source no longer
says, and deletes leftovers in formats that are no longer written.

### Sources

| Source | Says | Applies to |
|---|---|---|
| Wikidata | facts with their dates (P580/P582), aliases as heard Concepts, the description and the kind it names, a property's aliases, symmetry and inverse | a thing, and a relation tied to a property |
| Wiktionary | senses, part of speech, synonyms, hypernyms (what it is a kind of) | every word |
| The dialogue corpus | how the word or phrase is used in talk | words and phrases |
| Napkin's own derivations | folds for multi-word names, `Mentioned`, symmetric and inverse facts, groupings | every Concept, always re-derivable |

Each source is a Concept with an `Asks($concept)` realization (the code that asks it today:
`groundInWikidata`, the Wiktionary grounding in `packs/grounding.ncon`, the corpus reader) and
a `Version(n)` relation, bumped whenever that code learns to keep more. A new source is a new
Concept; nothing in the host lists sources.

### The record

```
StevenSpielberg  Asked(Wikidata(), item="Q8877", revision=2270000000, version=3, at=...)
Spouse           Asked(Wikidata(), item="P26", version=3, at=...)
Clock            Asked(Wiktionary(), version=2, at=...)
```

It is a relation like any other, stamped and sourced, so it is journaled, exported and traced.
`Imported(item, revision=)` on `Wikidata` today is the start of this; it moves onto the
Concept it was about.

### Refresh(concept)

For each source that applies (a realization of `Applies($concept)` on the source, so what
applies is the graph's, not the host's):

1. No record, or a record with an older `version`: ask it.
2. What it says now that is not held: added, sourced from this asking.
3. What is held from an earlier asking of the same source that it no longer says: retracted
   (`Retracts(seq)`). That is a genuine change, the case retraction is for.
4. What an earlier asking wrote in a format no longer written (`Called("text")`): deleted
   outright while Napkin is young (AGENTS.md), after the store backup.
5. The record updated.

Facts that were told, learned from talk, or derived are never retracted by a source: only what
that source itself said.

### What is never sent out

The user's own individuals (`Greg_1`, `ShoppingList_1`, a conversation) and what the user told
Napkin are never asked about outside: memory-spec Part 6.6 already says personal individuals
are not researched. Only the derivations refresh for them.

### Pack Concepts: their own sense, found and tied; the others beside it

A pack Concept is not "machinery, not the word". `Sequence` runs steps in order because a
sequence is things in an order: what the pack does is one of the word's real senses. So a
refresh finds **which** sense that is and ties the pack Concept to it, and keeps the word's
other senses beside it:

```
Sequence  SameAs(Wikidata("Q133250"))                      the sense the pack implements
          IsA(Collection())  ...                             what that sense says, plainly
          Relation(IsA(MusicalForm()), context = Sense(Wikidata("Q...")))   another sense of the word
          Relation(IsA(FilmScene()),   context = Sense(Wikidata("Q...")))   and another
```

**Which sense is the pack's** is picked the way any sense is (AGENTS.md: "pick the sense that
makes the question make sense"): the one whose kinds and description fit what the pack already
says of the Concept (`Sequence IsA Collection`, a `Code` primitive; `Human IsA Someone`; `List
IsA Collection`). When none fits clearly, the Concept gets no tie and every sense stays in its
own context: an honest "not sure which", never the first label.

**What the tied sense says is held plainly**, like any learned fact, because it describes the
same thing the pack runs. **The other senses stay in their contexts**, so the word's music or
film meaning never changes what `Sequence` does, and a question that means one of them
("what is a sequence in music") picks it by use. This is how "clock" and `Mood` went wrong
before: a stranger's sense taken plainly. With the tie, the right sense is plain and the
strangers are contextual.

What the pack declares always wins over a source where they disagree: a source's fact that
contradicts a pack's (a `Functional` relation given a second value) is held in the sense's
context, not plainly.

### When it runs

- **On use, after the reply.** When a turn touches a Concept whose record is missing or stale,
  the answer is given from what is held, and the refresh runs behind it. The studio streams
  what landed; the next question finds it. This is the background learning asked for on
  2026-09-28. The one exception stays in the turn: a thing the question is about that nothing
  but its name is held of (today's `unknownAnswer` path), because there is no answer without it.
- **A sweep.** "Refresh from sources" in the studio (Concepts page, beside Export and Clear) and
  `pnpm napkin --refresh` in the CLI: every Concept, oldest record first, rate-limited to each
  source's policy (Wikidata: one request at a time, a gap between, a User-Agent; 429 waited out),
  resumable (the record is the progress).
- **Enrichment in the background, generally.** Grounding splits in two: what the question needs
  (the thing, its description and kinds, the claims the question names) in the turn; the long
  tail (every other claim, the properties' metadata, aliases) after the reply.

### Build order

1. The record: `Asked(source, ...)` written by today's Wikidata grounding, with `version`; the
   `Imported` stamp moved onto the Concept. Test: a grounded thing has its record.
2. `Refresh` for Wikidata things and relations: re-ask when stale, add, retract, delete old
   formats. Test with a fake fetch: a claim dropped upstream is retracted; `Called("wife")` is
   replaced by `Called(Wife())`; dates appear on an old Spouse fact.
3. The sweep, CLI then studio button, rate-limited and resumable. Run it on a copy of
   `~/.napkin/store.ncon` and on a phone export first; read the diff.
4. On-use refresh after the reply, and grounding split into now and later.
5. Wiktionary and the corpus as sources with records.
6. Pack Concepts: the pack's own sense found by kind and tied (`SameAs`), its facts held
   plainly; the word's other senses in their contexts, picked by use. The riskiest step; its
   tests are that every existing test still passes, that "what is a sequence" answers with the
   ordered sense and "what is a sequence in music" with the other, and that "clock" answers
   sensibly.

### Open questions

- How stale is stale by time alone (a revision older than N days), beside a version bump?
- Should a refresh that retracts something say so ("Kate Capshaw is no longer listed as his
  spouse")? Probably in the trace, not the reply.
- The dialogue corpus is large and local: is "asked" even meaningful for it, or is it always
  current?
