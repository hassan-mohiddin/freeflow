---
name: execute-work
description: "Use when implementing, fixing, configuring, refactoring, simplifying or cleaning up code, designing modules or interfaces, finding why something fails, or migrating to a replacement and removing the old path. Not for open scope (Discuss Work), checking (Verify Work), fitness (Review Work) or delivery (Deliver Work)."
---

# Execute Work

Carry out agreed change work from the first edit to a checked result. The work agreement says what to build; work out how yourself when the request leaves that to you.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

Read a reference only when its situation arises.

| Situation | Read |
| --- | --- |
| Building on a representation, identity, ownership or algorithm choice that dependent work would redo if wrong | [design: Settle The Choices](references/design.md#settle-the-choices) |
| A new or changed interface between parts, or choosing which part owns a decision | [design: Interfaces](references/design.md#interfaces) |
| State that must survive a failure: partial effects, retries, concurrent writers, recovery | [design state and failure](references/design-state-and-failure.md) |
| Module cycles, layering, dependency direction, or extracting shared code | [design: Modules And Dependencies](references/design.md#modules-and-dependencies) |
| The same change keeps touching many places, or each fix adds another flag, state or caller rule | [design: Pressure Signals](references/design.md#pressure-signals) |
| Behavior-preserving cleanup, refactoring or deletion is the agreed result | [simplify](references/simplify.md) |
| A failure with no known cause, or two fixes that did not hold | [diagnose](references/diagnose.md) |
| Moving users, data or traffic to a replacement, or removing an old path | [migration](references/migration.md) |
| Adding edge-case handling, or a comment that explains why | [code practices](references/code-practices.md) |
| Designing or changing a test | [Test Design](../verify-work/references/test-design.md) |
| What a check shows, or a claim beyond its evidence | [Verify Work](../verify-work/SKILL.md) |
| An empirical question to answer before building on it | Discuss Work's [learning action](../discuss-work/references/learning-action.md) |
| A choice that is the user's, or a step the agreement does not cover | [Discuss Work](../discuss-work/SKILL.md) |
| Committing, pushing, merging, releasing or deploying | [Deliver Work](../deliver-work/SKILL.md) |

## Rules

- Stay inside the work agreement; an agreement to return a plan does not cover production edits. Take a new requirement, scope, compatibility, persistence or evidence boundary to Discuss Work before adopting it.
- Never cross a selected Checkpoint while it is due and unresolved; Track Work names its owner.
- Never rewrite a Spec, Plan, policy or acceptance criterion to make the implementation pass.
- Never encode a guess for consequential behavior nobody defined: ask through Discuss Work, or, when no one can answer, take the Working Method's default and report it.
- When a Working Record exists, record the Current Slice through Track Work before its first effect.
- Never promote exploratory code into production or invent acceptance.

## Establish The Execution Basis

Goal: before the first effect, you know what is agreed, how you will get there, and what will show it worked.

- **Outcome:** the agreed result, its constraints and non-goals, and where you stop.
- **Route:** the main steps, their order, and which depend on feedback. For substantial dependent work, forecast internally which changes belong together and the earliest observation that could invalidate the rest.
- **Evidence:** the checks that could disagree with a wrong result, on the user's path.

Before the first production change, gather what the route's predictable steps will use (sources, callers, contracts, conventions, code to copy), with the queries in the Working Method's "Find what the change touches"; never start substantial work from a guessed API, owner or cause. Stop when what remains can only be learned by doing the work, such as a test result or the user's reaction to a draft, and adapt the route to that feedback. Reading files no step needs, or collecting information because it may be useful later, is over-gathering; pausing for context the route could have predicted is under-gathering. When the unit needs unexpectedly large context, return that need to the user rather than reading the whole dependency tree, citing the host's usage figures, never invented token counts. A small, well-understood change needs no separate pass. You are ready when you can say what will change, why it should work, and how it will be checked.

An agreement to fix a bug covers investigation before the remedy is known. Domain guidance, such as a framework or security skill, supplies method, never authority; load it for the concrete technology or risk, not for a keyword.

## Work One Method At A Time

Goal: the agreed result, by the simplest method that fits, with accepted behavior intact.

Work in units that each produce one checkable result, not one per command or file; [Track Work](../track-work/SKILL.md) owns how Slices are sized and recorded. Use one primary method at a time: direct implementation when the outcome and mechanism are understood, one routed reference when its situation holds, or a bounded learning action when an empirical question must be answered first.

For one mechanical edit across many sites, edit the first site by hand, then write a script or codemod; run it on that site's original state and diff against your hand edit until they match, then run it everywhere. Keep the script in the task's scratch location and name it in the report. Edit by hand when the sites are few or each needs its own decision.

## Re-enter When The Basis Changes

Goal: stop building on a basis that no longer holds, and go back only as far as the change requires.

| What changed | Go to |
| --- | --- |
| A clear local defect with a supported remedy | Correct it in the same action |
| The mechanism is invalidated, the outcome is not | Stop dependent edits; re-establish the approach |
| The cause is unclear, or a correction did not hold | [diagnose](references/diagnose.md), after the Working Method's "Diagnose before fixing" |
| A claim exceeds its evidence | Verify Work, before fixing anything |
| Accepted content, such as a Spec, Plan or Decision, changed | Its owner; reconcile the Working Record before dependent use |
| A choice that is the user's | Discuss Work |

Do not continue merely because implementation has begun. Before chasing a prerequisite, ask whether the agreed outcome needs it or only your current approach does; a failed approach does not prove a host change or stronger guarantee is necessary. Keep unaffected changes and contradicting evidence.

## Check, Then Continue Or Return

Goal: the result is supported where it will be used, and the report says exactly what exists.

Check where the result will be accepted or used, not after every edit. Use Verify Work for what the observations support, then the Working Method's "Review your own change", with [Review Work](../review-work/SKILL.md) for its lenses. Correct a supported local defect and rerun the affected checks once; route a repeated failure instead of iterating.

If the result makes existing documentation untrue, correcting it is part of this work: use [Write Docs](../write-docs/SKILL.md). New documentation still needs a request.

Before each continuation, ask whether the next change meets an agreed requirement, repairs a demonstrated defect, or only adds an optional guarantee; an optional improvement is not unfinished work. Continue while the next step serves the same outcome and stays covered, starting a distinct Slice the agreement covers through Track Work without waiting for the user; a passing check is not the endpoint.

Stop at the agreed return condition or an uncovered consequential boundary, and report as the Working Method's "Report a finished change" says, accounting for any edit made after the last check.
