# Architecture

Freeflow is a portable skill pack and context-loading runtime for coding agents. It is not a new agent, permission system, or enforcement engine.

## Package Boundary

The repository root is the single source of truth for skills, references, runtime contracts, manifests, capability source, command metadata, docs, and current evidence.

```text
freeflow/
  runtime/prompts/
  skills/
  capabilities/
  hooks/
  pi-extension/
  .deprecated/
  command-surface.json
  plugin-docs/
  .deprecated/project-docs/
  .skill-eval/
```

The npm tarball contains runtime-required files. GitHub also retains plugin docs, project memory, current eval definitions, and deprecated historical evidence. Retired Output Router evidence is preserved under `.deprecated/output-router/`. There is no generated package mirror.

## Documentation and source boundaries

- `plugin-docs/` is the canonical current public documentation surface.
- `plugin-docs/release-evidence/` stores immutable versioned evidence records rather than a rolling current-state page.
- `CHANGELOG.md` records release history for the single published Freeflow package.
- `.deprecated/project-docs/` preserves project plans, handoffs, research, issues, and historical evidence; it is not the normal current-runtime reading path.
- `.freeflow/tasks/` contains ignored Working Records and task-local Plans; it is not public or package documentation.

For local Pi/PiFlow integration, Freeflow can provide an exact-commit development snapshot outside the repository. It is not a production release or source-precedence mechanism; production installs use ordinary npm/Git sources. PiFlow owns host launch, package installation, import, update, and upstream synchronization, while Freeflow owns policy and snapshot production.

Codex marketplace metadata uses local source `.`, while Claude uses host-valid local source `./`. Pi loads `pi-extension/freeflow/index.js` from the root package manifest.

Freeflow does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release. It uses each host's native skill invocation and ships a shared runtime context hook plus the Pi extension.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. `.freeflow/local.json` is optional per-checkout personal core configuration and cannot activate Freeflow alone.

```text
host session enablement
-> personal override
-> repository value
-> built-in default
```

`enabled` is the only Freeflow core switch. When it is effective, the core prompt, Interaction Contract, and 25 base skills are present. Context Virtualization, Conversation History, and Cognitive Routing are independently gated capabilities. Configurations containing the removed `defaultMode`, `interactionContract`, or `skills` keys are invalid. An invalid existing personal layer fails closed.

Configuration establishes activation state; it does not prove host runtime delivery.

## Runtime Guidance

Freeflow has four coordinated model-facing parts:

1. **Core guidance:** `runtime/prompts/core.md` owns stable identity, shared terms, the Interaction Lifecycle, Feedback Loop, Workflow, Action Selection, and Supported Exit cues.
2. **Interaction Contract:** `runtime/prompts/interaction-contract.md` is a separate mandatory fragment so its turn-interpretation behavior can be changed independently.
3. **Runtime State:** the extension supplies current capability availability and Cognitive Routing Control/Profile at session start, after context reconstruction or loss, and when displayed state changes; unchanged state remains in the current provider context. It is not system-prompt policy.
4. **Discoverable skills:** 25 base skills under `skills/` are exposed with the core surface; child capability skills under `capabilities/` are exposed only when their own gates are effective.

The Interaction Contract is prompt-only and not discoverable. Full skill and capability bodies are discoverable methods, not persistent bootstrap content. Context loading does not enforce policy, block tools, grant permissions, or replace repository instructions. See [System Prompt Architecture](prompt-architecture.md) for the canonical assembly and gating contract, and [Capabilities](capabilities/README.md) for detailed capability contracts.

## Host Delivery

### Codex And Claude

One packaged runtime script serves the `SessionStart` lifecycle boundary. It reads repository and personal layers and delivers the mandatory core fragments after startup, resume, clear, or compact. The hook does not process submitted prompts, persist session controls, or create clear-transfer state. Codex and Claude do not receive Pi-only capability delivery.

The hook stays inert without valid repository activation, fails closed on invalid personal core config, and never inspects or exposes Pi-only capabilities. Host trust or hook registration may still be required. Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Pi

The Pi extension:

- reads both config layers before agent turns;
- composes the mandatory core prompt and Interaction Contract plus effective optional capability prompts in `before_agent_start`;
- supplies one unified volatile `Freeflow Runtime State` message at session start, after context reconstruction or loss, and when displayed state changes, preserving it when unchanged;
- restores only remaining branch-aware session overrides for enablement and optional context capabilities;
- dynamically exposes 25 base model/contributor skills plus effective child capability skills;
- registers canonical direct commands;
- activates capability tools and discoverable capability skills only when their individual gates are effective;
- when hosted by PiFlow, owns the Pi-only Cognitive Routing lease, prepared profile intents, profile controls, reload state restoration, automatic switch tool, and session status.

`/freeflow settings` edits personal core overrides. `/freeflow settings session` manages temporary enablement and optional-context overrides without changing config files. `/freeflow settings repo` edits shared repository settings.

Pi source lives under `pi-extension/src/`; the package executes built output under `pi-extension/dist/` through `pi-extension/freeflow/index.js`.

## Skill Architecture

Workflow owns authority interpretation and enforcement, current-owner selection, and routing. Leaf skills own focused methods and return evidence, decisions, or route changes rather than redefining the lifecycle or widening authority. Selecting a leaf method never authorizes active evidence generation, mutation, or delivery.

A skill body establishes the first-read job and normal route from guaranteed context. Separately owned required depth and conditional branch depth live in linked references whose read points are declared by the body; deterministic repeated work may live in scripts. Cross-skill links are project dependencies, not bundled local resources.

See [Skill routing](skill-routing.md) for the typed owner, route, and reference adjacency map.

The active cross-host model/contributor surface has 25 skills under `skills/`, including Action Selection and Workflow. Cognitive Routing, Context Virtualization, and Conversation History are separately packaged Pi-only capability skills under `capabilities/`, outside Codex and Claude discovery. Retired Output Router material is preserved under `.deprecated/output-router/`. Removed Mode Contract material is preserved under `.deprecated/modes/` and is not an active package surface.

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

The Pi-only Cognitive Routing capability owns exactly two configured compute profiles, complete model-and-thinking transitions through Pi's lease, deterministic `/freeflow profile standard|reasoning|auto` controls, the guarded `freeflow_switch_profile(target, reason)` request, and one volatile model-facing Control/Profile state record when the state is initially supplied, rebuilt, or changed. Transition history is evidence, not current-state authority. Its discoverable skill is exposed only while Freeflow and Cognitive Routing are effective; it shares authority, tools, workflow, context, and evidence requirements with the active agent and does not authorize work. The current implementation remains an experimental PiFlow-hosted MVP until behavioral acceptance evidence is complete; normal Pi keeps the configuration inspectable but runtime-disabled.

Delegation Harness is retired from the live package. Its implementation and historical evidence remain under `.deprecated/delegation-harness/`.

## Deferred Enforcement

Enforcement hooks and CLI policy checks remain deferred until behavioral evidence shows that concise instructions and workflow routing cannot prevent a repeated concrete failure. Existing hooks load context only.
