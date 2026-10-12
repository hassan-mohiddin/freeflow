# Contributor gate

`npm run eval:gate -- --base <ref>` checks a Freeflow change against the regression suites that cover it. It is contributor tooling, not part of the shipped skill, and **not part of `npm run check` or CI**: it calls real models, needs your Pi credentials, and costs money. Run it by hand before asking for review of a change to a covered skill.

```text
npm run eval:gate -- --base origin/main --dry-run-plan     # what would run, and what reuse could supply
npm run eval:gate -- --base origin/main --jobs 4 --max-cost 2
```

## What it does

1. Lists the paths changed since the base (`git diff --name-only <base>...HEAD`) and matches them to the entries in `.skill-eval/gate.json`.
2. Prints the plan per matched suite: groups, trials, subjects, how many subjects the results index could reuse, the models, and which rule gives the verdict. `--dry-run-plan` stops here.
3. Runs each suite through the evaluator with `--reuse`, `--pilot 3`, the entry's `--trials` (unless the suite's decision schedules its own), and `--jobs` and the remaining `--max-cost` when given. Inputs must be committed: the gate never makes a dry run. The pilot counts as part of the first trial, so a one-trial suite runs each group once. When the suite has groups with a rubric, the gate then judges the aggregate (`review <aggregate> --rubric`, with the groups' own judges).
4. Reports each suite with its aggregate ID and its own cost (runs reused from the index cost nothing; judge calls are not counted):
   - **PASS**: the decision (the suite's, or the entry's override) is `beats` or `no-difference-shown`; without a decision, every comparison and judged yes/no dimension was fully graded and no other arm passed (or was judged yes) less often than the reference.
   - **REGRESSED**: the decision is `worse`, or a comparison's other arm passed, or a judged dimension's other arm was judged yes, less often than the reference.
   - **UNDECIDED**: the claim reached no class, a comparison has unavailable outcomes, or the budget ran out first.
   - **INFRASTRUCTURE**: the evaluator refused, the pilot stopped the run, or runs failed, were invalid or were cancelled.

Exit codes: 1 when any suite regressed, else 2 on a refusal or infrastructure failure, else 0.

## gate.json

```json
{
  "schema_version": 1,
  "model": { "model": "anthropic/claude-haiku-5-5", "thinking": "medium" },
  "entries": [
    {
      "paths": ["skills/review-work/**"],
      "suite": ".skill-eval/gate/review-work/suite.json",
      "trials": 1,
      "arms": { "base": "base", "head": "head" }
    }
  ]
}
```

- `paths` are globs over repository paths (`**` crosses directories).
- `decision` (optional) is `"none"` to read comparisons even when the suite declares a decision, or a decision rule (the suite schema's shape, without `trials`) applied to the aggregate instead of the suite's.
- `model` is the gate's default. A suite's own configuration keeps precedence; the plan notes a suite that uses another model. The evaluator takes models only from definitions, so an arm with no model is refused with the default to declare.

- `arms` (optional) measures the change itself: `{ "baseline": "base", "candidate": "head" }` runs each named arm with every Git source ref it declares (subject source, Freeflow, source-built extensions) replaced by the base commit or HEAD, through the evaluator's `--source <arm>=<commit>`. The definitions are not edited; the commits are recorded in each run's `invocation.json`, on each run, and in its reuse key. An arm with no Git source is refused, so such a suite needs Git-sourced arms.

Without `arms`, a suite measures the arms it declares: skill-family, for example, compares two fixed refs and does not measure the change. A suite of one-arm groups is reported as **MEASURED** with how many checks passed in every trial (exit code as for a pass).

## The gate suites

`.skill-eval/gate/<skill>/` holds small suites whose arms `base` and `head` load the same skill path from Git; the refs they declare are placeholders the gate replaces with the base commit and HEAD. They are written by `.skill-eval/gate/tools/write-gate-suites.mjs` from tuning cases only (never held-out ones); rerun it after changing the source cases. One trial each:

| Suite | Groups | Subjects per run | Judge calls |
| --- | --- | --- | --- |
| `review-work` | 3 defective review-suite variants (logic, security, convention) and 3 clean ones the clean audit keeps | 12 | 6 (`identified`, Haiku 5.5 high) |
| `write-skill` | skill family `w1-b`, `w1-d`, `w2-a`, `w2-c`, `w3-a`, `w3-c`, `w3-d` | 14 | 0 |
| `evaluate-behavior` | skill family `v1-a`, `v1-b` | 4 | 0 |

- The review cases carry their requirements in the prompt, not as declared context: a Git-sourced arm reads its context from its own commit, which need not hold the suite's context files.
- No suite declares a decision. A sign test needs at least 6 decided cases in one direction to reach p < 0.05, and only 3 review cases carry the judged measure; the comparison and judged rules above give pass or regressed instead.
- A base commit that predates a skill's path makes that arm invalid: `skills/evaluate-behavior` does not exist on `main` before the rename, and the plan warns about it.
