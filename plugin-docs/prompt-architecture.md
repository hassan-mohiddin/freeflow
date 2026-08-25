# System Prompt Architecture

Freeflow’s model-facing behavior is delivered through three coordinated layers. They are one effective surface for a provider request, not three independent policies.

## The three layers

### 1. Stable prompt fragments

Static fragments under `runtime/prompts/` provide compact guidance that should remain stable across requests:

- Freeflow identity and shared boundaries;
- mode semantics and the Interaction Contract;
- shared terminology;
- the Interaction Lifecycle and Feedback Loop cues;
- Workflow, Action Selection, and Supported Exit cues;
- conditional capability cues.

The fragments are assembled in a stable order. The current order is:

```text
core stable guidance
-> mode semantics
-> Interaction Contract when effective
-> Skills/shared terms/loops/Workflow/Action Selection/Supported Exit when Skills is effective
-> Cognitive Routing cue when Skills and Cognitive Routing are effective
-> Context Virtualization cue when Skills and Context Virtualization are effective
-> Conversation History cue when Skills and Conversation History are effective
```

The Interaction Contract is prompt-only. It is not a discoverable skill and does not authorize work.

### 2. Runtime State

The extension supplies one compact volatile Runtime State record before every provider request, including when Freeflow is disabled or unconfigured. It reports current facts such as:

- default and active mode;
- capability availability;
- Cognitive Routing `Control` and `Profile`.

Runtime State is current-state data, not stable policy. It does not replace the prompt fragments, contain hidden reasoning, authorize a tool call, or reconstruct state from earlier transition history.

### 3. Discoverable skills and tools

Complete methods live in discoverable packages:

- normal model/contributor skills under `skills/` when Skills is effective;
- Cognitive Routing, Context Virtualization, and Conversation History under `capabilities/` only when Skills and each child capability are effective;
- capability tools from the same effective surface snapshot.

Full Workflow and capability bodies are discovered on demand rather than duplicated into persistent prompt text. A skill’s first-read description and references own its activation depth.

## One effective surface snapshot

Prompt fragments, Runtime State, discoverable skills, capability tools, and projection controls must agree for one provider request. One effective-state snapshot determines the surface:

```text
resolve configuration and host capability
-> compose applicable prompt fragments
-> compute Runtime State
-> expose matching skills and tools
-> project the same effective surface to the provider
```

Do not resolve these surfaces independently and report contradictory state in the same request. A capability that cannot be loaded or exposed reliably is unavailable: omit its cue, skill, and tools while preserving the host’s ordinary operation.

Skills is the parent gate for Cognitive Routing, Context Virtualization, and Conversation History. Disabling Skills removes those child surfaces without inventing a replacement state.

## Host delivery

### Codex and Claude Code

The shared hook loads applicable static fragments at supported lifecycle boundaries and emits explicit session-mode deltas only for explicit mode controls. Ordinary prompts remain silent. Codex and Claude do not receive Pi-only capability delivery.

Hook delivery does not enforce workflow policy, block tools, grant permissions, or replace repository instructions. Hook trust and registration are host concerns; Setup reports delivery as confirmed, unavailable, or unconfirmed.

### Pi and PiFlow

The Pi extension composes fragments, Runtime State, discoverable skills, and tools before provider requests. It filters historical one-time bootstrap entries rather than creating new Workflow or Cognitive Routing bootstrap messages.

Pi provides the optional context capabilities. Cognitive Routing requires the PiFlow host contract because it needs host-owned session model-state control. Normal Pi can expose the configuration for inspection but keeps Cognitive Routing runtime-disabled.

See [Pi integration](integrations/pi.md) and [PiFlow integration](integrations/piflow.md) for host-specific installation and behavior.

## Nested execution model

Prompt delivery describes what the model sees. Workflow and Cognitive Routing describe how authorized execution is coordinated after that surface is available:

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ establishes authority, owner, and slice
   └─ Cognitive Execution Loop — automatic control only
      ├─ Reasoning establishes the governing execution contract
      ├─ DELEGATE to Standard
      │  └─ Environment Interaction Loop
      │     ├─ select and bound the next action
      │     ├─ use Action Selection when uncertain or broad
      │     ├─ take the obvious fast path when mechanical
      │     ├─ execute and observe
      │     └─ repeat within the delegation contract
      ├─ RETURN evidence to Reasoning
      ├─ Reasoning self-reviews
      └─ close, delegate correction, or return to Workflow
```

Under manual control, the Cognitive Execution Loop is not used; the held profile runs the ordinary unsplit Workflow. Cognitive Routing changes compute placement only and never changes authority, owner, mode, slice, evidence requirements, or review independence.

## Failure and recovery boundaries

- Missing core prompt: preserve the host’s base prompt and report Freeflow guidance unavailable.
- Missing optional fragment or capability: omit only the affected cue, skill, and tools; report unavailable rather than fabricating active state.
- Skills inactive: child capability cues, skills, settings, and tools are inactive.
- Historical bootstrap entries: filter them from current projection; do not create new one-time bootstrap messages.
- Runtime State unavailable: do not infer it from model identity, response style, or old transition results.
- Configuration establishes activation but does not prove host delivery.

## Evidence boundary

Deterministic prompt, gating, discovery, and package checks prove assembly and delivery structure. They do not establish behavioral quality, universal skill readiness, host trust UI, remote installation, or release publication. Those claims require their own evidence boundary.

## Related documentation

- [Workflow and nested loops](workflow.md)
- [Architecture](architecture.md)
- [Skill routing](skill-routing.md)
- [Capabilities](capabilities/README.md)
- [Getting Started](getting-started.md)
- [Release evidence](release-evidence/README.md)
