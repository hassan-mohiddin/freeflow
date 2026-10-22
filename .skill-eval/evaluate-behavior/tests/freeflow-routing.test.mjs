// The freeflow-routing suite: every skill's requests and near misses, one Freeflow arm sealed in a pinned image with
// Tool Execution on, graded by which SKILL.md files the run read; the mapping of merged skills to their owners on a
// later build; the report's measures on known runs of both builds; and one group run end to end on each build with
// stand-ins for the model, Pi, Docker and Freeflow's build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import {
  CASES,
  MERGED,
  OWNERS,
  RETIRED,
  SKILLS,
  gradedSkills,
  routeCase,
} from "../../freeflow-routing/scripts/cases.mjs";
import { measuredRun, openedSkills, summarize } from "../../freeflow-routing/scripts/report.mjs";
import { removeStub, stubSuiteRun } from "./helpers/suite-stub.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const suiteDirectory = path.join(root, ".skill-eval/freeflow-routing");

test("every skill has three requests and at least one near miss, and the skill list is Freeflow's plus the retired ones", () => {
  const catalog = readFileSync(path.join(root, "pi-extension/src/host/catalog.ts"), "utf8");
  const listed = [...catalog.matchAll(/^ {2}"([a-z-]+)",$/gm)].map((match) => match[1]);
  const owners = new Set(Object.values(MERGED).filter(Boolean));
  for (const skill of listed)
    assert.ok(SKILLS.includes(skill) || owners.has(skill), `${skill} is neither measured nor a merged owner`);
  for (const skill of SKILLS)
    assert.ok(listed.includes(skill) || RETIRED.includes(skill), `${skill} is neither Freeflow's nor retired`);
  // The merged build is Freeflow's current skill list: every owner ships, and nothing else does.
  assert.deepEqual([...OWNERS].sort(), [...listed].sort());
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
    for (const skill of entry.route ?? []) assert.ok(OWNERS.includes(skill), `${entry.id}: route ${skill}`);
  }
});

const BASE = new Set(SKILLS);
const MERGED_BUILD = new Set(OWNERS);
const routed = (id, present) =>
  routeCase(
    CASES.find((entry) => entry.id === id),
    present,
  );

test("on the base every case is measured as written; on the merged build a merged skill's owner takes its place", () => {
  for (const entry of CASES) {
    const base = routeCase(entry, BASE);
    assert.deepEqual(base.expect, entry.expect, entry.id);
    assert.deepEqual(base.checks.map((check) => check.target).sort(), [...entry.not].sort(), entry.id);
    assert.deepEqual(base.dropped, [], entry.id);
  }
  // A merged request counts its owner; Workflow's build route becomes Execute Work and Discuss Work.
  assert.deepEqual(routed("cw-commit-tsv", MERGED_BUILD).expect, ["deliver-work"]);
  assert.deepEqual(routed("wf-import", MERGED_BUILD).expect, ["execute-work", "discuss-work"]);
  assert.deepEqual(routed("rv-branch", MERGED_BUILD).expect, ["review-work"]);
  // Action Selection has no owner: its requests count toward no hit rate there, and its near miss is dropped.
  assert.equal(routed("as-log-size", MERGED_BUILD).owned, false);
  assert.deepEqual(routed("nm-as-obvious", MERGED_BUILD).dropped, [
    { skill: "action-selection", target: null, reason: "no owner" },
  ]);
  // A near miss whose owner is still another skill than the request's route moves to the owner.
  assert.deepEqual(routed("nm-aw-exact", MERGED_BUILD).checks, [
    { skill: "agree-work", family: "discuss-work", target: "discuss-work" },
  ]);
  assert.deepEqual(routed("ew-plan-step-2", MERGED_BUILD).checks, [
    { skill: "write-plan", family: "write-docs", target: "write-docs" },
  ]);
  // A near miss whose owner is the request's own route, or a skill its route names, is dropped.
  assert.deepEqual(routed("fb-pull-request", MERGED_BUILD).dropped, [
    { skill: "commit-work", target: "deliver-work", reason: "own route" },
  ]);
  assert.deepEqual(routed("ws-sync", MERGED_BUILD).dropped, [
    { skill: "write-docs", target: "write-docs", reason: "own route" },
  ]);
  assert.deepEqual(routed("aw-limit-flag", MERGED_BUILD).dropped, [
    { skill: "simplify-code", target: "execute-work", reason: "shares the request's route" },
  ]);
  // Two near misses with one owner keep one check, the owner's own.
  assert.deepEqual(routed("nm-ho-summary", MERGED_BUILD).checks, [
    { skill: "track-work", family: "track-work", target: "track-work" },
  ]);
  // The graded checks hold both builds' skills, and never check one skill both ways.
  assert.deepEqual(gradedSkills(CASES.find((entry) => entry.id === "cw-commit-tsv")), {
    read: ["commit-work", "deliver-work"],
    no: ["finish-branch"],
  });
  assert.deepEqual(gradedSkills(CASES.find((entry) => entry.id === "nm-aw-exact")), {
    read: [],
    no: ["agree-work", "discuss-work"],
  });
  for (const entry of CASES) {
    const { read, no } = gradedSkills(entry);
    assert.ok(!read.some((skill) => no.includes(skill)), entry.id);
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
    const { read, no } = gradedSkills(entry);
    assert.deepEqual(
      group.expectations.map((expectation) => [
        expectation.kind,
        expectation.tool,
        expectation.argumentContains[0],
        expectation.expect,
      ]),
      [
        ...read.map((skill) => ["tool-call", "read", `/skills/${skill}/SKILL.md`, "succeeded"]),
        ...no.map((skill) => ["tool-call", "read", `/skills/${skill}/SKILL.md`, "not-called"]),
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

const run = (id, calls, present = BASE) =>
  measuredRun(
    CASES.find((entry) => entry.id === id),
    openedSkills({
      state: "complete",
      turns: calls.map((group, index) => ({
        turn: index + 1,
        toolActivity: group.map(([toolName, args, isError = false]) => ({ toolName, args, completed: true, isError })),
      })),
    }),
    present,
  );

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

test("on the merged build the report counts owners for merged skills, per old skill and per owner", () => {
  const skill = (name) => `/runs/x/resources/freeflow/0/package/skills/${name}/SKILL.md`;
  const runs = [
    // Deliver Work opened on a commit request: Commit Work's request is routed; Commit Work itself never opens.
    run("cw-commit-tsv", [[["read", { path: skill("deliver-work") }]]], MERGED_BUILD),
    // Deliver Work on a pull request: Finish Branch's route; the Commit Work near miss is dropped (own route).
    run("fb-pull-request", [[["read", { path: skill("deliver-work") }]]], MERGED_BUILD),
    // Discuss Work on an exact edit: Agree Work's near miss, now Discuss Work's.
    run("nm-aw-exact", [[["read", { path: skill("discuss-work") }]]], MERGED_BUILD),
    // Execute Work on a code change: Workflow's route; the request's other skills are not near misses.
    run("wf-fix-and-test", [[["read", { path: skill("execute-work") }]]], MERGED_BUILD),
    // Action Selection's request has no owner: it counts toward no hit rate.
    run("as-log-size", [[["read", { path: skill("execute-work") }]]], MERGED_BUILD),
  ];
  const { skills, owners, overall } = summarize(runs);
  assert.deepEqual(skills["commit-work"].hit, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(skills["commit-work"].opensItself, { count: 0, total: 1, rate: 0 });
  assert.equal(skills["commit-work"].falseTrigger, null);
  assert.deepEqual(skills["finish-branch"].hit, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(skills["agree-work"].falseTrigger, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(skills.workflow.hit, { count: 1, total: 1, rate: 1 });
  assert.equal(skills["action-selection"].hit, null);
  assert.equal(skills["action-selection"].unowned, 1);
  assert.deepEqual(owners["deliver-work"].hit, { count: 2, total: 2, rate: 1 });
  assert.deepEqual(owners["deliver-work"].opensItself, { count: 2, total: 2, rate: 1 });
  assert.deepEqual(owners["discuss-work"].falseTrigger, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(owners["execute-work"].hit, { count: 1, total: 1, rate: 1 });
  assert.deepEqual(owners["deliver-work"].merged, ["commit-work", "finish-branch", "launch-work", "release-work"]);
  assert.deepEqual(overall.hit, { count: 3, total: 3, rate: 1 });
  assert.equal(overall.unowned, 1);
  assert.equal(overall.droppedChecks, 2);
  // The same requests on the base: Deliver Work does not exist there, so the owner rows read the base's skills.
  const before = summarize([
    run("cw-commit-tsv", [[["read", { path: skill("commit-work") }]]]),
    run("fb-pull-request", [[["read", { path: skill("commit-work") }]]]),
  ]);
  assert.deepEqual(before.owners["deliver-work"].hit, { count: 1, total: 2, rate: 1 / 2 });
  assert.deepEqual(before.owners["deliver-work"].opensItself, { count: 0, total: 2, rate: 0 });
  assert.deepEqual(before.owners["deliver-work"].falseTrigger, { count: 1, total: 2, rate: 1 / 2 });
});

async function stubRun(skills, read) {
  return stubSuiteRun({
    suite: "freeflow-routing",
    group: "cw-commit-tsv",
    skills,
    rpcTools: [
      { toolName: "bash", input: { command: "git status --short" } },
      { toolName: "read", input: { path: `{freeflow}/skills/${read}/SKILL.md` } },
    ],
  });
}

const reportJson = (resultDirectory) =>
  JSON.parse(
    execFileSync(process.execPath, [path.join(suiteDirectory, "scripts/report.mjs"), resultDirectory, "--json"], {
      encoding: "utf8",
    }),
  );

test("a stub dry run of one group grades the skill reads and reports a hit", async () => {
  const stub = await stubRun(SKILLS, "commit-work");
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    const groupDirectory = path.join(stub.resultDirectory, "groups/cw-commit-tsv");
    const stored = JSON.parse(readFileSync(path.join(groupDirectory, "freeflow/run.json"), "utf8"));
    assert.equal(stored.state, "complete", JSON.stringify(stored.error ?? stored.process, null, 2));
    assert.equal(stored.participants.ended, "stop");
    const grade = JSON.parse(readFileSync(path.join(groupDirectory, "deterministic-grade.json"), "utf8"));
    const states = Object.fromEntries(grade.checks.map((check) => [check.id, check.state]));
    // The base has no Deliver Work: its read check fails there by construction; the report knows the build.
    assert.deepEqual(states, {
      "read-commit-work": "pass",
      "read-deliver-work": "fail",
      "no-finish-branch": "pass",
    });
    const [summary] = reportJson(stub.resultDirectory);
    assert.deepEqual(summary.skills["commit-work"].hit, { count: 1, total: 1, rate: 1 });
    assert.deepEqual(summary.cases, [
      {
        case: "cw-commit-tsv",
        trial: path.basename(stub.resultDirectory),
        opened: { "commit-work": 1 },
        expect: ["commit-work"],
        nearMisses: ["finish-branch"],
        dropped: [],
      },
    ]);
  } finally {
    await removeStub(stub.root);
  }
});

test("a stub dry run on a merged build counts the owner the build ships, read from its package", async () => {
  const stub = await stubRun(OWNERS, "deliver-work");
  try {
    assert.equal(stub.result.status, 0, stub.result.stderr + stub.result.stdout);
    const [summary] = reportJson(stub.resultDirectory);
    assert.deepEqual(summary.skills["commit-work"].hit, { count: 1, total: 1, rate: 1 });
    assert.deepEqual(summary.owners["deliver-work"].hit, { count: 1, total: 1, rate: 1 });
    assert.equal(summary.overall.unknownBuild, 0);
    assert.deepEqual(summary.cases[0].dropped, [
      { skill: "finish-branch", target: "deliver-work", reason: "own route" },
    ]);
  } finally {
    await removeStub(stub.root);
  }
});
