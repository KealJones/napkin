# Where Napkin learns from: sources as Concepts

Status: the current state, and a proposal. Not built. Written 2026-09-25.

## What exists

There is a `Source` category, but it is a label, not a mechanism.

- `packs/basic.ncon` declares `Web`, `Wikidata`, `Ngsl`, `OpenEnglishWordNet`, `ConceptNet`
  and `Cili` as `IsA(Source())`.
- `packs/words.ncon` and `packs/dialogue.ncon` declare `Wiktionary` and `DailyDialog` as
  `IsA(Corpus())`, and `Corpus` is not a `Source`.
- `Text` in core is also `IsA(Source())`, meaning source text for code. That is a second
  sense of the word under the same name, so "every `Source`" would include it.
- The Teacher is not a Concept.

How each source is used is written in host code, in a fixed order:

- `src/learn/learn.ts`: a whole phrase, then Wikidata (`src/research/wikidata.ts`), then
  Wiktionary (`Meaning`), then a web search (`src/research/sources.ts`), then the Teacher.
- `packs/pursue.ncon`: questions call Wikidata and web search by name.
- `src/store/provenance.ts` (napkin --sources) lists the source names by hand.

Adding a source today means host code in three places.

## Proposal

Every place Napkin can learn from or look in is a Concept of one kind, with the same
behaviour, so a new source is a new Concept and nothing else changes.

1. **One category.** `LearningSource` (not `Source`, which `Text` already uses for code).
   `Wikidata`, `Wiktionary`, `Web`, `DailyDialog`, `Teacher`, and later a connected
   workspace or calendar, are each `IsA(LearningSource())`. The user is one too: what they
   said is a source, with the most trust about themselves.
2. **One behaviour, several questions.** Each source realizes what it can answer, and
   leaves the rest residual:
   - `Senses($word)`: what a word or phrase could name (Wikidata items, Wiktionary
     entries).
   - `About($thing, $property)`: a fact (Wikidata claims, a web page read by the Ears).
   - `Find($reference, $kind)`: what a reference points at (the conversation, the graph, a
     workspace; prompt-hearing.md section 7).
   - `Replies($message)`: how people answer something (DailyDialog).
3. **One stamp.** Everything a source gives is stamped from `<Source> Imported(...)`, the way
   Wikidata, Wiktionary and the Teacher already are (2026-09-25). `napkin --sources` then
   finds sources by the category instead of a hand list.
4. **Order learned, not written.** Today the order is fixed in learn.ts. Instead, learning
   asks every source that answers the question, and ranks them by how their facts have held
   up: facts kept, against facts deleted or retracted, per source, from the same stamps.
   The Teacher starts last and stays there until its facts earn otherwise.
5. **Consent for private sources.** A workspace, a repository, a calendar: off until the
   user connects it, and only what they connected is searched.

## Order of work

1. `LearningSource`, with the sources above declared as it, including `Teacher`, and
   provenance.ts finding them through it.
2. Move Wikidata and Wiktionary lookups behind `Senses` and `About` realizations on their
   Concepts; learn.ts asks every `LearningSource` instead of calling each by name.
3. Web pages read by the Ears (prompt-hearing.md), as `About` on `Web`, replacing research
   text handed to the Teacher.
4. Rank sources by how their facts hold up.
5. `Find` on a connected workspace, with consent.
