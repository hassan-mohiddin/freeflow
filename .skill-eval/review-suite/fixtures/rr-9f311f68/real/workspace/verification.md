# Verification

Checks run on this change:

- `npm run build:pi-extension`: the TypeScript build and the dist formatting completed with no errors.
- `node --test pi-extension/tests/cognitive-routing/extension-lifecycle.test.js`: 16 tests, all pass. They cover the startup lifecycle, the first-prompt activation, compaction, tree navigation and reload.
- `node --test pi-extension/tests/integration/pi-extension.test.js`: 91 tests, all pass. They cover the status line, the settings and the prompt context.

Not run: the full pi-extension suite.
