# Freeflow Capabilities

Capabilities are optional Pi extensions outside the shared 24-skill surface. They add bounded host or context behavior; they do not replace Workflow, change authority, or become a second agent.

## Common rules

- Capabilities are off or unavailable unless their configuration and host gates are effective.
- Cognitive Routing and Tool Execution are independently gated optional capabilities.
- One effective-state snapshot controls each capability’s prompt cue, discoverable skill, settings, and tools.
- Runtime State reports current availability; it does not authorize work or prove behavioral readiness.
- Capabilities preserve the ordinary Workflow owner and return evidence or state changes to that owner.
- Deterministic assembly and delivery checks do not prove model behavior or universal readiness.

## Capability matrix

| Capability | Host support | Primary job |
| --- | --- | --- |
| [Cognitive Routing](cognitive-routing.md) | Experimental native-Pi source candidate | Place compute among Coordinator and enabled Helper or Executor profiles without changing authority or ownership |
| [Tool Execution](tool-execution.md) | Experimental native-Pi source candidate | Capture/recover bounded results and run revisioned direct or restricted program operations with truthful effects |

## Composition

The legacy Freeflow Context tool, Context Virtualization, and Conversation History were removed in a breaking change. Their source, guidance, tests, and evaluation definitions are archived under [`.deprecated/legacy-context/`](../../.deprecated/legacy-context/README.md). Context Control v2 is planned but unavailable; the archive does not define a replacement command or compatibility contract.

Cognitive Routing changes compute placement and selects eligible evidence for Coordinator's projected view around the active owner. It does not retrieve arbitrary history or decide whether a task is authorized. Selected canonical evidence is preserved for the active assessment, with explicit attention suspension. The removed context transforms are not part of the current runtime; future Context Control composition remains unspecified and unavailable.

Tool Execution composes with current routing responsibility and attached recovery. Routing owns who may act; the shared operation kernel rechecks that scope before effects. Recovery permits exact granted capture reads while denying programs and live operations. Unresolved live effects remain visible to routing and block clean completion without preventing truthful partial reporting.

## Related documentation

- [Getting Started](../getting-started.md)
- [System prompt architecture](../prompt-architecture.md)
- [Architecture](../architecture.md)
- [Pi integration](../integrations/pi.md)
- [Workflow](../workflow.md)
