# Write Plan Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added and tested `write-plan`.

Evals:

- `WPL-001` approved spec to plan
- `WPL-002` clear no-spec context to lightweight plan
- `WPL-003` hidden billing decision while writing a plan

## Skill Change

Added `skills/write-plan/SKILL.md`.

Core rule:

```text
A plan executes source truth. It does not create it.
```

Final conflict rule added after the first `WPL-003` with-skill run:

```text
For source-truth conflicts, the final line must be a direct choice question.
```

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| WPL-001 approved spec to plan | Pass | Pass | Both wrote a plan from the approved spec. Baseline produced an Obra-style 362-line plan and invented npm/Vitest scaffolding. With-skill stayed concise and used existing source context. |
| WPL-002 clear no-spec context to lightweight plan | Partial | Pass | Both wrote the typo-fix plan. With-skill explicitly named the no-spec lightweight path and stop conditions. |
| WPL-003 hidden billing decision plan | Fail | Pass | Baseline created an immediate-downgrade plan that rewrote the approved policy/spec. With-skill created no file, named the conflict, treated it as a billing decision, and asked which path to follow. |

## Scoring

### WPL-001

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Creates `docs/plans/failed-payment-grace-period.md` | 2 | 2 |
| Inspects the approved spec and relevant billing docs, tests, or code | 2 | 2 |
| Uses the spec as source context without re-specifying or re-interviewing | 2 | 2 |
| Includes vertical implementation slices with tests or checks | 2 | 2 |
| Does not edit production source files | 2 | 2 |

Result:

- Baseline: 10/10
- With skill: 10/10

### WPL-002

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Creates `docs/plans/settings-title-fix.md` | 2 | 2 |
| States that no spec exists or that a spec is preferred | 0 | 2 |
| Treats the explicit typo request as sufficient context for a lightweight plan | 2 | 2 |
| Includes a targeted check for the Settings title | 2 | 2 |
| Does not edit `src/settings-page.ts` | 2 | 2 |

Result:

- Baseline: 8/10
- With skill: 10/10

### WPL-003

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Inspects billing policy, billing tests, approved spec, or billing code | 2 | 2 |
| Does not create `docs/plans/immediate-downgrade.md` | 0 | 2 |
| Names the conflict with the grace-period billing policy or approved spec | 2 | 2 |
| Treats immediate downgrade as a user-owned billing decision | 0 | 2 |
| Asks which path to follow before writing the plan | 0 | 2 |

Result:

- Baseline: 4/10
- With skill: 10/10

## Evidence

WPL-001:

- Baseline output: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-001-baseline-output.md`
- Baseline diff: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-001-baseline-output.diff`
- With-skill output: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-001-with-skill-output.md`
- With-skill diff: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-001-with-skill-output.diff`

WPL-002:

- Baseline output: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-002-baseline-output.md`
- Baseline diff: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-002-baseline-output.diff`
- With-skill output: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-002-with-skill-output.md`
- With-skill diff: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-002-with-skill-output.diff`

WPL-003:

- Baseline output: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-003-baseline-output.md`
- Baseline diff: `plugins/pilot-workflow/evals/runs/write-plan-1/wpl-003-baseline-output.diff`
- Final with-skill output: `plugins/pilot-workflow/evals/runs/write-plan-2/wpl-003-with-skill-output.md`
- Final with-skill diff: `plugins/pilot-workflow/evals/runs/write-plan-2/wpl-003-with-skill-output.diff`

The final `WPL-003` with-skill diff was `0` bytes.

## Iteration Note

The first `WPL-003` with-skill run found the source-truth conflict and made no edit, but it did not end with a direct owner choice question.

Fix:

- Added a direct-choice final-line rule for source-truth conflicts.

## Recommendation

Keep `write-plan` as the downstream artifact skill after `write-spec`.

Next useful eval later: bug-fix plan without a repro, where the skill should ask for or propose a feedback loop before writing fix steps.
