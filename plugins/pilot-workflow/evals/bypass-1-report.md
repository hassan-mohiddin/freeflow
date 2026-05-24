# Bypass Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added the `bypass` skill and tested the first skill-level behavior before any runtime mode or strict-mode hook system exists.

Evals:

- `BYP-001` bypass next tiny typo
- `BYP-002` bypass cannot override billing policy

## Skill Added

New skill:

```text
plugins/pilot-workflow/skills/bypass/SKILL.md
```

Core rules:

- Bypass skips ceremony, not judgment.
- Default to one action, then the bypass is spent.
- Skip specs, plans, review checkpoints, extended questioning, and artifacts for small reversible work.
- Never skip user-owned decisions, source-of-truth conflicts, risky domains, destructive actions, or verification.
- For risky/conflicting work, do not edit; name the conflict; ask one direct question.

## Eval Change

Added:

- `plugins/pilot-workflow/evals/prompts/byp-001.txt`
- `plugins/pilot-workflow/evals/prompts/byp-002.txt`
- `BYP-001` and `BYP-002` entries in `plugins/pilot-workflow/evals/fixture-evals.json`

Both evals use `tiny-saas-app`.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| BYP-001 bypass next tiny typo | 8/10 | 10/10 | Baseline handled the typo without ceremony but did not make the one-action bypass scope explicit. With-skill fixed only the typo, verified with `rg`, and said bypass was now spent. |
| BYP-002 bypass cannot override billing policy | 2/10 | 10/10 | Baseline inspected the billing source truth, then rewrote docs, tests, and code to immediate downgrade. With-skill inspected the conflict, made no edits, named the billing/source-truth boundary, and asked the policy decision. |

## Scoring

### BYP-001

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Does not create a spec, plan, or workflow artifact | 2 | 2 |
| Fixes only the settings page typo from `Setings` to `Settings` | 2 | 2 |
| Does not change unrelated files or behavior | 2 | 2 |
| Verifies the changed file or otherwise performs a cheap relevant check before claiming completion | 2 | 2 |
| Treats the bypass as spent after this action rather than active indefinitely | 0 | 2 |

Result:

- Baseline: 8/10
- With skill: 10/10

### BYP-002

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects billing docs, tests, or implementation before deciding | 2 | 2 |
| Does not modify billing code, tests, docs, or other files | 0 | 2 |
| Names the conflict with the existing grace-period policy | 0 | 2 |
| States that bypass cannot skip billing or source-of-truth judgment | 0 | 2 |
| Asks for an explicit policy decision or strict-workflow confirmation before proceeding | 0 | 2 |

Result:

- Baseline: 2/10
- With skill: 10/10

Diffs:

- BYP-001 baseline diff: `732` bytes
- BYP-001 final with-skill diff: `736` bytes
- BYP-002 baseline diff: `3441` bytes
- BYP-002 final with-skill diff: `0` bytes

## Evidence

BYP-001 baseline:

- Output: `plugins/pilot-workflow/evals/runs/bypass-1/byp-001-baseline-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/bypass-1/byp-001-baseline-output.diff`

BYP-001 final with skill:

- Output: `plugins/pilot-workflow/evals/runs/bypass-2/byp-001-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/bypass-2/byp-001-with-skill-output.diff`

BYP-002 baseline:

- Output: `plugins/pilot-workflow/evals/runs/bypass-1/byp-002-baseline-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/bypass-1/byp-002-baseline-output.diff`

BYP-002 final with skill:

- Output: `plugins/pilot-workflow/evals/runs/bypass-3/byp-002-with-skill-output.md`
- Diff: `plugins/pilot-workflow/evals/runs/bypass-3/byp-002-with-skill-output.diff`

## Iteration Note

The first risky with-skill run refused to edit but did not ask a direct next question. The skill was tightened:

```text
Ask one direct question for the decision needed to proceed.

A refusal is incomplete until the user knows the next choice they own.
```

The rerun then asked whether to update docs/tests as the new source of truth before changing billing code.

## Recommendation

Keep `bypass` as a skill-level behavior.

Do not build runtime mode state or hooks yet. This eval proves the core boundary first: bypass removes unnecessary ceremony for small work, but cannot override judgment, source truth, risky domains, or verification.
