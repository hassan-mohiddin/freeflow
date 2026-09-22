# Changelog

## Unreleased

### Added

- Adds an optional Cognitive Routing Helper profile and `executor`, `helper`, and `both` delegation modes with mode-aware presets, manual holds, durable worker-specific continuation, and shared worker history.
- Adds cache-aware Pi request assembly and qualified Astra effort-history adaptation; provider cache hits, billing savings, and model-quality improvements remain unguaranteed.
- Adds attached Cognitive Routing evidence recovery with exact-path reads, preserved original reports and assessments, separate supplements, explicit cancellation, and direct selection of eligible occurrence-linked evidence refs.
- Adds session-only Cognitive Routing profile presets for Coordinator and enabled workers with complete model/effort pairs, inheritance, reset, and local/shared configuration isolation.
- Adds a practical Freeflow user guide for prompting, skill selection, Workflow and Track Work management, settings, Cognitive Routing presets, and evidence and cost boundaries.
- Adds experimental native-Pi Tool Execution with recoverable bounded Bash output, restricted QuickJS programs, revisioned direct/live operations, deterministic discovery, configured cooperating adapters, effect fencing, factual efficiency export, and extracted Worker/WASM qualification.

### Changed

- Clarifies mode-aware Coordinator/Helper/Executor ownership, implementation boundaries, evidence projection, recovery, and Coordinator assessment responsibilities.
- Batches worker evidence selection during return preparation while preserving saved reports, unresolved evidence, and handoff limits.
- Repositions Freeflow around Memory, planned Context, and Compute, and expands Cognitive Routing and PiFlow documentation with qualified preset and cache-reuse boundaries.

### Fixed

- Clears session-local Cognitive Routing manual-hold state before validating a newly bound session.
- Clarifies evidence-selection operation shapes, remove-only withdrawal reasons, and the distinction between eligible result bodies and routing controls.
- Prevents pre-prompt `/reload` and Cognitive Routing preset changes from blocking on Pi's not-yet-materialized session file.
- Preserves Astra effort-history replay across temporary model round trips and reloads when the qualified request lineage remains compatible.

## 0.7.2 - 2026-09-11

### Breaking Changes

- Consolidates experimental routing reads into `freeflow_project inspect` with scoped candidates and `freeflow_unit inspect` with current/history/detail views; earlier `list`, `status`, and `history` operation names are no longer advertised or accepted.
- Replaces the experimental Cognitive Routing switch/boundary protocol with Coordinator/Executor assignments, separate delegate/return/unit/projection tools, and `projection`/`thinking` configuration. Old experimental configuration and tools are not migrated; redesigned PiFlow routing and composition with legacy context transforms remain unavailable pending qualification.

### Added

- Adds exact assistant-visible-text evidence refs, bounded saved-work detail/history recovery, snapshot-based inspection pagination, and explicit target limitations in expanded routing output.
- Adds saved-report retry, explicit same-unit assignment replacement, strict read-only session acknowledgment reconciliation, and assessment-preserving evidence projection with attention suspension and restoration.

### Changed

- Retires the old experimental routing source and tests into the historical archive, adds replacement-contract regression suites, and cleans generated extension output before building.
- Shows live routing tool arguments in a six-line trailing preview with full expansion, and replaces internal collapsed receipt labels with readable operation outcomes and evidence counts.
- Clarifies Cognitive Routing's Coordinator/Executor assignment boundary, design-decision transfer, selective evidence projection, and Coordinator assessment responsibilities in the shipped guidance.

### Fixed

- Limits normal evidence inspection to usable candidates and removes source-content previews, while preserving saved-selection diagnostics.
- Preserves delivered-user identity across native compaction and explicit resume, so stored-but-undelivered history does not interrupt an outstanding Executor assignment while genuinely new input still does.
- Keeps streamed routing contracts and reports visible in collapsed receipts; limitations and replacement reasons remain available in expanded views instead of obscuring current prose.
- Preserves source attribution throughout routing request views and complete report metadata during handoff/recovery; excludes routing controls from new evidence selections, clarifies inspection counts and historical discovery, and distinguishes invalid lookup refs from unavailable work.
- Preserves admitted routing communication and active evidence across closure, replacement and attention; removes duplicate runtime communication and selection no-op churn, preserves identical-call receipts, indexes native exchanges, and streams long-session reconciliation with explicit resource limits. Request planning no longer treats base64 as text or a model output maximum as an invariably reserved allocation.
- Reconciles native routing navigation and explicit assignment resume, guards stale session operations, preserves evidence withdrawal details and cross-model tool-result carriers, and reduces history replay and routine journal writes. Routing tools now show readable receipts and role-appropriate controls.

## 0.7.1 - 2026-09-04

### Added

- Adds Agent Plugins 1.0, Gemini CLI, Cursor, GitHub Copilot/VS Code, OpenCode v2, and Hermes distribution metadata or compatibility over the same canonical 25-skill tree, with Kiro compatibility through the portable Agent Plugins skill surface.

### Changed

- Separates shared runtime-context rendering from Codex, Claude, Gemini, Cursor, and Copilot/VS Code hook adapters while preserving existing Pi/PiFlow capability boundaries and lifecycle behavior.

### Fixed

- Aligns OpenCode v2 skill configuration, Gemini lifecycle matching, and Copilot session-start context output with their documented host contracts.

## 0.7.0 - 2026-09-03

### Breaking Changes

- Removes Freeflow's selectable modes, mode commands, session mode state, and `defaultMode` configuration; all work now uses one adaptive Workflow.
- Removes the `interactionContract` and `skills` configuration toggles. The separately editable Interaction Contract and 25 base skills are always present whenever Freeflow is enabled, while optional capabilities remain independently gated.
- Replaces the current Schema 3 Track Work package with compact Schema 4 Markdown task memory and lifecycle commands. Existing Schema 2/3 records remain untouched and require a later explicit migration.

### Added

- Adds Cognitive Routing support to normal Pi through its official model, thinking-level, model-registry, and session-entry APIs while preserving the existing PiFlow host path, transition recovery, native-override handling, and rollback evidence.

### Changed

- Refines core runtime prompts and workflow guidance with explicit authority and evidence boundaries, current-owner routing, bounded environment interactions, peer execution methods, and expanded design and skill-authoring references.
- Changes Cognitive Routing automatic control to start and return in Reasoning, keeps all substantive user-facing interaction in Reasoning while Standard transfers execution state at return conditions, adds Yield/Delegate/Act Bounded routing with model-written execution boundaries, and refreshes Runtime State only after context reconstruction or displayed-state changes.
- Reconciles the shipped skill-routing map with current direct routes and resource dependencies.
- Documents the Pi 0.84.3+ support floor and Pi 0.84.4 integration test target.
- Rewrites Cognitive Routing guidance around shared context, Reasoning-governed boundary-first routing, a persistent Delegate loop, standalone Yield, Reasoning-owned self-review, and explicitly bounded Act Bounded execution while preserving execution-boundary lifecycle semantics.

### Fixed

- Keeps extension-generated Runtime State before the latest genuine user message so automatic profile refreshes cannot masquerade as user interruptions and prematurely return delegated work.
- Prevents stock-Pi model and thinking events emitted by Freeflow-owned profile transitions from being treated as native user overrides.
- Expands direct Pi skill commands through Pi’s `sendUserMessage` API before dispatching them to the model.
- Renders Schema 4 Current Work, Future Work, and History entities as compact field-list rows while preserving expanded reads, and expands Track Work operation help with fragment fields and stdin guidance.

## 0.6.0 - 2026-08-25

### Added

- Adds a deterministic v2 Track Work runtime with strict schema-driven updates, bounded views, decision and checkpoint lifecycles, historical reopening, stale-lock recovery, loss-resistant migration and compression, candidate round-trip validation, and atomic persistence.
- Rebuilds Track Work as one complete lifecycle method for task-memory creation and recovery, Current Slice continuity, proposals, decisions, checkpoints, evidence, Notes, closure, and reconciliation while keeping exact command mechanics schema-driven.
- Extends Evaluate Skill with explicit runtime profiles, PiFlow host variants, extension bundles, prompt/context evidence, tool-call predicates, and stronger isolation and evidence safeguards for behavioral evaluation.
- Adds the Pi-only Cognitive Routing capability with standard/reasoning profiles, manual unsplit control, Reasoning-led automatic execution boundaries with Standard delegation, state restoration, runtime Control/Profile delivery, transition history, and PiFlow host integration; keeps it experimental pending behavioral acceptance.
- Adds Action Selection as a cross-host skill for bounding uncertain or broad environment interactions before choosing tools or repeated actions.
- Adds opt-in Pi-only Context Virtualization for archiving classified tool results from future model context while preserving canonical session history, with archive/restore controls and working-set policy.
- Adds opt-in Pi-only Conversation History retrieval for bounded current-branch recovery, with passage ranking, cancellation handling, and explicit recovery-policy safeguards.
- Adds committed exact-revision Freeflow development snapshots for Pi/PiFlow with provenance, atomic refresh, package validation, and isolated targets while separating Freeflow policy from PiFlow host ownership.
- Adds human-controlled release automation, pull-request/main CI, deterministic version and changelog preparation, metadata validation, tag-verified npm/GitHub Release publishing, recovery support, release-note extraction, and PR changelog declaration validation.
- Adds a canonical public documentation hub, Pi/PiFlow Getting Started guidance, versioned release evidence, consolidated ADR ownership, tracked historical project-doc archiving, and deterministic documentation validation.

### Changed

- Simplifies the Interaction Contract into compact evidence-based interaction semantics: separates user goals from factual claims, answers mixed question/action turns before acting, and proceeds on clear requests without silently expanding them; adds focused baseline-versus-candidate behavioral evaluation cases.
- Scopes workflow authority by requested outcome, permitted effects, evidence boundary, and stop condition; distinguishes passive observation, active evidence generation, and mutation or delivery; and consolidates detailed policy in Workflow so mode, skill selection, usefulness, or new evidence cannot silently authorize the next action.
- Aligns discussion, diagnosis, execution, mode, TDD, verification, and review guidance with the shared authority model; separates review adjudication from remediation; moves Working Record selection to Discuss and Workflow while Track Work operates established memory; defines entry-required, activity-required, and conditional reference reads; makes child skills own their reference activation; and keeps reference filenames aligned with their visible titles.
- Moves the Interaction Contract into layered runtime prompt fragments and hides retained historical material under `.deprecated/`, updating live loaders, package checks, documentation, and links.
- Adds layered prompt-fragment, Runtime State, and discoverable-skill delivery with capability gating so hosts receive stable guidance and opt-in Pi capabilities through separate runtime surfaces.
- Requires silent self-review after every bounded activity—tasks, slices, subtasks, artifact revisions, and small local changes—before its result is accepted, reused, or claimed complete; keeps corrections inside the existing authority envelope and reinforces the boundary in execution, bypass, task completion, plan defaults, and pre-activation setup.
- Hardens changelog governance and tag-driven release CI with canonical category validation, released-history immutability, pre-publication release-note checks, exact artifact verification, and recovery safeguards.

### Removed

- Removes the deprecated Output Router from the Pi runtime, tools, settings command, capability guidance, and active evaluation surface; it is no longer available for use. Legacy router-shaped configuration remains inert for activation compatibility, while the implementation and evidence are archived under `.deprecated/output-router/`.
- Removes the legacy Pi-only `/discover` and `/execute-plan` compatibility aliases; use `/discuss` and `/execute-work` instead.

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
