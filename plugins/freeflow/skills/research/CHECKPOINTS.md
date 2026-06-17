# Research Checkpoints

A checkpoint is the output of research. It preserves the current understanding and names the next route.

Research does not end by silently writing a spec, plan, or implementation.

## Chat Or Artifact

Keep the checkpoint in chat when the work is short-lived and the next turn can safely continue from conversation context.

Save the checkpoint when it must guide later work, another agent, a future session, or a durable artifact.

Use the narrowest owning artifact:

- Spec: behavior, scope, requirements, acceptance, product decisions.
- Plan: future implementation path and checks.
- Handoff: immediate continuation state.
- Decision note or ADR: durable tradeoff or rejected approach.
- Domain memory: stable term or domain meaning.
- Research note: evidence summary that must be reused before requirements are settled.

If no clear destination exists, ask before writing.

## Shape

Use this shape. Omit sections that do not apply.

```text
Question / goal: ...
Evidence: ...
Current understanding: ...
Settled: ...
Tentative: ...
Open: ...
Recommendation: ...
Next: Forward | Backward | Branch | Stop — ...
```

## Good Checkpoints

A good checkpoint:

- Links or names live evidence instead of copying volatile inventory.
- Separates settled facts from tentative assumptions.
- Names open decisions that change the next route.
- Recommends the next route without treating it as permission.
- Avoids hiding user-owned decisions in polished prose.

## Bad Checkpoints

Bad:

```text
We discussed a lot. I'll implement the recommended path.
```

because it skips settled/tentative/open state and jumps to action.

Bad:

```text
Decision: create docs/decisions/ and record everything.
```

when the repo has no decision-note convention and the user has not chosen that destination.

Good:

```text
Settled: RiskReview is manual today; $500+ invoices enter review.
Tentative: retry scheduling should assist support, not replace review.
Open: should this be support-assistive or fully automated?
Next: Backward — answer the automation-scope decision before spec.
```
