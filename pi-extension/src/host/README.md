# Host

Everything Freeflow needs on Pi that is not one capability: reading configuration, building Freeflow's prompt sections, telling the model what is active, keeping Freeflow's generated messages cache-stable, and reporting status.

| File | Owns |
|---|---|
| [`config.ts`](config.ts) | Repository and personal config files, how they layer, per-session overrides, and the resulting capability state. Optional capabilities are turned off inside subagents. |
| [`catalog.ts`](catalog.ts) | The fixed command and skill surface: the commands Freeflow registers, the skills it lists to the model, and where their files live. |
| [`prompts.ts`](prompts.ts) | Freeflow's prompt files and the fixed system section built from them. The section never changes with feature state, so it stays cached. |
| [`runtime-state.ts`](runtime-state.ts) | The Runtime State message: what is active for this request. Unchanged state keeps its position; changed state is placed before the latest user message so earlier input is never rewritten. |
| [`request-history.ts`](request-history.ts) | Keeps Freeflow-generated messages (Runtime State, notices, routing communication) at their original positions across requests, so each request starts with the previous one. Pi owns native content. |
| [`projection-tags.ts`](projection-tags.ts) | Tags each request message with the native session entry behind it, so unchanged history is not re-hashed. |
| [`read-only-session.ts`](read-only-session.ts) | Bounded, read-only parsing of Pi session files, and checks that the persisted branch still matches what Pi holds in memory. |
| [`staging.ts`](staging.ts) | Control changes made between prompts are staged and only their net effect is written when the next prompt starts. |
| [`status.ts`](status.ts) | The two status surfaces: the footer (current settings only) and the `/freeflow status` report (diagnostics, including prompt-cache health). |
| [`branch.ts`](branch.ts) | The active session branch, walked once per leaf: every reader gets the same frozen array until the leaf moves (see `dev-docs/guides/performance.md`, rule R-3). |
| [`canonical.ts`](canonical.ts) | Deterministic JSON, so equal values serialize, compare, and hash equally. |
| [`settings/`](settings/README.md) | The `/freeflow` command and its settings screens. |

## Rules

- The fixed system section must not depend on feature state. State belongs in the Runtime State message.
- Freeflow never edits native messages Pi owns; it only places its own messages.
- Configuration is read through `config.ts`; other code receives capability state, not raw files.

Tests: [`tests/host/`](../../tests/host/README.md) and [`tests/integration/`](../../tests/integration/README.md).
