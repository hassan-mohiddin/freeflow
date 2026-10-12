# Verification

Ran the snapshot script tests from the repository root:

    node --test scripts/freeflow-snapshot.test.mjs

Result: 4 tests, 4 pass, 0 fail (about 4 seconds). The first test now builds a fixture with a file-based runtime dependency and checks that the published target contains it, that the metadata records the lockfile digest and the dependency record, and that `fileCount` exceeds `packageFileCount`. The first-installation and HEAD-replacement checks also confirm the dependency is present. The two failure-path tests pass unchanged.

Not run: the repository-wide `npm run check` gate, and a real refresh of the development snapshot target.
