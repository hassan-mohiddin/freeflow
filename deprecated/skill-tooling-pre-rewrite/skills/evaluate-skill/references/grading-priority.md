# Grading Priority

Use the strongest available evidence:

1. Filesystem state, before/after manifests, diff, created/deleted paths, and git state.
2. Command output, exit codes, structured events, tool calls, logs, traces, and saved reports.
3. Final response.
4. Full transcript when the earlier surfaces cannot explain the result.
5. Agent self-assessment.

Lower-priority evidence cannot repair a contradiction above it.

## Deterministic First

Use mechanical checks for paths, content, JSON fields, frontmatter, line counts, events, activation reads, exit status, usage, and protocol fields.

Use fresh model or human judgment for reasoning quality, user-authority preservation, architectural fitness, recommendation quality, and semantic completeness.

Semantic grading cannot turn a failed objective assertion into a pass.

## Evidence Labels

Record unavailable fields explicitly. Do not convert missing cost to zero, injected wording to native activation, or a one-shot conversation to multi-turn proof.
