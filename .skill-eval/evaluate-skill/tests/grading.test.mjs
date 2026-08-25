import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { gradeDeterministic } from "../../../skills/evaluate-skill/scripts/lib/grade.mjs";
import { fingerprintDirectory } from "../../../skills/evaluate-skill/scripts/lib/sandbox.mjs";

async function withTempDirectory(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-eval-grade-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function descriptionGroup(expectations) {
  return {
    type: "description",
    input: { prompt: "Choose a route." },
    expectations,
  };
}

function bodyGroup(expectations) {
  return {
    type: "body",
    input: { prompt: "Produce the declared files." },
    expectations,
  };
}

let contextArtifactIndex = 0;

async function contextRun(workspace, observations) {
  const contents = `${observations.map((observation) => JSON.stringify(observation)).join("\n")}\n`;
  const artifactPath = path.join(workspace, `context-observations-${++contextArtifactIndex}.jsonl`);
  await writeFile(artifactPath, contents, "utf8");
  return {
    ...completeRun(workspace, []),
    contextObservationArtifact: {
      path: artifactPath,
      sha256: sha256(contents),
      bytes: Buffer.byteLength(contents, "utf8"),
      count: observations.length,
      surfaces: [...new Set(observations.map((observation) => observation.surface).filter(Boolean))],
    },
  };
}

function completeRun(workspace, files) {
  const entries = files.map((file) => ({ type: "file", ...file }));
  return {
    state: "complete",
    workspace,
    effects: {
      before: [],
      after: entries,
      changes: {
        created: entries.filter((entry) => entry.type !== "directory").map((entry) => entry.path),
        modified: [],
        deleted: [],
      },
    },
    response: "done",
    successfulReadPaths: [],
    resources: { skills: [], context: [], targetPath: null },
  };
}

const absentRun = { state: "not-selected" };
const evidence = {
  baseline: { path: "/evidence/baseline/run.json", sha256: "a".repeat(64) },
  candidate: { path: "/evidence/candidate/run.json", sha256: "b".repeat(64) },
};

test("description timing expectations reject missing and out-of-range turns", async () => {
  const candidate = {
    state: "complete",
    activation: { targetRead: true, firstReadTurn: 1, readTurns: [1] },
  };
  const grade = await gradeDeterministic(
    descriptionGroup([
      {
        id: "out-of-range",
        kind: "skill-read",
        variant: "candidate",
        expect: "by-turn",
        turn: 2,
      },
      {
        id: "missing-turn",
        kind: "skill-read",
        variant: "candidate",
        expect: "on-turn",
      },
      {
        id: "valid-turn",
        kind: "skill-read",
        variant: "candidate",
        expect: "by-turn",
        turn: 1,
      },
    ]),
    { baseline: absentRun, candidate },
    evidence,
  );

  assert.equal(grade.state, "grade-error");
  assert.deepEqual(grade.errors, [
    { id: "out-of-range", reason: "invalid skill-read expectation" },
    { id: "missing-turn", reason: "invalid skill-read expectation" },
  ]);
  assert.deepEqual(
    grade.checks.map(({ id, state }) => ({ id, state })),
    [{ id: "valid-turn", state: "pass" }],
  );
});

test("tool-call grading distinguishes selective calls from absent calls", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const baseline = { ...completeRun(workspace, []), toolActivity: [] };
    const candidate = {
      ...completeRun(workspace, []),
      toolActivity: [
        {
          toolName: "freeflow_context",
          args: {
            operation: "archive",
            targets: [{ ref: "ctx:disposable", retained: "keep the decision" }],
          },
          isError: false,
        },
      ],
    };
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "baseline-no-archive",
          kind: "tool-call",
          variant: "baseline",
          tool: "freeflow_context",
          expect: "called",
          argumentContains: ["ctx:disposable"],
          argumentNotContains: ["ctx:protected"],
          comparison: "archive-call",
        },
        {
          id: "candidate-selective-archive",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "called",
          argumentContains: ["ctx:disposable"],
          argumentNotContains: ["ctx:protected"],
          comparison: "archive-call",
        },
      ]),
      { baseline, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-archive", state: "fail" },
        { id: "candidate-selective-archive", state: "pass" },
      ],
    );
    assert.deepEqual(grade.comparisons, [
      {
        id: "archive-call",
        kind: "tool-call",
        baseline: { check: "baseline-no-archive", state: "fail" },
        candidate: { check: "candidate-selective-archive", state: "pass" },
        transition: "fail-to-pass",
      },
    ]);
  });
});

test("tool-call grading distinguishes attempted, succeeded, and failed outcomes", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const candidate = {
      ...completeRun(workspace, []),
      toolActivity: [
        {
          toolName: "freeflow_context",
          args: { operation: "archive", targets: [{ ref: "ctx:failed" }] },
          completed: true,
          isError: true,
        },
      ],
    };
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "attempted",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "called",
          argumentContains: ["ctx:failed"],
        },
        {
          id: "not-successful",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "succeeded",
          argumentContains: ["ctx:failed"],
        },
        {
          id: "failed",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "failed",
          argumentContains: ["ctx:failed"],
        },
      ]),
      { baseline: absentRun, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "attempted", state: "pass" },
        { id: "not-successful", state: "fail" },
        { id: "failed", state: "pass" },
      ],
    );
  });
});

test("tool-call not-called filters distinguish selective absence from no calls", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const candidate = {
      ...completeRun(workspace, []),
      toolActivity: [
        {
          toolName: "freeflow_context",
          args: { operation: "archive", targets: [{ ref: "ctx:disposable" }] },
          completed: true,
          isError: false,
        },
      ],
    };
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "protected-reference-not-called",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "not-called",
          argumentContains: ["ctx:protected"],
        },
        {
          id: "tool-not-called",
          kind: "tool-call",
          variant: "candidate",
          tool: "freeflow_context",
          expect: "not-called",
        },
      ]),
      { baseline: absentRun, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "protected-reference-not-called", state: "pass" },
        { id: "tool-not-called", state: "fail" },
      ],
    );
  });
});

test("context-text grading observes per-turn extension injections", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const baseline = await contextRun(workspace, [
      { surface: "system-prompt", turn: 1, requestInTurn: 1, text: "base prompt" },
    ]);
    const candidate = await contextRun(workspace, [
      { surface: "system-prompt", turn: 1, requestInTurn: 1, text: "base prompt\\nInjected extension context" },
    ]);
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "baseline-no-injection",
          kind: "context-text",
          variant: "baseline",
          turn: 1,
          expect: "contains",
          value: "Injected extension context",
          comparison: "context-injection",
        },
        {
          id: "candidate-injection",
          kind: "context-text",
          variant: "candidate",
          turn: 1,
          expect: "contains",
          value: "Injected extension context",
          comparison: "context-injection",
        },
      ]),
      { baseline, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-injection", state: "fail" },
        { id: "candidate-injection", state: "pass" },
      ],
    );
  });
});

test("context-text grading distinguishes provider-context injections from system prompts", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const baseline = await contextRun(workspace, [
      { surface: "provider-context", turn: 1, requestInTurn: 1, text: "base projected messages" },
      { surface: "provider-context", turn: 1, requestInTurn: 2, text: "base projected messages later" },
    ]);
    const candidate = await contextRun(workspace, [
      { surface: "provider-context", turn: 1, requestInTurn: 1, text: "base projected messages" },
      {
        surface: "provider-context",
        turn: 1,
        requestInTurn: 2,
        text: "base projected messages later\\nInjected context event text",
      },
    ]);
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "baseline-no-provider-injection",
          kind: "context-text",
          variant: "baseline",
          surface: "provider-context",
          request: "last",
          turn: 1,
          expect: "contains",
          value: "Injected context event text",
          comparison: "provider-context-injection",
        },
        {
          id: "candidate-provider-injection",
          kind: "context-text",
          variant: "candidate",
          surface: "provider-context",
          request: "last",
          turn: 1,
          expect: "contains",
          value: "Injected context event text",
          comparison: "provider-context-injection",
        },
      ]),
      { baseline, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-provider-injection", state: "fail" },
        { id: "candidate-provider-injection", state: "pass" },
      ],
    );
    const observed = grade.checks.find((check) => check.id === "candidate-provider-injection")?.observed;
    assert.equal(observed.systemPrompt, undefined);
    assert.equal(observed.matched, true);
    assert.equal(typeof observed.sha256, "string");
    assert.equal(observed.preview.includes("Injected context event text"), true);
  });
});

test("JSON grading distinguishes missing, malformed, absent, null, and other values", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const malformed = "{not-json\n";
    const valid = '{"present":null,"other":"value"}\n';
    await writeFile(path.join(workspace, "malformed.json"), malformed);
    await writeFile(path.join(workspace, "valid.json"), valid);

    const expectations = [
      {
        id: "missing-file",
        kind: "json",
        variant: "candidate",
        path: "missing.json",
        expect: "available",
      },
      {
        id: "malformed-file",
        kind: "json",
        variant: "candidate",
        path: "malformed.json",
        expect: "valid",
      },
      {
        id: "present-null",
        kind: "json",
        variant: "candidate",
        path: "valid.json",
        expect: "field-equals",
        pointer: "/present",
        value: null,
      },
      {
        id: "absent-not-null",
        kind: "json",
        variant: "candidate",
        path: "valid.json",
        expect: "field-equals",
        pointer: "/missing",
        value: null,
      },
      {
        id: "absent-field",
        kind: "json",
        variant: "candidate",
        path: "valid.json",
        expect: "field-absent",
        pointer: "/missing",
      },
      {
        id: "other-value",
        kind: "json",
        variant: "candidate",
        path: "valid.json",
        expect: "field-equals",
        pointer: "/other",
        value: "value",
      },
    ];
    const candidate = completeRun(workspace, [
      { path: "malformed.json", sha256: sha256(malformed) },
      { path: "valid.json", sha256: sha256(valid) },
    ]);

    const grade = await gradeDeterministic(bodyGroup(expectations), { baseline: absentRun, candidate }, evidence);

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "missing-file", state: "fail" },
        { id: "malformed-file", state: "fail" },
        { id: "present-null", state: "pass" },
        { id: "absent-not-null", state: "fail" },
        { id: "absent-field", state: "pass" },
        { id: "other-value", state: "pass" },
      ],
    );
    assert.deepEqual(grade.checks[0].observed, {
      file: "missing",
      sha256: null,
      parse: "unavailable",
      field: "unavailable",
      value: null,
    });
    assert.deepEqual(grade.checks[1].observed, {
      file: "present",
      sha256: sha256(malformed),
      parse: "malformed",
      field: "unavailable",
      value: null,
    });
    assert.deepEqual(grade.checks[2].observed, {
      file: "present",
      sha256: sha256(valid),
      parse: "valid",
      field: "present",
      value: null,
    });
    assert.deepEqual(grade.checks[3].observed, {
      file: "present",
      sha256: sha256(valid),
      parse: "valid",
      field: "absent",
      value: null,
    });
  });
});

test("path grading preserves an existing empty directory", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(path.join(workspace, "empty"), { recursive: true });
    const candidate = completeRun(workspace, await fingerprintDirectory(workspace));
    const grade = await gradeDeterministic(
      bodyGroup([
        {
          id: "empty-directory",
          kind: "path",
          variant: "candidate",
          path: "empty",
          expect: "exists",
        },
      ]),
      { baseline: absentRun, candidate },
      evidence,
    );

    assert.equal(grade.state, "complete");
    assert.equal(grade.checks[0].state, "pass");
    assert.equal(grade.checks[0].observed.type, "directory");
  });
});

test("grading reports exact reads, paths, changes, text, responses, and factual transitions", async () => {
  await withTempDirectory(async (root) => {
    const baselineWorkspace = path.join(root, "baseline-workspace");
    const candidateWorkspace = path.join(root, "candidate-workspace");
    const skillRoot = path.join(root, "skill");
    const contextRoot = path.join(root, "context");
    await Promise.all([mkdir(baselineWorkspace), mkdir(candidateWorkspace), mkdir(skillRoot), mkdir(contextRoot)]);
    const input = "input\n";
    const report = "success\n";
    const skill = "# Skill\n";
    const context = "contract\n";
    await Promise.all([
      writeFile(path.join(baselineWorkspace, "input.txt"), input),
      writeFile(path.join(candidateWorkspace, "input.txt"), input),
      writeFile(path.join(candidateWorkspace, "report.txt"), report),
      writeFile(path.join(skillRoot, "SKILL.md"), skill),
      writeFile(path.join(contextRoot, "contract.md"), context),
    ]);

    const commonResources = {
      skills: [{ path: skillRoot, files: [{ path: "SKILL.md", sha256: sha256(skill) }] }],
      context: [{ path: contextRoot, files: [{ path: "contract.md", sha256: sha256(context) }] }],
      targetPath: path.join(skillRoot, "SKILL.md"),
    };
    const baseline = {
      ...completeRun(baselineWorkspace, [{ path: "input.txt", sha256: sha256(input) }]),
      response: "baseline",
      successfulReadPaths: [],
      resources: commonResources,
    };
    const candidate = {
      ...completeRun(candidateWorkspace, [
        { path: "input.txt", sha256: sha256(input) },
        { path: "report.txt", sha256: sha256(report) },
      ]),
      response: "candidate success",
      successfulReadPaths: [
        await realpath(path.join(skillRoot, "SKILL.md")),
        await realpath(path.join(candidateWorkspace, "input.txt")),
      ],
      resources: commonResources,
    };
    candidate.effects.before = [{ path: "input.txt", sha256: sha256(input) }];
    candidate.effects.changes = { created: ["report.txt"], modified: [], deleted: [] };

    const expectations = [
      {
        id: "target-read",
        kind: "resource-read",
        variant: "candidate",
        resource: "skill",
        index: 0,
        path: "SKILL.md",
        expect: "read",
      },
      {
        id: "context-not-read",
        kind: "resource-read",
        variant: "candidate",
        resource: "context",
        index: 0,
        path: "contract.md",
        expect: "not-read",
      },
      {
        id: "workspace-read",
        kind: "resource-read",
        variant: "candidate",
        resource: "workspace",
        path: "input.txt",
        expect: "read",
      },
      {
        id: "report-exists-baseline",
        comparison: "report-exists",
        kind: "path",
        variant: "baseline",
        path: "report.txt",
        expect: "exists",
      },
      {
        id: "report-exists-candidate",
        comparison: "report-exists",
        kind: "path",
        variant: "candidate",
        path: "report.txt",
        expect: "exists",
      },
      {
        id: "missing-absent",
        kind: "path",
        variant: "candidate",
        path: "missing.txt",
        expect: "absent",
      },
      {
        id: "exact-change",
        kind: "changed-paths",
        variant: "candidate",
        expect: "equals",
        paths: ["report.txt"],
      },
      {
        id: "input-not-changed",
        kind: "changed-paths",
        variant: "candidate",
        expect: "excludes",
        paths: ["input.txt"],
      },
      {
        id: "report-contains",
        kind: "file-text",
        variant: "candidate",
        path: "report.txt",
        expect: "contains",
        value: "success",
      },
      {
        id: "report-excludes",
        kind: "file-text",
        variant: "candidate",
        path: "report.txt",
        expect: "not-contains",
        value: "failure",
      },
      {
        id: "response-equals",
        kind: "response-text",
        variant: "candidate",
        expect: "equals",
        value: "candidate success",
      },
      {
        id: "response-excludes",
        kind: "response-text",
        variant: "candidate",
        expect: "not-contains",
        value: "failure",
      },
    ];

    const grade = await gradeDeterministic(bodyGroup(expectations), { baseline, candidate }, evidence);

    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      expectations.map(({ id }) => ({
        id,
        state: id === "report-exists-baseline" ? "fail" : "pass",
      })),
    );
    assert.equal(grade.checks.find((check) => check.id === "report-contains").observed.sha256, sha256(report));
    assert.equal(Object.hasOwn(grade.checks.find((check) => check.id === "report-contains").observed, "text"), false);
    assert.deepEqual(grade.comparisons, [
      {
        id: "report-exists",
        kind: "path",
        baseline: { check: "report-exists-baseline", state: "fail" },
        candidate: { check: "report-exists-candidate", state: "pass" },
        transition: "fail-to-pass",
      },
    ]);
  });
});

test("a report is unavailable when every valid check lacks required run evidence", async () => {
  const group = bodyGroup([
    {
      id: "missing-response",
      kind: "response-text",
      variant: "candidate",
      expect: "contains",
      value: "done",
    },
  ]);

  const grade = await gradeDeterministic(
    group,
    { baseline: absentRun, candidate: { state: "infrastructure-failed" } },
    evidence,
  );

  assert.equal(grade.state, "unavailable");
  assert.equal(grade.checks[0].state, "unavailable");
});
