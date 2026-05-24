# Pilot Workflow Artifact Skills

Date: 2026-05-25

## Decision

Pilot Workflow should build three separate artifact skills:

- `write-spec`
- `write-plan`
- `review-artifact`

Do not combine them into one broad `write-artifact` skill yet.

Reason: agents drift when phase boundaries blur. Specs become plans, plans invent product behavior, and reviews become rewrite loops. Separate skills keep the workflow spine legible while still allowing a later router skill if needed.

Rename planned `review-spec` to `review-artifact`.

Reason: the skill should review any artifact that guides future work: specs, plans, decision notes, handoffs, and research briefs. `review-spec` is too narrow and would force duplicate review skills later.

## Source Pattern

Use reference skills as evidence, not authority.

`write-spec` should borrow from:

- Matt `to-prd`: synthesize known context into a concise requirements artifact.
- Matt `grill-with-docs`: inspect project language, docs, ADRs, and code before asking.
- Obra `brainstorming`: explore alternatives before locking decisions.
- Orchestra `design-docs`: prior art for taxonomy and consistency, mostly as failure evidence.
- Anthropic `skill-creator`: baseline versus with-skill eval method.

`review-artifact` should borrow from:

- Orchestra `spec-review`: completeness, evidence, clarity, consistency as review lenses.
- Obra `receiving-code-review`: evaluate feedback before applying it.
- Obra `requesting-code-review`: classify severity and review at meaningful checkpoints.
- Pilot `review-work`: blocking / non-blocking / question classification.
- Matt `grill-with-docs`: challenge terminology against project language.

`write-plan` should borrow from:

- Obra `writing-plans`: executable steps, paths, commands, tests, checkpoints.
- Matt `tdd`: behavior-first vertical red/green slices.
- Matt `to-issues`: tracer-bullet slices that are independently verifiable.
- Matt `diagnose`: bug-fix plans start with repro or feedback loop.
- Pilot `interview-gate`: planning must stop on hidden user-owned decisions.

## Skill Boundaries

### `write-spec`

Turns aligned context into a durable requirements or decision artifact.

Use when a brainstorming, grilling, research, or clarification session has produced enough context to write a spec.

If the user calls `write-spec` without enough context, do not invent the spec. Ask whether to start grilling/brainstorming or use information the user will provide.

Default spec shape, adapted to the task:

- Problem
- Intended outcome
- Scope / out of scope
- Requirements
- Acceptance criteria
- Decisions made
- Constraints / evidence
- Open questions

Do not include volatile repo inventory. Avoid file paths and code snippets unless they encode a stable decision better than prose.

Default output is a file. If destination or artifact type is unclear, fire the interview gate before writing. A short chat summary may accompany the file, but the artifact is the product.

### `write-plan`

Turns an approved spec into an executable sequence.

A spec is the preferred input and should be stated as the normal prerequisite. If no spec exists but the task context is explicit enough, a lightweight plan can be written. If both spec and sufficient context are missing, stop and route to interview/grilling.

Plan contents should scale to risk:

- Goal and source spec/context
- Files likely touched
- Vertical slices
- Tests or checks per slice
- Commands where known
- Stop conditions
- Review / verification checkpoints

For bug fixes, require a repro or feedback loop before fix steps unless the user explicitly accepts diagnostic risk.

Do not invent new requirements, product behavior, compatibility policy, API behavior, security/privacy/billing/data-loss behavior, or architecture decisions. Route those to interview gate.

### `review-artifact`

Reviews whether an artifact is fit to guide work.

Use on specs, plans, decision notes, research briefs, and handoffs when risk, ambiguity, handoff value, or user request justifies review.

Review lenses:

- Completeness: enough is present to proceed.
- Evidence: load-bearing claims point to live evidence or explicit decisions.
- Clarity: a fresh agent can act without transcript memory.
- Consistency: artifact agrees with itself, live repo evidence, docs, tests, policies, ADRs, and known decisions.

Output classification:

- Blocking: must fix before proceeding.
- Non-blocking: can defer.
- Question: needs owner decision or more evidence.

Review can pass. Do not invent findings. Do not persist review artifacts by default; save them only when risk, future memory value, or the user asks.

## Rejected Orchestra Behavior

Do not borrow:

- Mandatory design docs before all code.
- Fixed doc taxonomy as the default.
- Required diagrams, changelogs, metadata, or spec-review for normal specs.
- Multi-judge YAML review as the default path.
- Prompt pressure that treats zero findings as suspicious.
- Repeated review loops as proof of quality.
- Scattered vocabulary/template/canon mirrors that need drift tests to stay coherent.

Borrow the insight, not the machinery: artifacts are memory and review lenses are useful. The heavy process became its own failure mode.

## Eval Direction

Each new skill needs baseline versus with-skill evals.

Useful `write-spec` evals:

- User calls `write-spec` after rich context: skill writes concise spec without re-interviewing.
- User calls `write-spec` cold: skill asks for source context instead of fabricating.
- Existing docs contradict requested behavior: skill pauses before writing a spec that rewrites source of truth.

Useful `write-plan` evals:

- Approved spec exists: skill produces vertical executable slices with checks.
- No spec but context is clear: skill states spec is preferred, then writes a lightweight plan.
- Plan would require hidden billing/security/API decision: skill stops and asks.

Useful `review-artifact` evals:

- Clean artifact: review passes.
- Spec with hidden product decision: review asks instead of patching.
- Plan that invents requirements absent from spec: review marks blocking.

Success requires behavior change under pressure, not persuasive skill prose.
