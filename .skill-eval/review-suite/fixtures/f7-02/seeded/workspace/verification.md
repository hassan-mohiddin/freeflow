# Verification

Ran the compact-evidence tests from the repository root:

    node --test .skill-eval/evaluate-skill/tests/compact-evidence.test.mjs

Result: 5 tests, 5 pass, 0 fail. The tests cover round-tripping escaped values, rejecting missing or overstated fact lineage, choosing CEV1 when lineage is exact and the bytes decrease, falling back to canonical JSON when the reduction is not beneficial, and failing closed when lineage cannot be expressed.

Not run: the plan tests, which hash the evaluator source list that this change extends.
