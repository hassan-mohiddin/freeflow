# Verification

- `npm run build` (tsc, then prettier over `pi-extension/dist`) completed without errors.
- `node --test pi-extension/tests/provider-support/cache-keepalive.test.js` passes, including the new test for a worker on the Coordinator's own model.
