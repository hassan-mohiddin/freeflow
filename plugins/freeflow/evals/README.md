# Freeflow Evals

- `registries/`: eval definitions.
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
Prefer the latest acceptance report over old smoke evals when evidence conflicts.
