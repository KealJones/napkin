import { isExpr, type Expr } from "./expression.js";

export interface ConceptUnit {
  identity: string;
  gloss: string;
  relations: Expr[];
  realizations: Expr[];
  updatedAt?: string;
}

export function createConceptUnit(
  unit: Omit<ConceptUnit, "updatedAt">,
): ConceptUnit {
  validateConceptUnit(unit);
  return structuredClone(unit);
}

export function validateConceptUnit(
  unit: unknown,
): asserts unit is ConceptUnit {
  if (typeof unit !== "object" || unit === null || Array.isArray(unit)) {
    throw new TypeError("Concept unit must be an object");
  }
  const candidate = unit as Record<string, unknown>;
  if (
    typeof candidate.identity !== "string" ||
    candidate.identity.trim().length === 0 ||
    typeof candidate.gloss !== "string" ||
    !Array.isArray(candidate.relations) ||
    !candidate.relations.every(isExpr) ||
    !Array.isArray(candidate.realizations) ||
    !candidate.realizations.every(isExpr)
  ) {
    throw new TypeError(
      "Concept unit has an invalid identity, gloss, relation, or realization",
    );
  }
  if (
    candidate.updatedAt !== undefined &&
    typeof candidate.updatedAt !== "string"
  ) {
    throw new TypeError("Concept updatedAt must be a string when provided");
  }
}
