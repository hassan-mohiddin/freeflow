# Contributor gate

`npm run eval:gate -- --base <ref>` checks a Freeflow change against the regression suites that cover it. It is contributor tooling, not part of the shipped skill, and **not part of `npm run check` or CI**: it calls real models, needs your Pi credentials, and costs money. Run it by hand before asking for review of a change to a covered skill.

```text
npm run eval:gate -- --base origin/main --dry-run-plan     # what would run, and what reuse could supply
npm run eval:gate -- --base origin/main --jobs 4 --max-cost 2
```

## What it does

1. Lists the paths changed since the base (`git diff --name-only <base>...HEAD`) and matches them to the entries in `.skill-eval/gate.json`.
2. Prints the plan per matched suite: groups, trials, subjects, how many subjects the results index could reuse, the models, and which rule gives the verdict. `--dry-run-plan` stops here.
3. Runs each suite through the evaluator with `--reuse`, `--pilot 3`, the entry's `--trials` (unless the suite's decision schedules its own), and `--jobs` and the remaining `--max-cost` when given. Inputs must be committed: the gate never makes a dry run.
4. Reports each suite with its aggregate ID and its own cost (runs reused from the index cost nothing):
   - **PASS**: the decision (the suite's, or the entry's override) is `beats` or `no-difference-shown`; without a decision, every comparison was fully graded and no other arm passed less often than the reference.
   - **REGRESSED**: the decision is `worse`, or a comparison's other arm passed less often than the reference.
   - **UNDECIDED**: the claim reached no class, a comparison has unavailable outcomes, or the budget ran out first.
   - **INFRASTRUCTURE**: the evaluator refused, the pilot stopped the run, or runs failed, were invalid or were cancelled.

Exit codes: 1 when any suite regressed, else 2 on a refusal or infrastructure failure, else 0.

## gate.json

```json
{
  "schema_version": 1,
  "model": { "model": "anthropic/claude-haiku-5-5", "thinking": "medium" },
  "entries": [{ "paths": ["skills/review-work/**"], "suite": ".skill-eval/review-suite/suite.json", "trials": 3 }]
}
```

- `paths` are globs over repository paths (`**` crosses directories).
- `decision` (optional) is `"none"` to read comparisons even when the suite declares a decision, or a decision rule (the suite schema's shape, without `trials`) applied to the aggregate instead of the suite's.
- `model` is the gate's default. A suite's own configuration keeps precedence; the plan notes a suite that uses another model. The evaluator takes models only from definitions, so an arm with no model is refused with the default to declare.

The suites measure the arms they declare. The gate does not rewrite a suite's baseline to the base ref.
