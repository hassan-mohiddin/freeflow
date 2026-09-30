# Executor Mode

Judgment for placing work when Runtime State shows `Delegation: executor`. The core skill's Rules still apply, including the limit on Coordinator's own environment work.

Executor mode is the main cost saver. A cheaper Executor does the environment work: investigation, preparation, artifacts, implementation, checks, and record maintenance. Coordinator plans, writes contracts, assesses, and talks to the user, and executes nothing itself except under ACT_BOUNDED. The saving comes from two places: projection keeps Executor's working trail out of Coordinator's context, and precise contracts keep Executor from searching.

## Make The Contract Do The Heavy Thinking

Goal: Executor's first attempt is right often enough that the saving outweighs the corrections.

Coordinator's judgment reaches the work only through the contract, so the contract carries the decision. Frame the problem so the cheaper model finds it straightforward: the representation to use, the invariant to preserve, the wrong approach that looks right, and the check that tells them apart. For consequential design choices, write that content with the Implementation Decisions method in [Design for Depth](../../../skills/design-for-depth/SKILL.md).

```text
Weak:   Add caching to the config loader.
Strong: Cache the parsed config per file path and invalidate when the file's
        modification time changes. Two loads of an unchanged file parse once;
        an edit between loads must be seen. A process-lifetime cache looks
        right and passes a single-load test but serves stale config, so check
        with an edit between two loads.
```

A cheaper model applies an escape clause literally, so write requirements as outcomes for named things ("each caller listed below still gets X"), never "unless…" or "as today", and say where the change belongs.

Default: give structure where Executor has shown difficulty or the property is easy to get subtly wrong, and freedom where the mechanics are ordinary. Signals the balance is off:

- Executor returns work that misses an unstated decision: the contract left it implicit.
- The contract is longer than the change and reads like a patch: Coordinator has done the work at premium price, and Executor only transcribes it.
- The same misunderstanding recurs: change how you represent the problem, not how forcefully you state it.

## Gather, Then Produce

Goal: Coordinator's contracts rest on evidence without Coordinator doing the reading.

Coordinator may first commission evidence or a proposal, interpret what comes back, and then commission production. Executor gathers; projection carries the selected evidence to Coordinator; the next contract uses it to narrow Executor's search. Do not add a gathering pass when Executor already has an adequate basis, and do not pre-solve every detail before any evidence exists.

Executor forms the execution forecast for production work. Coordinator supplies the governing decisions it rests on.

## Ask For Evidence That Decides

Goal: Coordinator can assess from what projection delivers, without asking for the whole trail.

Request evidence by the claim it must support: the decisive test output, the changed interface, the contradicting observation. Requesting everything moves Executor's trail into Coordinator's context and cancels the saving; requesting too little forces a recovery round. When a return lacks evidence that exists, recover it rather than re-running the work.

## What Coordinator Does Not Do Here

Coordinator writes an artifact itself only when the user explicitly assigns it (see the core skill). Record maintenance goes to Executor, folded into an assignment already going out rather than sent as a handoff of its own. Recovery after context loss is the exception the core skill names: Coordinator reads the Working Record and the artifacts that define the task directly.

The failures to prevent are weak contracts that cause correction cycles, over-specified contracts that move the work back to Coordinator's price, and weak evidence that forces reassessment.
