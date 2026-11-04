# Cache reuse tests

End-to-end checks of Freeflow's main cost promise: each request starts with the previous request, so the provider can reuse its cached prompt. These tests cross several source directories (host request history, provider support), which is why they live apart.

| File | Covers |
|---|---|
| `history.test.js` | Request history: generated state keeps its original position and changed state is appended. |
| `claude-native.test.js` | The prefix guarantee on a Claude model (Anthropic Messages), using its published catalog entry: a tool activated mid-session (defined inside the conversation since Pi 1.0.1, so the earlier request stays a prefix and Freeflow's anchor can find it). |

A failure here usually means something rewrote earlier request content. Find which message changed between two consecutive request bodies before changing the test.
