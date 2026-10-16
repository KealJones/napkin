// GSM8K train items for learning the reader's weights offline (live-probe, test=scripts/gsm8k-train-dump.mjs):
// ten items a line, so the run's kept output holds a thousand.
const text = await (await fetch("https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/train.jsonl")).text();
const items = text.trim().split("\n").slice(0, 1000).map((l, i) => {
  const x = JSON.parse(l);
  return { i: i + 1, q: x.question, a: x.answer.split("####").pop().trim() };
});
for (let k = 0; k < items.length; k += 10) console.log("GSMT " + JSON.stringify(items.slice(k, k + 10)));
