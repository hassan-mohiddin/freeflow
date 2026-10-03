# Freeflow Capabilities

Capabilities are optional Pi extensions outside the shared 25-skill surface. They add bounded host or context behavior; they do not replace Workflow, change authority, or become a second agent.

## Common rules

- Capabilities are off or unavailable unless their configuration and host gates are effective.
- Cognitive Routing, Tool Execution and Compaction are independently gated. Compaction is on by default with Freeflow; the other two are off by default.
- One effective-state snapshot controls each capability’s prompt cue, discoverable skill, settings, and tools.
- Runtime State reports current availability; it does not authorize work or prove behavioral readiness.
- Capabilities preserve the ordinary Workflow owner and return evidence or state changes to that owner.
- Deterministic assembly and delivery checks do not prove model behavior or universal readiness.

## Capability matrix

| Capability | Host support | Primary job |
| --- | --- | --- |
| [Cognitive Routing](cognitive-routing.md) | Experimental, native Pi | Place compute among Coordinator and enabled Helper or Executor profiles without changing authority or ownership |
| [Tool Execution](tool-execution.md) | Experimental, native Pi | Freeflow's layer over Pi's tools: working guidance, file tracking, clearer edit errors, `apply_patch`, background commands |
| [Compaction](compaction.md) | Experimental, native Pi | Let the agent compact at a safe point from its own summary and carried context, with Pi's compaction as the fallback |

## Composition

The legacy Freeflow Context tool, Context Virtualization, and Conversation History were removed in a breaking change. Their source, guidance, tests, and evaluation definitions are archived under [`.deprecated/legacy-context/`](../../.deprecated/legacy-context/README.md). Context Control v2 is planned but unavailable; the archive does not define a replacement command or compatibility contract.

Cognitive Routing changes compute placement and selects eligible evidence for Coordinator's projected view around the active owner. It does not retrieve arbitrary history or decide whether a task is authorized. Selected canonical evidence is preserved for the active assessment, with explicit attention suspension. The removed context transforms are not part of the current runtime; future Context Control composition remains unspecified and unavailable.

Tool Execution adds to Pi's tools without changing who may act: routing still owns which profile works, and Pi's tools, permissions and file-mutation queue carry every effect.

Compaction composes with Cognitive Routing: workers compact themselves mid-assignment, a Coordinator under projection delegates compaction instead of compacting, and the Coordinator's view after a worker compaction names the worker's carried copies rather than repeating them. Compaction never creates or names a Working Record; the agent's summary names it.

## Related documentation

- [Getting Started](../getting-started.md)
- [System prompt architecture](../prompt-architecture.md)
- [Architecture](../architecture.md)
- [Pi integration](../integrations/pi.md)
- [Workflow](../workflow.md)
