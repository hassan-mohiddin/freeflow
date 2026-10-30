# Freeflow

**A feedback-based control system for coding agents.**

Freeflow gives the coding agent you already use (Codex, Claude Code, Pi and others) what it needs at the moment it decides. On every host its prompts and skills work as a portable layer; on Pi a native extension adds the runtime parts.

- **A short method, always loaded.** One cycle: agree before building, build and verify, review and hand over. Each step checks what actually happened (a script's output, a test, your answer) before the next one, rather than trusting the plan.
- **Eleven capability skills** that bring scripts and structured artifacts, not just advice: a script that maps what a change touches, a self-review report, a decision list for your choices, a Working Record that survives context loss.
- **On Pi, a runtime** that pushes the right lines of a skill at the tool call that needs them, and adds compaction, tool handling, task memory and multi-model routing.

The agent keeps its own tools, permissions and execution. Freeflow does not grant permission, enforce a pipeline, or replace your repository's instructions, tests or review.

- **New to Freeflow?** Read [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md) and [How Freeflow Works](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/workflow.md).
- **Installing it?** Start with [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md).

## Why

Agents often act without opening the skill that describes the step they are taking. In Freeflow's own runs, the old Workflow and Action Selection skills were rarely opened, so their guidance rarely reached the work. Version 0.9.0 is built around that finding. The few rules that must always hold live in a short always-loaded prompt; each skill's description says when it applies; and the skills hand the agent facts and checks (script output, a list of choices, a review brief) instead of more prose to remember.

| What goes wrong | What Freeflow does |
| --- | --- |
| A question or tentative idea becomes an edit. | The Interaction Contract tells discussion apart from a request to act. |
| A request leaves choices open that the agent settles silently. | Before building, the agent sends what it will do, where it stops, and your decisions with its defaults, then waits; the hand-over shows any choice you have not seen. |
| A change misses a caller, a test or a doc. | Execute Work's `touch-map.mjs` lists what a change touches, and `self-review.mjs` reports every changed test and whether each requirement's check ran after the last edit. |
| A passing command becomes an unsupported completion claim. | Verify Work ties the claim to what the check actually observed. |
| Context loss erases decisions and partial work. | Track Work recovers the Working Record in one call and reconciles it with live state. |
| Risky changes ship without a second look. | Review Work's gate calls for an independent review when the change touches security, data, release files or a public interface. |
| Commits, pushes and releases happen without a clear yes. | Deliver Work handles each one within its own approval, and its scripts check state before acting. |

## How it works

```text
1. Agree             before the first edit on a task that builds or changes behavior:
                     what I'll do, where I stop, your decisions with defaults; wait
2. Build and verify  within the agreement; check on the path you will use
3. Review, hand over self-review; independent review when the gate calls for it;
                     report what done looks like against what was done
When evidence changes the picture, go back only to the step it affects.
```

A question gets an answer, an exact one-line edit gets made, and a large change gets the whole cycle. Only your request or a still-valid approval authorizes work; commit, push and release each need their own yes.

## Skills

| Skill | Use it when |
| --- | --- |
| Discuss Work | What to do or how is still open; agreeing before building; a choice mid-work; skipping an optional step |
| Execute Work | Implementing, fixing, refactoring, designing, finding why something fails, migrating |
| Verify Work | Checking whether work or a claim holds; setting up or rechecking saved live checks of your software |
| Review Work | Judging whether work or a document is fit to use, yours or another's |
| Deliver Work | Commit, push, merge or pull request, branch cleanup, release, deploy |
| Track Work | Task memory beyond the conversation: the Working Record, recovery, handoffs |
| Write Docs | Specs, plans, decision records, user and developer docs |
| Setup Freeflow | Activating Freeflow in a repository and checking delivery |
| Write Skill | Writing or revising a skill or other text an agent acts on |
| Evaluate Behavior | Testing or comparing how an agent behaves with a setup change |

Version 0.9.0 replaced twenty-five skills with these ten; removed names have no aliases. [What changed in 0.9.0](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/workflow.md#what-changed-in-090) says where each one went.

## Commands

Natural language works: the agent opens the skill whose description matches. A direct call helps when it makes the intended method clear. A skill is a method, not a permission.

Skill commands on Pi (Claude Code uses `/freeflow:<skill>`, Codex a skill mention):

```text
/discuss-work
/execute-work
/verify-work
/review-work
/deliver-work
/track-work
/write-docs
/research-work
```

Contributor calls:

```text
/setup-freeflow
/write-skill
/evaluate-behavior
```

Native Pi controls:

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
/freeflow compact
/freeflow task
/freeflow project
```

Profile changes and resume require an idle host. These commands do not prove installed-host delivery or authorize task work.

## Host support

| Host | Freeflow support | Pi capabilities |
| --- | --- | --- |
| Codex | Shared skills and Codex `SessionStart` hook | Not available |
| Claude Code | Shared skills and Claude Code `SessionStart` hook | Not available |
| Gemini CLI | Gemini extension, shared skills, and Gemini `SessionStart` hook | Not available |
| Cursor | Agent Plugins 1.0 skills plus Cursor-specific hook delivery | Not available |
| GitHub Copilot / VS Code | Agent Plugins 1.0 skills plus Copilot/VS Code hook delivery | Not available |
| Kiro | Agent Plugins 1.0 Power and shared skills | Not available; skills-only claim |
| OpenCode v2 | Canonical `skills/` through a documented project skill source | Not available; skills-only support |
| Hermes Agent | Agent Plugins 1.0 package and canonical skills | Not available; skills-only support |
| Pi | Shared skills and the native extension | Tool Execution and Compaction on by default; Task Memory, Messaging and Cognitive Routing opt-in |

Freeflow owns its prompts, skills, capability source, host adapters and the Pi extension. Each host owns launch, package installation, session state, trust and updates.

### Pi capabilities

| Capability | Status | What it does |
| --- | --- | --- |
| [Tool Execution](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/tool-execution.md) | Experimental; on by default | Working guidance, file tracking, clearer edit errors, `apply_patch`, background commands and monitors, and a skill's key lines at the tool call that needs them (`toolExecution.guidanceNotices`) |
| [Compaction](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/compaction.md) | Experimental; on by default | After the agent checkpoints its Working Record at a safe point, the task's bundle replaces the conversation; Pi's compaction stays the fallback |
| [Task Memory](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/task-memory.md) | Preview; off by default | Working Records attached to the session and delivered after context loss; projects and child tasks |
| [Messaging](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/messaging.md) | Preview; off by default | Messages between the agents in your Pi sessions on this machine |
| [Cognitive Routing](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/cognitive-routing.md) | Experimental; off by default | Coordinator, Helper and Executor profiles on different models in one session |

Native fixtures and live sessions exercise these capabilities; their effect on task results, cost and long real use is not yet measured. Freeflow's Pi extension also keeps request history cache-friendly and has a qualified effort-history route for `gpt-6-astra`, `gpt-6-luna` and `gpt-6-sol`; that is request-construction behavior, not proof of a provider cache hit or a billing reduction ([Pi cache reuse boundaries](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/pi.md#cache-reuse-boundaries)).

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

### Activate a repository

Run:

```text
/setup-freeflow
```

This creates the required shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. Optional `.freeflow/local.json` personal overrides cannot activate Freeflow alone. Configuration or installation alone does not establish runtime delivery; setup reports delivery as confirmed, unavailable or unconfirmed.

## Use Freeflow effectively

A clear prompt for consequential work names:

```text
Outcome: what should be true?
Scope: what may change?
Exclusions: what must not happen?
Sources and constraints: what governs?
Evidence: what should support the result?
User-owned choices: what must come back to me?
Stop and return: where should the agent stop?
```

Natural language is preferred. Answer the agent's agreement with "go" to accept its defaults, or correct the line you disagree with. Read [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md) for prompt examples, steering the agreement, Track Work, settings, Cognitive Routing modes and presets, cache and cost boundaries, and troubleshooting.

## Evidence and limits

Freeflow is explicit about what observations prove:

- deterministic checks can establish source structure, prompt assembly, schemas, package boundaries, and named fixtures;
- package shape does not prove native host dispatch, trust UI, or marketplace availability;
- request-prefix compatibility does not prove a provider cache hit;
- model/profile availability does not prove quality or cost improvement;
- local release preparation is not publication;
- publication is not production deployment.

## Documentation

- [Using Freeflow Effectively](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/using-freeflow.md)
- [How Freeflow Works](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/workflow.md)
- [Getting Started](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/getting-started.md)
- [Settings](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/settings.md)
- [Capabilities](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/capabilities/README.md)
- [Pi integration](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/integrations/pi.md)
- [Architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/dev-docs/README.md)
- [System prompt architecture](https://github.com/hassan-mohiddin/freeflow/blob/main/dev-docs/subsystems/prompt-assembly.md)
- [Skill routing](https://github.com/hassan-mohiddin/freeflow/blob/main/dev-docs/subsystems/skill-routing.md)
- [Release process](https://github.com/hassan-mohiddin/freeflow/blob/main/dev-docs/guides/release.md)
- [Release evidence](https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/release-evidence/README.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

For local Pi extension development, refresh a development snapshot only from a committed Freeflow revision with `npm run snapshot:refresh`. A snapshot is not a production install or release.

## What Freeflow is not

- Not a new agent or workflow engine.
- Not a rigid phase pipeline.
- Not a permission or enforcement framework.
- Not a replacement for repository instructions, tests, policies, or review culture.
- Not proof that a configured model, cache path, or candidate is behaviorally ready.

## License

MIT License. Copyright (c) 2026 Hassan Mohiddin.
