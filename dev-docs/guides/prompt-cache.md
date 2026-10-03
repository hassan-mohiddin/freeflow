# Prompt Cache Rules

How Freeflow keeps its additions to a request cache-safe, the rules every change to request assembly must follow, and how to verify a change. Read it before changing prompts, tools, projection, request history, routing, tool results, or provider support. How provider caches behave, what Freeflow adds to a request, and what users see are in the user guide [Prompt caching](../../plugin-docs/prompt-caching.md).

The principle: with Freeflow enabled, a user must never pay more for the same work than native Pi would charge. Freeflow owns every cache effect it introduces, such as Cognitive Routing handoffs, projected views, and generated state, and repairs them. The host owns everything else, including cache retention, and Freeflow advises rather than overrides it.

## How Freeflow keeps the cache intact

| Mechanism | Problem it prevents | Scope | Source |
| --- | --- | --- | --- |
| Fixed reference catalog | Prompts or tool lists that change with feature state would invalidate every request. Feature gates decide what may run; definitions stay visible. | All providers | `host/prompts.ts`, `tool-execution/tools.ts`, `cognitive-routing/tools.ts` |
| Request history | Generated state and communication messages keep their historical positions, and changed state appends at the tail. Frames match by prefix, not by view label, so a view change keeps the permitted prefix. Only compaction starts a new generation: a `/tree` branch summary follows its branch point and keeps the path before it byte-identical. | All providers | `host/request-history.ts` |
| Append-only projection | The Coordinator view only extends what the Coordinator already received. Worker evidence admitted later is delivered where it was admitted. Evidence missing from an attention view is delivered where the assessment resumed. Structural worker turns carry only their calls, and a completed worker run shares one provenance note. | All providers | `cognitive-routing/projection.ts`, `cognitive-routing/provenance.ts` |
| Anchor breakpoint | After a worker run, the Coordinator's earlier entry lies beyond the lookback window even though its prefix is unchanged. A provider-neutral planner places a breakpoint on the previous request's final entry and gives up only a redundant breakpoint (on Anthropic, the tools breakpoint that the fixed identity block already covers). | Anthropic Messages; OpenAI Responses on GPT-5.6+ routes that Pi marks `supportsExplicitPromptCacheMode`. Not Codex. | `provider-support/cache/` |
| Coordinator keep-alive | While a delegated worker runs, the Coordinator is certain to resume, but Pi's own warmer only keeps the latest (worker) request warm. Freeflow replays the Coordinator's exact last request with a one-token output cap shortly before the entry expires. | Any model that declares a lifetime and cache prices, on an API whose output can be capped (Anthropic Messages, OpenAI Responses). Not Codex. | `provider-support/cache/keepalive.ts` |
| GPT-6 effort history | Effort changes on qualified GPT-6 routes keep a stable request-level baseline instead of rewriting the request envelope. | Qualified GPT-6 routes | `provider-support/openai/` and [Cognitive Routing](../../plugin-docs/capabilities/cognitive-routing.md#selected-gpt-6-cache-aware-effort-history) |
| Cache health | Warns once when requests that should reuse the prompt repeatedly miss, including a routing profile resuming on its own model. Prompt size includes cache writes. | All providers | `provider-support/cache/health.ts` |
| Retention advice | When the Coordinator's model declares a longer cache tier than the host uses and a miss costs a write, a routing preset warning suggests `PI_CACHE_RETENTION=long`. Freeflow never changes retention itself. | Models declaring both tiers | `cognitive-routing/economics.ts` |

The keep-alive runs only while the host is running an agent turn and routing reports a suspended Coordinator. It stops when the worker returns, the run settles, Freeflow is disabled, a refresh fails or stops reading the cache, a refresh would arrive after the entry expired (for example after the machine slept), or its limits are reached (6 hours or $2 per hold). Each refresh is recorded as a `freeflow-cache-keepalive-v1` session entry; Pi's own session totals do not include it. Requests are kept per routing profile, so a worker on the Coordinator's model does not replace the Coordinator's request.

Cache diagnostics appear on the `prompt cache` line of `/freeflow status`, never in the footer. The footer shows only current Freeflow settings.

## Rules for changing Freeflow

1. **Never change content the provider has already cached.** Do not edit, reorder, shorten, or re-render earlier messages or tool results. A delivered tool result is final.
2. **Append; do not insert.** New content goes after what the requester already received. Deferred delivery at an admission or resume point is the only sanctioned placement other than the tail.
3. **Keep the system section and tool definitions fixed.** No timestamps, counts, identifiers, or state in prompts, tool descriptions, or schemas. Change what may run through gates and the Runtime State, not through definitions. Tool visibility changes must use the host's mid-conversation tool mechanism.
4. **Serialize deterministically.** Stable key order and no volatile values in content that is rendered again.
5. **Route generated per-turn content through request history.** New notice kinds must be request-history transient types so they keep their positions.
6. **A new view or lineage must extend what that requester already received.** Prove it with a test in which a later request starts with the earlier one.
7. **Do not override host cache settings.** Retention, cache mode, and warming belong to the host and user; Freeflow may advise.
8. **Fail closed per provider.** Provider-specific request changes need a protocol entry backed by provider documentation or a recorded live probe. Unqualified routes, including Codex for breakpoints and capped replays, stay untouched.
9. **Keep diagnostics out of the footer.** Report cache mechanics through the cache monitor.
10. **Price from the model catalog.** Economics use Pi's declared `cost` and `promptCache`; never hard-code a provider price or lifetime.

## Verifying a change

- **Tests.** Every change to request assembly needs a prefix-extension test: the later request's messages start with the earlier request's messages. See `pi-extension/tests/cache-reuse/`, `pi-extension/tests/cognitive-routing/projection.test.js`, and `pi-extension/tests/provider-support/cache-*.test.js`.
- **Session usage.** Pi session files record `cacheRead` and `cacheWrite` per assistant message. In a healthy chain, each request reads the previous request's read plus write. A miss after a gap longer than the lifetime is expected.
- **Request capture.** For a live check, run Pi with a small extension that points the provider's `baseUrl` at a local logging proxy. Remove cache markers, confirm each request body starts with the previous one, and compute the lookback distance from the previous final breakpoint. Such a capture is live evidence for the observed session only.
- **Evidence language.** A preserved local prefix is not a provider cache hit. Provider-reported usage at a qualified boundary is required before claiming a hit, and pricing sources are required before claiming a billing saving.

## Related

- [Prompt caching](../../plugin-docs/prompt-caching.md): provider cache behavior, what Freeflow adds, and recorded observations.
- [Performance](performance.md): the other request-path contract.
