# Prompt Caching

Provider prompt caches decide most of what a long agent session costs. With Freeflow enabled, a user must never pay more for the same work than native Pi would charge. Freeflow owns every cache effect it introduces, such as Cognitive Routing handoffs, projected views, and generated state, and repairs them. The host owns everything else, including cache retention, and Freeflow advises rather than overrides it.

This page explains how provider caches behave, what Freeflow adds to a request, and what it does to keep cache reuse high. Contributors changing request assembly also read the developer guide [Prompt cache rules](../dev-docs/guides/prompt-cache.md).

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

## What Freeflow does for the cache

Freeflow keeps what it adds to a request fixed and appends new content instead of rewriting what a provider has already cached, so its additions are written once and then read at the cache-read price. Features you may see:

- **Coordinator keep-alive.** While a delegated Cognitive Routing worker runs, Freeflow replays the Coordinator's last request with a one-token output cap shortly before its cache entry expires, so the Coordinator does not pay to write its prompt again when it resumes. It runs only on models that declare a cache lifetime and prices, on APIs whose output can be capped (Anthropic Messages, OpenAI Responses; not the ChatGPT Codex backend or Sign in with ChatGPT). It stops when the worker returns, the run settles, Freeflow is disabled, a refresh fails or stops reading the cache, a refresh would arrive after the entry expired (for example after the machine slept), or after 6 hours or $2 per hold. Each refresh is recorded as a `freeflow-cache-keepalive-v1` session entry; Pi's own session totals do not include it.
- **Cache-health warning.** Freeflow warns once when requests that should reuse the prompt repeatedly miss, including a routing profile resuming on its own model.
- **Retention advice.** When the Coordinator's model has a longer cache tier than the host uses, a routing preset warning suggests `PI_CACHE_RETENTION=long`. Freeflow never changes retention itself.

Cache diagnostics appear on the `prompt cache` line of `/freeflow status`, never in the footer. The footer shows only current Freeflow settings.

How Freeflow keeps requests cache-safe, and the rules for changing it, are in the developer guide [Prompt cache rules](../dev-docs/guides/prompt-cache.md); how each mechanism works is in [Request history and prompt cache](../dev-docs/subsystems/request-history-and-cache.md).

## Recorded observations

Live observations from September 2026, on Pi 0.87.1 with a Claude subscription and a ChatGPT Codex subscription:

- **Anthropic handoff.** A Coordinator request after a 15-read worker run lay 36 positions past the previous entry. With the anchor it read all 152,978 previously cached tokens and wrote 67,812 new ones. Before the anchor, a comparable handoff read only the 44,102-token tools and system prefix.
- **Anthropic keep-alive.** With the 5-minute lifetime, a replay at 4 minutes kept an entry alive at 8 minutes (2,069 tokens read, none written). The unrefreshed control wrote its prompt again.
- **Codex.** `gpt-6-luna` and `gpt-6-sol` reused the full prefix after 10, 25, and 60 appended message endings, and rejected `prompt_cache_breakpoint`, `prompt_cache_options`, and `max_output_tokens`. An untouched `gpt-6-sol` entry had expired at 35 minutes while `gpt-6-luna` was still cached; entries read at 25 minutes were still cached at 50 minutes on both models.

Live observations from September and October 2026, on Pi 0.99 and 1.0 with GPT-6 Luna and Sol 6.1:

- **Sign in with ChatGPT** (the `openai` provider with a ChatGPT credential, added in Pi 0.99) rejected `prompt_cache_breakpoint`, `max_output_tokens` and `configuration_update` ("use an API key instead"), reused the full cached prefix after 25 appended turns, and kept a separate cache per reasoning effort: the first request at a new effort reread the prefix, and returning to an earlier effort read that effort's cache again. Freeflow leaves this route untouched: no breakpoints, no keep-alive replay, no effort-history rewriting.
- **Compaction under Cognitive Routing.** After a worker's Freeflow compaction, the Coordinator's next request wrote its view once (about 50k to 106k tokens, depending on the evidence the worker selected), and every later Coordinator request read its whole previous request from cache, through an evidence recovery and the unit's close.

These observations describe the recorded sessions and models only. They do not establish behavior for other models, accounts, or future provider versions.
