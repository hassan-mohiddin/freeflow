# Verification

- `npm run build` (tsc, then prettier over `pi-extension/dist`) completed without errors.
- `node --test pi-extension/tests/context-virtualization/runtime.test.js` passes, including the new tests for duplicate references in archive and in restore.
