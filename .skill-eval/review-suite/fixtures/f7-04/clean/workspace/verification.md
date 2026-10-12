# Verification

Ran the integrity tests from the repository root:

    node --test .skill-eval/evaluate-skill/tests/integrity.test.mjs

Result: 2 tests, 2 pass, 0 fail. The first test checks that the recorded inventory matches the bundle, that `integrity.json` is excluded from its own inventory, and that the record reads back from disk. The second test changes staged evidence after preparation and checks that publication stops with a `publication-failed` outcome and leaves the destination absent.

Not run: the evaluate and plan tests in the same directory, which exercise the integrity record through a full evaluation.
