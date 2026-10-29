import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const COMMIT = "c0ffee".padEnd(40, "0");

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-freeflow-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

// A stand-in for scripts/freeflow-snapshot.mjs: it writes the package layout the evaluator needs, with a
// validator that rejects one key, and logs each build.
async function installFakeSnapshot(root) {
  const script = path.join(root, "scripts", "freeflow-snapshot.mjs");
  await mkdir(path.dirname(script), { recursive: true });
  await writeFile(
    script,
    `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const target = option("--target");
appendFileSync(${JSON.stringify(path.join(root, "builds.log"))}, option("--commit") + "\\n");
mkdirSync(path.join(target, "pi-extension", "freeflow"), { recursive: true });
mkdirSync(path.join(target, "pi-extension", "dist", "host"), { recursive: true });
writeFileSync(path.join(target, "pi-extension", "freeflow", "index.js"), "export default () => {};\\n");
writeFileSync(path.join(target, "pi-extension", "dist", "host", "config-validation.js"),
  "export function validateRepositoryConfig(value) { return 'bogus' in value ? 'unsupported top-level config key: bogus' : null; }\\n" +
  "export function validateLocalConfig() { return null; }\\n");
writeFileSync(option("--metadata"), JSON.stringify({ sourceCommit: ${JSON.stringify(COMMIT)}, packageName: "freeflow", packageVersion: "0.0.0-test", tarballSha256: "f".repeat(64) }));
`,
  );
}

// A fake Pi that records its arguments, allowed roots and the Freeflow settings it finds in its workspace.
async function installRecordingPi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from "node:fs";
const config = existsSync(".freeflow/config.json") ? JSON.parse(readFileSync(".freeflow/config.json", "utf8")) : null;
appendFileSync(${JSON.stringify(path.join(root, "pi.jsonl"))}, JSON.stringify({
  args: process.argv.slice(2),
  allowedRoots: JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS),
  config,
}) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

function freeflowGroup({ candidateRepository = { taskMemory: { enabled: true } }, prompt = "host" } = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "task-memory",
    type: "description",
    input: { prompt: "Pick up where the last session left off." },
    fixture: null,
    tools: ["read"],
    configuration: {
      host: { name: "pi" },
      model: { model: "fake/model" },
      subject: { kind: "none" },
      runtime: { prompt },
      freeflow: { source: { kind: "git", ref: "HEAD" }, repository: { taskMemory: { enabled: false } } },
    },
    arms: { baseline: {}, candidate: { freeflow: { repository: candidateRepository } } },
    component: ["freeflow.repository.taskMemory.enabled"],
    expectations: [{ id: "no-skill-read", kind: "skill-read", variant: "candidate", expect: "never" }],
    review_questions: [],
  };
}

function runCli(root, bin, definition) {
  return spawnSync(process.execPath, [entrypoint, "run", definition, "--uncommitted", "--jobs", "1"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    },
  });
}

test("a Freeflow configuration is built once per commit, loaded after the guard, and written to each workspace", async () => {
  await withTempDirectory(async (root) => {
    await installFakeSnapshot(root);
    const bin = await installRecordingPi(root);
    const definition = await writeJson(path.join(root, "groups/task-memory.json"), freeflowGroup());

    const result = runCli(root, bin, definition);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal((await readFile(path.join(root, "builds.log"), "utf8")).trim().split("\n").length, 1);
    const calls = (await readFile(path.join(root, "pi.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      calls.map((call) => call.config),
      [{ taskMemory: { enabled: false } }, { taskMemory: { enabled: true } }],
    );
    for (const call of calls) {
      const extensions = call.args.flatMap((arg, index) => (arg === "--extension" ? [call.args[index + 1]] : []));
      assert.match(extensions[0], /pi-guard\.mjs$/);
      assert.match(extensions[1], /resources\/freeflow\/0\/package\/pi-extension\/freeflow\/index\.js$/);
      assert.ok(call.allowedRoots.some((entry) => entry.endsWith("resources/freeflow/0/package")));
    }
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const run = JSON.parse(await readFile(path.join(resultDirectory, "groups/task-memory/candidate/run.json"), "utf8"));
    assert.equal(run.resources.freeflow.commit, COMMIT);
    assert.equal(run.resources.freeflow.package, "freeflow@0.0.0-test");
    assert.deepEqual(run.resources.freeflow.repository, { taskMemory: { enabled: true } });
  });
});

test("Freeflow settings its own build rejects refuse the group before any subject starts", async () => {
  await withTempDirectory(async (root) => {
    await installFakeSnapshot(root);
    const bin = await installRecordingPi(root);
    const definition = await writeJson(
      path.join(root, "groups/task-memory.json"),
      freeflowGroup({ candidateRepository: { taskMemory: { enabled: true }, bogus: 1 } }),
    );
    // bogus is a second difference, so declare it too; the validator, not the diff, must refuse it.
    const value = JSON.parse(await readFile(definition, "utf8"));
    value.component.push("freeflow.repository.bogus");
    await writeJson(definition, value);

    const result = runCli(root, bin, definition);

    assert.notEqual(result.status, 0);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const run = JSON.parse(await readFile(path.join(resultDirectory, "groups/task-memory/candidate/run.json"), "utf8"));
    assert.equal(run.state, "invalid");
    assert.match(
      JSON.stringify(run),
      /candidate Freeflow settings are invalid .*repository: unsupported top-level config key: bogus/,
    );
    await assert.rejects(readFile(path.join(root, "pi.jsonl")), { code: "ENOENT" });
  });
});

test("a Freeflow configuration needs the host prompt", async () => {
  await withTempDirectory(async (root) => {
    const definition = await writeJson(path.join(root, "group.json"), freeflowGroup({ prompt: "isolated" }));
    await assert.rejects(loadDefinition(definition, { root }), {
      message: /freeflow needs configuration\.runtime\.prompt "host"/,
    });
  });
});

// A fake Pi that reads its Freeflow package's verify-work skill twice when one is loaded, then answers; each request's
// usage grows, so peak context is the last one.
async function installSkillReadingPi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const roots = JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS);
const freeflow = roots.find((entry) => entry.endsWith("package"));
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const usage = (input, cacheRead) => ({ input, output: 5, cacheRead, cacheWrite: 0, cost: { total: 0.001 } });
const skill = freeflow + "/skills/verify-work/SKILL.md";
for (const [index, input] of [[0, 100], [1, 60]]) {
  const id = "read-" + index;
  emit({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id, name: "read", arguments: { path: skill } }], usage: usage(input, index * 300), stopReason: "toolUse" } });
  emit({ type: "message_end", message: { role: "toolResult", toolCallId: id, toolName: "read", content: [{ type: "text", text: freeflow ? "v".repeat(40) : "missing" }], isError: !freeflow } });
}
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "model", usage: usage(20, 400), stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

test("run metrics count reads of the loaded Freeflow package's skills and the peak request, and none for plain Pi", async () => {
  await withTempDirectory(async (root) => {
    await installFakeSnapshot(root);
    const bin = await installSkillReadingPi(root);
    const group = freeflowGroup();
    group.arms = { plain: { freeflow: null }, freeflow: {} };
    group.reference = "plain";
    group.component = ["freeflow"];
    group.expectations = [{ id: "no-skill-read", kind: "skill-read", variant: "freeflow", expect: "never" }];
    const definition = await writeJson(path.join(root, "groups/task-memory.json"), group);

    const result = runCli(root, bin, definition);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const metrics = async (arm) =>
      JSON.parse(await readFile(path.join(resultDirectory, "groups/task-memory", arm, "run.json"), "utf8")).metrics;
    // Two reads of 40 bytes each, 10 estimated tokens each; the largest request carried 20 + 400 tokens.
    const freeflow = await metrics("freeflow");
    assert.deepEqual([freeflow.peakContext, freeflow.skillReads, freeflow.skillReadTokens], [420, 2, 20]);
    // Plain Pi has no package: its failed reads count nothing, and it read no skill.
    const plain = await metrics("plain");
    assert.deepEqual([plain.peakContext, plain.skillReads, plain.skillReadTokens], [420, 0, 0]);
  });
});
