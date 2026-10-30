# Pi Extension

How Freeflow's native Pi extension plugs into Pi, what it keeps cache-safe, and how it persists and recovers state. For installing and using Freeflow on Pi, see the user guide [Pi integration](../../plugin-docs/integrations/pi.md).

## What the extension provides

When its host gate is effective, the native entrypoint is designed to provide:

- the model/contributor skill surface (the canonical list is `FREEFLOW_MODEL_SKILL_NAMES` in `src/host/catalog.ts`) and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State with v2 routing `Control`, `Profile`, and `Delegation`;
- Coordinator/Helper/Executor routing state recorded as native `freeflow-routing-v2` session entries;
- the four v2 routing tools: `delegate_work`, `return_work`, `routing_unit`, and `select_evidence`;
- `ask_user`, whenever Freeflow is enabled;
- with Tool Execution, its prompt section, `apply_patch`, `bash_background`, `monitor` and `stop_background`, and the file-tracking layer around Pi's tools;
- with Compaction, its notices and Freeflow's compaction with the task's bundle, after the agent's `checkpoint --compact`;
- with the Freeflow store, the menu at session start, the sync and the held task in the footer (`src/store/`);
- with Task Memory, the `task_memory` tool and its capability skill;
- with Messaging, `list_sessions` and `send_message` (deferred, loaded through Pi's `tool_search`) and the messaging capability skill.

## Cache reuse boundaries

Freeflow contributes stable guidance as a structured prompt section and composes the full transcript in `context_with_system`, retaining Pi's earlier system/tool patches at their original positions, except the patches that would remove the last prompt's sections on a run Pi starts itself (Freeflow's before Pi 1.2.0, Pi issue #10267, and on any Pi other extensions' prompt-only sections; see [System prompt architecture](prompt-assembly.md#pi)). A native two-turn fixture exercises that timeline; it does not prove server cache hits, and another extension can still change the final request. The Pi candidate keeps Freeflow reference definitions, tool schemas, and generated runtime snapshots stable while feature gates control whether operations may execute. Helper and Executor share ordinary active history, and compatible worker/Coordinator views reuse only matching permitted prefixes; Freeflow does not copy excluded evidence to manufacture a cache match. Native ancestry replay preserves Freeflow-generated snapshots when their fingerprints and permitted history still apply.

Reuse may shorten or restart when the active model/provider or unsupported effort path changes, earlier evidence is archived/restored/withdrawn or otherwise changes the view, native compaction or navigation replaces history, Freeflow or host instructions/tool schemas change, or a capability change alters permitted content. Provider expiry, eviction, minimum cacheable length, and actual server cache hits remain outside Freeflow's control.

The selected-model effort adapter supports `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` on qualified OpenAI Responses and OpenAI-Codex Responses request shapes. It preserves the request baseline and records compatible effort changes under `freeflow-openai-effort-v1`. Older `freeflow-astra-effort-v1` entries remain in the native session log but are not replayed; a new effort chain starts from the next supported request. This source/fixture evidence is not a billing or model-quality guarantee.

Pi 0.99 added Sign in with ChatGPT on the `openai` provider. Freeflow recognises that credential and leaves the route untouched: no explicit cache breakpoints, no Coordinator keep-alive replay, and no effort-history rewriting. Live checks on GPT-6 Luna and Sol 6.1 found that the sign-in route rejects `prompt_cache_breakpoint`, `max_output_tokens` and `configuration_update` ("use an API key instead"), still reuses a long cached prefix, and keeps a separate cache per reasoning effort, so switching effort on that route rereads the prefix. API keys and the legacy `openai-codex` route are unchanged.

[Prompt caching](../../plugin-docs/prompt-caching.md) explains how provider caches behave on Pi; [Prompt cache rules](../guides/prompt-cache.md) explains how Freeflow keeps its additions cache-safe (including the anchor breakpoint and the Coordinator keep-alive) and the rules for changing request assembly. Detailed per-task cache evidence remains task-local and is not a published package artifact; this section states the public contract and its limits.

The routing tools are model-facing controls, not permission grants. A return saves a report but does not close a unit. Evidence selection must use actual canonical `ctx:<native-entry-id>` references, and unresolved or adverse evidence remains explicit.

## Pi versions

The peer range is `>=0.99.1`; development and the native test suites run on Pi 1.4.0 (`devDependencies` in the root `package.json`). The 1.4.0 behavior below was read from upstream `https://github.com/earendil-works/pi.git` at tag `v1.4.0`, commit `4a080252f06caf63a525d7873c5d94d3c23887e0` (package `@earendil-works/pi-coding-agent` 1.4.0, which publishes no `gitHead`), against `v1.0.1` (`a7229ddc`), and pinned by the native suites on the installed 1.4.0 package. Where Pi changed, the extension handles both sides of the change:

- **Runs an extension message starts.** Pi 1.2.0 fires `before_agent_start` for them (`messageType: "custom"`). Freeflow prepares routing and sets its sections there; on earlier Pi, routing prepares such a run at its first `message_end`. See [Cognitive Routing](cognitive-routing.md) and [System prompt architecture](prompt-assembly.md#pi).
- **The start of a run is busy.** From Pi 1.2.0 `ctx.isIdle()` is false during `before_agent_start`, and `sendUserMessage()` without `deliverAs` is refused while busy. Skill commands send with `deliverAs: "followUp"`, so one entered while Pi works waits for the current work; the routing shortcuts already refuse while Pi is not idle.
- **Summaries.** From Pi 1.4.0 Pi's summarizer may use the model's output limit; see [Compaction](compaction.md).
- **Tool activation.** Pi 1.4.0 activates an extension tool the branch never added or removed unless it is registered with `defaultActive: false`, and from 1.3.0 a resumed session keeps the tools it had. Every Freeflow tool is registered inactive and turned on by its capability.
- **Model switches.** From Pi 1.3.0 thinking blocks from an earlier, different model are dropped rather than sent as text. Routing's per-profile views and their cache prefixes are unaffected (`cache-reuse/claude-native.test.js`).

`host/run-start-native.test.js` pins what Pi 1.4.0 does on a run a message starts, with and without Freeflow. Follow-ups not yet done: on API-key GPT-6 routes Pi 1.3.0 keeps the cache across a thinking change itself (`configuration_update`), which may make Freeflow's effort adapter redundant there; retiring it needs a live probe. And Pi 1.2.0 and later build the system prompt for a run a message starts, so the gate that holds notices until a session's first prompt (`canWake()`) could be lifted once the peer range starts at 1.2.0.

## Persistence and recovery limits

Routing events are appended through Pi's native session-entry path and read back from the live branch. When existing or uncertain state needs reconciliation, the runtime uses a strict read-only persisted session snapshot with identity, ancestry, encoding, size, and divergence checks. It does not patch host files, claim `fsync`, or promise exactly-once behavior. Failed readback or uncertain effects block routing rather than permitting blind repetition.

New user attention retains ordinary admitted history and pauses only the saved assessment obligation to restore compacted evidence. Closing, replacing and returning preserve admitted communication; current versus historical contracts remain distinct. When material evidence is missing from a returned assessment, Coordinator can attach a recovery request without replacing the assignment or report. The worker recorded on that assignment may select exposed evidence and read only exact admitted task paths or packaged Freeflow methods before returning a separate supplement; ordinary task work remains closed. Fresh attention does not settle recovery, and `assess` remains unavailable until the supplement arrives or Coordinator cancels recovery.

Use `routing_unit` with `{"operation":"assess"}` only when that saved assessment is again intended and no recovery remains unsettled; failed readiness keeps it suspended. Recover Runtime State, the current assignment, saved report, selected evidence, and partial effects after context loss or native model/thinking changes. Current code accepts earlier supported v2 history, while older binaries may reject sessions containing the newer recovery events; there is no downgrade migration.

## Development boundary

For local Freeflow development, refresh a snapshot only from a committed Freeflow revision:

```bash
npm run snapshot:refresh
```

`scripts/freeflow-snapshot.mjs` resolves the revision to a commit, exports it with `git archive` (so uncommitted and ignored files are never included), installs only runtime dependencies from the committed `package-lock.json` with `npm ci --omit=dev --ignore-scripts`, packs the result with `npm pack --ignore-scripts`, and records the source commit and tree, the lockfile and tarball SHA-256s, and each dependency's integrity in the snapshot's metadata. It replaces the previous snapshot and metadata only after the new ones are complete, restoring the old ones if a step fails.

Claude Code's cloud sessions take the same kind of snapshot differently: they run the plugin from the folder the cloud environment's setup script fills, and the environment keeps a saved copy of that folder until the setup script changes (or about seven days pass), so a merge reaches new sessions only when the script does. `npm run snapshot:refresh -- --cloud` prints the setup-script line that fetches exactly one commit into `/opt/freeflow` (`--commit` names it; HEAD by default), and refuses a commit no remote branch holds, since the cloud fetches it from GitHub. Pasting that line in place of the line that fills the plugin folder makes new sessions run that commit; nothing in a running session changes.

A snapshot identity and an installed package identity are different. Do not treat an uncommitted working tree as a production package source, and do not infer host behavior from a snapshot. Snapshot refresh does not patch the host or its session state.

## Related

- [Pi integration](../../plugin-docs/integrations/pi.md)
- [Prompt cache rules](../guides/prompt-cache.md)
- [Developer docs](../README.md)
