---
name: bypass
description: Use when the user explicitly asks to skip or reduce workflow steps for the next action or current task.
---

# Bypass

Skip optional ceremony, not authority, judgment, safety, or evidence.

Bypass changes the workflow method within an already accepted action. It does not authorize work, expand scope, switch mode, resolve a user-owned decision, override source truth, or create host permissions.

## Establish The Boundary

Before using bypass, identify:

- the accepted action it applies to;
- the named optional step, or whether the user selected `next` or `task` scope;
- the effective mode;
- the evidence and checkpoints that still govern the action.

A bare `/bypass` means `/bypass next`. If no accepted action exists, return to [Workflow](../workflow/SKILL.md); do not treat bypass itself as implementation authorization.

Bypass never changes mode. In `conversation`, remain read-only and use [Mode Contract](../mode-contract/SKILL.md) before mutation. In `workflow` or `strict-workflow`, keep the active mode's decision and evidence pressure.

## Skip Only Optional Pressure

A bypass may remove a step that does not protect accepted intent, material risk, required evidence, or a selected checkpoint, such as:

- an unnecessary Spec or Plan;
- extended questioning whose answer would not change the action;
- an artifact created only for ceremony;
- an optional checkpoint or extra review with no remaining risk purpose.

Do not infer that a named artifact or review is optional. Inspect why it exists first.

## Preserve Non-Bypassable Boundaries

A generic or scoped bypass does not remove:

- the user's authority over product behavior, scope, public interfaces, compatibility, permissions, security, privacy, billing, data loss, migrations, deployment, or another hard-to-reverse outcome;
- a conflict with code, tests, docs, policies, requirements, accepted behavior, or another source of truth;
- host safety, sandbox, permission, or approval controls;
- proportionate verification and required self-review for every bounded activity before its result is accepted, reused, or claimed complete;
- an accepted Spec, Plan, selected checkpoint, required artifact review, selected independent review, or other accepted completion boundary;
- a stop condition or evidence that invalidates the current route.

Material risk still needs the decisions and evidence that address that risk. A domain label alone does not require ceremony, but bypass cannot erase an observed risk.

If the user wants to change an accepted requirement, evidence boundary, or selected review, treat that as a route change rather than bypass. Use [Decision Gate](../decision-gate/SKILL.md) when one user-owned choice or source conflict blocks progress; use Workflow when the route itself must change.

## Apply The Selected Scope

### Next

`/bypass next` skips one identified optional step for the current accepted action. Re-check the route immediately after skipping it.

If that step was the only remaining optional pressure, complete the bounded action and verify it. The bypass is then spent. It also expires if the action changes, another gate appears, or the route stops.

### Task

`/bypass task` reduces optional workflow pressure for the current accepted task. The task is the accepted request or active Working Record scope—not the repository, session, or future related work. If that boundary is unclear, ask before applying task scope.

The task scope ends at completion, abandonment, material scope change, or explicit withdrawal. Reassess each new risk, conflict, checkpoint, and completion claim inside that scope.

When an existing Working Record is already authorized for maintenance and task-scoped bypass must survive context loss, record its exact source, scope, and expiry through [Track Work](../track-work/SKILL.md). The record preserves the instruction; it does not broaden it. Without durable task memory, do not claim bypass survives context loss.

Never convert either scope into a permanent, repository-wide, or cross-task bypass.

## Act Or Stop

When the bypass is valid:

1. skip only the selected optional pressure;
2. perform only the separately authorized bounded action;
3. gather the same proportionate evidence the outcome requires;
4. silently self-review the supported result before accepting, reusing, or reporting it;
5. report what was skipped, the result, and whether the bypass is spent or still task-scoped.

When a boundary remains:

1. do not perform the blocked action;
2. name the boundary bypass cannot remove;
3. route to the owning mode, decision, discussion, or workflow step.
