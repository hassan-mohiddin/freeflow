# Freeflow Pi Extension

The Pi integration of Freeflow. Pi loads it as an extension and it adds Freeflow's runtime context, Cognitive Routing, Tool Execution, provider prompt-cache support, the `/freeflow` command, and Freeflow's skill commands.

Supported hosts: Pi `>=0.99.1` (developed and tested against the version pinned in the root `package.json`). The other hosts Freeflow supports load skills and hooks only; this directory is Pi-specific.

## Layout

| Path | What it is |
|---|---|
| [`src/`](src/README.md) | TypeScript source. Edit here. |
| `dist/` | Compiled JavaScript built from `src/`. Committed and shipped in the npm package; never edit by hand. |
| [`freeflow/`](freeflow/README.md) | The entry point Pi loads (`package.json` → `pi.extensions`). Re-exports `dist/index.js`. |
| [`tests/`](tests/README.md) | Node test suites, run against `dist/`. |
| `tsconfig.json` | Compiles `src/` into `dist/`. |

## Build and test

Run from the repository root:

```bash
npm run build             # src/ → dist/, then formats dist/
npm run typecheck         # type errors only, no output
npm run test:pi-extension # builds, then runs every tests/**/*.test.js
npm run check             # the full deterministic gate used in CI
```

Commit `dist/` together with the `src/` change that produced it. Pi development uses a committed snapshot of the repository, not this working tree (see `AGENTS.md`, "Development Snapshot Boundary").

## Rules that apply everywhere here

- **Performance.** Keep per-request and per-turn work small and independent of session length; keep `tests/integration/request-path-budget.test.js` passing. See [Performance](../dev-docs/guides/performance.md).
- **Prompt cache.** Never change content a provider already cached, keep the Freeflow system section and tool definitions fixed, and append new content at the end. Every request-assembly change needs a test in which a later request starts with the earlier one. See [Prompt cache rules](../dev-docs/guides/prompt-cache.md).
- **Host source.** Work from a pinned upstream Pi checkout, not installed or cached docs (`AGENTS.md`, "External Host Source Provenance").
- **Pi imports.** Pi provides `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` to extensions at runtime. They are peer dependencies, never bundled.

## Further reading

- [Pi integration](../plugin-docs/integrations/pi.md)
- [Architecture](../dev-docs/README.md) and [Prompt architecture](../dev-docs/subsystems/prompt-assembly.md)
- [Cognitive Routing](../plugin-docs/capabilities/cognitive-routing.md) and [Tool Execution](../plugin-docs/capabilities/tool-execution.md)
