// @realization Page(Rest($parts)), context = Speaking(), evaluateArguments = false
// "Sponge Cake I (from https://en.wikibooks.org/wiki/Cookbook:Sponge_Cake_I, CC BY-SA 4.0):", then
// each section, its heading and its list, numbered when the page numbers it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const title = String(args.find((a) => a.name === undefined).value);
  const from = args.find((a) => a.name === "from");
  const license = args.find((a) => a.name === "license");
  const where = from && isCall(from.value) ? String(from.value.args[0].value) : "";
  const lines = [title + (where ? " (from " + where + (license ? ", " + String(license.value) : "") + ")" : "") + ":"];
  for (const a of args) {
    if (a.name !== undefined || !isCall(a.value) || a.value.head !== "Section") continue;
    const heading = String(a.value.args[0].value);
    const items = api.lists.values(a.value.args[1].value);
    const numbered = a.value.args.some((x) => x.name === "numbered" && x.value === true);
    lines.push("", heading + ":");
    items.forEach((item, i) => lines.push((numbered ? i + 1 + ". " : "- ") + String(item)));
  }
  return lines.join("\n");
};
