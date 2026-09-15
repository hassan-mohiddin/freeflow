# System Prompt Architecture

Freeflow’s model-facing behavior is delivered through coordinated core, capability, and runtime surfaces. They form one effective surface for a provider request, not independent policies.

## The model-facing layers

### 1. Core guidance

`runtime/prompts/core.md` is the stable base guidance. It owns:

- Freeflow identity and shared boundaries;
- shared terminology;
- the Interaction Lifecycle, Feedback Loop, and Environment Interaction Loop;
- compact readiness and recovery invariants;
- Workflow, Action Selection, and Supported Exit cues.

Core guidance is mandatory whenever Freeflow is enabled and also contains the guidance previously separated into `skills.md`. Detailed planning, execution, verification, and handback methods remain in skills rather than being duplicated into the standing prompt.

### 2. Interaction Contract

`runtime/prompts/interaction-contract.md` remains a separate mandatory prompt fragment. It owns whole-turn interpretation, the distinction between discussion and authorization, and establishing the outcome, scope, and user-facing return condition. A clear request needs no redundant confirmation; an unsettled material boundary requires a question before execution.

Keeping this file separate lets its behavior change without changing the rest of the core guidance. It is not a configurable capability and is not a discoverable skill.

### 3. Runtime State

The extension supplies one compact volatile Runtime State record at session start, after context reconstruction or loss, and when its displayed state changes, including when Freeflow is disabled or unconfigured. When state is unchanged and the previous record remains in continuous provider context, the extension preserves it rather than appending a replacement. It reports current facts such as:

- whether Freeflow is active, inactive, unavailable, or awaiting setup;
- optional capability availability;
- Cognitive Routing `Control`, `Profile`, and `Delegation`.

Runtime State is current-state data, not stable policy. It does not replace the prompt fragments, contain hidden reasoning, authorize a tool call, or reconstruct state from earlier transition history.

### 4. Discoverable skills and tools

Complete methods live in discoverable packages:

- 24 base model/contributor skills under `skills/` whenever Freeflow is enabled and the mandatory core fragments are available;
- Cognitive Routing, Context Virtualization, and Conversation History under `capabilities/` only when their own gates are effective;
- capability tools from the same effective surface snapshot.

## One effective surface snapshot

Prompt fragments, Runtime State, discoverable skills, capability tools, and projection controls must agree for one provider request. One effective-state snapshot determines the surface:

```text
resolve activation and host capability
-> load mandatory core fragments
-> load effective optional capability fragments
-> compute Runtime State
-> expose matching skills and tools
-> project the same effective surface to the provider
```

Do not resolve these surfaces independently and report contradictory state in the same request. A missing mandatory core fragment leaves Freeflow guidance unavailable and preserves the host’s ordinary operation. A missing optional capability fragment removes only that capability’s cue, skill, and tools while reporting it unavailable.

The `enabled` setting is the only Freeflow core switch. Context Virtualization, Conversation History, and Cognitive Routing are independent optional capabilities. Configurations containing the removed `defaultMode`, `interactionContract`, or `skills` keys are invalid.

## Host delivery

### Codex and Claude Code

The Codex and Claude adapters load the mandatory core fragments at `SessionStart` for startup, resume, clear, and compact boundaries. They share `hooks/shared/runtime-context.mjs` but keep host-specific hook manifests and output envelopes. They do not process ordinary submitted prompts, persist session controls, or create clear-transfer state. Codex and Claude do not receive Pi/PiFlow capability delivery.

Hook delivery does not enforce Workflow policy, block tools, grant permissions, or replace repository instructions. Hook trust and registration are host concerns; Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Gemini CLI

Gemini uses `gemini-extension.json`, the root `skills/` directory, and its `hooks/hooks.json` `SessionStart` adapter. The adapter returns Gemini’s `hookSpecificOutput.additionalContext` field. Gemini’s documented startup, resume, and clear lifecycle is host-specific; local fixtures do not prove extension dispatch.

### Cursor

Cursor discovers the portable skill surface from the root Agent Plugins 1.0 manifest. Its `.cursor-plugin/plugin.json` adds a `sessionStart` adapter that returns Cursor’s `additional_context` field. Cursor session-start hooks are fire-and-forget and do not provide a blocking policy boundary.

### GitHub Copilot and VS Code

Copilot CLI and VS Code discover portable skills from the root Agent Plugins 1.0 manifest. The `com.github.copilot/hooks/hooks.json` namespace supplies the compatible `SessionStart` hook, whose adapter returns direct `additionalContext` output. VS Code’s hook runtime is a preview surface, and Copilot CLI/cloud lifecycle environments differ; deterministic adapter tests do not establish native dispatch.

### Kiro

Kiro can load the root Agent Plugins 1.0 package as a Power and activate its bundled skills. No Kiro-specific context file or hook adapter is included, so Kiro does not receive a claimed always-on Freeflow prompt surface from this package.

### OpenCode and Hermes Agent

OpenCode v2 and Hermes consume the canonical `skills/` surface through their documented skill-source or Agent Plugins adapters. Neither receives a claimed always-on Freeflow prompt surface or the Pi/PiFlow capabilities from this package.

### Pi and PiFlow

The Pi extension composes the mandatory core fragments, Runtime State, discoverable skills, and tools before provider requests. It filters historical one-time Workflow or Cognitive Routing bootstrap entries rather than creating new persistent bootstrap messages.

Pi exposes Cognitive Routing when its native model, thinking, session-entry, and ancestry gates are effective. PiFlow provides its host lifecycle for shared Freeflow skills and standalone context capabilities, but the current Freeflow source entrypoint explicitly marks the redesigned PiFlow Cognitive Routing adapter unavailable. Do not infer routing availability from PiFlow installation or from the Pi source entrypoint.

See [Pi integration](integrations/pi.md) and [PiFlow integration](integrations/piflow.md) for host-specific installation and behavior.

## Nested execution model

Prompt delivery describes what the model sees. Workflow and Cognitive Routing describe how authorized execution is coordinated after that surface is available:

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes agreement, owner, and slice
   └─ Cognitive Routing — automatic control only
      ├─ Coordinator selects the responsible worker for the next result
      │  ├─ Helper: ordinary support, preparation, checks, and settled mechanics
      │  └─ Executor: substantive or consequential results
      ├─ Coordinator compares acceptance with actual evidence
      │  ├─ continue, change worker, or explicitly replace an assignment within an open unit
      │  └─ close the supported unit through freeflow_unit
      └─ Action Selection bounds environment interactions
```

Manual control runs the ordinary unsplit Workflow for the held profile. Automatic Coordinator owns user-facing judgment and places work by delegation mode: Coordinator implements in `helper`, Executor-only delegates environment work to Executor, and `both` uses Helper by default while commissioning Executor for substantive or consequential results. Only Coordinator delegates one worker at a time; `both` requires an explicit worker choice. A unit may contain sequential assignments to different workers, but preparation and follow-up are optional routes. A saved report ends the assigned worker's task permission without accepting the unit or closing a Slice. Explicit retry preserves the saved report, and replacement preserves prior effects; routing does not add a second Workflow or model-authored boundary ledger. Attached recovery lets Coordinator request missing evidence while preserving the returned assignment, original report, selection, and assessment; the assignment's recorded worker receives only bounded selection/exact-read work and returns a distinct supplement. Unsettled recovery must complete or be cancelled before `assess` resumes the assessment. Late user input reaching a prepared worker request requires an interrupted return before task tools. With projection enabled, Helper and Executor share ordinary active history while Coordinator receives selected worker evidence with original producer attribution; compaction retains the last observed delivered-user basis rather than treating stored-but-undelivered history as new input. Under automatic control, Coordinator must assess a supported Slice result and explicitly direct completed Track Work closure; Manual follows ordinary Workflow and Track Work instead. These operations do not change user authority or make an internal handback the user-facing endpoint.

## Failure and recovery boundaries

- Missing `core.md` or `interaction-contract.md`: preserve the host’s base prompt, hide base skills and optional capabilities, and report Freeflow guidance unavailable.
- Missing optional capability: report the capability unavailable. On the Pi source surface, stable reference definitions may remain catalog-visible while active execution gates reject unavailable operations; presence is not authority.
- Disabled Freeflow: preserve the host prompt and block Freeflow operations. Pi's stable reference catalog may remain dormant in the assembled surface; capability state and execution gates still determine applicability.
- Historical bootstrap entries: filter them from current projection; do not create new one-time bootstrap messages.
- Runtime State unavailable: do not infer it from model identity, response style, or old transition history.
- Native Pi request replay preserves Freeflow-generated snapshots only when the permitted ancestry and rendered prefix remain compatible; model/provider, tool/schema, instruction, earlier-content, compaction, navigation, or unsupported effort changes may shorten reuse. Provider cache hits remain outside the local assembly contract.
- Configuration establishes activation but does not prove host delivery.
- After context loss, the core cue requires complete `full` Working Record recovery when a record exists, current capability/owner methods, and reconciliation with current direction and live evidence. An intact session uses bounded readback instead of repeating full recovery.
- Attached recovery is not general task access: the recorded worker receives only selected existing evidence, exact admitted task-file reads, packaged Freeflow methods, and recovery return controls. Fresh attention does not finish that recovery; supplement or cancellation precedes assessment resumption.
- A Runtime State refresh alone is not a user interruption or a replacement execution contract.

## Evidence boundary

Deterministic prompt, gating, discovery, package, and host-adapter checks prove assembly and delivery structure. They do not establish behavioral quality, universal skill readiness, native host dispatch, host trust UI, remote installation, marketplace review, or release publication. Those claims require their own evidence boundary.

## Related documentation

- [Workflow](workflow.md)
- [Architecture](architecture.md)
- [Skill routing](skill-routing.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
- [Release evidence](release-evidence/README.md)
