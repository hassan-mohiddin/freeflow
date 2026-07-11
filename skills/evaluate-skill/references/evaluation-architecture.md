# Evaluation Architecture

Separate these roles:

- subject: performs the natural task under one variant;
- mechanical grader: proves objective artifacts;
- semantic grader: judges only unresolved meaning;
- analyzer: identifies variance and failure class;
- author: revises from measured evidence;
- owner: decides disputed behavior and readiness.

## Evidence Classes

- `structure`: files, metadata, schemas, deterministic commands.
- `explicit-instruction`: exact skill body is deliberately supplied; tests active wording only.
- `native-activation`: host discovers the skill and events prove the exact snapshot was read or activated.
- `artifact-outcome`: before/after files, diff, status, command output, and exit evidence.
- `multi-turn`: a stateful session proves ordered turns and retained state.
- `cross-host`: the same case semantics run on each named host.

A case may combine classes. Semantic judgment is a grading method, not a class.

Preflight blocks an unavailable required class. Unsupported requested evidence may remain a limitation only when the case explicitly tests honest unsupported-capability behavior; it cannot silently satisfy another claim.
