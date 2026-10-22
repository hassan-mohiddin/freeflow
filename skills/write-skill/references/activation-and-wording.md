# Activation And Wording

This reference is judgment: adapt it to the skill's goal. Its binding statements restate [Write Skill](../SKILL.md) Rules.

Two failures look alike from outside: the skill is not read at the decision it should change, or it is read and its text does not steer the agent as written. Find which one the evidence shows before rewriting anything; a better body cannot fix a missed read, and a sharper description cannot fix a misleading body.

## Activation

A description should make the skill available at the earliest useful decision without requiring language introduced by the skill itself.

### Diagnose The First Read

Beyond the behavioral claim in Write Skill, identify:

- the earliest natural prompt or task state where the skill can change behavior;
- the consequence of missing or delaying the read;
- the consequence if a nearby prompt also loads the skill;
- how retained guidance should behave after the immediate method ends.

### Compare Activation Costs

False-positive and false-negative activation have different costs.

A false-positive read may be acceptable when:

- loading cost is proportionate;
- the body identifies that its method does not apply;
- it exits without changing ownership or route;
- retained instructions do not hijack later work.

A false negative is material when missing the first useful read causes:

- an irreversible or expensive action;
- a wrong owner or method;
- repeated low-value environment interactions;
- missing safety or evidence boundaries;
- later work that the skill cannot reliably undo.

Prefer recall when nearby reads are demonstrably safe and missed activation is materially worse. Tighten activation when early or retained guidance can distort ordinary work.

### Check The Cues

Beyond Write The Description For Recall, a cue names an observable distinction from neighboring jobs, and never rests on generic "help with" or "improve" language. Guaranteed base context may define a term; otherwise use plain observable language.

### Test Nearby And Retained Behavior

A nearby case can pass through:

- **Non-trigger:** the skill is not read.
- **Safe read:** the body loads, exits or defers correctly, and does not interfere later.

Test both the immediate response and later declared turns when retained influence matters.

Broad useful trigger:

> Use when committing work.

Over-specified trigger that hides the job:

> Use after final verification when a planned checkpoint requires a locally reviewable commit.

Broad safe-read trigger:

> Use when working with software design—especially boundaries, interfaces, ownership, state, and failure behavior.

The body must exit when the local interface remains sound and avoid turning later local choices into architecture work.

### Preserve The Evidence Boundary

Natural activation proves the host read the exact skill snapshot from a natural prompt. Explicit body delivery tests first-read instructions, not activation. Dependency composition tests exact declared skill and context order. Multi-turn evidence tests retained use. Artifact and transcript evidence show whether activation helped, exited safely, or hijacked behavior.

Preserve:

- the earliest useful positive prompt;
- at least one close nearby case;
- later-turn evidence when retained influence is part of the claim.

Do not infer one evidence class from another.

## Wording

### Translate Author Context

Keep a sentence only when it:

- changes an action or judgment;
- defines required language;
- protects a likely or observed failure boundary;
- states an evidence, return, or stop condition;
- makes a dependency executable;
- provides a compact example resolving likely misclassification.

Translate rationale into a direct instruction plus only the why needed to generalize. Translate debate into the selected boundary and stop condition. Translate a measured failure into the smallest transferable guard that prevents it. Omit rejected drafts, conversation history, fixture narration, evaluation status, and explanation whose only audience is the author.

### Make Instructions Concrete

A Rule gets concrete by naming its trigger, its action, and its stop. Prefer:

> If saved evidence already answers the fixed question, inspect it before proposing a rerun.

Over:

> Keep evaluation efficient and aligned with best practices.

Concrete Rules reduce the judgment the agent must reconstruct.

Judgment gets concrete differently: a sharper goal, clearer signals for deviating, and a realistic example on each side of the line. Turning judgment into an absolute makes it easier to follow and worse to follow. Prefer:

> Start a Slice for work that would leave partial state to reconcile if interrupted. An investigation across many sources can qualify; a discussion whose results land directly in the record usually does not.

Over:

> Start a Slice for every activity.

### Pair Negative Instructions With The Route

Bad:

> Do not recreate the old worker/verifier architecture.

Better:

> The producing activity handles implementation and verification. The surrounding workflow may select independent review.

Bad:

> Do not implement the recommendation.

Better:

> Return the recommendation to the owning workflow. Implementation requires separate authorization.

A negative instruction may preserve an invariant directly when the positive route is already clear:

> Preserve the accepted scope. Do not split it into MVP or roadmap phases without approval.

### Fix Placement Before Adding Prose

A late caveat rarely defeats an early command. Move or sharpen the controlling sentence before adding another section. When an early instruction and a later exception conflict, restructure the route rather than adding another disclaimer.

### End The Skill's Influence

A skill body may remain in context after its immediate method ends. State stop, return, or exit conditions clearly enough that retained instructions do not continue claiming ownership or broadening later work. A first-turn exit is insufficient when later turns still show method hijacking. After editing, rerun the same first-read and retained-use pressure while keeping unrelated instructions stable.
