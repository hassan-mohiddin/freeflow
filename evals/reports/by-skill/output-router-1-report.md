# Output Router Skill Eval Report - Iteration 1

Date: 2026-06-20

## Scope

Added a focused eval artifact and tightened `output-router` skill wording for current router action/config guidance.

Owned paths:

- `skills/output-router/SKILL.md`
- `evals/prompts/otr-001.txt`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`

Related documentation change:

- `docs/designs/freeflow-output-router-architecture.md`

## Behavior Gap

The skill already covered high-level tool choice and safety-net defaults, but was light on:

- choosing between `query`, `locate`, `retrieve`, `expand`, and `explain`;
- exact repo/vault line-range retrieval;
- supported optional `outputRouter` config keys;
- minimal setup remaining only `defaultMode`;
- config ownership by `setup-freeflow`.

## Eval Added

Added:

- `OTR-001`: output-router tool choice and config boundary.

Expected behavior:

- answer directly without editing files;
- choose `freeflow_retrieve` for targeted repo evidence and vault recovery;
- choose `freeflow_run` for likely noisy `npm test` output;
- reject workflow mode as a reason to enable native post-tool routing;
- state that safety-net routing is opt-in, `strict` is reserved, and persisted config belongs to `setup-freeflow`.

## Skill Change

Updated `output-router` to include concise action guidance for:

- `query`;
- `locate`;
- `retrieve`;
- `expand`;
- `explain`.

Updated config guidance to list supported keys and preserve current defaults:

- built-in defaults require no repo config;
- `postToolRouting` stays `off` unless explicitly configured;
- minimal setup stays only `defaultMode`;
- do not dump defaults or create empty `outputRouter`;
- `generatedPaths` affects broad scans only;
- mode changes must not enable post-tool routing.

## Verification

Commands:

```sh
jq empty evals/registries/fixture-evals.json evals/registries/skill-evidence.json
evals/scripts/run-fixture-eval.sh OTR-001 --dry-run
evals/scripts/skill-evidence.sh output-router
evals/scripts/skill-evidence.sh --validate
```

Result: passed.

No model-run grade was recorded for this iteration; the artifact establishes the pressure case and registry coverage before the skill wording change.
