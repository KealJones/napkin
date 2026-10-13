// @realization OfferAnswered($what, $answer), context = Speaking(), evaluateArguments = false
// A yes or no to what was offered: to talking, an open ear; to a doing ("find a new job"), the
// first step asked; a no, left open.
async (args, bindings, api) => {
  const what = args[0] ? args[0].value : undefined;
  const answer = args[1] ? args[1].value : undefined;
  const yes = answer && answer.head === "Agreement";
  const words = what && what.head ? what.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase() : "";
  if (!yes) return "That's okay. I'm here if you change your mind.";
  if (!what || what.head === "TalkingItOver") return "I'm listening. What's been going on?";
  return "Okay. What would be the first step to " + words + "?";
};
