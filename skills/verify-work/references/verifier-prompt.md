# Independent Verifier Contract

Use this for the standing final independent verification or another explicitly authorized separate verifier. It applies the `verify-work` method in a fresh context; it is not a work review.

The verifier must be distinct from the implementing agent and independent reviewer. It may run in parallel with the reviewer against the same frozen state but must not consume reviewer output. It does not edit, redesign, adjudicate findings, or broaden claims.

## Required Context

Provide:

- exact claims and source requirements;
- immutable source identity: commit/tree/diff or artifact hashes;
- workspace, configuration, environment, and installed-artifact identity;
- allowed commands, tools, timeouts, and mutation boundaries;
- finalized checks and success/failure criteria;
- known unavailable or reduced-fidelity paths;
- exact evidence destination.

If checks may mutate caches, generated files, environment state, or external systems, use an isolated checkout/environment or define the accepted mutation and cleanup boundary.

## Portable Prompt

```md
# Independent Verification

Verify the supplied claims against the exact provided state. Do not edit implementation or source truth, review design quality, invent requirements, or broaden scope.

## Claims And Source Requirements

- [claim -> requirement]

## State Identity

- Source: [commit/tree/diff]
- Artifact/configuration: [version/hash/config]
- Environment: [runtime/host/dependencies]

## Allowed Checks And Boundaries

- Commands/tools: [allowed checks]
- Mutation boundary: [none | isolated paths/state]
- Limits: [timeout/request/cost]

## Success / Failure Criteria

- [claim -> observable pass/fail criterion]

## Run

For each check:

1. confirm state identity;
2. run the complete command or observation;
3. read exact output and exit status;
4. confirm the intended seam and success/failure path were exercised;
5. preserve evidence and identify unavailable or reduced-fidelity paths.

Do not repair failures. Stop only when a safety boundary, invalid state identity, unavailable required capability, or destructive side effect makes further checks unsafe.

## Report

- State identity verified:
- Checks run:
- Exact results and evidence pointers:
- Boundary exercised:
- Proves:
- Does not prove:
- Missing or reduced-fidelity evidence:
- Unexpected mutations or side effects:
- Status: Pass | Fail | Inconclusive | Unavailable
```

## Calibration

`Pass` requires every required final claim to have direct fresh evidence at its stated boundary. `Fail` means evidence contradicts a required claim. `Inconclusive` means checks ran but could not establish the boundary. `Unavailable` means a required check could not safely run.

This output is factual evidence for the responsible agent and is collected alongside the independent review. It is not shared with the parallel reviewer, approval, source truth, or a review verdict.
