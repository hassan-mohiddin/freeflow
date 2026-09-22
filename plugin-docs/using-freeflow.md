# Using Freeflow Effectively

Freeflow helps a coding agent interpret intent, choose the right kind of work, preserve task continuity, place compute deliberately, and stop with evidence. It is a workflow layer for the active agent—not a replacement agent, permission system, task tracker, or rigid phase pipeline.

This guide is for users who want better results from Freeflow without learning its internal implementation. For installation and host verification, start with [Getting Started](getting-started.md). For exact capability behavior, follow the linked reference pages.

## The practical model

Freeflow organizes work around three product pillars:

| Pillar | Purpose | Current status |
| --- | --- | --- |
| **Memory — Track Work** | Preserve decisions, current work, evidence limits, future work, and the next useful action in a Working Record. | Available through the shared skill surface. |
| **Context — Context Control** | Planned source-aware control over what remains in context and how exact evidence is recovered. | Planned/in development; unavailable in this release. |
| **Compute — Cognitive Routing** | Place work across Coordinator, Helper, and Executor profiles without changing Workflow ownership or user authority. | Experimental native-Pi capability; current PiFlow adapter unavailable. |

Freeflow also includes focused methods for discussion, planning, implementation, diagnosis, verification, review, commits, migration, releases, launches, and handoffs.

### What Freeflow does

- distinguishes a question or tentative idea from authorization to act;
- establishes the requested outcome, scope, and return boundary;
- scales workflow pressure to consequence, uncertainty, interaction, and reversibility;
- routes from evidence instead of blindly continuing a stale plan;
- preserves durable task memory when continuity matters;
- separates factual verification from judgment and independent review;
- keeps commit, integration, release, and launch as controlled boundaries;
- optionally places compute across configured profiles on a qualified native Pi host;
- optionally captures/reduces tool output and runs bounded revisioned operations through native Pi Tool Execution.

### What Freeflow does not do

- grant permission because a skill or tool exists;
- turn every task into a fixed sequence of documents and reviews;
- make a passing command prove more than it observed;
- make profile switching an independent review;
- guarantee lower cost, better model output, or provider cache hits;
- implement Context Control v2 in the current release;
- make Cognitive Routing or Tool Execution available on every host;
- turn restricted QuickJS programs into an audited OS sandbox or a universal native-tool dispatcher.

## Start here

1. [Install and activate Freeflow](getting-started.md).
2. Verify that your host actually delivered the expected skills and runtime context.
3. Give the agent a clear outcome and return boundary.
4. Let Workflow select the narrowest useful method; invoke a skill directly only when it helps communicate intent.
5. Ask for evidence at the boundary that matters.
6. Use Track Work for multi-slice or long-running tasks.
7. On native Pi, optionally configure Cognitive Routing after the ordinary Workflow is understood.

Natural language is preferred. You do not need to name every skill or plan the implementation for the agent.

## Prompt for accurate work

A strong prompt gives the agent enough to establish the work agreement without prescribing every local mechanic.

Use this shape when the task is consequential:

```text
Outcome:
What should be true when this is done?

Scope:
What repository, component, files, behavior, or artifact is included?

Exclusions:
What should not change or happen?

Sources and constraints:
Which specs, policies, tests, compatibility requirements, or user decisions govern?

Evidence:
What check or observation should support the result?

User-owned choices:
Which product, compatibility, security, deployment, or hard-to-reverse decisions must return to me?

Stop and return:
Where should the agent stop, and what should it report?
```

You can omit fields that do not matter. The purpose is clarity, not ceremony.

### Ask for an outcome, not a patch

Prefer:

> Fix the refresh-token regression while preserving the public API. Reproduce it first, add a focused regression check, and return after the implementation and relevant tests. Do not change token lifetime policy.

Instead of:

> Add an `if` statement in `refresh.ts`.

The first prompt gives the agent room to establish the cause and choose a supported implementation. The second can force a requested mechanism even when the premise is wrong.

### Name the return boundary

Useful boundaries include:

- “Discuss the options; do not edit.”
- “Implement and verify this Slice, then return.”
- “Prepare the release locally, but stop before commit, tag, push, or publication.”
- “Review this state and report findings; do not remediate.”
- “Diagnose the failure and return the supported cause before changing production code.”

Without a return boundary, an agent may stop too early or continue into a separately controlled action.

## Prompt examples

### Discussion only

```text
Compare the two storage designs for this service. Focus on ownership,
failure recovery, migration cost, and operator complexity. Inspect the
current code and ADRs if needed, but do not edit files. Recommend one option
and identify the decision that remains mine.
```

This normally routes through Discuss, with bounded investigation where evidence is needed.

### Implementation and verification

```text
Implement request cancellation for the upload client. Preserve the public
method signatures and existing retry behavior. Add focused tests that can
fail if cancellation still leaks a request. Run the relevant suite and return
with changed paths, evidence, and remaining limits. Do not commit or push.
```

A clear implementation request can already authorize preparation, edits, focused checks, correction, and self-review. It does not authorize commit or delivery unless stated.

### Diagnose before correction

```text
The integration test intermittently hangs after reconnect. Establish the
supported cause before changing production behavior. You may reproduce it and
add temporary bounded instrumentation. Return with the cause, evidence, and a
smallest-remedy recommendation; do not implement the fix yet.
```

This keeps a plausible patch from becoming an unsupported correction.

### Review without remediation

```text
Review the current branch for correctness, security-sensitive behavior, and
release risk. Use the main branch as the comparison basis. Report only
supported findings with file locations and evidence. Do not edit or dispatch
another review.
```

Independent review must be selected explicitly and must come from a context that did not produce the reviewed state. Another Cognitive Routing profile in the same session is not independent review.

### Documentation or artifact work

```text
Rewrite the public authentication guide from the live API and tests. Keep
planned behavior clearly separate from shipped behavior. Update only the
guide and directly necessary navigation links, run the docs checks, and
return before changelog, commit, or release work.
```

### Release preparation without publication

```text
Prepare the next release from main. First confirm source, version basis,
Unreleased notes, release policy, and exact artifact checks. Run the supported
local preparation and verification steps. Stop before commit, tag, push, npm
publication, or GitHub Release creation and report the exact prepared state.
```

A prepared release is not a published release, and a published release is not a production launch.

## Use skills as methods, not phases

Freeflow skills are focused methods. Workflow chooses the current owner according to the actual question or result. A linked skill does not run automatically, and loading a skill does not authorize an effect.

| Need | Useful method | What it owns |
| --- | --- | --- |
| Explore goals, alternatives, or approach | `/discuss` | Collaborative direction and bounded learning decisions |
| Preserve accepted behavior or design | `/write-spec` | Durable content, constraints, interfaces, and uncertainty |
| Order settled execution | `/write-plan` | Dependencies, ordered outcomes, checks, and invalidation conditions |
| Implement approved work | `/execute-work` | Preparation, production, focused evidence, correction, and continuation |
| Establish an unsupported cause | `/diagnose-failure` | Reproduction, hypotheses, discriminating evidence, and cause |
| Establish what a check proves | `/verify-work` | Factual support at the required observer boundary |
| Judge implementation or artifacts | `/review-work`, `/review-artifact` | Suitability and correctness judgment; independent review only when selected |
| Preserve long-running task state | `/track-work` | Working Record creation, recovery, Slices, decisions, and checkpoints |
| Create a local commit | `/commit-work` | Exact staging, commit creation, and checkpoint verification |
| Prepare or publish a release | `/release-work` | Version, artifact, destination, publication, and consumer verification boundaries |
| Transfer continuation context | `/handoff` | Compact point-in-time continuation package |

### Natural language first

These are equivalent in intent:

```text
Please diagnose why this test is flaky before proposing a fix.
```

```text
/diagnose-failure Why is this test flaky?
```

Use direct invocation when it removes ambiguity. Do not chain skill names into a mandatory pipeline such as “discuss, spec, plan, execute, review” unless the task actually needs those artifacts and boundaries.

### Do not use a skill to manufacture authority

A plan can describe a release, but it does not authorize publication. A review can identify a correction, but it does not authorize editing. A Working Record can preserve the next action, but it does not grant permission to perform it.

## Manage the Workflow

Freeflow uses one adaptive Workflow.

### Work agreement

For concrete work, the agent establishes:

- the outcome;
- permitted scope and effects;
- constraints and accepted sources;
- evidence needed for the result;
- the user-facing return condition.

A clear request can establish this without another confirmation. An unresolved user-owned choice or uncovered effect requires a stop.

### Feedback Loop

Every bounded activity follows the same loop:

```text
orient or reconstruct state
-> select or retain the current owner
-> establish the required result and supported approach
-> discuss, act, test, or observe
-> determine what the evidence supports
-> self-review the supported result
-> continue, correct, diagnose, ask, defer, stop, or complete
```

This is a reasoning loop, not a ceremony checklist.

### Current owner

The current owner is the method responsible for the next result. Examples:

- Discuss owns an unsettled outcome or approach.
- Execute Work owns concrete implementation.
- Diagnose Failure owns an unsupported cause.
- Verify Work owns a factual claim.
- Review Work or Review Artifact owns judgment.
- Track Work owns durable task-memory operations.
- Release Work owns release preparation and publication boundaries.

Cognitive Routing changes the compute profile serving that owner; it does not create another Workflow owner.

### Slices

A Slice is one coherent learning, delivery, or deepening result that can be executed and checked as a unit. It is not a file batch, phase name, test run, or routing assignment.

Use separate Slices when dependencies, uncertainty, outcome boundaries, or working-set size make one attempt unreliable. Keep implementation, its focused checks, and accepted local correction in the same Slice while the intended result and evidence boundary remain coherent.

### Checkpoints

Select a checkpoint only when it protects a meaningful boundary, such as:

- a user decision before dependent work;
- an independent review before integration;
- a local commit preserving a coherent checkpoint;
- a continuity boundary before transfer;
- a final release or launch decision.

Routine self-review and every Slice ending are not checkpoints.

### Route from evidence

- Clear defect with a supported remedy: return to the producer and correct it.
- Invalid implementation approach: re-establish the approach without reopening settled intent.
- Unsupported or repeatedly failing cause: diagnose before another patch.
- Unsettled outcome or compatibility: return the decision to the user.
- Missing evidence: establish or recover the observation instead of guessing a fix.
- Optional stronger claim without evidence: qualify or withdraw the claim.

Preserve unaffected work and contrary evidence.

### Supported Exit

A valid exit may be an answer, completion, wait, pause, handoff, deferment, controlled boundary, or stop. Completion requires evidence appropriate to the claim, self-review, resolved selected checkpoints, accurate task memory, and no hidden user-owned decision.

## Preserve memory with Track Work

Track Work maintains one ignored Working Record when losing task state could misalign continuation.

### Use a Working Record when

- the task spans several coherent Slices;
- decisions or constraints must survive context loss;
- evidence, blockers, partial effects, or failed approaches matter later;
- another session or person may continue the work;
- the next useful action depends on an ordered route.

A short disposable result does not need a record merely because work occurred.

### What a Working Record preserves

- current Goal and defining sources;
- settled, tentative, and open understanding;
- current direction and boundaries;
- one Current Slice and one next useful action;
- proposed Future Work;
- accepted Decisions and Checkpoints;
- completed, blocked, and abandoned Slice history;
- inert task-local Notes.

The canonical location is:

```text
.freeflow/tasks/task-NNN-<short-name>/record.md
```

### What it does not do

A Working Record is not:

- authority to execute its next action;
- a replacement for live source truth;
- a Spec or Plan;
- a transcript;
- routing runtime state;
- proof that recorded evidence remains current.

Only the user changes task state. Closing a Slice does not complete the task.

### Recovery after context loss

After compaction, clear, resume/navigation, transfer, or uncertain continuity, the agent reads the complete `full` record, including History and Notes, then reconciles it with current user direction, accepted artifacts, live files, and actual effects.

With intact context, a bounded `resume` view or targeted read is normally enough. Re-reading the complete record after every ordinary turn wastes context and does not make it more authoritative.

### Ask for task memory directly

Useful requests include:

```text
Track this as a multi-slice task and preserve the decisions, evidence limits,
and next useful action.
```

```text
Before continuing, recover the complete Working Record and reconcile it with
the current branch and my latest direction.
```

```text
Pause safely and prepare a handoff. Preserve partial effects and the exact
condition for resuming.
```

## Configure Freeflow

Freeflow uses layered settings. The exact available controls depend on the host.

### Shared repository activation

`.freeflow/config.json` is the required shared activation boundary. Minimal activation is:

```json
{}
```

Use `/setup-freeflow` to create or repair the supported repository configuration. Setup does not write instructions into `AGENTS.md`, `CLAUDE.md`, or other repository-owned host files.

### Personal override

`.freeflow/local.json` supplies per-checkout personal overrides. It cannot activate Freeflow by itself. An invalid existing personal layer fails closed rather than silently inheriting the shared layer.

On Pi:

```text
/freeflow settings
/freeflow settings local
```

edit personal settings.

### Shared settings

```text
/freeflow settings repo
```

edits shared repository configuration. Treat shared changes as team-facing behavior and review them accordingly.

### Session settings

```text
/freeflow settings session
```

manages temporary session enablement and optional-context settings. On a qualified native Pi host, it can also override complete Cognitive Routing profiles enabled for that session. Session profile overrides take precedence over personal and repository profiles without mutating either file.

Delegation mode has no session override.

### Effective precedence

For core and capability settings:

```text
host session enablement
-> personal override
-> repository value
-> built-in default
```

For Cognitive Routing profiles:

```text
session profile override
-> personal profile
-> repository profile
```

### Reload and idle boundaries

Configuration changes may require `/reload` before every prompt, skill, and tool surface reflects the same effective state. Profile changes, profile overrides, and routing resume require an idle host.

Configuration proves neither installation nor effective runtime delivery. Verify the target host through [Getting Started](getting-started.md).

## Use Tool Execution on native Pi

Tool Execution is experimental, opt-in, and currently unavailable on PiFlow. Start with captured-data reduction before enabling live local access:

```json
{
  "toolExecution": {
    "enabled": true,
    "capture": { "enabled": true },
    "programs": { "mode": "reduction" },
    "discovery": { "enabled": true },
    "accounting": { "enabled": true }
  }
}
```

Use a known direct operation for one call. Use `freeflow_tools` when the exact current operation revision or schema is missing. Use `freeflow_run` only for mechanical dependent work whose next steps are already determined, and explicitly `emit` the bounded value the model needs. A program does not replace semantic engineering judgment.

Enabling `workspace` selects a distinct local execution world. Writing additionally requires `workspace.write`. Custom integrations require an explicitly allowlisted cooperating adapter; arbitrary native or third-party tools remain on their ordinary Pi path. Captured files persist until explicit deletion, and unresolved mutations fence new live effects and clean completion instead of replaying.

Use:

```text
/freeflow status
/freeflow efficiency
/freeflow efficiency export
```

Efficiency reports separate provider and tool telemetry and label byte/accounting boundaries. They do not prove cache hits, billing savings or model quality. Read the full [Tool Execution reference](capabilities/tool-execution.md) before enabling live adapters or local writes.

## Choose a Cognitive Routing mode

Cognitive Routing is an experimental native-Pi capability. Read the complete [Cognitive Routing reference](capabilities/cognitive-routing.md) before relying on its recovery or evidence semantics.

| Mode | Positioning | Main execution route | Good starting use |
| --- | --- | --- | --- |
| `helper` | **Quality-first — maximum performance and output-quality potential** | Coordinator implements; Helper supplies bounded support. | Quality-sensitive work where preparation, checks, and follow-through can strengthen a strong Coordinator. |
| `executor` | **Savings-first — maximum savings potential** | Coordinator directs/assesses; Executor owns delegated environment work. | Work where a suitable lower-cost Executor can perform most execution without unacceptable rework. |
| `both` | **Balanced** | Helper handles routine support; Executor handles substantive or consequential results. | Mixed workloads where frequent support and substantive production benefit from different presets. |

These labels describe intended optimization direction and potential. They are not benchmark guarantees.

### Why the Helper preset matters

In Both mode, many routine assignments—source gathering, preparation, focused checks, task-memory maintenance, and separable follow-through—normally go to Helper. A comparatively economical but capable Helper can therefore account for a large share of potential savings.

Do not choose Helper by price alone. If it repeatedly misunderstands work, omits evidence, or causes Executor/Coordinator rework, total cost and latency can increase.

### Recommended OpenAI subscription starting presets

When these model families and thinking levels are available through the current OpenAI subscription-backed Pi provider, the following are practical starting points:

| Goal | Coordinator | Helper | Executor |
| --- | --- | --- | --- |
| General quality/cost balance | Astra `high` **or** Sol `xhigh` | Luna `max` | Sol `medium` |
| Astra cache-reuse-oriented route | Astra `xhigh` | Luna `max` | Astra `low` |

Rationale:

- **Luna `max` as Helper** aims to keep frequent routine support comparatively economical while retaining useful reasoning quality.
- **Sol `medium` as Executor** is a starting point for substantive execution where a moderate effort level may control cost.
- **Astra `high` or Sol `xhigh` as Coordinator** reserves stronger reasoning for direction, consequential choices, and assessment.
- **Astra `low` Executor plus Astra `xhigh` Coordinator** can use the qualified same-model effort-history route when the current provider/API/request shape supports it.

These are operating recommendations, not Freeflow requirements or benchmark results. Confirm exact model IDs, subscription access, supported effort levels, current pricing, and model suitability in Pi's current model registry and provider. Availability and economics can change. The Astra route does not guarantee provider cache eligibility or a cache hit, and Luna is not asserted to be universally cheapest across providers or pricing plans.

### Example generic configuration

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": false,
    "profiles": {
      "coordinator": {
        "provider": "provider-id",
        "model": "coordinator-model-id",
        "thinking": "high"
      },
      "helper": {
        "provider": "provider-id",
        "model": "helper-model-id",
        "thinking": "max"
      },
      "executor": {
        "provider": "provider-id",
        "model": "executor-model-id",
        "thinking": "medium"
      }
    }
  }
}
```

Coordinator must differ from every enabled worker as a complete provider/model/thinking pair. Helper and Executor may share a pair. Requested thinking levels must be supported exactly.

### Controls

```text
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

Manual profile control runs an unsplit Workflow. It does not create an automatic routing policy, grant task authority, or make that profile an independent reviewer.

## Understand Context status

### Current optional capabilities

On supported Pi/PiFlow paths, current optional capabilities include:

- **Context Virtualization:** changes future residency of consumed tool evidence while preserving canonical session history.
- **Conversation History:** performs bounded current-branch recovery of exact missing conversation evidence.
- **Tool Execution:** preserves exact captured tool evidence and permits only explicitly granted capture reads during attached recovery; it is compute/evidence infrastructure, not Context Control v2.

These are current, separately gated capabilities. They are not Context Control v2.

The current Cognitive Routing projection is not qualified together with the legacy Context Virtualization or Conversation History transforms. Keep routing projection disabled when using them with routing, or use them standalone according to the capability docs.

### Planned Context Control v2

Context Control is the planned product pillar for source-aware residency, representation, and bounded recovery across admitted context. It is in development and unavailable in this release.

No current Context Control v2 command, setting, or compatibility promise is published. Do not infer the future architecture from legacy capability names.

## Understand cache and cost claims

Freeflow can improve request stability and place work on different configured presets. These mechanisms affect potential cost; they do not guarantee savings.

### RequestHistory

Freeflow preserves compatible generated runtime-state and communication occurrences at their original positions and appends changed state later. This can reduce avoidable prefix churn. It never imports excluded evidence merely to manufacture a match.

### Astra effort history

For qualified `gpt-6-astra` OpenAI Responses or OpenAI-Codex Responses request shapes, Freeflow can preserve the request-level baseline effort and insert trusted historical effort updates at validated positions. Unsupported or uncertain requests use the untouched native request.

This establishes local request construction behavior at tested boundaries. It does not prove:

- a provider cache hit;
- billed-token savings;
- current pricing;
- equivalent support on another provider or API;
- better model output.

### Measure total cost per supported result

Include:

- uncached input;
- cache reads and writes when the provider reports them;
- output and separately reported reasoning;
- worker reports and routing overhead;
- retries, correction, and recovery;
- latency and user intervention;
- tool or auxiliary costs.

A cheaper request that causes repeated work can be more expensive overall. Missing telemetry is unknown, not zero.

## Troubleshooting

### Freeflow appears inactive

- Confirm `.freeflow/config.json` exists and is valid.
- Check whether `.freeflow/local.json` is invalid and failing closed.
- Reload or start a new session after installation/configuration changes.
- Verify host delivery using [Getting Started](getting-started.md).

### A skill is missing

Base skills require effective Freeflow activation and mandatory prompt availability. Optional capability skills appear only when their own gates are effective. A configured capability is not necessarily available on the current host.

### The agent asks before an action you expected

The action may expose a user-owned choice, source conflict, uncovered effect, or separately controlled boundary. Clarify the intended scope or authorize the exact next result; do not use a skill name to bypass the decision.

### The agent stops after a worker report

Under automatic Cognitive Routing, worker return ends the worker assignment but does not accept the result. Coordinator must assess it, and Track Work closure remains separate.

### A long task loses direction

Ask the agent to recover the complete Working Record, current assignment, and applicable live sources. If no record exists, reconstruct only what can be supported rather than treating a summary as exact history.

### A verification passed but completion remains open

The check may observe only part of the required claim, apply to an older candidate, or omit compatibility, artifact, consumer, or deployment boundaries. Ask what the check proves and what remains unobserved.

### Routing or a context capability is unavailable

Use `/freeflow status` and read the reported blocking reason. Do not copy another host's configuration, impersonate a profile, or enable an unqualified capability combination.

### A cost number looks unexpectedly high or low

Check whether it includes cached tokens, reasoning, worker requests, retries, recovery, and rebilled misses. Confirm the pricing/accounting source. Treat locally estimated tokens separately from provider-reported usage.

## Evidence and host limits

Freeflow documentation and deterministic checks can establish repository structure, prompt assembly, schemas, event transitions, package contents, and named fixture behavior. They do not automatically establish:

- native dispatch on every installed host;
- host trust or marketplace availability;
- universal model behavior;
- prompt-cache hits or billing reductions;
- independent review from routing profiles;
- Context Control v2 implementation;
- release publication or production deployment.

Keep claims at the boundary actually observed.

## Read next

- [Getting Started](getting-started.md)
- [Workflow](workflow.md)
- [Skill routing and dependencies](skill-routing.md)
- [Cognitive Routing](capabilities/cognitive-routing.md)
- [Tool Execution](capabilities/tool-execution.md)
- [Pi integration](integrations/pi.md)
- [Capabilities](capabilities/README.md)
- [Release process](release.md)
- [Release evidence](release-evidence/README.md)
