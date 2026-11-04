// Writes the top-line suite's groups and graders from tasks.json and the repository's own history (SPEC-011 4.4):
// for each task, the group that runs plain against Freeflow on the commit its pull request started from, the group
// of the ablation ladder, and the held-back tests, copied from the pull request's merge into graders/<task>/. Run from
// the repository root after changing tasks.json or configuration.json, then format and commit what it wrote:
//   node .skill-eval/top-line/scripts/groups.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const suite = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = execFileSync("git", ["-C", suite, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const fromRoot = (path) => relative(root, path);
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
const { tasks } = JSON.parse(readFileSync(join(suite, "tasks.json"), "utf8"));

/** What every arm's workspace leaves out of the commit's tree: history kept elsewhere, and settings the arm declares. */
export const EXCLUDE = [".deprecated", ".skill-eval/review-suite", ".skill-eval/top-line", ".freeflow"];
/** The ablation ladder (SPEC-011 4.4): the Freeflow arm with one part off, each a settings change, run after the top line. */
export const LADDER = {
  "freeflow-no-track": { skills: { "track-work": false } },
  "freeflow-no-gates": { gates: { agreement: "off", slice: "off", delivery: "off", delegation: "off" } },
  "freeflow-no-review": { skills: { "review-work": false } },
};
const USER = { model: "anthropic/claude-haiku-5-5", thinking: "low", max_turns: 8, stop: "THANKS, DONE" };

function hiddenTests(task, arm) {
  return {
    id: `${arm}-hidden-tests`,
    kind: "command",
    variant: arm,
    comparison: "hidden-tests",
    argv: ["node", "--test", "--test-reporter=tap", ...task.tests],
    files: Object.fromEntries(
      [...task.tests, ...(task.helpers ?? [])].map((path) => [path, fromRoot(join(suite, "graders", task.id, path))]),
    ),
    timeout_seconds: 900,
    // Every test of the held-back files that passes at the merge: a pass is all of them, the score their share.
    pass: { tests: { format: "node-test", required: task.required } },
  };
}

function group(task, arms, { id = task.id, component }) {
  const start = git("rev-parse", `${task.merge}^1`).trim();
  return {
    schema_version: 2,
    kind: "group",
    id,
    type: "body",
    input: { prompt: task.prompt },
    fixture: { git: start, exclude: EXCLUDE },
    tools: ["read", "write", "edit", "find", "grep", "bash"],
    configuration: { extends: "../configuration.json" },
    arms,
    reference: Object.keys(arms)[0],
    component,
    participants: {
      protocol: "conversation",
      user: { ...USER, card: fromRoot(join(suite, "cards", `${task.id}.md`)) },
    },
    expectations: Object.keys(arms).map((arm) => hiddenTests(task, arm)),
    review_questions: [],
    reference_solution: { git: git("rev-parse", task.merge).trim() },
  };
}

/** The simulated user's card: the request, how it answers, and what the pull request settled, revealed only when asked. */
function card(task) {
  return [
    "You are Hassan, who owns the Freeflow repository (a workflow layer for coding agents). You asked a coding agent for a change in it and are now chatting with it.",
    "",
    "What you asked:",
    "",
    `> ${task.prompt}`,
    "",
    "How you behave:",
    "- Answer only what the agent asks, in one or two short sentences. Never volunteer a preference it did not ask about, never hint at how to do the work, and never describe your preferences below unless a question or a proposed choice touches them.",
    "- When the agent lists choices or a plan, read each one. If one touches a preference below and differs from it, say what you want instead, in plain words. Accept the rest.",
    '- If it asks about something your preferences below do not cover, say "your recommendation is fine".',
    '- When it asks whether to go ahead, or to confirm its plan or its choices, reply "go", with any correction from the rule above in the same message.',
    '- If it pauses without asking anything and without saying the change is made, reply "go".',
    "- If it asks whether to commit, push or open a pull request, say it isn't needed.",
    "- Never tell the agent to stop, wait, hold or pause, never ask it to start over, and never ask to see more detail or more choices than it showed you.",
    `- Once the agent says the change is made, or reports what it did, reply with exactly: ${USER.stop}. Do this even when it also offers more, such as a commit, another change or a choice you could still change.`,
    "",
    "Your preferences (hidden; reveal one only when a question or a proposed choice touches it):",
    ...task.preferences.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

for (const folder of ["groups", "groups-ablation", "graders", "cards"])
  rmSync(join(suite, folder), { recursive: true, force: true });
for (const task of tasks) {
  for (const path of [...task.tests, ...(task.helpers ?? [])]) {
    const target = join(suite, "graders", task.id, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git("show", `${task.merge}:${path}`));
  }
  mkdirSync(join(suite, "cards"), { recursive: true });
  writeFileSync(join(suite, "cards", `${task.id}.md`), card(task));
  const write = (folder, value) => {
    mkdirSync(join(suite, folder), { recursive: true });
    writeFileSync(join(suite, folder, `${task.id}.json`), `${JSON.stringify(value, null, 2)}\n`);
  };
  write("groups", group(task, { plain: { freeflow: null }, freeflow: {} }, { component: ["freeflow"] }));
  const ladder = Object.fromEntries(
    Object.entries(LADDER).map(([arm, settings]) => [arm, { freeflow: { repository: settings } }]),
  );
  write(
    "groups-ablation",
    group(task, { freeflow: {}, ...ladder }, { id: `${task.id}-ablation`, component: ["freeflow.repository"] }),
  );
}
process.stdout.write(`Wrote ${tasks.length} groups, ${tasks.length} ablation groups and their graders.\n`);
