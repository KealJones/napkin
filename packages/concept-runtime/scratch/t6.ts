function edges(
  store: ConceptStore,
  cache: GraphCache,
  trace: TraceCache,
  identity: string,
  context: Expr | undefined,
): Map<string, string> {
  const key = context === undefined ? identity : `${identity}\u0000${JSON.stringify(context)}`;
  const co = [...(trace.coUsed.get(identity) ?? [])].filter(([to]) => store.has(to)).sort(([a], [b]) => a.localeCompare(b));
  let out = cache.edges.get(key);
  // Co-usage comes from the trace, which the graph's cache does not follow.
  if (out) return co.length ? withCoUsage(new Map(out), co) : out;
  out = new Map<string, string>();
  const add = (to: string, via: string) => {
    if (to !== identity && !out!.has(to) && store.has(to)) out!.set(to, via);
  };
  const holds = (r: Relation) => matchContext(r.context, context, new Map()).ok;
  const head = (r: Relation) => (isCall(r.claim) ? r.claim.head : String(r.claim));
  for (const r of store.get(identity)?.relations ?? []) {
    if (!holds(r)) continue;
    // The relation's own head is the edge, not a neighbour: `IsA` is not related to a
    // Concept by being how the Concept is related to something.
    for (const part of [r.claim, ...(r.context === undefined ? [] : [r.context])]) {
      for (const sub of walk(part)) {
        const to = sub === r.claim ? undefined : mentionKey(sub);
        if (to !== undefined) add(to, head(r));
      }
    }
  }
  for (const m of store.mentioning(c(identity))) if (holds(m.relation)) add(m.identity, `~${head(m.relation)}`);
  cache.edges.set(key, out);
  return co.length ? withCoUsage(new Map(out), co) : out;
}
