# Freeflow

**A feedback-based control system for coding agents.**

Freeflow helps coding agents do consequential work without turning every task into a rigid ceremony. It gives the agent a clear interaction contract, evidence-driven Workflow, focused methods, durable task memory, and controlled delivery boundaries.

The host agent still owns tools, permissions, and execution. Freeflow helps it choose the right next action—and know when to stop, ask, verify, or hand work back.

## Why Freeflow

Coding agents commonly fail at control boundaries:

| Pressure | Freeflow response |
| --- | --- |
| A question or tentative idea becomes an edit. | The Interaction Contract answers first and waits for clear action authority. |
| A prompt conflicts with tests, policy, or accepted behavior. | Decision Gate names the conflict before mutation. |
| New evidence invalidates the plan. | Workflow routes from evidence and preserves unaffected work. |
| Every task receives unnecessary ceremony. | Workflow enters at the narrowest useful owner. |
| A passing command becomes an unsupported completion claim. | Verify Work matches evidence to the exact claim and boundary. |
| Compaction loses task state. | Track Work restores a Working Record and reconciles it with live state. |
| Tool output consumes future context. | Context Virtualization can archive consumed evidence while preserving session history. |

## Contents

- [How it works](#how-it-works)
- [Host support](#host-support)
- [Capabilities](#capabilities)
- [Quick start](#quick-start)
- [Modes and workflow](#modes-and-workflow)
- [System prompt architecture](#system-prompt-architecture)
- [Evidence and limits](#evidence-and-limits)
- [Commands](#commands)
- [Documentation and development](#documentation-and-development)
- [What Freeflow is not](#what-freeflow-is-not)

## How it works

Freeflow uses one active agent, one shared context, and nested feedback loops:

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

Under manual profile control, the Cognitive Execution Loop is not used; the held profile runs the ordinary unsplit Workflow. Cognitive Routing changes compute placement only. It never changes authority, ownership, mode, task scope, evidence requirements, or review independence.

The Workflow owner may be Discuss, Track Work, Execute Work, Verify Work, Review Work, Review Artifact, Diagnose Failure, or another focused method. These methods compose when their conditions apply; they are not a mandatory phase pipeline.

## Host support

Freeflow is one package with different host boundaries:

| Host | Freeflow support | Cognitive Routing |
| --- | --- | --- |
| Codex | Shared skills and lifecycle hook | Not available; Pi-only capabilities are not delivered |
| Claude Code | Shared skills and lifecycle hook | Not available; Pi-only capabilities are not delivered |
| Pi | Shared skills, Pi extension, and optional context capabilities | Configuration is inspectable but execution is disabled |
| PiFlow | Freeflow package hosted by the separate PiFlow distribution | Available when host controls, Skills, and profiles are configured |

Freeflow owns workflow policy, prompt fragments, skills, capabilities, and the Pi extension. PiFlow owns host launch, package installation, session state, updates, and the model-state control required by Cognitive Routing.

## Capabilities

### Workflow and task memory

- **Workflow** coordinates authority, owner selection, evidence-driven re-entry, and Supported Exit.
- **Action Selection** bounds uncertain or broad Environment Interactions while preserving the current owner.
- **Track Work** maintains one Working Record when decisions, evidence, blockers, or the next action must survive context loss.
- **Verify Work, Review Work, Review Artifact, and Diagnose Failure** separate factual support, judgment, artifact fitness, and unsupported causes.

### Optional host capabilities

- **[Cognitive Routing](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/cognitive-routing.md)** places compute between Reasoning and Standard under automatic control. It is PiFlow-only and experimental.
- **[Context Virtualization](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/context-virtualization.md)** classifies consumed tool evidence as Full, Retained, or Reference-only for future context while leaving canonical history unchanged.
- **[Conversation History](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/conversation-history.md)** performs bounded retrieval of exact missing prior-conversation evidence from the current active branch.

All three capabilities are Skills-gated and default-off or unavailable unless their configuration and host conditions are effective. None of them grants authority or replaces Workflow.

## Quick start

For the complete host-specific setup, see [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md).

### Codex

```bash
codex plugin marketplace add https://github.com/hassan-mohiddin/freeflow.git
codex plugin marketplace upgrade freeflow
codex plugin add freeflow@freeflow
```

Trust the Freeflow hook from `/hooks`, then start a new session.

### Claude Code

```text
/plugin marketplace add hassan-mohiddin/freeflow
/plugin install freeflow
/reload-plugins
```

### Pi

```bash
pi install npm:@hassangameryt/freeflow
```

Or:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

### PiFlow

Install PiFlow separately, then install Freeflow into it:

```bash
npm install -g --ignore-scripts @hassangameryt/piflow
piflow install npm:@hassangameryt/freeflow
```

For a Git source:

```bash
piflow install git:github.com/hassan-mohiddin/freeflow
```

In the target repository, run:

```text
/setup-freeflow
```

Setup creates `.freeflow/config.json`, the required shared activation boundary. `.freeflow/local.json` is an optional personal override and cannot activate Freeflow by itself.

## Modes and workflow

Freeflow has exactly three modes:

| Mode | Use for |
| --- | --- |
| `conversation` | Discussion, critique, explanation, and passive inspection |
| `workflow` | Active evidence generation and normal consequential work |
| `strict-workflow` | High-risk or hard-to-reverse work |

Mode changes do not authorize work. A direct request, still-valid approval, or accepted task contract establishes the authority envelope; mode, skill selection, usefulness, and new evidence do not widen it.

Every bounded activity follows the same Feedback Loop:

```text
orient to accepted intent, task memory, and live evidence
-> use the narrowest owner
-> act, discuss, test, or observe
-> verify what the evidence proves
-> self-review the supported result
-> continue, correct, diagnose, revise, ask, defer, or stop
```

## System prompt architecture

Freeflow’s model-facing surface has three layers:

1. **Stable prompt fragments** under `runtime/prompts/` provide compact guidance and conditional capability cues.
2. **Runtime State** reports current mode, capability availability, and Cognitive Routing `Control`/`Profile` before every provider request.
3. **Discoverable skills and tools** provide complete methods and operations when effective gates apply.

One effective-state snapshot determines all three surfaces. The Interaction Contract is prompt-only. Skills gates Cognitive Routing, Context Virtualization, and Conversation History. Missing optional capability content is omitted and reported unavailable rather than fabricated.

Read the full [System Prompt Architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/prompt-architecture.md) and [Workflow](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/workflow.md) docs for the complete contract.

## Evidence and limits

Freeflow is explicit about what its checks prove:

- deterministic checks prove structure, assembly, package boundaries, and selected delivery behavior;
- release evidence is versioned and records source, checks, artifacts, deferred evidence, and limits;
- local installation does not prove remote host installation or registry propagation;
- deterministic skill/runtime checks do not prove model behavior or universal skill readiness;
- Cognitive Routing remains experimental pending behavioral acceptance.

The deprecated Output Router is removed and no longer available. Its implementation and evidence remain archived under `.deprecated/output-router/`.

See [Release Process](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release.md) and [Release Evidence](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release-evidence/README.md).

## Commands

Natural language is preferred. Pi registers these canonical direct calls:

```text
/discuss
/action-selection
/track-work
/write-spec
/review-artifact
/write-plan
/execute-work
/simplify-code
/migration-work
/diagnose-failure
/verify-work
/review-work
/commit-work
/handoff
/finish-branch
/release-work
/launch-work
/bypass
```

Contributor calls:

```text
/setup-freeflow
/write-skill
/evaluate-skill
```

Mode controls:

```text
/freeflow mode conversation
/freeflow mode workflow
/freeflow mode strict-workflow
/freeflow mode reset
```

Pi settings and PiFlow-only Cognitive Routing controls:

```text
/freeflow
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
```

Pi `/freeflow settings` edits personal overrides, `/freeflow settings session` manages temporary session overrides, and `/freeflow settings repo` edits shared repository settings. Profile changes require PiFlow and an idle host.

In PiFlow, while the host is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold.
- `Ctrl+Shift+A` cycles the automatic standard/reasoning profile; from a manual hold, its first press returns to automatic control without forcing a profile transition.

Normal Pi does not register these Cognitive Routing shortcuts.

## Documentation and development

- [Documentation hub](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/README.md)
- [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md)
- [Architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/architecture.md)
- [System Prompt Architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/prompt-architecture.md)
- [Capabilities](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/README.md)
- [PiFlow integration](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/piflow.md)
- [Skill routing](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/skill-routing.md)
- [Release Process](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

For local development, use committed Freeflow snapshots with `npm run snapshot:refresh`. Do not treat an uncommitted working tree as a production package source. PiFlow owns the host development launcher and state synchronization.

## What Freeflow is not

- Not a new agent or workflow engine.
- Not a rigid phase pipeline.
- Not a permission or CLI enforcement framework.
- Not a replacement for repository instructions, tests, policies, or review culture.
- Not proof that the current candidate is behaviorally ready.

## License

MIT License. Copyright (c) 2026 Hassan Mohiddin.
