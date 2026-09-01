# Skill Dependency Graphs

Read this when creating or revising multiple related skills, shared terminology, cross-skill links, capability activation, direct or routed entry paths, or context-loss recovery.

A multi-skill system is a stateful, partially loaded prompt graph. It is not a mandatory sequence.

## Identify The Edge Types

Do not treat every link as execution.

### Activation edge

Causes a skill to be read or made effective:

```text
natural prompt -> description -> skill
always-loaded system cue -> recovery skill
capability cue -> capability skill
```

### Owner route

Changes which activity controls the current bounded result.

A plain-text return may express control flow without creating a Markdown package dependency.

### Composition edge

Adds a method, lens, reviewer contract, or domain guide without changing the current owner.

### Reference edge

Loads activity-required or conditional depth inside a package.

### Environment-interaction edge

Temporarily selects one observation or effect and returns to the same current owner.

### Persistence edge

Earlier skill guidance remains in context and may affect later behavior without another read.

### Recovery edge

Reintroduces required guidance after context loss through an always-loaded upstream cue.

## Enumerate Every Valid Entry Path

For each skill, identify:

- natural description activation;
- orchestrator or lifecycle routes;
- sibling routes;
- direct user commands;
- capability cues;
- context-loss recovery;
- host-specific activation;
- artifact or checkpoint routes.

Do not optimize only for the most common path.

A skill may rely only on context guaranteed across every valid activation path.

If a skill can activate directly, it cannot depend on vocabulary introduced only by a commonly preceding skill.

If a skill can activate through an independent recovery cue, it cannot assume that an earlier discussion or planning skill was read first.

## Place Terminology Upstream

For every shared term:

1. list all consumers;
2. list every valid path to those consumers;
3. find the nearest upstream context guaranteed on all paths;
4. define the term there;
5. keep specialized detail with its owning skill.

Place shared vocabulary in the nearest always-available context only when independently activated consumers require it.

Keep local terms local when other skills should route to the owner rather than implement its method.

Do not duplicate full definitions merely to compensate for a broken activation graph.

## Prevent Self-Activation

An unread skill cannot require its own first read.

Critical activation must come from:

- guaranteed base or system guidance;
- a skill description;
- an already-loaded owner;
- an effective capability cue;
- another declared upstream path.

References follow the same rule: the body must name the read condition before using reference content.

## Check Direct And Routed Paths

For every related skill, test:

```text
direct natural activation
routed activation from expected parent
nearby safe-read activation
retained use after another skill loads
recovery after context loss
```

A path that works only because another skill happened to be read is not valid dependency composition.

## Check Redundancy And Inconsistency

Across all changed skills, inspect:

- duplicate canonical definitions;
- divergent wording for the same invariant;
- early commands contradicted by later caveats;
- two skills claiming the same current ownership;
- methods or lenses accidentally becoming owners;
- links with no activation, route, composition, or reference job;
- terms used before guaranteed definition;
- body and reference read-condition mismatch;
- stale recovery cues;
- direct routes bypassing required context;
- retained instructions hijacking later owners.

Distinguish semantic duplication from intentional local guards.

## Repeat Across Skills Deliberately

Repeat a compact invariant when a distinct activation path or decision point requires local protection.

Keep:

```text
canonical owner
-> complete definition or method

consumer
-> compact local guard
-> route to canonical owner when needed
```

Do not copy complete sections across skills. Repetition should preserve meaning without creating competing ownership.

## Keep Routing And Terminology Graphs Distinct

Terminology and dependency order should normally flow from guaranteed upstream context toward consumers.

Runtime routing may be cyclic:

```text
For example:
clarification -> task memory -> clarification
execution -> verification -> review -> execution
```

A cyclic routing graph does not justify cyclic terminology dependencies.

## Validate Facts And Evaluate Behavior

Deterministic checks can establish:

- links;
- containment;
- dependency cycles;
- resource inventory;
- routing-map parity;
- exact duplicate text.

They cannot establish:

- correct activation;
- safe retained influence;
- semantic consistency;
- useful repetition;
- behavior preservation;
- readiness.

Evaluate the exact graph claim:

- activation;
- first-read body behavior;
- dependency composition;
- retained use;
- recovery;
- artifact outcome.

Do not require a graph artifact for every small skill edit. Use this method when several nodes, paths, terms, or owners change together.
