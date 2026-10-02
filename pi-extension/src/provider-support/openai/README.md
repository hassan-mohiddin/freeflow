# OpenAI effort history

On OpenAI's Responses API, changing the request-level `reasoning.effort` starts a separate prompt cache, so the first request at a new effort rereads the whole conversation. GPT-6 models accept a `configuration_update` input item that changes effort mid-conversation while keeping the cache. On qualified routes, Freeflow keeps the request-level effort at the chain's baseline and expresses each effort change as a `configuration_update` item at the point where it happened. The input then stays a prefix extension of the previous request, so the cache survives effort changes, including Cognitive Routing's profile switches on one model.

| File | Owns |
|---|---|
| [`index.ts`](index.ts) | Registers the adapter on `before_provider_request` and resets it on session start, navigation and compaction. |
| [`adapter.ts`](adapter.ts) | Decides whether a request qualifies (official endpoint, supported GPT-6 model, not Sign in with ChatGPT), then rewrites it from the recorded history. On any error it returns the untouched request. |
| [`history.ts`](history.ts) | The record format (`freeflow-openai-effort-v1` session entries) and how a request is assembled from it. Records store hashes of the input, never message bodies. |
| [`session-state.ts`](session-state.ts) | Reads and writes those records for the current branch, and decides where a chain stays compatible. Compaction starts a new chain; branch summaries do not. |

## Rules

- Qualified models only: `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`, on api.openai.com with an API key or on the ChatGPT Codex endpoint (`openai-codex`, legacy).
- Sign in with ChatGPT is excluded: it rejects `configuration_update` with HTTP 400 (live check, 2026-09-30).
- When Freeflow is disabled, requests and session history are left untouched.

Tests: [`tests/provider-support/openai-effort.test.js`](../../../tests/provider-support/openai-effort.test.js) and `openai-effort-boundaries.test.js`.
