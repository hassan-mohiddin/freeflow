# Execute Work Loop

Read this when execution spans multiple bounded actions or slices, resumes from prior state, needs a specialized method, reaches a selected checkpoint, or reveals follow-on work. [Execute Work](../SKILL.md) owns the normal method; this reference expands its directed routes.

## Directed Execution Graph

```text
[Requested or approved concrete work; effective mode permits mutation]
-> [Orient]
   source + authority + live state + current slice + stop conditions
-> [Choose one bounded action]
-> [Load one needed method or reference]
-> [Execute]
-> [Test or observe]
-> [Verify the claim at its required boundary]
   -> clear local defect
      -> [Correct within authority]
      -> [Test or observe]
   -> unclear or repeated failure
      -> [Diagnose Failure]
      -> [Workflow routes from the cause]
   -> contradicted, inconclusive, or route-changing evidence
      -> [Workflow]
   -> supported
      -> [Silent self-review]
      -> [Correct clear local issue and re-verify, or freeze]
-> [Route from the supported state]
   -> more accepted work for the same coherent result
      -> [Choose the next bounded action]
   -> accepted extension to result / scope / authority / evidence / stop conditions
      -> [Record write-ahead when a Working Record exists]
      -> [Choose the next bounded action]
   -> distinct result, authority, or independently useful evidence boundary
      -> [Workflow establishes current slice outcome]
      -> [Select a new authorized slice; use Track Work when present]
   -> approved checkpoint due
      -> [Use checkpoint owner]
      -> [Return its result to Workflow]
   -> unapproved follow-on work
      -> [Recommend exact scope and wait]
   -> supported pause or exit
      -> [Preserve state and report]
```

The graph may recur many times inside one Track Work slice. An action, verification run, self-review, review report, or owning-skill call does not create or close a slice by itself.

## Select A Method For The Action

Use only the method needed by the concrete boundary:

- Use [TDD](../../tdd/SKILL.md) for test-first behavior work. Read [Test Design](../../tdd/references/test-design.md) when the test seam, oracle, double, or composed failure is unclear.
- Use [Simplify Code](../../simplify-code/SKILL.md) for behavior-preserving simplification. Read [Simplification Patterns](../../simplify-code/references/simplification-patterns.md) when choosing or judging a transformation.
- Use [Design for Depth](../../design-for-depth/SKILL.md) when direct evidence shows design-bearing ownership, interface, state, failure-unit, or coordination pressure. Read [Design Pressure Signals](../../design-for-depth/references/design-pressure-signals.md) or the [Interface Design Loop](../../design-for-depth/references/interface-design-loop.md) only when their deeper branch applies.
- Use [Diagnose Failure](../../diagnose-failure/SKILL.md) when a failure lacks a supported cause. Read the [Diagnostic Loop Catalog](../../diagnose-failure/references/diagnostic-loop-catalog.md) when choosing a reproduction or distinguishing observation, or [Flaky and Performance Diagnosis](../../diagnose-failure/references/flaky-and-performance.md) for those failure types.

Do not stack methods because several descriptions match. Keep one execution owner and add only the lenses or evidence methods the current action requires.

## Route Selected Checkpoints

A user-approved Plan or explicit discussion may select review, local commit, user-decision, or continuity checkpoints. When one becomes due, do not begin the next bounded action first. Use its owner and return the result to Workflow. If its conditions no longer hold, return the deviation rather than forcing the checkpoint.

Use these separately controlled routes only when already requested or approved:

- [Commit Work](../../commit-work/SKILL.md), with [Staging Decisions](../../commit-work/references/staging-decisions.md) for mixed changed state;
- [Migration Work](../../migration-work/SKILL.md), with the [Migration Lifecycle](../../migration-work/references/migration-lifecycle.md) for migration units, compatibility, cutover, recovery, or removal proof;
- [Finish Branch](../../finish-branch/SKILL.md), with [Integration Options](../../finish-branch/references/integration-options.md) for merge, pull request, preservation, or discard;
- [Release Work](../../release-work/SKILL.md), with [Release Evidence](../../release-work/references/release-evidence.md) for source, version, artifact, tag, publication, or consumer identity;
- [Launch Work](../../launch-work/SKILL.md), with [Launch Readiness](../../launch-work/references/launch-readiness.md) for production evidence, rollout, signals, or recovery;
- [Handoff](../../handoff/SKILL.md), with [Handoff Templates](../../handoff/references/templates.md) after destination and purpose are clear.

A checkpoint result may support continuation, correction, another route, deferment, or stopping. It does not authorize the next lifecycle stage automatically.

## Resume Or Return

When resuming, reopen the source that established the work and inspect live state. If a Working Record exists, request its bounded `resume` view through [Track Work](../../track-work/SKILL.md), then retrieve exact entities only when the next decision needs them; do not reconstruct authority or progress from a summary alone.

Continue only while accepted authority and evidence support the execution basis. Return to [Workflow](../../workflow/SKILL.md) when direction, authority, scope, source truth, strategy, or the intended result changes, or when no worthwhile safe continuation remains.
