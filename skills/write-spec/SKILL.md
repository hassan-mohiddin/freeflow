---
name: write-spec
description: Use when writing or revising a spec, PRD, issue, API contract, technical design, migration contract, decision artifact, or similar durable document.
---

# Write Spec

Turn clear intent and source evidence into a durable artifact that later work can rely on.

A spec may be broad, deep, or both. Its shape follows its intended use. It is not a transcript, implementation plan, Working Record, or polished substitute for an unresolved decision.

## Identify The Artifact

Before writing, establish:

- artifact type and intended use;
- audience or future action it must support;
- accepted intent, scope, and source context;
- destination and repository convention;
- unresolved questions that belong in the artifact.

If the user is asking about an artifact, answer instead of writing one. If direction or alternatives still need shared understanding, read [Discuss](../discuss/SKILL.md). If one user-owned choice or source conflict blocks writing, read [Decision Gate](../decision-gate/SKILL.md).

Do not repeat discussion that already settled the artifact's intent.

## Write From Source

Inspect the sources that define the artifact:

- explicit user decisions and current shared understanding;
- [Track Work](../track-work/SKILL.md), which owns the living Working Record for current state, slices, task-local decisions, and evidence, when one exists;
- relevant code, tests, requirements, policies, ADRs, and established behavior;
- existing artifacts that this one revises or depends on;
- current primary sources when an external contract or version matters.

Use a Working Record as task memory, not authority over contradictory user decisions or live evidence. Distinguish accepted facts and decisions from hypotheses, proposals, and unresolved questions.

Do not infer goals or requirements from adjacent repository details merely because they are available.

## Shape The Artifact By Its Job

Read [spec shapes](references/spec-shapes.md) and use only the sections that help the artifact perform its intended job. Read [artifact standards](references/artifact-standards.md) when choosing a durable destination, identity, status, or revision shape. Read [decision records](references/decision-records.md) when the artifact records a durable decision.

Include, when relevant:

- purpose, context, scope, and accepted content;
- behavior, design, interfaces, constraints, and consequential failure semantics required by the artifact;
- acceptance and suitable evidence;
- accepted decisions, clearly marked uncertainty, and source references.

A technical design may go deeply into architecture, interfaces, ownership, state, and failure behavior. Do not remove useful depth merely to keep the artifact short.

Do not turn the artifact into ordered execution phases, task status, slice history, or a volatile file inventory. Ordered execution belongs in a Plan; living task state belongs in the Working Record.

## Stop Before Inventing Intent

Stop when writing would:

- invent or silently change product behavior, scope, requirements, public interfaces, compatibility, sensitive policy, failure semantics, or hard-to-reverse design;
- override code, tests, docs, policies, ADRs, or established behavior without resolving the conflict;
- present a tentative proposal or assumption as accepted;
- hide an owner decision behind `TBD`, polished prose, or an unmarked open question;
- reduce agreed scope into MVP, v1/v2, roadmap, or later-version framing without approval;
- create a destination or artifact convention whose authority or durability matters without resolving it.

Ask only for the decision that prevents the artifact from serving its intended use. Otherwise represent uncertainty honestly and continue.

## Revise Deliberately

When revising an artifact:

- preserve accepted content that still holds;
- update only what new intent or evidence changed;
- keep superseded decisions and material rationale recoverable through the owning decision record, change history, or version control.

Do not rewrite history or synchronize unaffected artifacts. A clerical correction does not reopen settled intent; a material revision changes the artifact's review boundary and may affect its dependencies.

## Self-Check

Silently review the artifact before routing it onward:

- Does it perform its stated job?
- Does it agree with accepted intent and source evidence?
- Can a future reader distinguish required, tentative, open, deferred, and superseded information?
- Is it broad and deep enough for its intended use without taking over another artifact's job?
- Are consequential claims, failure behavior, and acceptance supported or explicitly unresolved?
- Did writing introduce any decision the user did not make?

Correct clear local issues directly. Surface only unresolved material issues that prevent the artifact from being fit for use.

## Review The Artifact

After writing or materially revising the artifact, route it to [Review Artifact](../review-artifact/SKILL.md) before treating it as fit for its intended use.

Provide the reviewer with the complete artifact, its intended use, source truth, dependencies, and known evidence gaps. Review Artifact owns review items, judgment, adjudication, and the review cycle.

## Report

State:

- artifact path, type, and intended use;
- source context used;
- material unresolved questions or blocked decisions;
- artifact-review status.
