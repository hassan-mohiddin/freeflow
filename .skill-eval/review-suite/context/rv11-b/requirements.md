# Requirements: objective and semantic result axes in the evaluator

The evaluator keeps the objective result and the semantic (grader) result as separate axes. A case may receive diagnostic semantic grading after an objective failure, and that grading never becomes a promotable result.

1. The objective axis and the semantic axis stay separate. Objective verdicts come only from the objective checks. Semantic grading sets verdicts only for the case's semantic assertion IDs, and it never changes the verdict of an objective assertion.
2. When no objective assertion fails, semantic grading is promotable: its verdicts are merged into the case's assertions, and the semantic result records `diagnostic: false` and `promotable: true`.
3. When at least one objective assertion fails, semantic grading may still run, but only as diagnostic grading. The semantic result records `diagnostic: true` and `promotable: false`. Its verdicts are not merged into the assertions, so semantic assertions keep their objective verdicts, and the case verdict stays the objective verdict. The grader's evidence is still recorded under the semantic result.
4. Diagnostic grading tells the grader that it is non-promotable diagnostic grading after an objective failure, and that it cannot repair acceptance. Without the diagnostic option, semantic grading of a run whose objective checks failed is refused with "Semantic grading cannot repair failed objective evidence".
5. When semantic grading fails after the subject has run, the run ends incomplete. Its diagnostic lists the subject under `completed_variants` with its role, so the subject can be regraded, and no result is published.
6. An assembled semantic assertion carries the grader's evidence for that assertion, not a placeholder.
7. The grader's evidence reports the objective axis as it stands: `objective_checks_passed` is true exactly when the run's objective checks passed, for every kind of run the grader can receive.
