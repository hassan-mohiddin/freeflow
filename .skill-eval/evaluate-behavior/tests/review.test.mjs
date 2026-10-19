import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HONEST, hostileWorkspace, SECRET, WRITTEN } from "./helpers/hostile-workspace.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const RESULT_ID = "20260925000000-feedface";
const QUESTION = "Did the run name a rollback step before shipping?";

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-review-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
}

function bodyRun(variant, response, created) {
  return {
    schema_version: 1,
    variant,
    state: "complete",
    evaluationType: "body",
    prompt: "Prepare this change for release.",
    response,
    toolActivity: [{ toolName: "run_command", args: { command: "unit-tests" }, completed: true, isError: false }],
    effects: { changes: { created, modified: [], deleted: [] } },
  };
}

async function writeResult(root, { reviewQuestions = [QUESTION], baselineState = "complete" } = {}) {
  const resultDirectory = path.join(root, ".skill-eval/runs", RESULT_ID);
  const groupDirectory = path.join(resultDirectory, "groups/release-plan");
  await writeJson(path.join(resultDirectory, "summary.json"), {
    schema_version: 1,
    id: RESULT_ID,
    state: "complete",
    definitionKind: "group",
    groups: [
      {
        id: "release-plan",
        position: 1,
        state: "complete",
        variants: { baseline: "complete", candidate: "complete" },
        grade: "complete",
        artifacts: { grade: "deterministic-grade.json", group: "group.json" },
        errors: [],
      },
    ],
  });
  await writeJson(path.join(groupDirectory, "definition.json"), {
    schema_version: 1,
    kind: "group",
    id: "release-plan",
    type: "body",
    input: { prompt: "Prepare this change for release." },
    fixture: null,
    tools: ["read"],
    variants: {},
    expectations: [],
    review_questions: reviewQuestions,
  });
  await writeJson(path.join(groupDirectory, "deterministic-grade.json"), {
    schema_version: 1,
    state: "complete",
    checks: [],
    comparisons: [],
    errors: [],
  });
  await writeJson(path.join(groupDirectory, "group.json"), { id: "release-plan", state: "complete" });
  const baseline = bodyRun("baseline", "Ship it now.", []);
  baseline.state = baselineState;
  await writeJson(path.join(groupDirectory, "baseline/run.json"), baseline);
  await writeJson(
    path.join(groupDirectory, "candidate/run.json"),
    bodyRun("candidate", "Verify the rollback step, then ship.", ["plan.md"]),
  );
  return { resultDirectory, groupDirectory };
}

async function installReviewerPi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
// The reviewer runs with only the base environment, so the fake reads its settings from beside itself.
const config = JSON.parse(readFileSync(new URL("./fake-review.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const readSettings = () => { try { return JSON.parse(readFileSync(process.env.PI_CODING_AGENT_DIR + "/settings.json", "utf8")); } catch { return null; } };
appendFileSync(config.log, JSON.stringify({ args, prompt: args.at(-1), cwd: process.cwd(), settings: readSettings(), leakedEnv: Object.keys(process.env).filter((key) => key.startsWith("FAKE_")) }) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const message = {
  role: "assistant",
  content: [{ type: "text", text: config.output }],
  provider: "fake",
  model: "reviewer",
  usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } },
  stopReason: "stop",
};
emit({ type: "message_end", message });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

function review(root, bin, args, output) {
  writeFileSync(path.join(bin, "fake-review.json"), JSON.stringify({ log: path.join(root, "review.jsonl"), output }));
  return spawnSync(process.execPath, [entrypoint, "review", RESULT_ID, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_SHOULD_NOT_LEAK: "1",
      SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    },
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("review records variant-blind advisory answers without touching canonical grades", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeResult(root);
    const gradeBefore = sha256(await readFile(path.join(groupDirectory, "deterministic-grade.json")));
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    const result = review(root, bin, ["--model", "reviewer/model", "--thinking", "high"], output);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Review release-plan: complete/);
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.equal(semantic.state, "complete");
    assert.equal(semantic.advisory, true);
    assert.deepEqual(new Set(Object.values(semantic.labels)), new Set(["baseline", "candidate"]));
    const [answer] = semantic.answers;
    assert.equal(answer.question, QUESTION);
    assert.equal(answer[semantic.labels.A], "yes");
    assert.equal(answer[semantic.labels.B], "no");
    assert.equal(answer.rationale, "A names rollback.");
    assert.equal(semantic.model, "reviewer/model");
    assert.equal(sha256(await readFile(path.join(groupDirectory, "deterministic-grade.json"))), gradeBefore);

    const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const flag of ["--no-tools", "--no-skills", "--no-extensions", "--no-context-files", "--no-session"]) {
      assert.ok(call.args.includes(flag), flag);
    }
    assert.deepEqual(call.leakedEnv, []);
    assert.equal(call.args[call.args.indexOf("--model") + 1], "reviewer/model");
    assert.equal(call.args[call.args.indexOf("--thinking") + 1], "high");
    assert.match(call.prompt, /Run A/);
    assert.match(call.prompt, /Run B/);
    assert.ok(call.prompt.includes(QUESTION));
    assert.ok(call.prompt.includes("Verify the rollback step, then ship."));
    assert.ok(call.prompt.includes("plan.md"));
    assert.doesNotMatch(call.prompt, /baseline|candidate/i);
    assert.equal(semantic.prompt.sha256, sha256(call.prompt));
  });
});

test("the reply shape shows one entry for each question", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root, { reviewQuestions: [QUESTION, "Did the run avoid unsupported claims?"] });
    const output = JSON.stringify({
      answers: [
        { question: 1, A: "yes", B: "no", rationale: "A names rollback." },
        { question: 2, A: "yes", B: "yes", rationale: "Both cite the plan." },
      ],
    });

    const result = review(root, bin, ["--model", "reviewer/model"], output);

    assert.equal(result.status, 0, result.stderr);
    const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.match(call.prompt, /one entry for each of the 2 questions/);
    assert.ok(call.prompt.includes('{"question":1,'), "the shape shows question 1");
    assert.ok(call.prompt.includes('{"question":2,'), "the shape shows question 2");
  });
});

test("view shows the advisory review mapped back to variants", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeResult(root);
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });
    assert.equal(review(root, bin, ["--model", "reviewer/model"], output).status, 0);
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    const expected = { baseline: semantic.labels.A === "baseline" ? "yes" : "no" };
    expected.candidate = expected.baseline === "yes" ? "no" : "yes";

    const viewed = spawnSync(process.execPath, [entrypoint, "view", RESULT_ID], { cwd: root, encoding: "utf8" });

    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(viewed.stdout, /Advisory review \[complete\] model=reviewer\/model \(not canonical evidence\)/);
    assert.ok(
      viewed.stdout.includes(
        `review\tQ1\tbaseline=${expected.baseline}\tcandidate=${expected.candidate}\tA names rollback.`,
      ),
      viewed.stdout,
    );
    assert.ok(viewed.stdout.includes("judge\tcontract gap: order not swapped"), viewed.stdout);
    assert.ok(viewed.stdout.includes("judge\tfamily=unknown"), viewed.stdout);
  });
});

test("malformed reviewer output is preserved as a review error", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeResult(root);

    for (const output of [
      "The candidate looks better.",
      JSON.stringify({ answers: [{ question: 1, A: "probably", B: "no", rationale: "" }] }),
      JSON.stringify({ answers: [] }),
    ]) {
      const result = review(root, bin, ["--model", "reviewer/model"], output);

      assert.equal(result.status, 1, output);
      const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
      assert.equal(semantic.state, "review-error");
      assert.ok(semantic.errors.length > 0);
      assert.equal(await readFile(path.join(groupDirectory, "review/final.md"), "utf8"), `${output}\n`);
    }
  });
});

test("review skips groups without questions or complete runs", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root, { reviewQuestions: [] });
    let result = review(root, bin, ["--model", "reviewer/model"], "{}");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Review release-plan: skipped/);

    await rm(path.join(root, ".skill-eval"), { recursive: true });
    const { groupDirectory } = await writeResult(root, { baselineState: "infrastructure-failed" });
    result = review(root, bin, ["--model", "reviewer/model"], "{}");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Review release-plan: skipped/);
    await assert.rejects(readFile(path.join(groupDirectory, "semantic-grade.json")), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(root, "review.jsonl")), { code: "ENOENT" });
  });
});

// The reviewer's credentials directory in these tests; installed Pi packages live under it.
async function installJudgePackage(root, name, version) {
  const directory = path.join(root, "no-credentials", "npm", "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
  return directory;
}

test("review takes its model, extensions and settings from a configuration file and records them", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeResult(root);
    const plugin = await installJudgePackage(root, "auth-plugin", "1.2.3");
    await writeJson(path.join(root, "judge.json"), {
      schema_version: 2,
      kind: "configuration",
      id: "judge",
      configuration: {
        host: {
          name: "pi",
          extensions: [{ package: "auth-plugin", version: "1.2.3" }],
          settings: { retry: { enabled: false } },
        },
        model: { model: "reviewer/model", thinking: "low" },
      },
    });
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    const result = review(root, bin, ["--configuration", "judge.json"], output);

    assert.equal(result.status, 0, result.stderr);
    const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const loaded = call.args.flatMap((arg, index) => (arg === "--extension" ? [call.args[index + 1]] : []));
    assert.deepEqual(loaded, [plugin]);
    assert.ok(call.args.indexOf("--no-extensions") < call.args.indexOf("--extension"));
    assert.equal(call.args[call.args.indexOf("--model") + 1], "reviewer/model");
    assert.equal(call.args[call.args.indexOf("--thinking") + 1], "low");
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.deepEqual(semantic.extensions, [{ path: plugin, package: "auth-plugin@1.2.3" }]);
    assert.deepEqual(semantic.judge.settings, { retry: { enabled: false } });
    assert.equal(semantic.judge.setup, "command-line");
  });
});

test("without --configuration, the reviewer runs on the group's host setup and records it", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeResult(root);
    const plugin = await installJudgePackage(root, "group-auth", "1.0.0");
    // A stored definition records each arm's declared host setup; the reference arm's is the group's.
    const definitionFile = path.join(groupDirectory, "definition.json");
    const definition = JSON.parse(await readFile(definitionFile, "utf8"));
    const host = {
      hostExtensions: [{ package: "group-auth", version: "1.0.0" }],
      hostSettings: { retry: { enabled: false } },
    };
    definition.variants = { baseline: { ...host }, candidate: { ...host } };
    await writeFile(definitionFile, `${JSON.stringify(definition, null, 2)}\n`);
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    const result = review(root, bin, ["--model", "reviewer/model"], output);

    assert.equal(result.status, 0, result.stderr);
    const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const loaded = call.args.flatMap((arg, index) => (arg === "--extension" ? [call.args[index + 1]] : []));
    assert.deepEqual(loaded, [plugin], "the reviewer loads the group's auth extension");
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.equal(semantic.judge.setup, "group");
    assert.deepEqual(semantic.judge.extensions, [{ path: plugin, package: "group-auth@1.0.0" }]);
    assert.deepEqual(semantic.judge.settings, { retry: { enabled: false } });
  });
});

test("the reviewer runs with the evaluator's Pi defaults, and declared settings win", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root);
    await writeJson(path.join(root, "judge.json"), {
      schema_version: 2,
      kind: "configuration",
      id: "judge",
      configuration: {
        host: { name: "pi", settings: { retry: { enabled: true } } },
        model: { model: "reviewer/model" },
      },
    });
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    assert.equal(review(root, bin, ["--model", "reviewer/model"], output).status, 0);
    assert.equal(review(root, bin, ["--configuration", "judge.json"], output).status, 0);

    const [plain, configured] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(plain.settings, { retry: { enabled: false }, compaction: { enabled: false } });
    assert.deepEqual(configured.settings, { retry: { enabled: true }, compaction: { enabled: false } });
  });
});

test("review refuses a configuration whose extension is not installed, before starting the reviewer", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root);
    await writeJson(path.join(root, "judge.json"), {
      schema_version: 2,
      kind: "configuration",
      id: "judge",
      configuration: { host: { name: "pi", extensions: [{ package: "missing", version: "1.0.0" }] } },
    });
    const result = review(root, bin, ["--model", "reviewer/model", "--configuration", "judge.json"], "{}");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /host\.extensions: missing is not installed in Pi/);
    await assert.rejects(readFile(path.join(root, "review.jsonl")), { code: "ENOENT" });
  });
});

async function writeWorkspaceResult(root) {
  const { groupDirectory } = await writeResult(root);
  const long = `# Plan\n\n${"Step: verify the rollback before shipping. ".repeat(20)}\nEND-OF-PLAN\n`;
  for (const variant of ["baseline", "candidate"]) {
    const workspace = path.join(groupDirectory, variant, "workspace");
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "plan.md"), `${variant === "candidate" ? long : "Ship now.\n"}`);
    const run = bodyRun(variant, `Wrote ${path.join(workspace, "plan.md")}.`, ["plan.md"]);
    run.workspace = workspace;
    run.model = { declared: { model: "fake/subject" }, observed: { provider: "fake", model: "subject" } };
    run.toolActivity = [
      { toolName: "write", args: { path: path.join(workspace, "plan.md") }, completed: true, isError: false },
      // A blocked read outside the sandbox names a repository path that is not under the run.
      { toolName: "read", args: { path: path.join(root, "src/secret.mjs") }, completed: true, isError: true },
    ];
    await writeJson(path.join(groupDirectory, variant, "run.json"), run);
  }
  const fixture = path.join(groupDirectory, "resources/fixture");
  await mkdir(fixture, { recursive: true });
  await writeFile(path.join(fixture, "requirements.md"), "Requirement: name the rollback step. FIXTURE-MARK\n");
  return { groupDirectory, long };
}

test("the judge sees written files in full, the fixture, and no run paths or arm names", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeWorkspaceResult(root);
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    const result = review(root, bin, ["--model", "reviewer/model"], output);

    assert.equal(result.status, 0, result.stderr);
    const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(call.prompt.includes("END-OF-PLAN"), "the full written file reaches the judge");
    assert.ok(call.prompt.includes("FIXTURE-MARK"), "the task materials reach the judge");
    assert.ok(!call.prompt.includes(root), "no absolute run path reaches the judge");
    assert.doesNotMatch(call.prompt, /baseline|candidate/i);
  });
});

test("the judge never sees a file through a link the run made, nor a FIFO, and the review finishes", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeWorkspaceResult(root);
    const workspace = path.join(groupDirectory, "candidate", "workspace");
    const hostile = await hostileWorkspace(workspace, path.join(root, "outside"));
    try {
      const run = JSON.parse(await readFile(path.join(groupDirectory, "candidate", "run.json"), "utf8"));
      run.effects.changes.created = WRITTEN;
      await writeJson(path.join(groupDirectory, "candidate", "run.json"), run);
      writeFileSync(
        path.join(bin, "fake-review.json"),
        JSON.stringify({
          log: path.join(root, "review.jsonl"),
          output: JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] }),
        }),
      );

      const result = spawnSync(process.execPath, [entrypoint, "review", RESULT_ID, "--model", "reviewer/model"], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
        },
      });

      assert.equal(result.error, undefined, "the review finished");
      assert.equal(result.status, 0, result.stderr);
      const [call] = (await readFile(path.join(root, "review.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.ok(call.prompt.includes(HONEST), "a regular written file reaches the judge");
      assert.equal(call.prompt.includes(SECRET), false, "nothing behind a link reaches the judge");
      assert.match(call.prompt, /### File written: login\.md\n\(a link the run made, to .*; not followed\)/);
      assert.match(call.prompt, /### File written: fifo\.md\n\(not read: not a regular file\)/);
    } finally {
      hostile.release();
    }
  });
});

test("--limit changes what the judge sees, and a cut is recorded as a contract gap", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeWorkspaceResult(root);
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    const full = review(root, bin, ["--model", "reviewer/model"], output);
    assert.equal(full.status, 0, full.stderr);
    const untouched = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.deepEqual(untouched.limits, { response: 8000, argument: 300, file: 20000, materials: 60000 });
    assert.equal(untouched.truncated, 0);
    assert.ok(!untouched.contractGaps.includes("materials truncated"));

    const cut = review(root, bin, ["--model", "reviewer/model", "--limit", "file=40"], output);
    assert.equal(cut.status, 0, cut.stderr);
    const calls = (await readFile(path.join(root, "review.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(!calls.at(-1).prompt.includes("END-OF-PLAN"), "the written file is cut at 40 characters");
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.equal(semantic.limits.file, 40);
    assert.ok(semantic.truncated > 0);
    assert.ok(semantic.contractGaps.includes("materials truncated"));
  });
});

test("review refuses an unknown or malformed --limit before starting the reviewer", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root);
    for (const [limit, message] of [
      ["file=lots", /--limit requires <name>=<chars>/],
      ["pages=10", /unknown review limit: pages/],
      ["file=0", /review limit file must be a positive integer/],
    ]) {
      const result = review(root, bin, ["--model", "reviewer/model", "--limit", limit], "{}");
      assert.notEqual(result.status, 0, limit);
      assert.match(result.stderr, message);
    }
    await assert.rejects(readFile(path.join(root, "review.jsonl")), { code: "ENOENT" });
  });
});

test("the judge's identity, family relation and contract gaps are recorded", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeWorkspaceResult(root);
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A names rollback." }] });

    assert.equal(review(root, bin, ["--model", "reviewer/model", "--thinking", "low"], output).status, 0);

    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    const { isolation, ...identity } = semantic.judge;
    assert.deepEqual(identity, {
      model: "reviewer/model",
      provider: "reviewer",
      family: "reviewer",
      thinking: "low",
      setup: "group",
      extensions: [],
      settings: {},
    });
    // The judge runs isolated too; no login is stored for this fake provider, so none is copied.
    assert.equal(isolation.provider, "reviewer");
    assert.deepEqual(isolation.credentials, []);
    assert.ok(isolation.root.startsWith(groupDirectory));
    assert.deepEqual(semantic.subject, { providers: ["fake"], familyRelation: "different" });
    assert.deepEqual(semantic.contractGaps, ["order not swapped", "calibration not checked"]);
  });
});

test("--swap reruns the judge with the order reversed and reports agreement", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    const { groupDirectory } = await writeWorkspaceResult(root);
    // The fake answers A=yes, B=no both times, so the verdict follows the position, not the run.
    const output = JSON.stringify({ answers: [{ question: 1, A: "yes", B: "no", rationale: "A is first." }] });

    const result = review(root, bin, ["--model", "reviewer/model", "--swap"], output);

    assert.equal(result.status, 0, result.stderr);
    const calls = (await readFile(path.join(root, "review.jsonl"), "utf8")).trim().split("\n");
    assert.equal(calls.length, 2);
    const semantic = JSON.parse(await readFile(path.join(groupDirectory, "semantic-grade.json"), "utf8"));
    assert.deepEqual(semantic.swap.labels, { A: semantic.labels.B, B: semantic.labels.A });
    assert.deepEqual(semantic.swap.agreement, { agreed: 0, questions: 1 });
    assert.deepEqual(semantic.contractGaps, ["calibration not checked"]);
  });
});

test("review requires an explicit reviewer model", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root);
    const result = review(root, bin, [], "{}");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --model or --configuration/);
  });
});
