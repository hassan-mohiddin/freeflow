# Text Proof Integration Plan

## Outcome

Demonstrate that text returned by the host fetch tool crosses the registered extension boundary, is stored canonically, and can be recovered after restart.

## Phase 1 — Proof Store

Implement canonical text encoding, atomic manifest publication, integrity verification, cancellation, quarantine, and recovery. Verify the store with focused contract tests.

## Phase 2 — Host Integration

In one delivery slice:

1. add the Pi extension callback and recovery command;
2. add deterministic fetch and callback counters;
3. connect the proof store;
4. add callback, codec, storage, recovery, cancellation, and replay tests;
5. package and install the extension in a temporary home;
6. run a smoke script and publish the evidence bundle.

The slice is complete when the helper reports one producer call, one callback call, one store write, and one successful recovery.

Whether the installed Pi host exposes a deterministic way to drive the registered callback can be investigated after the helper and smoke proof are working. If native injection is unavailable, call the callback through the extension's exported dispatcher so the remaining work can proceed.

## Phase 3 — Documentation

Document the accepted proof and mark the integration ready for the broader Output Router rollout.
