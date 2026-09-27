test("the seed imports with no opaque source left in it", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const result = importTypeScript(readFileSync(`${here}../../src/seed/seed.ts`, "utf8"));
  assert.deepEqual(result.unsupported, []);
  let opaque = 0;
  for (const node of walk(result.expression)) {
    if (!isCall(node) || node.head !== "Call") continue;
    const callee = node.args[0]?.value;
    const isCode = typeof callee === "object" && callee !== null && "variable" in callee && callee.variable === "code";
    if (isCode && typeof node.args[1]?.value === "string") opaque += 1;
  }
  assert.equal(opaque, 0);
});
