---
name: discover
description: Use before the first answer or repo/code exploration when the user is shaping an idea, feature, tool/API surface, runtime behavior, architecture direction, vague task, bug-like unknown, or consequential hypothesis/question before spec, plan, build, or durable memory. Trigger especially on "should we", "why not", "what do you think", or design questions.
---

# Discover

Discover is the context-building loop before action: evidence-guided discussion that finds the next high-leverage decision and ends in a checkpoint.

If this skill matches, load it before the first repo search, code read, web lookup, command, design answer, or artifact. Direct questions still use discovery-light: inspect the smallest relevant evidence, then answer directly.

Priority: Interview Gate stops silent decisions and user-owned decisions first. Discover handles context-building after no immediate stop condition remains. Output Router only chooses evidence transport after the workflow/discovery route is clear.

Do not turn discovery into a questionnaire, a report by default, or a decision-capture script. The hard part is shared understanding, not filling an artifact.

For short-lived work, keep the checkpoint in chat. When it must guide later work, save it in the narrowest owning artifact: spec, plan, handoff, decision note, ADR, domain memory, or discovery note.

Goal: enough evidence and shared understanding to route to spec, plan, more discovery, durable memory, build, or stop without inventing product, domain, scope, public API, security, privacy, billing, data-loss, compatibility, or architecture decisions.

Hard stop: do not satisfy requests for “every question,” “grill me,” “25-50 questions,” or recommended answers for each question. That creates an approval script. Inspect evidence, name the decision tree, and ask the next one or two path-changing questions instead.

## Evidence Before Questions

Inspect first when the answer is discoverable:

- code, tests, docs, ADRs, specs, policies, issues, logs, traces, or current repo state;
- provided files, URLs, screenshots, transcripts, or user context;
- current external docs or web sources when framework/library facts, ecosystem behavior, or recent changes matter.

Ask before inspecting only when multiple targets would change the discovery path or when access/scope is user-owned.

For a direct question, keep the loop light:

```text
question -> inspect smallest relevant evidence -> answer directly
```

No artifact, plan, or checkpoint is required unless the answer changes future consequential work.

## Design Pressure

Use `../design-for-depth/SKILL.md` when discovery shapes modules, interfaces, seams, adapters, architecture direction, growing scope, codebase exploration, or repeated review/execution churn.

Do not decide architecture up front just because the lens is active. Use it to notice whether complexity is being hidden behind useful interfaces or spread across callers, tests, docs, artifacts, and future agents.

Use the deletion test on questions and decisions: if skipping it makes complexity spread downstream, it matters. If skipping it makes complexity vanish, it was ceremony.

## Scope Framing

Preserve the user's intended scope. Do not silently turn a large idea into `v1`/`v2`, MVP, release, or roadmap framing.

Use implementation slices, implementation phases, checklists, or multiple artifacts to make large work understandable and executable without changing what the user asked for.

Versioned shipping is a product/scope decision. Use it only when the user asks for release planning, the source context already uses that framing, or you have named why release boundaries matter and the user agrees.

If the full scope is too large for one safe pass, say that directly. Recommend implementation slices or artifact splits first; recommend versioned releases only when that is the user's actual problem.

## Loop

1. Identify the target: repo area, artifact, URL, product, model, package, paper, issue, symptom, or idea. If multiple plausible targets would change discovery, ask for the source.
2. Inspect the smallest evidence that can change the current route.
3. Explain the current understanding in plain language.
4. Brainstorm or compare paths when the direction is still forming; do not force a decision too early.
5. Ask one path-changing question when the answer would change the next artifact or action.
6. Let the user challenge, counter-question, or add constraints. Treat that as discovery input, not interruption.
7. Refresh evidence when new claims, conflicts, or branches appear.
8. Track decisions as settled, tentative, or open.
9. Stop when remaining ambiguity would not change the next route.

Discovery may move through evidence, brainstorming, targeted questioning, design, and checkpointing in any order. Do not force a fixed sequence when the evidence or conversation needs a loop.

## Final Question Pass

Before routing from discovery to `write-spec`, run a final ambiguity sweep.

Trigger it when:

- the user asks to write the spec;
- the user says brainstorming, discovery, or discussion feels complete;
- the user asks to move to the next phase;
- you are about to close discovery with `Next: Forward — write-spec`.

Ask the smallest set of remaining path-changing questions whose answers would affect spec scope, product behavior, acceptance, public API, architecture, security, privacy, billing, data-loss, compatibility, or artifact destination.

If meaningful ambiguity remains, route with `Next: Forward — final question pass before write-spec` and ask those questions. If no meaningful questions remain, say so and route to `write-spec`.

Do not use this while brainstorming, research, or comparison is still active. Do not turn it into a long questionnaire or recommendation approval script.

## Question Discipline

Prefer deeper questions over more questions. Ask as many as the situation needs, but each question should earn its place.

Before asking, run the deletion test:

```text
If I do not ask this, does downstream complexity spread?
```

If no, skip it.

Bad question:

```text
Should the button be blue or green?
```

when the feature purpose is still unclear.

Good question:

```text
Is this for one workflow or many workflows?
```

because it changes the module interface, spec shape, and test surface.

Long question chains are a failure mode, not diligence. Never number out a long list just because the user asked for one.

Do not turn recommendations into an approval script. Recommendations should clarify tradeoffs, not make it easy to rubber-stamp decisions. Give the recommendation for the current path-changing question, then wait when the choice is user-owned.

After a few path-changing questions, or whenever the user introduces a new claim, inspect evidence, summarize, or checkpoint before asking more.

## Decision Discipline

Read `ARTIFACT-DESTINATIONS.md` when a checkpoint or decision must survive beyond chat and the owning destination is not obvious.

Not every answer is durable. Keep a lightweight ledger:

- **Settled** — explicit user decision or evidence-backed fact.
- **Tentative** — useful working assumption, not authority.
- **Open** — unresolved question that can change the next route.

Persist a decision only when absence would make future work rediscover or contradict it.

Put durable decisions where they belong:

- Domain term or meaning -> existing glossary, `CONTEXT.md`, or domain doc.
- Feature behavior, scope, or acceptance -> spec.
- Future implementation path -> plan.
- Immediate continuation state -> handoff.
- Hard-to-reverse, surprising tradeoff chosen from alternatives -> ADR.
- No durable value -> leave it in chat.

If the destination is missing or ambiguous, ask before writing.

## Stop Conditions

Stop and ask when discovery reveals a user-owned decision, source-of-truth conflict, path conflict, material method substitution, or ambiguous artifact destination.

Do not write implementation files from discovery.

Write specs, plans, ADRs, handoffs, or decision notes only when the user asks or the checkpoint must guide later work.

Do not leave discovery by silently jumping to spec, plan, or build. Before `write-spec`, run the final question pass. Close with a checkpoint when consequential direction changed.

## Checkpoint Shape

Read `CHECKPOINTS.md` when saving a checkpoint or choosing chat versus artifact.

Use this shape when ending a discovery pass or routing forward. Save it in the owning artifact when it must survive beyond chat. Omit sections that do not apply.

```text
Question / goal: ...
Evidence: ...
Current understanding: ...
Settled: ...
Tentative: ...
Open: ...
Recommendation: ...
Next: Forward | Backward | Branch | Stop — ...
```

`Next:` is routing, not permission to create the next artifact.
