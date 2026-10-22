// The freeflow-tool-use suite: five tasks where one of Freeflow's Tool Execution tools is the right choice, one
// Freeflow arm with Tool Execution on, sealed in a pinned image; hidden tests grade the work and tool-call checks the
// tool. Its graders' copies of protected files must match the fixtures, and one task runs end to end with stand-ins.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { TASKS } from "../../freeflow-tool-use/scripts/groups.mjs";
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

test("the graders' copies of the files a task must leave alone match its fixture", () => {
  const originals = path.join(suiteDirectory, "graders/originals");
  for (const task of readdirSync(originals)) {
    const walk = (folder) =>
      readdirSync(path.join(originals, task, folder), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
      );
    for (const file of walk("")) {
      assert.equal(
        readFileSync(path.join(originals, task, file), "utf8"),
        readFileSync(path.join(suiteDirectory, "fixtures", task, file), "utf8"),
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
