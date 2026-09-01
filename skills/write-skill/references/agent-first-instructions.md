# Agent-First Instructions

Read this when a concrete first-read or retained-use failure involves wording, placement, undeclared context, author explanation, or competing instructions.

## Reconstruct The Reader’s Context

Assume the agent is seeing the skill for the first time.

- State the job before local vocabulary.
- Define terms before relying on them.
- Assume only guaranteed runtime or declared base context.
- Do not rely on an optional sibling, reference, common route, or accidental earlier read.
- Make required reads explicit before their content is used.
- Do not assume the skill will be reread before later use.

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
- protects a likely or observed failure boundary;
- states an evidence, return, or stop condition;
- makes a dependency executable;
- provides a compact example resolving likely misclassification.

Translate rationale into a direct rule plus only the why needed to generalize.

Translate debate into the selected boundary and stop condition.

Translate a measured failure into the smallest transferable guard that prevents it.

Omit rejected drafts, conversation history, fixture narration, evaluation status, and explanation whose only audience is the author.

## Strengthen Rules

A useful rule names:

```text
observable trigger or pressure
-> required or forbidden action
-> evidence, return, or stop condition
```

Prefer:

> If saved evidence already answers the fixed question, inspect it before proposing a rerun.

Over:

> Keep evaluation efficient and aligned with best practices.

Concrete rules reduce the judgment the agent must reconstruct.

## Pair Negative Rules With The Route

Bad:

> Do not recreate the old worker/verifier architecture.

Better:

> The producing activity handles implementation and verification. The surrounding workflow may select independent review.

Bad:

> Do not implement the recommendation.

Better:

> Return the recommendation to the owning workflow. Implementation requires separate authorization.

A negative rule may preserve an invariant directly when the positive route is already clear:

> Preserve the accepted scope. Do not split it into MVP or roadmap phases without approval.

## Fix Placement Before Adding Prose

Put a rule where the agent first makes the affected choice.

A late caveat rarely defeats an early command. Move or sharpen the controlling sentence before adding another section.

When an early rule and later exception conflict, restructure the route rather than adding another disclaimer.

## Repeat Local Guards Deliberately

Repeat a shared rule only when local presence protects:

- an independently activated path;
- a distinct decision point;
- retained behavior;
- context-loss recovery;
- a dangerous literal interpretation;
- a measured failure.

Keep one canonical owner for the full definition or method. Repeat only the compact local guard needed at the choice.

> Repeat the behavioral invariant, not the owning method.

Do not copy complete orchestration, authority, review, or task-memory sections into every consumer.

## End The Skill’s Influence

A skill body may remain in context after its immediate method ends.

State stop, return, or exit conditions clearly enough that retained instructions do not continue claiming ownership or broadening later work.

A first-turn exit is insufficient when later turns still show method hijacking.

After editing, rerun the same first-read and retained-use pressure while keeping unrelated rules stable.
