# Pi Extension

How Freeflow's native Pi extension plugs into Pi, what it keeps cache-safe, and how it persists and recovers state. For installing and using Freeflow on Pi, see the user guide [Pi integration](../../plugin-docs/integrations/pi.md).

## What the extension provides

When its host gate is effective, the native entrypoint is designed to provide:

- the model/contributor skill surface (the canonical list is `FREEFLOW_MODEL_SKILL_NAMES` in `src/host/catalog.ts`) and mandatory core/Interaction Contract prompts;
- refresh-aware Runtime State: Freeflow's status, the user's review and skills choices, and each capability's availability;
- `ask_user`, whenever Freeflow is enabled;
- with Tool Execution, its prompt section, `apply_patch`, `bash_background`, `monitor` and `stop_background`, and the file-tracking layer around Pi's tools;
- with Compaction, its notices and Freeflow's compaction with the task's bundle, after the agent's `checkpoint --compact`;
- with the Freeflow store, the menu at session start, the sync, the held task in the footer and the store line in `/freeflow status` (`src/store/`);
- with Messaging, `list_sessions` and `send_message` (deferred, loaded through Pi's `tool_search`) and the messaging capability skill.
- the event log and the session's claims (`src/events/`): each loop event as a schema v1 line, never contents, written by Track Work's `events append` once the session stays idle after a run, before a checkpoint or release command and at shutdown, never on the request path. The text Freeflow sends the model is kept too, as `sent` lines: `EventRecorder.sent()` takes the text whole, by its source, and `once` keeps a text that every request repeats (the system prompt's sections, the Runtime State, the keep-alive) once per session; the places that send it are `Inbound` (background, monitor, store and message notices, through its `logSent` host callback), the compaction controller (`sent` on its host), the file tracking, the gates and guidance on tool results, and `index.ts`, where the menu, the catch-up, the compact request, the checkpoint notice and the skill prompt go; the claims for request set 1 in `<FREEFLOW_HOME>/sessions/<session>/capabilities.json`, rewritten when the capabilities change; and `/freeflow capabilities`.
- the gates (`src/gates/`): Track Work's `gates5.mjs` on each `tool_call`, before Freeflow's other checks, from the session's gate state kept in memory; a warning added to the call's result, once per gate per turn, or under `block` a refusal, a delivery step asked through `ctx.ui.confirm` where Pi has a screen. See [Gates](gates.md).

## Cache reuse boundaries

Freeflow contributes stable guidance as a structured prompt section and composes the full transcript in `context_with_system`, retaining Pi's earlier system/tool patches at their original positions, except the patches that would remove the last prompt's sections on a run Pi starts itself (Freeflow's before Pi 1.2.0, Pi issue #10267, and on any Pi other extensions' prompt-only sections; see [System prompt architecture](prompt-assembly.md#pi)). A native two-turn fixture exercises that timeline; it does not prove server cache hits, and another extension can still change the final request. The Pi candidate keeps Freeflow reference definitions, tool schemas, and generated runtime snapshots stable while feature gates control whether operations may execute. Native ancestry replay preserves Freeflow-generated snapshots when their fingerprints and permitted history still apply.

Reuse may shorten or restart when the active model/provider or unsupported effort path changes, native compaction or navigation replaces history, Freeflow or host instructions/tool schemas change, or a capability change alters permitted content. Provider expiry, eviction, minimum cacheable length, and actual server cache hits remain outside Freeflow's control.

The selected-model effort adapter supports `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` on qualified OpenAI Responses and OpenAI-Codex Responses request shapes. It preserves the request baseline and records compatible effort changes under `freeflow-openai-effort-v1`. Older `freeflow-astra-effort-v1` entries remain in the native session log but are not replayed; a new effort chain starts from the next supported request. This source/fixture evidence is not a billing or model-quality guarantee.

Pi 0.99 added Sign in with ChatGPT on the `openai` provider. Freeflow recognises that credential and leaves the route untouched: no explicit cache breakpoints, no keep-alive replay, and no effort-history rewriting. Live checks on GPT-6 Luna and Sol 6.1 found that the sign-in route rejects `prompt_cache_breakpoint`, `max_output_tokens` and `configuration_update` ("use an API key instead"), still reuses a long cached prefix, and keeps a separate cache per reasoning effort, so switching effort on that route rereads the prefix. API keys and the legacy `openai-codex` route are unchanged.

[Prompt caching](../../plugin-docs/prompt-caching.md) explains how provider caches behave on Pi; [Prompt cache rules](../guides/prompt-cache.md) explains how Freeflow keeps its additions cache-safe (including the anchor breakpoint and the keep-alive) and the rules for changing request assembly. Detailed per-task cache evidence remains task-local and is not a published package artifact; this section states the public contract and its limits.

## Pi versions

The peer range is `>=0.99.1`; development and the native test suites run on Pi 1.4.0 (`devDependencies` in the root `package.json`). The 1.4.0 behavior below was read from upstream `https://github.com/earendil-works/pi.git` at tag `v1.4.0`, commit `4a080252f06caf63a525d7873c5d94d3c23887e0` (package `@earendil-works/pi-coding-agent` 1.4.0, which publishes no `gitHead`), against `v1.0.1` (`a7229ddc`), and pinned by the native suites on the installed 1.4.0 package. Where Pi changed, the extension handles both sides of the change:

- **Runs an extension message starts.** Pi 1.2.0 fires `before_agent_start` for them (`messageType: "custom"`). Freeflow refreshes its state and sets its sections there; on earlier Pi, it refreshes its state and writes staged settings at such a run's first `message_end`. See [System prompt architecture](prompt-assembly.md#pi).
- **The start of a run is busy.** From Pi 1.2.0 `ctx.isIdle()` is false during `before_agent_start`, and `sendUserMessage()` without `deliverAs` is refused while busy. Skill commands send with `deliverAs: "followUp"`, so one entered while Pi works waits for the current work.
- **Summaries.** From Pi 1.4.0 Pi's summarizer may use the model's output limit; see [Compaction](compaction.md).
- **Tool activation.** Pi 1.4.0 activates an extension tool the branch never added or removed unless it is registered with `defaultActive: false`, and from 1.3.0 a resumed session keeps the tools it had. Every Freeflow tool is registered inactive and turned on by its capability.
- **Model switches.** From Pi 1.3.0 thinking blocks from an earlier, different model are dropped rather than sent as text.

`host/run-start-native.test.js` pins what Pi 1.4.0 does on a run a message starts, with and without Freeflow. Follow-ups not yet done: on API-key GPT-6 routes Pi 1.3.0 keeps the cache across a thinking change itself (`configuration_update`), which may make Freeflow's effort adapter redundant there; retiring it needs a live probe. And Pi 1.2.0 and later build the system prompt for a run a message starts, so the gate that holds notices until a session's first prompt (`canWake()`) could be lifted once the peer range starts at 1.2.0.

## Persistence and recovery limits

Outside Pi's session file, the extension's files live in the Freeflow home: `events/<session>.jsonl` (the event log, this machine only), `sessions/<session>/capabilities.json` (the claims), and the store's own files (`src/store/`). Event lines still waiting when the process dies are lost; the log is a sensor and fails open.

Session entries that older versions wrote for features since removed (profile routing's `freeflow-routing-v2`, `freeflow-routing-v2-refs` and `freeflow-routing-v2-resume`) stay in users' sessions; nothing reads them, and request history still replays the generated messages its own frames recorded.

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
