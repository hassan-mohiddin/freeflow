import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-isolation-test-")));
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

// A fake Pi that records the environment it was given and what it can see through it.
async function installRecordingPi(root, log) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
const env = process.env;
const agentAuth = env.PI_CODING_AGENT_DIR ? path.join(env.PI_CODING_AGENT_DIR, "auth.json") : null;
appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  HOME: env.HOME ?? null,
  TMPDIR: env.TMPDIR ?? null,
  XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? null,
  PI_CODING_AGENT_DIR: env.PI_CODING_AGENT_DIR ?? null,
  homeMarkerVisible: existsSync(path.join(env.HOME ?? "/nonexistent", "parent-marker")),
  agentAuth: agentAuth && existsSync(agentAuth) ? JSON.parse(readFileSync(agentAuth, "utf8")) : null,
}) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

function group() {
  return {
    schema_version: 1,
    kind: "group",
    id: "isolated",
    type: "description",
    input: { prompt: "Say done." },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: { source: { kind: "working-tree" }, skills: [], target: null, context: [] },
      candidate: { source: { kind: "working-tree" }, skills: [], target: null, context: [] },
    },
    expectations: [{ id: "baseline-no-read", kind: "skill-read", variant: "baseline", expect: "never" }],
    review_questions: [],
    model: { model: "fake/model", thinking: "low" },
  };
}

async function setUp(root, authEntries) {
  const log = path.join(root, "pi.jsonl");
  const bin = await installRecordingPi(root, log);
  const parentHome = path.join(root, "parent-home");
  await mkdir(parentHome, { recursive: true });
  await writeFile(path.join(parentHome, "parent-marker"), "must not be visible\n");
  const credentials = path.join(root, "credentials");
  await writeJson(path.join(credentials, "auth.json"), authEntries);
  const definition = await writeJson(path.join(root, "groups/isolated.json"), group());
  const env = {
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    HOME: parentHome,
    TMPDIR: path.join(root, "parent-tmp"),
    SKILL_EVAL_CREDENTIALS_DIR: credentials,
  };
  return { log, definition, env, parentHome };
}

test("each subject gets its own home, temp and agent directory with only its provider's login", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env, parentHome } = await setUp(root, {
      fake: { type: "api_key", key: "fake-secret-key" },
      other: { type: "api_key", key: "other-secret-key" },
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], { cwd: root, encoding: "utf8", env });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
    for (const call of calls) {
      for (const key of ["HOME", "TMPDIR", "XDG_CONFIG_HOME", "PI_CODING_AGENT_DIR"]) {
        assert.ok(call[key]?.startsWith(resultDirectory), `${key}=${call[key]}`);
      }
      assert.notEqual(call.HOME, parentHome);
      assert.equal(call.homeMarkerVisible, false);
      assert.deepEqual(call.agentAuth, { fake: { type: "api_key", key: "fake-secret-key" } });
    }
    assert.notEqual(calls[0].HOME, calls[1].HOME, "each arm has its own home");

    const runText = await readFile(path.join(resultDirectory, "groups/isolated/candidate/run.json"), "utf8");
    assert.ok(!runText.includes("fake-secret-key"), "credential values never enter run evidence");
    const run = JSON.parse(runText);
    assert.deepEqual(run.isolation.credentials, [{ file: "auth.json", provider: "fake", type: "api_key" }]);
    for (const variant of ["baseline", "candidate"]) {
      await assert.rejects(
        readFile(path.join(resultDirectory, "groups/isolated", variant, "isolation/agent/auth.json")),
        { code: "ENOENT" },
        "the copied login is removed once the process exits",
      );
    }
  });
});

test("an OAuth login that could expire during the run is refused before the subject starts", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, {
      fake: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 10 * 60 * 1000 },
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], { cwd: root, encoding: "utf8", env });

    assert.notEqual(result.status, 0);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    const run = JSON.parse(await readFile(path.join(resultDirectory, "groups/isolated/candidate/run.json"), "utf8"));
    assert.equal(run.state, "invalid");
    assert.match(JSON.stringify(run), /login for fake expires in \d+ minutes/);
    await assert.rejects(readFile(log), { code: "ENOENT" });
  });
});

test("a provider with no stored login still runs, with nothing copied", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, { other: { type: "api_key", key: "k" } });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], { cwd: root, encoding: "utf8", env });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const [call] = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(call.agentAuth, null);
  });
});
