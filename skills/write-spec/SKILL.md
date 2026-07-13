---
name: write-spec
description: Use when turning settled discovery, explicit requirements, validated design direction, or source evidence into a durable behavioral, technical, API, migration, or decision specification that later planning and review can rely on.
---

# Write Spec

Compile shared understanding into source truth. Do not create new intent while making it look polished.

A spec defines the minimum source truth later work must preserve: outcome, scope, observable behavior, constraints, failure semantics, acceptance, and decision status. It is not an implementation plan, review-defense document, or claim that every technical question is already answered.

## Route First

If the user asks a question about a spec, answer it. Do not create or edit the artifact unless asked.

Classify readiness:

- **Planning-ready:** source-backed behavior and owner decisions are sufficient for the next planning horizon.
- **Planning-ready with open implementation questions:** unresolved technical questions can be answered safely through named learning slices without inventing user-visible behavior.
- **Not planning-ready:** behavior, scope, acceptance, public contracts, sensitive policy, failure semantics, or artifact ownership would be guessed.

Planning readiness describes content sufficiency; it does not change the artifact's `Draft` or `Approved` status. When repo policy or an explicit owner gate requires approval, satisfy that gate before planning.

Route work that is not planning-ready to Discover, `../decision-gate/SKILL.md`, or `../design-for-depth/SKILL.md` as appropriate.

Do not re-interview from scratch when discovery already reached shared understanding.

## Source First

Inspect:

- explicit user decisions and current conversation context;
- existing specs, docs, policies, ADRs, tests, and live behavior;
- relevant code when behavior or interfaces already exist;
- current primary sources when external APIs or versions constrain the contract;
- handoffs only as memory, not authority.

Live evidence overrides stale notes. Adjacent repo facts are not permission to invent goals or requirements.

## Hard Stops

Stop before writing when the spec would:

- override docs, tests, policies, ADRs, contracts, or established behavior without explicit owner confirmation;
- invent product behavior, scope, domain meaning, public API, compatibility, security, privacy, billing, permissions, data-loss, migration, or hard-to-reverse architecture;
- hide a user-owned decision as an assumption, placeholder, or polished open question;
- freeze a happy path while consequential failure states, observers, written state, forbidden outcomes, recovery, or proof remain undecided;
- reduce agreed scope into MVP, v1/v2, roadmap, or later-version framing without approval;
- turn a tentative architecture into a settled requirement merely because planning would be easier;
- create a new artifact convention or destination silently.

Name the conflict or missing decision and ask one direct route question.

## Preserve Decision State

Carry discovery state honestly:

- **Settled:** source-backed fact or explicit decision; write as contract.
- **Tentative:** plausible direction; label it provisional and do not make dependent requirements irreversible.
- **Open:** unresolved and path-changing; block only the planning horizon it affects.
- **Test during implementation:** safe technical uncertainty with a named question and evidence expectation.
- **Deferred:** outside the current planning horizon without changing agreed scope.
- **Invalidated:** remove from active direction and record why only when future readers could repeat it.

A spec may remain revisable. New implementation evidence changes it through an explicit backward route, not a silent rewrite.

## Write The Contract

Begin every durable spec with one clear H1 title, followed immediately by the compact document-information header defined in the artifact standards reference, then adapt this shape. Preserve repo conventions that do not change that order. If a required parser or artifact format conflicts with title-first ordering, name the conflict and use the Decision Gate instead of silently reversing it:

- Problem and intended outcome.
- Actors or callers when relevant.
- In scope and out of scope.
- Requirements and invariants.
- Observable behavior, including edge and error behavior.
- Public interface, compatibility, migration, security, privacy, billing, permissions, or data-safety constraints when relevant.
- Failure contract for consequential operations.
- Acceptance criteria and the evidence class likely to prove each.
- Settled decisions, tentative direction, implementation-testable questions, and blocked owner decisions.
- Source evidence.

Read [spec shapes](references/spec-shapes.md) when artifact type changes the contract. Read [artifact standards](references/artifact-standards.md) for title, compact document information, and durable or future-agent-facing identity. Read [decision records](references/decision-records.md) when a hard-to-reverse, surprising, tradeoff-driven decision may deserve a durable ADR or decision note.

Do not include volatile file inventories, guessed task lists, or complete implementation code. Include a code/type/state sketch only when it expresses an accepted contract more precisely than prose.

## Self-Check The Spec

Before finishing, self-check in order: first self-verify load-bearing claims, decisions, and acceptance against their sources; only when supported, silently self-review the spec once for downstream fitness:

- Can planning distinguish required behavior from scope creep?
- Can each acceptance criterion become a check, observation, or explicit unsupported claim?
- Are user-owned decisions settled for the immediate horizon?
- Are public and failure contracts explicit only where callers need them?
- Are implementation-testable questions safe to defer?
- Can a concise provisional plan safely be written before independent artifact review?

Correct local clarity, consistency, or traceability problems directly. Read `../review-artifact/SKILL.md` when richer artifact lenses would help, but treat that as enhanced self-review unless a formal independent boundary was selected. Surface only gaps that change behavior, authority, readiness, or route.

## Choose The Artifact Review Route

Because the spec is upstream source truth, choose its artifact-review route before planning:

- **Combined:** the spec is planning-ready, a concise provisional plan is cheap and reversible, and one reviewer can judge the spec first and then the plan.
- **Spec first:** the spec is a high-risk approval gate, planning would commit expensive or hard-to-reverse assumptions, or unresolved spec defects could make the plan misleading. Review the plan separately after the spec passes; both reviews belong to the standing artifact route and need no reconfirmation.
- **Spec only:** the task ends with the spec or no plan is currently needed.

A consequential durable spec requires this standing-authorized independent review without user reconfirmation. If the task ends with the spec, its artifact review also satisfies final review. Lightweight chat guidance does not create the checkpoint. A bypassed durable artifact remains unreviewed and cannot authorize implementation.

Record the selected route in the completion report or durable artifact metadata only when a future context needs it. Do not ask the user to choose between combined and sequential review unless the tradeoff itself is user-owned.

## Completion

Report:

- artifact path;
- source context used;
- readiness classification and artifact-review route;
- open and implementation-testable questions;
- decisions that still block a later phase;
- recommended next route.

Writing the spec does not approve a plan or implementation.
