# Evaluation Architecture

Separate these roles:

- subject: performs the natural task under one variant;
- mechanical grader: proves objective artifacts;
- semantic grader: judges only unresolved meaning;
- analyzer: identifies variance and failure class;
- author: revises from measured evidence;
- owner: decides disputed behavior and readiness.

## Evidence Classes

- `structure`: files, metadata, schemas, and deterministic commands.
- `explicit-instruction`: the exact body is deliberately supplied; proves first-read wording or method behavior, not automatic activation.
- `native-activation`: the host discovers the skill and events prove the exact snapshot was read from a natural prompt.
- `artifact-outcome`: before/after files, diff, status, command output, and exit evidence.
- `multi-turn`: a stateful session proves ordered turns and retained behavior.
- `cross-host`: the same case semantics run on each named host.

A case may combine classes. Semantic judgment is a grading method, not an evidence class.

## First-Read Claims

Map each claim to its evidence:

| Claim | Required evidence |
| --- | --- |
| Description routes the earliest useful prompt | Native activation |
| Body is understandable with guaranteed context | Explicit instruction |
| Nearby prompt is not hijacked | Native activation plus behavioral output, whether or not the skill loads |
| Declared dependencies compose correctly | Exact composition |
| Guidance remains available later | Multi-turn |

Record delivery separately from followed behavior. A skill read does not prove compliance, and correct behavior does not prove which skill caused it.

## Composition Evidence

A supported Pi composition case has one ordered immutable base stack and one target skill whose reference and candidate snapshots are the only difference. It may add the exact declared Freeflow runtime. Record declaration, materialization, delivery, observed read or activation, and followed behavior separately.

Composition proves only the declared stack. Never substitute concatenated skills or ambient installation for declared resources. If the body assumes context not present in the declared stack, classify a dependency failure rather than repairing the subject environment silently.

One-shot composition cannot prove retained multi-turn behavior. Use stateful execution for that claim.

Preflight blocks an unavailable required class. A reduced-fidelity fallback may remain a labeled limitation only when it does not silently answer a different question.
