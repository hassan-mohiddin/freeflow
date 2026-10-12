# Verification

Ran the compaction coordinator-view test on the branch:

    node --test pi-extension/tests/compaction/coordinator-view.test.js

Result: 2 tests, 2 pass, 0 fail. The second test covers an evidence recovery after a worker compacts and checks the Coordinator's prefix through the supplement and the close.

Also ran the carry and worker-warning tests, which pass (4 tests).

Not run: the full compaction directory, the notices tests, and `npm run check`.
