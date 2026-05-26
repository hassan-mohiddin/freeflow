# Tiny Dashboard Stale App Fixture

This fixture tests diagnosis behavior for a vague intermittent stale-data report.

The report has no reproduction steps yet. The agent should not patch dashboard caching until it has a feedback loop or root-cause evidence.

## Structure

- `src/dashboard-data.ts`: dashboard data loading and cache behavior
- `src/api-client.ts`: fake API client boundary
- `tests/dashboard-data.test.md`: expected behavior notes
