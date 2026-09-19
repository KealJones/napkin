/**
 * The names the studio client imports from `@cnocept/concept-runtime/expression`.
 *
 * Kept as aliases rather than renaming the client: a user interface is an external
 * consumer, and breaking one to tidy an internal name is the wrong trade.
 */
export {
  call as application,
  format as formatExpression,
  parse as parseExpression,
  named as namedArgument,
  isExpr,
  isCall as isApplication,
  type Expr,
  type Argument,
  type Call,
  type Primitive,
  type Variable,
} from "./expression.js";
