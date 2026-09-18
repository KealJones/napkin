export const runtimeEntrySource = String.raw`async (args, api) => {
  const input = args[0];
  const useContext = args[1];
  let steps = 0;

  function expression(head, fields) {
    return {
      apply: {
        head,
        args: Object.keys(fields).map((name) => ({ name, value: fields[name] }))
      }
    };
  }

  function raise(head, fields, message) {
    const error = new Error(message);
    error.value = expression(head, fields);
    throw error;
  }

  function isApplication(value) {
    return typeof value === "object" && value !== null && "apply" in value;
  }

  function field(value, name) {
    if (!isApplication(value)) return undefined;
    const argument = value.apply.args.find((item) => item.name === name);
    return argument && argument.value;
  }

  function argumentsInPatternOrder(pattern, actual) {
    if (!actual.every((argument) => argument.name !== undefined)) return actual;
    return pattern.apply.args.map((expected) => {
      const formalName = expected.name || (
        expected.value && typeof expected.value === "object" && "variable" in expected.value
          ? expected.value.variable
          : undefined
      );
      return actual.find((argument) => argument.name === formalName);
    });
  }

  function specificity(value) {
    if (typeof value !== "object" || value === null) return 1;
    if ("variable" in value) return 0;
    return 1 + value.apply.args.reduce(
      (sum, argument) => sum + specificity(argument.value),
      0
    );
  }

  function select(unit, call, useContext) {
    const candidates = [];
    for (const candidate of unit.realizations) {
      if (!isApplication(candidate) || candidate.apply.head !== "Realization") {
        raise("InvalidRealization", {
          concept: unit.identity,
          realization: candidate
        }, "A realization must use the generic Realization expression");
      }

      const pattern = field(candidate, "pattern");
      const body = field(candidate, "body");
      const contextPattern = field(candidate, "context");
      const evaluateArguments = field(candidate, "evaluateArguments");
      const evaluateResult = field(candidate, "evaluateResult");
      const resultContext = field(candidate, "resultContext");
      if (pattern === undefined || body === undefined) {
        raise("InvalidRealization", {
          concept: unit.identity,
          realization: candidate
        }, "A realization requires pattern and body expressions");
      }
      if (evaluateArguments !== undefined && typeof evaluateArguments !== "boolean") {
        raise("InvalidRealization", {
          concept: unit.identity,
          field: "evaluateArguments"
        }, "evaluateArguments must be a boolean");
      }
      if (evaluateResult !== undefined && typeof evaluateResult !== "boolean") {
        raise("InvalidRealization", {
          concept: unit.identity,
          field: "evaluateResult"
        }, "evaluateResult must be a boolean");
      }

      const bindings = {};
      if (!api.match(pattern, call, bindings)) continue;
      if (contextPattern !== undefined && !api.match(contextPattern, useContext, bindings)) {
        continue;
      }
      candidates.push({
        expression: candidate,
        pattern,
        body,
        contextPattern,
        resultContext,
        bindings,
        evaluateArguments: evaluateArguments !== false,
        evaluateResult: evaluateResult === true,
        specificity: contextPattern === undefined ? 0 : specificity(contextPattern)
      });
    }
    candidates.sort((left, right) => right.specificity - left.specificity);
    return candidates[0];
  }

  async function evaluate(value, caller, parentEventId, depth, activeContext) {
    if (value === null || typeof value !== "object") return value;
    if ("variable" in value) {
      raise("UnboundVariable", { name: value.variable }, "Unbound variable");
    }

    const head = value.apply.head;
    const eventId = api.startEvent({
      concept: head,
      caller,
      parentEventId,
      useContext: activeContext,
      input: value,
      arguments: value.apply.args.map((argument) => argument.value)
    });

    try {
      steps += 1;
      if (depth > api.maximumDepth) {
        raise("BudgetExceeded", {
          kind: "depth",
          limit: api.maximumDepth
        }, "Maximum evaluation depth exceeded");
      }
      if (steps > api.maximumSteps) {
        raise("BudgetExceeded", {
          kind: "steps",
          limit: api.maximumSteps
        }, "Maximum evaluation steps exceeded");
      }

      const unit = api.getConcept(head);
      if (!unit) {
        raise("UnknownConcept", { identity: head }, "No Concept unit exists for " + head);
      }

      const selected = select(unit, value, activeContext);
      if (!selected) {
        api.finishEvent(eventId, { output: value, outcome: "residual" });
        return value;
      }

      api.updateEvent(eventId, { selectedRealization: selected.expression });
      let bindings = selected.bindings;
      let bodyArguments = value.apply.args;

      if (selected.evaluateArguments) {
        bodyArguments = await Promise.all(value.apply.args.map(async (argument) => {
          const evaluated = await evaluate(
            argument.value,
            head,
            eventId,
            depth + 1,
            activeContext
          );
          return argument.name === undefined
            ? { value: evaluated }
            : { name: argument.name, value: evaluated };
        }));
        const evaluatedCall = { apply: { head, args: bodyArguments } };
        api.updateEvent(eventId, {
          evaluatedArguments: bodyArguments.map((argument) => argument.value)
        });
        bindings = {};
        if (!api.match(selected.pattern, evaluatedCall, bindings)) {
          raise("NoApplicableRealization", {
            concept: head,
            afterArgumentEvaluation: true
          }, "The selected pattern no longer matches after argument evaluation");
        }
        if (
          selected.contextPattern !== undefined &&
          !api.match(selected.contextPattern, activeContext, bindings)
        ) {
          raise("NoApplicableRealization", {
            concept: head,
            context: activeContext
          }, "The selected context pattern no longer matches after argument evaluation");
        }
      }

      const body = api.substitute(selected.body, bindings);
      const resultContext = selected.resultContext === undefined
        ? activeContext
        : api.substitute(selected.resultContext, bindings);
      let result = isApplication(body) && body.apply.head === "Code"
        ? await api.runCode(
            body,
            argumentsInPatternOrder(selected.pattern, bodyArguments),
            activeContext,
            eventId,
            async (expression, context) =>
              evaluate(
                expression,
                head,
                eventId,
                depth + 1,
                context === undefined ? activeContext : context
              )
          )
        : await evaluate(body, head, eventId, depth + 1, resultContext);
      if (selected.evaluateResult) {
        result = await evaluate(result, head, eventId, depth + 1, resultContext);
      }
      api.finishEvent(eventId, { output: result, outcome: "success" });
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const failure = caught && caught.value
        ? caught.value
        : expression("ExecutionFailed", { concept: head, message });
      api.finishEvent(eventId, {
        output: failure,
        outcome: "failure",
        error: message
      });
      const propagated = new Error(message);
      propagated.value = failure;
      throw propagated;
    }
  }

  return evaluate(input, api.entryConcept, api.rootEventId, 0, useContext);
}`;
