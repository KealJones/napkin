import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ConceptEvaluator } from "./runtime/evaluator.js";
import {
  application,
  formatExpression,
  parseExpression,
} from "./concept/expression.js";
import { createConceptUnit } from "./concept/unit.js";
import { seedCoreConcepts } from "./bootstrap/seed.js";
import { SQLiteConceptStore } from "./store/sqlite-store.js";
import { ConversationRepository } from "./memory/conversations.js";
import type {
  HttpRequestInput,
  HttpResponseOutput,
} from "./runtime/evaluator.js";

function createStore(): SQLiteConceptStore {
  return new SQLiteConceptStore(new DatabaseSync(":memory:"));
}

function arithmeticInput() {
  return parseExpression(
    'PromptInput(input=Question(Multiply(Number(5), Number(String("three")))))',
  );
}

test("expression grammar round-trips nested, named, primitive, and variable values", () => {
  const source =
    'Compute(left=Number(5), right=Number(String("three")), flag=true, note="a\\\\nb", missing=null, variable=$x)';
  assert.equal(formatExpression(parseExpression(source)), source);
});

test("SQLite round-trips a complete Concept unit with relations and alternatives", () => {
  const store = createStore();
  const unit = createConceptUnit({
    identity: "Example",
    gloss: "An example concept",
    relations: [parseExpression("SynonymOf(Sample())")],
    realizations: [
      parseExpression(
        'Realization(pattern=Example($value), context=Execution(), body=Code(source="args[0]"))',
      ),
      parseExpression(
        "Realization(pattern=Example($value), context=Meaning(), body=DescribedAs($value))",
      ),
    ],
  });

  const saved = store.saveConcept(unit);
  assert.deepEqual(store.getConcept("Example"), saved);
  store.close();
});

test("Concept search indexes names and migrates stores with unindexed identities", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(
    "CREATE VIRTUAL TABLE concepts_fts USING fts5(identity UNINDEXED, gloss, relations_json);",
  );
  const store = new SQLiteConceptStore(database);
  store.saveConcept(
    createConceptUnit({
      identity: "Parakeet",
      gloss: "A small parrot",
      relations: [parseExpression("IsA(Parrot())")],
      realizations: [],
    }),
  );

  assert.equal(store.searchConcepts("Parakeet", 10)[0]?.identity, "Parakeet");
  assert.equal(
    store.searchConcepts("small parrot", 10)[0]?.identity,
    "Parakeet",
  );
  const schema = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'concepts_fts'",
    )
    .get() as { sql: string };
  assert.equal(schema.sql.includes("identity UNINDEXED"), false);
  store.close();
});

test("Concept search matches prefixes of underscore-separated identities", () => {
  const store = createStore();
  store.saveConcept(
    createConceptUnit({
      identity: "Independence_Day_of_the_United_States",
      gloss: "An annual holiday observed on July 4th.",
      relations: [],
      realizations: [],
    }),
  );

  assert.equal(
    store.searchConcepts("Ind", 10)[0]?.identity,
    "Independence_Day_of_the_United_States",
  );
  assert.equal(
    store.searchConcepts("Indep", 10)[0]?.identity,
    "Independence_Day_of_the_United_States",
  );
  store.close();
});

test("IsA resolves a positive transitive relation to a primitive Boolean answer", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Parakeet",
      gloss: "A small parrot",
      relations: [parseExpression("IsA(Parrot())")],
      realizations: [],
    }),
  );
  store.saveConcept(
    createConceptUnit({
      identity: "Parrot",
      gloss: "A bird",
      relations: [parseExpression("IsA(Bird())")],
      realizations: [],
    }),
  );

  const result = await new ConceptEvaluator(store).evaluate({
    input: parseExpression("Question(IsA(Parakeet(), Bird()))"),
    useContext: parseExpression("Execution()"),
    caller: "IsATest",
  });
  assert.equal(formatExpression(result.value), "Answer(true)");
  store.close();
});

test("unknown IsA relation is researched, taught as a complete Concept, then evaluated", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Parakeet",
      gloss: "A small parrot",
      relations: [],
      realizations: [
        parseExpression(
          'Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot"))',
        ),
      ],
    }),
  );
  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    let responseBody: string;
    let contentType = "application/json";
    if (request.method === "GET" && request.url.includes("wikidata.org")) {
      responseBody = JSON.stringify({
        search: [
          { id: "Q100", label: "Parakeet", description: "small parrot" },
        ],
      });
    } else if (request.method === "GET") {
      contentType = "text/html";
      responseBody =
        '<a class="result__a" href="https://example.test/parakeet">Parakeet facts</a><a class="result__snippet">Parakeets are small parrots.</a>';
    } else {
      const body = JSON.parse(request.body ?? "{}") as {
        messages?: Array<{ role: string; content: string }>;
      };
      const system = body.messages?.[0]?.content ?? "";
      const content = system.startsWith("You are the Ears")
        ? "Question(IsA(Parakeet(), Bird()))"
        : system.startsWith("You are the Teacher")
          ? 'Concept(identity="Parakeet", gloss="A small parrot", relations=ConceptRelations(IsA(Bird())), realizations=Realizations(Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot"))))'
          : "UnknownKnowledge()";
      responseBody = JSON.stringify({ message: { content } });
    }
    return {
      status: 200,
      headers: { "content-type": contentType },
      body: responseBody,
    };
  };
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      { name: "input", value: "Are parakeets a type of bird?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "LearnedIsATest",
  });
  assert.equal(formatExpression(result.value), "Answer(true)");
  assert.equal(requests.length, 4);
  assert.deepEqual(
    store.getConcept("Parakeet")?.relations.map(formatExpression),
    ["IsA(Bird())"],
  );
  assert.deepEqual(
    store.getConcept("Parakeet")?.realizations.map(formatExpression),
    [
      'Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot"))',
    ],
  );
  const events = store.getTraceEvents(result.traceId);
  assert.ok(events.some((event) => event.concept === "LearnUnknownRelations"));
  assert.ok(events.some((event) => event.concept === "AskTeacher"));
  assert.ok(events.some((event) => event.concept === "TeacherProtocol"));
  assert.ok(events.some((event) => event.concept === "WebSearch"));
  assert.ok(events.some((event) => event.concept === "WikidataSearch"));
  assert.ok(
    events.some((event) => event.concept === "IsA" && event.output === true),
  );
  store.close();
});

test("InContext selects origin and this-year realizations of one annual-event Concept", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Independence_Day_of_the_United_States",
      gloss:
        "The annual celebration of United States independence, observed on July 4th.",
      relations: [],
      realizations: [
        parseExpression(
          "Realization(pattern=Independence_Day_of_the_United_States(), context=AnnualDate(), body=Date(month=7, day=4))",
        ),
        parseExpression(
          "Realization(pattern=Independence_Day_of_the_United_States(), context=Origin(), body=Date(month=7, day=4, year=1776))",
        ),
        parseExpression(
          "Realization(pattern=Independence_Day_of_the_United_States(), context=ThisYear(), body=DateInYear(month=7, day=4))",
        ),
      ],
    }),
  );
  const evaluator = new ConceptEvaluator(store);

  const annual = await evaluator.evaluate({
    input: parseExpression(
      "Question(InContext(concept=Independence_Day_of_the_United_States(), use=AnnualDate()))",
    ),
    useContext: parseExpression("Execution()"),
    caller: "AnnualDateTest",
  });

  const origin = await evaluator.evaluate({
    input: parseExpression(
      "Question(InContext(concept=Independence_Day_of_the_United_States(), use=Origin()))",
    ),
    useContext: parseExpression("Execution()"),
    caller: "OriginDateTest",
  });
  const thisYear = await evaluator.evaluate({
    input: parseExpression(
      "Question(InContext(concept=Independence_Day_of_the_United_States(), use=ThisYear()))",
    ),
    useContext: parseExpression("Execution()"),
    caller: "ThisYearDateTest",
  });

  assert.equal(formatExpression(annual.value), "Answer(Date(month=7, day=4))");
  assert.equal(
    formatExpression(origin.value),
    "Answer(Date(month=7, day=4, year=1776))",
  );
  assert.equal(
    formatExpression(thisYear.value),
    "Answer(Date(month=7, day=4, year=" + new Date().getFullYear() + "))",
  );
  const thisYearEvents = store.getTraceEvents(thisYear.traceId);
  assert.ok(thisYearEvents.some((event) => event.concept === "Let"));
  assert.ok(
    thisYearEvents.some((event) => event.concept === "YearOfTimestamp"),
  );
  assert.ok(thisYearEvents.some((event) => event.concept === "YearNumber"));
  const inContextRealization = store.getConcept("InContext")?.realizations[0];
  assert.ok(inContextRealization);
  assert.match(formatExpression(inContextRealization), /body=Let\(/);
  assert.doesNotMatch(formatExpression(inContextRealization), /Code\(/);
  store.close();
});

test("direct arithmetic returns Answer(15) and persists a complete nested trace", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const evaluator = new ConceptEvaluator(store);

  const result = await evaluator.evaluate({
    input: arithmeticInput(),
    useContext: parseExpression("Execution()"),
    caller: "Test",
  });

  assert.equal(formatExpression(result.value), "Answer(15)");
  const events = store.getTraceEvents(result.traceId);
  assert.ok(events.length >= 6);
  assert.ok(
    events.some((event) => JSON.stringify(event.input).includes('"three"')),
  );
  for (const event of events) {
    assert.ok(event.id);
    assert.ok(event.concept);
    assert.ok(event.caller);
    assert.ok(event.useContext);
    assert.ok(event.input);
    assert.ok(event.arguments);
    assert.ok(event.selectedRealization || event.outcome === "residual");
    assert.ok(event.output);
    assert.ok(event.outcome);
    assert.ok(event.startedAt);
    assert.ok(event.endedAt);
  }
  assert.ok(events.some((event) => event.parentEventId !== null));
  assert.ok(store.getConceptUsage("Multiply").events > 0);
  store.close();
});

test("natural-language PromptInput uses Ollama Concepts and preserves its raw source", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const memories = new ConversationRepository(store);
  const priorConversation = memories.create(true);
  memories.appendTurn(priorConversation.id, {
    userText:
      "When I ask about 5 times three, keep the word three as a string in the interpretation.",
    assistantText: "Understood.",
    promptMeaning: null,
    result: parseExpression("Acknowledged()"),
    traceIds: [],
  });
  const requests: HttpRequestInput[] = [];
  const meaning = 'Question(Multiply(Number(5), Number(String("three"))))';
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    const body = JSON.parse(request.body ?? "{}") as {
      messages?: Array<{ role: string; content: string }>;
      format?: string;
    };
    const rendering =
      body.messages?.[0]?.content.startsWith(
        "Render the computed Concept result",
      ) ?? false;
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          content: rendering ? "5 times three is 15." : meaning,
        },
      }),
    };
  };
  const raw = "What is 5 times three?";
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      { name: "input", value: raw },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ParserTest",
  });

  assert.equal(formatExpression(result.value), "Answer(15)");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://127.0.0.1:11434/api/chat");
  const requestBody = JSON.parse(requests[0]?.body ?? "{}") as {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
    think: boolean;
    options: { num_predict?: number };
  };
  assert.equal(requestBody.model, "local-test-model");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.think, false);
  assert.equal(requestBody.options.num_predict, -1);
  assert.equal(
    (JSON.parse(requests[0]?.body ?? "{}") as { format?: string }).format,
    undefined,
  );
  const parserPrompt = requestBody.messages.find((message) =>
    message.content.includes("Current user message:"),
  )?.content;
  assert.ok(parserPrompt);
  assert.doesNotMatch(parserPrompt, /keep the word three as a string/);
  assert.match(parserPrompt, /identity="Multiply"/);
  assert.match(parserPrompt, /pattern=Multiply\(/);
  assert.match(parserPrompt, /executable implementation/);
  assert.doesNotMatch(parserPrompt, /source="args =>/);
  const parserSystem = requestBody.messages[0]?.content ?? "";
  assert.match(
    parserSystem,
    /up to 16 Concepts retrieved from this system's saved network/,
  );
  assert.match(parserSystem, /MissingConcept\(identity=/);
  assert.match(
    parserSystem,
    /Do not invent a gloss, relations, or declaration/,
  );
  assert.match(
    parserSystem,
    /ordinary factual request whose needed entity or knowledge is absent, use the MissingConcept wrapper/,
  );
  assert.doesNotMatch(parserSystem, /place the declaration inside Question/);
  assert.match(parserSystem, /Always wrap realization items in Realizations/);
  assert.match(parserSystem, /Balance every opening parenthesis/);
  assert.match(parserSystem, /Realization\(pattern=NewOperation/);
  assert.doesNotMatch(
    parserSystem,
    /relations=ConceptRelations\(\), realizations=Realizations\(\)/,
  );

  const events = store.getTraceEvents(result.traceId);
  const promptEvent = events.find((event) => event.concept === "Prompt");
  assert.ok(promptEvent);
  assert.ok(JSON.stringify(promptEvent.input).includes(raw));
  assert.ok(events.some((event) => event.concept === "OllamaLocalLLM"));
  assert.ok(events.some((event) => event.concept === "Let"));
  assert.ok(events.some((event) => event.concept === "Try"));
  assert.ok(events.some((event) => event.concept === "JsonParse"));
  assert.equal(
    events.some((event) => event.concept === "MemoryLookup"),
    false,
    "ordinary prompts must not retrieve conversation memory",
  );
  const parserRealization = store
    .getConcept("PromptInput")
    ?.realizations.find((candidate) =>
      formatExpression(candidate).includes("context=NaturalLanguage()"),
    );
  assert.ok(parserRealization);
  assert.match(formatExpression(parserRealization), /body=Let\(/);
  assert.doesNotMatch(formatExpression(parserRealization), /Code\(/);
  const modelRealization = store.getConcept("OllamaLocalLLM")?.realizations[0];
  assert.ok(modelRealization);
  assert.match(formatExpression(modelRealization), /body=Let\(/);
  assert.doesNotMatch(formatExpression(modelRealization), /Code\(/);
  const networkEvent = events.find((event) => event.concept === "HttpRequest");
  assert.equal(networkEvent?.externalExchanges[0]?.responseStatus, 200);
  const responseBody = JSON.parse(
    networkEvent?.externalExchanges[0]?.responseBody ?? "{}",
  ) as { message?: { content?: string } };
  assert.equal(responseBody.message?.content, meaning);

  const rendered = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("NaturalLanguageOutput", [
      { name: "result", value: result.value },
      { name: "source", value: raw },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "RendererTest",
  });
  assert.equal(rendered.value, "The answer is 15.");
  assert.equal(requests.length, 1);
  assert.equal(
    store
      .getTraceEvents(rendered.traceId)
      .some((event) => event.concept === "OllamaLocalLLM"),
    false,
  );
  store.close();
});

test("only an explicit MissingContext wrapper invokes conversational memory lookup", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const conversations = new ConversationRepository(store);
  const prior = conversations.create(true);
  conversations.appendTurn(prior.id, {
    userText: "The earlier arithmetic result was five times three.",
    assistantText: "The result was 15.",
    promptMeaning: parseExpression("Question(Multiply(Number(5), Number(3)))"),
    result: parseExpression("Answer(15)"),
    traceIds: [],
  });
  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    const body = JSON.parse(request.body ?? "{}") as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = body.messages?.[0]?.content ?? "";
    const content = system.startsWith("You are the Ears")
      ? 'MissingContext(query="earlier arithmetic result", meaning=Question(Multiply(Number(5), Number(3))))'
      : "Question(Multiply(Number(5), Number(3)))";
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { content } }),
    };
  };
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      { name: "input", value: "What was that result again?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "MemoryGateTest",
  });
  assert.equal(formatExpression(result.value), "Answer(15)");
  assert.equal(requests.length, 2);
  const resolverPrompt = JSON.parse(requests[1]?.body ?? "{}").messages[1]
    .content as string;
  assert.match(resolverPrompt, /earlier arithmetic result/);
  assert.match(resolverPrompt, /The result was 15/);
  const events = store.getTraceEvents(result.traceId);
  assert.equal(
    events.filter((event) => event.concept === "MemoryLookup").length,
    1,
  );
  assert.equal(
    events.some((event) => event.concept === "WebSearch"),
    false,
  );
  store.close();
});

test("PromptInput reads its instructions from the saved Concept graph", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const marker =
    "Stored parser protocol marker: preserve the graph as authority.";
  const realization = parseExpression(
    `Realization(pattern=InputParserProtocol(), context=ConceptInterpretation(), body=${JSON.stringify(marker)})`,
  );
  const declaration = application("Concept", [
    { name: "identity", value: "InputParserProtocol" },
    {
      name: "gloss",
      value:
        "The saved Concept instructions for interpreting user messages as complete, source-preserving Concept expressions",
    },
    {
      name: "relations",
      value: application("ConceptRelations", [
        { value: parseExpression("Guides(PromptInput())") },
      ]),
    },
    {
      name: "realizations",
      value: application("Realizations", [{ value: realization }]),
    },
  ]);
  await new ConceptEvaluator(store).evaluate({
    input: declaration,
    useContext: parseExpression("Execution()"),
    caller: "ParserProtocolEditTest",
  });

  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: { content: "Question(Multiply(Number(5), Number(3)))" },
      }),
    };
  };
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      { name: "input", value: "What is 5 times three?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ParserProtocolSourceOfTruthTest",
  });

  assert.equal(formatExpression(result.value), "Answer(15)");
  const requestBody = JSON.parse(requests[0]?.body ?? "{}") as {
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(requestBody.messages[0]?.content, marker);
  const events = store.getTraceEvents(result.traceId);
  assert.ok(events.some((event) => event.concept === "InputParserProtocol"));
  assert.equal(
    events.some((event) => event.concept === "InputParserRepairProtocol"),
    false,
  );
  store.close();
});

test("computed ConceptMeaning is rendered directly without another model answer", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: async () => {
      throw new Error(
        "A stored ConceptMeaning should not call the language model",
      );
    },
  }).evaluate({
    input: application("NaturalLanguageOutput", [
      {
        name: "result",
        value: parseExpression(
          'Answer(ConceptMeaning(identity="ArithmeticMean", gloss="To calculate an average, sum all values and divide by their count."))',
        ),
      },
      { name: "source", value: "How do I calculate an average?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ConceptMeaningOutputTest",
  });

  assert.equal(
    result.value,
    "To calculate an average, sum all values and divide by their count.",
  );
  assert.equal(
    store
      .getTraceEvents(result.traceId)
      .some((event) => event.concept === "OllamaLocalLLM"),
    false,
  );
  store.close();
});

test("computed Boolean answers render as yes or no without asking the model", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const evaluator = new ConceptEvaluator(store, {
    httpRequestAdapter: async () => {
      throw new Error("A computed Boolean should not call the language model");
    },
  });

  for (const [value, expected] of [
    [true, "Yes."],
    [false, "No."],
  ] as const) {
    const result = await evaluator.evaluate({
      input: application("NaturalLanguageOutput", [
        { name: "result", value: application("Answer", [{ value }]) },
        { name: "source", value: "Is this true?" },
        { name: "model", value: "local-test-model" },
        { name: "endpoint", value: "http://127.0.0.1:11434" },
      ]),
      useContext: parseExpression("NaturalLanguage()"),
      caller: "BooleanOutputTest",
    });

    assert.equal(result.value, expected);
    assert.equal(
      store
        .getTraceEvents(result.traceId)
        .some((event) => event.concept === "OllamaLocalLLM"),
      false,
    );
  }
  store.close();
});

test("computed scalar answers render from their value without asking the model", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: async () => {
      throw new Error("A computed scalar should not call the language model");
    },
  }).evaluate({
    input: application("NaturalLanguageOutput", [
      { name: "result", value: parseExpression("Answer(15)") },
      { name: "source", value: "What is 5 times three?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ScalarOutputTest",
  });

  assert.equal(result.value, "The answer is 15.");
  assert.equal(
    store
      .getTraceEvents(result.traceId)
      .some((event) => event.concept === "OllamaLocalLLM"),
    false,
  );
  store.close();
});

test("PromptInput reuses a retrieved entity Concept instead of redeclaring it", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Parakeet",
      gloss: "A small parrot",
      relations: [parseExpression("IsA(Bird())")],
      realizations: [
        parseExpression(
          'Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot"))',
        ),
      ],
    }),
  );
  let parserRequest: HttpRequestInput | undefined;
  const evaluator = new ConceptEvaluator(store, {
    httpRequestAdapter: async (request) => {
      parserRequest = request;
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: { content: "Question(Parakeet())" } }),
      };
    },
  });

  const result = await evaluator.evaluate({
    input: application("PromptInput", [
      { name: "input", value: "What is a parakeet?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ExistingConceptParserTest",
  });

  assert.equal(
    formatExpression(result.value),
    'Answer(ConceptMeaning(identity="Parakeet", gloss="A small parrot"))',
  );
  assert.equal(store.getConcept("Parakeet")?.relations.length, 1);
  const requestBody = JSON.parse(parserRequest?.body ?? "{}") as {
    messages?: Array<{ role: string; content: string }>;
  };
  assert.ok(
    requestBody.messages?.[0]?.content.includes(
      "Do not redeclare an existing Concept",
    ),
  );
  assert.ok(
    requestBody.messages?.[1]?.content.includes(
      'ConceptMatch(identity="Parakeet"',
    ),
  );
  assert.match(
    requestBody.messages?.[1]?.content ?? "",
    /pattern=Parakeet\(\); context=any; composed body=ConceptMeaning/,
  );
  store.close();
});

test("a Concept declaration saves a new Concept and realizes to its identity", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          content:
            'Question(Concept(identity="parakeet", gloss="A small parrot native to India, Southeast Asia, and Australia.", relations=ConceptRelations(IsA(Parrot())), realizations=Realizations(Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot native to India, Southeast Asia, and Australia.")))))',
        },
      }),
    };
  };
  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      { name: "input", value: "What is a parakeet?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "LearningTest",
  });

  assert.equal(
    formatExpression(result.value),
    'Answer(ConceptMeaning(identity="Parakeet", gloss="A small parrot native to India, Southeast Asia, and Australia."))',
  );
  const learned = store.getConcept("Parakeet");
  assert.ok(learned);
  assert.deepEqual(learned.relations.map(formatExpression), ["IsA(Parrot())"]);
  const meaningRealization = learned.realizations[0];
  assert.ok(meaningRealization);
  assert.equal(
    formatExpression(meaningRealization),
    'Realization(pattern=Parakeet(), body=ConceptMeaning(identity="Parakeet", gloss="A small parrot native to India, Southeast Asia, and Australia."))',
  );
  const events = store.getTraceEvents(result.traceId);
  assert.ok(events.some((event) => event.concept === "SaveConcept"));
  assert.ok(events.some((event) => event.concept === "Parakeet"));
  assert.ok(events.every((event) => event.outcome !== "failure"));
  assert.equal(requests.length, 1);
  store.close();
});

test("an explicit empty Realizations collection stays empty in a Concept declaration", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  await new ConceptEvaluator(store).evaluate({
    input: parseExpression(
      'Concept(identity="UnrealizedCategory", gloss="A category with no current behavior", relations=ConceptRelations(IsA(Category())), realizations=Realizations())',
    ),
    useContext: parseExpression("Execution()"),
    caller: "EmptyRealizationsTest",
  });
  assert.deepEqual(store.getConcept("UnrealizedCategory")?.realizations, []);
  store.close();
});

test("a how-to answer is taught into a Concept and returned through evaluation", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  let parserSystem = "";
  const evaluator = new ConceptEvaluator(store, {
    httpRequestAdapter: async (request) => {
      const body = JSON.parse(request.body ?? "{}") as {
        messages?: Array<{ role: string; content: string }>;
      };
      parserSystem = body.messages?.[0]?.content ?? "";
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            content:
              'Question(Concept(identity="ArithmeticMean", gloss="To calculate the arithmetic mean, add all values and divide the total by the number of values.", relations=ConceptRelations(IsA(StatisticalMeasure())), realizations=Realizations(Realization(pattern=ArithmeticMean(), body=ConceptMeaning(identity="ArithmeticMean", gloss="To calculate the arithmetic mean, add all values and divide the total by the number of values.")))))',
          },
        }),
      };
    },
  });

  const result = await evaluator.evaluate({
    input: application("PromptInput", [
      { name: "input", value: "How do I calculate an average?" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "HowToLearningTest",
  });

  assert.equal(
    formatExpression(result.value),
    'Answer(ConceptMeaning(identity="ArithmeticMean", gloss="To calculate the arithmetic mean, add all values and divide the total by the number of values."))',
  );
  assert.equal(
    store.getConcept("ArithmeticMean")?.gloss,
    "To calculate the arithmetic mean, add all values and divide the total by the number of values.",
  );
  assert.deepEqual(
    store.getConcept("ArithmeticMean")?.relations.map(formatExpression),
    ["IsA(StatisticalMeasure())"],
  );
  assert.equal(store.getConcept("ArithmeticMean")?.realizations.length, 1);
  assert.ok(
    parserSystem.includes(
      "All factual questions, explanations, instructions, comparisons, advice, and computations",
    ),
  );
  assert.equal(
    store
      .getTraceEvents(result.traceId)
      .some((event) => event.concept === "ConversationResponse"),
    false,
  );
  store.close();
});

test("an unresolved factual parse never falls back to a direct model answer", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    const body = JSON.parse(request.body ?? "{}") as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = body.messages?.[0]?.content ?? "";
    const content = system.includes("FORMAT REPAIR:")
      ? requests.length === 2
        ? 'Question(SelectOption(options=Options(Option(text="A"))))'
        : 'ConversationResponse(source="Today is ____. A. Sept 16th B. Noday C. Sept 1st, 1991 D. idk", model="local-test-model", endpoint="http://127.0.0.1:11434")'
      : system.startsWith("You are the Ears")
        ? 'Question(SelectOption(options=[Option(text="A")]))'
        : "Today is September 16, 2026.";
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { content } }),
    };
  };

  const result = await new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  }).evaluate({
    input: application("PromptInput", [
      {
        name: "input",
        value: "Today is ____. A. Sept 16th B. Noday C. Sept 1st, 1991 D. idk",
      },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "RecoveryTest",
  });

  assert.equal(
    formatExpression(result.value),
    'TextResponse(text="I couldn\'t resolve this request into Concepts, so it needs more Concept learning before I can answer.")',
  );
  assert.equal(requests.length, 3);
  const events = store.getTraceEvents(result.traceId);
  assert.ok(events.some((event) => event.concept === "RepairPromptMeaning"));
  assert.ok(
    events.some((event) => event.concept === "InputParserRepairProtocol"),
  );
  const repairRequest = JSON.parse(requests[1]?.body ?? "{}") as {
    messages?: Array<{ role: string; content: string }>;
  };
  assert.ok(
    repairRequest.messages?.[0]?.content.includes(
      "Never replace either wrapper with a bare relation, bare Realization, or quoted catalog signature.",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.concept === "ParseConceptExpression" &&
        event.outcome === "failure",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.concept === "SelectOption" && event.outcome === "failure",
    ),
  );
  assert.equal(
    events.some((event) => event.concept === "ConversationResponse"),
    false,
  );
  assert.equal(
    events.find((event) => event.parentEventId === null)?.outcome,
    "success",
  );
  store.close();
});

test("isolated evaluation streams complete trace events without persisting them", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const streamed: Array<{ id: string; outcome: string }> = [];
  const result = await new ConceptEvaluator(store).evaluate({
    input: arithmeticInput(),
    useContext: parseExpression("Execution()"),
    caller: "IsolatedTest",
    persistTrace: false,
    onTrace: (event) => streamed.push({ id: event.id, outcome: event.outcome }),
  });
  assert.equal(formatExpression(result.value), "Answer(15)");
  assert.ok(streamed.length > 1);
  assert.ok(streamed.some((event) => event.outcome === "running"));
  assert.ok(streamed.some((event) => event.outcome === "success"));
  assert.deepEqual(store.getTraceEvents(result.traceId), []);
  store.close();
});

test("open-ended chat is an editable Concept path through Ollama", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const requests: HttpRequestInput[] = [];
  const adapter = async (
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> => {
    requests.push(request);
    const body = JSON.parse(request.body ?? "{}") as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = body.messages?.[0]?.content ?? "";
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          content: system.startsWith("You are the Ears")
            ? 'ConversationResponse(source="Tell me a tiny joke", model="local-test-model", endpoint="http://127.0.0.1:11434")'
            : "A byte walks into a bar and asks for a bit.",
        },
      }),
    };
  };
  const evaluator = new ConceptEvaluator(store, {
    httpRequestAdapter: adapter,
  });
  const interpreted = await evaluator.evaluate({
    input: application("PromptInput", [
      { name: "input", value: "Tell me a tiny joke" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ConversationTest",
  });
  assert.equal(
    formatExpression(interpreted.value),
    'TextResponse(text="A byte walks into a bar and asks for a bit.")',
  );
  const rendered = await evaluator.evaluate({
    input: application("NaturalLanguageOutput", [
      { name: "result", value: interpreted.value },
      { name: "source", value: "Tell me a tiny joke" },
      { name: "model", value: "local-test-model" },
      { name: "endpoint", value: "http://127.0.0.1:11434" },
    ]),
    useContext: parseExpression("NaturalLanguage()"),
    caller: "ConversationTest",
  });
  assert.equal(rendered.value, "A byte walks into a bar and asks for a bit.");
  assert.equal(requests.length, 2);
  assert.ok(
    store
      .getTraceEvents(interpreted.traceId)
      .some((event) => event.concept === "ConversationResponse"),
  );
  assert.ok(
    store
      .getTraceEvents(interpreted.traceId)
      .some((event) => event.concept === "ConversationResponseProtocol"),
  );
  store.close();
});

test("Concept lookup finds an operation through its natural-language relation", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const result = await new ConceptEvaluator(store).evaluate({
    input: application("ConceptLookup", [
      { name: "query", value: "What is 5 times three?" },
      { name: "limit", value: 8 },
    ]),
    useContext: parseExpression("ConceptRetrieval()"),
    caller: "LookupTest",
  });
  assert.match(formatExpression(result.value), /identity="Multiply"/);
  assert.match(
    formatExpression(result.value),
    /pattern=Multiply\(\$left, \$right\); context=Execution\(\); executable implementation/,
  );
  assert.doesNotMatch(formatExpression(result.value), /args =>/);
  store.close();
});

test("ConceptLookup filters conversation memories before applying its result limit", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  for (let index = 0; index < 12; index += 1) {
    store.saveConcept(
      createConceptUnit({
        identity: "Conversation_Average_" + index,
        gloss: "How do I calculate an average?",
        relations: [],
        realizations: [],
      }),
    );
  }
  store.saveConcept(
    createConceptUnit({
      identity: "ArithmeticMean",
      gloss:
        "To calculate an average, sum all values and divide by their count.",
      relations: [],
      realizations: [],
    }),
  );

  const result = await new ConceptEvaluator(store).evaluate({
    input: application("ConceptLookup", [
      { name: "query", value: "How do I calculate an average?" },
      { name: "limit", value: 8 },
    ]),
    useContext: parseExpression("ConceptRetrieval()"),
    caller: "KnowledgeConceptLookupTest",
  });

  assert.match(formatExpression(result.value), /identity="ArithmeticMean"/);
  assert.doesNotMatch(
    formatExpression(result.value),
    /identity="Conversation_/,
  );
  store.close();
});

test("MemoryLookup returns no more than its requested number of conversations", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  for (let index = 0; index < 8; index += 1) {
    store.saveConcept(
      createConceptUnit({
        identity: "Conversation_Reference_" + index,
        gloss: "The comet I mentioned is named Halley",
        relations: [],
        realizations: [],
      }),
    );
  }

  const result = await new ConceptEvaluator(store).evaluate({
    input: application("MemoryLookup", [
      { name: "query", value: "comet mentioned Halley" },
      { name: "limit", value: 2 },
    ]),
    useContext: parseExpression("MemoryRetrieval()"),
    caller: "MemoryLimitTest",
  });

  const memoryResults = formatExpression(result.value);
  assert.match(memoryResults, /^MemoryResults\(/);
  assert.equal((memoryResults.match(/MemoryConcept\(/g) ?? []).length, 2);
  store.close();
});

test("plain-text Concept interpretation tolerates a model's terminal full stop", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const result = await new ConceptEvaluator(store).evaluate({
    input: application("ParseConceptExpression", [
      {
        name: "text",
        value: 'Question(Multiply(Number(5), Number(String("three")))).',
      },
    ]),
    useContext: parseExpression("ConceptInterpretation()"),
    caller: "ExpressionTextTest",
  });
  assert.equal(
    formatExpression(result.value),
    'Question(Multiply(Number(5), Number(String("three"))))',
  );
  store.close();
});

test("changing the stored Multiply realization changes behavior without host edits", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const multiply = store.getConcept("Multiply");
  assert.ok(multiply);
  multiply.realizations = [
    parseExpression(
      'Realization(pattern=Multiply($left, $right), body=Code(source="args[0] + args[1]"))',
    ),
  ];
  store.saveConcept(multiply);

  const result = await new ConceptEvaluator(store).evaluate({
    input: arithmeticInput(),
    useContext: parseExpression("Execution()"),
    caller: "MutationTest",
  });
  assert.equal(formatExpression(result.value), "Answer(8)");
  store.close();
});

test("named Concept arguments bind by formal name and reach code in signature order", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Subtract",
      gloss: "Subtract the right value from the left value",
      relations: [],
      realizations: [
        parseExpression(
          'Realization(pattern=Subtract($left, $right), context=Execution(), body=Code(source="args[0] - args[1]"))',
        ),
      ],
    }),
  );

  const result = await new ConceptEvaluator(store).evaluate({
    input: parseExpression("Subtract(right=3, left=10)"),
    useContext: parseExpression("Execution()"),
    caller: "NamedArgumentsTest",
  });
  assert.equal(formatExpression(result.value), "7");
  store.close();
});

test("an unseen compositional Concept executes without adding evaluator code", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Double",
      gloss: "Twice a number",
      relations: [],
      realizations: [
        parseExpression(
          "Realization(pattern=Double($value), body=Multiply($value, 2))",
        ),
      ],
    }),
  );

  const result = await new ConceptEvaluator(store).evaluate({
    input: parseExpression("Double(21)"),
    useContext: parseExpression("Execution()"),
    caller: "CompositionTest",
  });
  assert.equal(formatExpression(result.value), "42");
  store.close();
});

test("Concept language forms bind lexically, branch lazily, sequence, and recover failures", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const evaluator = new ConceptEvaluator(store);
  const evaluate = async (source: string) =>
    evaluator.evaluate({
      input: parseExpression(source),
      useContext: parseExpression("Execution()"),
      caller: "LanguageFormTest",
    });

  const lexical = await evaluate(
    'Let(name="x", value=Multiply(Number(5), Number(String("three"))), body=Let(name="x", value=2, body=Multiply($x, 3)))',
  );
  assert.equal(formatExpression(lexical.value), "6");

  const branch = await evaluate(
    "If(condition=false, then=MissingConcept(), otherwise=Then(first=Multiply(2, 3), then=42))",
  );
  assert.equal(formatExpression(branch.value), "42");

  const recovered = await evaluate("Try(body=UnknownForTest(), catch=$error)");
  assert.equal(
    formatExpression(recovered.value),
    'UnknownConcept(identity="UnknownForTest")',
  );

  const branchEvents = store.getTraceEvents(branch.traceId);
  assert.ok(
    store
      .getTraceEvents(lexical.traceId)
      .some((event) => event.concept === "Let"),
  );
  assert.ok(branchEvents.some((event) => event.concept === "If"));
  assert.ok(branchEvents.some((event) => event.concept === "Then"));
  assert.ok(
    store
      .getTraceEvents(recovered.traceId)
      .some((event) => event.concept === "Try"),
  );
  assert.equal(
    branchEvents.some((event) => event.concept === "MissingConcept"),
    false,
  );
  store.close();
});

test("launcher can use an alternate runtime-entry Concept from the store", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "AlternateEntry",
      gloss: "An alternate configured evaluation entry point",
      relations: [],
      realizations: [
        parseExpression(
          'Realization(pattern=AlternateEntry(input=$input, useContext=$context), evaluateArguments=false, body=Code(source="args => 99"))',
        ),
      ],
    }),
  );

  const result = await new ConceptEvaluator(store, {
    runtimeEntryConcept: "AlternateEntry",
  }).evaluate({
    input: parseExpression("Unseen(7)"),
    useContext: parseExpression("Execution()"),
    caller: "EntryTest",
  });
  assert.equal(formatExpression(result.value), "99");
  assert.equal(
    store.getTraceEvents(result.traceId)[0]?.concept,
    "AlternateEntry",
  );
  store.close();
});

test("ordinary Concepts can hold context-specific alternatives", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Fetch",
      gloss: "Obtain or retrieve something",
      relations: [],
      realizations: [
        parseExpression(
          'Realization(pattern=Fetch($item), context=Meaning(), body=Code(source="args => \\"getting: \\" + args[0]"))',
        ),
        parseExpression(
          'Realization(pattern=Fetch($item), context=Execution(), body=Code(source="args => \\"retrieved: \\" + args[0]"))',
        ),
      ],
    }),
  );
  const evaluator = new ConceptEvaluator(store);

  const meaning = await evaluator.evaluate({
    input: parseExpression('Fetch("a stick")'),
    useContext: parseExpression("Meaning()"),
    caller: "ContextTest",
  });
  const execution = await evaluator.evaluate({
    input: parseExpression('Fetch("a URL")'),
    useContext: parseExpression("Execution()"),
    caller: "ContextTest",
  });
  assert.equal(formatExpression(meaning.value), '"getting: a stick"');
  assert.equal(formatExpression(execution.value), '"retrieved: a URL"');
  store.close();
});

test("unknown concepts produce a visible failure result and failed trace event", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  const result = await new ConceptEvaluator(store).evaluate({
    input: parseExpression("Unseen(7)"),
    useContext: parseExpression("Execution()"),
    caller: "FailureTest",
  });
  assert.match(formatExpression(result.value), /^UnknownConcept\(/);
  assert.equal(store.getTraceEvents(result.traceId)[0]?.outcome, "failure");
  store.close();
});

test("recursive realizations stop at the generic depth budget with a traceable failure", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Loop",
      gloss: "A deliberately recursive test Concept",
      relations: [],
      realizations: [
        parseExpression("Realization(pattern=Loop(), body=Loop())"),
      ],
    }),
  );
  const result = await new ConceptEvaluator(store, {
    maximumDepth: 3,
  }).evaluate({
    input: parseExpression("Loop()"),
    useContext: parseExpression("Execution()"),
    caller: "BudgetTest",
  });
  assert.match(formatExpression(result.value), /^BudgetExceeded\(/);
  assert.ok(
    store
      .getTraceEvents(result.traceId)
      .some((event) => event.outcome === "failure"),
  );
  store.close();
});

test("invalid code results fail visibly instead of returning a placeholder", async () => {
  const store = createStore();
  seedCoreConcepts(store);
  store.saveConcept(
    createConceptUnit({
      identity: "Broken",
      gloss: "A test Concept with a failing realization",
      relations: [],
      realizations: [
        parseExpression(
          'Realization(pattern=Broken(), body=Code(source="() => undefined"))',
        ),
      ],
    }),
  );
  const result = await new ConceptEvaluator(store).evaluate({
    input: parseExpression("Broken()"),
    useContext: parseExpression("Execution()"),
    caller: "ErrorTest",
  });
  assert.match(formatExpression(result.value), /^InvalidRealizationOutput\(/);
  assert.ok(store.getTraceEvents(result.traceId).some((event) => event.error));
  store.close();
});

test("generic evaluator has no branches or callable registry keyed by semantic names", async () => {
  const source = await readFile(
    new URL("../src/runtime/evaluator.ts", import.meta.url),
    "utf8",
  );
  for (const semanticName of [
    "Multiply",
    "Number",
    "Question",
    "Answer",
    "Double",
    "Fetch",
  ]) {
    assert.equal(source.includes('case "' + semanticName + '"'), false);
    assert.equal(source.includes('"' + semanticName + '": ('), false);
  }
});
