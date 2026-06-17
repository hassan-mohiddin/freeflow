---
name: research
description: Use when shaping an idea, feature, architecture direction, vague task, or consequential question before spec, plan, build, or durable memory. Use when evidence, brainstorming, targeted questions, and decision checkpointing need to interleave.
---

# Research

Research is the discovery loop before action: evidence-guided back-and-forth that finds high-leverage decisions and ends in a checkpoint.

For short-lived work, the checkpoint can stay in chat. When it must guide later work, save it in the narrowest owning artifact: spec, plan, handoff, decision note, ADR, or domain memory.

Goal: enough evidence and shared understanding to checkpoint the current direction and route to spec, plan, more research, durable memory, build, or stop without inventing product, domain, scope, public API, security, privacy, billing, data-loss, compatibility, or architecture decisions.

## Language

Use the same architecture language when shaping work. Read `LANGUAGE.md` when the research needs deeper language mapping or the checkpoint will shape architecture:

- **Module** — the thing being understood, built, or reshaped; it has an **interface** and an **implementation**.
- **Interface** — what users, callers, or future agents must know to use or continue the work correctly.
- **Implementation** — the details that can stay hidden behind the interface.
- **Depth** — leverage at the interface. **Deep** means a small interface carries a lot of useful behavior. **Shallow** means the user, caller, or future agent must coordinate too many details.
- **Seam** — where behavior, ownership, or variation can change without rewriting the surrounding work.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — how much future work one question, decision, or interface unlocks.
- **Locality** — keeping evidence, decisions, tests, and changes where future work can find them.

Use the **deletion test** on questions, decisions, and proposed modules: if skipping it makes complexity spread downstream, it matters. If skipping it makes complexity vanish, it was ceremony.

## Loop

1. Identify the target: repo area, artifact, URL, product, model, package, paper, issue, or idea. If multiple plausible targets would change research, ask for the source.
2. Inspect the smallest evidence that can answer the current question: code, tests, docs, ADRs, specs, logs, issues, provided context, or current external sources.
3. Explain the current understanding in plain language.
4. Ask one path-changing question when the answer would change the next route.
5. Let the user challenge, counter-question, or go deeper. Treat that as research input, not interruption.
6. Refresh evidence when new claims, conflicts, or branches appear.
7. Track decisions as settled, tentative, or open.
8. Stop when remaining ambiguity would not change the next artifact or action.

Research may move through evidence, brainstorming, targeted questioning, and checkpointing in any order. Do not force a fixed sequence when the evidence or conversation needs a loop.

## Question Discipline

Prefer deeper questions over more questions. Ask as many as the situation needs, but each question should earn its place: a good question collapses branches; a shallow question collects approvals.

Before asking, run the question deletion test:

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

Long question chains are a failure mode, not diligence. Do not answer pressure for "every question" or "25-50 questions" by dumping a long questionnaire. That creates shallow approvals.

Do not turn recommendations into an approval script. Recommendations should clarify tradeoffs, not make it easy to rubber-stamp many decisions. Give the recommendation when useful, then wait when the choice is user-owned.

Instead of a long questionnaire: inspect evidence, name the decision tree, group lower-level unknowns, and ask the first high-leverage question that changes the next route. Continue in later turns as needed.

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

Stop and ask the user when research reveals a user-owned decision, source-of-truth conflict, path conflict, material method substitution, or ambiguous artifact destination.

Do not write implementation files from research.

Write specs, plans, ADRs, handoffs, or decision notes only when the user asks or the checkpoint must guide later work.

Do not leave research by silently jumping to spec, plan, or build. Close with a checkpoint when consequential direction changed.

## Checkpoint Shape

Read `CHECKPOINTS.md` when saving a checkpoint or choosing chat versus artifact.

Use this shape when ending a research pass or routing forward. Save it in the owning artifact when it must survive beyond chat. Omit sections that do not apply.

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
