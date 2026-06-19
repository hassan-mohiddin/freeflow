# Changelog

## Unreleased

- Nothing yet.

## 0.2.0 - 2026-06-19

- Adds Freeflow output-router tooling for routed repo/vault evidence, noisy command routing, and exact raw-output recovery.
- Adds deterministic retrieval, command-output, optional local-index, and Codex Structured Q&A router benchmarks.
- Keeps scanner retrieval as the default backend; the no-dependency local index remains experimental.
- Keeps native post-tool safety-net routing off unless explicitly configured.
- Adds opt-in `outputRouter` setup/config guidance while preserving minimal setup as only `defaultMode`.
- Replaces `research-brief`, `grill-context`, and `capture-decisions` with the deeper `research` discovery skill.
- Moves deprecated discovery skills to root `deprecated/skills/` outside the runtime skill surface.
- Updates the direct command surface to use `/research`.
- Clarifies `write-skill` line budgets as best practice, not a hard cap for deep skills.
- Adds parent adjudication and a three-pass hard cap for artifact/work review loops.
- Deepens `execute-plan` for multi-slice execution, TDD slice contracts, review-failure routing, and scope-change backward edges.
- Tightens workflow/review skills so non-passing reviews route to adjudication before more implementation.

## 0.1.0 - 2026-05-26

- Initial Freeflow package.
- Ships the accepted v0.1 workflow skill set.
- Supports Codex and Claude plugin metadata.
- Adds public workflow, skills, architecture, release evidence, and ADR docs.
- Keeps native slash handlers, hooks, and CLI enforcement out of scope.
