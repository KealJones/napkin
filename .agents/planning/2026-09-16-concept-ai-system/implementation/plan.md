# Implementation Plan

This plan turns the design into a sequence of tested, integrated increments. The first working loop is on demand and local. Each step ends with an observable demo. No step is complete when it has only types, a stub, an isolated module, or a benchmark path.

## Progress checklist

- [x] Step 1: Concept substrate and direct-expression arithmetic end to end
- [ ] Step 2: Local Ollama input/output Concepts and source-faithful prompts
- [ ] Step 3: Persistent Concept lookup, global memory, and isolated conversations
- [ ] Step 4: Live chat, Concept browser, realization editor, and trace history
- [ ] Step 5: Contextual realization choice and task-specific outcome evidence
- [ ] Step 6: On-demand research, gap handling, and Teacher learning
- [ ] Step 7: Code understanding and multi-language code generation
- [ ] Step 8: Sandboxed file/process actions and user-controlled access modes
- [ ] Step 9: Always-running `Exist` with observable, bounded autonomy
- [ ] Step 10: Rust runtime port with TypeScript/Rust behavioral parity

## Step 1: Concept substrate and direct-expression arithmetic end to end

**Objective:** Implement the smallest functional Concept system and prove that a directly supplied Concept expression can be evaluated by Concept-owned realizations into a Concept answer with a complete trace.

**Guidance:**

- Create the TypeScript project with a stable serialized Concept expression grammar supporting applications, named/positional arguments, variables, and direct string/number/boolean payloads.
- Store each self-contained Concept unit with its gloss, relations, and realization expressions together. Use SQLite as the canonical local store from the beginning; any indexes are derived and rebuildable.
- Implement a generic evaluator that performs structural lookup, match/substitution, bounded recursive application, and trace emission. Do not special-case `Multiply`, `Add`, `Number`, `Question`, or any other Concept name in runtime code.
- Keep the launcher to loading the Concept store and invoking a configured runtime-entry Concept. Store that evaluator's executable body in its own Concept unit and route it through the same generic code ABI.
- Represent realization definitions and bodies as Concepts. Add a generic code-realization ABI for trusted seed code without a concept-name-to-function registry. Keep compiled artifacts as disposable caches; the Concept owns the source/body.
- Store the runtime-entry evaluator loop as executable source inside the RuntimeEntry Concept realization; keep the launcher limited to reading that Concept and invoking the generic code ABI.
- Seed only the Concepts needed for `PromptInput` direct syntax, `Question`, `Number`, numeric conversion when requested, `Add`, `Multiply`, `Answer`, and minimal result rendering. All seed entries use the ordinary Concept format.
- Provide a small CLI that accepts a Concept expression, evaluates it, prints the result, and can display the structured trace.

**Tests:**

- Round-trip Concept units including their relations and all realization expressions through SQLite.
- Evaluate `Question(Multiply(Number(5), Number(String("three"))))` to `Answer(15)`.
- Change the stored `Multiply` or `Double` realization and verify changed behavior without changing runtime source or rebuilding the host.
- Load an alternate runtime-entry Concept from the store and verify the launcher invokes it without a host-code switch.
- Add a previously unknown Concept by composing existing Concepts and evaluate it without adding host code.
- Assert every nested invocation records caller, context, arguments, selected realization, result, and outcome.
- Include an architecture test/review gate rejecting Concept-name dispatch, opaque closures, or a parallel rule/native registry.

**Integration:** This is the base used by every later step. Model calls, memory, research, code generation, and effects will enter as Concept expressions through the same evaluator and trace.

**Demo:** Run the supplied Concept-expression form of “What is 5 times three?”, show each call, and end at `Answer(15)`. The raw word `"three"` remains in the input while its numeric interpretation happens during realization.

## Step 2: Local Ollama input/output Concepts and source-faithful prompts

**Objective:** Accept ordinary language through a `PromptInput` realization and return a natural-language response through a Concept-based output realization, using only local Ollama models.

**Guidance:**

- Add a generic Ollama transport adapter for local requests, structured responses, streaming, timeout/cancellation, and provider errors.
- Store model selection and options in Concept data. `PromptInput`, `OllamaLocalLLM`, and natural-language rendering are ordinary Concepts; do not create separate parser and answer tool paths.
- Ask the parser model for a Concept representation plus source-span links. Preserve exact raw text, spelling, phrase order, corrections, uncertainty, and named details. Keep likely spell corrections alongside the original form.
- Validate structured model output against the Concept grammar; reject invalid output or make one bounded, traced format-repair attempt. Never treat model output as executable instructions outside the Concept evaluator.
- Add human-readable rendering as another realization that consumes result Concepts. It may use a model; deterministic Concept composition remains available as an offline behavior.

**Tests:**

- Mock the local Ollama endpoint for deterministic parser, renderer, streaming, malformed output, unavailable model, and cancellation tests.
- Verify `"What is 5 times three?"` retains the exact source and `"three"`, returns `Answer(15)`, and renders `"5 times three is 15."` or a faithful equivalent.
- Verify `Misspelling("virginya", "Virginia")` retains both strings and source positions.
- Verify model/provider/model-name changes made in Concept data require no evaluator change.
- Add an optional local smoke test that runs only when the configured Ollama model is installed; missing models produce a useful error, not a fake response.

**Integration:** The ordinary-language route is a second realization of the same `PromptInput` Concept. Both language input and direct-expression input create the same type of Concept expression and trace.

**Demo:** In the CLI, enter the natural-language arithmetic question, watch the parsed Concept appear, inspect its source preservation, and receive the computed result and rendered response using a local model.

## Step 3: Persistent Concept lookup, global memory, and isolated conversations

**Objective:** Make Concepts searchable and persistent, support relevant context retrieval through Concepts, and implement the agreed conversation-memory semantics.

**Guidance:**

- Add Concept-owned `ConceptLookup`, `MemoryLookup`, and related retrieval realizations for names, gloss text, relations, current conversation, and persistent conversation history.
- Add derived SQLite full-text and relation indexes without moving semantic truth out of self-contained Concept units.
- Represent conversations, messages, prompts, parse results, and answers as Concept data with stable conversation identity.
- Default to persisted global long-term memory. Add isolated conversations whose transcript, parsed prompt, and content-bearing trace live only in volatile storage and are removed at close.
- Isolated conversations may read global memory and create/update shared Concepts. Shared updates must not retain the isolated prompt or transcript as provenance by default.
- Retrieve only relevant prior Concepts and messages for a prompt. Do not send a complete conversation history to Ollama as the default behavior.

**Tests:**

- Reopen the database and verify a persistent conversation, its prompt, parse, response, and Concept edits remain retrievable.
- Close an isolated conversation and verify transcript/parse/content trace are absent while explicitly created shared Concept changes remain.
- Verify memory lookup returns only relevance-ranked context and preserves message/source attribution.
- Verify Concept lookup finds aliases/glosses and traverses relation expressions, then returns full owning units with realizations.
- Verify corrupt store data fails visibly and cannot silently erase Concept realizations.

**Integration:** `PromptInput` uses `MemoryLookup` as needed; it receives relevant Concept results as arguments through the evaluator, not as a hidden conversation transcript injection.

**Demo:** Persist a user-provided fact in one conversation, refer to it ambiguously in a later conversation, and show the Concept lookup evidence used. Repeat in isolated mode and show that the isolated transcript disappears while a shared Concept the user asked to teach remains.

## Step 4: Live chat, Concept browser, realization editor, and trace history

**Objective:** Provide the requested local web interface for conversation, Concept inspection/editing, and live/historical execution analysis.

**Guidance:**

- Build a thin local API that accepts user text and starts a `PromptInput` Concept evaluation. Stream trace events and result Concepts to the UI with SSE or an equivalent local stream.
- Build a chat view with the original prompt, visible parsed Concept, response, expandable live Concept steps, and access to past traces.
- Build a Concept graph/browser with search by identity and gloss, relation traversal, realization list and context, and usage/outcome evidence.
- Allow editing a Concept's gloss, relation expressions, and realization expressions. Save the whole owning unit through the store; do not write semantic logic inside the UI.
- Show each trace event's parent, caller, arguments, output, selected realization, and model/effect exchange when available.
- Make isolated/persistent conversation selection visible. Do not persist isolated conversation trace content after close.

**Tests:**

- API integration tests prove chat requests, Concept edits, trace events, and history all reach the same runtime/store path.
- UI tests cover a complete chat turn, incoming trace events, Concept search, relation navigation, realization inspection/edit/save, and isolated conversation close.
- End-to-end test edits `Double` in the graph browser, submits a new prompt, observes changed output and a trace that names the edited realization.
- Verify event ordering and parent-child relationships under streamed updates and interrupted turns.

**Integration:** The API transports inputs and events only; the UI never answers, plans, selects tools, or runs Concept behavior itself.

**Demo:** Open the local browser, inspect the parse and live execution of a message, navigate from the trace to a Concept, edit its realization, and verify the next chat turn uses the updated behavior.

## Step 5: Contextual realization choice and task-specific outcome evidence

**Objective:** Allow multiple realizations of one Concept to coexist and select among them using context and evidence, without a hardcoded priority list or universal success scalar.

**Guidance:**

- Add Concept forms for use context, candidate applicability, realization evidence, task outcome, and selection result. Define the initial selection policy as a `SelectRealization` Concept.
- Distinguish contexts such as expressing meaning, executing a task, natural-language output, code generation, and research. Treat these as Concept data, not a host enum used for domain dispatch.
- Store outcome events and expose relevant evidence to the policy as Concepts. Use separate checkers/feedback for exact math, code tests, source-backed research, and user corrections/acceptance.
- Start with stable deterministic selection by applicability and evidence. Do not randomly explore side-effectful realizations. Later exploration is limited to visible, pure, low-risk cases.
- Keep alternatives and their evidence inspectable in the Concept browser. Do not create whole-Concept version branches.

**Tests:**

- Give one Concept two realizations for different contexts and verify the context selects the intended one.
- Give one context competing realizations and verify exact test outcomes/corrections change selection in a bounded, explainable way.
- Verify missing or conflicting evidence produces alternatives or a focused clarification rather than a silent arbitrary choice.
- Verify infrastructure/model failures are not recorded as proof that a semantic realization is wrong.
- Verify selection decisions and candidate evidence appear in the persisted trace and UI.

**Integration:** Selection and scoring run through the `SelectRealization` Concept and the existing evaluator. The runtime does not maintain a parallel scoring policy.

**Demo:** Add two realizations of `Fetch`—a conceptual get/fetch meaning and a network retrieval behavior—then show the caller context choosing each one and the history showing the evidence behind that choice.

## Step 6: On-demand research, gap handling, and Teacher learning

**Objective:** Let the system research a capability gap through Concept-based search, compose or learn a reusable realization, and consult a larger local Teacher model only as a last resort.

**Guidance:**

- Add searchable Concepts for public web search, page fetch, JSON parsing, Wikidata lookup, source evidence, and citation/provenance. Network requests happen only when those Concepts are invoked and are always traced.
- Add a Concept lookup path that gives `AskTeacher` relevant names, glosses, relations, and realizations on demand rather than sending the entire graph.
- Express gap handling as Concepts: inspect what is missing, search, interpret sourced data, try composition, then ask Teacher if still needed.
- Make Teacher model/provider/model name configurable through Concept data. Ask for Concept proposals, relations, alternative realizations, and examples with the original task and retrieved relevant context.
- Validate proposed compositions through examples. Store alternatives on their owning Concepts. Keep model-authored executable source inactive until sandboxed validation exists in Step 8.
- Preserve source URLs and claim-to-source relations when the result is research-derived.

**Tests:**

- Fake deterministic network and Ollama endpoints for search, fetch, source parsing, provider errors, and tracing.
- Verify a known capability uses its current Concept and does not invoke search/Teacher.
- Verify an unknown capability searches and composes before asking Teacher; verify Teacher is not called if those attempts succeed.
- Verify relevant lookup returns a bounded subset of the graph, with the ability to request more.
- Verify Teacher proposals are Concept data, are tested before preference, and do not mutate unrelated Concepts.
- Verify all researched claims shown as facts retain source references and uncertainty.

**Integration:** Research, lookup, interpretation, and Teacher calls all enter through ordinary Concepts and use the same evaluator and trace. No LLM tool registry is introduced.

**Demo:** Ask a question requiring a new fact or operation, show search/query/interpretation attempts, see the sourced Concept result, and—only for an unresolved gap—see the Teacher propose and validate a reusable Concept realization.

## Step 7: Code understanding and multi-language code generation

**Objective:** Make source code understandable as Concepts and generate code in requested target languages through Concept realizations.

**Guidance:**

- Represent source files, sections, syntax elements, and relevant symbols as Concepts with original text and span provenance. Code is data until a code-reading Concept interprets it.
- Represent common program structures and operations as Concepts: function, parameter, assignment, return, loop, conditional, expression, and tests. Do not create a hidden compiler IR alongside them.
- Add language-specific code-emission Concepts/realizations that consume the same semantic program Concepts and generate TypeScript/Python (then extend based on use).
- In this step, accept pasted or explicitly supplied source content; defer general filesystem traversal to the sandboxed file Concepts in Step 8.
- Validate generated output via formatting/typecheck/test Concepts. Show generated code and validation traces; never claim tests passed if they were not actually run.

**Tests:**

- Parse representative source fixtures into source-preserving Concepts with correct spans.
- Generate semantically equivalent TypeScript and Python for the same function Concept.
- Verify `If`, loop, parameter, and literal Concepts preserve conditions and named arguments through emission.
- Run generated-code checks against isolated fixtures and report compile/runtime failures as Concepts.
- Replace a language emitter realization and verify output changes without changing the runtime.

**Integration:** Code is a Concept domain. Input parsing, semantic representation, code generation, and validation are all invoked through the established graph and trace.

**Demo:** Provide a function request, inspect the parsed function Concepts, generate two target-language versions, and view typecheck/test results linked to the exact generated output.

## Step 8: Sandboxed file/process actions and user-controlled access modes

**Objective:** Give the system a private workspace for creating and editing files and running bounded commands while keeping the user's host files inaccessible until explicitly authorized.

**Guidance:**

- Choose and test an OS-enforced isolation mechanism suitable for macOS and external programs. The first default sandbox exposes only a private project workspace, bounded CPU/memory/time, and explicit network policy. Do not mount a user home directory by default.
- Implement file read/write, directory listing, command execution, and external-program use as ordinary Concepts with Concept-owned realizations and typed effect/request Concepts.
- Add user-controlled access modes corresponding to the reference: ask for approval, allow routine/safe operations while asking about risky ones, and full access. Keep sandbox workspace always available; host files remain unavailable until an explicit user mode/folder grant.
- A generic host guard enforces grants and cancellation even when a Concept or model asks for more. The selected policy and decisions appear in the trace.
- Run model-authored executable realizations only in the isolated runner after static/input/output limits and tests. Promote the realization as a competing Concept alternative rather than replacing unrelated meanings.
- Keep research network read access a separate grant from external host file access.

**Tests:**

- Prove the default sandbox can create/read/edit its own files and cannot read user home or protected system paths.
- Prove shell/process calls honor time, memory, output, and cancellation bounds.
- Verify denied and approval-required requests never execute, and a changed explicit grant enables only the selected scope.
- Verify a user-selected file grant is restricted to the selection and can be revoked.
- Verify every effect request/result and permission decision has a trace event linked to its Concept call.
- Run generated code with attempted escape cases and confirm the OS boundary blocks them.

**Integration:** The evaluator treats these as effectful Concept realizations and uses the same call/evidence trace. The sandbox is a host security boundary, not a semantic dispatcher.

**Demo:** Ask the system to create and test a project in its own sandbox; inspect resulting files and trace; confirm an attempt to access an ungranted host path is denied; then explicitly grant one folder and show that access is scoped and logged.

## Step 9: Always-running `Exist` with observable, bounded autonomy

**Objective:** Activate continuous operation only after on-demand reasoning, learning, tracing, and sandbox controls pass their gates.

**Guidance:**

- Implement `Exist` as an ordinary Concept that can choose an activity or no-op. A minimal host scheduler only wakes and applies it; it does not decide what to think about.
- Use Concepts to choose research, memory consolidation, realization evaluation, or no-op based on current graph/context and user preferences.
- Apply strict budgets for model calls, network, CPU, runtime, and output. Make `pause`, `stop`, quiet hours, and access modes available in the UI.
- Never perform side effects outside the configured mode. User-visible status describes the current Concept, purpose, parent event, and any pending approval.
- Persist autonomous work trace and sanitized learning updates according to the active memory setting; do not silently persist an isolated conversation transcript.

**Tests:**

- Verify `Exist` can return no-op without waking costly model/network behavior.
- Verify configured budgets and permission modes constrain repeated cycles.
- Verify pause/stop prevents the next cycle and interrupts cancellable current work.
- Verify every cycle is traceable and autonomous concept additions pass the same validation as interactive learning.
- Run an overnight-style simulation with a deterministic clock and assert bounded resource use and no unapproved effects.

**Integration:** The scheduler invokes the ordinary `Exist` Concept through the same evaluator used by chat; autonomous and user-requested work share trace and realization evidence.

**Demo:** Leave the system running in a restricted mode, watch it choose a small research/learning task or no-op, inspect its live Concepts and budget use, then pause it and verify it stops.

## Step 10: Rust runtime port with TypeScript/Rust behavioral parity

**Objective:** Port the proven generic runtime to Rust without changing the Concept model or reintroducing a Rust-only semantic engine.

**Guidance:**

- Freeze the serialized Concept format, generic host ABI, trace event schema, and acceptance corpus before porting.
- Port structural parsing/rendering, store access, matching/substitution, evaluator lifecycle, budgets, trace, and generic code/effect bridges. Keep domain behavior and seed Concepts as data.
- Maintain a Rust host conformance suite against the same Concept units used by the TypeScript runtime. Do not port UI semantics or introduce per-Concept Rust dispatch.
- Run both runtimes against golden traces for deterministic evaluations. Preserve the TypeScript implementation until the Rust path covers all required behavior and performance needs justify switching.

**Tests:**

- Run the same Concept acceptance fixtures through both runtimes and compare results, selected realizations, errors, and normalized traces.
- Verify a Concept edit has identical behavior under both runtimes without compiling new domain handlers.
- Test persistence compatibility and interrupted/cancelled evaluations.
- Verify no Concept-name registry or separate semantic engine is added in Rust.

**Integration:** The UI, Concept store format, Ollama Concepts, and trace/event API remain language-neutral; a runtime setting chooses the evaluator only after parity.

**Demo:** Switch a sample local installation between TypeScript and Rust evaluation and run the same natural-language, memory, research, and code-generation scenarios with equivalent Concept-level traces.
