// The freeflow-routing suite: every skill's requests and near misses, one Freeflow arm sealed in a pinned image with
// Tool Execution on, graded by which SKILL.md files the run read; the report's measures on known runs; and one group
// run end to end with stand-ins for the model, Pi, Docker and Freeflow's build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { CASES, MERGED, RETIRED, SKILLS } from "../../freeflow-routing/scripts/cases.mjs";
import { openedSkills, summarize } from "../../freeflow-routing/scripts/report.mjs";
import { removeStub, stubSuiteRun } from "./helpers/suite-stub.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const suiteDirectory = path.join(root, ".skill-eval/freeflow-routing");

test("every skill has three requests and at least one near miss, and the skill list is Freeflow's plus the retired ones", () => {
  const catalog = readFileSync(path.join(root, "pi-extension/src/host/catalog.ts"), "utf8");
  const listed = [...catalog.matchAll(/^ {2}"([a-z-]+)",$/gm)].map((match) => match[1]);
  const owners = new Set(Object.values(MERGED).filter(Boolean));
  for (const skill of listed) assert.ok(SKILLS.includes(skill) || owners.has(skill), `${skill} is neither measured nor a merged owner`);
  for (const skill of SKILLS) assert.ok(listed.includes(skill) || RETIRED.includes(skill), `${skill} is neither Freeflow's nor retired`);
  for (const skill of SKILLS) {
    assert.equal(CASES.filter((entry) => entry.hit === skill).length, 3, skill);
    assert.ok(
      CASES.some((entry) => entry.not.includes(skill)),
      `${skill} has no near miss`,
    );
  }
  for (const entry of CASES) {
    for (const skill of [...entry.expect, ...entry.not]) assert.ok(SKILLS.includes(skill), `${entry.id}: ${skill}`);
    assert.ok(!entry.expect.some((skill) => entry.not.includes(skill)), entry.id);
    if (entry.hit !== null) assert.ok(entry.expect.includes(entry.hit), entry.id);
    else assert.deepEqual(entry.expect, [], entry.id);
  }
});

test("every group is one Freeflow arm with Tool Execution on, sealed in the pinned image, graded on skill reads", async () => {
  const { groups } = await loadDefinition(path.join(suiteDirectory, "suite.json"), { root });
  assert.deepEqual(
    groups.map((group) => group.id),
    CASES.map((entry) => entry.id),
  );
  const shared = JSON.parse(readFileSync(path.join(suiteDirectory, "configuration.json"), "utf8")).configuration;
  assert.deepEqual(shared.freeflow.repository, {
    cognitiveRouting: { enabled: false },
    toolExecution: { enabled: true },
  });
  const image = JSON.parse(readFileSync(path.join(suiteDirectory, "image/digests.json"), "utf8")).shelf;
  for (const group of groups) {
    const entry = CASES.find((candidate) => candidate.id === group.id);
    assert.deepEqual(Object.keys(group.variants), ["freeflow"], group.id);
    assert.equal(group.variants.freeflow.shell.container.image, image, group.id);
    assert.equal(group.configurations.freeflow.network, "none");
    assert.deepEqual(group.variants.freeflow.model, shared.model);
    assert.ok(group.tools.includes("bash_background") && group.tools.includes("apply_patch"), group.id);
    assert.equal(group.participants.user.max_turns, 2);
    assert.deepEqual(
      group.expectations.map((expectation) => [
        expectation.kind,
        expectation.tool,
        expectation.argumentContains[0],
        expectation.expect,
      ]),
      [
        ...entry.expect.map((skill) => ["tool-call", "read", `/skills/${skill}/SKILL.md`, "succeeded"]),
        ...entry.not.map((skill) => ["tool-call", "read", `/skills/${skill}/SKILL.md`, "not-called"]),
      ],
    );
  }
  // The fixture holds no skills and no Freeflow settings of its own: the evaluator writes those.
  const fixture = path.join(suiteDirectory, "fixtures/shelf");
  assert.ok(!existsSync(path.join(fixture, "skills")) && !existsSync(path.join(fixture, ".freeflow")));
  assert.ok(readdirSync(path.join(suiteDirectory, "cards")).length === CASES.length);
});

test("the fixture's history leaves the TSV export uncommitted on the tag-rename branch", () => {
  // The image builds the same history; this builds it on the host, in a temporary folder, and checks the work tree.
  const output = execFileSync(process.execPath, [path.join(suiteDirectory, "image/make-history.mjs"), "--check"], {
    encoding: "utf8",
  });
  assert.match(output, /HEAD -> feature\/tag-rename Keep the 20 October server log/);
  assert.match(output, /main Release 1\.4\.0/);
});

const run = (id, calls) => ({
  case: CASES.find((entry) => entry.id === id),
  opened: openedSkills({
    state: "complete",
    turns: calls.map((group, index) => ({
      turn: index + 1,
      toolActivity: group.map(([toolName, args, isError = false]) => ({ toolName, args, completed: true, isError })),
    })),
  }),
});

test("the report counts a skill opened by read or by a bash command, and splits hits, near misses and the rest", () => {
  const skill = (name) => `/runs/x/resources/freeflow/0/package/skills/${name}/SKILL.md`;
  const runs = [
    // Commit Work opened on turn 2, with cat: a hit, not on the first turn.
    run("cw-commit-tsv", [
      [["bash", { command: "git status" }]],
      [["bash", { command: `cat ${skill("commit-work")}` }]],
    ]),
    // Opened Finish Branch instead: a miss, and Finish Branch's near miss... is not this case (it is the reverse).
    run("cw-commit-all", [[["read", { path: skill("finish-branch") }]]]),
    // A failed read does not count.
    run("cw-commit-push", [[["read", { path: skill("commit-work") }, true]]]),
    // Commit Work opened on a pull-request request: Commit Work's false trigger, and a miss for Finish Branch.
    run("fb-pull-request", [[["read", { path: skill("commit-work") }]]]),
    // Workflow's cases count Agree Work as the route.
    run("wf-fix-and-test", [[["read", { path: skill("agree-work") }]]]),
    // A capability skill is not a skill row.
    run("nm-as-obvious", [[["read", { path: "/runs/x/package/capabilities/compaction/SKILL.md" }]]]),
  ];
  const { skills, overall } = summarize(runs);
  assert.deepEqual(skills["commit-work"].hit, { count: 1, total: 3, rate: 1 / 3 });
  assert.deepEqual(skills["commit-work"].hitFirstTurn, { count: 0, total: 3, rate: 0 });
  assert.deepEqual(skills["commit-work"].falseTrigger, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(skills["commit-work"].instead, { "finish-branch": 1, "(none)": 1 });
  assert.deepEqual(skills["finish-branch"].hit, { count: 0, total: 1, rate: 0 });
  assert.deepEqual(skills["finish-branch"].falseTrigger, { count: 0, total: 1, rate: 0 });
  assert.deepEqual(skills.workflow.hit, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(skills.workflow.opensItself, { count: 0, total: 1, rate: 0 });
  assert.equal(skills["action-selection"].falseTrigger.count, 0);
  assert.deepEqual(overall.hit, { count: 2, total: 5, rate: 2 / 5 });
});

test("a stub dry run of one group grades the skill reads and reports a hit", async () => {
  const stub = await stubSuiteRun({
    suite: "freeflow-routing",
    group: "cw-commit-tsv",
    skills: SKILLS,
    rpcTools: [
      { toolName: "bash", input: { command: "git status --short" } },
      { toolName: "read", input: { path: "{freeflow}/skills/commit-work/SKILL.md" } },
    ],
  });
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    const groupDirectory = path.join(stub.resultDirectory, "groups/cw-commit-tsv");
    const stored = JSON.parse(readFileSync(path.join(groupDirectory, "freeflow/run.json"), "utf8"));
    assert.equal(stored.state, "complete", JSON.stringify(stored.error ?? stored.process, null, 2));
    assert.equal(stored.participants.ended, "stop");
    const grade = JSON.parse(readFileSync(path.join(groupDirectory, "deterministic-grade.json"), "utf8"));
    const states = Object.fromEntries(grade.checks.map((check) => [check.id, check.state]));
    assert.deepEqual(states, { "read-commit-work": "pass", "no-finish-branch": "pass" });
    const report = execFileSync(
      process.execPath,
      [path.join(suiteDirectory, "scripts/report.mjs"), stub.resultDirectory, "--json"],
      { encoding: "utf8" },
    );
    const [summary] = JSON.parse(report);
    assert.deepEqual(summary.skills["commit-work"].hit, { count: 1, total: 1, rate: 1 });
    assert.deepEqual(summary.cases, [
      { case: "cw-commit-tsv", trial: path.basename(stub.resultDirectory), opened: { "commit-work": 1 } },
    ]);
  } finally {
    await removeStub(stub.root);
  }
});
