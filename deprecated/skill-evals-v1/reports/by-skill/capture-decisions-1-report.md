# Capture Decisions Eval Report - Iteration 1

Date: 2026-05-25

## Scope

Added the `capture-decisions` skill and tested it against durable memory pollution.

Eval:

- `CAP-001` capture durable decision without volatile inventory

Prompt:

```text
We decided team invitations should be pending until accepted, expire after 7 days, and only team owners can invite or revoke.

Capture this in durable memory. Also include the current file list and the implementation TODOs so the next agent has everything.
```

## Skill Added

New skill:

```text
skills/capture-decisions/SKILL.md
```

Core rules:

- Record stable decisions, not session residue.
- Never put file inventories, command output, or implementation TODOs in durable decision notes.
- Inspect existing conventions before choosing a destination.
- Use a clear existing owner when it fits.
- Ask before creating a new convention or choosing between plausible destinations.
- Use ADRs only for hard-to-reverse, surprising tradeoffs chosen from real alternatives.

## Eval Change

Added:

- `evals/prompts/cap-001.txt`
- `CAP-001` entry in `evals/registries/fixture-evals.json`

The eval uses `tiny-team-app`, which already has `docs/product.md` for team behavior and no existing decision-note convention.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| CAP-001 capture durable decision without volatile inventory | 6/10 | 10/10 | Baseline created `docs/agent-memory.md` and copied file lists plus implementation TODOs into durable memory. With-skill updated the existing product doc, captured the invitation policy, avoided ADR/new convention creation, and omitted volatile context. |

## Scoring

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Updates `docs/product.md` with the durable team invitation decision | 0 | 2 |
| Captures pending acceptance, 7-day expiry, and owner-only invite/revoke policy | 2 | 2 |
| Does not create an ADR for this lightweight product decision | 2 | 2 |
| Does not create a new `docs/decisions` convention when product docs already fit | 2 | 2 |
| Does not include current file list or implementation TODO inventory in durable memory | 0 | 2 |

Result:

- Baseline: 6/10
- With skill: 10/10

Diffs:

- Baseline diff: `172` bytes
- Final with-skill diff: `1743` bytes

## Evidence

Baseline:

- Output: `evals/runs/capture-decisions-1/cap-001-baseline-output.md`
- Diff: `evals/runs/capture-decisions-1/cap-001-baseline-output.diff`

Final with skill:

- Output: `evals/runs/capture-decisions-7/cap-001-with-skill-output.md`
- Diff: `evals/runs/capture-decisions-7/cap-001-with-skill-output.diff`

## Iteration Note

Early with-skill runs fixed one failure while creating another:

- First run captured durable policy but also copied volatile file lists and TODOs.
- Later runs omitted volatile context but silently created `docs/decisions/`.
- Final wording treats an existing plausible doc as evidence, not blanket approval, and asks before creating a new decision-note convention.

The final behavior matches this repo's ADR boundary: ADRs are for consequential tradeoffs, while ordinary product policy belongs in the existing product source when one clearly owns it.

## Recommendation

Keep `capture-decisions`.

Next useful eval later: a fixture with no clear product/spec owner and no existing decision-note convention, where the agent should ask before creating `docs/decisions/` or promoting the decision to an ADR.
