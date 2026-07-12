# Freeflow Workflow Map

Use this when work spans phases, the current entry point is unclear, or public documentation needs the complete lifecycle.

This map is adaptive. It is not a mandatory sequence.

## Compact Map

```mermaid
flowchart LR
  Request{Request}
  Talk[Conversation<br/>answer directly]
  Entry{Choose entry}
  Discover[Discover<br/>when needed]
  Durable[Decision / spec / rolling plan<br/>when needed]
  Slice[Learning / delivery / deepening slice]
  Verify[Verify + route check]
  Formal[Review / commit / handoff<br/>when useful]
  Delivery[Finish branch / release / ship<br/>when selected]
  Done[Close]

  Request -->|question or critique| Talk
  Request -->|consequential work| Entry
  Entry -->|option space unclear| Discover
  Entry -->|contract or plan needed| Durable
  Entry -->|bounded work ready| Slice
  Discover --> Durable
  Discover -->|learning slice ready| Slice
  Durable --> Slice
  Slice --> Verify
  Verify -->|continue without checkpoint| Slice
  Verify -->|checkpoint useful| Formal
  Verify -->|complete with no delivery step| Done
  Verify -->|integration / release / launch remains| Delivery
  Formal --> Slice
  Formal -->|delivery remains| Delivery
  Formal --> Done
  Delivery --> Done
  Verify -. evidence changes route .-> Entry
  Delivery -. evidence changes route .-> Entry
```

Small reversible work may use:

```text
inspect -> execute -> verify -> route closeout
```

## Adaptive Lifecycle

```mermaid
flowchart TD
  Request([Request]) --> Entry{Choose current entry}

  Entry --> Conversation[Conversation<br/>answer / critique / inspect]
  Entry --> Discover[Discover<br/>facts + options + tradeoffs]
  Entry --> Gate[Decision gate<br/>owner or source conflict]
  Entry --> Spec[Spec<br/>behavior + acceptance + failure contract]
  Entry --> Plan[Rolling plan<br/>current horizon + directional later phases]
  Entry --> Execute[Execute slice<br/>learning / delivery / deepening]
  Entry --> Diagnose[Diagnose<br/>reproduce + root cause]
  Entry --> Review[Review<br/>independent judgment]
  Entry --> Verify[Verify<br/>claim + evidence]
  Entry --> Close[Commit / handoff<br/>rollback or continuity]
  Entry --> Finish[Finish branch<br/>merge / PR / keep / discard]
  Entry --> Migrate[Migration<br/>move consumers / traffic / data]
  Entry --> Release[Release<br/>versioned publication]
  Entry --> Launch[Launch<br/>production deployment / rollout]

  Conversation --> Done([Done])
  Gate -->|decision resolves route| Return[Return to owning state]
  Discover -->|durable behavior needed| Spec
  Discover -->|bounded evidence path| Plan
  Spec --> Plan
  Plan --> Execute
  Diagnose --> Execute
  Execute --> Verify
  Verify --> Route{Route check}

  Route -->|continue| Formal{Formal checkpoint useful?}
  Formal -->|review| Review
  Formal -->|commit or handoff| Close
  Formal -->|none| Horizon[Refine next executable horizon]
  Review -->|pass| Horizon
  Review -->|non-pass| Adjudicate[Adjudicate findings]
  Adjudicate --> Backward
  Close --> Horizon
  Horizon -->|more accepted work| Execute
  Horizon -->|complete with no delivery step| Done
  Horizon -->|branch integration selected| Finish
  Horizon -->|migration selected| Migrate
  Horizon -->|versioned release selected| Release
  Horizon -->|production rollout selected| Launch
  Finish -->|release selected| Release
  Finish -->|complete| Done
  Release -->|consumer migration selected| Migrate
  Release -->|deployment selected| Launch
  Release -->|complete| Done
  Migrate -->|removal release selected| Release
  Migrate -->|production cutover selected| Launch
  Migrate -->|complete| Done
  Launch --> Done

  Route -->|local defect| Execute
  Route -->|failure unclear| Diagnose
  Route -->|path invalidated| Backward[Backward route]

  Backward -->|option space / architecture| Discover
  Backward -->|behavior / scope / contract| Spec
  Backward -->|slices / order / checks| Plan
  Backward -->|owner or source conflict| Gate
  Backward -->|no safe route| Stop([Stop or defer])

  Return --> Discover
  Return --> Spec
  Return --> Plan
  Return --> Execute
  Return --> Diagnose
  Return --> Review
  Return --> Verify
  Return --> Close
  Return --> Finish
  Return --> Migrate
  Return --> Release
  Return --> Launch
```

## Entry Points

- **Conversation:** non-mutating answer, explanation, critique, or bounded read-only exploration.
- **Discover:** problem, outcome, approaches, architecture direction, or evidence path is unsettled.
- **Decision gate:** owner decision, source conflict, or material path substitution blocks action.
- **Write spec:** accepted behavior, scope, contracts, or acceptance need durability.
- **Review artifact:** a spec, plan, decision, or handoff must guide future work safely.
- **Write plan:** immediate execution needs phases, slices, verification, and backward checkpoints.
- **Execute plan:** an approved current horizon exists.
- **TDD:** one accepted behavior should drive one test-first implementation loop.
- **Simplify code:** working code needs behavior-preserving reduction of accidental complexity.
- **Migration work:** consumers, traffic, configuration, or data must move before an old path can be removed.
- **Diagnose failure:** a broken, flaky, slow, or repeated workflow signal needs root cause.
- **Review work:** independent judgment may change confidence or route.
- **Verify work:** a slice or completion claim needs fresh proof.
- **Commit work:** a coherent verified rollback checkpoint is useful and authorized.
- **Handoff:** context or continuity requires compact continuation state.
- **Finish branch:** choose and verify merge, PR, keep, discard, or cleanup.
- **Release work:** publish and verify an immutable versioned consumer artifact.
- **Launch work:** deploy or expose production behavior through an observable recoverable rollout.

## Slice Loop

```text
Slice contract
-> implement or experiment
-> verify
-> route check
   -> continue
   -> bounded fix
   -> review
   -> commit / handoff
   -> diagnose
   -> Discover / design
   -> revise spec / plan
   -> decision gate
   -> stop
```

Verification and route check occur after every meaningful slice. Formal review, commit, handoff, and user checkpoints are selected by risk and route value.

## Rolling Horizon

A rolling plan separates:

- **Current phase:** concrete slices, seams, checks, dependencies, and stop conditions.
- **Next phase:** directional outcome, likely dependencies, and questions current evidence must resolve.
- **Later phases:** provisional outcomes and major constraints only.

At each phase boundary, preserve evidence and refine only the next executable horizon.

## Backward Routing

- New option space or invalidated assumptions -> Discover.
- Growing caller knowledge, states, flags, retries, or test machinery -> design-for-depth.
- Changed behavior, scope, acceptance, public contract, or failure semantics -> spec revision.
- Changed implementation order, slices, checks, or later-phase assumptions -> plan revision.
- Unclear root cause -> diagnosis.
- Owner or source conflict -> decision gate.
- No safe in-scope continuation -> defer or stop.

Route only affected work backward. Preserve valid decisions, code, and evidence.

## Route Closeout

Use `Next:` when a consequential phase exit leaves a useful route:

- **Forward:** next bounded action.
- **Backward:** invalidated path and owning earlier activity.
- **Branch:** two or three valid routes.
- **Stop:** no useful safe continuation.

Do not use routing language as permission to take the next action.