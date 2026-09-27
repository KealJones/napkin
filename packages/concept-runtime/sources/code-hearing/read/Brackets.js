// "[1, 2]": a list; with spreads, the lists joined: [...a, x] is Concat(a, List(x)).
const runs = [];
let run = [];
let spread = false;
for (const x of parts) {
  if (is(x, "Comment")) continue;
  if (is(x, "Spread")) {
    if (run.length) runs.push(api.call("List", ...run));
    run = [];
    spread = true;
    runs.push(await read(positional(x)[0]));
  } else run.push(await read(x));
}
if (!spread) return api.call("List", ...run);
if (run.length) runs.push(api.call("List", ...run));
return api.call("Concat", ...runs);
