# Idea: hearing as words that find each other (Prompt)

Status: an idea, not a plan. Written down 2026-09-25 so it is not lost. Nothing here is
built, and most of it is open.

## The question it answers

What should the Ears be? Two answers kept fighting:

1. **Faithful.** The Ears keeps what was said and the graph works out what it means.
2. **Interpreting.** The Ears makes a clean, structured, executable expression.

Neither is right alone. A "faithful" structure is already an interpretation: deciding that
"work" is a noun, or that "by Paul Weitz" belongs to "co-produced", is a guess. But
structure is real. The words of a message relate to each other, and a bag of words throws
that away.

The way out: **the faithful record is the words themselves**, in order, as typed (the
`Said` already keeps the text). Structure is interpretation, and interpretation belongs in
the graph, where it can be learned and redone. Keeping the words is what lets an old
message be read again when the graph knows more. A reading made with the least knowledge
should never be the only record.

## The idea

A message becomes a `Prompt`: its words, each as a Concept, in order. The Prompt is a small
closed world. Each word can see the words around it, by position.

Hearing is the words finding their relations. Each word Concept has behaviour in a
`Hearing()` context that looks at its neighbours and claims a role:

- "the", "a": I belong to the next thing.
- "old", "teen", "1999": I describe the thing after me. "Teen" at 3 marks itself as
  describing whatever the next thing is, and when "film" at 6 comes up it finds it is
  described by everything waiting on it.
- "by": I take the thing after me, and I attach to the doing before me.
- "and": the things on either side of me are one group. What follows both ("by Paul
  Weitz") may belong to each.
- "is": the thing before me and the thing after me are the same kind of claim.

Every word proposes. Where two words want the same neighbour, or a word could play two
roles ("work" as a thing or as a doing), the proposals compete. Judge and Predict settle it:

- Judge, by what makes sense in the graph.
- Predict, by what the graph has seen before.

What is left when nothing changes is the structure. It is written as a Concept expression,
because that is what runs.

Nothing is invented that was not said. "is" appears only where "is" was said. An
appositive ("American Pie, a 1999 film") relates the two things through the comma, without
making up a verb.

## Why it fits Napkin

- **It is Ears in IR.** The rules parser's special cases are already per-word behaviour in
  disguise: DET absorbs, PREP wraps the next noun phrase, "and" joins. Moving each rule onto
  the word it is about makes the parser Concepts that can be traced, replaced and learned.
- **Most structure is in a few words.** The closed class (determiners, prepositions,
  conjunctions, helpers, around 300 words) carries most of the grouping. Open-class words
  get their roles from what they are (`IsA(Noun)`, from the tagger or the graph), by
  inheritance.
- **It learns.** A new way of saying something is a new behaviour on a word, seen once and
  kept (like Chunk), not a new rule in a TypeScript file.
- **It reads anything.** Web text, a fragment with no subject, a garbled message: every
  word still proposes what it can, and a partial structure is still structure, never
  `Unclear`.

## Prior art (to read before building)

- Word expert parsing (Small and Rieger, early 1980s): every word is a small program that
  knows how it combines.
- Link grammar (Sleator and Temperley): words carry connectors that must link to
  neighbours.
- Categorial grammars (combinatory categorial grammar, Steedman): a word's type is how it
  combines with what is left and right of it.
- Dependency grammar (Tesnière): structure as head-to-dependent links, not phrase trees.
- Attention in transformers: every token looks at every other one, but learned and
  opaque. The difference here is that each link is a named Concept with a reason.

## What is unknown

- **How proposals are written.** A realization pattern sees one call, not neighbours. The
  Prompt may need to expose "the word at my position plus one" (like `Previous` and
  `Position` in predict.ncon), or each word's behaviour gets the Prompt as its argument.
- **When it stops.** Rounds until nothing changes could loop. It needs a bound and a rule
  for which proposal wins a tie.
- **Cost.** An evaluation per word per round is slow next to the rules parser. It could
  start from the rules parser's reading and only settle what the rules were unsure of.
- **Where the tagger fits.** compromise's parts of speech are guesses too. They could come
  in as proposals, weighed like any other.
- **Mood, emphasis, corrections.** The markers the Ears makes today (`MarkMisspelling`,
  `MarkFuzzy`, `Mood`) become roles words claim ("not", "maybe", a "?" at the end).

## How it could start

1. Keep the text and the words in order as the record of what was said (mostly done: `Said`
   has `text=`).
2. Move one closed-class word's rule from rules.ts onto the word, in `Hearing()`: "and"
   first, since the American Pie sentence showed it being lost. Measure against the rules
   parser on the existing tests.
3. Add words one at a time while the tests hold. The rules parser stays as the fallback
   until words cover what it does.
