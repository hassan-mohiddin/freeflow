// The conformance table of Claude Code's mod (SPEC-006 4.7): for each request it claims as yes, the test in
// freeflow.test.ts that shows it, a precondition, the request and its effect observed from outside. freeflow.test.ts
// checks that every yes claim is here; hooks/tests/golden-events.test.mjs that every test named here exists.
export default {
  inject:
    "a request ends: one notice a cycle, at the lower of 75% and a tenth before Claude's threshold, asking for a checkpoint at a safe point",
  compact:
    "a compaction: after a checkpoint, the bundle alone; before it, Claude's with the bundle after its summary; without a task, the summary",
  checkpoint: "checkpoint --compact compacts before any notice: the agent decides when (P102)",
  block:
    "the gates under block: refused with the gate's text, a delivery step put to the person where someone can answer, a deny beneath standing (SPEC-008 4.2)",
  send: "a worker runs: its delegation comes from the spawn's prompt; near its threshold it is told to keep progress.md; its compaction says how it recovers",
  wake: "a turn ends: sync a changed store; only checkpoint --compact compacts, once, between turns, then starts the next (P102)",
  sensors:
    "the event log: each loop event the mod sees is one schema v1 line, in order, written in one run at the turn's end (SPEC-006 4.2)",
  timers:
    "a turn ends: sync a changed store; only checkpoint --compact compacts, once, between turns, then starts the next (P102)",
};
