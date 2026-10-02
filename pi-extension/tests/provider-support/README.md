# Provider Support tests

Tests for [`src/provider-support/`](../../src/provider-support/README.md). No test calls a real provider; native tests read the request bodies Pi would have sent.

| File | Covers |
|---|---|
| `cache-anchor.test.js` | The provider-neutral planner: a request within the lookback window is sent unchanged; one whose previous cache entry fell out of it gets a breakpoint there. |
| `cache-anchor-openai.test.js` | The same for OpenAI Responses positions (eligible message endings). |
| `cache-anchor-native.test.js` | Breakpoint placement in real Pi requests. |
| `cache-keepalive.test.js` | Keep-alive replays: when a waiting requester's last request is replayed with a small output cap, and how each refresh is reported. |
| `cache-keepalive-native.test.js` | The Coordinator's cache kept warm while its worker runs, in a real session. |
| `cache-health.test.js` | Regression detection: healthy requests raise nothing; repeated unexplained misses warn once. |
| `cache-monitor.test.js` | Cache diagnostics go to `/freeflow status`, never to the footer. |
| `chatgpt-sign-in.test.js` | Sign in with ChatGPT is recognized and left untouched, while API-key routes keep their support. |
| `openai-effort.test.js` | Effort history: fresh chains, Low → High → Low replays with original anchors. |
| `openai-effort-boundaries.test.js` | Effort history across branch summaries and older record formats. |
| `native.test.js` | Effort history through real Pi dispatch, reload, tree navigation and compaction. |
| `cli.test.js` | Pi's own CLI, started as a child process, loads Freeflow and changes effort inside a tool loop. |
