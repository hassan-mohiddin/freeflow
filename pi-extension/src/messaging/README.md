# Messaging

Messages between live Pi sessions on this machine (Task 002 D-005): a preview, off by default. Developer doc: [`dev-docs/subsystems/messaging.md`](../../../dev-docs/subsystems/messaging.md).

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | `messaging.enabled` and `messaging.inbound`, their validation and layering. |
| [`registry.ts`](registry.ts) | The live-session registry under the Freeflow home: one file per session, stale entries removed. |
| [`transport.ts`](transport.ts) | The Unix socket per session and its one-request-per-connection JSON protocol. |
| [`messaging.ts`](messaging.ts) | Sending, receiving, the inbound policy, held messages and their outcomes, idle notices, limits. Knows nothing of Pi; `index.ts` supplies the host. |
| [`tools.ts`](tools.ts) | `list_sessions` and `send_message` (deferred), and keeping `tool_search` active while messaging is on. |

Tests: [`tests/messaging/`](../../tests/messaging/).
