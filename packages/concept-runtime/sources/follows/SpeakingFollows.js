// @realization Follows(Rest($x)), context = Speaking(), evaluateArguments = false
// What follows from what was told, said: how it felt ("Sorry to hear that."), what the event
// leads to ("Losing your job can cause depression."), and what it makes one want, asked ("Do you
// want to find a new job?"). A Concept is said in its name's words (FindANewJob is "find a new
// job"); a doing (the tagger says its first word is a verb) is what something makes you do.
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const wordsOf = (e) => (e && e.head ? e.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase() : "");
  const items = (list) => (list && list.args ? list.args.map((a) => wordsOf(a.value)).filter(Boolean) : []);
  const either = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);
  const doing = (phrase) => {
    const first = api.words(phrase)[0];
    return first ? first.tags.includes("Verb") && !first.tags.includes("Gerund") : false;
  };
  const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const parts = [];
  const v = named("valence");
  const told = named("told");
  // Said of Napkin itself: thanked for, or owned.
  const about = named("about");
  if (typeof v === "number" && about && about.head === "Self") {
    if (v >= 0.1) return "Thank you, that's really kind of you!";
    if (v <= -0.1) return "I'm sorry. What did I get wrong?";
  }
  // How it felt, said back with what was told when it is known ("Sorry to hear your car broke down.").
  if (typeof v === "number") {
    if (v <= -0.5) parts.push(typeof told === "string" && told ? "Sorry to hear " + told + "." : "Sorry to hear that.");
    else if (v < -0.1) parts.push(typeof told === "string" && told ? "Oh no, " + told + "? That doesn't sound good." : "That doesn't sound good.");
    else if (v >= 0.3) parts.push(typeof told === "string" && told ? "That's great that " + told + "!" : "That's great!");
    else if (v > 0.1) parts.push("Nice.");
  }
  const first = args.find((a) => a.name === undefined);
  const event = first ? wordsOf(first.value) : "";
  const causes = items(named("causes")).slice(0, 2);
  const wants = items(named("wants"));
  if (event && causes.length) {
    const made = causes.filter(doing);
    const brought = causes.filter((x) => !doing(x));
    if (brought.length) parts.push(up(event) + " can cause " + either(brought) + ".");
    else parts.push(up(event) + " can make you " + either(made) + ".");
  } else if (event && !wants.length) {
    const involves = items(named("involves")).slice(0, 2);
    const needs = items(named("needs")).slice(0, 2);
    if (involves.length) parts.push(up(event) + " usually means " + either(involves) + ".");
    else if (needs.length) parts.push(up(event) + " takes " + either(needs) + " first.");
  }
  if (wants.length) {
    const want = wants.find(doing) || wants[0];
    parts.push(doing(want) ? "Do you want to " + want + "?" : "Do you want " + want + "?");
  }
  // Nothing more to say of it: the conversation is left open, the way a friend would.
  if (typeof v === "number" && !wants.length) {
    if (v <= -0.2) parts.push("Do you want to talk about it?");
    else if (v >= 0.3) parts.push("Tell me more!");
  }
  return parts.join(" ");
};
