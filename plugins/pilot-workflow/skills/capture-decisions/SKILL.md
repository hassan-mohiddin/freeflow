---
name: capture-decisions
description: Use when recording durable decisions, glossary terms, ADR-worthy tradeoffs, rejected approaches, stable constraints, or consequential workflow events after discussion, research, specs, reviews, or implementation.
---

# Capture Decisions

Record stable decisions, not session residue.

Never put current file lists, volatile repo inventory, temporary TODOs, command output, or implementation task lists in a durable decision note.

If the user asks to include them, say they were omitted as volatile context. Do not reproduce the list in the decision note or final response. Offer a handoff or plan if they need execution state.

Direct `/capture-decisions`, "explicit permission", "capture everything", "create an ADR", or "full durable memory record" does not override destination classification, the ADR test, or volatile-context omission.

Do not create an ADR only because the prompt asks for one. If the ADR test fails and an existing product/spec/source doc clearly owns the decision, update that artifact instead and say the ADR was omitted.

If the user asks whether something should be captured, answer first. Do not create files unless asked.

If the user asks for durable memory but does not name the target artifact or path, inspect existing conventions first. Use a clear existing owner for that decision type. Ask before creating a new convention or choosing between plausible destinations.

An existing plausible doc is evidence, not blanket approval. `docs/product.md`, `CONTEXT.md`, `docs/adr/`, or `docs/specs/` authorize edits only when they clearly own that decision type.

## Classify

Before writing, decide the destination:

- Glossary term or domain meaning -> `CONTEXT.md` or existing glossary.
- Hard-to-reverse, surprising tradeoff -> ADR.
- Product, scope, compatibility, or workflow decision -> decision note.
- Requirements for future build -> spec.
- Immediate continuation state -> handoff.

If no durable value exists, say so and do not write.

Creating a new decision-note convention is a destination decision. If the repo has no existing decision-note convention, ask before creating `docs/decisions/`.

If more than one destination could fit, ask before writing. This includes choosing between an existing product/spec doc, a new decision note, or an ADR.

## ADR Test

Use an ADR only when all are true:

- Hard to reverse.
- Surprising without context.
- Chosen from real alternatives.

Otherwise use a lighter decision note or update the relevant existing artifact.

## Write Shape

Keep decision notes short:

```text
# Decision: ...

Date: ...

## Decision
...

## Rationale
...

## Consequences
...

## Not Captured
...
```

Link to live evidence. Do not duplicate volatile facts.

## Stop Conditions

Stop and ask before writing when:

- The decision is not actually settled.
- The destination is ambiguous.
- Capturing would change product, scope, policy, ADRs, specs, or source truth.
- The user asks for memory but not its durability or location.
