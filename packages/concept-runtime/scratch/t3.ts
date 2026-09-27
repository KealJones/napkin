  if (isCall(first) && first.head === "Ref" && INFIX[r.word()] && (r.is("Value", 1) || NUMBER_WORD.test(r.word(1)))) {
    first = c(INFIX[r.next().word], first, nounPhrase(r));
}
