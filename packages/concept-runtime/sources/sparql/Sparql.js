// @realization Sparql($query), context = Execution()
// A SPARQL query to the Wikidata Query Service: its rows, each a Record of the values bound (an
// item as its id, "Q513"). Given a minute, as a query across a whole kind takes time. The call
// itself when the service does not answer.
async (args, bindings, api) => {
  const query = String(bindings.get("query"));
  let got = undefined;
  try {
    const response = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), {
      headers: { ["user-agent"]: "Napkin/0.1 (https://github.com/KealJones/napkin)", accept: "application/sparql-results+json" },
      signal: AbortSignal.timeout(60000),
    });
    got = response.ok ? await response.json() : undefined;
  } catch (error) {
    got = undefined;
  }
  const rows = got && got.results && Array.isArray(got.results.bindings) ? got.results.bindings : undefined;
  if (!rows) return api.call("Sparql", query);
  return api.fromHost(rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v.value === "string" && v.value.startsWith("http://www.wikidata.org/entity/") ? v.value.split("/").pop() : v.value]))));
};
