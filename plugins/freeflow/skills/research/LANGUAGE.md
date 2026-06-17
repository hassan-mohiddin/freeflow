# Research Language

Use the same language as architecture review so early research shapes the codebase with the same concepts later used to review it.

## Terms

**Module**
The thing being understood, built, or reshaped. It can be a feature, flow, artifact, repo area, package, class, function, or future slice of code.

**Interface**
Everything a user, caller, or future agent must know to use or continue the module correctly: names, inputs, invariants, ordering, error modes, ownership, and source truth.

**Implementation**
The details that can stay hidden behind the interface. Research should decide what callers must know before exposing implementation detail.

**Depth**
Leverage at the interface. Deep research makes the next spec, plan, or module simpler to use. Shallow research pushes coordination into the user, callers, or future agents.

**Seam**
Where behavior, ownership, or variation can change without rewriting surrounding work. A seam can be code, artifact, process, owner, or dependency shaped.

**Adapter**
A concrete thing satisfying an interface at a seam. Use this when something actually varies across the seam; do not invent adapters for ceremony.

**Leverage**
What one question, decision, or interface unlocks for future work.

**Locality**
Where evidence, decisions, tests, and changes should concentrate so future work can find them.

## Deletion Tests

Question deletion test:

```text
If I do not ask this, does downstream complexity spread?
```

Decision deletion test:

```text
If this is not captured, will future work rediscover or contradict it?
```

Module deletion test:

```text
If this module disappears, does complexity vanish or spread across callers?
```

## Research Use

Use domain language from `CONTEXT.md`, existing docs, tests, and code. Do not invent polished names before evidence supports them.

Name the outside first: what should users, callers, or future agents need to know? Then decide which implementation details can stay hidden.

A good research pass should make later architecture review ask:

```text
Did we build the deep module we shaped here?
```
