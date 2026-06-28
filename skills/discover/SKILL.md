---
name: discover
description: Use for pre-work thinking before consequential action: codebase exploration, brainstorming, planning direction, shaping ideas/features/specs, design/API/runtime/architecture questions, “should we” / “what do you think” prompts, vague requests, or any work that needs evidence or path-changing questions before spec, plan, build, review, verification, or durable memory.
---

# Discover

Think before downstream work.

Discover is the shared-understanding loop before spec, plan, build, review, verification, handoff, or memory. It turns unclear direction into the next safe route.

Use full Discover when discovery-light is not enough: the work needs codebase exploration, brainstorming, tradeoff comparison, planning direction, path-changing questions, or a checkpoint.

Priority: Interview Gate stops silent decisions and user-owned decisions first. Output Router only chooses evidence transport after the discovery route is clear.

## Default Trigger

Use Discover for most consequential requests that are not already ready to execute:

- first repo/code exploration before action;
- brainstorming, shaping, or comparing paths;
- design, API, runtime, tool-surface, architecture, or module-boundary questions;
- “should we,” “why not,” “what do you think,” “how should we,” or similar prompts;
- turning discussion into a spec, plan, issue, ADR, handoff, or durable memory;
- unclear bug-like symptoms before diagnosis has a concrete repro path;
- any request where evidence could change scope, route, artifact, or next action.

Do not use full Discover when the next action is already clear and covered by a more specific skill: executing an approved plan, verifying work, reviewing a diff, committing, or answering a simple factual question.

Direct questions use discovery-light: inspect the smallest relevant evidence, then answer directly.

## Hard Stops

Stop and ask when discovery reveals:

- a user-owned decision: product behavior, scope, public API, security, privacy, billing, data loss, compatibility, permissions, or irreversible architecture;
- a source-truth conflict with docs, tests, ADRs, specs, policies, or live repo evidence;
- an ambiguous target, artifact destination, or path choice that would change the next action;
- a material method substitution, such as replacing requested research with a guess.

Do not write implementation files from Discover.

Do not create specs, plans, ADRs, handoffs, decision notes, or memory unless the user asks or the checkpoint must survive beyond chat.

## Evidence Before Questions

Inspect first when the answer is discoverable from:

- code, tests, docs, ADRs, specs, policies, issues, logs, traces, or repo state;
- provided files, URLs, screenshots, transcripts, or user context;
- current external docs or web sources when framework/library facts or recent changes matter.

Ask before inspecting only when multiple targets would change the discovery path or access/scope is user-owned.

## Question Discipline

Ask fewer, deeper questions.

Before asking, run the deletion test:

```text
If I do not ask this, does downstream complexity spread?
```

If no, skip it.

Ask one or two path-changing questions at a time. Do not satisfy requests for “every question,” “grill me,” long questionnaires, or recommended answers for each question. Name the decision tree and ask the next question that matters.

Recommendations should clarify tradeoffs, not create an approval script. Give the recommendation for the current path-changing question, then wait when the choice is user-owned.

## Loop

1. Identify the target: repo area, artifact, URL, product, model, package, paper, issue, symptom, or idea.
2. Inspect the smallest evidence that can change the route.
3. State the current understanding in plain language.
4. Compare paths when direction is still forming; do not force a decision too early.
5. Ask one path-changing question when the answer would change the next artifact or action.
6. Treat user challenges, counter-questions, and new constraints as discovery input.
7. Track decisions as settled, tentative, or open.
8. Stop when remaining ambiguity would not change the next route.

Discovery can loop through evidence, brainstorming, targeted questions, design, and checkpointing in any order. Do not force a fixed sequence.

## Scope And Decisions

Preserve the user's intended scope. Do not silently turn a large idea into `v1`, `v2`, MVP, release, or roadmap framing.

Use implementation slices, phases, checklists, or multiple artifacts to make large work executable without changing what the user asked for.

Persist decisions only when absence would make future work rediscover or contradict them:

- domain meaning -> existing glossary, `CONTEXT.md`, or domain doc;
- feature behavior, scope, or acceptance -> spec;
- future implementation path -> plan;
- immediate continuation state -> handoff;
- hard-to-reverse surprising tradeoff -> ADR;
- no durable value -> chat only.

Read `ARTIFACT-DESTINATIONS.md` when the destination is not obvious.

## Routing Out

Before routing from discovery to `write-spec`, run a final ambiguity sweep. Ask only remaining path-changing questions whose answers affect scope, behavior, acceptance, public API, architecture, security, privacy, billing, data loss, compatibility, or artifact destination.

If no meaningful questions remain, say so and route forward. Do not silently jump to spec, plan, or build.

Close consequential discovery with a checkpoint. Keep it in chat unless it must guide later work. Read `CHECKPOINTS.md` before saving a checkpoint.

Checkpoint shape:

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
