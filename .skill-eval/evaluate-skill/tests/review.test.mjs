import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));
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
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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
appendFileSync(config.log, JSON.stringify({ args, prompt: args.at(-1), cwd: process.cwd(), leakedEnv: Object.keys(process.env).filter((key) => key.startsWith("FAKE_")) }) + "\\n");
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
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, FAKE_SHOULD_NOT_LEAK: "1" },
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

test("review requires an explicit reviewer model", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installReviewerPi(root);
    await writeResult(root);
    const result = review(root, bin, [], "{}");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --model/);
  });
});
