# Adjudicate Work Review

Read this after an independent work review returns and before selecting what follows from its report.

Adjudication belongs to the receiving active agent. It tests the report against the reviewed state, source truth, and evidence. It is not independent review and does not inherit the reviewer's authority or judgment.

## Dispose Each Material Item

For every material item, choose one disposition.

### Accepted

State:

- the supported implementation problem;
- its consequence for the reviewed boundary;
- whether it is Blocking or Non-blocking;
- whether its cause is supported, unnecessary to select a clear local correction, or uncertain.

### Rejected

State the concrete reason: unsupported, stale, resolved, duplicate, preference-only, out of scope, or based on a source misread.

### Open

State:

- the unresolved concern;
- its potential boundary consequence;
- the missing evidence or owner decision.

When factual evidence is missing, restate the item as a Verify Work input: claim, required observing boundary, available evidence and its limit, and the smallest evidence that could disagree.

A suggested correction may help explain a finding, but it does not establish cause, select the remedy, or authorize implementation.

After disposing the items, derive the adjudicated judgment. Do not separately accept the reviewer's overall judgment.

- **Pass:** no accepted Issues or material Open items remain.
- **Non-blocking:** only accepted Non-blocking Issues remain.
- **Inconclusive:** a material Open item prevents judgment.
- **Blocking:** at least one accepted Blocking Issue remains.

## Use Verification Results

Route a known material evidence gap through [Workflow](../../../skills/workflow/SKILL.md) to [Verify Work](../../../skills/verify-work/SKILL.md). Verification produces factual evidence; it does not revise the reviewer's report or determine the review judgment.

- **Supported:** re-adjudicate the evidence gap. Do not infer Pass.
- **Contradicted:** re-adjudicate against source truth; the result may establish an Issue, invalidate one, or expose a source conflict.
- **Inconclusive:** keep the item Open. The adjudicated review remains Inconclusive when the gap is material.
- **Unavailable:** keep the item Open and state why the required boundary cannot currently be observed.

Select focused independent follow-up only when the new evidence still requires judgment from a separate context.

## Decide Whether Remediation Is Ready

Remediation is ready when:

- required behavior is settled;
- the problem and boundary consequence are supported;
- enough cause or decision basis exists to bound a correction;
- affected interactions and dependencies are known sufficiently;
- no material alternative or user-owned choice remains.

When remediation is ready, state:

- the proposed correction and rationale;
- affected behavior and locations;
- required ordering or constraints;
- regression evidence and verification boundary;
- whether focused independent follow-up remains justified;
- the authority state.

Use existing correction authority only when it covers that result. Otherwise propose the correction and any warranted follow-up once, then wait. A finding, adjudication, or selected review does not authorize mutation.

Actual correction returns to [Execute Work](../../../skills/execute-work/SKILL.md). Preserve the accepted behavior; do not change tests, Specs, policies, or source truth merely to satisfy a reviewer or obtain Pass.

## Route When Remediation Is Not Ready

- unclear or repeated cause: [Diagnose Failure](../../../skills/diagnose-failure/SKILL.md);
- unsettled direction or materially different remedies: [Discuss](../../../skills/discuss/SKILL.md);
- user-owned choice or source conflict: [Decision Gate](../../../skills/decision-gate/SKILL.md);
- missing factual support: route the named claim through [Workflow](../../../skills/workflow/SKILL.md) to [Verify Work](../../../skills/verify-work/SKILL.md);
- uncovered correction: propose the bounded correction and wait.

When findings interact, assumptions are challenged, or user input could change the remedy, report a problem checkpoint and stop before selecting or executing a correction.

## After Authorized Correction

Verify the affected boundary and perform ordinary self-review.

Select focused independent follow-up only when accepted corrections, affected interactions, new evidence, or remaining risk still require judgment from a separate context. Do not dispatch follow-up merely because Review 1 found an Issue or because remediation occurred.

If Review 2 remains Blocking, adjudicate it before acting again. Diagnose a repeated, extending, invalidating, or causally uncertain blocker. Return an independent clear local defect to its owner when diagnosis would add no useful understanding. Review 3 remains exceptional, separately authorized, and final.

## Stop

Stop when every material item is Accepted, Rejected, or Open; the adjudicated judgment is supported; and the next route and authority state are explicit.
