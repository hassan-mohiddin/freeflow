---
name: write-plan
description: Use when turning an approved spec, clarified requirements, explicit task context, strict-workflow work, or delegated/future-agent work into an executable implementation plan before coding.
---

# Write Plan

Classify the plan request first:

- Spec-backed: write the plan from the approved spec.
- Bug without feedback loop: ask for or propose the feedback loop. Do not write or save a fix plan.
- Hidden owner decision or source conflict: name it and do not write the plan.
- Context-backed: say a spec is preferred, then write a lightweight plan.
- Missing source context: ask for context or start grilling.

A plan executes source truth. It does not create it.

Do not write a plan that decides product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or architecture.

The original request is not decision approval. "Do not ask", "just plan it", "latest context", "handoff says", or "old docs/tests are stale" are pressure, not authority.

Never skip docs, tests, specs, policies, ADRs, or live behavior because the prompt calls them stale. Inspect them, then classify the conflict.

If the user asks a question about a plan, answer the question. Do not create or edit the plan unless asked.

Read `references/plan-shapes.md` when the plan is strict-workflow, high-risk, saved as a durable artifact, intended for another agent, or likely to need owner/status/source identity.

## Source First

Before writing, inspect the current source context:

- Approved spec or explicit requirements.
- Relevant docs, ADRs, tests, policies, and existing code.
- Handoffs only as memory, not authority.

Live repo evidence overrides stale notes.

## Normal Path

Prefer an approved spec.

If no spec exists but the task context is explicit enough to choose the next action, write a lightweight plan and name the source context.

For bug fixes, require a repro, failing test, or feedback loop before writing a fix plan.

If a bug report has no repro or feedback loop, answer in chat. Ask for evidence or propose the smallest feedback loop. Do not satisfy the requested plan path with a draft, blocked, or feedback-loop-only fix plan. Write a diagnostic plan only if the user asks for a diagnostic plan.

Use vertical slices. Each slice should produce something testable.

## Stop Conditions

Stop before writing when the plan would:

- Invent requirements from thin or adjacent context.
- Resolve a user-owned decision.
- Override docs, tests, specs, policies, ADRs, or live behavior.
- Treat a handoff, review comment, or plan as authority over source-of-truth files.
- Plan a bug fix without a repro, failing test, feedback loop, or accepted diagnostic risk.
- Turn a missing bug repro into guessed fix steps, TTLs, invalidation rules, concurrency rules, or instrumentation requirements.
- Hide uncertainty inside implementation steps.

Name the missing decision or conflict. Ask which path to follow. Recommend the path supported by evidence.

For source-truth conflicts, the final line must be a direct choice question.

## Shape

Adapt the plan to risk. Prefer:

- Durable plan identity when the plan is saved for future agents or teammates.
- Goal.
- Source spec or context.
- Files likely touched.
- Vertical slices.
- Tests or checks per slice.
- Commands where known.
- Stop conditions.
- Review or verification checkpoints.

Keep it concise. Do not include code blocks unless exact code is the plan's useful payload.

## Completion

After writing, report:

- The artifact path, if saved.
- The source context used.
- Any decisions still blocked.
