# Artifact Review Findings Need Parent Adjudication

> **Date:** 2026-06-16
> **Type:** Issue
> **Status:** Addressed 2026-06-17
> **Area:** Freeflow artifact review / subagent review behavior

## Summary

During review of `docs/specs/freeflow-output-router-design.md`, a reviewer subagent returned findings. The parent agent treated the findings too much like a patch queue and moved toward revising the spec before first adjudicating the findings with the user.

This exposed a review-loop gap:

- reviewer findings are evidence, not authority;
- parent agents must classify findings before editing;
- second and later review prompts should be updated to reflect owner clarifications and prior findings, not blindly rerun the same broad prompt.

## How We Found It

The parent agent asked a reviewer subagent to review the output-router spec.

The reviewer reported a blocking finding about missing verification-output exactness and non-blocking findings about implementation/runtime boundary and deferred sources.

The parent agent initially summarized the result as "Blocking — revise before implementation planning" and prepared to patch the spec. The user stopped the flow and asked why the agent did not ask first.

On discussion, one finding was valid but narrow:

```text
Verification output used for completion claims should preserve exact relevant evidence.
```

Another finding imported stale framing from an older combined spec:

```text
Keep router separate from proven v0.1 runtime until smoke tests/evals.
```

That framing conflicted with the newer design direction that intentionally avoids v0-style shipping milestones and instead uses a master design plus priority-ordered checklist.

## Why This Matters

Subagent review improves artifacts only when the parent agent remains responsible for judgment.

If the parent treats reviewer findings as commands, it can:

- reintroduce stale assumptions,
- override newly settled design decisions,
- edit durable specs before owner clarification,
- convert reviewer opinion into source truth,
- hide product/workflow decisions inside "review fixes."

This is especially risky for future-agent-facing artifacts, where polished language can become accidental authority.

## Desired Behavior

After receiving reviewer findings, the parent agent should classify each finding before editing:

```text
accepted      the finding is valid and can be applied without changing settled intent
rejected      the finding imports stale assumptions, is not supported, or does not matter
question      applying the finding requires an owner decision
needs evidence more source inspection is required before deciding
```

The parent should ask the owner before applying any finding that would change:

- artifact intent,
- scope,
- source-truth behavior,
- workflow policy,
- security/privacy/billing/data-loss/API/compatibility behavior,
- a decision already settled in the current design session.

Reviewer findings should be presented as hypotheses when they affect owner-owned decisions.

## Second-Iteration Review Prompt Rule

For second and later review iterations, the parent should update the reviewer prompt to match the narrowed situation.

The prompt should include:

- prior findings,
- owner clarifications,
- which findings were accepted or rejected,
- what changed in the artifact,
- what remaining risk the reviewer should focus on.

Do not rerun the same broad prompt when the situation has narrowed or when a previous reviewer imported stale assumptions.

Example prompt note:

```text
Previous reviewer finding about v0.1 runtime boundary was rejected by owner because this design intentionally avoids versioned shipping milestones. Do not re-raise that unless live repo evidence contradicts the new decision. Re-review only whether the updated spec preserves exact verification evidence and remains implementable.
```

## Proposed Fix

Tighten `review-artifact` behavior:

```md
Treat reviewer findings as evidence, not commands.

Before editing, classify each finding as accepted, rejected, question, or needs evidence. Ask the owner before applying a finding that changes artifact intent, scope, source truth, workflow policy, or a settled decision.

For second and later review iterations, update the reviewer prompt with prior findings, owner clarifications, accepted/rejected findings, changed sections, and the remaining review risk. Do not blindly rerun the same broad prompt after the situation has narrowed.
```

Consider adding the same parent-loop rule to any workflow guidance that dispatches review subagents.

## Eval Shape

Create a repeatable eval before changing skill wording.

Suggested fixture:

- artifact under review contains a newer owner decision that supersedes an older planning snapshot;
- reviewer subagent flags the older snapshot as a required boundary;
- baseline failure: parent immediately edits artifact to restore stale boundary;
- with-skill pass: parent classifies the finding as rejected or question, explains why, and asks before editing if owner decision is needed.

Pass criteria:

- treats reviewer findings as hypotheses/evidence;
- classifies each material finding;
- does not edit before adjudication;
- asks the user before applying intent/scope/source-truth changes;
- updates second-iteration review prompts with accepted/rejected findings and owner clarifications.

## Resolution

Implemented in `review-artifact` and `review-work`.

- Parent agents classify material findings as accepted, rejected, question, or needs evidence before editing.
- Non-blocking findings and reviewer questions do not fail artifacts or work by default.
- Second-and-later review prompts carry prior findings, owner clarifications, adjudication, changed sections/files, and remaining risk.
- Three review passes is the hard cap for the same artifact/work and scope; after that, stop, adjudicate, and diagnose the loop instead of editing again or requesting a fourth broad review.

Evidence:

- `plugins/freeflow/evals/reports/by-skill/review-artifact-4-report.md`
- `plugins/freeflow/evals/reports/by-skill/review-work-5-report.md`

## Open Questions

- Should workflow-level guidance also mention the three-review hard cap, or should it remain localized to review skills?
- Should artifact-review evals preserve both the reviewer output and the parent adjudication as separate evidence?
