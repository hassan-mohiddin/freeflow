# Design Pressure Signals

Read this when observed coordination could change the next route and an equivalent design-route classification is not already supported, or when structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named.

This reference is judgment. Identify the pressure that changes the next action, or conclude that none does; do not count smells, and do not produce a literature review or system-wide redesign.

## Classify The Evidence

Ask:

1. What caller outcome and interface are affected?
2. What facts must callers know or coordinate?
3. Did the current change add to that knowledge?
4. What policy, dependency, state transition, or failure behavior is spreading?
5. Is the cause supported?
6. Can the issue be resolved inside accepted scope and authority?

Choose the narrowest supported route:

- **Continue:** the current boundary remains sound.
- **Local correction:** the defect stays within one module and contract.
- **Diagnosis:** a failure is repeated or unexplained and its cause is unsupported.
- **Spec or Plan revision:** behavior, acceptance, or the execution boundary is incomplete.
- **User decision:** resolving the pressure changes a user-owned outcome.
- **Learning:** evidence cannot distinguish viable boundaries.
- **Deepening:** a supported information-hiding improvement fits accepted scope.
- **Deferred deepening:** the pressure is real but not worth resolving now.

## Recognize The Signals

Complexity is coordination, not line count. It shows up as change amplification (one change needs many surrounding edits), cognitive load (callers must remember many facts), obscurity (important rules are hard to find), dependency burden (safe change needs unrelated modules understood), and unknown unknowns (a caller cannot tell what else to inspect). A large implementation can be simple to use; a small helper can be complex when every caller must know its quirks.

- **Change amplification.** One policy change needs edits across unrelated callers, such as a retry policy touching routes, workers, UI state, and tests. Name the decision causing the edits; do not merely move the same choreography into one helper.
- **Caller protocol growth.** Callers perform internal lifecycle steps (`configure -> open -> retry -> translate error -> clean up -> publish evidence`), each correction adds a state or flag, recovery becomes ordinary caller behavior, or callers depend on paths, filenames, provider errors, or queue names. Ask whether one operation can own the complete success and failure unit while publishing diagnostics separately.
- **Scattered policy.** One product or operational decision is encoded in several places, such as billing transition timing in a webhook, dashboard, email, and worker. Do not centralize it until the policy is accepted; stop for a decision when it is user-owned or conflicting.
- **Unowned state or failure.** No module owns canonical state and its visibility point, forbidden partial outcomes, retry or escalation, cancellation and reconciliation, recovery after partial completion, or the evidence proving the final state.
- **Contract-surface growth.** Each patch adds public flags, temporary states, manifest fields, retry links, recovery instructions, provider-specific errors, or cache and integrity controls. Ask whether callers own those facts or are being forced to understand internal protocol.
- **Distorted tests.** Tests reproduce caller choreography, mock many helpers to verify one outcome, depend on private lifecycle states, protect machinery from recent patches, prove rejection without checking forbidden writes, or make provider mechanics look like domain requirements. First inspect whether the production boundary owns the complete behavior; do not automatically add mocks or test-only seams.
- **Edge-case patch streams.** Related fixes keep adding conditions, states, or caller rules (missing contact, then fallback, then duplicate delivery, then retry telemetry, then another exposed state). Diagnose whether the cases share one missing contract, state owner, or failure unit; finding count alone is not architecture.
- **Scope growth.** A bounded result unexpectedly needs a subsystem, expands remaining work, pulls in deferred capabilities, invalidates earlier evidence, or requires unrelated callers to change. Return the evidence; the route may be simplify, split, revise an artifact, learn, defer, or stop.

Common interface mismatches:

- **Pass-through wrapper:** renames a call without hiding policy or provider behavior; keep it only for a real domain, compatibility, or observation boundary.
- **Leaky interface:** callers know infrastructure-specific details.
- **God module:** unrelated decisions collected behind one interface.
- **Speculative seam:** indirection for imagined variation.
- **Dependency cycle:** modules cannot change independently because their responsibilities point at each other.
- **Premature artifact detail:** a Spec or Plan freezes classes, factories, tables, or algorithms before evidence supports the boundary.

## Rule Out False Positives

Do not escalate when stable repetition is small and local, broad edits are mechanical and source-backed, a one-off script needs no long-term abstraction, a wrapper preserves a real compatibility contract, an isolated condition is wrong but the interface is sound, an internal test intentionally verifies an internal module, or resolving the pressure would exceed the user's goal without blocking it.

## Name The Missing Boundary

When pressure is supported, find the decision the module should hide.

Organize modules around decisions likely to change, not processing steps. Instead of exposing `parse -> validate -> retry -> send -> log -> clean up`, look for the decision those steps implement, such as a notification delivery policy. Ask which decision would cause the most surrounding edits if it changed, which callers know it now, who should own it, what outcome-level interface would let callers stop knowing it, and whether it is accepted or still user-owned. Failure and recovery policy are often the likely-changing decision.

A deep module lets callers state the outcome while it owns sequencing, likely-changing policy, internal transitions, cleanup, provider mechanics, and internal failure handling. A wrapper is not deep because it hides lines; it is deep when callers stop knowing concepts or coordinating protocol. Depth is not breadth: a god module hiding unrelated decisions is not deep.

Prefer proportionate strategic design over tactical patching, not maximal architecture: stop the current patch when it clearly spreads a likely-changing decision, adds caller protocol, exposes internal state, creates another required workaround, or makes the next accepted change materially harder.

Preserve conceptual integrity: one coherent model of the outcome, state, and failure behavior. Pressure exists when a concept has different names or rules across callers, several modules partly own one decision, callers translate between incompatible representations, or each feature adds another exception to the shared concept. This does not mean one module or one abstraction.

Every observable fact is a contract callers may depend on: flags, paths, states, errors, timing rules, fallbacks, ordering, filenames, retry counts. Expose a fact only when the caller owns the decision, correct use requires it, it is stable enough to support, and its compatibility cost is understood.

Classify each proposed mechanism by what it is for: **trust** (knowing the result is valid), **safety** (preventing damage, leakage, or runaway behavior), **efficiency**, **scale**, or **portability**. Trust and safety cannot be deferred to simplify a design; efficiency, scale, and portability need an accepted requirement or observed pressure.

Name the boundary with supported evidence:

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

If the decision cannot yet be named, define one bounded learning question rather than a generic abstraction. Stop once the route is classified and the missing boundary is named, or evidence shows no worthwhile boundary change; return the evidence and classification without redesigning automatically.
