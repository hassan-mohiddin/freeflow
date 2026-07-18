# Skill Development Loop

Read this when moving a skill from an unevaluated draft through measured revision to a readiness decision.

## Draft

- Define the target behavior and failure pressure.
- Identify the earliest useful first-read prompt and one nearby case.
- Declare guaranteed prior context and optional dependencies.
- Write the smallest candidate that is complete on first read.
- Record it as Draft or Unverified in the owning eval artifact, report, task memory, tool result, or delivery response.
- Keep that authoring status out of the subject `SKILL.md`.
- Use static validation for structure only.

## Evaluate The Behavioral Claim

Read [Evaluate Skill](../../evaluate-skill/SKILL.md) and name the exact claim: activation, first-read behavior, nearby behavior, dependency composition, retained use, artifact outcome, or readiness.

Preserve an adequate existing case instead of creating a replacement for process appearance. Compare the exact declared variants under fixed prompt, fixture, tools, host, model, and thinking settings. Do not use one evidence class to imply another.

## Revise From Evidence

- Classify the failed boundary before editing.
- Find the description cue, instruction, placement, dependency, reference boundary, example, or stop condition that should have prevented it.
- Change one measured pressure point when possible.
- Keep unrelated instructions and criteria stable.
- Rerun the complete fixed case after the change.

Do not add broad prose, examples, references, or scripts until the failure shows why they are needed.

## Decide Readiness

Require evidence for every claimed behavior and host. Keep unavailable activation, composition, retained-use, artifact, or cross-host evidence explicit in the owning evidence surface, not in the subject skill body.

A strong candidate normally has:

- earliest-use activation evidence;
- first-read behavior with only guaranteed context;
- a nearby case that does not get hijacked;
- pressure cases where the baseline fails and the candidate improves behavior;
- exact dependency, multi-turn, artifact, and host evidence only when claimed.

The owner decides promotion after the evidence and residual gaps are visible.
