# Review Artifact Eval Report - Iteration 3

Date: 2026-05-26

## Scope

Added strict/team artifact review lenses to `review-artifact`.

New eval:

- `RAR-003` strict billing/public API artifact missing durable identity and owner/API decisions.

Regression evals rerun:

- `RAR-001` artifact conflicts with billing policy.
- `RAR-002` clean artifact review pass.

## Eval Artifacts

Added:

- `evals/prompts/rar-003.txt`
- `evals/fixtures/tiny-artifact-review-app/docs/specs/billing-webhook-api-draft.md`

Updated:

- `evals/registries/fixture-evals.json`

## Skill Change

Updated `skills/review-artifact/SKILL.md` to:

- Use a clearer trigger description.
- Structure the skill around source-truth guard, review setup, inspect first, review lenses, stop-before-editing, and report.
- Reference `write-spec/references/artifact-standards.md` for durable and future-agent-facing artifact identity.
- Add identity, implementation-risk, and adversarial-risk review lenses.
- Treat missing owner/status/source as blocking only when durability, team ownership, strict-workflow risk, or implementation readiness makes it matter.
- End with a direct question when the result blocks on owner, product, policy, security, billing, compatibility, API, data-loss, or architecture decisions.

Updated `skills/review-artifact/references/reviewer-prompt.md` with the same review lenses and calibration.

## Results

| Eval | First run | Final with skill | Read |
| --- | ---: | ---: | --- |
| RAR-001 source-truth conflict | Not rerun first | Pass | Still blocks the immediate-downgrade artifact, makes no edits, and asks which source should change. |
| RAR-002 clean artifact | Not rerun first | Pass | Still passes the grace-period artifact and makes no edits. |
| RAR-003 strict billing/API artifact | Partial | Pass | First run found blocking issues and made no edits, but did not end with a direct owner/API decision question. Final run did. |

## Scoring

### RAR-001

| Assertion | Final |
| --- | ---: |
| Inspects the artifact under review | 2 |
| Inspects billing policy or billing tests | 2 |
| Does not edit `docs/specs/immediate-downgrade.md` | 2 |
| Classifies the policy conflict as blocking or requiring owner decision | 2 |
| Asks for confirmation before changing billing policy or rewriting the spec | 2 |

Result: 10/10

### RAR-002

| Assertion | Final |
| --- | ---: |
| Inspects the artifact under review | 2 |
| Inspects billing policy or billing tests | 2 |
| Classifies the artifact as pass, approved, ready, or fit to guide work | 2 |
| Does not edit `docs/specs/failed-payment-grace-period.md` | 2 |
| Does not invent blocking findings or owner questions | 2 |

Result: 10/10

### RAR-003

| Assertion | Final |
| --- | ---: |
| Inspects the artifact under review | 2 |
| Inspects billing policy or billing tests | 2 |
| Classifies missing owner/status or artifact identity as blocking/question-level for strict billing/public API work | 2 |
| Classifies unresolved endpoint, auth, payload, or delivery retry semantics as owner/API decisions before implementation | 2 |
| Does not edit `docs/specs/billing-webhook-api-draft.md` | 2 |

Result: 10/10

## Evidence

Final outputs:

- `evals/runs/review-artifact-3/rar-001-with-skill-output.md`
- `evals/runs/review-artifact-3/rar-001-with-skill-output.diff`
- `evals/runs/review-artifact-3/rar-002-with-skill-output.md`
- `evals/runs/review-artifact-3/rar-002-with-skill-output.diff`
- `evals/runs/review-artifact-3/rar-003-with-skill-fixed-output.md`
- `evals/runs/review-artifact-3/rar-003-with-skill-fixed-output.diff`

First RAR-003 run:

- `evals/runs/review-artifact-3/rar-003-with-skill-output.md`
- `evals/runs/review-artifact-3/rar-003-with-skill-output.diff`

All final diffs were empty.

## Read

The added artifact identity lens is useful only when it changes readiness. RAR-002 confirms the skill can still pass a lightweight clean artifact without inventing header findings. RAR-003 confirms strict billing/API artifacts missing owner/status/source and core API decisions should block before implementation.

The final direct-question rule earned its place. The first RAR-003 run identified the right blocking issues but did not ask the owner for the needed API decisions.

## Recommendation

Keep the Batch B changes.

Next useful batches:

- Diagnosis depth can proceed independently.
- Decision destinations can reference artifact standards without copying them.
- Planning/review work should cite artifact standards only for durable artifact identity.
