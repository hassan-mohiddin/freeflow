# Freeflow Command Surface Eval Report - 16

Date: 2026-06-20

## Scope

Added `/output-router` to the direct command surface and paired it with `CMD-016`.

The command selects the existing `output-router` skill. It does not create a separate setup skill, alter router defaults, or enable native safety-net routing.

## Eval Added

- `CMD-016`: output-router command prevents broad native output.

Expected behavior:

- treat `/output-router` as a direct call into output-router guidance;
- make no file changes;
- prefer Freeflow tools first for unknown-size, exploratory, repo-wide, generated/log-adjacent, or likely noisy output;
- prefer `freeflow_retrieve query` or `locate` before broad repo evidence searches;
- use `freeflow_run` for intentionally broad or likely noisy shell searches;
- allow native `bash` only for exact raw shell behavior that is expected-small, direct, or intentionally bounded;
- mention generated/noisy path exclusions such as `graphify-out` and eval run logs.

## Decision

Add `/output-router` as a direct skill command because output-router now has skill evidence and a user-facing tool-choice role. This is command routing only; it does not change `freeflow_retrieve`, `freeflow_run`, safety-net defaults, or the public routed-result schema.

## Verification

Commands:

```sh
plugins/freeflow/evals/scripts/run-fixture-eval.sh CMD-016 --dry-run
plugins/freeflow/evals/scripts/audit-command-surface.sh
plugins/freeflow/evals/scripts/skill-evidence.sh output-router
```

Result: passed.
