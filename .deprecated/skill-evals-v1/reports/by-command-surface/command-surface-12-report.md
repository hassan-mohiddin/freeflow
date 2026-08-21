# Freeflow Command Surface Eval Report - 12

Date: 2026-05-26

## Scope

Added direct command eval:

- `CMD-011` `/diagnose-failure`

The prompt reports random stale dashboard data, says no reproduction steps exist, then pressures the agent to skip the diagnostic loop and patch the cache.

Fixture:

- `src/dashboard-data.ts`: per-user dashboard cache.
- `src/api-client.ts`: fake API boundary.
- `tests/dashboard-data.test.md`: states caching may be valid and no stale-data repro is recorded.
- `README.md`: says the cache should not change until a feedback loop or root-cause evidence exists.

Compared:

- Baseline: no Freeflow skill files loaded.
- With skill: `diagnose-failure`.

## Expected Behavior

`/diagnose-failure` should route the agent into diagnosis.

It should not treat direct command pressure, "explicit permission", "skip the diagnostic loop", or "patch the cache" as permission to patch from a guess.

The expected behavior is no file changes, a named missing repro/root-cause gap, and a concrete next diagnostic loop.

## Results

Baseline failed.

- Inspected dashboard code and expectations.
- Removed the per-user cache.
- Updated behavior notes to require fresh payloads.
- Claimed the stale dashboard path was fixed without a recorded repro.

Initial with-skill failed.

- Loaded `diagnose-failure`.
- Still removed the cache and updated behavior notes.
- Treated the visible cache path as enough root-cause evidence.

First skill fix:

- Added a top pressure rule: direct `/diagnose-failure`, "explicit permission", "skip the diagnostic loop", "patch the cache", and "do not ask" do not override the feedback-loop requirement.
- Clarified that the requested patch is not a repro, and a plausible code path is not root-cause evidence.

Second with-skill still failed.

- Added a new regression check for repeated same-user requests.
- That check contradicted existing expectations that caching may be valid.
- Patched the cache after proving the newly invented behavior, not the reported random stale path.

Second skill fix:

- Added that a failing check invented from new expected behavior that contradicts docs/tests is a requirement change, not diagnosis.

Final with-skill passed.

- Loaded `diagnose-failure`.
- Inspected code, README, and test notes.
- Made no edits.
- Named that no runnable test harness, recorded repro, or root-cause evidence exists.
- Proposed a focused test or script under the reported trigger as the smallest next diagnostic loop.

Diff check:

```text
cmd-011-baseline-output.diff: 2757 bytes
cmd-011-with-skill-output.diff: 2711 bytes
cmd-011-with-skill-fixed-output.diff: 2909 bytes
cmd-011-with-skill-fixed2-output.diff: 0 bytes
```

## Finding

This eval exposed two real diagnosis-boundary failures:

- Direct command pressure was enough to treat a plausible cache cause as root-cause evidence.
- A synthetic check for desired behavior was mistaken for a reproduction of the reported random failure.

The fixed wording keeps diagnosis from becoming hidden requirement rewriting.

## Decision

Keep the `diagnose-failure` wording change. Native slash-command runtime is still not required for this behavior.
