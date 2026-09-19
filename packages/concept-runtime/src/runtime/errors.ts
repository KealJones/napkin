/** Failures are Concepts, not opaque host errors (concept-spec Part 8.3). */
import { type Expr, c, call, format } from "../concept/expression.js";

export class ConceptError extends Error {
  constructor(readonly value: Expr, message?: string) {
    super(message ?? format(value));
    this.name = "ConceptError";
  }
}

export const fail = (head: string, fields: Record<string, Expr>, message?: string): never => {
  const value = call(
    head,
    Object.entries(fields).map(([name, v]) => ({ name, value: v })),
  );
  throw new ConceptError(value, message);
};

export const unbound = (name: string) => fail("UnboundVariable", { name }, `Unbound variable $${name}`);
export const budget = (kind: string, limit: number) =>
  fail("BudgetExceeded", { kind, limit }, `Evaluation budget exceeded: ${kind} > ${limit}`);
export const executionFailed = (concept: string, message: string) =>
  c("ExecutionFailed", concept, message);
