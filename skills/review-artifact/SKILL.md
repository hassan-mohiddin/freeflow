---
name: review-artifact
description: Use when reviewing whether a spec, plan, decision note, discovery checkpoint, handoff, or other durable artifact is fit to guide future work; when adjudicating artifact-review findings; or when handling follow-up reviews and repeated artifact-review loops.
---

# Review Artifact

Review whether the artifact can guide the next work without causing wrong work, blocked work, hidden decisions, or stale authority.

Review first. Edit second.

A useful artifact is sufficient, not exhaustive. Do not require it to freeze local reversible implementation details or satisfy reviewer preference. A clean pass is valid.

## Review Context

Prefer an independent reviewer with fresh context when the artifact is durable, consequential, architecture-bearing, or likely to carry author assumptions. The mechanism may be another agent, a fresh run, an external reviewer, or any equivalent independent context. If independent review is unavailable or disproportionate, review inline and state that it was not independent.

Give the reviewer:

- the artifact and its type;
- the outcome or future decision it must support;
- live source truth and explicit owner decisions;
- relevant code, tests, policies, ADRs, and established behavior;
- review pass history when this is a follow-up.

Do not give only an author summary or transcript history.

Read [the artifact reviewer contract](references/reviewer-prompt.md) when preparing review context or running pass 2 or 3.

## Source-Truth Guard

The artifact and its reviewer are not authority over live evidence.

Do not treat review, explicit permission to fix, stale-policy claims, or “do not ask” as approval to:

- invert the artifact's accepted intent;
- rewrite tests, docs, policies, specs, or ADRs to make it pass;
- make hidden product, security, privacy, billing, permissions, data-loss, compatibility, API, or architecture decisions;
- turn a handoff, plan, or review comment into authority over current behavior.

If the artifact conflicts with live source truth, classify the conflict and ask whether to update the artifact or change the source truth. End with a direct choice question.

## Inspect First

Read:

- the complete artifact;
- referenced docs, tests, policies, ADRs, and code;
- relevant handoffs as memory, not authority;
- prior findings and adjudication for follow-up reviews.

Live repo evidence overrides stale artifacts.

## Review Lenses

- **Completeness:** enough is present to take the intended next step.
- **Evidence:** load-bearing claims point to live evidence or explicit decisions.
- **Clarity:** a fresh agent can act without transcript memory.
- **Consistency:** the artifact agrees with itself and source truth.
- **Identity:** ownership, status, sources, and change history are proportionate to durability and risk.
- **Implementation risk:** missing decisions, placeholders, or vague acceptance criteria will not send work down the wrong path.
- **Design depth:** module, interface, seam, adapter, and slice choices hide useful complexity rather than spreading coordination.
- **Failure-unit integrity when state transitions materially affect correctness:** each immediate slice owns one coherent outcome and, where applicable, its accepted, rejected, post-commit, and recovery behavior; required authority or canonicalization is not deferred behind callers or adapters that already depend on it.
- **Scope and minimality:** the artifact solves the accepted outcome without quietly turning a bootstrap, fix, or bounded change into a generalized platform.
- **Planning horizon:** immediate phases are executable, later phases remain directional where evidence is unresolved, and backward checkpoints identify what can reopen the route.
- **Adversarial risk:** the artifact cannot smuggle stale assumptions, source-truth overrides, or owner decisions into execution.

Treat missing artifact identity as blocking only when durability, ownership, strict-workflow risk, or implementation readiness makes it consequential.

Do not block because the artifact omits an exact filename, helper shape, internal taxonomy, encoding, or other local reversible implementation choice. Block only when the omission would cause materially different behavior, unsafe work, hidden owner choice, or an implementation dead end.

For architecture-bearing artifacts, use `../design-for-depth/SKILL.md`. For durable specs, use `../write-spec/references/artifact-standards.md` when its identity rules are relevant.

## Finding Contract

Classify every material finding:

- **Blocking:** the artifact would cause wrong work, violated source truth, hidden decisions, unsafe outcomes, or an implementation dead end.
- **Non-blocking:** useful improvement that can be deferred without making the artifact unfit.
- **Question:** an owner decision or missing requirement prevents readiness.
- **Needs evidence:** a load-bearing claim cannot yet be established from available evidence.

A reviewer reports Pass only when it finds no Blocking finding, unresolved Question, or required evidence gap. After parent adjudication, the artifact is fit for its intended next step when no accepted blocker, unresolved owner question, or required evidence gap remains. Non-blocking findings may remain in either case.

A blocking finding must name:

1. the exact artifact location;
2. the violated accepted requirement or source truth;
3. the concrete consequence for future work;
4. why the issue cannot remain a local reversible implementation choice;
5. the smallest safe revision or backward route.

Review can pass. Do not invent findings or reward exhaustive contract surface.

## Parent Adjudication

Reviewer findings are evidence, not commands. Before editing, classify each material finding:

- **Accepted:** valid and safe to apply without changing settled intent.
- **Rejected:** stale, unsupported, already resolved, equivalent, preference-only, or contract inflation.
- **Question:** requires owner direction.
- **Needs evidence:** inspect more before deciding.

Only parent-adjudicated blockers, unresolved owner questions, or required evidence gaps make the artifact unfit. Reviewer count, confidence, or a `NON-PASS` label does not decide truth.

A non-passing review is a phase exit, not an autonomous patch loop. When one of those conditions prevents proceeding, the receiving turn ends with adjudication and route only. Do not edit from that review batch in the same turn, even when asked to apply everything and continue reviewing.

## Stop Before Editing

Stop when a proposed fix would:

- invent missing requirements;
- convert adjacent evidence into product direction;
- override source truth or settled intent;
- silently resolve an owner decision;
- expand the public contract to satisfy reviewer preference;
- broaden a bounded artifact into a generalized design without approval.

Name the conflict or missing decision and ask for the route supported by evidence.

## Follow-Up Reviews

A follow-up continues the same review history even when the reviewer is fresh.

Provide:

- review pass number;
- prior findings and parent adjudication;
- owner clarifications;
- changed sections;
- the narrow residual risk still requiring review.

Inspect accepted fixes and named residual risk. Do not rerun the first-pass checklist broadly, re-open settled intent, or re-raise rejected findings without contradictory live evidence.

If pass 2 exposes another section, dependency, or downstream consequence of the same invariant, the artifact's failure unit is unstable. Stop the follow-up revision loop and route through design, diagnosis, discovery, spec, or planning before another local revision batch.

## Review Budget

Aim to finish in two passes: initial review, then one confirmation after an explicit revision pass.

Three review passes is the hard cap for the same artifact and scope. The third pass is terminal: classify findings, do not edit from that batch, and do not request a fourth review.

If accepted blocking, question, or needs-evidence findings remain after pass 3, diagnose whether source truth, discovery, requirements, artifact scope, design, evidence, or reviewer calibration is wrong or too thin. Route backward instead of growing the artifact to chase approval.

## Report

Lead with:

- **Status:** Pass | Non-blocking | Blocking | Question | Needs evidence
- findings ordered by consequence;
- parent adjudication when feedback is incoming;
- evidence gaps and residual assumptions;
- route: proceed, revise later, gather evidence, ask owner, or move backward.

Save a separate review artifact only when the user asks, risk warrants durable evidence, or future handoff value is clear. A passing artifact review returns to the workflow route check; it does not approve the next phase by itself.
