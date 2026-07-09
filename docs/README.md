# Freeflow Project Docs

Use this map to find the right kind of project memory. Live repo evidence and current plugin docs override stale research, plans, and handoffs.

## Read First

Current project direction lives at the docs root:

- [Current state](freeflow-current-state.md): current release status and next work.
- [Packaging and publishing design](freeflow-packaging-and-publishing-design.md): accepted packaging and publishing design.
- [Runtime and lifecycle](freeflow-runtime-and-lifecycle.md): runtime behavior, lifecycle, and workflow shape.
- [Plugin contract](plugin-contract.md): host/plugin contract and command surface expectations.

## Physical Bins

- `adr/`: durable project decisions.
- `specs/automation/`: CI/CD and release automation specs.
- `specs/delegation/`: delegation and harness specs.
- `specs/output-router/`: output router contract and architecture specs.
- `specs/output-processing/`: output capture, file processing, derive, and context-saving specs.
- `plans/delegation/`: delegation and harness implementation plans.
- `plans/output-router/`: output router implementation and architecture plans.
- `plans/output-processing/`: output capture, derive, file processing, and context-saving plans.
- `plans/script-transforms/`: script sandbox / transform spike plans.
- `plans/workflow/`: workflow model implementation plans.
- `plans/release/`: release and prepublish plans.
- `plans/skills/`: skill inventory and skill-pack planning.
- `designs/delegation/`: delegation harness designs.
- `designs/output-router/`: output router architecture designs.
- `designs/workflow/`: workflow model designs.
- `research/delegation/`: local model and delegation research.
- `research/memory-and-artifacts/`: memory and artifact-skill research.
- `research/prior-art/orchestra/`: old Orchestra audits and prior art.
- `research/script-transforms/`: script sandbox research.
- `research/workflow/`: workflow, reference-stack, and behavior-eval research.
- `handoffs/bootstrap/`: bootstrap and current-state continuation memory.
- `handoffs/delegation/`: delegation and harness handoffs.
- `handoffs/output-router/`: output router and context tooling handoffs.
- `handoffs/workflow-and-skills/`: workflow and skill-pack handoffs.
- `issues/workflow-and-skills/`: workflow and skill behavior deepening notes.
- `issues/release/`: release and metadata issue notes.
- `issues/output-router/`: output router issue notes.
- `issues/artifacts/interface-reviews/`: HTML review artifacts.
- `guides/evals/`: eval workflow guides.
- `guides/tooling/`: agent tooling guides.
- `codex-cli-agent-harness/passes/`: Codex CLI / agent harness research passes.

## Public Plugin Docs

Public plugin docs live at [plugin-docs/README.md](../plugin-docs/README.md), plus [workflow](../plugin-docs/workflow.md), [skills](../plugin-docs/skills.md), [architecture](../plugin-docs/architecture.md), [output router](../plugin-docs/output-router.md), [release evidence](../plugin-docs/release-evidence.md), and [release ADRs](../plugin-docs/adr/README.md).
