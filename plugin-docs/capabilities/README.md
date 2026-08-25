# Freeflow Capabilities

Capabilities are optional Pi/PiFlow extensions outside the shared 26-skill surface. They add bounded host or context behavior; they do not replace Workflow, change authority, or become a second agent.

## Common rules

- Capabilities are off or unavailable unless their configuration and host gates are effective.
- Skills is the parent gate for Cognitive Routing, Context Virtualization, and Conversation History.
- One effective-state snapshot controls each capability’s prompt cue, discoverable skill, settings, and tools.
- Runtime State reports current availability; it does not authorize work or prove behavioral readiness.
- Capabilities preserve the ordinary Workflow owner and return evidence or state changes to that owner.
- Deterministic assembly and delivery checks do not prove model behavior or universal readiness.

## Capability matrix

| Capability | Host support | Primary job |
| --- | --- | --- |
| [Cognitive Routing](cognitive-routing.md) | PiFlow only; normal Pi configuration is inspectable but runtime-disabled | Place compute between Reasoning and Standard without changing authority or ownership |
| [Context Virtualization](context-virtualization.md) | Pi and PiFlow | Change future context residency of consumed tool evidence while preserving canonical history |
| [Conversation History](conversation-history.md) | Pi and PiFlow | Recover bounded exact prior-conversation evidence from the active branch |

## Composition

Conversation History retrieves missing prior evidence. Context Virtualization changes the residency classification of consumed evidence after it has been safely narrowed or exhausted. They may compose, but neither depends on the other for its primary job.

Cognitive Routing changes compute placement around the active owner. It does not route evidence, retrieve history, or decide whether a task is authorized.

## Related documentation

- [Getting Started](../getting-started.md)
- [System prompt architecture](../prompt-architecture.md)
- [Architecture](../architecture.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Workflow](../workflow.md)
