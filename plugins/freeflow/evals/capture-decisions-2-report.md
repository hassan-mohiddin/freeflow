# Capture Decisions Eval Report - Iteration 2

Date: 2026-05-26

## Scope

Added destination guidance for `capture-decisions`, focused on the missing-convention case from iteration 1.

Eval added:

- `CAP-002` capture destination ambiguous without convention

Regression rerun:

- `CAP-001` capture durable decision without volatile inventory

## Skill Change

Updated:

- `plugins/freeflow/skills/capture-decisions/SKILL.md`
- `plugins/freeflow/skills/capture-decisions/references/destination-guide.md`

Core changes:

- refreshed the trigger description around settled durable decisions and session residue
- kept `SKILL.md` under 100 lines with a clear progressive-disclosure reference
- made generic docs and README fallback explicitly unsafe unless they already own the decision type
- added destination guidance for glossary, ADR, spec, handoff, product/policy, rejected approach, and workflow/process decisions
- pointed new durable decision artifacts at the shared artifact-standard header when future agents or teammates will rely on them

## Eval Change

Added:

- `plugins/freeflow/evals/fixtures/tiny-decision-destination-app/`
- `plugins/freeflow/evals/prompts/cap-002.txt`
- `CAP-002` entry in `plugins/freeflow/evals/fixture-evals.json`

The fixture explicitly has no `CONTEXT.md`, glossary, product doc, specs, ADRs, or `docs/decisions/` convention. The prompt asks to capture a durable domain term and scope decision, while also pressuring the agent to include file inventory and tomorrow TODOs.

## Results

| Eval | Baseline | With Skill | Read |
| --- | ---: | ---: | --- |
| CAP-002 destination ambiguous without convention | 2/10 | 10/10 | Baseline created `docs/decisions/`, rewrote README to establish the convention, and copied volatile inventory/TODOs. With-skill made no file changes, asked for destination confirmation, and omitted volatile context. |
| CAP-001 durable decision without volatile inventory | Not rerun | 10/10 | Regression still updates existing `docs/product.md`, captures the team invitation policy, avoids ADR/new convention creation, and omits volatile context. |

## Scoring

CAP-002:

| Assertion | Baseline | With Skill |
| --- | ---: | ---: |
| Does not create, modify, or delete any file | 0 | 2 |
| Inspects existing docs or repo conventions before deciding | 2 | 2 |
| Does not create `docs/decisions`, an ADR, glossary, spec, product doc, or similar new convention without asking | 0 | 2 |
| Asks a focused destination question for the durable `RiskReview` term and automated retry scope decision | 0 | 2 |
| Does not include current file inventory or tomorrow TODOs in durable memory or the final response | 0 | 2 |

CAP-001 regression:

| Assertion | With Skill |
| --- | ---: |
| Updates `docs/product.md` with the durable team invitation decision | 2 |
| Captures pending acceptance, 7-day expiry, and owner-only invite/revoke policy | 2 |
| Does not create an ADR for this lightweight product decision | 2 |
| Does not create a new `docs/decisions` convention when product docs already fit | 2 |
| Does not include current file list or implementation TODO inventory in durable memory | 2 |

## Evidence

CAP-002 baseline:

- Output: `plugins/freeflow/evals/runs/capture-decisions-2/cap-002-baseline-output.md`
- Diff: `plugins/freeflow/evals/runs/capture-decisions-2/cap-002-baseline-output.diff`
- Diff size: `1206` bytes

CAP-002 final with skill:

- Output: `plugins/freeflow/evals/runs/capture-decisions-3/cap-002-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/capture-decisions-3/cap-002-with-skill-output.diff`
- Diff size: `0` bytes

CAP-001 regression:

- Output: `plugins/freeflow/evals/runs/capture-decisions-3/cap-001-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/capture-decisions-3/cap-001-with-skill-output.diff`
- Diff size: `1066` bytes

Line counts:

- `capture-decisions/SKILL.md`: `89`
- `capture-decisions/references/destination-guide.md`: `63`

## Notes

For fixture evals, pass an output path that includes the desired run folder. A bare output filename is written relative to the caller's working directory.

## Recommendation

Keep the destination guide. It closes the missing-convention failure without bloating the main skill or making README a fallback source of truth.
