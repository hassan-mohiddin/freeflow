# Cache reuse tests

End-to-end checks of Freeflow's main cost promise: each request starts with the previous request of the same view, so the provider can reuse its cached prompt. These tests cross several source directories (host request history, routing views, provider support), which is why they live apart.

| File | Covers |
|---|---|
| `history.test.js` | Request history: generated state keeps its original position and changed state is appended; view changes never bring back excluded bodies. |
| `native.test.js` | Real routing sessions on OpenAI models: per-view prefixes hold with and without projection, and reasoning is shared within a view but withheld across views. |
| `claude-native.test.js` | The same prefix guarantees on a Claude model (Anthropic Messages), using its published catalog entry. |

A failure here usually means something rewrote earlier request content. Find which message changed between two consecutive request bodies before changing the test.
