# Integration Evidence

Read this before selecting or running evidence when a claim depends on a registered callback or executor, host lifecycle, producer invocation, fallback protocol, installed package, absence counter, or a check that may mutate shared state.

## Match The Boundary

Evidence proves only the boundary it directly observes.

- Source inspection proves code or registration shape, not execution.
- A shared-helper call proves helper behavior, not callback registration or host dispatch.
- Calling the exact registered callback or executor proves that entrypoint's behavior, not native host lifecycle dispatch.
- A pinned fallback proves only the declared fallback protocol.
- Native host dispatch requires host-observed lifecycle evidence.
- Installed-package behavior requires execution from the installed artifact and resolved source paths under that artifact root.

Name the strongest level actually observed. Do not collapse source inspection, helper execution, registered entrypoint invocation, fallback replay, native dispatch, and installed execution into one "integration passed" claim.

## Observe Real Work

A counter, trace, spy, or event proves execution only when it observes inside or wraps the actual invoked boundary. Manually updating evidence beside test setup proves only that the test updated it.

A zero value proves absence only when:

- the observer was attached to the real path;
- the path had an opportunity to emit the event;
- the observation window covered the complete operation;
- failure did not bypass or disable observation.

Prefer an adversarial disproof: bypass the producer, forge or replay the event, call the helper directly, or resolve code from the checkout instead of the installed root. The proof should fail before downstream work when the claimed boundary was not crossed.

## Compare Mutation Footprints

Before running checks concurrently, compare what each check may write or remove. Run checks serially when they share generated directories, caches, build outputs, package roots, fixture state, ports, databases, or intentional stale-artifact files.

A concurrency-induced red signal is orchestration evidence, not automatically an implementation defect. Reproduce it under a non-overlapping or serial schedule before changing production code.

## Claim Map

For sensitive or proof-bearing claims, record:

```text
Claim:
Required boundary:
Observing mechanism:
Adversarial disproof:
Mutation footprint:
Proves:
Does not prove:
```

Downgrade or split the claim when one mechanism cannot observe every asserted boundary.
