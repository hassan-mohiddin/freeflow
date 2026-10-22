# Adjudicate A Returned Review

This reference is judgment; Review Work's Rules still bind. Adjudication belongs to the receiving active agent. It tests the report against the reviewed state or artifact, source truth, dependencies, and evidence. It is not independent review and does not inherit the reviewer's authority or judgment.

## Dispose Each Material Item

For every material item, choose one disposition.

### Accepted

State:

- the supported problem in the work or the artifact;
- its consequence for the reviewed boundary or the intended use;
- whether it is Blocking or Non-blocking;
- for work, whether its cause is supported, unnecessary to select a clear local correction, or uncertain; for an artifact, whether the revision basis is supported or uncertain;
- for an artifact, which dependencies or contingent material it affects.

### Rejected

State the concrete reason: unsupported, stale, resolved, duplicate, preference-only, out of scope or outside the artifact's job, or based on a source or dependency misread.

Never close a security finding (one about what [Security Risk Lens](work.md#security-risk-lens) covers) as Rejected on your own: give the user the finding and your reason, and keep it Open until they agree.

### Open

State:

- the unresolved concern, content, claim, or dependency;
- its potential consequence for the boundary or the intended use;
- the missing evidence or owner decision.

When factual evidence is missing, hand the item to Verify Work as a Needs evidence item, with the fields Review Work's classification gives one.

A suggested correction or revision may help explain a finding, but it does not establish cause, settle source intent, select the remedy or among material alternatives, or authorize implementation or revision.

## Derive The Judgment

After disposing the items, derive the adjudicated judgment with Review Work's independent-judgment ladder, counting only Accepted Issues and material Open items. Do not separately accept the reviewer's overall judgment.

Pass permits proceeding at the reviewed boundary or with the intended use. Non-blocking permits it with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents crossing the boundary or the disputed use and returns the smallest supported correction, revision, or reconsideration to its owner (for an artifact, its owning skill).

## Use Verification Results

Route a known material evidence gap to [Verify Work](../../../skills/verify-work/SKILL.md). Verification produces factual evidence; it does not revise the reviewer's report or determine the review judgment. By its claim result:

- **Supported:** re-adjudicate the evidence gap. Do not infer Pass.
- **Contradicted:** re-adjudicate against source truth; the result may establish an Issue, invalidate one, or expose a source conflict.
- **Inconclusive:** keep the item Open. The adjudicated review remains Inconclusive when the gap is material.
- **Unavailable:** keep the item Open and state why the required boundary cannot currently be observed.

Select focused independent follow-up only when the new evidence still requires judgment from a separate context.

## Decide Whether The Correction Or Revision Is Ready

It is ready when:

- required behavior is settled, or for an artifact, its job and intended use are settled;
- the problem and its consequence are supported;
- enough cause, source, or decision basis exists to bound the correction or revision;
- affected interactions and upstream and downstream dependencies are known sufficiently;
- for an artifact, the revision will not silently alter accepted content or an owner decision;
- no material alternative or user-owned choice remains.

When it is ready, state:

- the proposed correction or revision and its rationale;
- affected behavior, locations, and dependencies;
- required ordering, constraints, or reconciliation;
- regression evidence, acceptance checks, and the verification boundary;
- whether focused independent follow-up remains justified;
- the authority state.

Use existing correction or revision authority only when it covers that result (for an artifact revision, also its dependency impact). Otherwise propose the change and any warranted follow-up once, then wait. A finding, adjudication, or selected review does not authorize mutation.

Actual correction of work returns to [Execute Work](../../../skills/execute-work/SKILL.md). Actual revision of an artifact returns to the artifact's owning skill: [Track Work](../../../skills/track-work/SKILL.md) for a Working Record or a handoff, and [Write Docs](../../../skills/write-docs/SKILL.md) for a Spec, Plan, decision record or documentation.

When it is not ready, route it as Review Work's "Route A Problem To Its Owner" says. When findings interact, assumptions or upstream authority are challenged, dependency effects remain uncertain, or user input could change the remedy or revision, report a problem checkpoint and stop before selecting or executing it.

## After An Authorized Correction Or Revision

For work, verify the affected boundary and perform ordinary self-review. For an artifact, re-verify affected load-bearing factual claims at their required observing boundaries, then re-check source alignment, intended-use fitness, and every affected dependency before ordinary self-review with the artifact lenses.

Whether a follow-up review is warranted, and what to do when Review 2 or 3 remains Blocking, is Review Work's "Bound Independent Review". Do not dispatch follow-up merely because Review 1 found an Issue or because a correction or revision occurred.

## Record The Review

Append the dispositions, each with its reason, and the derived judgment to the saved report (`scratch/reviews/R<n>-report.md` when the task has a task directory; otherwise give them in the hand-over report). Keep Rejected items and their reasons, so a rejection can be checked later against what turned out to be true.

When the task has a Working Record, then record one `Review` Material update per independent review through [Track Work](../../../skills/track-work/SKILL.md), in the shape its [format reference](../../../skills/track-work/references/working-record-format.md) defines. Its judgment is the adjudicated one, not the reviewer's; its effect is the next route.

## Stop

Stop when every material item is Accepted, Rejected, or Open; the adjudicated judgment is supported; for an artifact, affected dependencies and contingent material are explicit; and the next route and authority state are clear.
