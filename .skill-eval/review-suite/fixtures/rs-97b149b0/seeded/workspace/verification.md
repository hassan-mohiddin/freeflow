# Verification

Ran the carried-context and worker-notice tests on the branch:

    node --test pi-extension/tests/compaction/carry.test.js pi-extension/tests/compaction/worker-warning.test.js

Result: 7 tests, 7 pass, 0 fail. The carry tests cover numbered carried files and a read result numbered from its offset, including the partial-read note.

Did not rerun the notices and agent-path tests after the wording change to the notices.

Not run: `npm run check`.
