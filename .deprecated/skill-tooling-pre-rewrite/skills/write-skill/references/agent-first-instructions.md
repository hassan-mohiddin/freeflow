# Agent-First Instructions

Write for the executing agent at the moment it must choose.

## First-Read Context

Assume the agent is seeing this skill for the first time.

- State the job before introducing local vocabulary.
- Define terms before relying on them.
- Assume only context guaranteed by the declared runtime or base stack.
- Do not rely on an optional sibling skill, reference, or accidental earlier read.
- Keep the normal path usable from the active body alone.

First-read does not mean dependency-free. It means dependencies are declared, delivered, and ordered:

```text
guaranteed base context
-> skill description
-> SKILL.md
-> conditional references or scripts
```

A later layer may rely on language established by an earlier guaranteed layer, not the reverse.

## Translate Author Context

Authoring may require long discussion, comparisons, and explanation. The executing agent does not need that history.

Keep a sentence only when it:

- changes an action or judgment;
- defines language required for the method;
- protects a likely failure boundary;
- states an evidence, exit, or stop condition;
- provides a compact example that resolves a likely misclassification.

Translate rationale into a direct rule plus only the why needed to generalize safely. Translate debate into the selected boundary and its stop condition. Omit rejected drafts, conversational framing, and explanation whose only audience is the author or collaborator.

## Strong Rules

A useful rule names:

- the observable trigger or pressure;
- the required or forbidden action;
- the evidence, exit, or stop condition.

Prefer:

> If the existing eval already preserves the failure and criteria, reuse it unchanged.

Over:

> Ensure the evaluation workflow remains efficient and aligned with best practices.

## Negative Instructions

Negative rules are highly salient. Use them at real failure boundaries, not to preserve authoring history.

Imports a rejected design the reader does not know:

```text
Bad:
Do not recreate the old worker/verifier architecture.

Better:
The active agent owns implementation and verification.
Workflow selects optional independent review.
```

Forbids an action without stating the route:

```text
Bad:
Do not go and implement the recommended design.

Better:
Return the recommendation to Workflow.
Implementation requires an authorized Execute Work slice.
```

A justified negative paired with the invariant:

```text
Preserve the accepted scope.
Do not split it into MVP, v1/v2, or roadmap phases without approval.
```

## Placement

Put a rule where the agent first makes the affected choice. Lead with the skill’s job and the hard constraints that must defeat normal execution. Keep convenience and style later.

A late caveat rarely defeats an early command. Move or sharpen the controlling sentence before adding another section.

## Strategic Repetition

Use one canonical owner for shared policy. Repeat only the minimum reminder needed where omission causes a local failure. Do not copy a complete workflow into a method skill.

## Editing From Failure

- Name the failed behavior.
- Identify whether the failure came from activation, first-read understanding, dependency delivery, wording, placement, or a missing stop.
- Find the sentence or boundary that should have prevented it.
- Sharpen or move that pressure point.
- Keep unrelated rules stable.
- Re-test the same pressure.
