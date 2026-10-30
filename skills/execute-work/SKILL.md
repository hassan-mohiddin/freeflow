---
name: execute-work
description: "Use for any task that uses tools: reading or searching a repository, running commands, diagnosing, and any work that changes code, files or settings: implementing a feature, fixing a bug, adding or changing behavior, configuring, prototyping, refactoring, simplifying or cleaning up code, deleting dead code, or maintaining a project. Also use when designing or changing modules, interfaces, data models, state, error handling or dependencies; when something fails, breaks, regresses or slows down and the cause is unknown, or a fix did not hold; when migrating users, data, a schema, a service or traffic to a replacement and removing the old path; when adding edge-case handling or code comments; and when handing work to subagents or parallel workers, or working from another agent's brief. Read it before your first tool call on a task, even a small or read-only one: it reads the request for its asks and implied requirements, finds what the change touches before you edit, and reviews and reports the result."
---

# Execute Work

Carry out a task from its first tool call to a checked result: the reading, searching and diagnosis before a change, and the change itself. The work agreement says what to build; work out how yourself when the request leaves that to you.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

Read a reference only when its situation arises.

| Situation | Read |
| --- | --- |
| Before the first production change: finding the callers, readers, writers, tests and docs a change touches | Run [touch-map](scripts/touch-map.mjs), as Establish The Execution Basis says |
| Before reporting a change as done | Run [self-review](scripts/self-review.mjs), as Check, Then Continue Or Return says |
| A change, even one line, to permissions, public behavior, canonical state or failure semantics, or one that spreads a policy across callers | [design: Start With The Required Outcome](references/design.md#start-with-the-required-outcome) |
| Building on a representation, identity, ownership or algorithm choice that dependent work would redo if wrong | [design: Settle The Choices](references/design.md#settle-the-choices) |
| A new or changed interface between parts, or choosing which part owns a decision | [design: Interfaces](references/design.md#interfaces) |
| State that must survive a failure: partial effects, retries, concurrent writers, recovery | [design: State And Failure](references/design.md#state-and-failure) |
| Module cycles, layering, dependency direction, or extracting shared code | [design: Modules And Dependencies](references/design.md#modules-and-dependencies) |
| The same change keeps touching many places, or each fix adds another flag, state or caller rule | [design: Pressure Signals](references/design.md#pressure-signals) |
| Behavior-preserving cleanup, refactoring or deletion is the agreed result | [simplify](references/simplify.md) |
| A failure with no known cause, or two fixes that did not hold | [diagnose](references/diagnose.md) |
| Moving users, data or traffic to a replacement, or removing an old path | [migration](references/migration.md) |
| Adding edge-case handling, or a comment that explains why | [code practices](references/code-practices.md) |
| Designing or changing a test | [Test Design](../verify-work/references/test-design.md) |
| Choosing the checks that will show the change works, reproducing the problem before a fix, running the existing tests before and after, what a check shows, or a claim beyond its evidence | [Verify Work](../verify-work/SKILL.md) |
| An empirical question to answer before building on it | Discuss Work's [learning action](../discuss-work/references/learning-action.md) |
| A choice that is the user's, or a step the agreement does not cover | [Discuss Work](../discuss-work/SKILL.md) |
| Handing work to another agent (a subagent, parallel workers, a reviewer, a trial, eval or research agent, a fan-out), or working from another agent's brief | [delegation](references/delegation.md) |
| Committing, pushing, merging, releasing or deploying | [Deliver Work](../deliver-work/SKILL.md) |

## Rules

- Stay inside the work agreement; an agreement to return a plan does not cover production edits. Take a new requirement, evidence boundary or other user-owned choice to Discuss Work before adopting it.
- Never cross a selected Checkpoint while it is due and unresolved; Track Work names its owner.
- Never rewrite a Spec, Plan, policy or acceptance criterion to make the implementation pass.
- Never encode a guess for consequential behavior nobody defined: ask through Discuss Work, or, when no one can answer, take what matches existing behavior and is easiest to reverse, and report it.
- When a Working Record exists, record the Current Slice through Track Work before its first effect.
- Never promote exploratory code into production or invent acceptance.

## Read The Request

Goal: before the first edit, you know every separate ask, what the requester saw, and what must stay true.

List three layers:

- **Explicit asks:** each separate thing to do.
- **Observations:** what the requester saw, often with numbers ("takes 2.3 s", "only after a restart", "sometimes"). They are facts about the real system; "sometimes" names a condition to find.
- **Implied requirements:** what must stay true although nobody wrote it down. Check, for the thing you change:
  - data the old code wrote (records, files, keys, cache entries) stays readable;
  - every way users or code reach this behavior (commands, shortcuts, routes, jobs, startup, retries) keeps working;
  - other readers of the output (formats, field names, order) still get what they rely on;
  - the opposite case still works ("never include X" still includes everything that is not X);
  - stated properties ("only when", "exactly once", "never") hold over all inputs, not only the example.

The request fixes **what** must be true; **how** is yours, to change when evidence says so. Do not let your first approach redefine the requirement.

When the requester suggests how, check its preconditions against the actual state first (`git status`, what gets built or deployed, what else touches the same files). If they do not hold, keep the goal, adjust the approach, and say why.

Each choice these layers leave open for the user goes in Discuss Work's decision list; when no one can answer it (a routed assignment, an unattended run), take what matches existing behavior and is easiest to reverse, and report it. Before adding something unrequested (a dependency, a stored field, an option), ask whether the outcome needs it or only your approach does.

## Establish The Execution Basis

Goal: before the first effect, you know what is agreed, how you will get there, and what will show it worked.

- **Outcome:** the agreed result, its constraints and non-goals, and where you stop.
- **Route:** the main steps, their order, and which depend on feedback. For substantial dependent work, forecast internally which changes belong together and the earliest observation that could invalidate the rest.
- **Evidence:** the checks that could disagree with a wrong result, on the user's path.
- **Cycle:** whether the route fits in what is left of the context before compaction: `node <track-work-directory>/scripts/working-record.mjs estimate` measures it. Work that will outlast this compaction cycle needs a task: the one this session holds, or one you ask for as [Track Work](../track-work/SKILL.md) says; plan where this cycle ends, at a safe point.

Before the first production change, gather what the route's predictable steps will use (sources, callers, contracts, conventions, code to copy), with the queries in Find What The Change Touches, below: [touch-map](scripts/touch-map.mjs) (`node <execute-work-directory>/scripts/touch-map.mjs --symbol <name> --file <path>`) runs them as capped, labelled blocks (entry points, readers, writers, scheduled code, covering tests, and the developer docs covering each file), each saying what it did not search. Never start substantial work from a guessed API, owner or cause. Stop when what remains can only be learned by doing the work, such as a test result or the user's reaction to a draft, and adapt the route to that feedback. Reading files no step needs, or collecting information because it may be useful later, is over-gathering; pausing for context the route could have predicted is under-gathering: aim for fewer low-value interactions, not fewer calls at any cost. When the work needs unexpectedly large context, return that need to the user rather than reading the whole dependency tree, citing the host's usage figures, never invented token counts. A small, well-understood change needs no separate pass. You are ready when you can say what will change, why it should work, and how it will be checked.

An agreement to fix a bug covers investigation before the remedy is known. Domain guidance, such as a framework or security skill, supplies method, never authority; load it for the concrete technology or risk, not for a keyword.

### Find What The Change Touches

Consequences are hard to imagine and easy to query. Name what you are changing in one line, then query each of these and write every result down:

```bash
echo '--- entry points'; grep -rn 'thing(' src | head -20
echo '--- readers of the state'; grep -rn 'state_field' src | head -20
echo '--- old data'; grep -rn 'write.*state_field' src | head
echo '--- concurrent or scheduled'; grep -rn 'async\|schedule' src | head
```

For each line, write your decision next to it and name the thing: it changes too, because the request's goal needs it, or its users must still get exactly what they get now. The request not mentioning something is no reason to leave it out. Put the change where the behavior is owned, even when many callers share that code: keep callers correct by checking each, not by avoiding the shared code. Read the tests that cover that code before editing; they are the contract.

## Work One Method At A Time

Goal: the agreed result, by the simplest method that fits, with accepted behavior intact.

Work in steps that each produce one checkable result, not one per command or file; [Track Work](../track-work/SKILL.md) owns how Slices are sized and recorded. Use one primary method at a time: direct implementation when the outcome and mechanism are understood, one routed reference when its situation holds, or a bounded learning action when an empirical question must be answered first. Name things for what they mean in the domain, and make invariants and failure behavior explicit in code, types or tests.

For one mechanical edit across many sites, edit the first site by hand, then write a script or codemod; run it on that site's original state and diff against your hand edit until they match, then run it everywhere. Keep the script in the task's scratch location and name it in the report. Edit by hand when the sites are few or each needs its own decision.

## Re-enter When The Basis Changes

Goal: stop building on a basis that no longer holds, and go back only as far as the change requires.

| What changed | Go to |
| --- | --- |
| A clear local defect with a supported remedy | Correct it in the same action |
| The mechanism is invalidated, the outcome is not | Stop dependent edits; re-establish the approach |
| A failure with no known cause, or two fixes that did not hold | [diagnose](references/diagnose.md), after Diagnose Before Fixing, below |
| A claim exceeds its evidence | Verify Work, before fixing anything |
| Accepted content, such as a Spec, Plan or Decision, changed | Its owner; reconcile the Working Record before dependent use |
| A choice that is the user's | Discuss Work |

Do not continue merely because implementation has begun. Before chasing a prerequisite, ask whether the agreed outcome needs it or only your current approach does; a failed approach does not prove a host change or stronger guarantee is necessary. Keep unaffected changes and contradicting evidence. Rerunning a check after the state changed, or polling an operation still producing its result, is not the repetition Diagnose Before Fixing stops.

### Diagnose Before Fixing

A plausible line of code is a hypothesis, not a cause: before fixing it, find an observation that would come out differently if it were wrong. The explanation must cover the whole symptom: the "sometimes", the size, the timing.

When your last two actions did not change what you believe, stop repeating them. Change the question ("which code runs between the input and the wrong value?"), change the kind of observation (run it if reading failed; read the producer if running failed), or check your cheapest assumption (did the build run? does the test import what you think?). Two failed fixes mean the diagnosis is wrong.

## Check, Then Continue Or Return

Goal: the result is supported where it will be used, and the report says exactly what exists.

Check where the result will be accepted or used, not after every edit. Use Verify Work for what the observations support, then Review Your Own Change, below, with [Review Work](../review-work/SKILL.md) for its lenses. Before you report, run [self-review](scripts/self-review.mjs) (`node <execute-work-directory>/scripts/self-review.mjs --base <ref> [--requirements <file>] [--test-command <command>]`) and read its report: status, diff stat, every changed existing test or fixture with its hunk, each new test and whether it fails on the base, per requirement whether its check ran after the last edit (record each check with its `check --id R<n>` command), and the feature files covering the change with whether each was driven since (drive those through Verify Work). Correct a supported local defect and rerun the affected checks once; route a repeated failure instead of iterating.

If the result makes existing documentation untrue, correcting it is part of this work: use [Write Docs](../write-docs/SKILL.md). New documentation still needs a request.

Before each continuation, ask whether the next change meets an agreed requirement, repairs a demonstrated defect, or only adds an optional guarantee; an optional improvement is not unfinished work. Continue while the next step serves the same outcome and stays covered, starting a distinct Slice the agreement covers through Track Work without waiting for the user; a passing check is not the endpoint.

Stop at the agreed return condition or an uncovered consequential boundary, and report as Report A Finished Change says, accounting for any edit made after the last check.

### Review Your Own Change

Before you report, read the actual change, not your memory of it: `git status`, `git diff`. Does it do every item on your list and nothing more? Do callers of what you changed still work (rerun the queries)? Did the check behind each requirement run after the last edit that could change its result? Any leftover debug output or scratch files? Fix what you find, recheck what that affects, and stop.

### Report A Finished Change

When you finish a code change, end with:

1. **The cause and the change**, citing `file:line`.
2. **Each requirement**, including every stated one from a request, assignment or note, with the output showing it holds:
   ```text
   R1 <requirement> — observed: <command> → <result>
   R2 <requirement> — not verified: <why>
   ```
3. **Choices the user has not seen** from the decision list, **what you did not verify**, and anything you noticed but did not change.
