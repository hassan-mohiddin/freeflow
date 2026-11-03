# Events tests

Tests for [`src/events/`](../../src/events/README.md): the recorder alone, then a real in-process Pi session with Track Work's real script.

| File | Covers |
|---|---|
| `recorder.test.js` | Pi's claims as Cognitive Routing, compaction, messaging, `ask_user` and the event log change, and all no with Freeflow off; the exit code from Pi's text and paths relative to the session; a failed flush counted in the next; a Pi session's lines written when the run settles, numbered and redacted by the writer, with no output or prompt; `events.enabled` off; `/freeflow capabilities`; the golden log; the conformance table. |
| `golden-events.jsonl` | Pi's golden event log: the lines `recorder.test.js`'s session writes, normalized (no times or session, `<ms>` for durations, `<repo>` for this checkout), compared on kinds, order and fields. `FREEFLOW_UPDATE_GOLDEN=1 node --test pi-extension/tests/events/recorder.test.js` rewrites it, on purpose. |
| `conformance.js` | For each request Pi claims as yes, the test that shows it; `recorder.test.js` checks the two agree and that each test exists. |
