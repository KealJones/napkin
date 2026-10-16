// The first GSM8K test items, question and answer, one JSON line each (live-probe, test=scripts/gsm8k-dump.mjs),
// so a run's misses can be read where the dataset cannot be fetched.
const text = await (await fetch("https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl")).text();
for (const [i, l] of text.trim().split("\n").slice(0, Number(process.env.N ?? 100)).entries()) {
  const x = JSON.parse(l);
  console.log("GSM " + JSON.stringify({ i: i + 1, q: x.question, a: x.answer.split("####").pop().trim() }));
}
