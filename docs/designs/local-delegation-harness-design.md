# Local Delegation Harness Design

> **Doc ID:** DESIGN-2026-06-12-local-delegation-harness
> **Date:** 2026-06-12
> **Owner:** Hassan Mohiddin
> **Type:** Design Spec
> **Status:** Draft
> **Source:** Local model delegation research, Freeflow runtime boundary docs, setup-freeflow contract, and June 2026 design discussion.

## Problem

Freeflow can teach frontier coding agents how to work with discipline, but it does not currently provide a way to offload bounded subtasks to local models.

Hassan wants Claude Code, Codex, Gemini-like hosts, or other frontier orchestrators to use local models as cheap, fast helpers without reducing output quality. The local model may be much weaker than the orchestrator, so Freeflow needs a delegation policy, a setup path, and an optional local harness that makes local output usable, checkable, and easy to reject when it is wrong.

The goal is not to replace the frontier orchestrator. The goal is to reduce cloud-token usage and improve throughput by using local agents generously for bounded work while keeping final judgment with the frontier model.

## Intended Outcome

Build an optional companion harness that lets a host agent delegate eligible subtasks to a local or cloud model through a model-agnostic interface.

The intended product shape:

```text
Frontier host agent
  -> Freeflow delegation skill
  -> local_delegate companion CLI
      -> local/model-agnostic agent harness
      -> structured artifact, logs, warnings, metadata
  -> frontier verification and final decision
```

Freeflow remains the workflow skill pack. The harness is executable software with its own install and runtime requirements.

## Decisions Made

- Develop the work on a dedicated branch before merging to `main`.
- Keep the untracked local-delegation research doc off `main` history and include it with this branch's local-delegation work.
- Treat the harness as an optional companion package, not as hidden behavior inside Markdown skills.
- Keep normal `setup-freeflow` compact. Do not ask every user about local models during normal setup.
- Add a separate setup path later, likely `setup-local-delegation`, for users who ask for token saving, local models, or local subagents.
- Add a separate behavior skill later, likely `local-model-delegation`, to teach orchestrators when and how to delegate.
- Start with a monorepo branch for design and prototyping. Split to a separate repo only if the harness needs an independent release lifecycle.
- Use local models generously where cheap help is useful, but treat their output as evidence, not authority.

## Scope

In scope:

- Optional local delegation setup flow.
- A model-agnostic `local_delegate` CLI contract.
- A local agent harness with tools, policy gates, logs, artifacts, and verifier checks.
- Support for local runtimes such as MLX, Ollama, LM Studio, llama.cpp server, or any compatible endpoint.
- Support for frontier/cloud models through the same harness where useful.
- Delegation policy for bounded research, repo inspection, diagnostics, review support, patch suggestions, and second-opinion work.
- Evals that compare frontier-only, local-only, and hybrid delegation runs.
- Updates to existing Freeflow skills only where local delegation naturally belongs.

Out of scope for the first build:

- Replacing Claude Code, Codex, Gemini, or other frontier orchestrators.
- Trusting local output without frontier verification.
- Making local models final authorities for product, security, privacy, billing, public API, compatibility, migration, data-loss, permission, or irreversible architecture decisions.
- Loading the entire Freeflow skill pack into every local model prompt.
- Adding hooks or hard enforcement before skill wording and evals prove a repeated need.
- Shipping the companion CLI as part of the proven plugin runtime before smoke tests and evals pass.

## Architecture

The harness has three product layers.

```text
Freeflow plugin
  skills, setup guidance, evals, and delegation policy

Companion CLI
  local_delegate command, config, doctor, smoke tests, run execution

Agent harness
  model adapter, tool registry, policy gates, context budget, sandbox, logs, verifier
```

The host agent remains responsible for:

- deciding whether delegation is appropriate
- providing a bounded task
- reading compact outputs
- verifying important claims
- making the final decision
- explaining fallback when local delegation is unavailable or unsafe

The local harness is responsible for:

- running the selected model
- exposing allowed tools
- enforcing task policy
- keeping prompts and context compact
- writing artifacts and transcripts
- returning metadata and warnings
- refusing unsupported or unsafe work

## Setup Flow

Normal setup should stay simple.

```text
setup-freeflow
  -> installs normal Freeflow activation
  -> writes `.freeflow/config.json` with `defaultMode`
  -> does not interview every user about local models
```

Local delegation setup should be optional.

```text
setup-local-delegation
  -> asks whether the user has or wants a local model runtime
  -> checks for `local_delegate`
  -> checks model endpoint health
  -> writes local-delegation config only when confirmed
  -> runs `local_delegate doctor`
  -> runs `local_delegate smoke`
```

Normal Freeflow remains useful without the harness.

```text
No harness installed:
  Freeflow operates normally.

Harness installed and healthy:
  Freeflow may delegate eligible work locally.

Harness unavailable, unhealthy, or low confidence:
  Host falls back to frontier-only workflow.
```

## Harness CLI

Initial commands:

```bash
local_delegate doctor
local_delegate smoke
local_delegate run task.json
```

`doctor` checks installation, runtime config, model endpoint reachability, workspace permissions, and required dependencies.

`smoke` runs one tiny task to prove the model can return structured output through the harness.

`run` accepts a task spec and writes a run directory.

Example run output:

```text
.freeflow/local-delegate/runs/2026-06-12-001/
  task.json
  result.json
  artifact.json
  transcript.jsonl
  warnings.json
  metadata.json
```

The command should return compact metadata to the host agent, not a large transcript.

## Task Policy

Avoid hardcoded profiles as the core abstraction. Profiles may exist as presets, but the main model should be:

```text
tool registry
  + capability tags
  + task policy
  + risk gates
```

Example task spec:

```json
{
  "task_type": "repo_inspection",
  "goal": "Find files related to auth session handling and summarize risks.",
  "inputs": ["src/"],
  "risk_level": "low",
  "allowed_capabilities": ["read", "search", "write_artifact"],
  "denied_capabilities": ["patch", "git_write", "shell_destructive"],
  "max_steps": 12,
  "output_schema": "repo_inspection_v1"
}
```

Possible capability tags:

- `read`
- `search`
- `pdf_extract`
- `write_artifact`
- `run_allowlisted`
- `patch_sandbox`
- `test_allowlisted`
- `network_disabled`
- `git_read`
- `git_write`

Possible presets:

- `research_readonly`
- `repo_inspection`
- `diagnostic`
- `review_assist`
- `patch_suggestion`
- `coding_sandbox`

Presets are convenience wrappers over capabilities. They are not the architecture.

## Delegation Policy

Local delegation should be generous but careful.

Use local delegation when the work is:

- bounded
- cheap to retry
- source-grounded
- verifiable
- parallelizable
- useful as a second opinion
- useful as a review helper
- expensive in frontier tokens
- unlikely to require frontier-level synthesis

Good local-agent uses:

- PDF chunk summary
- claim extraction
- citation/page extraction
- repo file and module summaries
- dependency or symbol extraction
- first-pass issue triage
- log summarization
- test failure clustering
- review assistance
- second-opinion review
- patch suggestion inside a sandbox
- alternative explanation or critique

Keep with the frontier orchestrator:

- final synthesis
- final review result
- product decisions
- security/privacy/billing/public API decisions
- architecture decisions
- source-of-truth conflict resolution
- applying patches to the real worktree
- completion claims
- user-facing final answer

The default rule:

```text
Local agents can help often.
Frontier agents decide and verify.
```

## Skill Updates

Add a new `local-model-delegation` skill after the harness contract is stable enough to describe.

Likely responsibilities:

- detect when local delegation may help
- check whether the harness is installed and healthy
- define a bounded subtask
- choose local delegation only when output is verifiable
- request structured artifacts
- verify local output before using it
- fall back to frontier-only work when confidence is low
- report local usage, warnings, and fallback plainly

Update existing skills only where local delegation naturally improves the task:

- `research-brief`: delegate extraction, summaries, and source maps.
- `diagnose-failure`: delegate log clustering, reproduction note extraction, and second-pass hypotheses.
- `review-work`: delegate an additional local review, then have frontier review decide what is blocking.
- `verify-work`: delegate evidence collection, but keep completion claims with frontier.
- `execute-plan`: delegate bounded inspection or patch suggestions, not final integration.
- `write-plan`: delegate source inventory or dependency mapping, not plan ownership.

Do not update every skill mechanically. Add local delegation where it prevents token waste or improves evidence quality.

## Verification And Trust

Every local result should be treated as an artifact requiring verification.

Minimum verifier checks:

- output schema is valid
- cited paths exist
- cited pages or chunks exist when applicable
- claimed files were actually inspected
- claimed tests or commands were actually run
- patch artifacts only touch allowed files
- local output includes uncertainty and warnings
- result metadata records model, runtime, settings, latency, and step count

The host agent may use local output only after deciding whether the evidence is good enough for the next step.

## Performance Goals

The harness must preserve as much local-model speed as practical.

Design choices:

- prefer persistent local servers over starting models per task
- keep prompts small
- keep tool loops short
- cap steps and context
- avoid vector databases in the first build
- return compact artifacts instead of full transcripts
- benchmark harness overhead against bare local calls

Performance must be measured across:

- bare local model call
- single-call `local_delegate`
- agent-loop `local_delegate`
- frontier-only run
- hybrid frontier plus local run

## Eval Gates

Do not call the harness successful until evals show that it helps.

Initial eval families:

- setup and smoke evals
- routing behavior evals
- local output quality evals
- verifier failure evals
- token and latency comparison evals
- hybrid quality comparison evals

Success requires:

- local delegation saves meaningful frontier tokens or time
- final answer quality does not degrade
- malformed local outputs are detected
- hallucinated paths/citations are caught
- frontier verification remains the final quality gate

## Packaging Boundary

The plugin and harness should have separate installation expectations.

```text
Freeflow plugin:
  installed through Codex, Claude, or another host plugin/skill mechanism

local_delegate harness:
  installed as an optional companion CLI
  configured per machine
  depends on local model runtime availability
```

Potential monorepo layout:

```text
plugins/freeflow/
  skills/
  docs/
  evals/

packages/local-delegate/
  pyproject.toml
  local_delegate/
  tests/
  README.md
```

The branch may prototype inside this repo. A separate repo should be considered only after the CLI API, installation story, and release cadence are stable.

## Open Questions

- Which runtime should be first for Apple Silicon speed: MLX, Ollama, LM Studio, or llama.cpp server?
- Should the first harness implementation use Pydantic AI directly, a smaller custom loop, or a thin compatibility layer around both?
- What is the first user-facing local model recommendation for a 24 GB Apple Silicon machine?
- What config file should local delegation use: `.freeflow/local-delegation.json`, project-local config, user-global config, or both?
- Should `setup-local-delegation` install the companion CLI, only configure it, or only document the command the user must run?
- What is the first benchmark fixture that best represents Hassan's real workload?
- When a local agent produces a useful patch in a sandbox, should the host apply it automatically after verification or ask first?

## Recommendation

Proceed in this order:

1. Keep work on the `local-delegate-harness` branch.
2. Preserve the local-delegation research doc with this branch.
3. Build a tiny `local_delegate` smoke harness as a companion package in the repo.
4. Start with one fast local runtime path and one structured task.
5. Add evals before updating existing skills broadly.
6. Add `local-model-delegation` and `setup-local-delegation` only after the harness contract is proven enough to document.
7. Use local agents generously for help, review, and evidence preparation, but keep final trust with the frontier orchestrator.
