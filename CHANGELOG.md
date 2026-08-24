# Changelog

## Unreleased

- Adds a deterministic v2 Track Work runtime for schema-driven Working Records, precise updates and views, stdin input, historical reopening, and atomic decision supersession.
- Simplifies the Interaction Contract into compact evidence-based interaction semantics: separates user goals from factual claims, answers mixed question/action turns before acting, and proceeds on clear requests without silently expanding them; adds focused baseline-versus-candidate behavioral evaluation cases.
- Adds the Pi-only Cognitive Routing capability with standard/reasoning profiles, manual and automatic controls, state restoration, runtime Control/Profile delivery, transition history, and PiFlow host integration; keeps it experimental pending behavioral acceptance.
- Adds opt-in Pi-only Context Virtualization for archiving classified tool results from future model context while preserving canonical session history, with archive/restore controls and working-set policy.
- Adds opt-in Pi-only Conversation History retrieval for bounded current-branch recovery, with passage ranking, cancellation handling, and explicit recovery-policy safeguards.
- Adds committed exact-revision Freeflow development snapshots for Pi/PiFlow with provenance, atomic refresh, package validation, and isolated targets while separating Freeflow policy from PiFlow host ownership.
- Adds human-controlled release automation, pull-request/main CI, deterministic version and changelog preparation, metadata validation, tag-verified npm/GitHub Release publishing, recovery support, release-note extraction, and PR changelog declaration validation.
- Retires the Output Router runtime, Pi tools, settings command, capability guidance, and active evaluation surface; archives the implementation and evidence under `.deprecated/output-router/` while leaving legacy router-shaped config inert for activation compatibility.
- Scopes workflow authority by requested outcome, permitted effects, evidence boundary, and stop condition; distinguishes passive observation, active evidence generation, and mutation or delivery; and consolidates detailed policy in Workflow so mode, skill selection, usefulness, or new evidence cannot silently authorize the next action.
- Aligns discussion, diagnosis, execution, mode, TDD, verification, and review guidance with the shared authority model; separates review adjudication from remediation, clarifies skill and record continuity, and renames conditional references so filenames match their visible titles.
- Relocates the Interaction Contract under `capabilities/interaction-contract/` and hides retained historical material under `.deprecated/`, updating live loaders, package checks, documentation, and links.
- Requires silent self-review after every bounded activity—tasks, slices, subtasks, artifact revisions, and small local changes—before its result is accepted, reused, or claimed complete; keeps corrections inside the existing authority envelope and reinforces the boundary in execution, bypass, task completion, plan defaults, and pre-activation setup.

## 0.5.0 - 2026-08-13

- Adds deterministic session-only Freeflow mode switching for Codex and Claude Code without restarting the conversation.
- Restores session mode across startup, resume, clear, and compact lifecycle boundaries using isolated plugin-owned state, including a bounded host-process-scoped, one-shot Claude `/clear` handoff; session controls never edit repository or personal configuration.
- Supports explicit natural-language mode controls plus Claude namespaced skill invocation and Codex `$mode-contract` mentions while leaving ordinary prompts, questions, and hypotheticals inert.
- Clarifies configured-default scope: explicit personal/local requests target `.freeflow/local.json`, explicit shared/repository requests target `.freeflow/config.json`, and unqualified requests ask before editing.
- Keeps host-native skill dispatch and the 25-skill Codex/Claude surface while preserving Output Router as Pi-only.

## 0.4.0 - 2026-07-21

- Reframes Freeflow as a feedback-based control system for coding agents, with a directed Interaction Lifecycle, internal Feedback Loop, and evidence-supported exits instead of a fixed phase pipeline.
- Uses the compact Interaction Contract plus one Workflow bootstrap as runtime guidance, while keeping mode and capability state independently gated.
- Adds required repository activation, optional per-checkout personal core overrides, Pi session-mode precedence, fail-closed invalid-local behavior, and explicit delivery evidence.
- Replaces the canonical `discover` and `execute-plan` model skills with `discuss`, `track-work`, and `execute-work`; Pi retains `/discover` and `/execute-plan` only as compatibility aliases.
- Keeps factual verification with the active agent, distinguishes silent self-review from selected independent review, and makes Pass, Non-blocking, Inconclusive, and Blocking valid review exits.
- Gives Specs and Plans separate independent Review Artifact boundaries, keeps findings non-authorizing, and requires explicit correction and focused follow-up authority.
- Adds the composite Track Work method for context-first Working Records, coherent write-ahead slice extensions, state-transition history, inert Notes, and restoration after context loss or session navigation.
- Aligns Mode Contract, Setup Freeflow, Bypass, Commit Work, migration, release, launch, handoff, branch finish, diagnosis, TDD, simplification, and design-depth methods with the feedback-based model.
- Keeps skill readiness outside subject `SKILL.md` files and repairs Skill Author validation for readable project-contained sibling and runtime dependencies.
- Refreshes package and marketplace identity, root and plugin documentation, release/current-state contracts, activation validation, and the typed 25-skill routing/dependency map.
- Replaces the retired Skill Author and Skill Eval machinery with fresh `init`, `validate`, `inspect`, `run`, and `view` surfaces, exact canonical evidence, deterministic baseline/candidate grading, isolated one-shot and multi-turn Pi subjects, serial batch continuation, and compact generated views.
- Reorganizes the Pi extension source, tests, and generated distribution by feature while preserving its stable package entrypoint, and adds Workflow and Feedback Loop diagrams to the root documentation.
- Preserves Output Router as an explicit optional capability and keeps its existing runtime behavior and evidence boundaries unchanged in this migration.
- Leaves the adaptive candidate Unverified pending current baseline-vs-with-skill behavioral evaluation; deterministic structure and delivery checks do not establish behavioral readiness.

## 0.3.0 - 2026-06-28

- Adds plugin-bundled runtime context loading for mode-contract, workflow, interview-gate, discovery-light, and output-router, including Pi every-turn context injection.
- Enforces the conversation-mode boundary so mutating or consequential work requires workflow or strict-workflow mode.
- Adds the direct `/output-router` route and exposes the Freeflow search/run/batch/status evidence surface in Pi.
- Expands Output Router with observed routing, vault-wide indexing, deterministic transform/reducer routing, storage-policy dedupe, and exact recovery guidance.
- Adds proof-gated sandboxed script producers/transforms for JavaScript, Python, and jq behind explicit `scriptTransform` opt-in, with no unsandboxed fallback.
- Adds processing reducers for access logs, tests, diagnostics, build output, tables, MCP tools, browser snapshots, git logs, and query-aware JSON facts.
- Records Context Mode comparison evidence, storage-policy evidence, script-sandbox proof evidence, observed-routing evidence, and updated output-router release evidence.
- Simplifies runtime skill context, tightens output-router safety-policy docs, and refreshes public README/plugin docs with the workflow map and current positioning.
- Fixes Pi runtime context loading on every turn and makes the discover skill description YAML-safe.

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
