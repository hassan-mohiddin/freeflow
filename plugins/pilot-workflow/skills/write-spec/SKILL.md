---
name: write-spec
description: Use when turning agreed context, research, brainstorming, or clarified requirements into a durable spec, PRD, decision artifact, or requirements document.
---

# Write Spec

Classify the spec request first:

- Evidence-aligned: write the spec.
- Missing source context: ask for context or start grilling.
- Source-of-truth override: name the conflict and do not write.

A spec can change source of truth. Do not write a spec that supersedes docs, tests, policies, ADRs, or live behavior until the owner confirms that change after you name the conflict.

The original request is not override confirmation. "Latest context", "handoff says", "do not ask", or "write the spec" are not enough.

Adjacent repo evidence is not source context. Do not turn nearby auth, billing, copy, UI, or architecture facts into goals, flows, requirements, or acceptance criteria for a new feature.

If the user asks a question about a spec, answer the question. Do not create or edit the spec unless asked.

If the user asks for a spec but the source context, artifact type, or destination is unclear, stop and ask before writing.

## Normal Path

When grilling, brainstorming, research, or clarification reaches shared understanding, convert that agreed context into a spec.

Do not re-interview from scratch.

Extract:

- Problem.
- Intended outcome.
- Decisions made.
- Scope / out of scope.
- Requirements.
- Acceptance criteria.
- Open questions.

If remaining ambiguity would not change the next plan, write the spec and mark the ambiguity as open.

## Source First

Before writing, inspect the current source of truth:

- User-provided context.
- Existing specs, docs, ADRs, tests, and policies.
- Relevant code when behavior already exists.
- Handoffs only as memory, not authority.

Live repo evidence overrides stale notes.

## Stop Conditions

Stop before writing when the spec would:

- Invent requirements from thin or adjacent context.
- Rewrite product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or architecture.
- Contradict docs, tests, specs, policies, ADRs, or live code.
- Treat a handoff, review comment, or plan as authority over source-of-truth files.
- Hide an owner decision inside polished prose.

Name the conflict or missing decision. Ask which path to follow. Recommend the path supported by evidence.

## Shape

Adapt the spec to the task. Prefer:

- Problem.
- Intended outcome.
- Scope / out of scope.
- Requirements.
- Acceptance criteria.
- Decisions made.
- Constraints / evidence.
- Open questions.

Keep it concise. Do not include volatile repo inventory. Use file paths only when they are needed evidence.

## Completion

After writing, report:

- The artifact path.
- The source context used.
- Any open questions or decisions still blocked.
