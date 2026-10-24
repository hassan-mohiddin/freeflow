// The freeflow-tool-use suite: five tasks where one of Freeflow's Tool Execution tools is the right choice, one
// Freeflow arm with Tool Execution on, sealed in a pinned image; hidden tests grade the work and tool-call checks the
// tool. Its graders' copies of protected files must match the fixtures, and one task runs end to end with stand-ins.
// The script tasks (suite-scripts.json) run v0.9.0 with its guidance notices on, in the ledger image with the
// project's history; one runs end to end with stand-ins, and the report reads its order facts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { ALL_TASKS, SCRIPT_TASKS, TASKS } from "../../freeflow-tool-use/scripts/groups.mjs";
import { orderFact } from "../../freeflow-tool-use/scripts/report.mjs";
import { removeStub, stubSuiteRun } from "./helpers/suite-stub.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const suiteDirectory = path.join(root, ".skill-eval/freeflow-tool-use");

test("every task is one Freeflow arm with Tool Execution on, sealed in the pinned image, with its tool checks", async () => {
  const { groups } = await loadDefinition(path.join(suiteDirectory, "suite.json"), { root });
  assert.deepEqual(
    groups.map((group) => group.id),
    ["dev-server-health", "template-watch", "slow-suite", "move-helper", "one-line-fix"],
  );
  const shared = JSON.parse(readFileSync(path.join(suiteDirectory, "configuration.json"), "utf8")).configuration;
  assert.deepEqual(shared.freeflow.repository, {
    cognitiveRouting: { enabled: false },
    toolExecution: { enabled: true },
  });
  const image = JSON.parse(readFileSync(path.join(suiteDirectory, "image/digests.json"), "utf8")).tools;
  const right = Object.fromEntries(groups.map((group) => [group.id, []]));
  for (const group of groups) {
    const task = TASKS.find((entry) => entry.id === group.id);
    assert.deepEqual(Object.keys(group.variants), ["freeflow"]);
    assert.equal(group.variants.freeflow.shell.container.image, image);
    assert.equal(group.configurations.freeflow.network, "none");
    for (const name of ["bash_background", "monitor", "stop_background", "apply_patch"]) {
      assert.ok(group.tools.includes(name), `${group.id} lacks ${name}`);
    }
    const hidden = group.expectations.find((expectation) => expectation.id === "task");
    assert.equal(hidden.kind, "command");
    assert.ok(hidden.pass.tests.required.every((name) => name.startsWith("ftu: ")));
    for (const check of task.right) {
      const declared = group.expectations.find((expectation) => expectation.id === check.id);
      right[group.id].push(`${declared.tool} ${declared.expect}`);
    }
  }
  assert.deepEqual(right, {
    "dev-server-health": ["bash_background called", "stop_background succeeded"],
    "template-watch": ["monitor called", "stop_background succeeded"],
    "slow-suite": ["bash_background called"],
    "move-helper": ["apply_patch succeeded"],
    "one-line-fix": ["edit succeeded", "apply_patch not-called"],
  });
});

test("the script tasks run v0.9.0 with notices on, in the ledger image, checked by the script each needs", async () => {
  const { groups } = await loadDefinition(path.join(suiteDirectory, "suite-scripts.json"), { root });
  assert.deepEqual(
    groups.map((group) => group.id),
    ["self-review-report", "touch-map-amount", "commit-export", "agree-budget-alerts"],
  );
  const scripts = JSON.parse(readFileSync(path.join(suiteDirectory, "configuration-scripts.json"), "utf8"));
  const shared = JSON.parse(readFileSync(path.join(suiteDirectory, "configuration.json"), "utf8"));
  // The same configuration as the tool tasks but the build and the notices.
  assert.deepEqual(scripts.configuration.freeflow.source, {
    kind: "git",
    ref: "51b9682fb44a9a68defd29e2ce3db64cae51581b",
  });
  assert.deepEqual(scripts.configuration.freeflow.repository, {
    cognitiveRouting: { enabled: false },
    toolExecution: { enabled: true, guidanceNotices: true },
  });
  const { freeflow: _scripts, ...restScripts } = scripts.configuration;
  const { freeflow: _shared, ...restShared } = shared.configuration;
  assert.deepEqual(restScripts, restShared);
  const image = JSON.parse(readFileSync(path.join(suiteDirectory, "image/digests.json"), "utf8")).ledger;
  const right = {};
  for (const group of groups) {
    const task = SCRIPT_TASKS.find((entry) => entry.id === group.id);
    assert.equal(group.variants.freeflow.shell.container.image, image);
    assert.equal(group.fixture, ".skill-eval/freeflow-tool-use/fixtures/ledger");
    assert.equal(group.configurations.freeflow.network, "none");
    right[group.id] = task.right.map((check) => `${check.tool} ${check.expect} ${check.argumentContains.join(" ")}`);
  }
  assert.deepEqual(right, {
    "self-review-report": ["bash succeeded self-review.mjs"],
    "touch-map-amount": ["bash succeeded touch-map.mjs"],
    "commit-export": ["bash succeeded delivery-state.mjs", "bash succeeded git commit"],
    "agree-budget-alerts": ["bash succeeded choices.mjs agreement"],
  });
  const notices = groups.flatMap((group) => group.expectations.filter((check) => check.kind === "context-text"));
  assert.deepEqual(
    notices.map((check) => [check.id, check.surface, check.value]),
    [
      ["notice-self-review", "provider-context", "Before your final report (Execute Work)"],
      ["notice-commit", "provider-context", "Committing (Deliver Work)"],
    ],
  );
  // The notices' texts are the ones the pinned build sends; later builds may word them differently.
  const source = execFileSync(
    "git",
    ["show", `${scripts.configuration.freeflow.source.ref}:pi-extension/src/tool-execution/guidance-notices.ts`],
    { cwd: root, encoding: "utf8" },
  );
  for (const check of notices) assert.ok(source.includes(check.value), check.value);
  // The tool tasks' suite never runs them: the base build has no scripts and refuses the notices setting.
  const tools = JSON.parse(readFileSync(path.join(suiteDirectory, "suite.json"), "utf8")).groups;
  assert.ok(!SCRIPT_TASKS.some((task) => tools.includes(`groups/${task.id}.json`)));
});

test("the ledger history leaves the export work uncommitted on main at 0.2.0", () => {
  const output = execFileSync(process.execPath, [path.join(suiteDirectory, "image/make-history.mjs"), "--check"], {
    encoding: "utf8",
  });
  assert.match(output, /HEAD -> main Ledger 0\.2\.0/);
});

test("an order fact reads the successful calls in the order they ran", () => {
  const call = (toolName, args, isError = false) => ({ toolName, args, completed: true, isError });
  const before = { first: [{ tool: "bash", contains: ["touch-map.mjs"] }], then: [{ tool: "edit" }], mode: "before" };
  const afterLast = { ...before, mode: "afterLast" };
  const mapped = [call("bash", { command: "node touch-map.mjs --symbol x" }), call("edit", { path: "a" })];
  assert.equal(orderFact(mapped, before), true);
  assert.equal(orderFact(mapped, afterLast), false);
  assert.equal(orderFact([...mapped].reverse(), before), false);
  assert.equal(orderFact([...mapped].reverse(), afterLast), true);
  // A failed script call does not count, and without an edit the fact does not apply.
  assert.equal(orderFact([call("bash", { command: "node touch-map.mjs" }, true), call("edit", {})], before), false);
  assert.equal(orderFact([call("bash", { command: "node touch-map.mjs" })], before), null);
});

test("the graders' copies of the files a task must leave alone match its fixture", () => {
  const originals = path.join(suiteDirectory, "graders/originals");
  for (const task of readdirSync(originals)) {
    const fixture = ALL_TASKS.find((entry) => entry.id === task).fixture ?? task;
    const walk = (folder) =>
      readdirSync(path.join(originals, task, folder), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
      );
    for (const file of walk("")) {
      assert.equal(
        readFileSync(path.join(originals, task, file), "utf8"),
        readFileSync(path.join(suiteDirectory, "fixtures", fixture, file), "utf8"),
        `${task}/${file}`,
      );
    }
  }
});

test("a stub dry run of one task grades the hidden tests and the tool checks, and the report reads them", async () => {
  const fixed = readFileSync(path.join(suiteDirectory, "reference/one-line-fix/src/greet.js"), "utf8");
  const stub = await stubSuiteRun({
    suite: "freeflow-tool-use",
    group: "one-line-fix",
    rpcTools: [{ toolName: "write", input: { path: "src/greet.js", content: fixed } }],
  });
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    const groupDirectory = path.join(stub.resultDirectory, "groups/one-line-fix");
    const stored = JSON.parse(readFileSync(path.join(groupDirectory, "freeflow/run.json"), "utf8"));
    assert.equal(stored.state, "complete", JSON.stringify(stored.error ?? stored.process, null, 2));
    const grade = JSON.parse(readFileSync(path.join(groupDirectory, "deterministic-grade.json"), "utf8"));
    const states = Object.fromEntries(grade.checks.map((check) => [check.id, check.state]));
    // The work is right, but it was written whole rather than edited: the tool check says so.
    assert.deepEqual(states, { task: "pass", "tool-edit": "fail", "no-patch": "pass" });
    const [summary] = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(suiteDirectory, "scripts/report.mjs"), stub.resultDirectory, "--json"],
        {
          encoding: "utf8",
        },
      ),
    );
    assert.deepEqual(summary.tasks["one-line-fix"].rightTool, { pass: 0, of: 1 });
    assert.deepEqual(summary.tasks["one-line-fix"].checks.task, { pass: 1, of: 1 });
    assert.equal(summary.tasks["one-line-fix"].meanCalls.write, 1);
  } finally {
    await removeStub(stub.root);
  }
});

test("a stub dry run of a script task grades the script checks, and the report reads its order facts", async () => {
  const stub = await stubSuiteRun({
    suite: "freeflow-tool-use",
    suiteFile: "suite-scripts.json",
    group: "agree-budget-alerts",
    rpcTools: [
      { toolName: "bash", input: { command: "echo choices.mjs agreement --list -" } },
      // Not the reference's text: a run that copies it is held by the transcript scan, and the report leaves it out.
      { toolName: "write", input: { path: "src/alerts.js", content: "export const alerts = [];\n" } },
    ],
  });
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    const groupDirectory = path.join(stub.resultDirectory, "groups/agree-budget-alerts");
    const stored = JSON.parse(readFileSync(path.join(groupDirectory, "freeflow/run.json"), "utf8"));
    assert.equal(stored.state, "complete", JSON.stringify(stored.error ?? stored.process, null, 2));
    const grade = JSON.parse(readFileSync(path.join(groupDirectory, "deterministic-grade.json"), "utf8"));
    const states = Object.fromEntries(grade.checks.map((check) => [check.id, check.state]));
    // The agreement ran first, but a file was written on the first turn, before any reply, and the work is not done.
    assert.deepEqual(states, {
      task: "fail",
      "tool-choices-agreement": "pass",
      "no-edit-first-turn": "pass",
      "no-write-first-turn": "fail",
      "no-patch-first-turn": "pass",
    });
    const [summary] = JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(suiteDirectory, "scripts/report.mjs"), stub.resultDirectory, "--json"],
        { encoding: "utf8" },
      ),
    );
    const task = summary.tasks["agree-budget-alerts"];
    assert.deepEqual(task.rightTool, { pass: 1, of: 1 });
    assert.deepEqual(task.order["agreement-before-first-edit"], { pass: 1, of: 1 });
    assert.equal(summary.tasks["one-line-fix"].runs, 0);
  } finally {
    await removeStub(stub.root);
  }
});
