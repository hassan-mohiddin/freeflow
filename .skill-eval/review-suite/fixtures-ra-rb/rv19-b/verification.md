# Verification

- `npm run build` (tsc, then prettier over `pi-extension/dist`) completed without errors.
- `node --test pi-extension/tests/compaction/fallback.test.js pi-extension/tests/compaction/notices.test.js pi-extension/tests/compaction/thresholds.test.js` passes, including the new tests for the carry budget cap, the repeated compact-now notice and the refusal after Pi's own compaction.
