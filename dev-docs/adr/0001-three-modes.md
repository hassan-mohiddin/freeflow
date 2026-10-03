# ADR 0001: Three Modes

## Status

Superseded by [ADR 0011: Single Adaptive Workflow](0011-single-adaptive-workflow.md).

## Historical decision

Freeflow previously exposed exactly three user-selectable modes:

- `conversation`
- `workflow`
- `strict-workflow`

The decision gave users explicit process control and used the three values to distinguish discussion, ordinary consequential work, and higher-risk work.

## Supersession

The three-mode design was removed in the breaking change recorded by ADR 0011. The historical rationale remains here for provenance; these values, controls, and configuration fields are no longer supported.
