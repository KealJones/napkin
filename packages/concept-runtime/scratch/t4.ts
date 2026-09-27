function complements(r: Reader, stop: (r: Reader) => boolean = () => false): Expr[] {
  const out: Expr[] = [];
  while (!r.done() && !stop(r) && !clauseBoundary(r)) {
    const w = r.word();
    if (w === "and") {
      r.next();
      continue;
    }
    if (w === "please") {
      r.next();
      continue;
    }
    // "have a million dollars or owe a million dollars": alternatives between two doings.
    if (w === "or" && out.length && canBeVerb(r.word(1)) && !r.is("Noun", 1)) {
      r.next();
      out.push(c("Or", out.pop()!, verbPhrase(r)));
      continue;
    }
    // "and like think": a filler "like" before a doing blurs it.
    if (w === "like" && (r.is("Verb", 1) || canBeVerb(r.word(1))) && !r.is("Noun", 1) && !DET.has(r.word(1))) {
      const h = r.next().raw;
      out.push(c("MarkFuzzy", h, verbPhrase(r)));
      continue;
    }
    // Filler inside or after a clause is kept as said, beside it.
    if (/^(lol|lmao|idk|btw|tbh|imo|haha)$/.test(w)) {
      trailing.push(r.next().raw);
      continue;
    }
    // "3, er, 4pm", "the size, sorry the length": a retraction of one's own words.
    if (out.length && r.toks[r.i - 1]?.comma && /^(er|um|sorry|no|i mean)$/.test(w)) {
      r.next();
      if (r.word() === "wait") r.next();
      const retracted = out.pop()!;
      out.push(c("MarkCorrection", retracted, nounPhrase(r)));
      continue;
    }
    if (r.is("Particle") || (PARTICLE.has(w) && !r.is("Noun", 1) && !r.is("Determiner", 1))) {
      out.push(c(name(r.next().word)));
    } else if (WH.has(w) || w === "whether" || w === "if") {
      // "show me what you know", "tell me whether it will rain": a question inside, as said.
      const q = r.next();
      if (r.done() || clauseBoundary(r)) out.push(c(name(q.word)));
      else out.push(embeddedQuestion(r, q) ?? c(name(q.word), clause(r).e));
    } else if (w === "to" && r.word(1) === "like" && canBeVerb(r.word(2)) && !r.is("Noun", 2)) {
      r.next();
      r.next();
      out.push(c("MarkFuzzy", "like", verbPhrase(r)));
    } else if (w === "to" && (r.is("Verb", 1) || (canBeVerb(r.word(1)) && (DET.has(r.word(2)) || POSSESSIVE[r.word(2)] || r.is("Noun", 2))))) {
      r.next();
      out.push(verbPhrase(r));
    } else if (PREP.has(w)) {
      out.push(...prepositions(r));
    } else if ((r.is("Adverb") || r.is("Date") && !r.is("Value")) && r.word(1) !== "than") {
      out.push(stressed(r.peek()!, c(name(r.next().word))));
    } else if (r.is("Verb") && !r.is("Noun")) {
      out.push(verbPhrase(r));
    } else {
      const np = nounPhrase(r);
      // "add 2 and 2": two things side by side are siblings; three or more are a List.
      const pair = typeof np === "object" && np !== null && "head" in np && np.head === "List" && np.args.length === 2;
      if (pair) out.push(...np.args.map((a) => a.value));
      else out.push(np);
    }
  }
  return out;
}
