# ADR 0006: Prompt Fragments And Discoverable Skills

## Status

Accepted in the original architecture. Partially superseded by [ADR 0011: Single Adaptive Workflow](0011-single-adaptive-workflow.md) for mode, core-toggle, and prompt-surface semantics. This ADR supersedes the runtime-delivery details in ADR 0002; ADR 0002's evals-before-enforcement decision remains in force.

## Decision

Freeflow's model-facing surface has three layers:

1. **Static prompt fragments** under `runtime/prompts/` provide stable guidance, mode semantics, the Interaction Contract, shared terms, loop cues, Workflow and Action Selection cues, Supported Exit, and conditional capability cues.
2. **Runtime State** is extension-generated volatile state appended to provider context. It reports current mode, capability availability, and Cognitive Routing `Control`/`Profile`; it is not stable policy text.
3. **Discoverable skills and tools** provide complete methods and operations when their effective gates apply. Normal packages under `skills/` require effective Skills. Cognitive Routing, Context Virtualization, and Conversation History require both Skills and their own capability gate.

One effective-state snapshot determines prompt composition, Runtime State, discoverable skills, and capability tools for a provider request. Skills is the parent gate for the three child capabilities. Interaction Contract remains independently gated and prompt-only.

Workflow and Cognitive Routing are no longer delivered as one-time bootstrap messages. Previously persisted bootstrap entries are filtered from current provider projection as historical artifacts.

If a prompt fragment or optional capability cannot be loaded or exposed reliably, the affected capability is marked unavailable, its cue, skill, and tools are omitted, and the host's base prompt and ordinary operation are preserved. A missing core prompt makes Freeflow model-facing guidance unavailable without fabricating active capability state.

Cognitive Routing changes compute only. Its current skill body is required before applying another Freeflow skill or performing task/evidence work when the capability is active and the body is absent. The body-only bootstrap read must be isolated from user-prompt interpretation and other task actions; this significance does not change mode, authority, or Workflow ownership.

## Consequences

- Stable guidance can remain compact and byte-stable while Runtime State changes independently.
- Capability settings, discovery, tools, and prompt cues must be tested as one surface rather than as independent toggles.
- Full skill bodies remain available through discovery and are not duplicated in the system prompt.
- Context-loading adapters do not enforce policy, grant permissions, or authorize work.
- Deterministic tests establish assembly, gating, fallback, and packaging boundaries. Behavioral evaluation remains separate and does not follow automatically from these checks.

## Verification Boundary

The implementation must keep focused coverage for enabled, disabled, unavailable, parent-gated, startup-suppressed, missing-fragment, and mid-session state transitions, plus package and generated-artifact checks. Commit, development snapshot refresh, and behavioral evaluation remain separately controlled lifecycle boundaries.

## Supersession

ADR 0011 replaces the former selectable process modes, the Skills parent gate, and the independently configurable Interaction Contract. It does not replace this ADR's remaining decisions about one effective provider surface, volatile Runtime State, discoverable methods, historical bootstrap filtering, or adapter failure behavior; those decisions continue to apply wherever they do not conflict with ADR 0011.
