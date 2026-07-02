# Output Router Skill Eval Report - Iteration 3

Date: 2026-07-02

## Scope

Added eval pressure for manual child/scout/reviewer/verifier panes using broad native commands for unknown-size output.

Owned paths:

- `skills/output-router/SKILL.md`
- `evals/prompts/otr-003.txt`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`

## Behavior Gap

Manual child runs still used native `bash` for broad or unknown-output searches. The desired behavior is guidance-first routing: Freeflow routed evidence is the default for broad repo/search/test/log/doc output, including broad `rg`, `find`, `git`, help/docs, generated-output, and session/eval-log scans.

Native `bash`/`read` remains valid only for known-small exact checks, cmux/Pi control probes, exact file reads, or explicit narrow fallback after a routed-source limitation.

## Eval Added

Added:

- `OTR-003`: child broad-scan routing pressure.

Expected behavior:

- answer directly without editing files;
- use `freeflow_search query` or `locate` first for repo evidence;
- use `freeflow_run` for intentionally broad or likely noisy shell producers;
- reject `head`, `sed`, or `tail` as making a broad producer known-small;
- keep native fallback narrow and explicit when Freeflow cannot access the source.

## Skill Change

Tightened `output-router` wording so child/scout/reviewer/verifier contexts use routed evidence first for broad evidence, named broad `rg`/`find`/`git`/help/docs scans as Freeflow-first, and preserved native tools for exact small checks, cmux/Pi probes, exact file reads, edits, or explicit routed-source fallbacks.

## Verification

Commands:

```sh
jq empty evals/registries/fixture-evals.json evals/registries/skill-evidence.json
evals/scripts/run-fixture-eval.sh OTR-003 --dry-run
evals/scripts/run-fixture-eval.sh OTR-002 --dry-run
evals/scripts/run-fixture-eval.sh CMD-016 --dry-run
evals/scripts/skill-evidence.sh output-router
evals/scripts/skill-evidence.sh --validate
evals/scripts/skill-evidence.sh output-router | grep -E 'OTR-003|CMD-016|OTR-00'
```

Result: passed.

No model-run grade is recorded in this report; the artifact preserves the regression pressure before future model grading.
