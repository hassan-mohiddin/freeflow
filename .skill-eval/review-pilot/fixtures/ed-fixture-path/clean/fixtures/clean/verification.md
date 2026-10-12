# Verification

Ran `node --test --test-name-pattern "all unavailable" .skill-eval/evaluate-skill/tests/run.test.mjs` from the repository root after making this change. The test "a run whose selected checks are all unavailable exits non-zero" passed.
