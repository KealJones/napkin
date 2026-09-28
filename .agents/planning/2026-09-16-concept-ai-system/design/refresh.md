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
- Concepts a pack declared (`Human`, `Male`, `Sequence`, `List`) are never asked about at all,
  as though what a pack says of a word were all it means.
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

The user's own individuals (`Greg_1`, `ShoppingList_1`, a conversation) are not words: they are
people and things in the user's life, and what the user told Napkin is theirs. They are never
asked about outside (memory-spec Part 6.6). Only the derivations refresh for them.

### Every Concept is a word: no kind of Concept is special

A word's meanings are held with the mechanism Napkin already has, context: one meaning's facts
hold in a context named by what that meaning is (`MusicalForm()`), the way `regroundSense`
already keeps Pi's family-name meaning under `FamilyName()`. "A sense" below is only talk for
"one of a word's meanings"; in the graph it is that context, nothing more.

There are no "pack Concepts" and "world Concepts". Every Concept in any pack could be a real
word, and Napkin already has what a word with many meanings needs: several realizations, context,
more than one argument shape, and typed arguments. What a pack declares is one meaning among the
word's meanings, held the way every meaning is; that a pack declared it is provenance (a
stamp), not a different kind of Concept. So a refresh treats every Concept the same.

For `Sequence`, what the pack runs (steps in order, in `Execution()`) and what the sources say
(Wikidata's sequence, a music sequence, a film sequence; Wiktionary's senses) are all meanings of
one word:

```
Sequence  Realization(Sequence(Rest($steps)), context = Execution(), ...)     the pack's, as now
          SameAs(Wikidata("Q133250"))                                      the meaning that is
          IsA(Collection())                                                 what it says
          Relation(IsA(MusicalForm()), context = MusicalForm())             another meaning
          Relation(IsA(FilmScene()),   context = FilmScene())               another
```

- **Which sense a meaning already held is**, a refresh finds the way any sense is picked
  (AGENTS.md: "pick the sense that makes the question make sense"): the one whose kinds and
  description fit what is held of the Concept (`Sequence IsA Collection`; `Human IsA Someone`).
  That sense is tied (`SameAs`) and what it says is held plainly, since it describes the same
  thing. When none fits clearly there is no tie, and every sense stays in its own context: an
  honest "not sure which", never the first label.
- **The word's other senses sit beside it in their contexts**, and are reached the ways every
  meaning is: by context ("what is a sequence in music"), by argument shape, by the types of
  what they are given (concept-spec Part 6.7), by the sense the question makes sense with. They
  do not replace or shadow a realization, because a sense's facts are relations in a context,
  and a realization is chosen by selection, which already weighs context and types.
- **Where two meanings disagree** (a source gives a `Functional` relation a second value), they
  are two senses, each in its context, not a winner and a loser.

This is how "clock" and `Mood` went wrong before: one stranger's sense taken plainly, as though a
word had one meaning. With every sense in its context and the fitting one tied, no meaning is
lost and none takes over.

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
6. Concepts packs declared, refreshed like every other: the sense what is held already fits,
   tied and held plainly; the word's other senses in their contexts, reached by context, shape,
   types and use. The riskiest step, because every Concept in the seed gains senses; its tests
   are that every existing test still passes, that "what is a sequence" answers with the ordered
   sense and "what is a sequence in music" with the other, and that "clock" answers sensibly.

### Open questions

- How stale is stale by time alone (a revision older than N days), beside a version bump?
- Should a refresh that retracts something say so ("Kate Capshaw is no longer listed as his
  spouse")? Probably in the trace, not the reply.
- The dialogue corpus is large and local: is "asked" even meaningful for it, or is it always
  current?
