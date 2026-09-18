import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  application,
  formatExpression,
  parseExpression,
} from "./concept/expression.js";
import { seedCoreConcepts } from "./bootstrap/seed.js";
import { ConceptEvaluator } from "./runtime/evaluator.js";
import { SQLiteConceptStore } from "./store/sqlite-store.js";

function readOptions(args: string[]): {
  expression: string | undefined;
  text: string | undefined;
  model: string;
  ollamaUrl: string;
  databasePath: string;
  runtimeEntryConcept: string;
  showTrace: boolean;
} {
  const expressionParts: string[] = [];
  let text: string | undefined;
  let model = "qwen3.5:4b";
  let ollamaUrl = "http://127.0.0.1:11434";
  let databasePath = resolve(homedir(), ".cnocept/concepts.sqlite");
  let runtimeEntryConcept = "RuntimeEntry";
  let showTrace = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--trace") {
      showTrace = true;
    } else if (argument === "--db") {
      const next = args[index + 1];
      if (!next) throw new Error("--db requires a path");
      databasePath = resolve(next);
      index += 1;
    } else if (argument === "--entry") {
      const next = args[index + 1];
      if (!next) throw new Error("--entry requires a Concept identity");
      runtimeEntryConcept = next;
      index += 1;
    } else if (argument === "--text") {
      const next = args[index + 1];
      if (!next) throw new Error("--text requires a prompt");
      text = next;
      index += 1;
    } else if (argument === "--model") {
      const next = args[index + 1];
      if (!next) throw new Error("--model requires a local model name");
      model = next;
      index += 1;
    } else if (argument === "--ollama-url") {
      const next = args[index + 1];
      if (!next) throw new Error("--ollama-url requires a URL");
      ollamaUrl = next;
      index += 1;
    } else {
      expressionParts.push(argument ?? "");
    }
  }
  return {
    expression:
      expressionParts.length > 0 ? expressionParts.join(" ") : undefined,
    text,
    model,
    ollamaUrl,
    databasePath,
    runtimeEntryConcept,
    showTrace,
  };
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  if (!options.expression && options.text === undefined) {
    throw new Error(
      'Provide a Concept expression or --text prompt. Example: pnpm chat -- --text "What is 5 times three?"',
    );
  }

  await mkdir(dirname(options.databasePath), { recursive: true });
  const store = new SQLiteConceptStore(new DatabaseSync(options.databasePath));
  try {
    seedCoreConcepts(store);
    const evaluator = new ConceptEvaluator(store, {
      runtimeEntryConcept: options.runtimeEntryConcept,
    });
    const naturalLanguage = options.text !== undefined;
    const promptText = options.text ?? "";
    const input = naturalLanguage
      ? application("PromptInput", [
          { name: "input", value: promptText },
          { name: "model", value: options.model },
          { name: "endpoint", value: options.ollamaUrl },
        ])
      : application("PromptInput", [
          {
            name: "input",
            value: parseExpression(options.expression ?? ""),
          },
        ]);
    const result = await evaluator.evaluate({
      input,
      useContext: parseExpression(
        naturalLanguage ? "NaturalLanguage()" : "Execution()",
      ),
      caller: "CLI",
    });
    const rootEvent = store.getTraceEvents(result.traceId)[0];
    let rendered = formatExpression(result.value);
    let outputTraceId: string | undefined;
    if (naturalLanguage && rootEvent?.outcome !== "failure") {
      const output = await evaluator.evaluate({
        input: application("NaturalLanguageOutput", [
          { name: "result", value: result.value },
          { name: "source", value: promptText },
          { name: "model", value: options.model },
          { name: "endpoint", value: options.ollamaUrl },
        ]),
        useContext: parseExpression("NaturalLanguage()"),
        caller: "CLI",
      });
      outputTraceId = output.traceId;
      rendered =
        typeof output.value === "string"
          ? output.value
          : formatExpression(output.value);
    }
    console.log(rendered);
    console.log("Trace: " + result.traceId);
    if (outputTraceId) console.log("Output trace: " + outputTraceId);
    if (options.showTrace) {
      printTrace(store.getTraceEvents(result.traceId));
      if (outputTraceId) printTrace(store.getTraceEvents(outputTraceId));
    }
    if (rootEvent?.outcome === "failure") process.exitCode = 1;
  } finally {
    store.close();
  }
}

function printTrace(events: ReturnType<SQLiteConceptStore["getTraceEvents"]>) {
  for (const event of events) {
    console.log(
      JSON.stringify(
        {
          concept: event.concept,
          caller: event.caller,
          parent: event.parentEventId,
          input: formatExpression(event.input),
          arguments: event.arguments,
          selectedRealization: event.selectedRealization,
          output: event.output === null ? null : formatExpression(event.output),
          outcome: event.outcome,
          durationMs: event.durationMs,
          externalExchanges: event.externalExchanges,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
