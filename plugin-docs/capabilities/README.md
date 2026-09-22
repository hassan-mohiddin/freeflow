# Freeflow Capabilities

Capabilities are optional Pi/PiFlow extensions outside the shared 24-skill surface. They add bounded host or context behavior; they do not replace Workflow, change authority, or become a second agent.

## Common rules

- Capabilities are off or unavailable unless their configuration and host gates are effective.
- Cognitive Routing, Tool Execution, Context Virtualization, and Conversation History are independently gated optional capabilities.
- One effective-state snapshot controls each capability’s prompt cue, discoverable skill, settings, and tools.
- Runtime State reports current availability; it does not authorize work or prove behavioral readiness.
- Capabilities preserve the ordinary Workflow owner and return evidence or state changes to that owner.
- Deterministic assembly and delivery checks do not prove model behavior or universal readiness.

## Capability matrix

| Capability | Host support | Primary job |
| --- | --- | --- |
| [Cognitive Routing](cognitive-routing.md) | Native Pi; redesigned PiFlow routing remains unavailable | Place compute among Coordinator and enabled Helper or Executor profiles without changing authority or ownership |
| [Tool Execution](tool-execution.md) | Native Pi candidate; current PiFlow path unavailable | Capture/recover bounded results and run revisioned direct or restricted program operations with truthful effects |
| [Context Virtualization](context-virtualization.md) | Pi and PiFlow | Change future context residency of consumed tool evidence while preserving canonical history |
| [Conversation History](conversation-history.md) | Pi and PiFlow | Recover bounded exact prior-conversation evidence from the active branch |

## Composition

Conversation History retrieves missing prior evidence. Context Virtualization changes the residency classification of consumed evidence after it has been safely narrowed or exhausted. They may compose, but neither depends on the other for its primary job.

Cognitive Routing changes compute placement and selects eligible evidence for Coordinator's projected view around the active owner. It does not retrieve arbitrary history or decide whether a task is authorized. Selected canonical evidence is preserved for the active assessment, with explicit attention suspension. The new projection is not yet qualified together with the legacy context transforms; they remain usable independently.

Tool Execution composes with current routing responsibility and attached recovery. Routing owns who may act; the shared operation kernel rechecks that scope before effects. Recovery permits exact granted capture reads while denying programs and live operations. Unresolved live effects remain visible to routing and block clean completion without preventing truthful partial reporting.

## Related documentation

- [Getting Started](../getting-started.md)
- [System prompt architecture](../prompt-architecture.md)
- [Architecture](../architecture.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Workflow](../workflow.md)
