# Provider Support

Provider-specific request changes that keep prompt caches working, so Freeflow never costs more than native Pi for the same work. Everything here acts in Pi's `before_provider_request` hook, on qualified routes only; any other route gets its request exactly as Pi built it.

Background: [Prompt cache rules](../../../dev-docs/guides/prompt-cache.md) and the user guide [Prompt caching](../../../plugin-docs/prompt-caching.md).

| Path | Owns |
|---|---|
| [`index.ts`](index.ts) | Registers provider support: cache breakpoints, keep-alive, and OpenAI effort history. |
| [`routes.ts`](routes.ts) | Recognizes OpenAI's Sign in with ChatGPT route, which is left untouched: live checks showed it rejects explicit breakpoints, output caps and effort-change items. |
| [`effort.ts`](effort.ts) | Whether changing effort keeps the prompt cache on a route. Used by routing's preset warnings. |
| [`cache/`](cache/README.md) | Cache breakpoint placement, keep-alive, cache health, and cache diagnostics. |
| [`openai/`](openai/README.md) | Effort history for qualified OpenAI GPT-6 routes, so an effort change does not start a new cache. |

## Rules

- Change a provider request only when the provider's documentation or a recorded live probe supports it. Leave unqualified routes untouched.
- A failure here must never fail the request: cache placement is an optimization, so errors fall back to Pi's payload.
- Report cache diagnostics to `/freeflow status`, not the footer.
- Advise on host cache settings, such as retention; never override them.

Tests: [`tests/provider-support/`](../../tests/provider-support/README.md) and [`tests/cache-reuse/`](../../tests/cache-reuse/README.md).
