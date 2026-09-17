# Freeflow

**A feedback-based control system for coding agents.**

**Memory. Context. Compute.**

Freeflow helps coding agents do consequential work without turning every task into a rigid ceremony. It gives the active agent a clear Interaction Contract, one adaptive Workflow, durable task memory, focused engineering methods, and controlled delivery boundaries.

The host agent still owns tools, permissions, and execution. Freeflow helps it understand the request, choose the right next action, preserve continuity, use evidence honestly, place compute deliberately, and know when to continue, ask, defer, or stop.

- **New to Freeflow?** Read [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md).
- **Installing it?** Start with [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md).
- **Using Cognitive Routing?** Read the detailed [Cognitive Routing reference](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/cognitive-routing.md).

## Memory · Context · Compute

| Pillar | What it provides | Status |
| --- | --- | --- |
| **Memory — Track Work** | Working Records that preserve current context, one Current Slice, decisions, evidence limits, future work, and the next useful action. | Available through the shared skill surface. |
| **Context — Context Control** | Planned source-aware residency, representation, and bounded recovery for admitted context. | Planned/in development; unavailable in this release. |
| **Compute — Cognitive Routing** | Coordinator, Helper, and Executor profiles in one agent/session, with mode-aware work placement and optional worker-evidence projection. | Experimental native-Pi capability; current PiFlow adapter unavailable. |

Current optional **Context Virtualization** and **Conversation History** capabilities remain separate legacy Pi/PiFlow features. They are not Context Control v2, and their transforms are not qualified together with Cognitive Routing projection.

## Astra cache-aware reuse

Freeflow's Pi extension includes cache-aware request history and a qualified Astra effort-history adapter:

- compatible Freeflow-generated state stays at stable historical positions where possible;
- changed runtime state is appended instead of rewriting earlier generated context;
- qualified `gpt-6-astra` routes can retain a request-level effort baseline and insert trusted effort changes at validated historical positions;
- unsupported or uncertain requests fall back to the untouched native request.

This is request-construction and compatibility behavior—not proof of a provider cache hit, billing reduction, model quality improvement, or universal provider support. See the [Pi cache reuse boundaries](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/pi.md#cache-reuse-boundaries).

## Why Freeflow

Coding agents commonly fail at control boundaries:

| Pressure | Freeflow response |
| --- | --- |
| A question or tentative idea becomes an edit. | The Interaction Contract distinguishes discussion from authorization. |
| A prompt conflicts with policy, tests, or accepted behavior. | Decision Gate exposes the material conflict before mutation. |
| New evidence invalidates the chosen approach. | Workflow re-enters only the affected owner and preserves valid work. |
| Every task receives the same heavy process. | Workflow scales pressure to consequence, uncertainty, interaction, and reversibility. |
| A passing command becomes an unsupported completion claim. | Verify Work ties the claim to the actual observer and evidence boundary. |
| Context loss erases decisions and partial work. | Track Work restores a complete Working Record and reconciles it with live state. |
| Expensive models perform routine supporting work. | Cognitive Routing can place bounded support and substantive execution on configured profiles. |
| Request history changes destroy reusable prefixes unnecessarily. | RequestHistory and qualified Astra adaptation preserve compatible request structure. |

## How it works

Freeflow uses one active agent and one adaptive Workflow:

```text
Interaction Lifecycle
└─ Workflow Feedback Loop
   ├─ interpret authority and establish the work agreement
   ├─ choose the narrowest current owner
   ├─ discuss, act, test, or observe
   ├─ determine what the evidence supports
   ├─ self-review the supported result
   └─ continue, correct, diagnose, ask, defer, or stop
```

Focused methods own different results: Discuss, Track Work, Execute Work, Diagnose Failure, Verify Work, Review Work, Review Artifact, Write Spec, Write Plan, Release Work, and others. They compose when their conditions apply; they are not mandatory phases.

On a qualified native Pi host, automatic Cognitive Routing sits inside the current Workflow owner:

```text
Coordinator receives user direction
-> Helper handles normal supporting assignments when enabled
-> Executor handles substantive or consequential assignments
-> assigned worker returns actual work and evidence
-> Coordinator assesses, continues, corrects, or closes
```

Only one worker assignment runs at a time. A profile switch is not another agent or independent review. A worker report does not complete a Track Work Slice, task, commit, integration, release, or launch.

## Cognitive Routing modes

The labels describe intended optimization direction and potential, not guarantees.

| Mode | Positioning | Behavior |
| --- | --- | --- |
| **Helper only** | Quality-first — maximum performance and output-quality potential | Coordinator implements; Helper gathers context, prepares, checks, maintains task memory, and performs settled support. |
| **Executor only** | Savings-first — maximum savings potential | Coordinator directs and assesses; Executor owns delegated environment work. |
| **Both** | Balanced | Helper handles frequent routine support; Executor is commissioned for substantive or consequential work. |

A comparatively economical but capable Helper can contribute much of Both mode's potential savings because many routine assignments go through it. The detailed guide includes [recommended OpenAI subscription starting presets](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md#recommended-openai-subscription-starting-presets) and the limits on those recommendations.

## Availability

| Surface | Availability |
| --- | --- |
| Interaction Contract, Workflow, and 24 base skills | Shared supported package surface when Freeflow is effectively activated |
| Track Work / Working Records | Shared skill surface |
| Context Virtualization | Optional Pi/PiFlow capability; legacy, separately gated |
| Conversation History | Optional Pi/PiFlow capability; separately gated |
| Context Control v2 | Planned/in development; not available in this release |
| Cognitive Routing | Experimental native Pi source candidate |
| Cognitive Routing on PiFlow | Explicitly unavailable in the current adapter |
| Astra cache-aware effort history | Narrow source/fixture-qualified native Pi route; provider savings unverified |

Configuration or installation alone does not establish runtime delivery.

## Host support

Freeflow is one package with different host boundaries:

| Host | Freeflow support | Cognitive Routing |
| --- | --- | --- |
| Codex | Shared skills and Codex `SessionStart` hook | Not available |
| Claude Code | Shared skills and Claude Code `SessionStart` hook | Not available |
| Gemini CLI | Gemini extension, shared skills, and Gemini `SessionStart` hook | Not available |
| Cursor | Agent Plugins 1.0 skills plus Cursor-specific hook delivery | Not available |
| GitHub Copilot / VS Code | Agent Plugins 1.0 skills plus Copilot/VS Code hook delivery | Not available |
| Kiro | Agent Plugins 1.0 Power and shared skills | Not available; skills-only claim |
| OpenCode v2 | Canonical `skills/` through a documented project skill source | Not available; skills-only support |
| Hermes Agent | Agent Plugins 1.0 package and canonical skills | Not available; skills-only support |
| Pi | Shared skills and native extension source entrypoint | Experimental source candidate; installed-user and model-behavior evidence remain separate |
| PiFlow | PiFlow-hosted Freeflow package and shared surface | Explicitly unavailable in the current source adapter |

Freeflow owns workflow policy, portable prompts, skills, capability source, host adapters, and the Pi extension. Each host owns launch, package installation, session state, trust, and updates.

## Quick start

For complete instructions and delivery checks, use [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md).

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

### Gemini CLI

```bash
gemini extensions install https://github.com/hassan-mohiddin/freeflow
```

Restart Gemini CLI after installation or updates.

### Cursor, GitHub Copilot, VS Code, Kiro, OpenCode, and Hermes

These hosts consume the root Agent Plugins 1.0 manifest and canonical `skills/` surface through their documented plugin or skill-source workflows. Copilot CLI can install directly:

```bash
copilot plugin install hassan-mohiddin/freeflow
```

OpenCode can point its `skills` array at the installed package's `skills/` directory. Hermes can install the portable package with:

```bash
hermes plugins install hassan-mohiddin/freeflow --no-enable
hermes plugins enable freeflow
```

See [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md) for host-specific claims and limits.

### Pi

```bash
pi install npm:@hassangameryt/freeflow
```

Or:

```bash
pi install git:github.com/hassan-mohiddin/freeflow
```

Restart Pi or use `/reload` after installation or updates.

### PiFlow

```bash
npm install -g --ignore-scripts @hassangameryt/piflow
piflow install npm:@hassangameryt/freeflow
```

The current PiFlow adapter does not provide Cognitive Routing.

### Activate a repository

Run:

```text
/setup-freeflow
```

This creates the required shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. Optional `.freeflow/local.json` personal overrides cannot activate Freeflow alone.

## Use Freeflow effectively

A clear prompt normally needs:

```text
Outcome: what should be true?
Scope: what may change?
Exclusions: what must not happen?
Sources and constraints: what governs?
Evidence: what should support the result?
User-owned choices: what must come back to me?
Stop and return: where should the agent stop?
```

Natural language is preferred. Direct calls such as `/discuss`, `/execute-work`, `/diagnose-failure`, `/verify-work`, `/review-work`, `/track-work`, and `/release-work` are useful when they make the intended method clear. A skill is a method, not an authority grant or required phase.

Read [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md) for prompt examples, Workflow management, Track Work, settings, mode selection, preset recommendations, cache/cost boundaries, and troubleshooting.

## Commands

Canonical Pi direct calls include:

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

Qualified native-Pi Cognitive Routing controls:

```text
/freeflow
/freeflow status
/freeflow settings
/freeflow settings session
/freeflow settings local
/freeflow settings repo
/freeflow profile coordinator
/freeflow profile helper
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow resume
```

Profile changes and resume require an idle host. These commands do not prove installed-host delivery or authorize task work.

## Evidence and limits

Freeflow is explicit about what observations prove:

- deterministic checks can establish source structure, prompt assembly, schemas, package boundaries, and named fixtures;
- package shape does not prove native host dispatch, trust UI, or marketplace availability;
- request-prefix compatibility does not prove a provider cache hit;
- model/profile availability does not prove quality or cost improvement;
- local release preparation is not publication;
- publication is not production deployment.

Cognitive Routing remains experimental pending broader behavioral acceptance. Context Control v2 remains planned. The deprecated Output Router is removed and archived outside the active runtime.

## Documentation

- [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md)
- [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md)
- [Workflow](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/workflow.md)
- [Cognitive Routing](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/cognitive-routing.md)
- [Pi integration](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/pi.md)
- [PiFlow integration](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/piflow.md)
- [Architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/architecture.md)
- [System prompt architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/prompt-architecture.md)
- [Skill routing](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/skill-routing.md)
- [Capabilities](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/README.md)
- [Release process](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release.md)
- [Release evidence](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release-evidence/README.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

For local Pi/PiFlow development, refresh a development snapshot only from a committed Freeflow revision with `npm run snapshot:refresh`. A snapshot is not a production install or release.

## What Freeflow is not

- Not a new agent or workflow engine.
- Not a rigid phase pipeline.
- Not a permission or enforcement framework.
- Not a replacement for repository instructions, tests, policies, or review culture.
- Not proof that a configured model, cache path, or candidate is behaviorally ready.

## License

MIT License. Copyright (c) 2026 Hassan Mohiddin.
