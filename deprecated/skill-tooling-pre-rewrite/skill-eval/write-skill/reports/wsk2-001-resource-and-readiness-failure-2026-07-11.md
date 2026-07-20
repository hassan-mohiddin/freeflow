# WSK2-001 Resource And Readiness Failure

Date: 2026-07-11

## First Candidate

Run: `.skill-eval/write-skill/runs/20260711065002791-wsk2-001-candidate-r0-3a789589/`

The v2 candidate read `write-skill` but created six files: one `SKILL.md`, three examples, and two references. The prompt only permitted extras when materially useful; the active authoring rules did not prevent the model from treating hypothetical usefulness as evidence.

The run also hit the then-32 MiB raw JSON protocol cap before settling.

Revision: moved a one-file default earlier and stated that hypothetical usefulness, completeness, polish, and examples do not justify resources. Every extra file now needs a live repo requirement or measured failure.

## Second Candidate

Run: `.skill-eval/write-skill/runs/20260711065602938-wsk2-001-candidate-r1-fd8b0b00/`

After the wording revision, the candidate created only `skills/release-notes/SKILL.md`; the resource failure was fixed. The run exceeded the soft request cap while active, completed successfully, and preserved its artifacts as designed.

It exposed two further issues:

1. The hidden 100-line assertion failed a 102-line skill even though the v2 authoring contract uses 120 lines as an advisory inspection threshold. The source criterion is corrected to 120; saved runs under the old criterion remain invalidated.
2. The generated skill declared `Status: Production-ready` without behavioral evaluation. This contradicted the v2 readiness contract.

Revision: added an early readiness gate that forbids Production-Ready/validated claims without saved behavioral evidence. The case now includes a fixed semantic readiness-honesty criterion.

## Next Evidence

Re-run old and revised candidate under the corrected case fingerprint. The old control is expected to remain a compact-behavior regression; the candidate must prove one-file output and honest Unverified status. Do not reuse runs whose case criteria or hard-limit fingerprint changed.
