export function readRealization(pack: string, e: Call): Realization {
  const [pattern] = positional(e);
  const body = named(e, "body");
  if (pattern === undefined || body === undefined) throw new PackError(pack, `a Realization needs a pattern and body=: ${format(e)}`);
  const flag = (name: string, fallback: boolean): boolean => {
    const v = named(e, name);
    return typeof v === "boolean" ? v : fallback;
  };
  const properties = named(e, "properties");
  const ctx = named(e, "context");
  const resultContext = named(e, "resultContext");
  return {
    pattern,
    ...(ctx === undefined ? {} : { context: ctx }),
    body,
    properties: properties !== undefined && isCall(properties) ? positional(properties) : [],
    evaluateArguments: flag("evaluateArguments", true),
    evaluateResult: flag("evaluateResult", false),
    ...(resultContext === undefined ? {} : { resultContext }),
  };
}
