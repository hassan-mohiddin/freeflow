---
name: "action-selection"
description: "Use when the current owner needs to choose, bound, or learn from an environment interaction, especially when several actions are plausible, expected output may be broad or noisy, or recent interactions have not materially changed the current decision."
---

# Action Selection

Choose one covered environment interaction likely to advance the current question or accepted outcome, learn from its actual result, and return the changed evidence to the current owner.

An **environment interaction** is one bounded tool-mediated observation or effect and the result it returns. A bounded activity may contain several environment interactions.

Action Selection does not choose the current owner, execution method, accepted behavior, authority, Slice, checkpoint, or Workflow route. It does not replace implementation, diagnosis, verification, review, or domain guidance.

## Run One Interaction Loop

```text
Need evidence or a covered effect
-> name what this interaction must resolve or produce
-> check whether current evidence supports one obvious action
   -> yes: fast path
   -> no: branch mentally
-> choose and bound one environment action
-> execute once
-> observe the actual result
-> identify what changed
-> return the observation and state change to the current owner
```

Action Selection improves one local interaction. It does not plan the whole task or simulate a long future trajectory.

## Take The Fast Path When The Action Is Obvious

Use the direct tool when current evidence supports one known, mechanical, covered, and directly verifiable interaction.

The fast path is not the first plausible action. Use it only when choosing the target, hypothesis, observer, effect, and scope requires no unresolved material judgment.

Typical fast-path interactions include:

- reading a known file, symbol, range, or artifact;
- applying an already selected exact edit;
- running the exact focused check required by the current method;
- formatting an accepted changed file;
- inspecting a known diff or generated result.

Do not generate alternatives for an obvious continuation.

An action is not obvious merely because it is easy to execute. Choosing where to search, which hypothesis to test, what boundary to observe, or what effect to apply normally requires the branch path when several materially different choices remain.

## Branch Mentally, Execute Once

Use the branch path when:

- several actions are plausible;
- the relevant target, hypothesis, observer, or scope is unsettled;
- the likely interaction is broad, noisy, destructive, expensive, or difficult to recover;
- recent interactions have not materially changed the current question or accepted outcome.

Before touching the environment:

1. name the question or concrete effect the next interaction must resolve or produce;
2. check whether active evidence already answers it;
3. consider only a few materially different actions—not synonyms of the same search or observer;
4. reject actions that repeat unchanged evidence, revisit an eliminated path, or gather information without a current question;
5. prefer the action most directly connected to the question;
6. among similarly direct actions, prefer one that distinguishes the leading alternatives;
7. among similarly discriminating actions, prefer the narrowest interaction with proportionate output, side effects, context residue, and recovery cost;
8. execute only the selected interaction and decide again from reality.

Keep this comparison internal unless it exposes a user-owned decision. Do not produce candidate tables, assign numeric scores, simulate several environment results, or plan multiple interactions before the first observation.

## Prefer Decision-Bearing Actions

A **decision-bearing action** produces a result that changes what the current owner should believe or do whether it supports or contradicts the leading hypothesis.

Among actions already covered by the current route, authority, and any active execution contract, prefer one that:

- bears directly on the current question or accepted outcome;
- distinguishes meaningful alternatives;
- uses the narrowest sufficient observer or effect;
- avoids unchanged evidence, eliminated paths, and equivalent prior interactions;
- produces a clear next branch under both favorable and unfavorable results;
- keeps expected observation volume, context residue, side effects, reversibility, and recovery cost proportionate.

Do not calculate a numeric value. Use these properties to reject low-value branches and select one useful interaction.

The objective is not maximal information. It is the smallest observation or effect capable of changing the decision.

## Shape The Environment Action

Match the action and tool to the required relationship:

- when the entity, artifact, location, or range is known, use a focused operation;
- when ownership, callers, dependencies, or structure are the question, use the most structured relationship query available;
- when the target is literal, generated, or dynamically referenced, use bounded text or content search;
- when behavior is the question, use the smallest direct test, runtime observer, or reproduction that exercises the required boundary;
- when an exact covered effect has already been selected, use the narrowest direct mutation operation;
- when the relevant entity is genuinely unknown, use one bounded broad discovery action, then narrow from its result instead of restarting breadth.

These rules apply across repositories, filesystems, local processes, browsers, databases, APIs, and other environments. Use environment-specific guidance when available.

Bound the directory, entity, pattern, range, test target, time window, result count, requested fields, affected state, or recovery scope when the tool supports it.

Tool sophistication is not evidence quality. Choose the simplest available operation that can establish the required boundary.

## Update From Reality

After execution, identify:

- what fact, hypothesis, path, effect, or task state changed;
- what became stronger, weaker, eliminated, contradicted, or still unresolved;
- whether the interaction answered the current question or produced the intended effect;
- what next branch, if any, is now supported.

New information is not automatically decision-relevant information.

If the observation did not change the decision or distinguish alternatives, do not repeat it through synonyms, nearby files, a wider version of the same search, or another tool returning equivalent evidence. Reframe the question, choose a different observer class, or stop with the missing evidence.

When two or more recent interactions have not materially changed the current question, advanced the covered effect, or supported a new branch, read [Trajectory Stalls](references/trajectory-stalls.md) before another interaction.

Repeat the loop only while the same current owner, question, authority, and execution contract remain valid and each interaction either changes the decision surface or advances the exact covered effect.

## Return To The Current Owner

Return the observation and its material state change to the activity that requested it. Action Selection does not interpret another method’s final claim or return directly to a compute profile.

When an active execution contract exists, stop when its return condition is met. Do not reinterpret or expand the contract to keep interacting.

Return to [Workflow](../workflow/SKILL.md) when the result changes authority, accepted scope, current ownership, accepted direction, the required observing boundary, or stop conditions.

Use [Diagnose Failure](../diagnose-failure/SKILL.md) when repeated failure remains unexplained rather than selecting another speculative interaction.

Stop when:

- one next action is sufficiently supported;
- the requested effect was produced;
- no covered interaction can reduce the important uncertainty;
- the active execution contract requires return;
- another activity now owns the problem.

The objective is not fewer tool calls at any cost. It is fewer low-value interactions while preserving supported outcomes.
