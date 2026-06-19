# Project Handoff

Date: 2026-06-19

## Purpose

Capture the research and design discussion about how Freeflow should coexist with external code-intelligence tools, especially Serena and codebase-memory-mcp (CBM), after Output Router slices 0-9.

This handoff is memory, not authority. Reopen the linked live files before consequential edits. Live repo evidence, current specs, tests, and user decisions override this text.

## Stable Context

Freeflow should remain a portable workflow and evidence-routing layer, not a semantic code-intelligence product.

Current division of labor discussed with the user:

- **Freeflow** owns workflow pressure, interview gates, source-truth conflict handling, review/verify/commit/handoff discipline, routed evidence, raw command-output vaulting, exact recovery, and bounded context entry.
- **Serena** owns IDE-like symbolic code operations: symbol overview, find symbol/references/declarations/implementations, semantic edits/refactors, diagnostics, optional JetBrains-backed deeper IDE capability, and Markdown memories.
- **codebase-memory-mcp** owns persistent code graph intelligence: repository indexing, graph/schema/search, call tracing, architecture overview, impact analysis, cross-service links, community detection, and ADR/graph persistence.

The user clarified that they are **not claiming** Serena/CBM already improve Freeflow. They are treating it as a hypothesis. Do not write public claims that the integration improves Freeflow until evals prove it.

The main product question is not “can Freeflow replace Serena/CBM?” It is:

> How should Freeflow enable smooth cooperation with external tools so each tool does its own job and they do not compete?

Current answer:

- Freeflow can run standalone for its existing job.
- External tools should be optional accelerators/providers.
- Freeflow should coordinate evidence, workflow, and verification around external code-intelligence results.
- Freeflow should not expand into a weaker built-in clone of Serena or CBM.

## Research Findings

### Serena

Research source:

- Repo clone inspected at `/tmp/pi-github-repos/oraios/serena`.
- Commit inspected: `dd7eb6d72ae179aa940e50cd6276ec5646f306f8`.
- Key files: `README.md`, `docs/02-usage/040_workflow.md`, `docs/02-usage/045_memories.md`, `src/serena/tools/*.py`.

Findings:

- Serena is an MCP server that gives agents IDE-like capabilities.
- It focuses on semantic code retrieval/editing/refactoring/debugging at the symbol level.
- It uses LSP by default and can use a JetBrains plugin backend.
- Its retrieval surface includes symbol overview, find symbol, find references, declarations, implementations, and diagnostics.
- Its editing/refactor surface includes rename, replace/insert around symbols, safe delete, and JetBrains-backed move/inline capabilities.
- It has project creation/activation/onboarding/indexing and a Markdown memory system under `.serena/memories/` plus global memories.
- It includes basic file and shell tools with `max_answer_chars`; those are not equivalent to Freeflow’s raw-output vault/recovery contract.

Interpretation for Freeflow:

- Serena is a good candidate for exact symbol/reference/refactor operations.
- Freeflow should not implement symbol-level refactor tools just to compete.
- If integrated, Serena results should be treated as high-quality candidate locations/operations, then Freeflow/native reads or verification should preserve exact evidence for completion claims.

### codebase-memory-mcp / CBM

Research source:

- Repo clone inspected at `/tmp/pi-github-repos/DeusData/codebase-memory-mcp`.
- Commit inspected: `e599df1d563c1e9b0b2fc8c6b12ee85934ade1c5`.
- Key files: `README.md`, `src/mcp/mcp.c`, `src/pipeline/pipeline.h`, `src/discover/discover.c`.

Findings:

- CBM is a local MCP structural-analysis backend.
- It indexes repositories into a persistent graph using vendored tree-sitter grammars and Hybrid-LSP-style type resolution for selected languages.
- Its tool surface includes `index_repository`, `search_graph`, `trace_path`, `query_graph`, `get_graph_schema`, `get_code_snippet`, `get_architecture`, `detect_changes`, `search_code`, `manage_adr`, and `ingest_traces`.
- It supports graph searches, BM25/FTS, semantic query, call/data/cross-service tracing, architecture summaries, and graph/schema queries.
- It has non-blocking agent-install hooks for some clients, including graph augmentation/reminders.
- `ingest_traces` currently accepts traces but states runtime edge creation is not implemented yet in inspected source.

Interpretation for Freeflow:

- CBM is a good candidate for broad architecture discovery, call-path questions, impact analysis, graph search, and “what touches this?” research.
- Freeflow should not own persistent code graphs, vector/semantic index, call graph, community detection, or cross-service graph analysis.
- If integrated, CBM results should be routed into bounded, recoverable Freeflow evidence packets or used as candidate context before exact source verification.

### Freeflow Router current shape

Live repo evidence to reopen:

- `docs/specs/freeflow-output-router-design.md`
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`
- `plugins/freeflow/docs/architecture.md`
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/types.ts`
- `plugins/freeflow/router/src/parsers.ts`
- `plugins/freeflow/router/src/experimental-local-index.ts`
- `plugins/freeflow/evals/reports/runtime/output-router-index-benchmark-1-report.md`
- `plugins/freeflow/evals/reports/runtime/output-router-command-benchmark-1-report.md`

Relevant current design facts:

- Freeflow Router exposes `freeflow_retrieve` and `freeflow_run`.
- Native tools keep direct semantics unless optional safety-net routing is explicitly configured.
- Freeflow captures raw output before transformation.
- `preserve: full` means exact fidelity, not unlimited context injection.
- `freeflow_retrieve` currently supports repo/vault source types; the spec lists future source types such as MCP resources/tool outputs and external indexed stores.
- Structural code indexing is explicitly deferred in the design spec.
- The local index is experimental; the benchmark report says scanner remains default and index is not adopted by default.
- Command-output routing has deterministic parser metadata for test-runner, TypeScript/lint, git status/diffstat, build-toolchain, and generic output.

## Decisions Made

### Settled in conversation

- Freeflow should remain standalone-capable.
- Serena and CBM should be optional, not required dependencies.
- Freeflow should not compete with Serena/CBM by owning their core jobs.
- Treat “Serena/CBM improve Freeflow setup” as a hypothesis until evals prove it.
- Freeflow’s integration role should be coordination and evidence routing, not semantic intelligence ownership.

### Recommended removal/demotion direction

These are design recommendations, not yet implemented unless live repo evidence says otherwise:

1. **Do not productize Freeflow’s local index as a main feature.**
   - Keep scanner fallback and any useful eval/benchmark code.
   - Keep exact bounded retrieval behavior.
   - Avoid promoting Freeflow-owned semantic/persistent indexing.

2. **Remove or tighten roadmap language implying Freeflow will become code intelligence.**
   - Prefer wording like: “Freeflow may consume external indexed stores, but does not own semantic code indexing.”

3. **Do not add a general memory system to Freeflow.**
   - Serena already has Markdown memories.
   - CBM has graph/ADR persistence.
   - Freeflow should keep memory narrow: specs, plans, ADRs, handoffs, and raw-output vault recovery.

4. **Avoid automatic heavy context injection by default.**
   - External hooks can be useful, but Freeflow’s principle is bounded, intentional evidence.
   - Prefer explicit calls and compact previews unless a user opts into broader external-tool context.

## What Freeflow Should Add To Enable Smooth Cooperation

The likely next design work is a narrow integration contract, not a large feature expansion.

Recommended shape:

1. **Tool-choice guidance for external intelligence**
   - Use CBM for broad architecture, graph, call-path, impact, and structural discovery.
   - Use Serena for symbol-level navigation, references, diagnostics, and refactors.
   - Use Freeflow for workflow gates, exact evidence routing, command-output vaulting, recovery, review, verification, and closeout.

2. **External source adapter seam**
   - Future `freeflow_retrieve` source kinds could include MCP/tool outputs or external indexed stores.
   - Keep this as a seam, not a hard dependency on any specific provider.
   - Avoid making Freeflow’s core require Serena or CBM to install/pass tests.

3. **Evidence normalization**
   - Convert external tool outputs into Freeflow-style evidence packets when useful:
     - provider/tool/query,
     - path/symbol/line anchors,
     - excerpt,
     - why this result was selected,
     - recovery or re-run instructions,
     - confidence/truncation metadata where available.

4. **Validation rule for completion claims**
   - External tools can locate and propose.
   - Exact source lines, command output, and verification evidence must still be checked before claiming work is done/fixed/passing.
   - Graph/symbol evidence should not replace exact verification output.

5. **Interop evals before public claims**
   - Add evals that compare Freeflow alone vs Freeflow+Serena and/or Freeflow+CBM on tasks where baseline should plausibly struggle:
     - cross-file symbol rename/refactor,
     - call-path/impact question,
     - large-repo architecture discovery,
     - noisy verification output after external discovery.
   - Measure whether external tools reduce context, improve path accuracy, reduce tool calls, or prevent wrong-file edits.

## Suggested Flow With External Tools

For a consequential code task:

1. Freeflow handles mode/risk/source-truth gates.
2. If broad architecture/impact is needed, use CBM.
3. If exact symbol/reference/edit is needed, use Serena.
4. Use Freeflow/native reads to inspect exact source evidence when needed.
5. Use `freeflow_run` for likely-large/noisy verification commands.
6. Use review/verify/commit/handoff skills for closeout.

For a direct question:

1. Answer directly if existing evidence is sufficient.
2. Use Serena/CBM only when they answer the question better than local lexical retrieval.
3. Do not create artifacts or run integration workflows just because tools are available.

## Live Evidence

Reopen these before changing design or docs:

- Freeflow product/runtime boundary:
  - `plugins/freeflow/docs/architecture.md`
  - `plugins/freeflow/docs/workflow.md`
  - `plugins/freeflow/docs/README.md`
- Output Router source truth:
  - `docs/specs/freeflow-output-router-design.md`
  - `plugins/freeflow/skills/output-router/SKILL.md`
  - `plugins/freeflow/skills/output-router/references/safety-policy.md`
  - `plugins/freeflow/router/src/types.ts`
  - `plugins/freeflow/router/src/retrieve.ts`
  - `plugins/freeflow/router/src/run.ts`
  - `plugins/freeflow/router/src/parsers.ts`
- Local index experimental status:
  - `plugins/freeflow/router/src/experimental-local-index.ts`
  - `plugins/freeflow/evals/reports/runtime/output-router-index-benchmark-1-report.md`
- Command router evidence:
  - `plugins/freeflow/evals/reports/runtime/output-router-command-benchmark-1-report.md`
- External research clones, if still present:
  - `/tmp/pi-github-repos/oraios/serena`
  - `/tmp/pi-github-repos/DeusData/codebase-memory-mcp`

External source permalinks from inspected commits:

- Serena README: `https://github.com/oraios/serena/blob/dd7eb6d72ae179aa940e50cd6276ec5646f306f8/README.md`
- Serena workflow docs: `https://github.com/oraios/serena/blob/dd7eb6d72ae179aa940e50cd6276ec5646f306f8/docs/02-usage/040_workflow.md`
- Serena memory docs: `https://github.com/oraios/serena/blob/dd7eb6d72ae179aa940e50cd6276ec5646f306f8/docs/02-usage/045_memories.md`
- Serena symbol tools: `https://github.com/oraios/serena/blob/dd7eb6d72ae179aa940e50cd6276ec5646f306f8/src/serena/tools/symbol_tools.py`
- CBM README: `https://github.com/DeusData/codebase-memory-mcp/blob/e599df1d563c1e9b0b2fc8c6b12ee85934ade1c5/README.md`
- CBM MCP tool definitions: `https://github.com/DeusData/codebase-memory-mcp/blob/e599df1d563c1e9b0b2fc8c6b12ee85934ade1c5/src/mcp/mcp.c`
- CBM pipeline modes: `https://github.com/DeusData/codebase-memory-mcp/blob/e599df1d563c1e9b0b2fc8c6b12ee85934ade1c5/src/pipeline/pipeline.h`

## Next Focus

Recommended next phase if user wants implementation:

1. **Research/spec checkpoint**
   - Write a short integration design note/spec for “external code-intelligence providers.”
   - Define provider boundaries and explicit non-goals.
   - Confirm with the user before changing public behavior.

2. **Removal/tightening pass**
   - Search docs/specs for language that implies Freeflow will own semantic indexing/code graph/refactor tooling.
   - Tighten wording to provider-seam language.
   - Keep experimental local index clearly non-default unless the user explicitly decides otherwise.

3. **Eval design**
   - Create baseline-vs-with-provider evals before public improvement claims.
   - Do not require real Serena/CBM in core CI unless dependencies and reproducibility are accepted.
   - If external tools are optional, evals can be opt-in or fixture-backed with captured outputs.

4. **Adapter seam later**
   - Add provider-neutral source metadata only after the spec is approved.
   - Avoid wiring a specific external dependency directly into Freeflow core too early.

## Stop Conditions

Stop and ask before editing if any next step would:

- Make Serena or CBM a required Freeflow dependency.
- Change Freeflow’s public API/result shape.
- Promote experimental local index as default/product behavior.
- Add auto-injected external context by default.
- Add a Freeflow-owned semantic index, vector store, call graph, symbol refactor tool, or general memory system.
- Claim measured improvement without eval evidence.
- Change public docs about compatibility, install behavior, hooks, privacy/security posture, or external tool trust.

## Superseded Or Deferred Work

- Do not treat the external-tool research as proof of integration value. It is a hypothesis plus source-based complementarity analysis.
- Do not start by adding features. First remove/tighten scope where Freeflow overlaps with Serena/CBM, then define the minimal integration seam.
- Do not replace Freeflow Router. The router remains useful because neither Serena nor CBM owns Freeflow’s exact-output vaulting, verification evidence, and workflow closeout contract.
