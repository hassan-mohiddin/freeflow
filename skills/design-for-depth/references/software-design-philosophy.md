# Software Design Philosophy

Read this when structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named.

Use only the principle that identifies the missing ownership. Do not produce a literature review, pattern catalog, or system-wide redesign.

## Complexity Is Coordination

Complexity is not line count. It appears as:

- **Change amplification:** one behavior change requires many surrounding edits.
- **Cognitive load:** callers must remember many facts to use the module correctly.
- **Obscurity:** important rules or ownership are difficult to discover.
- **Dependency burden:** safe change requires understanding unrelated modules.
- **Unknown unknowns:** a caller cannot tell what else it must inspect.

A large implementation can be simple to use. A small helper can be complex when every caller must know its quirks.

Ask:

- What must a future caller or maintainer know?
- How many locations must change together?
- Which important facts are difficult to discover?
- Which dependencies must be inspected before a safe change?

## Deep Modules

A deep module provides substantial coherent behavior through a small interface.

Callers state the outcome they need. The module owns:

- sequencing;
- likely-changing policy;
- internal state transitions;
- cleanup;
- provider mechanics;
- internal failure handling.

A wrapper is not deep merely because it hides lines. It is deep when callers stop knowing concepts or coordinating protocol.

Depth is not breadth. A god module hiding unrelated decisions is not deep.

## Strategic And Tactical Design

A tactical change makes the current patch fit.

A strategic change spends proportionate effort so that the next likely change remains local and correct use remains simple.

Do not redesign everything in anticipation of the future. Do stop when the current patch clearly:

- spreads a likely-changing decision;
- adds caller protocol;
- exposes internal state;
- creates another required workaround;
- makes the next accepted change materially harder.

Strategic design is proportionate investment, not maximal architecture.

## Hide Likely-Changing Decisions

Organize modules around decisions likely to change, not merely processing steps.

Instead of exposing:

```text
parse -> validate -> retry -> send -> log -> clean up
```

look for the decision those steps implement:

```text
notification delivery policy
```

Ask:

- What decision would cause the most surrounding edits if it changed?
- Which callers currently know it?
- Who should own it?
- What outcome-level interface would let callers stop knowing it?
- Is the decision accepted or still user-owned?

Failure and recovery policy are often likely-changing decisions.

## Preserve Conceptual Integrity

A module should express one coherent model of its outcome, state, and failure behavior.

Pressure exists when:

- the same concept has different names or rules across callers;
- several modules partially own the same decision;
- one module exposes unrelated mental models;
- callers translate between incompatible representations;
- each feature adds another exception to the shared concept.

Prefer one clear ownership model over several locally convenient but incompatible ones.

Conceptual integrity does not mean one module or one abstraction. It means related behavior follows one coherent set of decisions.

## Use Seams And Enabling Points For Real Leverage

A seam allows behavior, dependencies, or observation to change without editing surrounding code.

An enabling point supplies the variation:

- adapter;
- provider;
- fake;
- clock;
- probe;
- policy;
- migration implementation.

Good seams correspond to:

- demonstrated provider or environment variation;
- known migration;
- dependency control required by tests;
- observation or fault injection;
- policy that changes independently from infrastructure.

Weak seams:

- wrap one stable call;
- add factories without ownership;
- expose provider quirks through generic names;
- exist only to mock internals while the caller interface remains awkward.

## Separate Policy From Infrastructure

When infrastructure details leak into product or domain policy, use a boundary where:

```text
policy requests outcome
-> adapter performs provider mechanics
```

Examples:

- billing policy should not depend on payment-provider error names;
- notification policy should not be repeated in each provider call;
- permission semantics should not depend on database representation;
- user-flow state should not depend on browser event plumbing.

Do not add ports and adapters around every stable library call. The boundary is useful only when it hides policy, variation, or mechanics callers should not own.

## Treat Observable Facts As Contracts

Callers may depend on any observable:

- flag;
- path;
- state;
- error;
- timing rule;
- fallback;
- ordering behavior;
- filename;
- retry count.

Expose a fact only when:

- the caller owns the decision;
- correct use requires it;
- it is stable enough to support;
- its compatibility cost is understood.

Public flexibility has lasting coordination cost. Prefer one outcome-level operation over a toolkit that requires callers to reconstruct the lifecycle.

## Separate Required Capability From Speculation

Classify proposed mechanisms as:

- **Trust:** required to know the result is valid.
- **Safety:** prevents damage, leakage, or runaway behavior.
- **Efficiency:** saves time, requests, or money.
- **Scale:** supports concurrency or volume.
- **Portability:** supports additional environments or providers.

Required trust and safety cannot be deferred merely to simplify the design.

Efficiency, scale, and portability require accepted requirements or observed pressure. Do not turn imagined future variation into present interface cost.

## Name The Missing Boundary

Use supported evidence to state:

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

If the decision cannot yet be named, define one bounded learning question. Do not create a generic abstraction as a substitute for understanding.

Stop once the missing decision or boundary is named—or evidence shows no worthwhile boundary change is supported.
