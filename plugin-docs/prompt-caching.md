# Prompt Caching

Provider prompt caches decide most of what a long agent session costs. With Freeflow enabled, a user must never pay more for the same work than native Pi would charge. Freeflow owns every cache effect it introduces, such as Cognitive Routing handoffs, projected views, and generated state, and repairs them. The host owns everything else, including cache retention, and Freeflow advises rather than overrides it.

This page explains how provider caches behave, what Freeflow adds to a request, how it keeps that addition cache-safe, and the rules every change to request assembly must follow. Read it before changing prompts, tools, projection, request history, routing, tool results, or provider support.

## How provider prompt caches work

A cache stores a request prefix. A later request reads it only while its own prefix is byte-identical up to a stored position.

- **Render order.** Tools render first, then the system prompt, then messages. A change anywhere invalidates everything after it, so a changed tool definition invalidates the whole request.
- **Per model.** Each model has its own cache. Switching models, including a Cognitive Routing handoff, means the other model reads or writes its own entry.
- **Breakpoints and lookback.** A provider writes entries only at breakpoints and looks back a bounded distance for earlier ones. A prefix that is still byte-identical can therefore be missed when too much content was appended since the entry was written.
- **Lifetime.** Entries expire after a period without use. Reading an entry refreshes its lifetime at no extra charge.
- **Pricing shape.** Writing usually costs more than ordinary input, and reading costs much less. A miss re-writes the whole prefix at the write price.

Provider specifics that Freeflow relies on:

| Route | Breakpoints and lookback | Lifetime | Pricing shape |
| --- | --- | --- | --- |
| Anthropic Messages | Up to 4 explicit `cache_control` breakpoints; each looks back at most 20 positions. A run of consecutive `tool_use` blocks, or of `tool_result` blocks, counts as one position. With subscription (OAuth) auth, Pi marks the last tool, the fixed identity block, the system prompt, and the last message. | 5 minutes by default; 1 hour with `PI_CACHE_RETENTION=long` | Writes 1.25× input (1 hour: 2×); reads 0.1× input (Claude Opus 5.5: 0.05×) |
| OpenAI Responses, GPT-5.6 and later | Implicit breakpoint at the latest eligible message (a user message or the last tool output of a group). Lookup checks it, up to 20 earlier eligible message endings, and explicit `prompt_cache_breakpoint` markers (the first 2 and latest 50). | 30 minutes | Writes 1.25× input; reads 0.1× input |
| ChatGPT Codex backend | No lookback limit observed: the full prefix was reused after 60 appended message endings. Rejects `prompt_cache_breakpoint`, `prompt_cache_options`, and `max_output_tokens`. Lookup is routed by `prompt_cache_key`, which Pi sets to the session id. | Observed: `gpt-6-sol` expired between 25 and 35 minutes, `gpt-6-luna` was still cached at 35 minutes; a read refreshed both | Usage reports cache reads but no writes |

Pi's model catalog declares each model's cache lifetime (`promptCache`) and prices (`cost`). Freeflow reads these values rather than hard-coding provider numbers. A model without a declared lifetime is treated as unknown.

## What Freeflow adds to a request

| Addition | Stability | Measured size (one Claude Opus 5.5 session) |
| --- | --- | --- |
| `freeflow_guidance` system section | Fixed text, independent of runtime state | about 2.3k tokens |
| Freeflow tool definitions | Registered once with fixed descriptions and schemas; routing tools stay visible for every profile | about 2.0k tokens for 7 tools |
| Runtime State messages | Appended only when displayed state changes; kept at their original positions | about 0.9k tokens over the session |
| Provenance notes (Cognitive Routing) | Appended after each exchange, or once per completed worker run in the Coordinator view | about 5.2k tokens over the session |

Fixed additions are written once and then read at the cache-read price on every request.

## How Freeflow keeps the cache intact

| Mechanism | Problem it prevents | Scope | Source |
| --- | --- | --- | --- |
| Fixed reference catalog | Prompts or tool lists that change with feature state would invalidate every request. Feature gates decide what may run; definitions stay visible. | All providers | `runtime/runtime-context.ts`, `tool-runtime/tools.ts`, `cognitive-routing-v2/tools.ts` |
| Request history | Generated state and communication messages keep their historical positions, and changed state appends at the tail. Frames match by prefix, not by view label, so a view change keeps the permitted prefix. Only compaction starts a new generation: a `/tree` branch summary follows its branch point and keeps the path before it byte-identical. | All providers | `runtime/request-history.ts` |
| Append-only projection | The Coordinator view only extends what the Coordinator already received. Worker evidence admitted later is delivered where it was admitted. Evidence missing from an attention view is delivered where the assessment resumed. Structural worker turns carry only their calls, and a completed worker run shares one provenance note. | All providers | `cognitive-routing-v2/projection.ts`, `session-sources/provenance.ts` |
| Anchor breakpoint | After a worker run, the Coordinator's earlier entry lies beyond the lookback window even though its prefix is unchanged. A provider-neutral planner places a breakpoint on the previous request's final entry and gives up only a redundant breakpoint (on Anthropic, the tools breakpoint that the fixed identity block already covers). | Anthropic Messages; OpenAI Responses on GPT-5.6+ routes that Pi marks `supportsExplicitPromptCacheMode`. Not Codex. | `provider-support/cache/` |
| Coordinator keep-alive | While a delegated worker runs, the Coordinator is certain to resume, but Pi's own warmer only keeps the latest (worker) request warm. Freeflow replays the Coordinator's exact last request with a one-token output cap shortly before the entry expires. | Any model that declares a lifetime and cache prices, on an API whose output can be capped (Anthropic Messages, OpenAI Responses). Not Codex. | `provider-support/cache/keepalive.ts` |
| GPT-6 effort history | Effort changes on qualified GPT-6 routes keep a stable request-level baseline instead of rewriting the request envelope. | Qualified GPT-6 routes | `provider-support/openai/` and [Cognitive Routing](capabilities/cognitive-routing.md#selected-gpt-6-cache-aware-effort-history) |
| Cache health | Warns once when requests that should reuse the prompt repeatedly miss, including a routing profile resuming on its own model. Prompt size includes cache writes. | All providers | `efficiency/cache-health.ts` |
| Retention advice | When the Coordinator's model declares a longer cache tier than the host uses and a miss costs a write, a routing preset warning suggests `PI_CACHE_RETENTION=long`. Freeflow never changes retention itself. | Models declaring both tiers | `cognitive-routing-v2/economics.ts` |

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

- **Tests.** Every change to request assembly needs a prefix-extension test: the later request's messages start with the earlier request's messages. See `pi-extension/tests/cache-reuse/`, `pi-extension/tests/cognitive-routing-v2/projection.test.js`, and `pi-extension/tests/provider-support/cache-*.test.js`.
- **Session usage.** Pi session files record `cacheRead` and `cacheWrite` per assistant message. In a healthy chain, each request reads the previous request's read plus write. A miss after a gap longer than the lifetime is expected.
- **Request capture.** For a live check, run Pi with a small extension that points the provider's `baseUrl` at a local logging proxy. Remove cache markers, confirm each request body starts with the previous one, and compute the lookback distance from the previous final breakpoint. Such a capture is live evidence for the observed session only.
- **Evidence language.** A preserved local prefix is not a provider cache hit. Provider-reported usage at a qualified boundary is required before claiming a hit, and pricing sources are required before claiming a billing saving.

## Recorded observations

Live observations from September 2026, on Pi 0.87.1 with a Claude subscription and a ChatGPT Codex subscription:

- **Anthropic handoff.** A Coordinator request after a 15-read worker run lay 36 positions past the previous entry. With the anchor it read all 152,978 previously cached tokens and wrote 67,812 new ones. Before the anchor, a comparable handoff read only the 44,102-token tools and system prefix.
- **Anthropic keep-alive.** With the 5-minute lifetime, a replay at 4 minutes kept an entry alive at 8 minutes (2,069 tokens read, none written). The unrefreshed control wrote its prompt again.
- **Codex.** `gpt-6-luna` and `gpt-6-sol` reused the full prefix after 10, 25, and 60 appended message endings, and rejected `prompt_cache_breakpoint`, `prompt_cache_options`, and `max_output_tokens`. An untouched `gpt-6-sol` entry had expired at 35 minutes while `gpt-6-luna` was still cached; entries read at 25 minutes were still cached at 50 minutes on both models.

These observations describe the recorded sessions and models only. They do not establish behavior for other models, accounts, or future provider versions.
