# Source

[`index.ts`](index.ts) is the extension: Pi calls its default export with the extension API, and it registers Freeflow's commands, tools, and event handlers. Each feature lives in its own directory, and `index.ts` connects Pi's events to them.

| Directory | Responsibility |
|---|---|
| [`host/`](host/README.md) | Freeflow on Pi in general: configuration, prompts, the Runtime State message, request history, status, the `/freeflow` command. |
| [`cognitive-routing/`](cognitive-routing/README.md) | Cognitive Routing: Coordinator and worker profiles, delegation, projection, and handoffs. |
| [`tool-execution/`](tool-execution/README.md) | Tool Execution: guidance sections, file tracking and notices, `apply_patch`, background commands. |
| [`provider-support/`](provider-support/README.md) | Provider-specific prompt-cache support: breakpoints, keep-alive, effort history, cache health. |
| [`compaction/`](compaction/README.md) | Freeflow compaction: the agent compacts itself at a planned cycle boundary and recovers in the same run. |

## How a request flows through `index.ts`

1. **`before_agent_start`**: refresh state, let routing prepare the run, write staged control changes, and set the system prompt sections: Pi's own, then Freeflow's fixed guidance, then Tool Execution's environment and guidance. It may also add a changed-files notice.
2. **`context_with_system`**: tag messages with their native entries, add the Runtime State, let routing build the profile's view, and assemble request history so Freeflow's generated messages keep their positions.
3. **`before_provider_request`** (in `provider-support/`): adapt the payload for prompt caching where the route is qualified.
4. **`tool_call` / `tool_result`**: routing's tool gate, the background-command guard, and file tracking.
5. **`turn_end` / `agent_settled`**: routing finishes the turn, file tracking clears pending state, status updates, and a scheduled Freeflow compaction is written. **`turn_start`** runs the resets after a Freeflow compaction.
6. **`session_compact` / `session_tree`**: reset request history, cache tracking, and routing ancestry; restate background commands after compaction.

## Conventions

- Source is TypeScript compiled with `strict: false`; many host objects are typed `any` because Pi's runtime objects are wider than its exported types.
- A file starts with a comment saying what it owns. Keep that comment true when the file changes.
- Import with the `.js` extension (`./host/config.js`), as Node's ES modules require after compilation.
