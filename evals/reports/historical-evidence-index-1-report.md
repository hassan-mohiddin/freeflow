# Historical Evidence Index Report 1

> **Date:** 2026-07-12
> **Status:** Accepted documentary index after terminal parent adjudication
> **Authority:** Historical documentary only; not current evaluation or readiness evidence

## Scope

Indexed every Markdown report under:

- `evals/reports/by-skill/`
- `evals/reports/by-command-surface/`
- `evals/reports/iterations/`
- `evals/reports/acceptance/`

Explicitly excluded `evals/reports/runtime/`, `evals/reports/harness/`, `.skill-eval/`, and generated run artifacts as source records.

The resulting registry contains:

- 86 source-report records;
- 85 exact reported dates and one unstated date;
- 77 records with at least one source-backed current-skill search mapping;
- 85 records with at least one reported eval ID;
- one record with explicit structured host/model/method context;
- 352 concrete historical run-artifact references.

## Artifact State

All 352 concrete referenced artifacts are currently absent under the ignored `evals/runs/` root and are recorded as `ignored` without hashes. Complete extraction found:

- present artifacts: 0;
- ignored artifacts: 352;
- missing non-ignored artifacts: 0.

No artifact was reconstructed, rerun, copied, or assigned synthetic metadata. Deterministic fixtures separately prove present-file and canonical present-directory hashing.

Spot check: `HIST-aa0e673a5df754f7` preserves source token `runs/v0.1-acceptance/`, normalizes it to `evals/runs/v0.1-acceptance`, and records status `ignored`. Its source report hash is `e6421287073a366e7edc95604bf67485afa44869df287e1da4961eec40006a70`.

## Reported Context And Limitations

Host, model, and method are stored only when a single exact source excerpt states them. The acceptance report supplies the sole structured context record (`codex-cli 0.133.0`, observed `gpt-5.5`, and its runner). Other reports retain `host-not-stated`, `model-not-stated`, or `method-not-stated` rather than inheriting neighboring configuration.

Spot check: `HIST-5844759d0b593098` (`evals/reports/by-command-surface/command-surface-1-report.md`) records no host/model context and carries the corresponding fixed limitations.

`HIST-96f2dfe24f57c9ad` (`evals/reports/by-skill/commit-work-1-report.md`) has `reported_date: null`; incidental body dates were not promoted to report dates.

## Supersession

The live corpus contains replacement and supersession language about skills, policies, behavior, and outputs, but no exact statement identifying one included source report as superseding another included source report. All live `supersedes` and `superseded_by` arrays therefore remain empty.

No relation was inferred from report numbering, dates, filenames, or current preference. Deterministic fixtures prove reciprocal report-to-report relation validation and failure behavior.

## Authority Boundary

Every index and record contains:

```json
{
  "authority": "historical-documentary-only",
  "readiness_eligible": false,
  "convertible_to_current_result": false
}
```

The index is physically separate from current evaluator results. `skill-evidence.json` contains only a documentary link; its current `evals`, suites, statuses, and existing `historical_evals` were not populated or reinterpreted from the index. No evaluator code reads the registry.

No model, grader, provider request, current result publication, acceptance observation, or readiness change occurred.

## Verification

Commands:

```sh
node evals/scripts/audit-historical-evidence.mjs
node --test evals/scripts/audit-historical-evidence.test.mjs
evals/scripts/skill-evidence.sh --validate
```

Observed audit:

```json
{"status":"ok","records":86,"present_artifacts":0,"ignored_artifacts":352,"missing_artifacts":0,"supersession_relations":0,"model_requests":0}
```

Fault-injection tests prove fail-closed behavior for authority mutation, source drift, record identity, artifact hash/status, current-skill mapping, shorthand normalization, and supersession reciprocity. They also prove traversal references are rejected and JSON object property order is non-semantic. Ten tests passed.

After artifact review found exact but non-representative label-only excerpts, all 86 `reported_outcome` values were reselected from complete result, finding, verification, or conclusion sections. A focused semantic scan confirmed that each now states source-reported behavior or conclusions and preserves material qualifiers such as non-differentiating results, weak evidence, equivalent passes, failures, and absent model-run grading.

Artifact identities at this checkpoint:

- `evals/registries/historical-evidence.json` — SHA-256 `8ad33e8ed18b980ff43fc4f932a913ff6a910aebf3cebe9ae86a253ac6a06bf4`
- `evals/schemas/historical-evidence.schema.json` — SHA-256 `fd431fb49278cfcb5789657d303b7368c11777873a9f96f1bd00cbb7b86398b6`

## Artifact Review

The Phase 4 source contract passed after one narrow revision for historical `runs/` shorthand, evidence-conditional live checks, report-date precedence, structural destination checks, and CR/LF path rejection:

- `/tmp/freeflow-phase4-historical-spec-review-20260712.md` — SHA-256 `154ae5b18b9dabc8399243ab04a8815ba10e58058ab9a94d272bb047efcff6ab`
- `/tmp/freeflow-phase4-historical-spec-review-20260712-pass2.md` — SHA-256 `18a139a0786bb34c6708716bb0b94f13b34411654710a7b3c51fc2828481e8f3`

Artifact review pass 1 found exact but non-representative outcome excerpts. All 86 were semantically rescanned and corrected. Pass 2 found one remaining command-surface record that stopped before its final result; it was corrected to include the final pass, evidence, finding, and decision.

The terminal pass confirmed that correction was exact, contiguous, semantically complete, and hash-consistent. Its sole remaining label-level objection requested that the Markdown heading itself be included. The parent rejected that as contract inflation: the specification requires an exact contiguous outcome excerpt, not its heading, and the reviewer confirmed the outcome body was complete. No fourth review was requested.

- `/tmp/freeflow-phase4-historical-artifact-review-20260712.md` — SHA-256 `9933e567ca3fdfa2c3628977d4ad7d51874bc595170810b475e40d878dc8681e`
- `/tmp/freeflow-phase4-historical-artifact-review-20260712-pass2.md` — SHA-256 `d2163d46448e66f53426f2988395a344cb0aed9aa4e2f800e9cfd84e6f0981cb`
- `/tmp/freeflow-phase4-historical-artifact-review-20260712-pass3.md` — SHA-256 `2a96a0e8de693dfb72e98cb2bb5869ce4439124da1e194083605555886a3d7ff`

Final evidence:

- audit output — SHA-256 `57a06398f1cc9f3b0b1f2d8a5d6383b0596e600dbf3af6f76f5446f925a25735`
- historical audit tests — SHA-256 `adf9e84d11d314ad18fab4587121fa1b8e880354889a77b461911b46fb0da0a9`
- full evaluator tests — SHA-256 `d0a10ad99daf491d4191399a5324b54a7fd57c67809d3709609d71d77e094c07`

## Limitations

The audit proves provenance, scope coverage, hashes, fixed labels, and deterministic structural rules. It cannot prove that an author-selected exact excerpt is the most representative semantic summary of its source report. Final artifact review and the recorded parent adjudication own that judgment.

This index does not prove current skill behavior, legacy result correctness, host portability, or Production-Ready readiness.
