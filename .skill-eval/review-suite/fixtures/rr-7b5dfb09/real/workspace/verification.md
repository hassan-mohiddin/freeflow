# Verification

Checks run on this change:

- `npm run build:pi-extension`: the TypeScript build and the dist formatting completed with no errors.
- `node --test pi-extension/tests/cognitive-routing/tool.test.js`: 7 tests, all pass. They cover the switch schema, request validation, the controller and manual-hold paths, recovery of the result from model-visible text, and the rendered result labels.

Not run: the full pi-extension suite.
