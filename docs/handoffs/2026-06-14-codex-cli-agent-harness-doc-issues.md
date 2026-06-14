# Codex CLI Agent Harness Research Issues Handoff

> **Date:** 2026-06-14
> **Type:** Memory handoff
> **Status:** Current for the 2026-06-14 research-doc review
> **Repo commit at review:** `509d63a`
> **Scope:** `docs/research/codex-cli-agent-harness/`

## Purpose

This handoff records the issues found after reading every Markdown file in `docs/research/codex-cli-agent-harness/` end to end.

It is meant to help the next agent or future Hassan convert the research into a canonical Freeflow local delegation harness spec without carrying forward stale names, old paths, or unsettled decisions.

This handoff is memory, not authority. Live repo evidence, accepted specs, ADRs, and the runtime under `plugins/freeflow/` override this file if anything conflicts.

## Corpus Reviewed

The reviewed directory contained 10 Markdown files and 20,503 total lines at the time of review:

- `docs/research/codex-cli-agent-harness/README.md` - 216 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-0-repo-map.md` - 1,208 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-1-turn-loop.md` - 1,802 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-2-tool-system.md` - 2,471 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md` - 2,499 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-4-subagents-and-delegation.md` - 2,285 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-5-model-providers-runtime-adapters.md` - 1,691 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-6-memory-and-context.md` - 3,498 lines
- `docs/research/codex-cli-agent-harness/2026-06-12-pass-7-config-and-extensibility.md` - 1,644 lines
- `docs/research/codex-cli-agent-harness/2026-06-13-pass-8-agent-harness-comparisons.md` - 3,189 lines

No implementation files were changed during the review. This handoff is the only artifact created from the issue pass.

## Stable Context

The research is directionally strong. I did not find a fatal conceptual contradiction in the core thesis:

```text
frontier host agent -> optional local companion CLI -> policy-gated local harness -> structured evidence artifact -> frontier verification
```

The strongest source-truth boundary is already stated in the research index: these docs are research memory, not shipped behavior or an implementation plan, and live Freeflow runtime source plus agreed specs override them (`README.md:12-16`).

The latest synthesis points to a small optional companion harness with:

- `local_delegate doctor`
- `local_delegate smoke`
- read-only `local_delegate run task.json`
- deterministic fake-model tests before real runtime demos
- one real local runtime adapter only after schema and policy are proven
- adversarial policy/workspace/citation/trace evals before plugin docs imply the feature works

Evidence: `README.md:153-176`, `2026-06-13-pass-8-agent-harness-comparisons.md:3070-3084`.

The next proper artifact should be a spec or narrow implementation plan that freezes task/result/trace schemas, workspace policy, capability tags, task kinds, tool registry, verifier allowlist, run directory, trace format, and setup boundaries. Evidence: `README.md:178-191`.

## Issue Findings

### 1. CLI surface is inconsistent across passes

Current/latest direction uses `local_delegate`:

- `README.md:155-171` shows a `local_delegate companion CLI` and prioritizes `doctor`, `smoke`, and read-only `run task.json`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2638-2640` says to start with `local_delegate doctor`, `local_delegate smoke`, and `local_delegate run task.json`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:3074-3077` repeats that ordering.

Older passes still use `freeflow-local`:

- `2026-06-12-pass-4-subagents-and-delegation.md:1812-1825` proposes `freeflow-local spawn/list/status/wait/result/cancel`.
- `2026-06-12-pass-5-model-providers-runtime-adapters.md` still contains `freeflow-local` examples.

Impact:

- A future implementer could build the wrong binary name and command surface.
- The older command set also implies async run management before the latest synthesis says to prove one-shot runs first.

Recommended resolution:

- Treat `local_delegate doctor`, `local_delegate smoke`, and read-only `local_delegate run task.json` as the v0 surface unless Hassan explicitly decides otherwise.
- Keep `freeflow-local` as a superseded research name.
- If backward-compatible aliases are desired later, document them after the primary surface is chosen.

### 2. Async background run model conflicts with one-shot child-run direction

Pass 4 explores async child lifecycle commands and asks whether v0 should support background runs:

- `2026-06-12-pass-4-subagents-and-delegation.md:1816-1823` lists `spawn`, `list`, `status`, `wait`, `result`, and `cancel`.
- `2026-06-12-pass-4-subagents-and-delegation.md:2042` leaves async background runs versus synchronous one-shot calls as an open question.

Pass 8 and the README converge on one-shot child runs:

- `2026-06-13-pass-8-agent-harness-comparisons.md:1275-1279` says `local_delegate run task.json` and prefers a one-shot scriptable child-run surface.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2663-2672` says the first harness should simplify to one-shot child runs, one workspace root, a small tool set, JSON schemas, and JSONL traces.
- `2026-06-13-pass-8-agent-harness-comparisons.md:3023` says SQLite, resumable sessions, background workers, and long-lived servers are later concerns.

Impact:

- The docs contain enough material for someone to accidentally build a run daemon or async manager before proving the simpler path.

Recommended resolution:

- V0 should be one-shot and blocking from the frontier perspective.
- Async lifecycle support should be deferred until plain one-shot runs create real friction.
- If a future design keeps run IDs, they should identify trace/result directories, not imply background process management.

### 3. Run storage and trace paths are not settled

Older pass examples use `.freeflow/local-runs`:

- `2026-06-12-pass-4-subagents-and-delegation.md:1860-1864` returns `trace_path: ".freeflow/local-runs/local-.../trace.jsonl"`.
- `2026-06-12-pass-7-config-and-extensibility.md:1220-1226` suggests `trace_dir = ".freeflow/local-runs"`.

Latest Pass 8 uses `.freeflow/local-delegate/runs/<run_id>/`:

- `2026-06-13-pass-8-agent-harness-comparisons.md:2982-2997` suggests `.freeflow/local-delegate/runs/<run_id>/` containing `task.json`, `result.json`, `trace.jsonl`, `artifacts/`, `verifier.log`, `metadata.json`, and `warnings.json`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2820` uses `trace_ref: ".freeflow/local-delegate/runs/.../trace.jsonl"`.

The README still marks trace location as an open question:

- `README.md:201` asks whether traces should live in `.freeflow/local-delegate/runs/`, another project path, or a user-global cache.

Impact:

- Tooling, ignore rules, cleanup behavior, and citation paths will diverge if the spec does not freeze one location.

Recommended resolution:

- Prefer `.freeflow/local-delegate/runs/<run_id>/` as the project-local v0 path because it matches the latest synthesis and keeps the companion harness namespace explicit.
- Still ask Hassan before freezing project-local versus user-global storage because the README explicitly marks that as user-owned.

### 4. Result and schema naming drift needs a canonical contract

Different passes use overlapping but non-identical names:

- `LocalTaskPacket`
- `LocalAgentResult`
- `ResultArtifact`
- `local_agent_result_v1`
- `repo_inspection_result_v1`
- `trace_path`
- `trace_ref`

Examples:

- `2026-06-12-pass-4-subagents-and-delegation.md:1852-1864` uses `output_schema: "local_agent_result_v1"` and `trace_path`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2768-2791` suggests `LocalTaskPacket` with `output_schema: "repo_inspection_result_v1"`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2794-2826` suggests `ResultArtifact` with `schema_version: "repo_inspection_result_v1"` and `trace_ref`.

Impact:

- Without a frozen schema, implementation, fixtures, evals, and plugin docs will talk past each other.

Recommended resolution:

- Freeze names in the next spec before implementation.
- Suggested direction from latest docs:
  - input envelope: `LocalTaskPacket`
  - output envelope: `ResultArtifact`
  - task-specific result schema: `repo_inspection_result_v1`
  - trace pointer: choose one of `trace_ref` or `trace_path`; if both are used, define the distinction precisely.

### 5. Safety and tool policy has superseded v0 language

Pass 3 explicitly corrected early local-harness recommendations:

- `2026-06-12-pass-3-sandboxing-and-permissions.md:1519-1525` says not to leave `run_command` as vague v0, not to imply local `apply_patch`, not to copy session-scoped grants, not to use noisy broad denied-read globs by default, and not to invent an interactive approval UI inside the harness.

Pass 8 gives the latest v0 tool policy:

- `2026-06-13-pass-8-agent-harness-comparisons.md:2845-2867` starts with `list_files`, `read_file`, `search_text`, `git_status`, `write_artifact`, and optionally `run_allowed_command`.
- `2026-06-13-pass-8-agent-harness-comparisons.md:2869-2877` says not to start with arbitrary shell, arbitrary network, model-written code execution, MCP server installation, direct writes outside artifact paths, git writes, or skill/memory mutation.

Impact:

- Earlier wording can make v0 look more permissive than the corrected direction.
- This is especially risky because local delegation is a safety-sensitive feature.

Recommended resolution:

- Treat Pass 3 corrections and Pass 8 tool policy as the canonical safety override.
- V0 should be read/search/artifact-first, with shell only as an explicit allowlisted verifier capability.
- Local helpers should not mutate the worktree. They can return rejectable patch artifacts later, after read-only tasks are boring.

### 6. User-owned decisions remain open and must not be silently picked

The README carries open questions:

- implementation language (`README.md:197`)
- public surface: CLI, MCP server, plugin tool, or more than one (`README.md:198`)
- first real local runtime (`README.md:199`)
- read-only plus patch proposals versus later writes (`README.md:200`)
- trace location (`README.md:201`)
- durable memory versus task traces (`README.md:202`)
- token-savings benchmark (`README.md:203`)
- trace injection amount (`README.md:204`)
- host-agent delegation rules (`README.md:205`)
- live config refresh versus immutable task-scoped config snapshot (`README.md:206`)
- auto-apply behavior for `patch_suggestion` (`README.md:207`)

Pass 8 repeats several future-work decisions:

- first real local runtime
- implementation language/package shape
- project-local versus user-global config split
- whether `patch_suggestion` should ever auto-apply
- first benchmark fixture
- installed distribution path

Evidence: `2026-06-13-pass-8-agent-harness-comparisons.md:3106-3117`.

Impact:

- A spec can propose defaults, but these are product/runtime boundaries that should be confirmed before implementation if they materially affect behavior, install shape, security, privacy, data retention, or public API.

Recommended resolution:

- The next spec should explicitly label each as `Proposed`, `Deferred`, or `Needs Hassan`.
- Do not let an implementation PR settle these by accident.

### 7. Dependency decisions are mostly settled negatively, but not positively

Pass 8 says the v0 dependency direction should be:

```text
custom loop, schema-first, reversible internals
```

Evidence: `2026-06-13-pass-8-agent-harness-comparisons.md:3025-3033`.

It also says:

- Pydantic-style validation is the most likely dependency to earn its weight if the harness is Python.
- PydanticAI may become useful if it removes real complexity.
- LangGraph should wait until durable, resumable workflows are needed.
- smolagents should remain a reference unless it directly accelerates the prototype.
- OpenHands, Goose, Aider, and Hermes should not be v0 runtime dependencies.

Evidence: `2026-06-13-pass-8-agent-harness-comparisons.md:3033-3039`.

Impact:

- The docs correctly avoid a large framework, but the actual implementation language and validation library are still not chosen.

Recommended resolution:

- The spec should say "no drop-in framework for v0."
- If Python is chosen, decide whether to use Pydantic for schema validation before writing fixtures.
- Do not add PydanticAI, LangGraph, Goose, Aider, OpenHands, or Hermes as runtime dependencies in the first build unless a later spec explicitly overturns this.

### 8. Local runtime/provider path is still unresolved

Pass 5 leaves provider questions open:

- exact MLX server path: `mlx_lm.server`, LM Studio's MLX backend, or custom Freeflow-managed process
- Chat Completions only versus Responses adapter
- first benchmark model
- minimum local model capability profile
- manual capability storage versus metadata inference versus probes
- prompt caching timing
- serial local MLX tasks to avoid memory contention

Evidence: `2026-06-12-pass-5-model-providers-runtime-adapters.md:1494-1503`.

Pass 8 also leaves the first real runtime open: MLX, Ollama, LM Studio, llama.cpp server, or OpenAI-compatible endpoint (`2026-06-13-pass-8-agent-harness-comparisons.md:3108-3111`).

Impact:

- The fake-model and schema path can move first, but real-runtime claims should wait until this is chosen.

Recommended resolution:

- Implement deterministic fake-model tests before picking a real runtime.
- When a real runtime is chosen, pin one path and model profile for the first benchmark instead of making provider abstraction broad on day one.

### 9. Memory behavior is intentionally unresolved and should remain conservative

Pass 6's important memory lesson is separation:

- trace storage
- prompt context
- memory retrieval
- memory generation
- memory consolidation

Evidence: `2026-06-12-pass-6-memory-and-context.md:2775-2782`.

For v0, Pass 6 suggests:

- store local-agent traces
- produce structured local results
- require evidence lists
- let the frontier orchestrator verify
- do not generate durable memory from local traces by default
- do not give local agents broad memory access by default

Evidence: `2026-06-12-pass-6-memory-and-context.md:2784-2794`.

Open memory questions remain:

- durable memory versus task traces
- whether local traces become future memory
- local memory sharing scope
- direct local-model reads of Freeflow memory artifacts
- frontier approval for memory reads
- explicit evidence lists versus hidden citation markup
- benchmark for selected task packets versus whole-transcript delegation
- memory/prompt budget for fast local models

Evidence: `2026-06-12-pass-6-memory-and-context.md:3441-3452`.

Impact:

- Local memory would increase hidden state and trust risk. It also makes token-savings claims harder to verify.

Recommended resolution:

- V0 should use traces, not durable memory.
- If memory snippets are ever introduced, they should be explicit task-packet inputs selected or approved by the frontier orchestrator.
- Result artifacts should include explicit evidence lists; do not rely on hidden memory citation markup for local outputs.

### 10. External-source freshness is a real dependency risk

The research is pinned to specific source snapshots:

- Codex snapshot `b65fe3d8976d6fcc44ee6c6cf988654af5fc4d2d`
- audited Codex snapshot `0fed4497f50ad5f0b2f7972a1bfd14c5a09a85c5`
- MLX-LM source fetched on 2026-06-12 and spot-checked on 2026-06-14
- external harness sources refreshed for Pass 8 on 2026-06-13

Evidence: `README.md:18-43`.

Pass 8 audit closure says high-drift external claims were spot-checked on 2026-06-14 and that the file remains evidence memory, not shipped behavior (`2026-06-13-pass-8-agent-harness-comparisons.md:3153-3163`).

Impact:

- OpenAI Codex, MLX-LM, Goose, OpenHands, PydanticAI, LangGraph, Aider, smolagents, and Hermes are active projects. Any exact upstream API or behavior can drift before implementation.

Recommended resolution:

- Before implementation, refresh only the sources that are load-bearing for the chosen spec.
- Do not restart the whole research series unless a specific upstream change invalidates a finding.

### 11. The research directory is too broad to use directly as an implementation guide

The directory is valuable, but it contains:

- pass-by-pass evolution
- superseded naming
- design alternatives
- open questions
- external framework comparisons
- source-audit corrections

The README already says Pass 8 is the last research pass and the next artifact should be a harness spec or tiny implementation plan (`README.md:178-191`).

Impact:

- If an implementer reads only one older pass, they can easily pick the wrong CLI, storage path, tool policy, or dependency posture.

Recommended resolution:

- Write a canonical spec before code.
- The spec should cite the research but stand alone as the authority for v0.
- The spec should state which research details are superseded.

### 12. Plugin docs must not imply local delegation works before evals pass

The README says not to move local delegation into shipped plugin docs until smoke tests and adversarial evals prove the behavior (`README.md:176`).

Pass 8 repeats this and lists required eval families:

- setup/doctor/smoke
- schema validation
- policy blocking
- workspace denied-path and artifact-write constraints
- trace completeness
- result usefulness
- frontier verification behavior

Evidence: `2026-06-13-pass-8-agent-harness-comparisons.md:3041-3050`, `2026-06-13-pass-8-agent-harness-comparisons.md:3149-3151`.

Impact:

- The repo can accidentally overpromise by documenting a local delegation feature before the harness exists.

Recommended resolution:

- Keep local delegation in research/spec docs until the harness passes smoke and adversarial evals.
- Shipped plugin docs should mention local delegation only after there is runnable evidence.

## Decisions Made By This Review

No product or implementation decisions were made by this handoff.

This review only classifies the current research issues and recommends how to resolve them. Any next spec still needs to confirm user-owned choices before they become implementation authority.

## Live Evidence To Reopen

Start with these files before writing a spec:

1. `docs/research/codex-cli-agent-harness/README.md`
   - research/runtime boundary: `README.md:12-16`
   - latest design direction: `README.md:153-176`
   - next roadmap: `README.md:178-191`
   - open questions: `README.md:195-207`

2. `docs/research/codex-cli-agent-harness/2026-06-13-pass-8-agent-harness-comparisons.md`
   - one-shot CLI direction: `2026-06-13-pass-8-agent-harness-comparisons.md:1275-1279`
   - convergence table: `2026-06-13-pass-8-agent-harness-comparisons.md:2632-2648`
   - schema suggestions: `2026-06-13-pass-8-agent-harness-comparisons.md:2768-2826`
   - first tool set: `2026-06-13-pass-8-agent-harness-comparisons.md:2845-2877`
   - trace and storage: `2026-06-13-pass-8-agent-harness-comparisons.md:2982-3023`
   - dependency decision: `2026-06-13-pass-8-agent-harness-comparisons.md:3025-3039`
   - implementation ordering: `2026-06-13-pass-8-agent-harness-comparisons.md:3070-3084`
   - remaining user-owned decisions: `2026-06-13-pass-8-agent-harness-comparisons.md:3106-3117`
   - audit closure: `2026-06-13-pass-8-agent-harness-comparisons.md:3153-3163`

3. `docs/research/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`
   - local harness safety corrections: `2026-06-12-pass-3-sandboxing-and-permissions.md:1515-1525`

4. `docs/research/codex-cli-agent-harness/2026-06-12-pass-4-subagents-and-delegation.md`
   - superseded async command surface: `2026-06-12-pass-4-subagents-and-delegation.md:1812-1864`
   - async versus one-shot open question: `2026-06-12-pass-4-subagents-and-delegation.md:2038-2046`

5. `docs/research/codex-cli-agent-harness/2026-06-12-pass-5-model-providers-runtime-adapters.md`
   - provider/runtime open questions: `2026-06-12-pass-5-model-providers-runtime-adapters.md:1494-1503`

6. `docs/research/codex-cli-agent-harness/2026-06-12-pass-6-memory-and-context.md`
   - memory separation rule: `2026-06-12-pass-6-memory-and-context.md:2775-2782`
   - v0/v1/v2 memory posture: `2026-06-12-pass-6-memory-and-context.md:2784-2814`
   - memory open questions: `2026-06-12-pass-6-memory-and-context.md:3441-3452`

7. `docs/research/codex-cli-agent-harness/2026-06-12-pass-7-config-and-extensibility.md`
   - older trace path/config suggestion: `2026-06-12-pass-7-config-and-extensibility.md:1216-1226`

## Recommended Next Focus

The next artifact should be a canonical spec, not another broad research pass.

Recommended spec decisions to freeze, in order:

1. V0 scope: one-shot, read-only `local_delegate` helper for `repo_inspection`.
2. CLI surface: `local_delegate doctor`, `local_delegate smoke`, `local_delegate run task.json`.
3. Run storage: project-local `.freeflow/local-delegate/runs/<run_id>/` unless Hassan chooses user-global storage.
4. Schema names: `LocalTaskPacket`, `ResultArtifact`, and first task-specific schema version.
5. Trace pointer naming: `trace_ref` versus `trace_path`.
6. Tool registry: read/search/git-status/artifact first; verifier command only through allowlist.
7. Workspace policy: one root, explicit read-only/editable/denied paths, high-signal secret protection.
8. Memory policy: traces only in v0, no durable local memory writes.
9. Dependency policy: custom loop, schema-first, no drop-in framework for v0.
10. Evals: doctor/smoke, schema, policy, workspace, trace completeness, result usefulness, frontier verification.

After the spec, the smallest implementation path is:

1. deterministic fake-model harness
2. schema validator and fixture tests
3. `local_delegate doctor`
4. `local_delegate smoke`
5. read-only `local_delegate run task.json` for `repo_inspection`
6. adversarial policy/workspace evals
7. one real local runtime adapter

## Stop Conditions

Stop and ask Hassan before:

- choosing implementation language or package shape
- choosing first real local runtime or benchmark model
- choosing project-local versus user-global trace/config storage if the spec will make it public behavior
- allowing local helpers to write source files
- allowing automatic `patch_suggestion` application
- adding durable local memory
- exposing arbitrary MCP server installation
- documenting local delegation as shipped plugin behavior
- adding background workers, SQLite sessions, resumable workflows, or long-lived local servers

## Superseded Or Deferred Work

Superseded for v0 unless a future spec revives it:

- `freeflow-local` as the primary binary name
- `spawn/list/status/wait/result/cancel` as the initial command surface
- `.freeflow/local-runs` as the preferred trace directory
- local `apply_patch` or direct worktree mutation
- arbitrary shell, arbitrary network, git writes, MCP installation, skill/memory mutation

Deferred:

- async/background run manager
- durable/resumable sessions
- SQLite/FTS trace search
- MCP adapter
- patch proposal and dry-run patch tools
- verifier repair loops
- durable local memory
- shipped plugin docs for local delegation

## Bottom Line

The research is usable and internally coherent as research. The main risk is not that the direction is wrong. The main risk is that implementation starts before the latest synthesis is converted into a single canonical spec.

The spec should compress the research into one v0 contract and explicitly mark older names, paths, and async concepts as superseded or deferred.
