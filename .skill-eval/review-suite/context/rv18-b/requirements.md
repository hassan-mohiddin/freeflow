# Requirements: minimum Pi 0.99.1, and nested calls under routing

The change moves the supported Pi to 0.99.1, admits a tool's nested calls under automatic routing when they descend from an admitted model call, and keeps the routing tools out of scripts.

1. The minimum supported Pi is 0.99.1. The peer dependency range for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` is `^0.99.1`, and the development dependency pins 0.99.1 for both.
2. A nested call (its tool_call event carries parentToolCallId) gets an id of the form <issuing call id>/<n>, and gate.ts matches it to the model-issued call by that prefix.
3. Under automatic routing, a nested call is admitted with the model-issued call it descends from. The worker-phase and recovery rules still apply to the nested tool itself.
4. An ordinary tool called from a script under automatic routing is admitted when the model-issued call it descends from is in the batch; a worker's nested read while its assignment is outstanding succeeds and returns the file's content.
5. The routing tools freeflow_delegate, freeflow_return, freeflow_unit and freeflow_project are declared with exposure model-only, so codemode scripts cannot call them.
6. A nested routing call is refused, even when the model-issued call it descends from is otherwise valid.
