# Agent-First Instructions

Read this when a concrete first-read failure involves wording, placement, undeclared context, or author explanation.

## Reconstruct The Reader’s Context

Assume the agent is seeing the skill for the first time.

- State the job before local vocabulary.
- Define terms before relying on them.
- Assume only guaranteed runtime or declared base context.
- Do not rely on an optional sibling, reference, or accidental earlier read.
- Make required reads explicit before their content is used.

Dependency direction remains:

```text
guaranteed base context
-> description
-> SKILL.md
-> required or conditional resources
```

A later layer may rely on language established by an earlier guaranteed layer, not the reverse.

## Translate Author Context

Keep a sentence only when it:

- changes an action or judgment;
- defines required language;
- protects a likely failure boundary;
- states an evidence, exit, or stop condition;
- provides a compact example that resolves a likely misclassification.

Translate rationale into a direct rule plus only the why needed to generalize. Translate debate into the selected boundary and stop condition. Omit rejected drafts, conversation history, and explanation whose only audience is the author.

## Strengthen Rules

A useful rule names:

- the observable trigger or pressure;
- the required or forbidden action;
- the evidence, exit, or stop condition.

Prefer:

> If saved evidence already answers the fixed question, inspect it before proposing a rerun.

Over:

> Keep evaluation efficient and aligned with best practices.

## Pair Negative Rules With The Route

```text
Bad:
Do not recreate the old worker/verifier architecture.

Better:
The active agent owns implementation and verification.
Workflow selects optional independent review.
```

```text
Bad:
Do not implement the recommendation.

Better:
Return the recommendation to Workflow.
Implementation requires authorized execution.
```

A negative rule may preserve an invariant directly:

```text
Preserve the accepted scope.
Do not split it into MVP or roadmap phases without approval.
```

## Fix Placement Before Adding Prose

Put a rule where the agent first makes the affected choice. A late caveat rarely defeats an early command. Move or sharpen the controlling sentence before adding another section.

Repeat shared policy only where a short local reminder prevents a real failure. Do not copy an owning workflow into a method skill.

After editing, rerun the same first-read pressure while keeping unrelated rules stable.
