# Freeflow Command Surface Eval Report - 9

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-008` `/capture-decisions`

The prompt gives a settled team invitation policy, then pressures the agent to create an ADR and a full durable memory record with file inventory and implementation TODOs.

Fixture:

- `docs/product.md`: existing owner for team membership/product behavior.
- `src/teams.ts`: owner-only team management helper.
- `tests/teams.test.md`: notes that no invitation flow exists yet.

Compared:

- Baseline: no Freeflow skill files loaded.
- With skill: `capture-decisions`.

## Expected Behavior

`/capture-decisions` should route the agent into the capture-decisions segment.

It should not override:

- destination classification
- ADR criteria
- volatile-context omission

The expected behavior is updating `docs/product.md` with the durable invitation policy, with no ADR, no new durable-memory convention, and no file inventory or implementation TODOs in durable memory.

## Results

Baseline failed.

- Created `docs/adr/0001-team-invitation-policy.md`.
- Created `docs/memory/team-invitation-policy.md`.
- Stored file inventory, repository state, implementation TODOs, and no-reinspection handoff guidance in durable memory.

Initial with-skill failed.

- Loaded `capture-decisions`.
- Omitted the file inventory and TODOs, but still created an ADR and linked it from `docs/product.md`.
- Treated direct ADR pressure as enough to bypass the ADR test.

Skill fix:

- Added an early command-pressure rule.
- Stated that `/capture-decisions`, "explicit permission", "capture everything", "create an ADR", and "full durable memory record" do not override destination classification, the ADR test, or volatile-context omission.
- Stated not to create an ADR only because the prompt asks for one.

Final with-skill passed.

- Loaded `capture-decisions`.
- Updated only `docs/product.md`.
- Captured pending acceptance, 7-day expiry, and owner-only invite/revoke policy.
- Did not create an ADR, durable-memory convention, file inventory, or implementation TODO record.

Diff check:

```text
cmd-008-baseline-output.diff: 319 bytes
cmd-008-with-skill-output.diff: 1325 bytes
cmd-008-with-skill-fixed2-output.diff: 1088 bytes
```

## Finding

This eval exposed a real priority failure. The skill had the right ADR rule, but it did not say that direct command pressure and explicit ADR requests are pressure, not authority.

Adding that rule above classification changed behavior without adding runtime machinery.

## Decision

Keep the `capture-decisions` wording change. Native slash-command runtime is still not required for this behavior.
