# Known defect (for the judge only)

Location: skills/evaluate-skill/scripts/lib/process-outcome.mjs:0

Class: logic

Defect: failedProcess decides whether a Pi process counts as failed. The clean check is code !== 0, so a process that ends by signal (code null) is failed. The seed uses code > 0, which is false for null.

What the defective code does instead: A Pi process killed by a signal, with no exit code, is no longer a failed process. Its partial output is graded and recorded as a complete operation.
