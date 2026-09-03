# System Prompt Architecture

Freeflow’s model-facing behavior is delivered through coordinated core, capability, and runtime surfaces. They form one effective surface for a provider request, not independent policies.

## The model-facing layers

### 1. Core guidance

`runtime/prompts/core.md` is the stable base guidance. It owns:

- Freeflow identity and shared boundaries;
- shared terminology;
- the Interaction Lifecycle and Feedback Loop;
- Workflow, Action Selection, and Supported Exit cues.

Core guidance is mandatory whenever Freeflow is enabled and also contains the guidance previously separated into `skills.md`.

### 2. Interaction Contract

`runtime/prompts/interaction-contract.md` remains a separate mandatory prompt fragment. It owns whole-turn interpretation, the distinction between questions or tentative ideas and authorization, and recommendations for focused discussion when collaboration has material value.

Keeping this file separate lets its behavior change without changing the rest of the core guidance. It is not a configurable capability and is not a discoverable skill.

### 3. Runtime State

The extension supplies one compact volatile Runtime State record at session start, after context reconstruction or loss, and when its displayed state changes, including when Freeflow is disabled or unconfigured. When state is unchanged and the previous record remains in continuous provider context, the extension preserves it rather than appending a replacement. It reports current facts such as:

- whether Freeflow is active, inactive, unavailable, or awaiting setup;
- optional capability availability;
- Cognitive Routing `Control` and `Profile`.

Runtime State is current-state data, not stable policy. It does not replace the prompt fragments, contain hidden reasoning, authorize a tool call, or reconstruct state from earlier transition history.

### 4. Discoverable skills and tools

Complete methods live in discoverable packages:

- 25 base model/contributor skills under `skills/` whenever Freeflow is enabled and the mandatory core fragments are available;
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

The shared hook loads the mandatory core fragments at `SessionStart` for startup, resume, clear, and compact boundaries. It does not process ordinary submitted prompts, persist session controls, or create clear-transfer state. Codex and Claude do not receive Pi/PiFlow capability delivery.

Hook delivery does not enforce Workflow policy, block tools, grant permissions, or replace repository instructions. Hook trust and registration are host concerns; Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Pi and PiFlow

The Pi extension composes the mandatory core fragments, Runtime State, discoverable skills, and tools before provider requests. It filters historical one-time Workflow or Cognitive Routing bootstrap entries rather than creating new persistent bootstrap messages.

Pi and PiFlow provide the optional context capabilities. Cognitive Routing runs on either host when its model registry, model/thinking controls, and session-entry APIs are available; PiFlow continues to provide its host-owned lease path.

See [Pi integration](integrations/pi.md) and [PiFlow integration](integrations/piflow.md) for host-specific installation and behavior.

## Nested execution model

Prompt delivery describes what the model sees. Workflow and Cognitive Routing describe how authorized execution is coordinated after that surface is available:

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes authority, owner, and slice
   └─ Cognitive Execution Routes — automatic control only
      ├─ Boundary OPEN
      │  ├─ DELEGATE next unit → RETURN; boundary remains open
      │  ├─ ACT_BOUNDED when independently qualified → reassess
      │  ├─ suspend or route a changed boundary
      │  └─ CLOSE after support and review
      ├─ Boundary NONE
      │  ├─ YIELD → Standard leads one complete result → YIELD HANDOFF
      │  ├─ ACT_BOUNDED when independently qualified → Reasoning acts directly
      │  └─ DELEGATE → open a model-written boundary; Standard executes
      └─ Action Selection guides uncertain environment interactions
```

Manual Cognitive Routing control runs the ordinary unsplit Workflow. Under automatic control, conversational Reasoning is the default and owns user-facing interpretation and reporting. With no open boundary, Yield is the standalone whole-result transfer, `ACT_BOUNDED` is exceptional direct Reasoning execution, and otherwise Delegate opens a boundary. With an open boundary, Delegate is the continuing route; literal Yield is not used, while a qualifying `ACT_BOUNDED` scope may operate inside it without closing it. Automatic Standard only executes active Yield or Delegate contracts and never conducts substantive user-facing interaction; at every return condition it transfers state to Reasoning. Cognitive Routing changes compute placement only and never changes authority, owner, task scope, evidence requirements, or review independence.

## Failure and recovery boundaries

- Missing `core.md` or `interaction-contract.md`: preserve the host’s base prompt, hide base skills and optional capabilities, and report Freeflow guidance unavailable.
- Missing optional fragment or capability: omit only the affected cue, skill, and tools; report unavailable rather than fabricating active state.
- Disabled Freeflow: preserve the host prompt, hide Freeflow skills and tools, and retain only compact inactive Runtime State.
- Historical bootstrap entries: filter them from current projection; do not create new one-time bootstrap messages.
- Runtime State unavailable: do not infer it from model identity, response style, or old transition history.
- Configuration establishes activation but does not prove host delivery.

## Evidence boundary

Deterministic prompt, gating, discovery, and package checks prove assembly and delivery structure. They do not establish behavioral quality, universal skill readiness, host trust UI, remote installation, or release publication. Those claims require their own evidence boundary.

## Related documentation

- [Workflow](workflow.md)
- [Architecture](architecture.md)
- [Skill routing](skill-routing.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
- [Release evidence](release-evidence/README.md)
