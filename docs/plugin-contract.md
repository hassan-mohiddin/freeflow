# Freeflow Plugin Contract

## Purpose

Freeflow is a portable feedback-based control system for coding agents. It supplies interaction guidance, workflow routing, focused methods, task memory, and evidence discipline without replacing the host agent or repository source truth.

The plugin must remain useful without requiring every available artifact, checkpoint, skill, or lifecycle boundary.

## Non-Goals

Freeflow does not:

- become a new agent or rigid state machine;
- infer mutation from questions, criticism, examples, or tentative ideas;
- make user-owned product or risk decisions silently;
- require Specs, Plans, commits, reviews, or handoffs for every task;
- treat Working Records, Plans, reviews, or handoffs as authority over live evidence;
- use independent review as continuous supervision;
- add enforcement hooks before measured failures justify them;
- copy generated Freeflow instructions into repository-owned host files.

## Modes

Freeflow has exactly three modes:

- `conversation`: read-only discussion and exploration;
- `workflow`: default consequential or mutating work;
- `strict-workflow`: stronger decision, evidence, and checkpoint pressure for high-risk or hard-to-reverse boundaries.

Mode changes do not authorize work. Task type and direct skill calls do not switch mode. Host permission modes remain separate.

## Interaction And Authority

`capabilities/interaction-contract/interaction-contract.md` owns compact interpretation of the whole user turn:

- answer questions without inferring action;
- treat tentative ideas as discussion;
- use evidence and correct mistaken assumptions;
- recommend brief discussion when collaboration has material decision value;
- choose reversible local details when no owner decision remains.

Decision Gate owns one blocking user decision, source conflict, or material path change. Discuss owns open direction and alternatives. Workflow owns routing.

Review findings, recommendations, Working Records, Specs, Plans, and Handoffs do not silently authorize mutation. Preserve explicit authority sources and ask only when required authority is absent or the route materially changed.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. `.freeflow/local.json` is optional per-checkout personal core configuration and cannot activate Freeflow alone.

```text
host session mode override
-> personal core override
-> repository value
-> built-in default
```

Pi session overrides for Freeflow master enablement, Interaction Contract, Skills, and mode live in branch-aware session JSONL. Claude and Codex mode overrides live in plugin-owned state keyed by host session ID. Session state does not mutate config files or bypass missing or invalid repository activation. An invalid existing personal layer blocks effective runtime. Interaction Contract and Skills resolve as independent switches. Mode remains resolved but dormant when Skills are ineffective.

Pi-owned Output Router configuration remains in shared config but does not enter Codex or Claude discovery or lifecycle context.

## Runtime Delivery

When effective, host adapters deliver:

- `capabilities/interaction-contract/interaction-contract.md` for compact turn guidance;
- `skills/workflow/SKILL.md` once per context epoch while Skills are effective;
- compact active or dormant mode state.

Mode Contract and other workflow skills remain on demand. The Interaction Contract is the only compact interaction-guidance artifact.

Pi appends compact state and Interaction Contract guidance before agent turns and stores Workflow as one hidden persistent session message. Codex and Claude use one packaged runtime hook: `SessionStart` restores complete enabled context at supported start, resume, clear, and compact boundaries; `UserPromptSubmit` emits only for explicit session-mode controls. Both paths exclude Pi-only capabilities.

Activation does not prove delivery. Setup reports confirmed, unavailable, or unconfirmed delivery and distinguishes same-turn direct reads from automatic lifecycle execution.

Runtime guidance does not enforce policy, block tools, grant permissions, or replace repository instructions.

## Interaction Lifecycle

Workflow uses a directed Interaction Lifecycle with an internal Feedback Loop:

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

The Feedback Loop applies to every bounded activity: it orients to accepted intent and live evidence, uses the narrowest owner, verifies the result, self-reviews the initially supported state before accepting or reusing it, and routes from evidence. Re-enter only the owner whose responsibility changed.

Supported Exits include answer, wait, pause, handoff, deferment, stop, controlled preservation, and completion.

## Skill Ownership

Workflow owns routing. Leaf skills own focused methods. Method and domain skills compose without redefining authority or the lifecycle.

The typed public adjacency map lives in `plugin-docs/skill-routing.md`. It distinguishes owners, sibling routes/composition, references, and optional capability delivery.

The cross-host model surface contains 25 active model/contributor skill packages. The Pi package separately contains Output Router under `capabilities/`; Codex and Claude do not discover or receive it. Retired Delegation Harness material lives under `.deprecated/delegation-harness/` outside the package.

## Artifact Contract

Artifacts exist to preserve stable content or continuity, not to prove process compliance.

- Working Record: living task state and history;
- Spec: stable accepted content;
- Plan: stable ordered strategy;
- ADR: surprising hard-to-reverse repository decision;
- Handoff: point-in-time transfer.

Specs and Plans receive separate independent Review Artifact boundaries. Working Records do not by default. A Plan is not a rolling progress log; evolving execution belongs in Track Work.

## Slice Contract

A slice is one coherent Learning, Delivery, or Deepening result. It may span several Feedback Loop iterations, reviews, corrections, and checkpoints while the intended result stays coherent.

Before expanded work begins, record whether it extends the current slice or needs a distinct result, authority source, or evidence boundary. Preserve the original scope and append the accepted extension write-ahead.

Routine in-slice feedback is not checkpoint history. Record feedback only when it changes scope, a decision, route, blocker, or final evidence.

## Verification And Review

The active agent owns factual verification. Self-review is silent and follows supported verification.

Independent review is separately selected judgment from a context that did not produce the reviewed state. It reports without editing. The active agent adjudicates.

Valid review exits are Pass, Non-blocking, Inconclusive, and Blocking. A review does not continue until Pass.

Findings do not authorize edits. When correction authority is absent, ask once for accepted corrections plus any warranted focused follow-up review, or corrections alone. Review budgets are caps, not dispatch authorization.

Corrections leave review and return to Execute Work or the artifact owner. They may remain in the same coherent Working Record slice.

## Continuity Contract

Before an expected context boundary, Track Work reconciles changed task state. After compaction, summarization, clear, resume, or session navigation, Workflow requests the bounded `resume` view before continuing task work and retrieves exact history only when needed.

A record written by another conversation branch is memory, not authority. Compare it with the current conversation and live repository state before acting.

## Controlled Operations

Plan approval may authorize listed work, checks, reviews, Working Record maintenance, and local commits. It does not authorize push, integration, migration, deprecation, release, launch, or destructive cleanup unless those stages are separately explicit.

Commit Work does not own review adjudication. Bypass does not change authority, mode, evidence, selected review, or completion requirements.

## Command Surface

Natural language is preferred. Pi registers canonical direct skill calls from `command-surface.json`, plus `/discover` and `/execute-plan` as Pi-only compatibility aliases to `/discuss` and `/execute-work`.

Freeflow uses host-native skill invocation rather than duplicate manifest command handlers. Claude exposes plugin skills as namespaced slash commands such as `/freeflow:discuss`; Codex exposes them through `/skills` and `$discuss`; Pi exposes registered commands. Direct skill calls select a method. They do not authorize mutation or create independent context.

Session mode controls are host-managed and take effect before the model acts:

```text
Pi:     /freeflow mode conversation | workflow | strict-workflow | reset
Claude: /freeflow:mode-contract conversation | workflow | strict-workflow | reset
Codex:  $mode-contract conversation | workflow | strict-workflow | reset
```

Clear natural-language session-mode instructions use the same control. Questions, examples, hypotheses, tentative language, task shape, and ordinary skill calls do not switch mode. Session controls do not edit configured defaults.

A configured-default request must name its layer: local/personal targets `.freeflow/local.json`; repository/shared/team targets `.freeflow/config.json`. An unqualified default request requires one direct scope question. “Global” is not a Freeflow layer.

Contributor calls remain:

```text
/setup-freeflow
/write-skill
/evaluate-skill
```

## Evidence And Readiness

Static validation proves structure, not behavior. Runtime tests prove only their observed delivery boundary. Historical v0.1 skill reports do not establish readiness for the current adaptive candidate.

Readiness claims belong in eval artifacts, reports, release/current-state metadata, Working Records, tool results, or delivery responses—not inside subject `SKILL.md` files.

The current candidate remains Unverified until fixed baseline-vs-with-skill evidence supports its claimed activation, first-read behavior, composition, retained use, artifact outcomes, and named hosts.

## Enforcement

Context-loading hooks are shipped. Enforcement hooks and CLI policy remain deferred until a repeated concrete failure survives concise skill correction and behavioral evaluation.
