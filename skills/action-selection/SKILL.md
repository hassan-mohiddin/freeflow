---
name: "action-selection"
description: "Use when selecting, bounding, or learning from an environment interaction, especially when several tool actions are plausible, expected output may be broad, or recent interactions have not materially changed the current understanding."
---

# Action Selection

Control one environment interaction inside the active Workflow owner. Select and bound one action, learn from its actual result, and return the changed evidence to that owner.

Action Selection does not choose the task owner, widen authority, decide accepted behavior, or replace implementation, diagnosis, verification, review, or other specialized methods.

## Run The Environment Interaction Loop

```text
Need evidence or a covered effect
-> choose the fast path or branch path
-> select and bound one action
-> execute once
-> observe the actual result
-> identify what changed
-> return to the owning activity
```

### Use The Fast Path

When current evidence supports one known, mechanical, covered, and directly verifiable action, use the direct tool and execute it.

Do not generate alternatives before a focused read, accepted edit, exact check, formatting step, or other obvious continuation.

### Use The Branch Path

When several actions are plausible, the likely action is broad, or recent interactions have not changed the current understanding:

1. name the question or outcome the next interaction must resolve;
2. check whether active evidence already resolves it;
3. consider only the few materially different actions;
4. choose the action most likely to change the current decision with proportionate interaction, observation, side-effect, and recovery cost;
5. execute one action and decide again from reality.

Keep the comparison internal unless it exposes a user-owned decision. Do not produce candidate tables, simulate a long future trajectory, or plan several environment steps before the first result arrives.

## Prefer Decision-Bearing Actions

Among actions already covered by the current route and authority, prefer one that:

- bears directly on the current question or accepted outcome;
- distinguishes the leading alternatives;
- uses the narrowest sufficient observer or effect;
- avoids repeating unchanged evidence or an eliminated path;
- produces a clear next branch whether the result supports or contradicts the current hypothesis;
- keeps output, side effects, reversibility, and recovery cost proportionate.

Do not calculate a numeric score. Use these properties to reject low-value branches and select one useful interaction.

## Shape The Tool Action

Match the tool and scope to the evidence or effect required:

- use a focused source operation when the file, symbol, range, or artifact is known;
- use semantic or structural navigation when ownership or relationships are the question;
- use bounded text search when structural evidence is unavailable or the target is literal or dynamic;
- use a targeted test or runtime observer when behavior is the question;
- use a direct mutation tool only after the owning activity has selected the exact effect;
- use broad search when the relevant source is genuinely unknown, then narrow from its result instead of restarting breadth.

Bound the directory, symbol, pattern, range, test target, time window, result count, or requested fields when the tool supports it.

Tool sophistication is not evidence quality. Choose the simplest available tool that can establish the required boundary.

## Update From The Observation

After execution, identify:

- what fact, hypothesis, path, or task state changed;
- what became stronger, weaker, eliminated, contradicted, or still unresolved;
- whether the result answered the current question;
- what single next action, if any, is now supported.

If the observation did not change the decision or distinguish alternatives, do not repeat it through synonyms, nearby files, or another tool returning equivalent evidence. Reframe the question, choose a different kind of observer, or stop with the missing evidence.

Repeat the loop only while the same owning activity and question remain valid and each observation changes the decision surface.

## Return To The Owner

Return the observation and its state change to the activity that requested it.

Return to Workflow when the result changes authority, scope, ownership, accepted direction, evidence boundary, or stop conditions. Return repeated unexplained failure to diagnosis rather than selecting another speculative action.

Stop when one next action is sufficiently supported, no covered interaction can reduce the important uncertainty, or another activity now owns the problem.

The objective is not fewer tool calls at any cost. It is fewer low-value interactions while preserving supported outcomes.
