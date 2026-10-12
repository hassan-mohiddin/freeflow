# Verification

Checks run on this change:

- `npm run build:pi-extension`: the TypeScript build and the dist formatting completed with no errors.
- `node --test --test-name-pattern="pending|recovers" pi-extension/tests/cognitive-routing/tool.test.js`: 2 tests, both pass (the pending-line rendering test and the recovery of the result from model-visible text).

Not run: the rest of `tool.test.js`, and the full pi-extension suite.
