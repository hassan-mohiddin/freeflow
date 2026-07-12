# Planning Report Publication Plan

## Goal

Reject malformed planning reports without losing diagnostics.

## Phase 1

Use the existing shared `parsePlanningReport` parser and identity validator. Their behavior and tests are settled and unchanged.

1. Add parsing to each of the direct, parent-finish, and runtime adapters.
2. Have each adapter write raw input to the canonical report path.
3. Return `rejected` when parsing or identity checks fail.
4. Add one rejection test per adapter.

## Phase 2

After all adapters pass, decide whether rejected bytes should remain canonical or move to a diagnostic path. If needed, introduce a shared publication API then.

## Reviewer suggestion

Rename `report.raw` to `report-source.raw` for clarity while touching these files.
