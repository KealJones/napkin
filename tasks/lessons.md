# Lessons

## 2026-09-23: Ears gold and prompt

- **Derive a source of truth from the original requirement, not from existing code or
  examples.** The first gold map copied the prompt's own conventions (drop filler, flatten
  layout, bind pronouns away, frame by act). The user pointed back to `ir-spec.md` 1.1:
  keep the exact structure of what was said, make it runnable, and let evaluation project.
  Rule: before writing a reference set, re-read the requirement it serves and list every
  place the draft interprets instead of preserving.
- **Anything deterministic comes off the model.** Mood frames, `Number(...)` slips and
  named `Ref` arguments all moved from prompt rules to mechanical passes, each measured on
  saved outputs with `--rescore` before keeping it. Rule: when a model keeps failing a
  surface-checkable rule, try a mechanical pass on saved outputs first.
- **Compare runs under the same expectations.** Changing the gold between two runs made a
  prompt look worse than it was. Rule: re-score old raw outputs before diffing.
