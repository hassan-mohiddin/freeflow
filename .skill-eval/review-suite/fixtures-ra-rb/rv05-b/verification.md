# Verification

Checks run on this change:

- `npm run build:pi-extension`: the TypeScript build and the dist formatting completed with no errors.
- `node --test pi-extension/tests/integration/pi-extension.test.js`: 94 tests, all pass. They cover the status line for pending and blocked Cognitive Routing, the startup suppression, and the empty configured session.

Not run: the cognitive-routing lifecycle tests, and the full pi-extension suite.
