# Cnocept

Cnocept is an experiment in an AI architecture whose shared representation for meaning and behavior is a Concept network. A Concept unit owns its identity, searchable plain-language gloss, Concept-valued relations, and context-sensitive realizations together.

## Workspace

This repository uses PNPM workspaces to keep the architecture separate from Studio:

- `packages/concept-runtime` (`@cnocept/concept-runtime`) contains the Concept expression language, generic evaluator, SQLite graph, seed Concepts, conversation memory, and CLI.
- `apps/studio-server` (`@cnocept/studio-server`) contains the local HTTP API and streamed chat endpoint. It consumes the runtime as a workspace package.
- `apps/studio-client` (`@cnocept/studio-client`) contains the React dashboard and Vite development server.

The Studio server does not own or redefine the Concept architecture. The client communicates with it through `/api`; during development Vite proxies those requests to the server.

## Run locally

Requirements: Node.js 22.13 or newer, PNPM, and Ollama with a local chat model. The parser defaults to `qwen3.5:4b`; the Teacher uses `qwen3.8:27b` when missing factual knowledge needs to be learned.

```sh
pnpm install
ollama pull qwen3.5:4b
ollama pull qwen3.8:27b
pnpm dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The dashboard keeps its Monokai Dark styling and current layout. Vite provides React Fast Refresh/HMR; the API server runs separately on `127.0.0.1:4174` and is reached through Vite's `/api` proxy.

For a built local run:

```sh
pnpm build
pnpm start
```

The production server serves the built Vite client and API from the same origin. Set `CNOCEPT_DB=./concepts.sqlite` to choose the Concept database or `CNOCEPT_PORT=4174` to change the production server port. The server binds to `127.0.0.1` by default.

## Studio

The chat view shows the input Concept expression, whether the Teacher was used and what it taught, and the resulting Answer Concept expression. Conversations are persistent by default; turn off “Persist chat” for an isolated transcript. Both modes can use the shared Concept graph.

The Concept browser searches by identity and description and lets you inspect and edit relations and realizations. Changes are saved into the live Concept store and are available to evaluation immediately.

## Concept architecture

The natural-language input path is a saved composition: it looks up relevant Concepts, reads the parser protocol from the graph, calls the local model Concept, parses the returned expression, and evaluates its meaning. Ordinary unknown facts follow the learning path: search Wikidata and the web, ask the local Teacher for a complete Concept unit, save the unit, then evaluate the original question against the updated graph. Missing historical references can explicitly request conversation lookup.

Expressions use Capitalized Concept calls and support named arguments, primitive payloads, and variables such as `$Field`:

```text
Question(Multiply(Number(5), Number(String("three"))))
```

The expression preserves the source form “three”; the `Number` realization handles conversion when arithmetic needs it. A Concept can have multiple realizations for different contexts. Realization bodies can be composed from Concepts or can use an executable leaf for a low-level effect.

The TypeScript harness provides expression parsing, structural matching, generic Concept lookup and composition, the executable realization ABI, SQLite persistence, and HTTP effects. Runtime behavior is selected through the stored graph rather than a semantic-name dispatch table. The current implementation is not an operating-system sandbox, does not run an autonomous `Exist` loop, and does not execute model-authored code as a secured capability.

### Composition-first implementation principle

When behavior can be expressed by composing existing Concepts, express it as Concepts. If a capability is missing, prefer adding the needed Concept-level composition over adding semantic behavior to the TypeScript harness. This lets the system inspect, change, and extend more of its own behavior through the same Concept graph it uses to think and act.

`Code` is a valid realization form for executable host behavior, including external effects such as database, network, model, filesystem, and process access. Keep that host code at the boundary where the effect actually happens; expose it through a Concept realization and invoke it through the generic evaluator. Do not use `Code` as an escape hatch for behavior that the Concept language can express, and do not add privileged evaluator branches keyed to Concept names.

The stored Concept graph is the source of truth for active behavior. Bootstrap data may initialize a new graph, but routine startup must not overwrite live Concept edits from a parallel catalog in TypeScript.

## Development checks

```sh
pnpm typecheck
pnpm test
pnpm format
```

Build and run a Concept expression with:

```sh
pnpm --filter @cnocept/concept-runtime demo -- 'Question(Multiply(Number(5), Number(String("three"))))' --trace
pnpm --filter @cnocept/concept-runtime chat -- --text "What is 5 times three?" --model qwen3.5:4b --trace
```
