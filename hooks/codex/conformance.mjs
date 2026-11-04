// The conformance table of Codex's driver (SPEC-006 4.7, SPEC-012 section 7): for each request it claims as yes, the
// test in hooks/tests/codex-driver.test.mjs that shows it, a precondition, the request and its effect observed from
// outside, with recorded Codex hook inputs and no Codex process. That test file checks that every yes claim is here and
// that each test named here exists.
export default {
  pin: "session start: the guidance, then the task menu; after Codex compacts, the guidance again and the task's bundle after Codex's summary",
  inject:
    "a model request past 50, 60 or 70 percent or the notice point: its row or notice reaches the model at the next tool call or prompt, once a cycle",
  checkpoint:
    "a checkpoint after the notice, through Track Work's script, makes the bundle after Codex's next compaction current; checkpoint --compact is refused, naming Codex's thresholds",
  block:
    "a gate under block: PreToolUse denies the call in Codex's deny shape with the gate's text as the reason, a delivery step too (Codex has no ask), and with no gate state the call is refused",
  sensors:
    "the event log: a scripted Codex session's lines are schema v1, in order, kept until the turn ends and written in one run, never contents",
};
