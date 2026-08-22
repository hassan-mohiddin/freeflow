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
- Retired Output Router designs, specs, plans, research, handoffs, issues, and evaluation evidence live under `.deprecated/output-router/`.
- `plans/workflow/`: workflow model implementation plans.
- `plans/release/`: release and prepublish plans.
- `plans/skills/`: skill inventory and skill-pack planning.
- `designs/workflow/`: workflow model designs.
- `research/memory-and-artifacts/`: memory and artifact-skill research.
- `research/prior-art/orchestra/`: old Orchestra audits and prior art.
- `research/workflow/`: workflow, reference-stack, and behavior-eval research.
- `handoffs/bootstrap/`: bootstrap and current-state continuation memory.
- `handoffs/workflow-and-skills/`: workflow and skill-pack handoffs.
- `issues/workflow-and-skills/`: workflow and skill behavior deepening notes.
- `issues/release/`: release and metadata issue notes.
- `issues/artifacts/interface-reviews/`: HTML review artifacts.
- `guides/evals/`: eval workflow guides.
- `guides/tooling/`: agent tooling guides, including the [PiFlow tooling migration notice](guides/tooling/piflow-local.md) and [Freeflow development snapshot](guides/tooling/freeflow-development-snapshot.md).

## Public Plugin Docs

Public plugin docs live at [plugin-docs/README.md](../plugin-docs/README.md), plus [workflow](../plugin-docs/workflow.md), [skill routing](../plugin-docs/skill-routing.md), [architecture](../plugin-docs/architecture.md), [release evidence](../plugin-docs/release-evidence.md), and [release ADRs](../plugin-docs/adr/README.md).

Retired Output Router source, evidence, and dedicated documentation live under `.deprecated/output-router/`.
