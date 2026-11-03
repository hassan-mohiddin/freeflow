// The conformance table of Pi's extension (SPEC-006 4.7): for each request it claims as yes with every capability on,
// the test that shows it, a precondition, the request and its effect observed from outside. recorder.test.js checks
// that every yes claim is here and that each test named here exists in its file.
export const CONFORMANCE = {
  pin: [
    "integration/prompt-architecture.test.js",
    "composes the mandatory core fragments, current capabilities, discovery, and runtime state",
  ],
  inject: [
    "messaging/messaging.test.js",
    "a session in the same project receives the message; the notice names the sender and says it is not the user",
  ],
  forget: [
    "cognitive-routing/native.test.js",
    "native projection omits an unselected sibling body but preserves its exchange",
  ],
  compact: [
    "compaction/bundle.test.js",
    "a task's checkpoint --compact compacts with its bundle; the next request extends the one after compaction",
  ],
  checkpoint: [
    "compaction/bundle.test.js",
    "a task's checkpoint --compact compacts with its bundle; the next request extends the one after compaction",
  ],
  route: [
    "cognitive-routing/native.test.js",
    "bundled CLI loads the package entrypoint and completes the real routing loop",
  ],
  send: [
    "messaging/messaging.test.js",
    "a session in the same project receives the message; the notice names the sender and says it is not the user",
  ],
  wake: [
    "compaction/bundle.test.js",
    "with no store, a session summary's checkpoint --compact compacts with its bundle and the run continues (P4)",
  ],
  ask: ["ask-user/ask-user.test.js", "the model reads the answers, each deciding only its question"],
  block: [
    "gates/runtime.test.js",
    "Pi's tool_call warns through the call's result and allows, or blocks with the reason under block",
  ],
  sensors: [
    "events/recorder.test.js",
    "a Pi session writes its loop to the event log when the run settles, and its claims at session start",
  ],
  timers: [
    "events/recorder.test.js",
    "the lines wait for the session to stay idle after a run settles; a run that starts first takes them along (T3)",
  ],
};
