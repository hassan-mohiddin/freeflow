# Conversation History

Conversation History recovers exact missing prior-conversation evidence from the current active branch. It is optional and default-off.

## What it does

When the next decision depends on wording, rationale, chronology, provenance, or an earlier tool result that is not visible in the current context, Conversation History can perform a bounded search and retrieve operation through the shared `freeflow_context` interface.

Visible current context, live source, current task memory, and current user direction remain authoritative. History is evidence, not authority.

## Activation and source boundary

Conversation History requires valid Freeflow activation, effective Skills, and its own capability gate. Its prompt cue, discoverable skill, and tools are exposed from the same effective surface snapshot.

Search is limited to hidden eligible sources on the current active branch. It does not browse alternate branches or sessions, create a durable semantic index, or search the web. Source visibility and provenance remain explicit.

## Bounded retrieval

Use the smallest operation that answers the current question:

```text
freeflow_context({ operation: "search", query: "<missing detail>" })
freeflow_context({ operation: "retrieve", refs: ["ctx:<id>"], focus: "<needed evidence>" })
```

Search returns ranked discoveries, not proof. Retrieve only selected sources needed for the decision, and preserve source identity and limits. Lexical ranking and bounded snippets are used; embeddings and unrestricted semantic retrieval are not part of the current capability contract.

The capability supports bounded cancellation, result limits, and provenance. It does not reconstruct exact wording from a summary when the original source is required.

## Interaction with other capabilities

Context Virtualization manages the future projection of consumed tool evidence. Conversation History recovers hidden prior evidence. When both are effective, they may compose through the same current-session source and projection boundaries without becoming a shared memory database.

## Limits

Conversation History does not:

- search alternate branches or sessions;
- infer user authority or accepted intent;
- replace live source inspection;
- create an embeddings or durable retrieval index;
- turn a historical suggestion into a current instruction;
- automatically inject history into ordinary model context;
- claim behavioral or universal retrieval accuracy.

If the needed detail is absent or the source is not eligible, report the evidence gap instead of guessing.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Context Virtualization](context-virtualization.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
