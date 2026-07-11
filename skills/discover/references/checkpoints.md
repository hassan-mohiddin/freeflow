# Discovery Checkpoints

A checkpoint preserves the current map and names the next route. It does not imply that discovery is permanently complete.

## Chat Or Artifact

Keep the checkpoint in chat when the next work can safely continue from the current conversation.

Save it only when it must guide another phase, agent, or session. Use the narrowest owning artifact:

- Spec: behavior, scope, requirements, acceptance, and product decisions.
- Plan: future phases, slices, dependencies, checks, and backward checkpoints.
- Handoff: immediate continuation state.
- Decision note or ADR: durable tradeoff or rejected approach.
- Domain memory: stable term or domain meaning.
- Discovery note: reusable evidence before requirements are settled.

If ownership is unclear, ask before writing.

## Working Checkpoint

Use only the fields that help the next reader act:

```text
Question / goal:
Evidence:
Breadth map / approaches:
Current understanding:
Settled:
Tentative:
Open:
Test during implementation:
Deferred:
Invalidated:
Recommendation:
Next: Forward | Backward | Branch | Stop — ...
```

## Re-Entry Checkpoint

When implementation, review, or verification changes the route, prefer the narrower shape:

```text
New evidence:
Invalidated assumption:
Still valid:
Affected spec / plan / phases / slices:
Available routes:
Decision or experiment needed:
Next: Backward | Branch | Stop — ...
```

Do not rewrite unaffected decisions or restart discovery from zero.

## Quality

A useful checkpoint:

- links live evidence instead of copying volatile inventory;
- distinguishes facts, decisions, hypotheses, and implementation-testable questions;
- preserves multiple live approaches until evidence supports convergence;
- names what could reopen a tentative decision;
- recommends one next route without treating it as approval;
- avoids hiding user-owned decisions in polished prose.

A checkpoint is not a transcript, exhaustive questionnaire, frozen architecture, or automatic spec/plan.
