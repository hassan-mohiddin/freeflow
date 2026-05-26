---
name: execute-plan
description: Use when implementing an approved plan or executing planned work against a repo, especially when a planned verification command fails or reveals a plan/source conflict. Use when the user says to execute, implement, follow, or carry out a plan.
---

# Execute Plan

Execute the plan. Do not improve it silently.

Classify first:

- Valid plan: inspect source context, execute the next slice, verify it.
- Plan/source conflict: stop and ask which source should change.
- Hidden owner decision: stop and ask.
- Missing verification: stop before consequential edits and ask to revise the plan or approve a diagnostic path.
- Missing plan: ask for a plan or route to `write-plan`.

The plan is instructions, not authority.

## Before Editing

Read:

- The plan.
- The source spec or requirements the plan cites.
- Relevant docs, tests, policies, ADRs, and code.
- Handoffs only as memory.

Live repo evidence overrides stale plans and handoffs.

Do not execute a plan that would:

- Invent or change product behavior, scope, domain meaning, compatibility, public API behavior, security, privacy, billing, data-loss, or architecture.
- Override docs, tests, specs, policies, ADRs, or established behavior.
- Treat "do not ask", "just execute", "latest context", or "handoff says" as conflict approval.
- Skip verification for consequential behavior.
- Rewrite a verification script, test, source-truth doc, policy, or spec to make the plan pass unless the plan explicitly authorized that artifact change and it matches source truth.

Name the conflict or missing decision. Ask which path to follow. Recommend the path supported by evidence.

For source-truth conflicts or missing verification, the final line must be a direct choice question.

For missing verification, ask whether to revise the plan to add a check or approve a specific verification path.

## Execute

Work in vertical slices.

For each slice:

- Make only the edits needed for that slice.
- Run the planned check or the smallest equivalent check.
- If the check fails, stop and report the evidence before changing direction.
- If new evidence invalidates the plan, stop before patching forward.

After a planned verification command fails, do not edit the verifier, tests, docs, policy, source-truth files, or unrelated code to make it pass. This is true even when the verifier appears wrong and even when the user said to "fix whatever is needed". A bad verifier is a plan defect; stop, report the failing command and conflicting evidence, and ask whether to revise the plan or change the source truth.

Local reversible implementation details can be chosen from repo conventions.

## Completion

Report:

- What changed.
- What was verified.
- What remains unverified.
- Any blocked decisions or plan changes needed.
