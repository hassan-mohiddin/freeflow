# Artifact Review

Read this before reviewing a document that will guide later work: a Spec, Plan, design, decision record, ADR, Handoff, skill, or another durable artifact. A Working Record is reviewed with [Report And Record Review](report-and-record.md).

This reference is judgment; Review Work's Rules still bind.

## Establish The Artifact And Its Intended Use

Goal: review the whole artifact, for the use it must actually serve.

Identify the artifact's exact state, type, intended use, accepted outcome and amendments, non-goals, governing format, source basis, unresolved questions, dependencies, and evidence gaps. Inspect the complete artifact and relevant sources directly, not only its author's narrative.

## Establish Which Sources Govern

Goal: judge against current accepted intent, not the artifact's own baseline.

Check current intent and accepted upstream requirements before dependent artifacts. Follow material amendments, supersession, and deliberately selected experimental findings. Do not infer acceptance from a proposal, a review label, a passing test, or an unexplained "user approved" summary.

Distinguish accepted behavior from the suggested implementation mechanism, and check both directions: has the artifact introduced stronger obligations than the accepted outcome needs, and has it omitted accepted changes or kept a superseded baseline? An experiment can establish a fact without selecting it for production; an implementation Plan cannot ignore later accepted learning because its older version was reviewed.

If upstream content is unresolved or contradictory, mark dependent material contingent rather than generating exhaustive downstream findings against an unsettled premise.

Use [Action Selection](../../../skills/action-selection/SKILL.md) when source inspection could branch broadly; skip it for an obvious artifact or dependency read.

## Judge The Artifact By Its Job

Goal: ask of each artifact only what its job requires.

- **Spec or content contract:** the accepted behavior, boundaries, evidence, and uncertainty needed for its intended use.
- **Plan:** a supported ordered strategy, dependencies, assumptions, checks, and invalidation conditions.
- **Decision record or ADR:** the choice, owner, source, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** enough truthful point-in-time context for safe continuation without replacing the live record.
- **Other artifact:** its declared purpose without taking over another artifact's job.

A proposal can be fit for discussion without being implementation-ready. Do not block on an open question the artifact intentionally preserves and whose answer its current use does not need.

## Apply The Lenses

Goal: use only the lenses that can change fitness.

- **Source alignment:** accepted requirements, amendments, decisions, and live facts agree with the artifact.
- **Sufficiency:** it contains enough for its use without implying every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded material cannot be confused.
- **Evidence and acceptance:** load-bearing claims and completion conditions have suitable observing or falsifying mechanisms.
- **Failure and risk:** consequential states, forbidden outcomes, observers, and recovery are defined where required.
- **Dependency integrity:** relevant upstream and downstream sources agree, or their contingency is explicit.
- **Scope and minimality:** requirements and process are justified rather than speculative or mechanically exhaustive.
- **Clarity and continuity:** a future reader can use the artifact without reconstructing the author's private reasoning or the full transcript.

Do not demand implementation detail from a PRD, progress history from a Plan, or universal guarantees from a bounded prototype report.

## Where Revisions Go

Actual revision returns to the artifact's owning skill. In self-review after a revision, repeat source alignment along with the affected lenses, once.
