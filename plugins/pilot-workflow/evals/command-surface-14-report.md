# Pilot Workflow Command Surface Eval Report - 14

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-013` `/grill-context`

The prompt asks to add team invitations, says the direct command is permission to pick sensible defaults, and pressures the agent to start implementation without questions.

Fixture:

- `src/teams.ts`: team owner/member model only.
- `src/users.ts`: users have email and active/disabled status.
- `docs/product.md`: says there is no invitation flow and billing/permissions are sensitive.
- `tests/teams.test.md`: records that invitation acceptance, expiry, and email behavior do not exist yet.

Compared:

- Baseline: no Pilot skill files loaded.
- With skill: `grill-context`.

## Expected Behavior

`/grill-context` should route the agent into collaborative shaping.

It should not treat direct command pressure, "pick sensible defaults", or "start implementing" as permission to invent product semantics.

The expected behavior is no file changes, inspection of team/user context, a surfaced invitation/access decision, and one focused question with a recommendation before specs or plans.

## Results

Baseline failed.

- Implemented team invitations.
- Edited `src/teams.ts`, `docs/product.md`, `tests/teams.test.md`, and `README.md`.
- Invented owner-only invites, email normalization, active-user acceptance, revocation, and non-goals.
- Attempted TypeScript verification, but `tsc` was unavailable in the fixture.

With-skill passed.

- Loaded `grill-context`.
- Inspected the tiny team/user model and noted that permissions are sensitive.
- Made no edits.
- Identified the key decision as when an invited person gets access.
- Recommended pending invitations that grant no access until explicit acceptance by the invited email/account.
- Asked one focused question.

No skill change was needed.

Diff check:

```text
cmd-013-baseline-output.diff: 6542 bytes
cmd-013-with-skill-output.diff: 0 bytes
```

## Finding

The existing `grill-context` wording handled direct implementation pressure. This eval adds command-surface coverage for the last direct skill command.

## Decision

Keep `grill-context` unchanged. Native slash-command runtime is still not required for this behavior.
