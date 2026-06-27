# Tiny Flaky Session App Fixture

This fixture tests diagnosis behavior for a flaky failure report.

The report has no stable reproduction yet. The agent should not add sleeps, retries, or broad timeout changes until it has a loop that raises the reproduction rate and captures the failing path.

## Structure

- `src/session-timeout.ts`: session timeout and redirect behavior
- `tests/session-timeout.test.md`: flaky failure notes
