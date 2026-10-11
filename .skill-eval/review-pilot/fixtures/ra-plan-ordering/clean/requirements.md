# Requirements: Freeflow toggle implementation plan

Freeflow is a workflow plugin for coding agents, and Pi is one host agent it runs in. Freeflow must stay inactive in a repository until `/setup-freeflow` creates a valid `.freeflow/config.json`. Two settings in that file turn parts of Freeflow off without deleting their configuration: a top-level `enabled` flag turns the whole runtime off, and `skills.enabled` turns off the workflow skills and their runtime context. The output router has its own layer toggle. The implementation plan must say how each of these behaves, in an order that can be built step by step.

1. A repository with a missing or invalid `.freeflow/config.json` gets only setup, status and config entry points. It gets no Freeflow workflow context and no Freeflow workflow skills.
2. A config file with no top-level `enabled` field is treated as enabled, for backward-compatible setup config. The plan states when top-level `enabled` defaults to true.
3. With top-level `enabled: false`, Freeflow workflow skills are not exposed, base runtime context stops applying, and a disabled sentinel stops old activation blocks from applying Freeflow behavior. Observed routing and the native safety net do nothing. `/freeflow enable` stays available.
4. With `skills.enabled: false`, Freeflow workflow skills are not exposed and base runtime context is gated off. The plan states the default of `skills.enabled`, which is true.
5. `outputRouter.enabled` is an independent layer toggle that takes effect only when top-level Freeflow is enabled. Output-router context follows its effective layer state.
6. Output-router config normalization stays the source of truth for router configuration.
7. Freeflow skills are exposed dynamically by a resource discovery handler, not by a static entry in the package metadata. `output-router` is excluded from model skill exposure, and `setup-freeflow` is exposed when setup is missing.
8. The commands `/freeflow`, `/freeflow status`, `/freeflow enable`, `/freeflow disable` and `/freeflow settings` are added. `/output-router` remains as a compatibility command.
9. `/freeflow settings` shows the master toggle first. While Freeflow is off, the non-master rows are greyed out and cannot be edited.
10. `/workflow` and direct Freeflow skill commands are guarded when skills are not effective.
11. Setup and activation contract wording and plugin docs are updated to say Freeflow applies when enabled by `.freeflow/config.json`, and to describe the layer toggles.
12. Pi extension tests cover missing setup, master off, skills off, router-only, and settings-row inactivity.
13. Verification names the Pi extension build, the Pi extension test run, the runtime context hook test, and the activation contract check when setup wording changes.
14. The implementation slices are ordered so that each slice uses only state, readers and handlers that existing code or an earlier slice provides.
15. Out of scope: Codex and Claude marketplace behavior beyond docs and hook parity; a true install-wide package disable inside Freeflow; enabling output-router, observed routing, native safety net, or script transform by default.
