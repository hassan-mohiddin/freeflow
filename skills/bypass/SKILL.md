---
name: bypass
description: "Use when the user explicitly asks to skip or reduce optional workflow pressure for the next authorized activity or the current task."
---

# Bypass

Reduce explicitly selected optional workflow pressure without changing authority, accepted intent, the current owner, execution method, evidence semantics, selected checkpoints, mode, active capability protocols, or host controls.

Bypass is a user-controlled pressure modifier. It does not authorize the underlying work and does not perform that work itself.

**Optional pressure** is a workflow step whose removal does not weaken accepted intent, material risk control, required evidence, a selected checkpoint, or safe continuation.

## Interpret The Request Narrowly

Use Bypass only when the user explicitly asks to skip or reduce workflow pressure. Do not infer bypass from urgency, frustration, brevity, “just do it,” or a preference for concise responses.

Establish:

- the already-authorized bounded activity;
- the specific pressure the user wants removed;
- whether the requested scope is `next` or `task`;
- the authority, evidence, checkpoints, and stop conditions that remain;
- when the bypass expires.

A bare `/bypass` means `/bypass next`.

If the same user turn both authorizes an activity and explicitly requests reduced pressure, interpret the whole turn through [Workflow](../workflow/SKILL.md). Bypass may modify that authorized activity; it does not supply its authority.

If no authorized activity exists, return to Workflow and wait. Do not treat bypass as permission to implement, inspect actively, mutate, deliver, commit, or continue.

## Skip Only Optional Pressure

A valid bypass may remove:

- an unnecessary Spec, Plan, or Working Record;
- extended questioning whose answer would not change the accepted activity;
- an artifact created only for ceremony;
- duplicate explanation or status reporting;
- a proposed but unselected review or checkpoint with no remaining risk purpose;
- another optional step whose removal does not weaken the supported outcome.

Do not infer that a named artifact, review, check, or checkpoint is optional. Inspect what it protects before removing it.

Freeflow should already avoid unnecessary ceremony. Bypass is an explicit user override when optional pressure was proposed or recommended but was not selected as a required boundary, or would otherwise remain in the route.

## Preserve Non-Bypassable Boundaries

Bypass does not remove or override:

- the user’s authority over product behavior, scope, priorities, public interfaces, compatibility, permissions, security, privacy, billing, data loss, migration direction, deployment, or another hard-to-reverse outcome;
- conflicts among the request, code, tests, docs, policies, requirements, accepted behavior, or another source of truth;
- the accepted authority envelope or separately controlled effects;
- host safety, sandbox, permission, approval, or tool controls;
- mode boundaries or active capability protocols;
- the distinction between available evidence and supported claims;
- required self-review before accepting or reusing a supported result;
- an accepted Spec, Plan, selected checkpoint, required artifact review, or selected independent review;
- a stop condition, blocker, or evidence that invalidates the current route.

Material risk still requires the decisions and evidence that address it. A domain label alone does not require ceremony, but bypass cannot erase an observed risk.

Bypass cannot allow an active compute profile to act outside its execution protocol. Use the capability’s own user controls when the user wants to change manual or automatic control, profile behavior, or another capability setting.

## Respect Declined Evidence Without Inventing Support

A user may explicitly decline a test, build, runtime probe, review, or other evidence generation. Respect that instruction unless a higher-priority repository, host, or safety requirement prevents it.

Declining evidence does not make the corresponding claim supported.

When evidence is declined:

- perform only the remaining authorized work that can continue safely;
- leave the affected claim explicitly unverified;
- do not accept or reuse the result beyond the remaining evidence boundary;
- do not cross a checkpoint or dependent boundary that requires the missing evidence;
- return to Workflow when the expected exit, checkpoint, or safe continuation must change.

A request to skip evidence generation changes what may be claimed. It does not change what the available evidence proves.

## Route Changes Are Not Bypass

Treat the request as a Workflow route change when the user wants to:

- change accepted behavior, scope, effects, or stop conditions;
- weaken or replace an accepted evidence requirement;
- cancel or replace a selected checkpoint;
- revise an accepted Spec or Plan;
- change mode or an active capability protocol;
- continue despite contradictory evidence or a source conflict.

An explicit user instruction may authorize the changed route, but Workflow must reconcile its consequences before dependent work continues.

Use [Decision Gate](../decision-gate/SKILL.md) only when one user-owned choice or source conflict remains unresolved.

## Apply The Selected Scope

### Next

`/bypass next` removes one identified optional pressure from the current authorized activity.

The bypass is spent when:

- the selected pressure is skipped;
- the activity changes;
- another gate or stop condition appears;
- the route ends.

Re-check the route immediately after applying it. Do not carry the bypass into another activity by implication.

### Task

`/bypass task` reduces identified optional pressure for the current accepted task.

The task is the accepted request or active Working Record scope—not the repository, session, branch, or future related work.

Name the pressure being reduced when possible. Do not interpret task scope as “ignore all workflow for this task.”

Task scope ends when:

- the task completes or is abandoned;
- its accepted outcome changes materially;
- the user withdraws or replaces the bypass;
- a new task begins.

Reassess new risks, conflicts, evidence requirements, checkpoints, and separately controlled effects inside the task. Task scope does not make them optional.

When an existing Working Record is already authorized for maintenance and the task-scoped bypass must survive context loss, use [Track Work](../track-work/SKILL.md) to preserve its source, exact pressure, scope, and expiry.

The record preserves the user instruction; it does not broaden it. Without durable task memory, do not claim task-scoped bypass survives context loss.

Never convert `next` or `task` scope into permanent, repository-wide, session-wide, or cross-task behavior.

## Return The Modified Route

When the bypass is valid:

1. identify the optional pressure being removed;
2. apply only the selected scope;
3. return the reduced-pressure route to the unchanged current owner;
4. let that owner perform the separately authorized activity;
5. preserve the same evidence honesty, self-review, and stop conditions;
6. report what was skipped only when it materially clarifies the result or remaining scope.

Do not narrate internal bypass state on every turn. Speak in ordinary engineering language unless the scope or expiry matters to the user.

When a boundary remains:

1. do not perform the blocked action;
2. state the boundary the bypass cannot remove;
3. return to Workflow, Decision Gate, or the relevant current owner.

Bypass ends when the selected optional pressure has been removed, its scope expires, or a non-bypassable boundary requires another route.
