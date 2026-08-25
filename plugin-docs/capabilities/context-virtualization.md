# Context Virtualization

Context Virtualization changes the future residency of consumed tool evidence without changing canonical session history. It is optional and default-off.

## What it does

After tool evidence has been safely narrowed or exhausted, the active owner may classify its future context residency as:

- **Full:** keep the raw result available;
- **Retained:** keep compact meaning, identifiers, constraints, provenance, or unresolved limits;
- **Reference-only:** keep a recoverable reference without retaining the raw result in the future projection.

The canonical session history remains unchanged. Archive and restore affect future model context projection, not the underlying transcript.

## Activation and ownership

Context Virtualization requires valid Freeflow activation, effective Skills, and the Context Virtualization capability gate. Its prompt cue and discoverable skill appear only when the same effective surface snapshot exposes the capability.

The capability does not choose the task owner, widen authority, select a tool, or decide whether evidence is sufficient. It returns residency state to the current owner. A result stays Full whenever its raw content may still be needed for the current activity, self-review, or expected continuation.

## Archive and restore

The shared `freeflow_context` interface provides explicit archive and restore operations for eligible current-session ContextRefs:

```text
freeflow_context({ operation: "archive", targets: [{ ref: "ctx:<id>" }] })
freeflow_context({ operation: "restore", refs: ["ctx:<id>"] })
```

Archive may preserve retained meaning when raw evidence is exhausted but identifiers, constraints, provenance, or unresolved failures remain relevant. Do not archive governing instructions, active task memory, accepted artifacts, unresolved evidence, or current verification evidence merely to reduce context.

The projection uses current-session references and append-only journal/history semantics. Mutations fail closed when the target is invalid or state cannot be safely reconciled. Projection and replay preserve ordinary host operation rather than blocking the underlying session.

## Interaction with Conversation History

Conversation History retrieves missing prior-conversation evidence. Context Virtualization changes residency after evidence has been consumed and narrowed. They may compose, but Context Virtualization does not retrieve archived content and Conversation History does not decide residency.

## Limits

Context Virtualization does not:

- delete or rewrite canonical session history;
- automatically archive by token count or age;
- infer that a result is safe to discard;
- provide semantic search or alternate-session retrieval;
- authorize a task action;
- claim that archived evidence is permanently unavailable.

The active owner remains responsible for deciding when evidence is exhausted and what retained meaning is necessary.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Conversation History](conversation-history.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
