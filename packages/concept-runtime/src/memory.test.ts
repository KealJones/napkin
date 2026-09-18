import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ConversationRepository } from "./memory/conversations.js";
import { parseExpression } from "./concept/expression.js";
import { SQLiteConceptStore } from "./store/sqlite-store.js";

test("persistent conversation Concepts survive reopen and are searchable as memory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cnocept-memory-"));
  const databasePath = join(directory, "concepts.sqlite");
  try {
    const store = new SQLiteConceptStore(new DatabaseSync(databasePath));
    const conversations = new ConversationRepository(store);
    const persistent = conversations.create(true);
    conversations.appendTurn(persistent.id, {
      userText: "Remember that my blue bicycle is named Comet.",
      assistantText: "I will remember that your blue bicycle is named Comet.",
      promptMeaning: parseExpression(
        'TeachFact(subject="blue bicycle", name="Comet")',
      ),
      result: parseExpression('Answer("saved")'),
      traceIds: ["trace-one"],
    });

    const isolated = conversations.create(false);
    conversations.appendTurn(isolated.id, {
      userText: "Private note: the spare key is under the red pot.",
      assistantText: "Understood.",
      promptMeaning: null,
      result: parseExpression("Acknowledged()"),
      traceIds: ["trace-private"],
    });
    assert.equal(store.getConcept(isolated.id), undefined);
    assert.equal(conversations.closeIsolated(isolated.id), true);
    assert.equal(conversations.get(isolated.id), undefined);

    const matches = store.searchConcepts("blue bicycle Comet", 10);
    assert.ok(matches.some((unit) => unit.identity === persistent.id));
    assert.equal(
      store
        .searchConcepts("spare key red pot", 10)
        .some((unit) => unit.identity === persistent.id),
      false,
    );
    store.close();

    const reopened = new SQLiteConceptStore(new DatabaseSync(databasePath));
    const saved = reopened.getConcept(persistent.id);
    assert.ok(saved);
    assert.equal(
      saved.relations.filter((relation) => {
        return (
          typeof relation === "object" &&
          relation !== null &&
          "apply" in relation &&
          relation.apply.head === "Message"
        );
      }).length,
      2,
    );
    assert.ok(
      reopened
        .searchConcepts("Comet", 10)
        .some((unit) => unit.identity === persistent.id),
    );
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
