import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { toV2 } from "./helpers/to-v2.mjs";

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
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
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
  agentSettings: env.PI_CODING_AGENT_DIR && existsSync(path.join(env.PI_CODING_AGENT_DIR, "settings.json")) ? JSON.parse(readFileSync(path.join(env.PI_CODING_AGENT_DIR, "settings.json"), "utf8")) : null,
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

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

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

test("a provider with no stored login still runs, with nothing copied", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, { other: { type: "api_key", key: "k" } });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const [call] = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(call.agentAuth, null);
  });
});

// A stand-in for pi-login-refresh.mjs: it extends the stored login, as Pi's refresh would, and counts calls.
async function installFakeRefresh(root, { fail = false } = {}) {
  const script = path.join(root, "fake-refresh.mjs");
  await writeFile(
    script,
    `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const [authPath, provider, minutes] = process.argv.slice(2);
appendFileSync(${JSON.stringify(path.join(root, "refresh.log"))}, provider + " " + minutes + "\\n");
${fail ? 'process.stderr.write("refresh token revoked\\n"); process.exit(1);' : ""}
const auth = JSON.parse(readFileSync(authPath, "utf8"));
auth[provider].expires = Date.now() + (Number(minutes) + 60) * 60000;
writeFileSync(authPath, JSON.stringify(auth));
`,
  );
  return script;
}

test("an OAuth login close to expiry is refreshed once, centrally, before any subject starts", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, {
      fake: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 10 * 60 * 1000 },
    });
    env.SKILL_EVAL_LOGIN_REFRESH = await installFakeRefresh(root);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual((await readFile(path.join(root, "refresh.log"), "utf8")).trim().split("\n"), ["fake 120"]);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const call of calls) assert.ok(call.agentAuth.fake.expires > Date.now() + 100 * 60000);
  });
});

test("a login the refresh cannot renew refuses the run before anything starts", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, {
      fake: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 10 * 60 * 1000 },
    });
    env.SKILL_EVAL_LOGIN_REFRESH = await installFakeRefresh(root, { fail: true });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refreshing the fake login failed \(log in again in Pi\): refresh token revoked/);
    await assert.rejects(readFile(log), { code: "ENOENT" });
  });
});

async function declareHost(definition, host) {
  const value = JSON.parse(await readFile(definition, "utf8"));
  value.configuration.host = { name: "pi", ...host };
  await writeJson(definition, value);
}

async function installPiPackage(env, name, version) {
  const directory = path.join(env.SKILL_EVAL_CREDENTIALS_DIR, "npm", "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
  return directory;
}

test("declared host extensions load from the installed Pi packages, right after the guard, and are recorded", async () => {
  await withTempDirectory(async (root) => {
    const { definition, env } = await setUp(root, { fake: { type: "api_key", key: "k" } });
    const plugin = await installPiPackage(env, "auth-plugin", "2.0.0");
    await declareHost(definition, { extensions: [{ package: "auth-plugin", version: "2.0.0" }] });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /^Plan: .+; extensions: auth-plugin@2\.0\.0; dry run$/m);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    for (const variant of ["baseline", "candidate"]) {
      const run = JSON.parse(
        await readFile(path.join(resultDirectory, "groups/isolated", variant, "run.json"), "utf8"),
      );
      const extensions = run.process.args.flatMap((arg, index) =>
        arg === "--extension" ? [run.process.args[index + 1]] : [],
      );
      assert.match(extensions[0], /pi-guard\.mjs$/);
      assert.equal(extensions[1], plugin);
      assert.deepEqual(run.resources.hostExtensions, [{ path: plugin, package: "auth-plugin@2.0.0" }]);
    }
  });
});

test("a declared extension that is missing or another version refuses the run before anything starts", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, { fake: { type: "api_key", key: "k" } });
    await installPiPackage(env, "auth-plugin", "2.0.0");
    await declareHost(definition, { extensions: [{ package: "auth-plugin", version: "1.0.0" }] });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /auth-plugin is 2\.0\.0 in Pi, but the definition declares 1\.0\.0/);
    await assert.rejects(readFile(log), { code: "ENOENT" });
  });
});

test("declared host settings become each subject's Pi settings, and cannot load packages", async () => {
  await withTempDirectory(async (root) => {
    const { log, definition, env } = await setUp(root, { fake: { type: "api_key", key: "k" } });
    await declareHost(definition, { settings: { retry: { enabled: false }, defaultThinkingLevel: "low" } });

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    // Declared settings win over the evaluator's defaults, which still apply where nothing is declared.
    for (const call of calls) {
      assert.deepEqual(call.agentSettings, {
        retry: { enabled: false },
        compaction: { enabled: false },
        defaultThinkingLevel: "low",
      });
    }

    await declareHost(definition, { settings: { packages: ["npm:anything"] } });
    const refused = spawnSync(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env,
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /host\.settings cannot set packages; declare extensions in host\.extensions/);
  });
});
