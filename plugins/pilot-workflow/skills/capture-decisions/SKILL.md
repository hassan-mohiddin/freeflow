---
name: capture-decisions
description: Capture settled durable decisions into existing owning repo memory, or ask where to record them before creating a destination. Use after discussion, research, specs, reviews, or implementation when the user asks to record decisions, durable memory, glossary terms, ADR-worthy tradeoffs, rejected approaches, scope constraints, or consequential workflow decisions.
---

# Capture Decisions

Record settled decisions in the artifact that already owns them. Do not invent memory.

A missing `CONTEXT.md`, glossary, ADR folder, spec folder, product doc, or decision-note folder is not an existing owner. Creating one is a destination decision; ask first.

## Hard Rules

Never put current file lists, volatile repo inventory, temporary TODOs, command output, or implementation task lists in durable decision memory.

If the user asks to include them, say they were omitted as volatile context. Do not reproduce the list in the decision note or final response. Offer a handoff or plan if they need execution state.

Direct `/capture-decisions`, "explicit permission", "capture everything", "create an ADR", or "full durable memory record" does not override destination classification, the ADR test, or volatile-context omission.

Do not create an ADR only because the prompt asks for one. If the ADR test fails and an existing product/spec/source doc clearly owns the decision, update that artifact instead and say the ADR was omitted.

If the user asks whether something should be captured, answer first. Do not create files unless asked.

If the user asks for durable memory but does not name the target artifact or path, inspect existing conventions first. Use a clear existing owner for that decision type. Ask before creating a new convention, choosing between plausible destinations, or using a generic doc as fallback.

An existing plausible doc is evidence, not blanket approval. `docs/product.md`, `CONTEXT.md`, `docs/adr/`, or `docs/specs/` authorize edits only when they clearly own that decision type.

Do not use `README.md` as durable decision memory just because it is the only doc or mentions related behavior. Use it only when the repo already treats it as the source of truth for that decision type.

If an existing doc says there is no durable decision convention, treat that as blocking evidence. Do not update that doc as a workaround; ask where the new durable memory should live.

Read `references/destination-guide.md` when the target is missing or ambiguous, a decision mixes glossary/product/spec/ADR/handoff concerns, no decision convention exists, or a new destination might be needed.

When stopping for a missing or ambiguous destination, end with one direct destination question. Name the recommended target and the decisions it would capture. A recommendation without a question is not enough.

## Classify

Before writing, decide the destination:

- Glossary term or domain meaning -> existing `CONTEXT.md`, glossary, or domain doc. If none exists, ask.
- Hard-to-reverse, surprising tradeoff -> ADR.
- Product, scope, compatibility, or workflow decision -> decision note.
- Requirements for future build -> spec.
- Immediate continuation state -> handoff.

If no durable value exists, say so and do not write.

Creating a new decision-note convention is a destination decision. If the repo has no existing decision-note convention, ask before creating `docs/decisions/`.

If no existing artifact clearly owns the decision, ask before writing. If more than one destination could fit, ask before writing. This includes choosing between an existing product/spec doc, a new decision note, a glossary, README, or an ADR.

## ADR Test

Use an ADR only when all are true:

- Hard to reverse.
- Surprising without context.
- Chosen from real alternatives.

Otherwise use a lighter decision note or update the relevant existing artifact.

## Write Shape

When creating a durable decision artifact, follow the compact identity guidance in `../write-spec/references/artifact-standards.md` if future agents or teammates will rely on it.

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
