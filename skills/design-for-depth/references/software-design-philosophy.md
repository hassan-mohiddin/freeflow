# Software Design Philosophy

Read this when structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named.

Use only the principle that identifies the missing ownership. Do not produce a literature review or redesign the system by default.

## Good Design Reduces Coordination

Complexity is not line count. It appears as:

- change amplification;
- dependencies callers must understand;
- important facts that are difficult to discover;
- rules distributed across modules;
- uncertainty about what must be inspected before making a safe change.

A large implementation can be simple to use. A small helper can be complex when every caller must know its quirks.

## Deep Modules

A deep module provides substantial coherent behavior through a small interface.

Callers should state the outcome they need. The module should own sequencing, likely-changing policy, cleanup, provider mechanics, and internal failure handling unless callers genuinely control those decisions.

A wrapper is not deep merely because it hides lines. It is deep when it removes concepts or coordination from callers.

## Hide Likely-Changing Decisions

Organize boundaries around decisions likely to change, not merely processing steps.

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

Failure policy is often one of these decisions.

## Use Seams For Real Leverage

A seam is useful when behavior must vary or be observed without editing surrounding code. It needs an enabling point where an adapter, test implementation, clock, probe, provider, or migration path can be supplied.

Good seams correspond to:

- demonstrated provider or environment variation;
- a known migration;
- a dependency that must be controlled in tests;
- required observation or fault injection.

Weak seams merely wrap one stable call, add factories without ownership, or preserve provider quirks in a generic-looking interface.

## Treat Observable Facts As Contracts

Callers may depend on any observable flag, path, error, state, timing rule, fallback, or ordering behavior.

Expose a fact only when:

- the caller owns the decision;
- correct use requires it;
- it is stable enough to support as a contract.

Public flexibility has lasting coordination cost. Prefer one outcome-level operation over a toolkit that requires callers to reconstruct the lifecycle.

## Separate Required Capability From Speculation

Classify proposed mechanisms as:

- **Trust:** needed to know the outcome is valid.
- **Safety:** prevents damage, leakage, or runaway work.
- **Efficiency:** saves time, requests, or money.
- **Scale:** supports concurrency or volume.
- **Portability:** supports additional hosts or providers.

Required trust and safety cannot be deferred merely to simplify the design. Efficiency, scale, and portability require accepted requirements or observed pressure.

## Name The Missing Boundary

Use the evidence to state:

```text
Outcome:
Coordination currently spread across:
Likely-changing decision:
Proposed owner:
What callers would stop knowing:
Failure unit:
Evidence still missing:
```

If the decision still cannot be named, propose one bounded learning question. Do not introduce a generic abstraction as a substitute for understanding.

Stop once the hidden decision or missing boundary is named—or once evidence shows that no worthwhile boundary change is supported. Return that result to the main skill.
