---
name: evaluate-skill
description: Evaluate agent-skill behavior. Use when preserving a skill failure, designing or running a case, comparing old/no-skill controls with a candidate, grading saved artifacts, checking activation, or deciding whether evidence supports a skill revision or readiness claim.
---

# Evaluate Skill

> Status: Unverified v2 candidate

Judge behavior under pressure. Evidence outranks confident prose.

## Route First

- If saved artifacts answer the question, grade them before proposing a rerun or wording change.
- If an existing eval already preserves the failure and fixed criteria, reuse it unchanged.
- If the user asks for a draft only, create the smallest source artifact and label it Draft or Unverified. Do not fake a run.
- If production readiness matters, require evidence for the claimed behavior and host support.
- Follow explicit user constraints. Permission to skip is not pressure to ignore; do not mutate adequate evidence merely to prove eval-first ordering.

## Name The Question

Distinguish structure, explicit wording, native activation, artifact behavior, multi-turn state, and cross-host behavior. Do not substitute one evidence class for another.

Direct body injection cannot prove automatic activation. One-shot output cannot prove multi-turn memory. One host cannot prove another host's behavior.

Read [evaluation architecture](references/evaluation-architecture.md) when selecting evidence classes or separating roles. Read [eval patterns](references/eval-patterns.md) when choosing a case, fixture, transcript, or comparison.

## Smallest Valid Loop

1. Write fixed criteria before candidate output exists.
2. Preserve one strong pressure case.
3. Choose a fair variant: no-skill, exact old snapshot, current release, candidate, or composition.
4. Plan before spending model calls.
5. Run controls and candidates with the same prompt, fixture, tools, host, model, and thinking settings.
6. Grade objective artifacts first; use a fresh semantic grader only for unresolved meaning.
7. Classify the failure: activation, wording, placement, missing stop, structure, fixture, host, or grader.
8. Revise one measured pressure point and rerun the failed candidate side first.

## Execution

Use direct child processes for ordinary cases. Do not spend parent/subagent context merely to run a subject.

Use `node scripts/skill-eval.mjs doctor|init|plan|run|grade|report` for the bundled workspace. Inspect `plan` for variants, evidence, capabilities, cache eligibility, and model-call count before `run`.

The default project source lives under `.skill-eval/<skill-name>/`. Subjects receive only the natural prompt, isolated fixture, selected immutable skill snapshot, and allowed tools. They must not receive assertions, expected outcomes, reports, or another variant.

Read [portable execution](references/portable-execution.md) for capability fallbacks and isolation. Read [token-efficient execution](references/token-efficient-execution.md) before expanding cases, repeats, models, or hosts.

## Grading

- Files, diffs, exit status, events, usage, and protocol fields are objective evidence.
- Final response is lower priority than contradictory artifacts.
- A subject never grades its own run in the same conversation.
- Semantic graders use fresh context, fixed criteria, opaque labels, sanitized paths, and explicit uncertainty.
- Missing usage or cost is unavailable, not zero.
- Cache controls only when every behavior-relevant fingerprint input matches.

Read [grading priority](references/grading-priority.md) when artifacts conflict. Read [grading and revision](references/grading-and-revision.md) when deciding reruns or skill changes.

## Stop

Stop rather than overclaim when required activation, isolation, multi-turn, or host evidence is unavailable. Label a cheaper fallback Diagnostic or Unsupported when it changes the question.

If the user forbids evidence required for a production claim, name the conflict and ask which claim should change. The owner decides disputed behavior and promotion.
