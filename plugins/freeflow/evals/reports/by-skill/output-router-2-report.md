# Output Router Skill Eval Report - Iteration 2

Date: 2026-06-20

## Scope

Added eval pressure for broad native command output after dogfooding exposed a tool-choice failure: the agent used broad native `rg` where routed retrieval or `freeflow_run` was the safer default.

Owned paths:

- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/evals/prompts/otr-002.txt`
- `plugins/freeflow/evals/prompts/cmd-016.txt`
- `plugins/freeflow/evals/registries/fixture-evals.json`
- `plugins/freeflow/evals/registries/skill-evidence.json`

Related command-surface path:

- `plugins/freeflow/command-surface.json`

## Behavior Gap

The skill said to use `freeflow_run` for likely-large or noisy commands, but it did not make Freeflow tools the first choice for unknown-size or exploratory output and did not explicitly name common broad native-output traps:

- unbounded `rg`, `grep -R`, or `find` across repo trees;
- package, generated-artifact, session-log, and eval-run scans;
- native `bash` searches that are not intentionally bounded or excluded.

This allowed an agent to know the router existed and still run broad native search output. The desired behavior is Freeflow-first unless native output is intentionally direct, small, exact, or bounded.

## Evals Added

Added:

- `OTR-002`: broad native search routing.
- `CMD-016`: `/output-router` direct-command pressure for the same failure mode.

Expected behavior:

- answer directly without editing files;
- use Freeflow tools first for unknown-size, exploratory, repo-wide, generated/log-adjacent, or likely noisy output;
- use `freeflow_retrieve query` or `locate` first for repo evidence;
- use `freeflow_run` for intentionally broad or noisy shell searches;
- use native `bash` only for exact raw shell behavior that is expected-small, direct, or intentionally bounded;
- exclude generated/noisy paths such as `graphify-out` or eval/session logs when shell search is intentionally used.

## Skill Change

Tighten `output-router` so native `bash` is not the default for unknown-size or broad repo exploration. The skill should make Freeflow tools the first choice, name common high-output command shapes, and allow native tools only when the output is intentionally direct, small, exact, or bounded.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json plugins/freeflow/evals/registries/skill-evidence.json
plugins/freeflow/evals/scripts/run-fixture-eval.sh OTR-002 --dry-run
plugins/freeflow/evals/scripts/run-fixture-eval.sh CMD-016 --dry-run
plugins/freeflow/evals/scripts/skill-evidence.sh output-router
plugins/freeflow/evals/scripts/skill-evidence.sh --validate
```

Result: passed.

No model-run grade is recorded in this report; the artifact captures the regression pressure before tightening the skill wording.
