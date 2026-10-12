# Verification

Ran the publication tests from the repository root:

    node --test .skill-eval/evaluate-skill/tests/publication.test.mjs

Result: 10 tests, 10 pass, 0 fail (six top-level tests and the four diagnostic failure steps). The staging, publication-order, rename-failure and diagnostic tests check the outcomes described for each step. The overwrite test checks that an existing destination is refused before preparation.

Not run: the evaluate tests, which drive publication through a full evaluation.
