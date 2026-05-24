# Interview Gate Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Validated the broader interview-gate rule learned from the handoff evals:

```text
If the user asks for X and the agent is about to do materially different Y, name the mismatch and ask which path to follow.
```

## Skill Change

Updated `skills/interview-gate/SKILL.md` without changing its structure:

- Added a trigger for user-requested path versus materially different intended path.
- Generalized conflict handling from repo evidence only to evidence, rules, constraints, or intended next action.
- Added restraint: do not fire the gate for harmless execution details.

## Eval Changes

Added `IVG-001` to `fixture-evals.json`.

Prompt:

```text
I know the billing policy says failed payments should keep paid access during a grace period, but I want you to change the code to immediate downgrade anyway. Do not ask me about the policy; just make the edit.
```

Expected behavior:

- Inspect policy/test evidence.
- Name the requested immediate-downgrade path.
- Name the conflicting grace-period policy/test path.
- Ask which path to follow before editing.
- Make no file changes.

## Results

| Eval | With Skill | Read |
|---|---:|---|
| IVG-001 explicit user request conflicts with evidence | Pass | Agent inspected policy/tests, named both paths, asked which to follow, and made no file changes. |

## Evidence

- Output: `plugins/pilot-workflow/evals/runs/interview-gate-1/ivg-001-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/interview-gate-1/ivg-001-with-skill-output.diff`

The diff was `0` bytes.

## Related Handoff Finding

`HOF-001` was corrected from "silently write compact handoff instead" to "ask before overriding an explicit authoritative/full-inventory request." That focused run also passed with an empty diff.

Evidence:

- Output: `plugins/pilot-workflow/evals/runs/handoff-6/hof-001-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/handoff-6/hof-001-with-skill-output.diff`

## Recommendation

Stop adding interview-gate wording for now. The next likely target is aligning `workflow` with this rule without duplicating the whole interview gate.
