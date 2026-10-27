# Design

Read this when a design choice could make later work wrong or harder, at the section the situation names: building on a representation, identity, ownership or algorithm choice that dependent work would redo if wrong, or writing one into a Spec, recommendation or delegation contract (Settle The Choices); a new or changed interface between parts, or choosing which part owns a decision (Interfaces); module cycles, layering, dependency direction, or extracting shared code (Modules And Dependencies); the same change keeps touching many places, or each fix adds another flag, state or caller rule (Pressure Signals); state that must survive a failure: partial effects, retries, concurrent writers, recovery (State And Failure).

This reference is judgment, with four Rules of its own below. It is a lens under the current activity, not a mandatory phase, an architecture owner, or permission to refactor. Read the section you need; the first three sections apply to all of them. Do not turn its lists into obligations unrelated to the accepted result.

Hide coherent, likely-changing decisions behind small, stable, outcome-level interfaces, so callers need less knowledge and coordination for the same accepted outcome. A module is anything with an interface and an implementation. Its interface includes every fact a caller needs for correct use: operations, decisions, inputs, state, ordering, effects, errors, dependencies, timing, and recovery. A module is **deep** when it provides much useful, coherent behavior per unit of caller knowledge; depth is not fewer methods or more responsibilities, and a god module hiding unrelated decisions is not deep.

## Rules

- A design recommendation is not implementation authority, and this lens never enlarges a task by itself.
- Never remove required correctness, trust, or safety to make a design smaller, and never turn hypothetical lifecycle completeness into a production requirement.
- Never design around an invented product or failure policy. When a boundary would settle a user-owned choice, as [Discuss Work](../../discuss-work/SKILL.md) defines it, take its concrete consequences and supported alternatives there.
- Do not invent APIs, files, or stronger guarantees to make a design look complete; name the missing observation or choice instead.

## Start With The Required Outcome

Goal: know whether the change touches a boundary worth designing, before designing anything.

Understand enough to state the caller's complete outcome, source-backed behavior and non-goals, the decisions the caller genuinely owns, accepted constraints, the current interface, dependencies, canonical state, and the relevant success and failure boundary. Do not begin from existing flags, storage paths, classes, or temporary states; they may be symptoms of the current design. Do not survey the whole system or settle future variations without a present question. Ask:

1. What outcome is changing?
2. What must callers currently know or coordinate?
3. Does the change spread policy, state, dependency choices, or lifecycle knowledge?
4. Would the current boundary make correct use or the next likely change materially harder?

For a local, source-backed, reversible change that leaves these boundaries sound, apply the lens silently and continue: generate no alternatives and add no abstraction because another shape is imaginable. A large mechanical change may need no design; a one-line change may need it when it changes permissions, public behavior, canonical state, or consequential failure semantics.

Once a boundary is supported, do not reopen it because this lens is still in context. Re-enter when evidence shows growing caller coordination, scattered policy, exposed internal states, fragile test choreography, unclear dependency or failure ownership, or an invalidated design assumption. Ordinary bugs, duplication, test awkwardness, finding count, and preference do not establish structural pressure. When failures repeat without a supported cause, [diagnose](diagnose.md) first; this lens consumes a structural finding rather than inventing one.

## Bound Success And Failure Proportionately

Goal: the failure behavior that matters is owned, and nothing more is built.

Before choosing classes, services, packages, flags, or states, name the caller and complete accepted outcome; caller-owned decisions and observable success and failure; the likely-changing coordination the module could hide; and the **failure unit**: what must succeed, fail, and recover as one coherent boundary, including whether partial reuse is required or merely an optimization. Where effects or partial state are consequential, establish the failure contract (observer, canonical and diagnostic state, forbidden outcomes, stop, degrade, fail or retry behavior, and supported recovery) with [State And Failure](#state-and-failure). Include cancellation, concurrency, or reconciliation only where required behavior or observed reachability makes them material.

Classify each proposed mechanism by what it is for: **trust** (knowing the result is valid), **safety** (preventing damage, leakage, or runaway behavior), **efficiency**, **scale**, or **portability**. Trust and safety cannot be deferred to simplify a design; efficiency, scale, and portability need an accepted requirement or observed pressure before they shape it. A module owning a failure unit does not automatically need durable replay, rollback, universal provenance, or every recovery mechanism.

## Settle The Choices

Goal: the choices that could change correctness, complexity or failure behavior, or force dependent work to be redone, are settled before that work starts; ordinary mechanics stay free.

Name the actual question, not a generic demand for more design. Deciding which occurrence identifies a source matters more than choosing a map or an array; deciding what survives a failed transfer matters more than choosing a retry helper. For each consequential unknown, take one route:

- **Evidence supports a mechanism:** select it and say why it fits.
- **An environmental fact is missing:** find the observation that distinguishes the alternatives before dependent work.
- **A user-owned choice is unsettled:** take it to Discuss Work.
- **Only ordinary mechanics remain:** leave them to implementation.

Make explicit only what the question needs:

- **Representation and identity:** domain objects and their independent lifetimes; what counts as the same occurrence; what must stay distinct.
- **Algorithm and cost:** the essential steps; collection keys and relationships; update and invalidation rules; work repeated as input grows. Naming a data structure without its keys, meaning, and maintenance rules is not useful direction.
- **Ownership, effects and modules:** the sections below.

When you pass a decision on to another implementer or your later context, give the decision, why it fits, the invariant it protects, the plausible wrong approach and the observation that tells them apart, and which parts are required versus local freedom. Do not prescribe every loop or helper, or reproduce the whole program in prose. Reuse design decisions already supplied the same way; a path to a design is not its content.

Weak and useful direction, for example:

- Weak: "Use a Map and avoid repeated scans." Useful: "Keep native occurrence IDs as source identity. Equal bodies may identify several candidates; do not merge their occurrences. Let the source owner maintain the result-to-exchange relationship, and rebuild affected indexes after ancestry replacement. Check repeated equal bodies, late attribution, and a branch change; measure the repeated preparation path rather than only an isolated lookup. Helper layout is local. Reconsider the index if the source does not provide the assumed stable identity."
- Weak: "Make persistence idempotent and robust." Useful: "The append owner distinguishes observed acknowledgment from an uncertain attempt; an equal entry in memory does not resolve an earlier failure. Validate before mutation; publish accepted state only at the supported acknowledgment boundary. Test append advancing memory then failing, followed by the identical operation: uncertainty must remain until supported reconciliation. Also test an acknowledged duplicate, so not every retry is rejected. Do not infer filesystem durability from readback."

When an unfamiliar boundary could invalidate substantial later work, build the first coherent path that can disagree with the design, often across several files and a failure case, before expanding dependent work; a skeleton, happy-path result, or green summary alone may not exercise the decision. Compare the actual ownership, identity, ordering, and failure behavior with the decision, not its suggested filenames or helpers. A precise sketch can be wrong: keep accepted behavior, stop dependent effects when the mechanism is invalidated, and settle the affected choice before continuing. Supported local corrections need no design restart.

## Interfaces

Goal: callers request outcomes; the module owns the protocol, with the smallest honest contract.

List only the facts callers must know that could affect the boundary: operations and inputs, caller-owned decisions, ordering and lifecycle states, configuration and provider details, dependencies, errors and failure semantics, compatibility and migration, and recovery, cost and performance expectations. For each, and before exposing any flag, path, state, ordering rule, retry, provider detail, or recovery step, ask whether the caller genuinely owns it, whether the module could, whether it is stable enough to become a supported contract with an understood compatibility cost, and whether changing it would force surrounding edits.

Keep public: caller-owned outcomes and decisions, necessary inputs and stable invariants, observable success and failure, and information required for correct recovery. Keep internal unless callers genuinely control it: sequencing, storage layout, dependency construction, provider mechanics, retries, cleanup, temporary states, caches, optimization machinery, and diagnostic details. Every observable fact is a contract callers may come to depend on.

A **seam** lets behavior, a dependency, or an observer change without coordinated surrounding edits; the adapter, clock, provider, or probe that plugs into it is what varies. Add one for demonstrated variation, a known migration, a required observer, or a dependency needing control, not for imagined flexibility.

When materially different ownership choices remain viable, design two or three interfaces that change seam placement, not only terminology. For each show ordinary caller usage, caller-owned decisions, the hidden internal protocol, the failure unit and observable behavior, the dependency and adapter strategy, the evidence needed, and the material cost. Compare only on criteria that could change the choice: behavior per interface fact, locality of likely change, cohesion and ownership clarity, correct-use ergonomics, misuse and hidden-decision risk, dependency direction, failure honesty and recovery, contract stability, test surface, reversibility, maturity fit, and implementation and evidence cost. Do not manufacture alternatives for a local, reversible, source-backed choice.

Prefer the boundary that removes concepts and coordination over one that centralizes the same protocol behind new terminology or another helper. Do not centralize unrelated responsibilities to reduce interface count, or scatter an old protocol into callers while claiming an abstraction was removed.

The intended interface should normally be the behavior and test surface. Question the design when callers or tests must bypass it, coordinate private lifecycle steps, replace many internals, or know dependency construction the module should own. An internal test inspecting internals is not itself a defect; the concern is callers needing hidden knowledge, or a fixture manufacturing the behavior it claims to observe. Tests that protect accidental machinery do not justify keeping it, and production architecture should not imitate the test framework.

## Modules And Dependencies

Goal: modules own coherent decisions and dependencies point toward stable policy; do not reorganize the codebase for conceptual purity, or because it has many files.

A module should own one coherent outcome, policy, state boundary, or failure unit. Do not split only by processing step, file type, framework convention, size, or a wish for more abstractions; ask which behavior changes together, which decision has one reason to change, which state and failure behavior belong together, and what callers should stop coordinating. Pressure exists when one module owns unrelated policies, one policy is spread across many modules, state transitions sit apart from their invariants, failure handling is detached from the operation it protects, or callers assemble the real behavior from helpers.

Policy should not depend directly on volatile infrastructure that can change independently: stable outcome or policy, then a small dependency interface, then the infrastructure adapter. A **port** is an outcome or capability policy requires; an **adapter** supplies the concrete infrastructure. Use them for provider variation, a known migration, infrastructure details leaking into policy, or tests that need safe dependency control; not when one stable implementation exists, the wrapper hides no decision, the generic interface keeps provider quirks, or caller complexity does not drop. Do not add interfaces around every concrete implementation.

A dependency cycle usually means responsibilities are divided wrongly, shared policy or state has no single owner, an interface exposes implementation details, or modules must know each other's lifecycle. Do not break it by moving imports or adding a neutral-looking utility while the conceptual cycle stays; name the shared decision and give it an owner. A layer earns its place when it hides a distinct level of decision; it is shallow when it forwards calls, renames types, exposes lower-layer errors and states, makes callers understand both layers, or exists only to satisfy a pattern.

A shared helper can centralize syntax while policy ownership stays scattered. Before extracting shared code, ask whether it is one concept that should evolve together, who owns its behavior and failure contract, whether callers still make the same decision independently, and whether extraction removes coordination or only moves code. Some duplication is cheaper than a shared abstraction with unclear ownership.

## Pressure Signals

Goal: identify the pressure that changes the next action, or conclude that none does; do not count smells or redesign the system.

Ask what caller outcome and interface are affected, what callers must know or coordinate, whether the current change added to it, what policy, dependency, state transition or failure behavior is spreading, whether the cause is supported, and whether it can be resolved inside accepted scope and authority.

Complexity is coordination, not line count; a large implementation can be simple to use, and a small helper complex when every caller must know its quirks: change amplification (one change needs many surrounding edits), cognitive load (callers must remember many facts), obscurity (important rules are hard to find), dependency burden (a safe change needs unrelated modules understood), and unknown unknowns (a caller cannot tell what else to inspect). Signals:

- **Change amplification:** one policy change needs edits across unrelated callers. Name the decision causing them; do not merely move the same choreography into one helper.
- **Caller protocol growth:** callers perform internal lifecycle steps, each correction adds a state or flag, recovery becomes ordinary caller behavior, or callers depend on paths, filenames, provider errors, or queue names. Ask whether one operation can own the whole success and failure unit and publish diagnostics separately.
- **Scattered policy:** one product or operational decision is encoded in several places. Do not centralize it until the policy is accepted; stop for a decision when it is user-owned or conflicting.
- **Unowned state or failure:** no module owns canonical state and its visibility point, forbidden partial outcomes, retry or escalation, cancellation and reconciliation, recovery after partial completion, or the evidence proving the final state.
- **Contract-surface growth:** each patch adds public flags, temporary states, manifest fields, retry links, recovery instructions, provider-specific errors, or cache and integrity controls.
- **Distorted tests:** tests reproduce caller choreography, mock many helpers to verify one outcome, depend on private lifecycle states, protect machinery from recent patches, prove rejection without checking forbidden writes, or make provider mechanics look like domain requirements. First check whether the production boundary owns the complete behavior; do not add mocks or test-only seams automatically.
- **Edge-case patch streams:** related fixes keep adding conditions, states, or caller rules. Diagnose whether they share one missing contract, state owner, or failure unit; finding count alone is not architecture.
- **Scope growth:** a bounded result unexpectedly needs a subsystem, pulls in deferred capabilities, invalidates earlier evidence, or requires unrelated callers to change.
- **Wrong edits that look right:** assume the next contributor knows only the files it has open, imitates the closest existing code, and stops at the first change that builds. That edit goes wrong when one piece of state has two writers and the edit reaches only one, when two supported ways do one task and each copy spreads the one found first, when outside code can import a module's internals and so turns them into interface, or when lists of the same items are kept in step by hand. Look for the boundary that makes the obvious local edit correct everywhere: one writer, one way, unreachable internals, and lists derived from one source or checked against it.
- **Interface mismatches:** a pass-through wrapper that hides no policy (keep it only for a real domain, compatibility, or observation boundary); a leaky interface exposing infrastructure details; a god module; a speculative seam; a dependency cycle; a Spec or Plan freezing classes, tables, or algorithms before evidence supports the boundary.

Do not escalate when stable repetition is small and local, broad edits are mechanical and source-backed, a one-off script needs no abstraction, a wrapper keeps a real compatibility contract, one condition is wrong but the interface is sound, an internal test deliberately checks an internal module, or resolving the pressure would exceed the user's goal without blocking it.

Choose the narrowest supported route: continue (the boundary is sound); a local correction (the defect stays within one module and contract); diagnosis (the failure is repeated or unexplained); a Spec or Plan revision (behavior, acceptance, or the execution boundary is incomplete); a user decision (resolving it makes a user-owned choice); learning (evidence cannot distinguish viable boundaries); deepening (a supported information-hiding improvement fits accepted scope); or deferred deepening (real but not worth resolving now).

When pressure is supported, find the decision the module should hide. Organize modules around decisions likely to change, not processing steps: instead of exposing `parse -> validate -> retry -> send -> log -> clean up`, look for the policy those steps implement: ask which decision would cause the most surrounding edits if it changed, which callers know it now, who should own it, and what outcome-level interface would let callers stop knowing it. A wrapper is not deep because it hides lines; it is deep when callers stop knowing concepts or coordinating protocol. Failure and recovery policy are often that decision. Keep one coherent model of the outcome, state, and failure behavior; pressure exists when a concept has different names or rules across callers, several modules partly own one decision, or callers translate between incompatible representations. Stop the current patch when it clearly spreads a likely-changing decision, adds caller protocol, exposes internal state, creates another required workaround, or makes the next accepted change materially harder. Name the boundary:

```text
Outcome:
Coordination currently spread across:
Likely-changing decision:
Current owners:
Proposed owner:
What callers would stop knowing:
Failure unit:
Evidence still missing:
```

If the decision cannot yet be named, define one bounded learning question rather than a generic abstraction.

## State And Failure

Use this section when state must survive a failure: correctness materially depends on canonical state, partial effects, atomic visibility, concurrent writers, cancellation, retries, recovery, reconciliation, or evidence of the final outcome. Do not apply it to a simple local value change whose state owner and failure behavior are already sound.

### Name Canonical State

Identify:

- canonical source of truth;
- who may create, replace, or invalidate it;
- visible states and invariants;
- commit or visibility point;
- diagnostic versus authoritative records;
- what callers may safely cache or infer.

Do not let several modules each behave as the source of truth.

A log, cache, temporary file, UI projection, or recovery marker is not canonical merely because it is observable.

### Define State Transitions

For every material transition, establish:

```text
precondition
-> accepted operation
-> commit or visibility point
-> resulting canonical state
-> evidence
```

Name forbidden transitions and partial states.

Prefer one owner for transition policy. Callers should not reproduce state-machine rules independently.

### Bound Partial Effects

When an operation affects several resources or can fail midway, establish:

- which effects may occur before commitment;
- which effects are forbidden before commitment;
- what must be rolled back, reconciled, or retained;
- what prior accepted state must survive;
- how partial outcomes are detected;
- what result is safe to expose.

Atomicity may come from transactions, staging, replacement, versioning, or explicit reconciliation. Do not claim atomic behavior from intention alone.

### Separate Retry, Resume, And Replay

These are different capabilities:

- **Retry:** attempt the same operation again.
- **Resume:** continue incomplete work from preserved state.
- **Replay:** apply an event or request again.
- **Idempotency:** repeated application has one supported effect.
- **Recovery:** restore a safe supported state.
- **Reconciliation:** compare and resolve divergent state.

Supporting one does not imply the others.

Expose them only when required by accepted behavior or observed failure.

### Design Concurrency Deliberately

When operations can overlap, identify:

- shared state;
- ordering and visibility;
- lost-update or duplicate-effect risk;
- serialization or conflict rule;
- cancellation behavior;
- stale-read policy;
- observer capable of proving the required outcome.

Before serializing writers, ask whether they need one shared target at all. When each publishes its own facts, give each its own file, key, or record and combine them where they are read; two workers updating different fields of one state file still share it. Serialize, with a lock, a queue, or a single writer, only when one shared target is itself required.

Do not add locks, queues, retries, or optimistic versions without naming the invariant they protect.

### Define Failure And Recovery

For the failure unit, state:

- who observes failure;
- canonical state after failure;
- diagnostic evidence;
- forbidden partial effects;
- fail-open, fail-closed, degrade, stop, retry, or escalation behavior;
- safe restart or recovery operation;
- evidence proving recovery.

A graceful error response does not prove graceful state handling.

### Keep Recovery Out Of Ordinary Callers

Callers should normally request an outcome and receive supported success or failure.

Do not require every caller to know:

- cleanup order;
- retry schedule;
- temporary paths;
- partial-state markers;
- provider error translation;
- reconciliation commands.

Publish diagnostics without exposing recovery choreography unless callers genuinely own recovery.

### Test State And Failure Through Observable Invariants

Tests should verify:

- accepted final state;
- preserved prior state;
- forbidden writes;
- composed failures;
- retry or replay behavior when required;
- cancellation and recovery;
- evidence at the real observing boundary.

A passing happy-path test does not prove partial-failure safety.

### Return For State And Failure

Return the canonical state and owner, material invariants, the failure unit and its forbidden partial outcomes, the retry, resume, replay, and recovery capabilities actually required, and remaining uncertainty. Stop when state and failure ownership are sufficient for the current decision; do not design every theoretical failure mode.

## Return The Smallest Supported Change

When evidence cannot choose between viable boundaries, answer that question with a bounded learning action rather than building the future system:

```text
Question:
Competing boundaries:
Smallest prototype or observation:
Evidence required:
Time or cost boundary:
Discard-or-promote rule:
Return condition:
```

When the answer is a measured rate or a comparison, or a finding others will act on, rather than which boundary works, it is a study or a quick check: frame and run it with [Research Work](../../research-work/SKILL.md). The experiment must answer the design question; if its next prerequisite is future production infrastructure, reassess before building it. Working exploratory code is evidence, not production architecture. Compare alternatives only when they are real. Recommend the simplest supported boundary that preserves required behavior, with the structural evidence, the decision it hides, its caller contract and failure behavior, its principal cost, and what would invalidate it: keeping the existing design, a local correction, diagnosis, an artifact revision, a learning action, an accepted deepening, explicit deferral, or a stop for the user's direction. When the selected result is behavior-preserving reduction, use [simplify](simplify.md). Freeze a sufficiently supported boundary instead of pursuing architectural completeness.
