# Using Freeflow Effectively

Freeflow helps a coding agent interpret intent, choose the right kind of work, preserve task continuity, place compute deliberately, and stop with evidence. It is a workflow layer for the active agent—not a replacement agent, permission system, task tracker, or rigid phase pipeline.

This guide is for users who want better results from Freeflow without learning its internal implementation. For installation and host verification, start with [Getting Started](getting-started.md). For exact capability behavior, follow the linked reference pages.

## The practical model

Freeflow is a feedback-based control system for coding agents: each step checks what actually happened (a script's output, a test, your answer) before the next one, rather than trusting the plan. It has three parts:

| Part | What it gives the agent | Where |
| --- | --- | --- |
| **The cycle** | Agree before building, build and verify, review and hand over, in a short always-loaded prompt with the Interaction Contract and the Working Method. | Every host where Freeflow delivers its prompts. |
| **Eleven skills** | One per capability: discussing and agreeing, executing, verifying, reviewing, delivering, task memory, documents, research, and a few for contributors. Each brings references for less common situations and scripts that gather the facts a decision needs. | Every host. |
| **Pi capabilities** | Tool Execution (including skill guidance at the tool call that needs it), Compaction, Messaging and Cognitive Routing. | Native Pi. |

[How Freeflow Works](workflow.md) describes the cycle, the agreement and every skill.

### What Freeflow does

- distinguishes a question or tentative idea from authorization to act;
- establishes the requested outcome, scope, and return boundary;
- agrees the work and lists your choices, with defaults, before it builds;
- scales the process to the work: a question gets an answer, a large change the whole cycle;
- routes from evidence instead of blindly continuing a stale plan;
- preserves durable task memory when continuity matters;
- separates factual verification from judgment and independent review;
- keeps commit, integration, release, and launch as controlled boundaries;
- optionally places compute across configured profiles on a qualified native Pi host;
- optionally adds a layer over Pi's tools (working guidance, file tracking, clearer edit errors, `apply_patch`, background commands) through Tool Execution;
- lets the agent compact a long session itself at a safe point, with Pi's compaction as the fallback.

### What Freeflow does not do

- grant permission because a skill or tool exists;
- turn every task into a fixed sequence of documents and reviews;
- make a passing command prove more than it observed;
- make profile switching an independent review;
- guarantee lower cost, better model output, or provider cache hits;
- make Cognitive Routing or Tool Execution available on every host;
- replace Pi's own tools, permissions, or compaction.

## Start here

1. [Install and activate Freeflow](getting-started.md).
2. Verify that your host actually delivered the expected skills and runtime context.
3. Give the agent a clear outcome and return boundary.
4. Answer the agreement the agent sends before building: "go" accepts its defaults, or correct the line you disagree with.
5. Let the agent open the skill that fits; invoke one directly only when it helps communicate intent.
6. Ask for evidence at the boundary that matters.
7. Use Track Work for multi-slice or long-running tasks.
8. On native Pi, optionally configure Cognitive Routing once the ordinary cycle is familiar.

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

This normally goes through Discuss Work, with bounded investigation where evidence is needed.

### Implementation and verification

```text
Implement request cancellation for the upload client. Preserve the public
method signatures and existing retry behavior. Add focused tests that can
fail if cancellation still leaks a request. Run the relevant suite and return
with changed paths, evidence, and remaining limits. Do not commit or push.
```

Before the first edit the agent sends its agreement (what it will do, where it stops, and your decisions with its defaults) and waits. Once you answer, the request covers preparation, edits, focused checks, correction, and self-review. It does not cover commit or delivery unless stated.

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

Freeflow skills are focused methods. Each skill's description says when it applies, and the agent opens the one that fits the actual question or result. A linked skill does not run automatically, and loading a skill does not authorize an effect.

| Need | Command | What it covers |
| --- | --- | --- |
| Explore goals, alternatives or approach; agree before building | `/discuss-work` | Direction, learning actions, the agreement and decision list, choices mid-work, skipping an optional step |
| Implement agreed work | `/execute-work` | Implementation, design, simplification, diagnosing an unknown cause, migration, and the self-review report |
| Establish what a check proves | `/verify-work` | Factual support at the required observer boundary, and changes to existing tests |
| Judge work or a document | `/review-work` | Self-review, the review gate, and independent review when selected |
| Commit, push, merge, release or deploy | `/deliver-work` | Each delivery step within its own yes, with one stop list and report |
| Preserve long-running task state | `/track-work` | Working Record creation, recovery, Slices, decisions, checkpoints and handoffs |
| Write a spec, plan, decision record or docs | `/write-docs` | Specs and Plans that decide work, decision records, and user and developer docs kept true as the code changes |

[How Freeflow Works](workflow.md#skills) lists all eleven skills, including the contributor ones, and the scripts they run. The 0.9.0 skills replaced twenty-five earlier ones; [What changed in 0.9.0](workflow.md#what-changed-in-090) says where each removed name went.

### Natural language first

These are equivalent in intent:

```text
Please diagnose why this test is flaky before proposing a fix.
```

```text
/execute-work Why is this test flaky?
```

Use direct invocation when it removes ambiguity. Do not chain skill names into a mandatory pipeline such as “discuss, spec, plan, execute, review” unless the task actually needs those artifacts and boundaries.

### Do not use a skill to manufacture authority

A plan can describe a release, but it does not authorize publication. A review can identify a correction, but it does not authorize editing. A Working Record can preserve the next action, but it does not grant permission to perform it.

## Steer the work

Freeflow runs one cycle: agree, build and verify, review and hand over. [How Freeflow Works](workflow.md) describes it in full.

### The agreement

Before the first edit on a task that builds or changes behavior, the agent sends one message: what it will do, where it stops, and your decisions, each with its default and why. "Go" accepts every default; a correction changes only the line it names. A question, an exactly specified change, or a run where no one can answer needs no agreement; the agent then takes its defaults and lists them at the end.

A choice that comes up during the work stops it only when the work cannot go on without your answer. On Pi the agent can put that choice to you in a dialog and continue on your answer; see [Questions in a dialog](integrations/pi.md#questions-in-a-dialog). At the end, the hand-over shows the choices you have not seen.

You can ask the agent to skip an optional step, such as waiting for the agreement, a plan, a review or a record; it skips only that, and still asks before a hard-to-reverse choice.

### Which skill does the work

The agent opens the skill whose description fits the next result: Discuss Work while what or how is open, Execute Work for agreed changes (including finding why something fails), Verify Work for a factual claim, Review Work for judgment, Deliver Work for commit, push, merge, release or deploy, Track Work for task memory, Write Docs for documents. Cognitive Routing changes which model profile does the work; it does not change the skill or who decides.

### Slices

A Slice is one coherent learning, delivery, or deepening result that can be executed and checked as a unit. It is not a file batch, phase name, test run, or routing assignment.

Use separate Slices when dependencies, uncertainty, outcome boundaries, or working-set size make one attempt unreliable. Keep implementation, its focused checks, and accepted local correction in the same Slice while the intended result and evidence boundary remain coherent.

### Return points

The work agreement names where the work comes back to you: its return points, such as "Back at the pull request" or "Ask first: merging". The agent proposes one only where it protects a meaningful boundary, such as:

- a decision of yours before dependent work;
- an independent review before integration;
- a commit, push or pull request;
- a transfer to another session or person;
- a final release or launch decision.

Routine self-review and every Slice ending are not return points.

### Route from evidence

- Clear defect with a supported remedy: return to the producer and correct it.
- Invalid implementation approach: re-establish the approach without reopening settled intent.
- Unsupported or repeatedly failing cause: diagnose before another patch.
- Unsettled outcome or compatibility: return the decision to the user.
- Missing evidence: establish or recover the observation instead of guessing a fix.
- Optional stronger claim without evidence: qualify or withdraw the claim.

Preserve unaffected work and contrary evidence.

### Supported Exit

A valid exit may be an answer, completion, wait, pause, handoff, deferment, controlled boundary, or stop. Completion requires evidence appropriate to the claim, self-review, resolved return points, accurate task memory, and no hidden user-owned decision.

## Preserve memory with Track Work

Track Work keeps a Working Record for a task whose work will outlast the current compaction cycle (from a session's start or a compaction to the next compaction), or whose decisions, route or partial state would misdirect the next session if they were lost. The record is the agent's memory, kept through Track Work's script; it is not authority.

### Use a Working Record when

- the work will outlast this compaction cycle: `working-record.mjs estimate` compares the context used so far with the work left;
- decisions or constraints must survive context loss;
- evidence, blockers, partial effects, or failed approaches matter later;
- another session or person may continue the work;
- the next action depends on an ordered route.

A question or a short self-contained result needs no record. The agent creates a task only when you ask for one or answer its question, whose choices are a task in the project the work belongs to, a task in no project, or no task.

### Where tasks live

Every task's memory lives in the Freeflow store: one private Git repository at `FREEFLOW_HOME` (`~/.freeflow` by default), which Setup Freeflow makes. It is local by default, on this device only. Add your own private repository as its remote and it becomes a cloud store, kept in step on every device; a cloud session needs one, since its container is thrown away. Tasks sit in projects, or in none:

```text
~/.freeflow/projects/<project>/tasks/task-NNN-<short-name>/
~/.freeflow/tasks/task-NNN-<short-name>/
```

The store writes nothing into your code repositories, and only Track Work's script commits and syncs it. If you choose not to make a store, a task's folder goes in the repository's Git-ignored `.freeflow/tasks/` instead.

A session holds at most one task, and a task has one holder at a time. Where Freeflow runs inside the host (on Claude Code, through its mod, and on Pi), a session starts with a task menu: the open tasks of the project whose tasks name this repository, followed by your rules from the store's `rules/` and that project's `rules/`, so they hold before any task is taken. The agent takes only the task your message points to, asks when it could be more than one, and asks before taking over a task another session holds.

### What a task folder keeps

- `record.md`: the Goal, what is settled and what is still open; the work agreement in your words, with its return points; the current Slice; work handed to other agents; where each repository stands; where the step in progress stands; what recovery must read; the next action; and the proposed route.
- `history.md`: one entry per closed Slice, agreement or delegation, each with a cue saying when it matters, and what each Slice used: its context and the compaction cycles it touched and, where the host's transcript can be read (on Claude Code), its time and its cost at API list price by model and effort.
- `decisions.md`: the open agreement's decision list.
- `sessions.md`: every session that held the task.
- `sources/discussion.md`: your messages that shaped the work, word for word.

The memory the agent shapes has a recovery budget that grows with the context window; when a task's memory keeps running over, the agent may propose expanded mode, which only you turn on. `working-record.mjs estimate --plan` sizes the work left from what past Slices used, and the work agreement can show it: how many compaction cycles, and the cost at list price.

### What it does not do

A Working Record is not:

- authority to execute its next action;
- a replacement for live source truth;
- a Spec or Plan;
- a transcript;
- routing runtime state;
- proof that recorded evidence remains current.

Only the user changes task state. Closing a Slice does not complete the task.

### Before a compaction, and after

Freeflow's notice comes once each compaction cycle, before the host's own compaction would start. The agent works on to a safe point, checkpoints the record with `--compact` and ends its turn. On Claude Code (2.1.287 or later), Freeflow then compacts the session itself, with the record and everything recovery reads in place of the conversation, and starts the next turn. It compacts only when the agent asks this way, so a checkpoint before a pause or a switch keeps the conversation, and the agent may ask earlier, at a point where the conversation holds mostly finished work. Where the host compacts on its own, Freeflow adds the record as of the last checkpoint after the host's summary where it can; otherwise, and after a clear or a transfer to another session, the agent recovers with `working-record.mjs view recover` and reads every source it lists. Either way it reconciles the record with your latest direction and the live state before acting, and says in one line what it read.

While the conversation about the work is still in context, including after a new message, a pause or a resumed session, re-reading the record wastes context and does not make it more authoritative.

### Ask for task memory directly

Useful requests include:

```text
Keep a task for this; it will take several compaction cycles. Preserve the
decisions, evidence limits and next action.
```

```text
Before you send the agreement, show me how many compaction cycles the plan
takes and what it costs at list price.
```

```text
Before continuing, recover the Working Record and reconcile it with the
current branch and my latest direction.
```

```text
Pause safely and prepare a handoff. Preserve partial effects and the exact
condition for resuming.
```

### Tasks on Pi

On native Pi, tasks live in the same Freeflow store as on Claude Code. There is no picker: a session starts with the task menu, and you choose by talking to the agent, naming the task your message means or saying that the work needs none. Then:

- **The held task shows in the footer**, as `freeflow: task <ID>`, for as long as the session holds it.
- **`/freeflow status` has a `store:` line** with the store's folder, the task the session holds or that none is held, and whether changes wait to be synced; or, when the store is not ready, what is missing.
- **Compaction works as on Claude Code.** At a safe point the agent checkpoints the task with `--compact`, and Freeflow replaces the conversation with the task's bundle; see [Before a compaction, and after](#before-a-compaction-and-after).

Pi's former Task Memory is gone, and so are its `/freeflow task`, `/freeflow project` and `/freeflow trash` commands and its `taskMemory` settings: a configuration that still sets `taskMemory` loads and ignores it, and `/freeflow status` says so. Records you kept under Pi's former Task Memory move into the store through Setup Freeflow, as described in [Getting Started](getting-started.md#set-up-task-memory); the originals stay where they are. Tasks in a project are in the store's `projects/<project>/tasks/`, so a task outlives the worktree it was made in. With Messaging on, `list_sessions` shows the task each Pi session holds in the store and its project.

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

manages temporary session enablement and optional-context settings. On a qualified native Pi host, it can also override the Cognitive Routing delegation mode (`executor`, `helper`, or `both`) and complete Coordinator, Helper, and Executor presets. Set a missing worker preset before enabling that worker's mode. Session overrides take precedence over personal and repository settings without mutating either file; reset or inherit restores the configured values. The footer shows the active profile, automatic/manual control, and delegation mode.

### Runtime prompts and skills

On every host Freeflow delivers three runtime prompts: the core guidance, the Interaction Contract, and the Working Method. Each is on unless you turn it off, in `.freeflow/config.json` for everyone or `.freeflow/local.json` for yourself:

```json
{
  "prompts": { "core": true, "interactionContract": true, "workingMethod": false }
}
```

The personal file overrides the shared one prompt by prompt. With all three off, Freeflow delivers none of them; its skills stay available. On Pi, `/freeflow settings` has the same switches: Runtime prompts and Skills are each a switch for the whole set, with one row under each opening a switch per item, in the Session, Personal and Repository scopes.

`skills` turns a skill off the same way, such as `{ "skills": { "write-skill": false } }`, and `"enabled": false` in either object turns all of them off; Setup Freeflow always stays. On Pi an off skill is not loaded. Other hosts load plugin skills themselves, so there the agent is told not to use it. See [Settings](settings.md#all-settings).

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

Tool Execution is experimental and on by default. Turn it off in `/freeflow settings` or with:

```json
{
  "toolExecution": { "enabled": false }
}
```

It keeps Pi's `read`, `bash`, `edit`, `write`, `grep`, `find` and codemode, and adds guidance on searching, reading and running commands narrowly; notices when files the model read change behind it; edit errors that show the closest lines; `apply_patch` for GPT models; `bash_background` / `stop_background` for servers, watchers and long commands, with a notice when they exit; and `monitor`, which tells the agent each line a command prints, so it can react to a log or watcher while it runs. Ask the agent to run a long command in the background when you want to keep working while it runs, or to watch one when it should react while you are away. See [Tool Execution](capabilities/tool-execution.md).

## Long sessions and compaction

On native Pi, Freeflow compaction is on by default. As the context nears the model's window, Freeflow tells the agent once; at a safe point it checkpoints its task's Working Record with Track Work's `checkpoint --compact` (or, with no task, writes a session summary), and Freeflow replaces the conversation with the task's bundle and continues the same run. Pi's own compaction stays on as the fallback. Run `/freeflow compact` to ask for it now, and `/freeflow status` to see the cycle and how close the context is to the notice. See [Compaction](capabilities/compaction.md).

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
| Selected GPT-6 effort-history route | Astra `xhigh` | Luna `max` | Astra `low` |

Rationale:

- **Luna `max` as Helper** aims to keep frequent routine support comparatively economical while retaining useful reasoning quality.
- **Sol `medium` as Executor** is a starting point for substantive execution where a moderate effort level may control cost.
- **Astra `high` or Sol `xhigh` as Coordinator** reserves stronger reasoning for direction, consequential choices, and assessment.
- **The same selected model at different efforts** can use the qualified effort-history route when the current provider/API/request shape supports it. Supported model IDs are `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol`; the example above uses Astra.

These are operating recommendations, not Freeflow requirements or benchmark results. Confirm exact model IDs, subscription access, supported effort levels, current pricing, and model suitability in Pi's current model registry and provider. Availability and economics can change. The selected-model route does not guarantee provider cache eligibility or a cache hit, and Luna is not asserted to be universally cheapest across providers or pricing plans.

### Example generic configuration

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "delegation": "both",
    "projection": true,
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

Manual profile control runs all work, unsplit, in one profile. It does not create an automatic routing policy, grant task authority, or make that profile an independent reviewer.

## Removed context features

The former Freeflow Context tool (`freeflow_context`), Context Virtualization, and Conversation History were removed in a breaking change. Their source, guidance, tests, and evaluation definitions are preserved in the [legacy context archive](../.deprecated/legacy-context/README.md), not as current runtime guidance. Delete `contextVirtualization` and `conversationHistory` from `.freeflow/config.json` and `.freeflow/local.json` wherever present; either key makes that config invalid and prevents Freeflow activation until removed.

## Understand cache and cost claims

Freeflow can improve request stability and place work on different configured presets. These mechanisms affect potential cost; they do not guarantee savings.

### RequestHistory

Freeflow preserves compatible generated runtime-state and communication occurrences at their original positions and appends changed state later. This can reduce avoidable prefix churn. It never imports excluded evidence merely to manufacture a match.

### Selected GPT-6 effort history

For qualified `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol` OpenAI Responses or OpenAI-Codex Responses request shapes, Freeflow can preserve the request-level baseline effort and insert trusted historical effort updates at validated positions. Unsupported or uncertain requests use the untouched native request. The adapter writes `freeflow-openai-effort-v1`; prior `freeflow-astra-effort-v1` entries are not replayed or migrated, and the next supported request starts a fresh effort chain.

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

Ask the agent to recover the Working Record, current assignment, and applicable live sources. If no record exists, reconstruct only what can be supported rather than treating a summary as exact history.

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
- release publication or production deployment.

Keep claims at the boundary actually observed.

## Read next

- [Getting Started](getting-started.md)
- [How Freeflow Works](workflow.md)
- [Skill routing and dependencies](../dev-docs/subsystems/skill-routing.md)
- [Cognitive Routing](capabilities/cognitive-routing.md)
- [Tool Execution](capabilities/tool-execution.md)
- [Pi integration](integrations/pi.md)
- [Capabilities](capabilities/README.md)
- [Release process](../dev-docs/guides/release.md)
- [Release evidence](release-evidence/README.md)
