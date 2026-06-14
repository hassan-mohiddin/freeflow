# Local Model Delegation And Routing For Freeflow

> **Doc ID:** RESEARCH-2026-06-10-local-model-delegation-routing
> **Date:** 2026-06-10
> **Owner:** Hassan Mohiddin
> **Type:** Research
> **Status:** Draft
> **Source:** Conversation context, live Freeflow conventions, and public references for Hermes Agent, MLX, local model serving, LiteLLM, RouteLLM, Semantic Router, Ollama, llama.cpp, and LM Studio.

## Purpose

Capture the research and design direction for a future Freeflow skill and tool that lets a frontier orchestrator delegate bounded subtasks to local models.

The goal is not to replace GPT, Claude, Codex, or other frontier agents. The goal is to reduce cloud token usage and improve throughput by routing low-risk, bounded, verifiable work to local models while keeping hard reasoning, final synthesis, and high-risk decisions with the orchestrator.

This document is research memory, not an implementation plan. Future agents should verify live tool docs and local machine state before building.

## Executive Judgment

The right first implementation is not a fully learned "smart router."

The right first implementation is:

- a Freeflow skill that teaches the orchestrator when and how to delegate locally
- a local delegation tool that executes model calls and writes compact artifacts
- an eval harness that measures routing behavior, local output quality, cost, latency, and hallucination risk

The orchestrator should initially be a frontier model such as GPT-5.5, Claude, or Codex. The local model should be treated as a worker, not a final authority.

The most important design principle:

```text
Local models produce compact, checkable evidence packets.
The orchestrator verifies, reasons, and decides.
```

## The User Goal

Hassan wants a local-first agent workflow on an Apple Silicon MacBook Pro with 24 GB RAM.

The desired workflow:

- Run local models from the terminal, not only through LM Studio.
- Use Apple-native or Apple-efficient inference where possible, especially MLX where it fits.
- Use local models for work that does not require frontier-level reasoning.
- Keep GPT/Claude/Codex for orchestration, final judgment, hard reasoning, and high-risk work.
- Save cloud/API tokens without degrading output quality.
- Eventually turn the routing rules into a Freeflow skill and tool.

Representative target task:

```text
Read many PDFs and repositories to prepare context for brainstorming a research paper.

Local models:
- extract text summaries
- summarize chunks
- extract claims, methods, citations, and limitations
- produce repo/file/module maps

Frontier orchestrator:
- decides what matters
- critiques evidence
- resolves conflicts
- synthesizes the research argument
- writes final output
```

## Mental Model

This is a multi-layer system:

```text
User
  -> Frontier orchestrator
      -> Freeflow routing skill
      -> local_delegate tool
          -> local model runtime
          -> artifact writer
      -> compact artifacts
      -> orchestrator verification and synthesis
```

The routing skill is the behavior contract.

The delegation tool is the execution path.

The eval harness is the trust mechanism.

## Skill Versus Tool Boundary

The future Freeflow skill should answer:

- When should the orchestrator delegate locally?
- When must it avoid local delegation?
- What output schemas are acceptable?
- What verification is required?
- When should it fall back to the frontier model?
- How should it report uncertainty, warnings, and token savings?

The future tool should do the mechanical work:

```text
local_delegate(task_type, inputs, output_schema, model_hint, budget, risk_level)
  -> prepare prompt
  -> call local model
  -> validate or repair output shape
  -> write artifact
  -> return compact metadata to orchestrator
```

The tool should not return large raw transcripts by default. It should return an artifact path, summary, warnings, model metadata, and usage/latency estimates.

## Manual Routing First

Before building a smart router, use a manual routing protocol.

The user can say:

```text
Use the local model for PDF chunk summaries and claim extraction.
Use GPT/Codex/Claude for final reasoning and synthesis.
Save local outputs as structured artifacts.
Do not trust local conclusions without verification.
```

The orchestrator then:

1. Splits the task into bounded subtasks.
2. Sends eligible subtasks to the local delegation tool.
3. Reads compact local artifacts.
4. Checks citations, source coverage, contradictions, and unknowns.
5. Performs final reasoning itself.

Manual routing will generate the examples needed for a future smart router.

## Routing Rules

Delegate locally when the task is:

- bounded
- low-risk
- source-grounded
- verifiable
- extractive, classificatory, summarization-heavy, or transformation-heavy
- parallelizable
- expensive in tokens if sent raw to the frontier model

Good local tasks:

- summarize PDF chunks
- extract claims, evidence, methods, citations, limitations, and open questions
- clean OCR text
- classify documents by topic or relevance
- deduplicate notes
- convert messy text into structured JSON
- summarize repo files and modules
- extract APIs, CLI commands, test names, config keys, and dependency edges
- generate first-pass brainstorm variants
- produce initial outlines that the orchestrator will critique

Keep with the frontier orchestrator when the task involves:

- final conclusions
- hard synthesis
- deciding what matters
- architecture decisions
- public API behavior
- security, privacy, billing, money, legal, data loss, migrations, or permissions
- source-of-truth conflicts
- production code changes
- ambiguous scope
- high cost of subtle error
- unverified or uncited local outputs

Default rule:

```text
Local for evidence preparation.
Frontier for judgment.
```

## Output Shape

Local outputs should be structured artifacts, not raw chat prose.

PDF claim extraction example:

```json
{
  "schema": "claims_v1",
  "source": "paper-01.pdf",
  "chunk_id": "003",
  "summary": "...",
  "claims": [
    {
      "claim": "...",
      "evidence": "...",
      "page": 12,
      "confidence": "medium"
    }
  ],
  "methods": [],
  "limitations": [],
  "unknowns": []
}
```

Repo file summary example:

```json
{
  "schema": "repo_file_summary_v1",
  "file": "src/auth/session.ts",
  "purpose": "...",
  "exports": [],
  "imports": [],
  "side_effects": [],
  "risks": [],
  "unknowns": []
}
```

Delegation result returned to orchestrator:

```json
{
  "status": "ok",
  "task_type": "pdf_claim_extraction",
  "model": "local-qwen-7b",
  "artifact": "docs/research/artifacts/local-routing/paper-01.chunk-003.claims.json",
  "summary": "Extracted 5 claims and 2 limitations from chunk 003.",
  "warnings": ["2 claims have low confidence"],
  "input_tokens_estimate": 8200,
  "artifact_tokens_estimate": 650,
  "latency_ms": 18400
}
```

This is the compression mechanism. The frontier model consumes the artifact summary and selected structured fields, not the entire raw PDF/repo text.

## Local Runtime Options

There are three practical local runtime paths.

### MLX LM

MLX is Apple Silicon oriented and is the best path to test Apple-native local inference. `mlx-lm` provides terminal and Python interfaces such as `mlx_lm.generate` and `mlx_lm.chat`, supports Hugging Face-hosted MLX models, quantization, prompt caching, LoRA/QLoRA, and model conversion.

Use MLX when:

- testing Apple-native performance
- running MLX-community models
- building Python worker scripts
- comparing against GGUF runtimes

Tradeoff:

- Existing LM Studio model files are usually GGUF, not MLX format.
- MLX may require downloading an MLX-compatible model or converting weights.

Reference: https://github.com/ml-explore/mlx-lm

### llama.cpp / llama-server

llama.cpp is the best terminal-native path for reusing GGUF models, including models downloaded through LM Studio.

Use llama.cpp when:

- existing models are GGUF
- using Apple Metal acceleration
- exposing a local OpenAI-compatible HTTP server
- wanting a lightweight local inference backend

Tradeoff:

- Performance and quality depend heavily on model format, quantization, context length, and command flags.

Reference: https://github.com/ggml-org/llama.cpp

### LM Studio Local Server

LM Studio is already installed and can expose local models through OpenAI-compatible endpoints. This is useful as a baseline and can avoid immediate terminal setup.

Use LM Studio when:

- proving the orchestration/delegation flow quickly
- testing existing downloaded models
- comparing CLI/local server behavior before changing runtimes

Tradeoff:

- It is less terminal-native than MLX or llama.cpp.
- It may hide performance details that matter for automation.

Reference: https://lmstudio.ai/docs/developer/openai-compat

### Ollama

Ollama is another easy local serving layer with OpenAI-compatible endpoints.

Use Ollama when:

- simple model install/run ergonomics matter
- a stable local API is more important than maximum Apple-native tuning
- integrating with existing OpenAI-compatible clients

Reference: https://docs.ollama.com/api/openai-compatibility

## Reusing LM Studio Models

If LM Studio downloaded GGUF files, they usually do not need to be downloaded again for llama.cpp.

Likely path to inspect:

```bash
find "$HOME/.cache/lm-studio/models" -type f -name "*.gguf"
```

If the models are GGUF:

- reuse them with `llama-server` or `llama-cli`
- benchmark against LM Studio's local server
- later compare against MLX-native models

If the goal is specifically MLX-native inference:

- download an MLX-compatible model from Hugging Face, or
- convert/quantize into an MLX-compatible format where supported

## Existing Routing Tools And What To Borrow

### LiteLLM

LiteLLM is useful as provider/gateway infrastructure. It supports many providers and provides routing/load-balancing features such as retries, timeouts, cooldowns, fallbacks, weighted routing, rate-limit-aware behavior, health checks, and cost tracking.

Borrow:

- provider abstraction
- model aliases
- fallback chains
- retry/timeout/cooldown behavior
- cost and usage logging
- health checks

Do not expect LiteLLM alone to solve:

- task decomposition
- Freeflow-specific routing policy
- local-output verification
- research/repo-specific quality evaluation

Reference: https://docs.litellm.ai/docs/routing

### RouteLLM

RouteLLM is the closest open-source strong/weak model routing reference. It routes simpler queries to cheaper/weaker models and harder ones to stronger models. Its router estimates whether the strong model would win and compares that estimate to a threshold.

Borrow:

- strong/weak model framing
- threshold calibration
- router evaluation harness
- OpenAI-compatible routing server pattern
- benchmarking routers against quality/cost tradeoffs

Do not copy directly at first:

- whole-prompt routing as the primary strategy
- generic benchmarks as proof for Hassan's research/coding workflows

For this project, subtask routing is more important than whole-request routing.

Reference: https://github.com/lm-sys/RouteLLM

### Semantic Router

Semantic Router uses route definitions and similarity/classification to quickly choose an intent route.

Borrow:

- route definitions with examples
- fast intent classification before model calls
- thresholds for route confidence
- local encoders where possible

Useful future routes:

- `pdf_summary`
- `extract_claims`
- `repo_file_summary`
- `repo_architecture_map`
- `draft_outline`
- `do_not_delegate_high_risk`
- `frontier_final_reasoning`

Reference: https://github.com/aurelio-labs/semantic-router

### Hermes Agent

Hermes is relevant as a broader personal-agent runtime. It supports model-provider flexibility, tools, memory, skills, gateway surfaces, scheduling, subagents, and local/cloud environments.

Borrow:

- provider-agnostic mindset
- skills as procedural memory
- persistent memory and session search ideas
- gateway/cron/background automation ideas
- subagent and worker framing

Do not treat Hermes as automatically better for coding than Codex or Claude Code. For Freeflow's local delegation skill, Hermes is a useful reference runtime, not the primary target.

Reference: https://github.com/NousResearch/hermes-agent

## Proposed Freeflow Surface

### Skill Name

Possible names:

- `delegate-local`
- `route-local`
- `local-model-delegation`
- `use-local-models`

Recommended initial name:

```text
local-model-delegation
```

Reason: it describes the job without implying a learned router exists yet.

### Skill Trigger

Trigger when the user asks to:

- use a local model
- save tokens by delegating work locally
- route subtasks to local/frontier models
- process many PDFs, repos, docs, or logs cheaply
- build or evaluate local model delegation
- compare local-only, frontier-only, and hybrid workflows

### Skill Responsibilities

The skill should:

- require bounded subtask definitions
- prefer structured artifacts over raw local output
- keep final reasoning with the orchestrator unless explicitly proven safe
- classify risk before delegation
- require source references in local artifacts when possible
- require verification before using local output in a conclusion
- fall back to frontier model when local output is malformed, unsupported, uncited, low-confidence, or inconsistent
- route stable implementation learnings to `evaluate-skill` or `write-skill` before changing behavior

### Tool Name

Possible tool names:

- `local_delegate`
- `local_model_run`
- `delegate_to_local_model`

Recommended initial name:

```text
local_delegate
```

### Tool Interface Sketch

```json
{
  "task_type": "pdf_claim_extraction",
  "inputs": [
    "docs/tmp/paper-01.chunk-003.txt"
  ],
  "output_schema": "claims_v1",
  "model_hint": "local_fast",
  "risk_level": "low",
  "max_output_tokens": 1200,
  "artifact_dir": "docs/research/artifacts/local-routing"
}
```

### Tool Behavior

The tool should:

- refuse unsupported task types
- refuse high-risk tasks unless explicitly configured as analysis-only
- build task-specific prompts
- call a configured local runtime
- validate JSON/schema where requested
- write artifacts to disk
- return compact metadata
- include stderr/log path on failure
- never silently substitute frontier calls unless the orchestrator explicitly asks for fallback

## Artifact Location

Research artifacts should not go directly into runtime plugin docs.

Suggested initial convention:

```text
docs/research/artifacts/local-routing/
```

Possible examples:

```text
docs/research/artifacts/local-routing/paper-01.chunk-003.claims.json
docs/research/artifacts/local-routing/repo-file-src-auth-session.summary.json
docs/research/artifacts/local-routing/runs/2026-06-10-manual-routing-eval.json
```

Runtime plugin docs under `plugins/freeflow/docs/` should be updated only after the skill/tool behavior stabilizes.

## Evaluation Strategy

Evaluation needs two layers.

### Skill Eval

Tests whether the orchestrator routes correctly.

Example evals:

- User asks to process 20 PDFs and synthesize a thesis. Expected behavior: delegate chunk summaries and extraction locally, keep final synthesis frontier.
- User asks for security architecture approval. Expected behavior: do not delegate final judgment locally.
- Local output is malformed. Expected behavior: request repair/retry or frontier fallback, not silent trust.
- User asks to save tokens. Expected behavior: propose local delegation only for bounded subtasks.

### Model/Task Eval

Tests whether the local model output is good enough.

Example evals:

- claim extraction from known PDF chunks
- citation/page accuracy
- OCR cleanup quality
- repo file purpose summaries
- API endpoint extraction
- architecture map coverage
- hallucinated symbol/path detection

Track:

- quality score
- missed facts
- hallucinations
- malformed outputs
- citation/source accuracy
- latency
- local memory usage where available
- cloud token savings
- compression ratio
- frontier verification cost

Compare:

```text
frontier-only
local-only
hybrid: local worker + frontier final synthesis
```

The hybrid path only wins if it saves cost or time without reducing answer quality.

## Success Criteria

A first useful version succeeds if:

- local model can be called from terminal or a local HTTP endpoint
- `local_delegate` can run one bounded task and write a structured artifact
- the orchestrator consumes only the compact artifact by default
- the orchestrator keeps final reasoning to itself
- malformed/low-confidence local output is detected and not trusted
- an eval fixture shows token savings and acceptable quality on at least one real workflow

A mature version succeeds if:

- routing rules are encoded in a Freeflow skill
- local delegation is repeatable across Codex, Claude, and Hermes-like runtimes
- provider/runtime choice is configurable
- artifacts are schema-validated
- eval reports show when local routing helps and when it hurts
- future smart routing is calibrated on Hassan's real workloads

## Risks

### Routing Collapse

Research on LLM routers notes that routers can overuse the strongest model or underuse cheaper models depending on calibration and objectives. Freeflow should avoid pretending that generic thresholds prove correctness for Hassan's workload.

Mitigation:

- start with explicit rules
- collect manual routing examples
- evaluate on real tasks
- only automate routes that repeatedly pass

### Hidden Quality Loss

Local summaries can omit the fact the final answer needed.

Mitigation:

- require source references
- keep raw source accessible
- sample-check chunks
- ask local models for unknowns and low-confidence areas
- use frontier verification on high-impact claims

### Raw Output Bloat

If the orchestrator reads full local transcripts, token savings disappear.

Mitigation:

- return artifact paths and compact metadata
- use strict schemas
- read raw local outputs only for debugging or sampling

### False Authority

Local models may produce confident but wrong conclusions.

Mitigation:

- local models prepare evidence
- orchestrator decides
- final conclusions cite source-backed artifacts

### Runtime Drift

Local runtime behavior can change with model, quantization, context window, prompt template, server version, or sampling settings.

Mitigation:

- log model path/name, quantization, runtime, seed/settings where possible
- store eval metadata with artifacts
- benchmark after model/runtime changes

## Open Decisions

These are not blockers for the research doc, but they should be decided before implementation.

- Which runtime is first: MLX LM, llama.cpp, LM Studio local server, or Ollama?
- Which existing local model should be the first worker?
- Should the first artifact workflow be PDFs, repo maps, or both?
- Should the first tool be a shell script, Python CLI, MCP server, or Codex plugin tool?
- Should LiteLLM be introduced immediately or after direct local calls work?
- Where should generated local artifacts live for eval runs versus project research?
- What are the first 5 eval fixtures from Hassan's real workflows?

Recommended first decisions:

```text
Runtime first: reuse existing LM Studio GGUF files through llama.cpp if available.
Workflow first: PDF chunk summary + claim extraction.
Tool first: Python CLI that writes JSON artifacts.
Skill first: local-model-delegation with conservative routing rules.
Eval first: one frontier-only versus hybrid comparison on a small PDF set.
```

## Proposed Build Sequence

1. Locate existing LM Studio model files and determine whether they are GGUF.
2. Run one model from terminal or local HTTP server.
3. Create a tiny `local_delegate` script for one task type.
4. Define `claims_v1` and `summary_v1` output schemas.
5. Run one manual PDF chunk extraction.
6. Compare local output against frontier extraction on the same chunk.
7. Add a Freeflow skill draft for local model delegation.
8. Add skill evals that test routing behavior.
9. Add model/task evals that test local output quality.
10. Decide whether LiteLLM, RouteLLM-style thresholds, or semantic routing are worth adding.

## Non-Goals For V1

- Do not build a full learned router first.
- Do not let local models edit production code.
- Do not route high-risk final decisions locally.
- Do not optimize for every runtime at once.
- Do not add hooks or hard enforcement before evals show skill wording fails.
- Do not publish user-facing plugin docs before the behavior is proven.

## Evidence And References

- Hermes Agent: https://github.com/NousResearch/hermes-agent
- MLX LM: https://github.com/ml-explore/mlx-lm
- llama.cpp: https://github.com/ggml-org/llama.cpp
- LM Studio OpenAI compatibility: https://lmstudio.ai/docs/developer/openai-compat
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- LiteLLM routing: https://docs.litellm.ai/docs/routing
- RouteLLM: https://github.com/lm-sys/RouteLLM
- Semantic Router: https://github.com/aurelio-labs/semantic-router

## Note On The Referenced Video

The referenced YouTube video was not inspected in this research artifact. Treat any video-specific claims about Apple or MLX performance as unverified until a future pass extracts and checks the concrete claims.

## Recommendation

Proceed with a conservative, eval-backed Freeflow extension:

```text
Skill: local-model-delegation
Tool: local_delegate
First runtime: existing GGUF model via llama.cpp, if available
First workflow: PDF chunk summary and claim extraction
First eval: frontier-only versus hybrid local-worker/frontier-synthesis
```

This gives Hassan immediate practical evidence while preserving the option to build a smarter router later.
