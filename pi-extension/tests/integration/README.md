# Integration tests

The whole extension loaded together, checking behavior that spans several source directories.

| File | Covers |
|---|---|
| `pi-extension.test.js` | Extension wiring: Runtime State stays at a fixed prefix position across refreshes and turns; routing tools and projection follow the configured contract. |
| `prompt-architecture.test.js` | The prompt: core fragments, current capabilities, discovery and Runtime State compose correctly; recovery after re-entry is stable; subagents keep optional capabilities off. |
| `pi087-system-timeline.test.js` | Pi's structured system prompt timeline survives Freeflow's context assembly, and unchanged guidance keeps the system prompt byte-identical across turns. |
| `mode-free-core.test.js` | Configuration: obsolete and removed keys are rejected with a migration message; an empty valid config enables Freeflow's core. |
| `request-path-budget.test.js` | Request-path work per prompt: Pi branch walks stay within a fixed budget and do not grow with session length, and Freeflow adds no context-usage estimate when the turn reports its usage (see `dev-docs/guides/performance.md`). |
| `unaffected-regressions.test.js` | Settings and commands that must not change state at the wrong time, such as mid-run or without a terminal UI. |
