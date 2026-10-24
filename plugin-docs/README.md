# Freeflow Docs

These docs describe the public plugin behavior.

Start with [Getting Started](getting-started.md) for host-specific installation, repository activation, and first-session verification. Then use [Using Freeflow Effectively](using-freeflow.md) for prompting, skills, the agreement, Track Work, settings, Cognitive Routing modes, and practical operating guidance. This page is a navigation hub for user documentation; developer documentation lives in [`dev-docs/`](../dev-docs/README.md).

## Integrations

- [Pi integration](integrations/pi.md): normal Pi installation, activation, capabilities, and native host controls.
- [Settings](settings.md): every setting with its key, values and default, what is on by default, and how `/freeflow settings` reads.

## Capabilities

- [Capability overview](capabilities/README.md): gates, host support, composition, and evidence limits.
- [Cognitive Routing](capabilities/cognitive-routing.md): mode-aware Coordinator/Helper/Executor compute placement, worker evidence projection, and host qualification boundaries.
- [Tool Execution](capabilities/tool-execution.md): Freeflow's layer over Pi's tools: working guidance, file tracking, clearer edit errors, `apply_patch`, background commands, and skill guidance at the tool call that needs it.
- [Compaction](capabilities/compaction.md): agent-prepared compaction at a safe point, carried context, recovery, and Pi's compaction as the fallback.
- [Task Memory](capabilities/task-memory.md): Working Records attached to a Pi session, delivered after compaction and guarded against wrong-record writes; projects and child records for parallel sessions.
- [Messaging](capabilities/messaging.md): messages between the agents in your Pi sessions on this machine, delivered while the other works or waits, with an optional approval step.

The Freeflow Context tool, Context Virtualization, and Conversation History have been removed. Their historical implementation, prompts, tests, eval definitions, and capability docs are preserved in the [legacy context archive](../.deprecated/legacy-context/README.md).

## Documentation

- [Using Freeflow Effectively](using-freeflow.md): prompt well, choose skills and routing modes, steer the agreement and task memory, configure settings, and interpret evidence/cost limits.
- [Getting Started](getting-started.md): install, activate, and verify Freeflow on each supported host.
- [How Freeflow Works](workflow.md): the cycle (agree, build and verify, review and hand over), the agreement, the ten skills and their scripts, and what changed in 0.9.0.
- [Prompt caching](prompt-caching.md): how provider caches behave, what Freeflow adds to a request, and what it does to keep cache reuse high.
- [Release evidence](release-evidence/README.md): versioned evidence records and deferred checks.

## For contributors

These pages are for using Freeflow. How Freeflow works inside, and how to change it, is in the [developer docs](../dev-docs/README.md): architecture, subsystems, the prompt cache and performance rules, release process, and decision records.

- [Repository agent guidance](../AGENTS.md): source selection, task continuity, snapshots, and release boundaries.
- [Contribution guidance](../CONTRIBUTING.md): checks, documentation ownership, changelog rules, and human-controlled operations.
- Use Track Work for active Working Records; do not put task state in the README or public documentation.
