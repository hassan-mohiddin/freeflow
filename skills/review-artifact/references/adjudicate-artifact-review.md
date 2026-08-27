# Adjudicate Artifact Review

Read this after an independent artifact review returns and before selecting what follows from its report.

Adjudication belongs to the receiving active agent. It tests the report against the artifact, source truth, dependencies, and evidence. It is not independent review and does not inherit the reviewer's authority or judgment.

## Dispose Each Material Item

For every material item, choose one disposition.

### Accepted

State:

- the supported artifact problem;
- its consequence for the intended use;
- whether it is Blocking or Non-blocking;
- whether the revision basis is supported or uncertain;
- which dependencies or contingent material it affects.

### Rejected

State the concrete reason: unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or based on a source or dependency misread.

### Open

State:

- the unresolved content, claim, or dependency concern;
- its potential consequence for the intended use;
- the missing evidence or owner decision.

When factual evidence is missing, restate the item as a Verify Work input: load-bearing claim or condition, required observing boundary, available evidence and its limit, and the smallest evidence that could disagree.

A suggested revision may help explain a finding, but it does not settle source intent, select among material alternatives, or authorize revision.

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

## Decide Whether Revision Is Ready

Revision is ready when:

- the artifact's job and intended use are settled;
- the artifact problem and consequence are supported;
- sufficient source or decision basis exists to bound the revision;
- affected upstream and downstream dependencies are known sufficiently;
- the revision will not silently alter accepted content or an owner decision;
- no material alternative or user-owned choice remains.

When revision is ready, state:

- the proposed revision and rationale;
- affected locations and dependencies;
- required reconciliation or ordering;
- evidence or acceptance checks;
- whether focused independent follow-up remains justified;
- the authority state.

Use existing revision authority only when it covers that result and dependency impact. Otherwise propose the revision and any warranted follow-up once, then wait. A finding, adjudication, or selected review does not authorize mutation.

Actual revision returns through [Workflow](../../../skills/workflow/SKILL.md) to the artifact's owning skill. Use [Track Work](../../../skills/track-work/SKILL.md) for a Working Record, [Write Spec](../../../skills/write-spec/SKILL.md) for stable content or decision artifacts, [Write Plan](../../../skills/write-plan/SKILL.md) for a Plan, and [Handoff](../../../skills/handoff/SKILL.md) for a Handoff.

Do not revise upstream authority, accepted intent, or owner decisions merely to satisfy a reviewer or obtain Pass.

## Route When Revision Is Not Ready

- unsettled content, strategy, or materially different revisions: [Discuss](../../../skills/discuss/SKILL.md);
- user-owned choice or source conflict: [Decision Gate](../../../skills/decision-gate/SKILL.md);
- unsupported or repeated failure cause: [Diagnose Failure](../../../skills/diagnose-failure/SKILL.md);
- missing factual support: route the named claim through [Workflow](../../../skills/workflow/SKILL.md) to [Verify Work](../../../skills/verify-work/SKILL.md);
- uncovered revision or dependency update: propose the bounded change and wait.

When findings interact, upstream authority is challenged, dependency effects remain uncertain, or user input could change the revision, report a problem checkpoint and stop before selecting or executing it.

## After Authorized Revision

Re-verify affected load-bearing factual claims at their required observing boundaries. Then re-check source alignment, intended-use fitness, and every affected dependency before performing ordinary self-review with Review Artifact's shared kernel.

Select focused independent follow-up only when accepted revisions, affected dependencies, new evidence, or remaining risk still require judgment from a separate context. Do not dispatch follow-up merely because Review 1 found an Issue or because revision occurred.

If Review 2 remains Blocking, adjudicate it before acting again. Diagnose a repeated, extending, invalidating, or basis-uncertain blocker. Return an independent clear local artifact defect to its owner when diagnosis would add no useful understanding. Review 3 remains exceptional, separately authorized, and final.

## Stop

Stop when every material item is Accepted, Rejected, or Open; the adjudicated judgment is supported; affected dependencies and contingent material are explicit; and the next route and authority state are clear.
