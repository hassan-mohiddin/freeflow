# Pi Extension

How Freeflow's native Pi extension plugs into Pi, what it keeps cache-safe, and how it persists and recovers state. For installing and using Freeflow on Pi, see the user guide [Pi integration](../../plugin-docs/integrations/pi.md).

## What the extension provides

When its host gate is effective, the native entrypoint is designed to provide:

- the 25-skill model/contributor surface and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State with v2 routing `Control`, `Profile`, and `Delegation`;
- Coordinator/Helper/Executor routing state recorded as native `freeflow-routing-v2` session entries;
- the four v2 routing tools: `freeflow_delegate`, `freeflow_return`, `freeflow_unit`, and `freeflow_project`;
- with Tool Execution, its prompt section, `apply_patch`, `bash_background` and `stop_background`, and the file-tracking layer around Pi's tools;
- with Compaction, the `freeflow_compact` tool, its notices, and the compaction skill.

## Cache reuse boundaries

Freeflow contributes stable guidance as a structured prompt section and composes the full transcript in `context_with_system`, retaining Pi's earlier system/tool patches at their original positions. A native two-turn fixture exercises that timeline; it does not prove server cache hits, and another extension can still change the final request. The Pi candidate keeps Freeflow reference definitions, tool schemas, and generated runtime snapshots stable while feature gates control whether operations may execute. Helper and Executor share ordinary active history, and compatible worker/Coordinator views reuse only matching permitted prefixes; Freeflow does not copy excluded evidence to manufacture a cache match. Native ancestry replay preserves Freeflow-generated snapshots when their fingerprints and permitted history still apply.

Reuse may shorten or restart when the active model/provider or unsupported effort path changes, earlier evidence is archived/restored/withdrawn or otherwise changes the view, native compaction or navigation replaces history, Freeflow or host instructions/tool schemas change, or a capability change alters permitted content. Provider expiry, eviction, minimum cacheable length, and actual server cache hits remain outside Freeflow's control.

The selected-model effort adapter supports `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` on qualified OpenAI Responses and OpenAI-Codex Responses request shapes. It preserves the request baseline and records compatible effort changes under `freeflow-openai-effort-v1`. Older `freeflow-astra-effort-v1` entries remain in the native session log but are not replayed; a new effort chain starts from the next supported request. This source/fixture evidence is not a billing or model-quality guarantee.

Pi 0.99 added Sign in with ChatGPT on the `openai` provider. Freeflow recognises that credential and leaves the route untouched: no explicit cache breakpoints, no Coordinator keep-alive replay, and no effort-history rewriting. Live checks on GPT-6 Luna and Sol 6.1 found that the sign-in route rejects `prompt_cache_breakpoint`, `max_output_tokens` and `configuration_update` ("use an API key instead"), still reuses a long cached prefix, and keeps a separate cache per reasoning effort, so switching effort on that route rereads the prefix. API keys and the legacy `openai-codex` route are unchanged.

[Prompt caching](../../plugin-docs/prompt-caching.md) explains how provider caches behave on Pi; [Prompt cache rules](../guides/prompt-cache.md) explains how Freeflow keeps its additions cache-safe (including the anchor breakpoint and the Coordinator keep-alive) and the rules for changing request assembly. Detailed per-task cache evidence remains task-local and is not a published package artifact; this section states the public contract and its limits.

The routing tools are model-facing controls, not permission grants. A return saves a report but does not close a unit. Evidence selection must use actual canonical `ctx:<native-entry-id>` references, and unresolved or adverse evidence remains explicit.

## Persistence and recovery limits

Routing events are appended through Pi's native session-entry path and read back from the live branch. When existing or uncertain state needs reconciliation, the runtime uses a strict read-only persisted session snapshot with identity, ancestry, encoding, size, and divergence checks. It does not patch host files, claim `fsync`, or promise exactly-once behavior. Failed readback or uncertain effects block routing rather than permitting blind repetition.

New user attention retains ordinary admitted history and pauses only the saved assessment obligation to restore compacted evidence. Closing, replacing and returning preserve admitted communication; current versus historical contracts remain distinct. When material evidence is missing from a returned assessment, Coordinator can attach a recovery request without replacing the assignment or report. The worker recorded on that assignment may select exposed evidence and read only exact admitted task paths or packaged Freeflow methods before returning a separate supplement; ordinary task work remains closed. Fresh attention does not settle recovery, and `assess` remains unavailable until the supplement arrives or Coordinator cancels recovery.

Use `freeflow_unit` with `{"operation":"assess"}` only when that saved assessment is again intended and no recovery remains unsettled; failed readiness keeps it suspended. Recover Runtime State, the current assignment, saved report, selected evidence, and partial effects after context loss or native model/thinking changes. Current code accepts earlier supported v2 history, while older binaries may reject sessions containing the newer recovery events; there is no downgrade migration.

## Development boundary

For local Freeflow development, refresh a snapshot only from a committed Freeflow revision:

```bash
npm run snapshot:refresh
```

A snapshot identity and an installed package identity are different. Do not treat an uncommitted working tree as a production package source, and do not infer host behavior from a snapshot. Snapshot refresh does not patch the host or its session state.

## Related

- [Pi integration](../../plugin-docs/integrations/pi.md)
- [Prompt cache rules](../guides/prompt-cache.md)
- [Developer docs](../README.md)
