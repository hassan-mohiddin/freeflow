# Freeflow Docs

These docs describe the public plugin behavior.

Start with [Getting Started](getting-started.md) for host-specific installation, repository activation, and first-session verification. This page is a navigation hub; detailed behavior belongs in the linked integration, architecture, workflow, routing, and release pages.

## Integrations

- [Pi integration](integrations/pi.md): normal Pi installation, activation, capabilities, and host limits.
- [PiFlow integration](integrations/piflow.md): separate PiFlow installation, ownership boundaries, and Cognitive Routing.

## Capabilities

- [Capability overview](capabilities/README.md): gates, host support, composition, and evidence limits.
- [Cognitive Routing](capabilities/cognitive-routing.md): Reasoning/Standard compute placement and PiFlow boundary.
- [Context Virtualization](capabilities/context-virtualization.md): archive/restore of consumed evidence projections.
- [Conversation History](capabilities/conversation-history.md): bounded current-branch evidence recovery.

## Documentation

- [Getting Started](getting-started.md): install, activate, and verify Freeflow on each supported host.
- [Workflow](workflow.md): modes, entry points, loops, and the compact workflow map.
- [Skill routing](skill-routing.md): shipped skills, ownership, sibling routes, and reference dependencies.
- [Architecture](architecture.md): package layout, layered configuration, runtime delivery, review topology, and task memory.
- [System prompt architecture](prompt-architecture.md): prompt fragments, Runtime State, discoverable skills, gating, and nested execution context.
- [Release process](release.md): one-package preparation, evidence, and human-controlled release boundaries.
- [Release evidence](release-evidence/README.md): versioned evidence records and deferred checks.
- [ADRs](adr/README.md): durable release decisions.

## For contributors

- [Repository agent guidance](../AGENTS.md): source selection, task continuity, snapshots, and release boundaries.
- [Contribution guidance](../CONTRIBUTING.md): checks, documentation ownership, changelog rules, and human-controlled operations.
- Use Track Work for active Working Records; do not put task state in the README or public documentation.
