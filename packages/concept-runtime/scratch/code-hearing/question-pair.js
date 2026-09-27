async (args, bindings, api) => {
  // "a ? b : c": the question takes what is asked before it, and holds what is between it and
  // its ":" and what follows the ":" as the two answers.
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  if (v("pair", at) >= 0) return api.call("List");
  {
    // Its ":": the first where the brackets between have closed and any question asked between
    // has had its own.
    const n = field.kinds.length;
    const is = (i, k) => i >= 0 && i < n && v("kinds", i).args.some((a) => a.value === k);
    let asked = 0;
    for (let k = at + 1; k < n; k++) {
      const p = v("pair", k);
      if (p > k) {
        k = p;
        continue;
      }
      if (is(k, "Closer") && p < 0) break;
      // A bracket between that has not found its closer yet: wait for it.
      if (is(k, "Opener") && p < 0 && !is(k, "Infix")) return api.call("List", api.call("Waits"));
      if (v("heads", k) === "Question") asked++;
      else if (v("heads", k) === "Colon" || v("heads", k) === "Returns") {
        if (asked === 0) return api.call("List", api.call("Link", k, at, api.call("Closes")));
        asked--;
      } else if (is(k, "Separator")) break;
    }
    return api.call("List");
  }
  return api.call("List");
}
