# Verification

Ran the nested-call tests on the branch:

    node --test pi-extension/tests/cognitive-routing/nested-calls.test.js

Result: 3 tests, 3 pass, 0 fail. The tests cover the model-only exposure of the routing tools, a nested read and a nested routing call under automatic routing, and a worker's nested read while its assignment is outstanding.

Not run: the full cognitive-routing directory, and `npm run check`.
