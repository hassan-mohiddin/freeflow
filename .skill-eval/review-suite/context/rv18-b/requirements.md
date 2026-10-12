# Requirements: minimum Pi 0.99.1, and nested calls under routing

The change moves the supported Pi to 0.99.1, admits a tool's nested calls under automatic routing when they descend from an admitted model call, and keeps the routing tools out of scripts.

1. The minimum supported Pi is 0.99.1. The peer dependency range for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` is `^0.99.1`, and the development dependency pins 0.99.1 for both.
2. A tool that calls other tools (Pi's codemode, or `ctx.executeTool`) makes nested calls whose ids have the form `<issuing call id>/<n>`. A nested call never appears in the assistant message.
3. Under automatic routing, a nested call is admitted with the model-issued call it descends from. The worker-phase and recovery rules still apply to the nested tool itself.
4. An ordinary tool called from a script is admitted under routing like the same call made directly. A worker's nested `read` while its assignment is outstanding succeeds and returns the file's content.
5. The routing tools (`freeflow_delegate`, `freeflow_return`, `freeflow_unit`, `freeflow_project`, and the other routing tools) are declared model-only, so codemode scripts cannot call them. The gate refuses a routing tool called from a script with "Call <name> directly, not from a script."
6. A nested routing call is refused, even when the model-issued call it descends from is otherwise valid.
