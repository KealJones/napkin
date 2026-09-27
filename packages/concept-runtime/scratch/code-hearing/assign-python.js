async (args, bindings, api) => {
  // In Python, "x = 1" to a bare name is where x begins: a variable that can change (Var).
  const [place, value] = args.map((a) => a.value);
  const bare = place !== null && typeof place === "object" && "variable" in place;
  return api.call(bare ? "Var" : "Assign", place, value);
}
