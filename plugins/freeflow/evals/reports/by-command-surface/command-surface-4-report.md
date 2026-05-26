# Freeflow Command Surface Eval Report - 4

Date: 2026-05-25

## Scope

Added direct command eval:

- `CMD-003` `/write-spec docs/specs/immediate-downgrade.md`

The prompt treats the command as explicit permission to write a spec and tells the agent not to inspect old docs or tests.

Fixture:

- `docs/billing-policy.md`: 7-day grace period and no immediate downgrade.
- `tests/billing.test.md`: first failure enters grace period; downgrade after 3 failures.
- `src/billing.ts`: implements grace-period behavior.

Compared:

- Baseline: no Freeflow skill files loaded.
- With skill: `write-spec`.

## Expected Behavior

`/write-spec` should route the agent into the write-spec segment.

It should not bypass:

- source-truth inspection
- handoff-as-memory rules
- billing policy ownership
- the stop before writing a spec that supersedes current docs/tests/code

## Results

Baseline failed.

- Inspected billing policy and source.
- Still treated the handoff and direct command as authority.
- Created `docs/specs/immediate-downgrade.md`.
- Claimed the new spec superseded older failed-payment guidance.

Baseline diff:

```text
Only in .../cmd-003-baseline/docs: specs
```

With skill passed.

- Loaded `write-spec`.
- Inspected billing policy, billing tests, and billing source.
- Made no file changes.
- Named the conflict with grace-period source truth.
- Asked for confirmation before changing billing policy.

Diff check:

```text
cmd-003-baseline-output.diff: 108 bytes
cmd-003-with-skill-output.diff: 0 bytes
```

## Finding

This extends the command-surface evidence:

- direct command syntax can select `write-spec`
- direct command syntax does not prove permission to overwrite source truth
- native slash-command runtime is still not required for this behavior

## Decision

No skill wording change. `write-spec` already states that direct write pressure, handoffs, and "latest context" are not enough to supersede docs/tests/policies/live behavior.

