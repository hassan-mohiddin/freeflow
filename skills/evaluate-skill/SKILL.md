---
name: evaluate-skill
description: Use when evaluating or comparing agent-skill behavior.
---

# Evaluate Skill

Run controlled baseline-versus-candidate comparisons and preserve evidence for judgment. The evaluator does not decide whether a skill is good, ready, promotable, or suitable for production.

## Name One Question

A **group** asks one behavioral question through exactly two variants:

- `baseline`: no target skill or a previous snapshot;
- `candidate`: a new or updated snapshot.

A **suite** is an ordered batch of groups. Keep description and body questions separate by default:

- a description group asks whether a natural prompt caused the exact target `SKILL.md` to be read, and when;
- a body group deliberately supplies the body and asks what behavior followed;
- an end-to-end group may combine activation and behavior only when that integrated path is the question.

Do not treat direct body delivery as activation evidence.

## Fix Inputs Before Running

Declare the prompt or turns, target snapshots, other ordered skills, fixture, tools, model, thinking level, deterministic expectations, and review questions before subject output exists. Use the exact [group and suite schema](references/definition-schema.md); definition loading and selection do not execute subjects.

Keep equivalent inputs fixed across variants except for the declared target difference. Use fresh writable fixtures and immutable declared skill/context inputs. Ambient context is not declared composition.

## Run Subjects Directly

Use Pi as the subject process. One-shot groups settle once; multi-turn groups keep one isolated RPC process per variant and settle each declared turn in order.

The current executable boundary is one-shot description groups with a natural `input.prompt`, working-tree skills, no fixture or declared context, and only the `read` tool when a tool is needed. `run` rejects other accepted definition shapes before starting a subject rather than misreporting them as failed evaluations.

Run groups serially by default. Persist each selected run before grading or continuing. A variant-local invalid or infrastructure failure must not erase evidence or prevent a safe counterpart or later group from running. Cancellation marks queued selected work `cancelled` without starting more subjects.

Normal completion follows subject settlement. Replace ambient host system, append, and context instructions with evaluator-owned context containing only declared tools and skills. Cancellation, process-tree cleanup, path isolation, no-progress detection, and very high emergency ceilings are safeguards, not behavioral grades. Do not impose ordinary guessed turn, token, spend, output, or short time caps.

## Grade Facts, Preserve Meaning

Append deterministic grades after canonical run evidence exists. A grade is derived evidence and never mutates or invalidates the run.

Useful deterministic facts include exact skill/resource reads, read turns, paths, changed paths, file text, explicit JSON states, response text, and approved command outcomes. Failed checks are behavioral observations, not infrastructure failures. Missing evidence stays unavailable.

Do not launch an automatic semantic grader. For body behavior, preserve criterion-relevant evidence and review questions so the active agent or user can judge meaning.

## Inspect Evidence

Prefer generated grade-first views for routine inspection. Keep canonical artifacts exact and expose direct paths for the run, events, transcript, final response, stderr, definition, and deterministic grade so ordinary file tools can read them directly. A view may remove transport noise and repeated structure; it must not hide evidence required by the group question.

The canonical [skill-eval entrypoint](scripts/skill-eval.mjs) owns the `run` and `view` command surface. `view` renders stored one-shot results by result, group, and variant. Run the entrypoint with `--help` before relying on an operation. If an operation is outside the executable boundary, execute the declared comparison directly and preserve the same evidence boundary; never invoke archived evaluators.

## Report

Report what ran, what evidence exists, deterministic results, infrastructure failures, unavailable evidence, and the exact scope viewed. Use [Write Skill](../write-skill/SKILL.md) when accepted evidence calls for an authoring change. Leave readiness, promotion, release, and production-use decisions to the user and the owning workflow.
