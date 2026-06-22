# Software Design Philosophy

Use this reference when `design-for-depth` needs deeper reasoning than the active skill can carry.

This is not a checklist to run every time. Pull the idea that changes the next route.

## Core Claim

Good design reduces coordination.

A deep module lets callers, tests, reviewers, and future agents use a small interface to get a lot of behavior. A shallow module makes them learn almost as much as the implementation.

Design work is worthwhile when it hides a decision that would otherwise spread.

## Ousterhout: Complexity, Deep Modules, Strategic Programming

### Complexity

Complexity shows up as:

- too many dependencies;
- obscurity, where important facts are hard to find;
- change amplification, where a small behavior change touches many places;
- cognitive load, where the user of a module must remember too much;
- unknown unknowns, where a future agent cannot tell what it must inspect.

For Freeflow, complexity is not “many lines.” A single compact helper can be complex if callers must know its quirks. A large implementation can be simple to use if the interface hides the hard parts.

### Deep modules

A deep module has a simple interface and useful behavior behind it.

Deep means:

- callers say what outcome they need;
- implementation owns sequencing and policy details;
- tests can verify behavior through the public interface;
- future changes stay localized;
- docs and review comments do not need to explain the hidden machinery every time.

Shallow means:

- the interface mirrors the implementation;
- callers pass many flags and know ordering rules;
- tests assert internal call sequences;
- wrappers rename work without hiding decisions;
- future agents still need to inspect everything to use it safely.

### Strategic vs tactical programming

Tactical programming makes the current patch fit, even if it spreads complexity.

Strategic programming spends a little extra attention to preserve future locality.

Freeflow translation:

- Do not redesign everything up front.
- Do stop when the local patch clearly makes the next slice, review, or bug fix harder.
- Route backward when the plan is tactical but the work is becoming structural.

## Parnas: Information Hiding

Parnas's key design move: modules should hide design decisions likely to change.

Do not decompose only by processing steps:

```text
parse -> validate -> send -> log
```

when the real likely-changing decision is:

```text
notification delivery policy: provider choice, retry, fallback, telemetry, failure semantics
```

A good module hides the unstable decision.

Ask:

- What decision would cause the most edits if it changed?
- Which callers currently know that decision?
- Can one module own it?
- What interface would let callers stop knowing it?

Examples:

- Billing grace period policy should not be spread across webhook handlers, email copy, UI guards, and tests.
- Notification retry/fallback policy should not be duplicated in each route.
- Permission semantics should not be separately encoded in frontend, backend, and test setup.
- Cache invalidation rules should not require every caller to remember freshness knobs.

## Feathers: Seams And Enabling Points

A seam is where behavior can change without editing the surrounding work.

A seam needs an enabling point: the place where a different adapter, test double, probe, or behavior can be supplied.

Freeflow use:

- Use seams to make hard-to-test or hard-to-change behavior tractable.
- Do not create seams merely because a pattern sounds clean.
- Prefer seams that match real variation or observability needs.

Questions:

- What behavior needs to vary?
- Where can that variation enter without editing callers?
- What enabling point supplies the adapter or behavior?
- Does the seam protect production code and tests, or only add indirection?

Good seam candidates:

- provider variation: email/SMS/payment/search/storage;
- environment variation: prod/test/offline/fake implementations;
- observability variation: probes, clocks, log sinks, metrics;
- migration variation: old and new implementations behind one interface.

Weak seam candidates:

- one implementation with no likely variation;
- a seam created only to mock internals while the real interface stays awkward;
- a factory/registry around every function;
- an adapter whose interface still exposes provider-specific quirks.

## Ports And Adapters

Ports/adapters protects core behavior from infrastructure details.

Freeflow wording:

- The core owns policy.
- The adapter owns provider mechanics.
- The interface between them says what the core needs or provides.

Use this idea when infrastructure details are leaking into product logic.

Examples:

- Stripe event parsing is adapter work; billing policy is core work.
- Email provider retries are adapter work; user notification policy may be core work.
- Database query syntax is adapter work; permission semantics are core work.
- Browser event plumbing is adapter work; user-flow state is core work.

Do not over-apply ports/adapters:

- simple scripts may not need ports;
- a single stable library call may not need an adapter;
- wrapping an SDK without hiding policy or provider quirks is often shallow.

## Refactoring Pressure

Design pressure often appears as ordinary implementation pain:

- shotgun surgery;
- repeated review findings;
- flaky tests around ordering;
- many mocks for one behavior;
- hard-to-explain correctness;
- one bug fix causing another;
- “just add this flag everywhere.”

Do not treat all pressure as a command to refactor.

Classify it:

- **Real design pressure:** complexity spread blocks safe progress.
- **Local mess:** cleanup can happen within current scope.
- **Deferred deepening:** record the candidate, finish current work.
- **Owner decision:** deeper change affects product/API/security/compatibility.

## Applying The Philosophy In Freeflow

### In discovery

Use design ideas to ask better questions, not to freeze architecture.

Good questions:

- Which decision is most likely to change?
- Who should know this rule?
- What should callers stop coordinating?
- What future variation is real, not imagined?
- Which tests should survive a provider or implementation change?

### In specs

Specs name behavior and boundaries. They should not lock in unproven module shapes.

Use:

```text
Tentative: notification delivery may need one policy-owning module if retries/fallbacks continue spreading.
Open: whether provider variation is real now or deferred.
```

not:

```text
Requirement: implement NotificationDeliveryPortFactoryStrategy.
```

### In plans

Plan around vertical behavior and interfaces.

A good slice can be verified through the intended interface. If the slice requires broad caller choreography, revise the slice.

### In review

Review design depth by asking whether the diff reduces or increases caller knowledge.

A diff can pass tests and still fail design review if it scatters policy or creates a shallow interface.

### In diagnosis

Repeated failures may indicate that the system is missing a module, seam, or source-truth decision.

Do not keep fixing symptoms when every fix reveals another coordination problem.
