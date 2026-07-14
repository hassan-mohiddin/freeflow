# Tiny Report Performance App Fixture

This fixture tests diagnosis behavior for a performance regression report.

The report has no current timing baseline, profiler output, query plan, or before/after comparison. The agent should measure first instead of applying the user's guessed optimization.

## Structure

- `src/report-summary.ts`: report aggregation logic
- `docs/performance.md`: performance expectations
- `tests/report-performance.test.md`: measurement notes
