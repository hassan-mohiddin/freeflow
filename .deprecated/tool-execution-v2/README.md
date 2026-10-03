# Tool Execution v2 (retired)

Freeflow's own execution runtime, retired on 2026-09-30 after Pi 0.99 shipped codemode, tool exposure and tool search. Freeflow now keeps Pi's tools and adds a thin layer where Pi lacks something (Task 006 decisions D-017 to D-019, D-024, D-025).

Last active at commit `92d1d78`. The archive mirrors the repository layout and is not built, tested or packaged; it may not compile on its own.

- `pi-extension/src/tool-runtime/`: operation kernel and registry, admission and effect journal, `freeflow_tools` discovery and generic call, `freeflow_run` QuickJS programs, direct `freeflow_read`/`freeflow_search`/`freeflow_patch`, native Bash capture and cooperating adapters, `freeflow_result` and result reads, the Session Store, guidance observation, and efficiency accounting.
- `pi-extension/src/provider-support/observation.ts`: provider request/response observers that fed accounting.
- `pi-extension/tests/`: the runtime's unit and native tests, the v2 integration tests, and the retired settings tests (`integration/pi-extension-settings.retired.js`).
- `scripts/validation/`: the core-bindings check and the installed Tool Execution candidate check.
- `capabilities/tool-execution/` and `runtime/prompts/tool-execution.md`: the v2 capability skill, its references, and the cue as they were when retired.
