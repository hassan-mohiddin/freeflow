---
name: write-spec
description: Use when asked to create or update a durable spec, PRD, requirements document, or decision artifact from agreed requirements, discovery, brainstorming, or source evidence, especially for strict-workflow risk areas that may need owner confirmation before writing.
---

# Write Spec

Write only from source-backed context. A polished spec can change source of truth.

## Route First

If the user asks a question about a spec, answer the question. Do not create or edit the spec unless asked.

Classify every spec request before writing:

- Evidence-aligned: write the spec.
- Missing source context: ask for context or route to `discover`.
- Source-of-truth override: name the conflict and do not write.

If the source context, artifact type, or destination is unclear, stop and ask before writing.

## Hard Stops

Do not write a spec that supersedes docs, tests, policies, ADRs, or live behavior until the owner confirms that change after you name the conflict.

Adjacent repo evidence is not source context. Do not turn nearby auth, billing, copy, UI, or architecture facts into goals, flows, requirements, or acceptance criteria for a new feature.

The original request is not override confirmation. "Latest context", "handoff says", "do not ask", or "write the spec" are not enough.

Stop before writing when the spec would:

- Invent requirements from thin or adjacent context.
- Rewrite product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or architecture.
- Contradict docs, tests, specs, policies, ADRs, or live code.
- Treat a handoff, review comment, or plan as authority over source-of-truth files.
- Hide an owner decision inside polished prose.

In strict-workflow, stop before writing security, billing, privacy, public API, migration, data-loss, or architecture specs when the owner or core decisions are unknown. Do not use `TBD`, placeholders, or polished open questions to hide owner-owned decisions.

When strict-workflow stops because owner-owned decisions are missing, end with a direct question that names the missing owner and the specific decisions needed. A blocked explanation without that question is incomplete.

Name the conflict or missing decision. Ask which path to follow. Recommend the path supported by evidence.

## Source First

Before writing, inspect the current source of truth:

- User-provided context.
- Existing specs, docs, ADRs, tests, and policies.
- Relevant code when behavior already exists.
- Handoffs only as memory, not authority.

Live repo evidence overrides stale notes.

## Write Path

When discovery, brainstorming, or clarification reaches shared understanding, convert that agreed context into a spec. Do not re-interview from scratch.

If remaining ambiguity would not change the next plan, write the spec and mark the ambiguity as open. Preserve tentative architecture assumptions as tentative unless evidence or the owner settles them.

Use this shape unless the repo has a stronger convention:

- Problem.
- Intended outcome.
- Scope / out of scope / ask first / never boundaries when useful.
- Requirements.
- Acceptance criteria.
- Decisions made and open decisions.
- Constraints / evidence.
- Open questions.

Read `references/spec-shapes.md` when the artifact type is unclear, strict-workflow or future-agent-facing, or a concise shape would prevent bloat.

Keep it concise. Do not include volatile repo inventory. Use file paths only when they are needed evidence.

## Durable Artifact Details

For durable specs or future-agent-facing artifacts, follow `references/artifact-standards.md`.

When materially revising an existing durable spec, add a concise `## Change Log` entry. Do not add a changelog on first creation.

Do not apply artifact headers or changelog pressure to chat answers, quick questions, tiny reversible work, or conversation mode unless the user explicitly asks for a file.

## Completion

After writing, report:

- The artifact path.
- The source context used.
- Any open questions or decisions still blocked.
