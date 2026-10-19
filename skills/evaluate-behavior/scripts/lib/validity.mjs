// The validity gate: a subject run the host reported complete is graded only when it shows a model actually ran.
// A login that failed, a provider that answered nothing, or a host that exited cleanly without calling the model
// would otherwise be graded like real behavior: every check fails, or an "absent" check passes, and the run counts
// in a comparison. Such a run becomes `invalid` with its reasons, before any grader runs; it is never a fail, never
// counted in a comparison or decision, and it stops a pilot. An unclean host exit is already `infrastructure-failed`.
//
// Cost is not the signal: a model with no configured price reports zero cost for real work. Tokens are: every real
// model call has input and output tokens, so a run whose usage totals zero tokens did not reach a model. A provider
// that reports no token usage at all cannot be told apart from one that never answered, so its runs are invalid too.
//
// Tool use is not required. A model that answers in one turn without tools, such as a description run whose target
// did not activate, or a subject that declines the task, is behavior to grade, not a hollow run. A run must leave an
// answer or written work: one that only read and ended silently has nothing to grade.

/** The run's assistant messages, from its transcript (every host records them there). */
function assistantMessages(run) {
  return (Array.isArray(run.transcript) ? run.transcript : []).filter((message) => message?.role === "assistant");
}

function totalTokens(usage) {
  if (usage === null || typeof usage !== "object") return 0;
  return ["input", "output", "cacheRead", "cacheWrite"].reduce(
    (total, key) => total + (Number.isFinite(usage[key]) ? usage[key] : 0),
    0,
  );
}

function answered(run) {
  if (typeof run.response === "string" && run.response.trim() !== "") return true;
  return (Array.isArray(run.turns) ? run.turns : []).some(
    (turn) => typeof turn?.response === "string" && turn.response.trim() !== "",
  );
}

function wroteSomething(run) {
  const changes = run.effects?.changes;
  return ["created", "modified", "deleted"].some((key) => Array.isArray(changes?.[key]) && changes[key].length > 0);
}

/**
 * Why a run the host reported complete is not valid evidence, as a list of reasons; empty when it is valid. Only a
 * `complete` run is checked: every other state already says why it is not graded.
 *
 * @param {any} run
 * @returns {string[]}
 */
export function validityProblems(run) {
  if (run?.state !== "complete") return [];
  const problems = [];
  if (assistantMessages(run).length === 0) problems.push("no model turn: the host recorded no assistant message");
  if (totalTokens(run.usage) === 0) {
    problems.push("no tokens: the run's usage totals zero tokens, so no model call is shown to have happened");
  }
  if (!answered(run) && !wroteSomething(run)) problems.push("no answer and nothing written in the workspace");
  return problems;
}

/**
 * Marks a hollow complete run `invalid` in place, keeping everything it recorded; returns whether it did. The
 * reasons are in `error.reasons`, and `error.kind` is `validity`.
 */
export function applyValidityGate(run) {
  const problems = validityProblems(run);
  if (problems.length === 0) return false;
  run.state = "invalid";
  run.error = { kind: "validity", message: `not valid evidence: ${problems.join("; ")}`, reasons: problems };
  return true;
}
