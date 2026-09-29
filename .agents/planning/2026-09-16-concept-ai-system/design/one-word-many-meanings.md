# One word, many meanings: which mechanism says which

Napkin has several ways for one Concept to mean different things. Each answers a different
question, and using the wrong one is how behaviour gets shadowed, misrouted or lost. This guide
takes one word, **add**, and goes through every way it means something today, then gives the
rule for choosing.

Everything below is real: file and pack names say where.

## The mechanisms, in one table

| Mechanism | Chooses by | Question it answers | Where specified |
|---|---|---|---|
| **Pattern shape** (arity, nested structure) | what the call looks like | "What was it given, in what shape?" | concept-spec Part 6, 6.4 |
| **Types** (`types = Types(a = Number())`) | what the arguments are | "What kind of thing was it given?" | concept-spec Part 6.7 |
| **Context** (`context = ...`) | the situation the call is made in | "Where, for whom, in what mood is it asked?" | concept-spec Part 7 |
| **Inheritance** (`IsA`, the universal parent) | what the Concept is | "What does its category do, when it says nothing itself?" | concept-spec Part 9.2 |
| **Handover** (a realization hands back its call) | whether it applied | "It matched, but was it really for this?" | concept-spec Part 9.6 |
| **Synonyms** (`SynonymOf`) | nothing: it forwards | "Is this word another name for that one?" | AGENTS.md |
| **Folds** (multi-word names) | the words heard | "Are these words one Concept?" | `deriveFolds`, seed.ts |
| **Relations in a context** (a meaning's facts) | the context a question is in | "What is this word, in that meaning?" | refresh.md |

Selection weighs them in this order (concept-spec Part 9): where the realization is declared
(own before inherited), context specificity, pattern specificity, types, then evidence among
ties. A realization that does not apply hands over to the same Concept's next one.

## Add, every way

### 1. Pattern shape: two numbers

`packs/basic.ncon`: `Realization(Add($left, $right), context = Execution())` adds two numbers.
"add 5 and 3" is heard `Add(5, 3)` and gives 8.

**Hearing reads shapes.** How many things a doing takes is read from its `Execution()`
patterns: `Add` takes two, so "add 2 and 3" is heard as the two things it takes. A new
one-argument `Add($x)` in `Execution()` would change how every "add" sentence is heard (it did,
once: "add 5 and 3" became `Add(And(5, 3))`). Shape is the most global choice there is.

### 2. Shape: as many as are given

"add 3, 4 and 5" is `Add(3, 4, 5)`: hearing spreads a group said as one thing into the things
the doing takes. `packs/basic.ncon` says `Add` takes as many as are given:

```
Realization(Add($a, $b, $c, Rest($more)), body = Add(Add($a, $b), $c, Rest($more)))
```

the first two, then that and the next, down to the two-thing `Add($left, $right)`. Hearing
still reads "takes two" from `Add($left, $right)` (the least it takes), so "add 5", said after
4, still gets its first slot filled with the last answer.

**Rule:** a doing says how many it takes in its own patterns; nothing is derived onto the
parent to cover for a pattern that says less than is true.

### 3. Types: the same shape, different things

`packs/basic.ncon` has a second `Add($a, $b)`, for a date and a duration ("add 3 days to
today"). Today it tells itself apart inside its body. It should say so in its types, and the
common meaning, two numbers, stays the plain one:

```
Realization(Add($a, $b), types = Types(a = Date(), b = Duration()), ...)   the rarer meaning claims its case
Realization(Add($left, $right), ...)                                        the everyday one, plain
```

Same shape, same context: only what they are given differs. That is exactly what types are for.

**Rule:** when two realizations share a pattern and a context, and the arguments tell them
apart, type them. Do not check inside the body.

### 4. Handover: matched, but not for this

`packs/holding.ncon`: `Add(Ref(Rest($r)), $said)` puts things in a thing named ("add cheetos to
my shopping list", heard `Add(Ref(""), Cheetos(To(My(List(Shopping())))))`). "add 5", after 4,
has the same shape (`Add(Ref("", resolvedTo=4), 5)`). The holding realization finds no
container, hands back its call, and `Add($left, $right)` adds.

**Rule:** handover is for "whether this applies needs looking" (is anything named a holder?).
If a type could say it, type it instead; if the pattern could, pattern it.

### 5. Context: the mood it is asked in

`packs/holding.ncon`: `Add($said)` in `context = Interrogative()`. "can you add cheetos to my
list?" is a request, heard with one argument. In `Interrogative()`, not `Execution()`: hearing
reads only `Execution()` shapes, so a one-argument `Add` here leaves "add 5 and 3" alone.

**Rule:** a meaning that belongs to how something is asked (a request, a statement, a
supposition) goes in that mood's context.

### 6. Context: what it is said as

- **Speaking** (`packs/english.ncon`): `Add()` in `context = Speaking()` is the word "plus".
- **Explaining** (`packs/coding.ncon`): `Add($a, $b)` in `context = Explaining()` is "a plus b".
- **Code** (`packs/javascript.ncon`, `python.ncon`): `To(Add($l, $r), "($l + $r)")` is how Add
  is written in each language; a language is a context facet (ir-spec Part 10.3).

Same call, same arguments: the situation (saying it, explaining it, writing it in a language)
is what differs. That is context.

**Rule:** if the same arguments must mean different things in different situations, a context.

### 7. Context: supposed, not done

"what if I add milk to my list": under `Hypothetical()`, `Change` (holding) works out what would
change and changes nothing. The realization is the same one; the context tells it not to act.

**Rule:** whether to act or only say what would happen is a context (`Hypothetical`), never a
second realization.

### 8. Synonyms: another name

`packs/basic.ncon`: `Concept(Plus(), SynonymOf(Add()))`. "5 plus 3" is `Plus(5, 3)`, forwarded
to `Add`. Every meaning of `Add` is `Plus`'s too.

**Rule:** `SynonymOf` only when the two are the same in every meaning. Wikidata's aliases are
not synonyms ("wife" names a spouse without being one): they are `Called(...)`, heard as
Concepts.

### 9. Folds: words that are one thing

"add up" (`packs/everyday.ncon`: `AddUp($xs)`) is its own doing: "add up 3, 4 and 5". A
multi-word name derives its own fold (`deriveFolds`), so the words heard as `Add(Up(...))`
read as `AddUp`. Nobody writes the fold.

**Rule:** a phrase that is one meaning gets a Concept with that name; the fold is derived.

### 10. Relations in a context: what the word means elsewhere

"add" also means *to say further* ("'and bring snacks,' she added"). Nothing does that, but it
is a meaning of the word, and a source (Wiktionary) says so. It is held as facts in a context
named by what that meaning is, beside the rest:

```
Add  Relation(IsA(Saying()), context = Saying())
```

It changes nothing `Add` does: a relation in a context is found only by a question in that
context ("what does add mean when someone says something"). The meaning the graph runs on is
held plainly.

**Rule:** a meaning with no behaviour is facts in a context named by its kind. Only a
realization acts, and only in the context and for the shapes and types it says.

## The common meaning is the default

A Concept's obvious, most-used meaning is its plain realization: no types, no context, the one
anything gets when nothing more particular claims it. `Add` of two numbers is plain; `Add` of a
date and a duration is typed; `Add` to a list is a hand-over and a mood. The rarer meanings are
the ones that say when they apply. The common case never depends on a typed or contextual
realization winning a tie, and a reader finds the everyday meaning by looking for the one that
says nothing extra.

## Choosing: the questions to ask, in order

1. **Is it the same thing under another name?** `SynonymOf` (or `Called` if it only names it).
2. **Are these several words one thing?** A Concept with that name; the fold is derived.
3. **Does it take any number of things?** Say so in its pattern, with `Rest`.
4. **Is it told apart by the situation** (mood, saying, explaining, a language, supposing)?
   Context.
5. **Is it told apart by what it is given** (numbers, a date, a list of words)? Types.
6. **Is it told apart by the shape** (one thing, two, a nested phrase)? Pattern, and remember
   hearing reads `Execution()` shapes: a new shape there changes how words are heard.
7. **Can it only be known by looking** (is anything named a holder)? A realization that hands
   back its call when it does not apply.
8. **Is it a meaning with nothing to do?** Relations in a context named by its kind.

What never to do: check a type or a mood inside a body when a type or a context could say it;
put a meaning's facts plainly when they belong to one meaning; add an `Execution()` shape to a
doing hearing reads, when the meaning belongs to a mood.
