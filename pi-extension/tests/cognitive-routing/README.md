# Cognitive Routing tests

Tests for [`src/cognitive-routing/`](../../src/cognitive-routing/README.md). Most are native: a real Pi session with scripted model responses (see [`fixtures/`](../fixtures/README.md)). In those, the Coordinator runs on `gpt-4o` and workers on `gpt-4.1-mini`, so each request body shows which profile sent it.

| Area | Files |
|---|---|
| End-to-end delegation | `native.test.js` (delegate, read, return, close, with and without projection), `delegation.test.js` (delegation modes and duplicate operations) |
| State and persistence | `state.test.js` (events, reducer, idempotency), `persistence.test.js` (strict session snapshots, ancestry), `performance.test.js` (reusing state for unchanged history) |
| Turns and handoffs | `handoffs.test.js`, `transitions.test.js`, `control-staging.test.js` (control changes staged until the next prompt), `shortcut-control.test.js` |
| Projection and evidence | `projection.test.js`, `projected-association.test.js`, `communication.test.js` (refs, locators, evidence selection), `assembler.test.js` |
| Recovery and compaction | `recovery.test.js`, `crash-resume.test.js`, `compaction-input.test.js`, `stabilization.test.js` |
| Pi 0.99 and later | `pi-099.test.js` (message-started runs, retries, virtual models, codemode, tools other extensions add), `nested-calls.test.js` (routing tools stay out of codemode scripts) |
| Runtime, status and rendering | `runtime.test.js` (binding sessions and stale control), `status.test.js`, `render.test.js`, `economics.test.js` (preset warnings) |
| Regressions | `review-fixes.test.js`: fixes from earlier code reviews, each named by the behavior it protects |
