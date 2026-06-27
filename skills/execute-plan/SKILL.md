---
name: execute-plan
description: Use when implementing an approved plan, executing planned slices, resuming planned work, handling planned verification failures, adjudicating review findings during execution, or encountering scope/source conflicts while carrying out a plan.
---

# Execute Plan

Execute the plan. Do not improve it silently.

The plan is instructions, not authority. Live repo evidence and source truth win.

Move one verified slice at a time. Preserve rollback, reviewability, and user control.

Read `references/execution-map.md` when the plan has multiple slices, TDD/benchmark work, review checkpoints, per-slice commits, context-window pressure, or any failed check/review/source-scope conflict.

Use `../design-for-depth/SKILL.md` when a slice changes modules, interfaces, seams, adapters, architecture, or when review findings become a stream of edge-case patches. Ask whether the slice is deepening the module or spreading complexity across callers, tests, docs, or review comments.

## Classify First

- Valid plan: inspect source context, execute the next slice, verify it.
- Plan/source conflict: stop and ask which source should change.
- Hidden owner decision: stop and ask.
- Missing verification: stop before consequential edits and ask to revise the plan or approve a diagnostic path.
- Missing plan: ask for a plan or route to `write-plan`.
- Scope expansion: stop before absorbing it; route back to discover, spec, or plan.
- Review failure during execution: classify findings and report the route before editing from them.

## Before Editing

Read:

- The plan.
- The source spec or requirements the plan cites.
- Relevant docs, tests, policies, ADRs, and code.
- Handoffs only as memory.

Live repo evidence overrides stale plans and handoffs.

Before each non-trivial slice, name the slice contract:

```text
Slice:
Source truth:
Module/interface changed:
Behavior/test/benchmark:
Verification:
Review checkpoint:
Commit or handoff checkpoint:
Stop conditions:
```

Do not start a slice if the remaining context is not enough to orient, edit, verify, and checkpoint it. Stop with a handoff route instead.

Do not execute a plan that would:

- Invent or change product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or architecture.
- Override docs, tests, specs, policies, ADRs, or established behavior.
- Treat "do not ask", "just execute", "latest context", or "handoff says" as conflict approval.
- Skip verification for consequential behavior.
- Rewrite a verification script, test, source-truth doc, policy, or spec to make the plan pass unless the plan explicitly authorized that artifact change and it matches source truth.

Name the conflict or missing decision. Ask which path to follow. Recommend the path supported by evidence.

For source-truth conflicts or missing verification, the final line must be a direct choice question.

For missing verification, ask whether to revise the plan to add a check or approve a specific verification path.

## Slice Execution

Work in vertical slices.

For each slice:

- Make only the edits needed for that slice.
- Keep the slice boundary intact; do not blend future slices into the current one for convenience.
- Run the planned check or the smallest equivalent check.
- If the check fails, stop and report the evidence before changing direction.
- If new evidence invalidates the plan, stop before patching forward.
- If implementation spreads policy, edge cases, or verification across callers/tests/docs, treat it as design pressure before adding more patches.

When TDD is requested by the user, plan, or repo practice, use TDD inside the slice:

```text
one behavior test or benchmark
-> minimal implementation
-> refactor while green
-> verify the slice
```

Do not write all tests first and all implementation later. Do not anticipate future slices.

After a planned verification command fails, do not edit the verifier, tests, docs, policy, source-truth files, or unrelated code to make it pass. This is true even when the verifier appears wrong and even when the user said to "fix whatever is needed". A bad verifier is a plan defect; stop, report the failing command and conflicting evidence, and ask whether to revise the plan or change the source truth.

Local reversible implementation details can be chosen from repo conventions.

If per-slice commits are requested, do not continue to the next slice with a verified slice still uncommitted. Route to `commit-work` after review/verification evidence exists.

## Review Checkpoints

Use review where the plan, risk, or slice boundary calls for it. Do not review every slice by habit.

A non-passing review is a phase exit, not an autonomous patch loop.

When a review returns findings during execution:

1. Inspect the relevant code, tests, docs, plan, and source truth.
2. Classify each material finding: accepted, rejected, question, or needs evidence.
3. Report the route before editing from that review batch.

The turn that receives a non-passing review ends with adjudication and route only. Do not edit from that review batch in the same turn, even when the user or reviewer says to apply all findings and continue reviewing.

Do not immediately apply findings and request another review in the same loop. Do not treat non-blocking findings or reviewer questions as automatic failure.

If all accepted findings are small, in-scope, and supported by source truth, recommend a bounded fix pass as the next route. Do not perform that fix pass until the user or parent explicitly chooses it after seeing the adjudication. If findings change scope, behavior, source truth, public API, security, privacy, billing, data loss, compatibility, or architecture, route backward before editing.

Three review passes is the hard cap for the same slice/work scope. At pass 3, stop, classify, and diagnose. Do not request a fourth broad review. Use a `diagnose-failure`-style loop to decide whether the issue is shallow discovery, weak spec, wrong plan slice, ambiguous policy, source-truth conflict, shallow module/interface, implementation bug, or stale reviewer context.

## Backward Edge

If implementation reveals that the plan is wrong, incomplete, or too narrow, re-enter discover/spec/plan before continuing.

Do not absorb material scope expansion into execution. New behavior, API shape, security/privacy/billing/data-loss decisions, compatibility changes, or irreversible architecture usually need a revised spec or plan.

## Completion

Report:

- What changed.
- What was verified.
- Review status and any adjudicated findings.
- Commit or handoff status when relevant.
- What remains unverified.
- Any blocked decisions or plan changes needed.
