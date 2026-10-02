# Tests

Node's built-in test runner (`node:test`) runs these suites against the compiled extension in `dist/`, never against `src/`. From the repository root:

```bash
npm run test:pi-extension                              # build, then every *.test.js
npm run build && node --test pi-extension/tests/tool-execution/background.test.js
node --test --test-name-pattern="codemode" pi-extension/tests/cognitive-routing/pi-099.test.js
```

Rebuild after changing `src/`; a stale `dist/` tests old code.

## Two kinds of test

- **Unit tests** import one module from `dist/` and check it directly.
- **Native tests** (`*-native.test.js`, `native.test.js` and most routing suites) start a real Pi session with `createAgentSession`, load Freeflow into it, and replace `fetch` with scripted provider responses. They run Pi's real request assembly, tools, and session files with no network and no cost. [`fixtures/`](fixtures/README.md) provides the harness.

## Suites

| Directory | Covers |
|---|---|
| [`cognitive-routing/`](cognitive-routing/README.md) | Routing state, delegation, handoffs, projection, recovery, and its behavior on the current Pi. |
| [`tool-execution/`](tool-execution/README.md) | File tracking, notices, `apply_patch`, background commands, the bash guard, prompt sections. |
| [`provider-support/`](provider-support/README.md) | Cache breakpoints, keep-alive, cache health, OpenAI effort history, Sign in with ChatGPT. |
| [`cache-reuse/`](cache-reuse/README.md) | End-to-end prompt-cache reuse: each request extends the previous one, per view and per provider. |
| [`host/`](host/README.md) | Settings widgets and persisted-session checks. |
| [`integration/`](integration/README.md) | The whole extension: prompt architecture, Runtime State placement, configuration, and regressions. |

## Writing a test

- Prefer a native test when the behavior depends on Pi: request contents, event order, tool loadout, or session entries.
- A request-assembly change needs a prefix test: a later request must start with the earlier one (`AGENTS.md`, Prompt Cache).
- Name tests by the behavior they protect, as a sentence.
- Check that a new test can fail: break the code it guards once and watch it fail.
