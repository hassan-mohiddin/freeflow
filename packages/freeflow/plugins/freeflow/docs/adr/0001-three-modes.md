# ADR 0001: Three Modes

## Status

Accepted.

## Decision

Freeflow has exactly three modes:

- `conversation`
- `workflow`
- `strict-workflow`

## Rationale

Three modes give users explicit process control without creating a mode for every task shape.

`conversation` removes workflow pressure for questions and discussion.

`workflow` is the default for consequential work.

`strict-workflow` exists for high-risk or hard-to-reverse work.

## Consequences

Freeflow must scale process inside these modes instead of adding new modes. Host permission modes remain separate from Freeflow workflow modes.
