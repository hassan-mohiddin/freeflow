# Request History And Prompt Cache

> **Covers:** `pi-extension/src/host/request-history.ts`, `pi-extension/src/host/runtime-state.ts`, `pi-extension/src/host/projection-tags.ts`, `pi-extension/src/host/read-only-session.ts`, `pi-extension/src/provider-support/`
> **Tests:** `pi-extension/tests/cache-reuse/`, `pi-extension/tests/provider-support/`, `pi-extension/tests/host/persisted-branch.test.js`
> **Verified at:** `3a8fdf42` (2026-10-03)
> **User docs:** `plugin-docs/prompt-caching.md`

For contributors changing how Freeflow assembles requests or touches provider payloads. This doc explains the mechanisms: how generated messages keep their positions, where cache breakpoints are added, when a cache is kept warm, and how regressions are detected. The rules every change must follow, and how to verify one, are in [Prompt cache rules](../guides/prompt-cache.md); this doc does not repeat them.

## Purpose

A provider's prompt cache reuses a request's prefix only while it is byte-identical to an earlier request's. Freeflow adds content to requests that Pi does not store as conversation: the Runtime State message, and Cognitive Routing's state, attention, budget and communication messages. If Freeflow re-rendered those at a new position on every request, every request would rewrite its own prefix, and a user would pay more with Freeflow than with native Pi. Freeflow's rule is that this never happens.

This subsystem keeps that promise in three layers:

- **Request history** (`host/request-history.ts`) gives each Freeflow-generated message a fixed position in the conversation, persisted in the session, so later requests start with earlier ones.
- **Provider support** (`provider-support/`) adjusts provider payloads on qualified routes only. It adds a cache breakpoint where a resuming requester's earlier entry fell out of the provider's lookback, and keeps a waiting Coordinator's cache warm. On GPT-6 it also keeps effort changes from starting a new cache.
- **Diagnostics** (`provider-support/cache/health.ts` and `monitor.ts`) warn when requests that should reuse the cache keep missing, and report on `/freeflow status`.

It deliberately does not:

- edit, reorder or re-render native messages, which Pi owns;
- change host cache settings (retention, cache mode, Pi's own warmer); it advises;
- change a payload on a route not qualified by provider documentation or a recorded live probe;
- let any failure here fail a request.

## Vocabulary

| Term | Meaning | In code |
| --- | --- | --- |
| Transient message | A Freeflow-generated message added to the request in `context_with_system` and not stored as a session message. | `TRANSIENT` in `request-history.ts` |
| Native message | Anything Pi projects from the session, including custom messages extensions sent (such as compaction notices). | — |
| Frame | One persisted record of where transient messages sit: a `freeflow-request-history-v1` custom entry. | `Frame` |
| Generation | The span between compactions. Frames match only within their generation; a compaction starts a new one, a `/tree` branch summary does not. | `Frame.generation` (the compaction entry id, or `"root"`) |
| Prefix hash | A chained SHA-256 over the native messages up to a frame's length. | `prefixes()` |
| View | Which requester the request is for: `"coordinator"` (projected) or `"ordinary"`. Recorded on frames, not used for matching. | `Frame.view` |
| Lookback | How far back a provider searches from a breakpoint for an earlier cache entry: 20 positions on both qualified APIs. | `CacheLimits.lookback` |
| Position | A unit the provider's lookback counts. Anthropic: a content block, with a run of consecutive `tool_use` or `tool_result` blocks counting as one. OpenAI Responses: an eligible message ending (a user message, or the last tool output of a group). | `anthropicLayout()`, `responsesLayout()` |
| Anchor | The breakpoint Freeflow adds on the previous request's final entry. | `planAnchor()` |
| Lane | Requests remembered per session, provider and model; for keep-alive, also per requester (routing profile). | `CacheAnchorAdapter.lanes`, `laneKey()` |
| Hold | A requester certain to resume, whose cache is kept warm: a Coordinator under automatic control whose worker holds an assignment. | `KeepAliveHold`, `routing.suspendedCoordinator()` |
| Qualified route | A provider API and model whose cache protocol Freeflow has from provider documentation or a recorded live probe. | `PROTOCOLS` in `cache/index.ts` and `cache/keepalive.ts` |

Terms from Cognitive Routing ([its doc](cognitive-routing.md)): the **Coordinator** profile talks to the user and judges work; **worker** profiles (Helper, Executor) carry out **assignments** inside a **unit** of work. Under **automatic control** routing switches Pi's model per profile itself. With **projection** on, the Coordinator's requests carry a reduced view: its own conversation plus the worker's report and selected evidence. The **leaf** is the session entry Pi's branch currently ends at.

## How It Works

### Request history

`index.ts` runs request assembly in Pi's `context_with_system` hook, on every request:

1. Tag Pi's projected messages with the session entry behind each (`tagProjectedMessages()`), so unchanged native messages are fingerprinted once per session instead of on every request.
2. Add the Runtime State (`withFreeflowRuntimeState()`).
3. Let routing build its view and add its transient messages (`routing.context()`).
4. Call `requestHistory.assemble(messages, view, ctx, budgetNotice)`.

`assemble()` serializes calls and, in `prepare()`:

1. **Checks ancestry.** It walks the branch from where its cached walk ended, requires each entry's `parentId` to chain to the leaf, and notes the latest compaction as the generation. Frames that appeared without this process writing them (after a reload) trigger a check that the session file still matches Pi's in-memory branch (`persistedBranchMatches()`). The check compares only the file's new tail when it can (`trustLoadedSession()` records the point Pi loaded).
2. **Validates frames.** Each new frame must parse, sit right after the leaf it was written at (`basis`), and chain to a parent frame of the same generation.
3. **Finds the prior frame.** It splits the request into native messages (`base`) and transient ones, computes prefix hashes over `base`, and picks the longest frame in this generation whose prefix hash matches.
4. **Replays.** It walks the prior frame's parent chain and re-inserts every recorded addition at its recorded index.
5. **Appends changes.** A transient message whose fingerprint differs from the recorded state of its kind goes at the tail (`at: base.length`). Communication messages are deduplicated by signature across the whole chain, so admitted communication survives a unit closing. Situational kinds (`freeflow-routing-attention`) are cleared from state when absent, so their next occurrence is new.
6. **Writes a frame** only when something was added or cleared, or no prior frame exists. It then reads the entry back from the branch to confirm it.

The result: every transient message stays where it first appeared, and changed state lands at the tail.

To add a new generated message kind: give it its own `customType`, add the type to `TRANSIENT` (and to `SITUATIONAL` if it describes a passing condition that should count as new each time it reappears), list it under Surface below, and extend `tests/cache-reuse/history.test.js` with a prefix-extension case. A message sent through Pi as a session message (`pi.sendMessage`) is native and must not be added: Pi already keeps its position.

### Runtime State placement

`withFreeflowRuntimeState()` places the Runtime State before the first user message the first time. Unchanged, it keeps its position (`runtimeStateAnchor`); changed, it moves to just before the latest user message. Request history normally overrides this placement: it strips transient messages and re-inserts them from frames. The anchor matters on the paths that bypass request history, when it is unavailable or fails. `freeflow-cognitive-routing-runtime-state` is an older type no longer produced; it is still recognized so sessions that contain it assemble correctly.

### Cache breakpoints (anchor)

In `before_provider_request`, `CacheAnchorAdapter.adapt()` runs for `anthropic-messages`, and for `openai-responses` / `azure-openai-responses` when Pi marks the model `compat.supportsExplicitPromptCacheMode`. It skips Sign in with ChatGPT (`isChatGPTSignIn()`).

1. A per-API layout function maps the payload to positions, a cumulative fingerprint per position (with cache markers removed), and existing breakpoints. Anthropic also marks yieldable breakpoints: the tools breakpoint, and all but the last system breakpoint.
2. `planAnchor()` looks at up to 8 remembered layouts in the lane and finds the latest final breakpoint whose fingerprint still matches. If the nearest later breakpoint is more than `lookback − margin` positions away (20 − 5; the margin absorbs differences between Freeflow's position count and the provider's), it adds a breakpoint on that earlier final entry. When all breakpoints are used (Anthropic's limit is 4; OpenAI's is 50), it moves a yieldable one there; with nothing yieldable it leaves the request unchanged.
3. The apply function copies only the containers it touches, reusing the last breakpoint's marker so TTL ordering holds.

Why a worker run matters: the Coordinator's next request contains everything appended since its last one: the worker's report, its selected evidence and provenance notes, and without projection all of the worker's turns. That easily exceeds 20 positions, so without the anchor the Coordinator's previous entry is out of reach although its prefix is unchanged.

### Coordinator keep-alive

`CacheKeepAlive` records the latest payload per lane in `before_provider_request` and the prompt size from usage in `message_end`. On `agent_start`, `agent_end` and each request, `evaluate()` asks routing for a hold: `suspendedCoordinator()`, set only under automatic control while a worker holds an assignment and a run is active.

While held, it replays the Coordinator's exact last payload with the output capped (`max_tokens: 1` on Anthropic, `max_output_tokens: 16` on Responses) at 90% of the cache lifetime. The lifetime comes from the model's `promptCache`, using the payload's retention or `PI_CACHE_RETENTION`, with at least 10 seconds of margin. Replays go through Pi's own transport (`modelRegistry.streamSimple`).

Each refresh checks economics from the model's declared `cost`: assuming a 90% chance the Coordinator resumes (`CONTINUATION`), the expected saving over a cache miss must be at least $0.05. Each refresh is recorded as a `freeflow-cache-keepalive-v1` entry. The hold stops when:

- the hold ends;
- a refresh fails, or reads under 90% of the prompt from cache;
- a refresh would arrive after expiry (for example after the machine slept);
- the hold reaches 6 hours or $2;
- the payload cannot be replayed with a cap (Anthropic budget thinking).

### OpenAI effort history

On qualified GPT-6 routes (`gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol` on api.openai.com with an API key, or the legacy `openai-codex` route), changing `reasoning.effort` would start a new cache. `provider-support/openai/` keeps the request-level effort at the chain's baseline and adds a `configuration_update` input item where each change happened, recorded as `freeflow-openai-effort-v1` entries that hold hashes, not bodies. Compaction starts a new chain; a branch summary does not. Details: its [README](../../pi-extension/src/provider-support/openai/README.md).

### Cache health

On `message_end` with usage (Freeflow enabled), `CacheHealth.observe()` compares a request with a basis: the previous request on the same provider, model and effort (and the same routing lane) within 5 minutes, or the same lane's own last request within the cache lifetime. Prompts under 8k tokens are ignored. A miss is reading under half the basis prompt from cache. Four misses in the last eight comparable requests warn once, until misses drop to one. Compaction, navigation and reload clear the basis (`noteBreak()`); a model or effort switch starts a new run (`noteSwitch()`).

### Diagnostics

`CacheMonitor` collects lines by key: `context-replay` (request history failed), `keep-alive` (holding or why it stopped), and effort baseline notes. `/freeflow status` shows them with cache-health warnings on its `prompt cache` line.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| Persist positions of generated messages as frames (hashes plus the generated messages), not as session messages. | Generated state must keep its position across requests, reloads and forks. A frame stores no second copy of native bodies, and replay checks the native prefix before using it. | — | `c6702bb3` |
| Match frames by prefix hash within a generation, not by view. | A view change (projection on or off, Coordinator or worker) should keep whatever prefix is still identical. | Matching by view label. | `c6702bb3` |
| Only compaction starts a generation; a `/tree` branch summary does not. | A branch summary follows its branch point and leaves the path before it unchanged. Treating it as a new generation moved state to the tail and rewrote the prefix (a live request read 26k of about 97k cached tokens). | Resetting on both. | `6e676fa0` |
| On any failure, return the current projected view without replay; after a failed frame append, stop replaying until reset. | An uncertain append could replay state that was never sent. The projected view is already safe to send (it never exposes hidden worker history); it only costs a cache miss. | Failing the request; replaying anyway. | `c6702bb3` |
| Write a frame only when generated state changes. | One frame per request grew the session and cost time on every request. | A frame per request. | `c71d5457` |
| Verify persisted ancestry by the session file's new tail, not by re-reading the file. | Pi has just parsed the file at session start. On a 28 MB session the first request went from 224 ms to 36 ms (disabled) and 321 ms to 134 ms (routing). | Full re-read after every reset. | `af545a73` |
| Fingerprint unchanged native messages once per session through Pi's projection tags. | Per-request work went from 38 ms to 20 ms (enabled) on a 28 MB session. Host-edited and generated messages keep content hashes. | Hashing every message every request. | `61fbb5dd` |
| Add an anchor breakpoint on the previous request's final entry when it fell out of the lookback window, yielding only a redundant breakpoint. | A Coordinator resuming after a worker sent its previous request unchanged yet rewrote most of it. Replaying a captured handoff cut that request's cost by about 84%. | Leaving breakpoints to Pi. | `2148bc0f` |
| Keep the Coordinator's cache warm with capped replays while its worker runs, priced from the model catalog. | The Coordinator is certain to resume, but Pi's own warmer keeps only the latest request warm, which is the worker's. | Advising longer retention only. | `2148bc0f` |
| Keep a separate keep-alive lane per requester on a shared model. | A worker on the Coordinator's model replaced the Coordinator's request, and the hold warmed the worker's prompt. | One lane per model. | `b6a5aa7f` |
| Skip Anthropic requests with budget-based thinking for keep-alive. | A one-token replay is rejected or cached under a different key; Pi's own warmer skips them too. | — | `649cd9c1` |
| Never adapt the ChatGPT Codex backend or Sign in with ChatGPT. | Live probes: they reuse the full prefix without breakpoints (Codex after 60 appended message endings, Sign in with ChatGPT after 25) and reject `prompt_cache_breakpoint`, `max_output_tokens`, and `configuration_update`. | Treating them as OpenAI Responses. | `667b8ee1`, `dfe5d53f`, `ca275c72` |
| Advise `PI_CACHE_RETENTION=long` instead of setting it. | The host owns retention, and Pi's own warmer plans around it. | Setting retention. | `667b8ee1` |
| Cache diagnostics go to `/freeflow status`, not the footer. | The footer shows current settings only. | Footer indicators. | `a7508551` |
| Cache health warns at 4 misses in 8 comparable requests. | Provider-side misses are about 2–4% of requests with or without Freeflow (September 2026 Codex sessions), so repeated misses mean something rewrites the prompt. | — | `aba6d840` |

## Intended Behavior That Looks Wrong

| Behavior | Why | If changed |
| --- | --- | --- |
| Changed Runtime State appears at the end of the request, not where the old one was. | Replacing it in place rewrites the cached prefix. | Every state change rewrites the whole cache. |
| Old Runtime State and routing state messages stay in the request after they change. | They are part of the cached prefix. | Same. |
| Request history ignores `withFreeflowRuntimeState()`'s placement. | Frames decide positions; that placement serves only the bypass paths. | — |
| After a failed frame append, generated state is placed without replay until the next reset (session start, navigation, compaction or shutdown), with a `context replay unavailable` line in status. Other failures affect only that request. | An uncertain append must not be built on. | Possible replay of state never sent. |
| A frame is not written on most requests. | Frames are written only when generated state changes. | Session growth and per-request writes. |
| `freeflow-compaction-notice`, `freeflow-background` and `freeflow-files` are not transient types. | They are sent through Pi as session messages, so Pi keeps their positions itself. | Double placement. |
| The anchor adapter does nothing on most requests. | It acts only when a remembered entry fell out of reach. | — |
| Keep-alive spend is not in Pi's session cost totals. | Pi's totals are host-owned; Freeflow records its spend as `freeflow-cache-keepalive-v1` entries. | — |
| Provider support stays on in a repository that has not set Freeflow up; only an explicit disable turns it off. | It only keeps caches reachable on qualified routes and never changes content. | — |

## Surface

- **Hooks:** `context_with_system` (tagging, Runtime State, request history), `before_provider_request` (anchor, keep-alive record, effort history), `message_end` (keep-alive prompt size, cache health), `agent_start` and `agent_end` (keep-alive evaluation), `session_shutdown` (reset).
- **Session entries:** `freeflow-request-history-v1` (frames), `freeflow-cache-keepalive-v1` (refresh usage and cost), `freeflow-openai-effort-v1` (effort chains). Older `freeflow-astra-effort-v1` entries are not replayed.
- **Transient message types:** `freeflow-runtime-state`, `freeflow-cognitive-routing-runtime-state`, `freeflow-routing-v2-state`, `freeflow-routing-attention`, `freeflow-routing-budget`, `freeflow-routing-communication`.
- **Environment read:** `PI_CACHE_RETENTION` (keep-alive lifetime, retention advice). Never written.
- **Model catalog read:** `promptCache.short` / `long`, `cost`, `compat.supportsExplicitPromptCacheMode`.
- **Status:** the `prompt cache` line of `/freeflow status`; cache-health warnings also notify once.

## State

- **Session:** frames, keep-alive records, and effort records, as above. Frames hold `basis`, `view`, `generation`, `length`, `prefix`, `parent`, `states` (kind → fingerprint), `retained` (communication signatures) and `additions` (index and message).
- **Memory:** request history's caches (acknowledged frames, validated frames, branch walk, prefix hashes, per-entry fingerprints), keyed to the session id and file; anchor lanes (8 layouts each); keep-alive lanes and the active hold; cache-health windows; monitor lines; the Runtime State anchor.
- **Rebuilt:** request history rebuilds from frames on the branch after reset, with a readback check; keep-alive and anchor lanes start empty and fill from the next requests.
- **Reset:** `resetHistory()` on session start, navigation, compaction (Pi's and Freeflow's), and shutdown; provider support on shutdown.

## Invariants

- A later request by the same requester (the same view, so the same permitted content) starts with the earlier request's messages, when nothing legitimately broke the cache. Frames themselves match by prefix, not by view, so a view change keeps whatever prefix is still identical. Guarded by `tests/cache-reuse/` (`history.test.js`, `native.test.js`, `claude-native.test.js`).
- Native messages are never edited, reordered or removed by request history; only transient messages are placed. Guarded by `history.test.js`.
- Nothing here fails a request: assembly falls back to the current view (`history.test.js`, "context persistence failure returns the current qualified view"), and payload adaptation returns Pi's payload on any error (a `catch` in each adapter; not tested).
- Breakpoints change markers only, never content. Not compared directly; `cache-anchor-native.test.js` checks marker placement in real Pi requests.
- Unqualified routes, Codex and Sign in with ChatGPT receive Pi's payload unchanged. Guarded by `chatgpt-sign-in.test.js`, `cache-anchor.test.js` and `cache-keepalive.test.js`.
- Keep-alive never replays an uncapped request, and stops at 6 hours or $2 per hold. Guarded by `cache-keepalive.test.js`.
- Unchanged native history is fingerprinted once per session (`history.test.js`, "entry-backed messages are fingerprinted once"), and the session file is checked by its new tail rather than re-read (`persisted-branch.test.js`).

## Failure Behavior

| Failure | Result |
| --- | --- |
| Ancestry, frame or readback check fails, or the frame append is not acknowledged | `assemble()` returns the projected view without replay; status shows `context replay unavailable`; after an append failure, replay stays off until reset. |
| Leaf changes while preparing | Same fallback for that request. |
| Layout or planning throws | Pi's payload is sent unchanged. |
| A keep-alive refresh fails, stops reading the cache, or the economics no longer pay | The hold stops; status says why. |
| The model declares no cache lifetime or prices | No keep-alive. |
| The effort adapter errors | Pi's payload is sent unchanged. |

## Cost

Request history runs on every request; the rules are in [Performance](../guides/performance.md). It walks only new branch entries, fingerprints native messages once per session, reuses prefix hashes while the prefix is unchanged, and writes only on change. Measured on a 28 MB session in September 2026: per-request work enabled 38 → 20 ms (`61fbb5dd`); first request after start 321 → 134 ms with routing (`af545a73`). The anchor adapter hashes the payload per request on qualified routes. Keep-alive spends money: each refresh costs about the prompt at cache-read price plus a few output tokens.

## Code Map

- `pi-extension/src/host/`
  - `request-history.ts`: `RequestHistory` (`assemble`, `prepare`, `reset`), `TRANSIENT`, `SITUATIONAL`, `Frame`.
  - `runtime-state.ts`: `freeflowRuntimeStateMessage()`, `withFreeflowRuntimeState()`, `RuntimeStateAnchor`, `filterBootstrapMessage()`.
  - `projection-tags.ts`: `tagProjectedMessages()`, `projectedEntryId()`, `isProjected()`, `isHostEdited()`.
  - `read-only-session.ts`: `persistedBranchMatches()`, `trustLoadedSession()`.
- `pi-extension/src/provider-support/`: see its [README](../../pi-extension/src/provider-support/README.md).
  - `index.ts`: `registerProviderSupport()` and its hooks.
  - `routes.ts`: `isChatGPTSignIn()`.
  - `cache/`: `anchor.ts` (`planAnchor()`), `anthropic.ts`, `openai-responses.ts`, `index.ts` (`CacheAnchorAdapter`), `keepalive.ts` (`CacheKeepAlive`), `health.ts` (`CacheHealth`), `monitor.ts` (`CacheMonitor`).
  - `openai/`: effort history.
- `pi-extension/src/index.ts`: wiring, the hold and requester sources, `resetHistory()`, cache-health observation.
- `pi-extension/src/cognitive-routing/economics.ts`: the retention advice.

## Tests

- `tests/cache-reuse/`: end-to-end prefix extension across request history, routing views and providers. A failure here usually means something rewrote earlier request content; find which message changed between two consecutive request bodies before changing the test.
- `tests/provider-support/`: anchor planning (`cache-anchor*.test.js`), keep-alive (`cache-keepalive*.test.js`), health, monitor, Sign in with ChatGPT, and effort history. See its [README](../../pi-extension/tests/provider-support/README.md).
- `tests/host/persisted-branch.test.js`: tail readback and mismatch detection.
- `tests/integration/pi-extension.test.js`: Runtime State keeps a fixed prefix position across refreshes and turns.
- `tests/integration/request-path-budget.test.js`: per-request work bounds.

## Limits

- A preserved local prefix is not a provider cache hit; only provider-reported usage at a qualified boundary shows a hit.
- Provider expiry, eviction, minimum cacheable length, and per-effort caches on Sign in with ChatGPT are outside Freeflow's control.
- Another extension that changes the final request can break the prefix after Freeflow.
- Request history still fingerprints messages without a projected entry identity (generated and host-edited ones) on every request.
- Keep-alive covers only the suspended Coordinator, not other requesters that will resume.

## Changes

- `be97a55d` (2026-10-03): one branch walk per leaf through `cachedBranch()`.
- `dfe5d53f`, `ca275c72` (2026-09-30): Sign in with ChatGPT left untouched, from live results.
- `649cd9c1`, `e21fe440` (2026-09-29): Claude routing and caching qualified; keep-alive skips budget thinking.
- `6e676fa0` (2026-09-27): branch summaries keep generated positions.
- `2148bc0f`, `b6a5aa7f`, `667b8ee1`, `a7508551` (2026-09-27): anchor breakpoints, keep-alive per requester, retention advice, diagnostics to status.
- `61fbb5dd`, `af545a73`, `c71d5457` (2026-09-26): per-session fingerprints, tail readback, frames only on change.
- `c6702bb3` (2026-09-15): request history.
