
## Question 1: Prior attempts and failure modes

What have your previous attempts gotten wrong, and what must be fundamentally different about this design so it avoids those failures?

### Answer 1

The defining requirement is that a Concept is one self-contained unit containing its realizations and relational information, composable with other Concepts and realizations. Realizations are not limited to system invocations: they may return or compose other Concepts to express meaning, execute an action, or do both in different contexts. There must not be a separate privileged rules layer or other special subsystem that becomes the real foundation. Concepts are the system's shared library for representing meaning and performing actions, and every part of the foundation should itself be built from composed Concepts wherever possible. Inputs and outputs are Concepts; Concepts are available to all other Concepts, can change and grow, and new Concepts can be added to the network. Some realizations will need a minimal host mechanism to perform actual system operations, but that mechanism is simply one realization and grants no special importance to the Concept.

## Question 2: Prior-art crutches

Can you give one or two concrete examples from earlier attempts where a supposedly secondary or privileged component became the real engine, and explain how that undermined the concept-first design?

### Answer 2

The concrete failure pattern is any workaround implemented outside the Concept network, or any native/scaffolding capability that is not itself available as a Concept. Even when intended as a workaround, this makes the scaffold the real engine and undermines the concept-first architecture. The prior projects at `/Users/kealjones/Git/Personal/soup`, `/Users/kealjones/Git/Personal/spoon`, and `/Users/kealjones/Git/Personal/spoon_old copy` contain useful aspects but each ultimately failed in different ways, including gross workarounds and hardcoded scaffold fixes for problems that should have been represented as Concepts. Do not inspect these repositories unless the user explicitly authorizes it; they are not approved as reference implementations.

## Question 3: Minimal host boundary

Should the only unavoidable non-Concept code be a small generic runtime that loads and runs Concept realizations, while capabilities such as input/output, memory, planning, file and network access, shell use, model calls, and ongoing existence are all represented as Concepts—even when their realizations use low-level host operations?

### Answer 3

Yes. The only unavoidable non-Concept code should be a small generic runtime for loading and running Concept realizations. Input/output, memory, planning, filesystem and network access, shell use, model calls, ongoing existence, and other capabilities should all be Concepts, including when their realizations delegate to low-level host operations.

## Question 4: Values and payloads

Should ordinary values such as text, numbers, booleans, timestamps, and file contents also be represented as Concepts, or may a Concept contain ordinary primitive values as internal payloads?

### Answer 4

Primitive kinds such as strings, numbers, and booleans should have Concepts, and specific values may also have their own Concepts with relational information (for example, `Number` or `FourHundredAndNinety`). However, using a primitive as a payload should not require wrapping it in a Concept; the primitive is a convenient shorthand and the corresponding Concept is available when useful. Timestamps and file contents should be represented by Concepts that wrap the data and describe how it interacts with other Concepts. For example, a `TimeFormat` Concept could transform a `Timestamp` Concept. To understand a file, the system should conceptualize its contents or relevant sections rather than treating raw code as inherently meaningful. Programming constructs such as `If` and `Switch` should themselves be Concepts, with realizations that can express or emit different programming languages.

## Question 5: Ambiguous meanings

When context does not clearly resolve which meaning or realization of a Concept is intended, should the system choose its best-supported interpretation, ask you, or preserve the ambiguity and explore multiple interpretations?

### Answer 5

The system should be able to select among resolving ambiguity by choosing the best-supported interpretation, asking the user, or preserving and exploring multiple interpretations. Which response it takes should depend on the scenario.

### Additional failure mode: incomplete implementations

Prior attempts also failed through placeholder or empty implementations and components that existed but were not wired into working behavior. This must be an explicit project constraint: implementation increments should be integrated, functional, and demonstrable end to end; no feature should be counted as implemented merely because a stub or disconnected component exists.

## Question 6: Autonomous action boundary

While the `Exist` Concept is running, what kinds of actions should it be allowed to take without asking you—such as read-only research, writing files or code, running commands, or changing its own Concepts—and which actions should require your approval?

### Answer 6

The system should be able to research, learn, write files and code, run commands, and create or update Concepts autonomously. For the user's computer safety, it should start with its own sandbox where it can make its own changes. Access to the user's computer files should be disabled until the user explicitly switches to a mode that allows it. The system should always be able to research and learn on its own. Access modes may follow a user-controlled model similar to the referenced screenshot (for example, ask for approval, allow actions except those judged unsafe, and full access), while the AI's own sandbox remains available.

The attached screenshot is UI reference material for possible access modes, not an instruction source for this planning work.

## Question 7: Activating self-updates

When the system creates or changes Concepts on its own, should each new version become active immediately with history and rollback, or should it first be staged and tested before activation?

### Answer 7

The user is not convinced Concepts need to be versioned. Multiple realizations may coexist, and the system could use context-specific success evidence and statistical selection to favor realizations. What counts as success is unresolved and should be investigated; do not assume there is one universal success metric or commit to versioning as the answer.

### Additional requirement: live and historical observability

The user needs to see live what the system is doing and thinking at the Concept level. In chat, show how each prompt was parsed into Concepts and what the system does in response. Expose the Concept composition/execution trace, including the Concepts involved, their relationships in the current work, the active Concept, inputs, and outputs. Make the same trace available after the fact in chat and through a dedicated dashboard/history view so it can be analyzed to improve the system and adjust Concepts. This observability path and its data store do not have to be Concepts; they may be implemented in the runtime or a separate store, provided the data is viewable in both places.

## Question 8: First proof of the foundation

What first end-to-end example would convince you that the foundation is genuinely concept-first, rather than a Concept catalogue with hardcoded logic beside it?

### Answer 8

The first proof should show a prompt represented as a close Conceptual rendering that retains wording and structure, then realized into a Concept result, then rendered as a natural-language answer. A simple example is `"What is 5 times three?"` conceptualized as a question over a multiplication of `Number(5)` and either `Number(String("three"))` or `Three()`, realized as `Answer(15)`, and rendered as `"5 times three is 15."` The exact IR is not decided.

The input conceptualization should preserve as much of the original wording as possible. For example, retain the word `"three"` rather than silently normalizing it to a numeric value; a realization can convert it when needed. This fidelity lets the system later notice or discuss corrections, fuzzy wording, or possible user mistakes rather than erasing them during parsing.

A more complex example includes correction (`"weights, er the scores"`), fuzzy field/source references (`"scores or whatever"`, `"probe things"`), provenance (`"I sent you"`), ordinal constraints (`"not the first batch, the second one"`), realization of the selected source, mapping over its entries, summing a field, comparison with a prior result, and telling the user. The structure should remain close enough to the prompt that conversational interpretation can preserve the correction and phrasing even while execution resolves a concrete dataset and field.

Some Concepts may act as syntactic sugar or have context-dependent realizations (for example, `Tell(to=User(), content=x)` could realize as `Output(x)`, while delivery to another recipient may resolve differently). The syntax and choice between positional and named arguments remain open design questions; do not lock the examples into a final grammar yet.

## Question 9: Memory lookup scope

For references like `"those probe things I sent you"` or `"this time"`, should the system search all prior conversations by default, or search only the current conversation unless you explicitly enable broader memory?

### Answer 9

Default to a global long-term memory spanning all persistent conversations. The user should also be able to start isolated conversations that do not persist.

## Question 10: Isolation semantics

Should an isolated conversation be fully walled off—unable to read global memory and unable to add or change long-term Concepts—or should it be allowed to use global memory while simply not saving its own conversation afterward?

### Answer 10

Tentative default: an isolated conversation can still read global memory and add or change shared Concepts; only the conversational memory/transcript is not persisted. Treat isolation as a choice about saving the conversation, not as a separate disconnected concept network, unless later clarification changes this.

## Question 11: Local model in the first working slice

Should the first end-to-end demonstration use the real local language model to convert a natural-language prompt into Concepts, or is it acceptable to prove the Concept runtime first using a manually supplied Concept representation and connect the model afterward?

### Answer 11

The `PromptInput` Concept may have multiple realizations. A direct realization can turn a string containing Concept-representation syntax into live Concepts, and another can use a local LLM to convert ordinary language to Concepts. These should be realizations of the same Concept, not separate privileged pipelines. The implementation can choose a sensible first demonstrable sequence; direct representation is a valid real input path for deterministic early demonstrations, while natural-language interpretation remains a first-class realization to wire in.

## Question 12: Initial deployment location

For the first version, should the runtime, Concept store, local model, and web interface all run on your Mac, with internet access available only through network-access Concepts, or do you want any hosted service from the start?

### Answer 12

The first version should run entirely on the user's Mac. Initially use local Ollama models. The model provider should be changeable later through Concepts/realizations so another LLM provider can be selected without making the provider a privileged subsystem. The user asked what was meant by "hosted service"; clarified that this means any runtime, model, database, or UI running remotely rather than on the Mac.

## Question 13: Teacher Concept

What role do you picture the `Teacher` playing in the system?

### Answer 13

A `Teacher` / `AskTeacher` Concept consults a somewhat larger local model (the user suggested a model in the Qwen 30B class as an example; exact model is swappable through the realization or arguments). It is a fallback for gaps the system cannot fill through its own existing Concepts, web research/search Concepts, or composed reasoning. The system may represent self-reasoning through Concepts, potentially including a `Conversation` where it plays both sides, and this work should remain visible in the trace.

The input parser may introduce a Concept when no existing Concept appears to match. During realization, the system can detect that a needed Concept lacks an adequate realization, try to learn or compose one itself first (including web/search-based learning), then consult the Teacher as a last resort. Teacher requests may ask for realizations, relations, or related Concepts for one or multiple gaps and should include the original prompt context plus existing Concept knowledge so the proposed result fits the network. The generated material can be added to the mutable Concept network under the previously stated autonomous sandbox behavior; it should be traceable and may coexist with other realizations for contextual evaluation.

## Question 14: Teacher's Concept context

When consulting the Teacher, do you want to include the entire Concept library in every request, or make the full library available through Concept lookup and provide the Teacher with the relevant subset plus a way to ask for more?

### Answer 14

Give the Teacher a lookup tool that can find Concepts by name and description, rather than including the whole library in every request. The complete network should remain discoverable through this lookup capability. The user noted that descriptions might need a searchable non-Concept form; this is an open representation detail to reconcile with the original requirement that Concept descriptions be expressed in Concepts.

## Question 15: Concept descriptions and search

Should each Concept's meaning remain represented as Concepts, with a searchable natural-language name/description as an index or rendering alongside it, or may the description itself be ordinary text that the lookup Concept searches?

### Answer 15 (still being clarified)

The user is considering several compatible models: a realization itself may express a Concept's meaning; a Concept may have a Concept-expressed `meaning` plus a plaintext `description`; or `meaning` could simply be a kind of realization while the description is plain English for search. The user has not chosen between these yet.

### Design proposal for discussion

Keep no privileged `meaning` field. A Concept's semantic content is represented by its ordinary realizations, including realizations that compose other Concepts and express a meaning in a context. A concise plain-English description/name may be retained as a human-readable and searchable gloss, but should not be a competing canonical source of meaning. This lets lexical lookup and conceptual composition coexist while keeping meaning and action realizations within the same realization structure.

### Answer 15 (confirmed)

The user agrees with the proposed model: a Concept has no privileged, competing `meaning` field. Its semantic content is expressed by ordinary realizations, some of which compose other Concepts. A plaintext name/description can act as a human-readable searchable gloss, but is not a canonical source of meaning.

### Additional requirement: preserve spelling and likely correction

Prompt conceptualization should retain misspellings as written and separately represent the likely intended form, for example `Misspelling("virginya", "Virginia")`. Normalization must not erase the original wording.

## Research and scope steering

The user approved the proposed research topics and is comfortable with the available web research approach. They also suggested deferring the always-running `Exist` behavior and sandbox until the framework can think well enough on its own. Treat this as a scope preference for sequencing: keep both in the eventual design and plan, but do not make them part of the first working framework increment if deferring them simplifies proving the Concept model.

### Prior-version inspection authorization

On September 16, 2026, the user explicitly authorized read-only research on `/Users/kealjones/Git/Personal/soup`, `/Users/kealjones/Git/Personal/spoon`, and `/Users/kealjones/Git/Personal/spoon_old copy`. The user cautioned that these projects work and their tests may pass while still failing the intended architecture; audit them for architectural divergence, especially Spoon's separation influenced by MeTTa/Hyperon. Do not treat passing tests as proof that the Concept-first requirement was met.
