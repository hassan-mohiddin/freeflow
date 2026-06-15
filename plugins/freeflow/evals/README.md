# Freeflow Evals

- `registries/`: eval definitions.
- `registries/skill-evidence.json`: explicit skill-to-eval grouping metadata.
- `fixtures/`: tiny repo fixtures used by fixture evals.
- `prompts/`: prompts referenced by registries.
- `scripts/`: local runners and audits.
- `reports/by-skill/`: skill-family eval reports.
- `reports/by-command-surface/`: slash-style command routing reports and matrix.
- `reports/iterations/`: early broad iteration reports.
- `reports/harness/`: eval runner and harness reports.
- `reports/acceptance/`: release acceptance reports.
- `reports/runtime/`: always-on runtime evidence.
- `runbooks/`: how to run specific eval families.
- `suites/`: curated release or acceptance suites.
- `runs/`: ignored generated output.

Use `registries/fixture-evals.json` for current adversarial fixture coverage.
Use `scripts/grade-fixture-eval.sh <eval-id> --output <run-output.md>` after fixture runs that define `objective_checks`; it grades mechanical evidence such as changed files, empty diffs, exit status, and fixed output/diff text.
Baseline fixture runs set `FREEFLOW_DISABLE_RUNTIME_CONTEXT=1` before launching nested agents so installed lifecycle hooks do not inject Freeflow workflow and interview-gate context into the baseline.
Use `scripts/skill-evidence.sh <skill>` to group command routes, eval definitions, acceptance membership, and reports for a skill.
Use `scripts/validate-release-metadata.sh` before release or prepublish checks to validate marketplace metadata, manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status.
Use `scripts/check-runtime-context-hook.sh` after changing plugin-bundled runtime context hooks.
Prefer the latest acceptance report over old smoke evals when evidence conflicts.
