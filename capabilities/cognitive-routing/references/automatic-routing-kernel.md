# Automatic Routing Kernel

Read the current runtime state before routing. Under manual control, do not request profile switches; use the held profile and treat the automatic boundary questions only as efficiency guidance.

A **cognitive boundary** is one material uncertainty or judgment that standard should not resolve alone.

Under automatic control, standard Thinks and Acts by default. Reasoning always Thinks and receives task Act only through the gate below.

## Follow One Open-Boundary Loop

```text
Standard Thinks + Acts
-> if a NEW cognitive boundary appears
   -> SWITCH to Reasoning
-> if a closed boundary is invalidated
   -> REOPEN + SWITCH to Reasoning
-> Reasoning leads the OPEN boundary and Thinks
   -> narrow discriminating evidence needed
      -> OBSERVE -> reassess
   -> judgment and action inseparable
      -> ACT_BOUNDED -> reassess
   -> broad, mechanical, or token-heavy execution needs no material judgment
      -> DELEGATE bounded execution to Standard
      -> Standard works in shared visible context
      -> if a return condition occurs
         -> RETURN + SWITCH to Reasoning
         -> continue the same OPEN boundary
   -> governing judgment supported
      -> CLOSE + HANDOFF to Standard
   -> user decision or authority missing
      -> return to Workflow
```

DELEGATE and CLOSE + HANDOFF are control transitions, not Reasoning Act. DELEGATE preserves reasoning leadership of the open boundary; CLOSE + HANDOFF ends it. Do not optimize for few switches or many switches; each transition must transfer one meaningful execution or judgment unit.

## Switch From Standard At A Material Boundary

Continue in standard when work is clear, bounded, observable, reversible, and directly verifiable. Standard handles routine tool volume, known edits, accepted patterns, mechanical integration, builds, tests, and clear corrections outside a reasoning-led boundary.

Do not manufacture speculative or throwaway standard work merely to avoid reasoning Act. Perform each work unit once in standard when standard is reliably sufficient; otherwise switch before making the material judgment.

Switch when:

- materially different valid approaches remain;
- architecture, interfaces, ownership, or failure behavior remain unresolved;
- evidence invalidates an important assumption or closed-boundary handoff;
- a causal failure is unclear or repeats without convergence;
- difficult synthesis is itself consequential artifact work;
- an error could be latent, irreversible, or difficult to recover;
- an open delegation reaches a declared return condition;
- a selected reasoning review is due.

Classify why reasoning is needed:

- **NEW:** a material boundary appears;
- **REOPEN:** evidence or changed intent invalidates a closed boundary;
- **RETURN:** delegated execution reaches a return condition while the same boundary remains open.

Continue through local uncertainty when a wrong attempt is observable, reversible, and cheaply correctable. Do not switch merely because feedback arrived, the task is complex, or reasoning might perform routine work somewhat better.

For **NEW** or **REOPEN**, write only the boundary state reasoning needs:

```text
Reasoning Boundary
What changed:
Decisive evidence or pointer:
Why standard should not choose:
Judgment required:
```

For **RETURN**, keep the note to the delegated outcome or evidence pointer already present in shared context. Do not repeat task history.

## Gate Automatic Reasoning Act

The gate applies only when automatic reasoning proposes task Act. It permits two forms:

- **OBSERVE:** one narrow, discriminating evidence scope.
- **ACT_BOUNDED:** a rare cognition-coupled scope where judgment and action cannot be separated safely.

Before either form, ask:

1. What open cognitive boundary does this action advance?
2. Is the evidence or intervention necessary?
3. What is the smallest useful scope and stop condition?

OBSERVE passes only when the evidence question is narrow and discriminating, the scope contains the fewest tightly related calls needed to answer it, and direct observation is cheaper and clearer than a delegation round trip.

For **OBSERVE**, write:

```text
Reasoning observation: inspect <scope> to determine <question>; stop when <evidence boundary> is established.
```

OBSERVE is one narrow evidence scope, not one tool call. Stop when the evidence boundary is established. If the work becomes broad, repetitive, or exploratory, delegate it.

ACT_BOUNDED passes only when judgment and action are inseparable and:

```text
Expected loss from delegation
materially exceeds
Premium cost of reasoning action
```

Treat this as qualitative judgment, not a numeric score. Better performance alone does not pass the gate.

For **ACT_BOUNDED**, write:

```text
Reasoning Act
Why judgment and action are inseparable:
Scope:
Authority:
Stop and reassess when:
```

ACT_BOUNDED is rare. It may cover a focused implementation, diagnostic episode, or difficult artifact section only when delegation would recreate the judgment, lose causal continuity, or leave unsafe discretion. It never grants reasoning task Act for the whole boundary, adjacent integration, broad verification, or cleanup.

Each OBSERVE or ACT_BOUNDED scope expires at its declared boundary and returns reasoning to Think. A prior scope never authorizes the next one.

## Delegate Execution Without Transferring The Boundary

Delegation is the efficiency route for broad, mechanical, repetitive, or token-heavy execution that does not require material judgment. Reasoning retains leadership of the open boundary; standard performs the bounded work in the same shared context.

Reasoning may delegate after thinking alone, after OBSERVE, or after a separately justified ACT_BOUNDED scope. These remain one boundary, not nested sub-boundaries.

Before delegating, write:

```text
Execution scope:
Evidence required:
Stop and return when:
```

The contract leaves standard no material judgment or unsafe discretion. Standard may Think locally enough to execute it, but must not resolve the cognitive boundary, reinterpret the governing judgment, expand the scope, or hide contradictory and inconclusive evidence.

Because both profiles share visible context and tool history, standard does not produce a bulky handoff. It records the outcome or evidence pointer, then switches to reasoning when:

- expected evidence is available;
- execution fails;
- evidence is contradictory or inconclusive;
- the bounded execution scope ends.

This **RETURN** resumes the same open boundary; it does not reopen a closed one. Reasoning Thinks over the returned evidence and may Observe, Act boundedly, delegate again, close the boundary, or return a user or authority issue to Workflow.

## Close The Boundary And Hand Off

When the governing judgment is supported, reasoning closes the boundary and writes:

```text
Conclusion:
Important evidence and assumptions:
Bounded next action:
Verification:
Reopen reasoning when:
```

Then reasoning hands off to standard. Reasoning leadership ends, and standard owns continuation. `Reopen reasoning when` protects the conclusion from material new evidence, changed user intent, or an invalidated assumption; it does not preserve shadow reasoning ownership.

If a reopen condition occurs, standard uses **REOPEN + SWITCH**. This creates no new switch mechanism and does not retroactively make the closed-boundary handoff a delegation.

## Preserve Boundaries And Expire Scopes

A cognitive boundary may survive response endings, user turns, Pi settlement, compaction, resume, reload, or delegated execution. Its Act scope does not. After interruption or lifecycle resume, return to Think and reassess before acting again.

Preserve a still-supported open boundary through visible conclusions, evidence, assumptions, execution contracts, and return conditions; hidden reasoning does not transfer. If new user direction changes or makes the prior boundary irrelevant, revise or close it through Workflow rather than preserving it mechanically.

## Example: Bursty Delegated Evidence

Standard verifies a bounded security change, then switches to reasoning when review exposes a new failure boundary. Reasoning Thinks, uses one OBSERVE scope to inspect the decisive permission path, and finds that a complete permission matrix is needed but requires no material judgment.

Reasoning delegates the matrix. Standard runs it and records the evidence in shared context. The return condition occurs, so standard switches to reasoning with **RETURN**. If the correction itself is cognition-coupled, reasoning declares one rare ACT_BOUNDED scope, returns to Think, closes the supported boundary, and hands off routine verification to standard.

This is one active agent and one open boundary with bursty profile transitions—not separate agents, hidden orchestration, or nested sub-boundaries.
