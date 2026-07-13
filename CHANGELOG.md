# Changelog

## Unreleased

- Renames the active `interview-gate` skill and runtime path to `decision-gate`; legacy `IVG-*` eval IDs and historical reports remain unchanged.
- Reworks the workflow into adaptive verified slices with rolling plans, route checks, backward edges, conditional formal checkpoints, and bounded review loops.
- Adds optional Unverified candidates for simplification, deprecation/migration, branch completion, release, and production launch, plus an optional TDD execution method.
- Adds Pi/direct command routes for the five optional lifecycle candidates. The adaptive candidate remains Unverified pending behavioral evaluation.
- Makes `.freeflow/config.json` the sole repo activation boundary and replaces duplicated always-on core skill bodies with one canonical compact runtime kernel across Pi, Codex, and Claude; setup preserves host instruction files and reports runtime delivery separately.
- Loads the full Workflow skill once on the first session turn, keeps the compact kernel in per-turn system context, and routes mode questions or changes to Mode Contract on demand.
- Excludes GitHub-only plugin docs and eval evidence from the npm runtime tarball; README evidence/docs links now target GitHub.
- Removes activation-like kernel duplication from `AGENTS.md`, narrows Workflow to routing ownership, and aligns Mode Contract plus current eval prompts with `/freeflow mode` while preserving existing capability config.
- Uses Claude's host-valid `./` marketplace source and validates host-specific marketplace paths plus the packaged Pi entrypoint.
- Renames the optional `deprecation-and-migration` and `shipping-and-launch` skills to the collision-resistant `migration-work` and `launch-work` identities, including their direct commands.
- Quotes YAML-sensitive skill descriptions and teaches `skill-author` to reject unquoted `: ` plain scalars before Pi loads them.
- Adds a kernel-level concise-output contract that removes filler and routine tool narration while preserving requested depth, safety, nuance, and clarity.
- Adds configuration-bound Production-Ready evaluator composition for Pi with explicit multi-skill stacks, exact kernel/Workflow delivery, per-component identities, and bounded one-shot or two-to-four-turn cases; that evidence remains historical while the source-changing evaluator v3 candidate is Unverified.
- Treats repeated same-invariant defects, widening fixes, and weak evidence as route-changing signals; strengthens failure-unit design, rejected-state TDD, integration-proof fidelity, slice ordering, and follow-up review routing from observed Output Router and Delegation incidents.
- Aligns effective-mode authority, bypass lifetime, lifecycle identities, artifact metadata, handoff classification, reviewer proof context, failure-unit activation, capability-config ownership, and bundled skill-tool path guidance across the current skill pack.
- Adds a bounded silent pre-action check, current-horizon evidence-producer gate, author-side review-readiness pass, shared-invariant review context, and artifact evidence-feasibility lens without replacing verification or independent review.
- Reframes the active agent as the responsible engineer: implementation and one sequential self-check—self-verification then, only on support, bounded self-review—are the primary feedback loop; review/verify skills may enhance either inline without creating independence; repeated failure routes through diagnosis before redesign; standing assurance uses a `write-spec`-selected combined or high-risk separate artifact-review route, then a distinct final verifier and reviewer in parallel against one frozen implementation.

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
