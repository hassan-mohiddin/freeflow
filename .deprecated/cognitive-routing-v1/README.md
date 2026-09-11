# Retired experimental Cognitive Routing

The former routing source and tests are preserved here as historical material. They are not compiled, included in the npm runtime, or run as the current acceptance suite. Their original import paths refer to the retired layout; use Git revision `89095e0` to reproduce that environment deliberately.

The replacement is `pi-extension/src/cognitive-routing-v2/` with shared session sources in `pi-extension/src/session-sources/`. The build cleans `dist` before compilation so old generated modules cannot silently remain in the package.

## Coverage disposition

- Generic profile switching, lease shims, Yield/REOPEN, include/shared selections, old event schemas, and session-start presets were intentionally replaced. Tests asserting those mechanisms are historical, not v2 acceptance requirements.
- Units, assignment exclusivity/replacement, saved report revisions, retry, closure, event identity and malformed-state rejection are covered by `pi-extension/tests/cognitive-routing-v2/state.test.js`.
- Strict persisted snapshots and real Pi memory-before-persistence failure are covered by `persistence.test.js`.
- Real loaded-extension SDK and bundled-CLI dispatch, actual subsequent requests, post-return task restrictions, selected/unselected native evidence, saved-return retry, manual hold/reload/replacement, and compaction/attention/restoration are covered by `native.test.js`.
- Core prompt delivery, settings, commands, disabled capabilities, and unrelated behavior remain in the current integration suites with v2 contract assertions.

This mapping is not a claim that every historical scenario was reproduced or every proposed specification case ran. Model-behavior evaluation, arbitrary provider/transport compatibility and installed-user acceptance remain distinct from deterministic local evidence. In particular, the redesigned PiFlow adapter and composition with legacy context transforms are explicitly unavailable where the new adapter cannot support the promised boundary.
