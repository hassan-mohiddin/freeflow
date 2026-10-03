# Prompt-cache support

Providers with explicit cache breakpoints can only find an earlier cached prefix within a limited lookback. When Freeflow adds messages, routing switches views, or a profile resumes later, the useful cached prefix can fall out of that window. This directory places breakpoints so each request can reach its own earlier prefix, keeps a cache warm while its requester is certain to come back, and watches for cache regressions. How and why: [Request history and prompt cache](../../../../dev-docs/subsystems/request-history-and-cache.md).

| File | Owns |
|---|---|
| [`anchor.ts`](anchor.ts) | A provider-neutral view of a request's cache layout, in lookback positions, and the planner that decides where a breakpoint goes. The planner never sees provider fields. |
| [`anthropic.ts`](anthropic.ts) | Anthropic Messages: up to four explicit breakpoints, each reading up to 20 positions back. |
| [`openai-responses.ts`](openai-responses.ts) | OpenAI Responses on GPT-5.6+: an implicit breakpoint at the latest eligible message, with lookup up to 20 earlier eligible message endings and the latest explicit breakpoints. |
| [`index.ts`](index.ts) | `CacheAnchorAdapter`: maps a payload to the neutral layout, plans, applies the provider's breakpoint, and remembers recent layouts per session and model. Skips Sign in with ChatGPT and APIs with unbounded lookup. |
| [`keepalive.ts`](keepalive.ts) | Replays a small capped request to keep a prompt cache warm when its requester is certain to resume, for example a Coordinator waiting while a worker runs. Spend is recorded in the session. |
| [`health.ts`](health.ts) | Detects cache regressions: back-to-back requests to the same model and effort, with nothing in between that legitimately breaks the cache, should reuse the previous prompt. |
| [`monitor.ts`](monitor.ts) | Collects cache diagnostics for `/freeflow status`. |

## Rules

- The planner works only on positions and fingerprints; provider fields stay in the per-API files.
- A breakpoint is a marker on the request. Placing one never changes message content.
- Keep-alive costs money. It runs only when the requester is certain to resume, and never on APIs whose output cannot be capped (the ChatGPT Codex backend, Sign in with ChatGPT).

Tests: [`tests/provider-support/`](../../../tests/provider-support/README.md) (`cache-*.test.js`).
