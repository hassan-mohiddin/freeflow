# Architecture

Freeflow is a portable skill pack and context-loading runtime for coding agents. It is not a new agent, permission system, or enforcement engine.

## Package Boundary

The repository root is the single source of truth for skills, references, runtime contracts, manifests, capability source, command metadata, docs, and current evidence.

```text
freeflow/
  capabilities/interaction-contract/interaction-contract.md
  skills/
  capabilities/
  hooks/
  pi-extension/
  .deprecated/
  command-surface.json
  plugin-docs/
  docs/
  .skill-eval/
```

The npm tarball contains runtime-required files. GitHub also retains plugin docs, project memory, current eval definitions, and deprecated historical evidence. Retired Output Router evidence is preserved under `.deprecated/output-router/`. There is no generated package mirror.

For local Pi/PiFlow integration, Freeflow can provide an exact-commit development snapshot outside the repository. It is not a production release or source-precedence mechanism; production installs use ordinary npm/Git sources. PiFlow owns host launch, import, update, and upstream synchronization, while Freeflow owns policy and snapshot production.

Codex marketplace metadata uses local source `.`, while Claude uses host-valid local source `./`. Pi loads `pi-extension/freeflow/index.js` from the root package manifest.

Freeflow does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release. It uses each host's native skill invocation and ships a shared context-and-session-mode hook plus the Pi extension.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. `.freeflow/local.json` is optional per-checkout personal core configuration and cannot activate Freeflow alone.

```text
host session mode override
-> personal core override
-> repository value
-> built-in default
```

Pi can temporarily override Freeflow master enablement, Interaction Contract, Skills, and mode in branch-aware session JSONL. Claude and Codex support a session-only mode override in plugin-owned data keyed by their host session ID. Session state never mutates either config file and cannot bypass missing or invalid repository activation. An invalid existing personal layer fails closed. Retired Output Router-shaped configuration is tolerated for activation compatibility but is ignored and not copied into the personal layer.

Configuration establishes activation state; it does not prove host runtime delivery.

## Runtime Guidance

Freeflow has two model-facing guidance layers:

1. **Interaction Contract:** `capabilities/interaction-contract/interaction-contract.md` supplies compact turn interpretation when its switch is effective.
2. **Workflow bootstrap:** `skills/workflow/SKILL.md` supplies the complete Interaction Lifecycle, Feedback Loop, routing, review, continuity, and Supported Exit behavior when Skills are effective.

Hosts also provide compact active or dormant mode state. Mode Contract and other workflow skills remain on demand. Pi loads optional Context Virtualization and Cognitive Routing guidance only while those capabilities are effective.

The Interaction Contract is the only compact interaction-guidance artifact. It owns turn interpretation; Workflow owns routing and recurrence.

Context loading does not enforce policy, block tools, grant permissions, or replace repository instructions.

## Host Delivery

### Codex And Claude

One packaged runtime script serves non-overlapping host events. At `SessionStart`, it reads repository, personal, and session mode state and delivers the complete enabled Interaction Contract, Workflow bootstrap, and precise configured/resolved/effective mode state after start, resume, clear, or compact. At `UserPromptSubmit`, it recognizes only explicit mode controls, updates plugin-owned session state before the same model request, and injects a compact mode delta; ordinary prompts produce no output. Because Claude ends the current session on `/clear`, `SessionEnd(reason="clear")` stages a host-process-and-workspace-scoped, one-shot handoff that only `SessionStart(source="clear")` can atomically claim within one minute. Codex does not expose a clear-specific SessionEnd reason and keeps its session-ID restoration path.

The hook stays inert without valid repository activation, fails closed on invalid personal core config, and never inspects or exposes Pi-only capabilities. Host trust or hook registration may still be required. Setup reports delivery as confirmed, unavailable, or unconfirmed. Session records use hashed host/session keys, atomic writes, and bounded age cleanup; they survive lifecycle restoration but do not enter repository state.

### Pi

The Pi extension:

- reads both config layers before agent turns;
- appends stable effective guidance and the Interaction Contract in `before_agent_start`, then supplies one unified volatile `Freeflow Runtime State` message before each provider request with the current default/active mode, effective capabilities, and Cognitive Routing Control/Profile;
- stores Workflow and Cognitive Routing guidance as hidden persistent custom messages while effective, with skill frontmatter removed from model-facing bootstrap content;
- restores temporary session mode from Pi session entries;
- dynamically exposes 25 model/contributor skills;
- registers canonical direct commands and two Pi-only compatibility aliases;
- activates optional Context Virtualization tools and context only when effective;
- owns the Pi-only Cognitive Routing lease, prepared profile intents, manual profile commands, sticky automatic reasoning episodes, reload state restoration, automatic switch tool, and session status.

`/freeflow settings` edits personal core overrides. `/freeflow settings session` manages temporary, branch-aware Freeflow, Interaction Contract, Skills, and mode overrides without changing config files. `/freeflow settings repo` edits shared repository settings. `/freeflow mode` remains the direct temporary mode control.

Pi source lives under `pi-extension/src/`; the package executes built output under `pi-extension/dist/` through `pi-extension/freeflow/index.js`.

## Skill Architecture

Workflow owns routing and the current authority envelope. Leaf skills own focused methods and return evidence, decisions, or route changes rather than redefining the lifecycle or widening authority. Selecting a leaf method never authorizes active evidence generation, mutation, or delivery.

A skill body is complete on first read with guaranteed context. Conditional depth lives in linked references; deterministic repeated work may live in scripts. Cross-skill links are project dependencies, not bundled local resources.

See [Skill routing](skill-routing.md) for the typed owner, route, and reference adjacency map.

The active cross-host model/contributor surface has 25 skills under `skills/`. Context Virtualization and Cognitive Routing are separately packaged Pi-only capabilities under `capabilities/`, outside Codex and Claude discovery. Retired Output Router material is preserved under `.deprecated/output-router/`.

## Review And Verification Topology

The active agent owns factual verification and workflow control. Self-review is silent and follows supported verification.

Independent review is a distinct selected judgment boundary. Specs and Plans each receive separate Review Artifact. Additional independent work review is plan-selected, explicitly requested, or otherwise authorized through Workflow. Review budgets limit dispatches but do not authorize them.

A review report never edits. The active agent adjudicates and may request corrections plus one warranted focused follow-up together. Corrections return to Execute Work or the artifact owner and may remain in the same coherent Working Record slice.

## Task Memory

Track Work owns one complete model-facing method and one deterministic executable boundary:

- `skills/track-work/SKILL.md` teaches continuity, slice, authority, and settlement judgment;
- `skills/track-work/scripts/working-record.mjs` owns schema-v2 parsing, views, transitions, IDs, timestamps, locking, validation, and atomic persistence.

After compaction, summarization, clear, resume, or session navigation, Workflow requests the bounded `resume` view, compares it with the current conversation and live state, and retrieves exact history only when needed. Conversation branches may write memory but cannot create authority for another branch.

## Capabilities

The Pi-only Context Virtualization capability owns projection-only archive and restore of consumed tool-result content while preserving canonical session history.

The Pi-only Cognitive Routing capability owns exactly two configured compute profiles, complete model-and-thinking transitions through Pi's lease, deterministic `/freeflow profile standard|reasoning|auto` controls, the guarded `freeflow_switch_profile(target, reason)` request, and one volatile model-facing Control/Profile state record per provider request. Transition results are historical evidence; the volatile record is the current-state authority. It shares authority, tools, workflow, context, and evidence requirements with the active agent; it does not create a new skill-discovery surface or authorize work. The current implementation remains an experimental local-Pi MVP until the Phase 2 mechanism checkpoint and behavioral acceptance evidence are complete.

Delegation Harness is retired from the live package. Its implementation and historical evidence remain under `.deprecated/delegation-harness/`.

## Deferred Enforcement

Enforcement hooks and CLI policy checks remain deferred until behavioral evidence shows that concise instructions and workflow routing cannot prevent a repeated concrete failure. Existing hooks load context only.
