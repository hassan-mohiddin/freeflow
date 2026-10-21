# Verification

Ran the startup verification tests from the pi-extension directory:

    node --test tests/cognitive-routing/startup-verification.test.js

Result: 4 tests, 4 pass, 0 fail.

The tests cover a start Pi just loaded, verified by the file's tail without a snapshot; the full snapshot deciding when there is no trust point; an entry Pi holds but never wrote blocking routing; and a reload not trusting a file it did not re-read.

Not run: the full cognitive-routing suite and the performance budget check.
