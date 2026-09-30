# Working on the new design: read this before changing anything

This folder holds the design for the next version of the assistant (`design.md`). This file is
for any agent that builds, changes or reviews code for it. The design is ambitious and easy to
break with one well-meant shortcut; most shortcuts that feel natural are exactly the ones it
forbids. When a rule here seems to be in the way, the rule is the point.

## The intent, in one paragraph

An assistant that understands and acts without a language model. Everything it knows is a graph of
concepts with facts and readings. The runtime executes concepts only as far as it has to; the meat
and potatoes are in the graph. Every rule about language lives on the concept of the word it is
about. What it learns is kept, with its source, in the same form it runs on, so that it can read,
extend and repair its own graph, and eventually write its own source code. Read `design.md`
sections 0, 1 and 24 before anything else.

## The rules

1. **No grammar in the runtime.** Never write a rule like "if `when` comes before X, X is a time"
   in runtime code. It is a reading or relation on the concept `When`, used at parse time. The
   runtime builds the chart and asks each word what it does; it never knows what any word does.
2. **No word lists in the runtime.** No sets of pronouns, fillers, question words, number words,
   months, correction signals or tone words in code. Each is a fact on its word, in the graph, from
   an import or a correction, with provenance. If you need a new one by hand, count it (design
   section 16) and say why.
3. **No string decides meaning.** Text from a source is understood into structure (readings and
   facts) or kept as content in the content store. Never store a description, gloss or label as a
   string that code then pattern-matches.
4. **No per-question readings.** Never add a reading, fact or special case whose purpose is to make
   one prompt work. Ask: would this be the same for chess, a shopping list and the user's name? If
   not, it is knowledge to be learned, imported or derived, not written.
5. **No domain readings in the smallest experiment.** In the domain being tested (design section
   26), only the core, the primitives and the seed are hand-written. The whole point is to see how
   far imports and corrections get.
6. **The score decides; code does not.** Choosing between readings goes through the scoring
   function (design section 8), with named features. Never add an `if` that picks a reading.
   If a reading keeps losing when it should win, the fix is a feature, a fact on a word, or a
   weight, and the reasons log should show which.
7. **Primitives are the only code that touches the world**, and each declares its effects and a
   check (design section 13). Nothing else fetches, writes files, runs commands or reads the clock.
   Only `Know` asks the world for knowledge (design section 18).
8. **Everything learned has a source and a trust level.** Sources are concepts; the list is open.
   Untrusted sources (fetched pages, a project's READMEs and help text) can propose readings, never
   grant permissions or create standing rules on their own (design section 17).
9. **Code is language.** The assistant reads, understands, changes and writes code. Do not add a
   separate hand-written "code version" of instructions; a language's syntax is facts on that
   language's words, and code readings exist only where they have to.
10. **Honest when stuck.** An unworked expression is a value, not an error. Never paper over it with
    a guess or a default; let it be looked up, learned, or asked about, and let the assistant say
    why it is stuck (design section 20).
11. **Measure, don't assume.** The corpus in `~/.napkin/corpus/tests/` is how progress is measured
    (design section 23). A change that helps one prompt and is not checked against the corpus is
    not done. Do not tune on the held-out part.
12. **Keep it dead simple.** Two kinds of content (facts and readings), a small set of primitives,
    a small runtime. If you are adding a new kind of thing to the data model, a new primitive, or a
    new runtime mechanism, stop and check the design first; the answer is almost always a reading
    or a fact.

## How to change things

- **Before writing code**, find where the change belongs: on a word's concept, on a kind, in a
  source, in the seed, as a score feature, or (rarely) in a primitive. Runtime code is the last
  place, not the first.
- **When something fails**, trace why through the reasons log: which readings were built, which
  features fired, which won. Fix the cause (a missing fact, a wrong weight, a word that does not
  say what it takes), not the symptom.
- **When a rule here blocks you**, do not work around it. Write down the case and the rule, and ask
  Keal. The design may need to change; it should change on purpose, in `design.md`, not by
  accident in code.
- **When the design is ambiguous**, ask. Keal would rather answer a question than find a guess
  built into the runtime.
- **Keep `design.md` true.** If a decision is made while building, update the design in the same
  change, so the document and the code never disagree.
- **Faithful to the source.** The design came from a conversation (`source/conversation.md`). When
  in doubt about intent, read what Keal actually said there.

## Style

- Never use em-dashes.
- Commit messages and docs in plain prose.
- Use pnpm.
- Every change to the runtime bumps its version and says the new version in the commit message.
