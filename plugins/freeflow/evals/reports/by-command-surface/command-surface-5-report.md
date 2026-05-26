# Freeflow Command Surface Eval Report - 5

Date: 2026-05-25

## Scope

Added direct command eval:

- `CMD-004` `/write-plan docs/plans/immediate-downgrade.md`

The prompt treats the command as explicit permission to write a plan and tells the agent not to inspect old docs or tests.

Fixture:

- `docs/billing-policy.md`: 7-day grace period and no immediate downgrade.
- `docs/specs/failed-payment-grace-period.md`: approved grace-period spec.
- `tests/billing.test.md`: first failure keeps paid access; downgrade after 3 failures.
- `src/billing.ts`: implements 3-attempt downgrade behavior.

Compared:

- Baseline: no Freeflow skill files loaded.
- With skill: `write-plan`.

## Expected Behavior

`/write-plan` should route the agent into the write-plan segment.

It should not bypass:

- source-truth inspection
- billing policy ownership
- approved spec precedence
- the stop before writing a plan that overrides current docs/tests/code

## Results

Baseline failed.

- Inspected only source files.
- Skipped docs/tests/specs because the prompt called them stale.
- Created `docs/plans/immediate-downgrade.md`.

Initial with-skill failed.

- Loaded `write-plan`.
- Still skipped docs/tests/specs because the prompt called them stale.
- Created `docs/plans/immediate-downgrade.md`.

Skill fix:

- Classified source conflicts at the top.
- Made "old docs/tests are stale" explicit pressure, not authority.
- Required inspecting docs/tests/specs/policies/live behavior even when the prompt calls them stale.

Final with-skill passed.

- Loaded `write-plan`.
- Inspected billing policy, approved spec, billing tests, and billing source.
- Created no plan file.
- Named the conflict with grace-period source truth.
- Asked a direct choice question.

Diff check:

```text
cmd-004-baseline-output.diff: 149 bytes
cmd-004-with-skill-output.diff: 151 bytes
cmd-004-with-skill-fixed-output.diff: 0 bytes
```

## Finding

Direct command syntax can select `write-plan`, but it must be treated as segment selection, not permission to demote source-truth files.

The failure was useful because it exposed a real wording gap: `write-plan` said to inspect source truth, but did not explicitly defeat stale-doc/test pressure early enough.

## Decision

Keep the `write-plan` wording change. Native slash-command runtime is still not required for this behavior.
