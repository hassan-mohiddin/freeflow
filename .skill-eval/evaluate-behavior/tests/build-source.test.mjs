import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const NODE = process.execPath;

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-build-source-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function git(root, ...args) {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/**
 * A one-shot Pi that imports every host extension built into the group's resources and logs, per arm, the
 * extension's exported VERSION and the PROBE variable it was given.
 */
async function installFakePi(root) {
  const bin = path.join(root, "..", `${path.basename(root)}-bin`);
  await write(
    path.join(bin, "pi"),
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
// The evaluator asks for the version to key a run for reuse; that is not a subject.
if (args[0] === "--version") {
  process.stdout.write("0.0.0-fake\\n");
  process.exit(0);
}
const extensions = args.flatMap((arg, index) => (arg === "--extension" ? [args[index + 1]] : []));
const versions = [];
for (const extension of extensions.filter((entry) => entry.includes("host-extensions"))) {
  versions.push((await import(pathToFileURL(extension).href)).VERSION);
}
const arm = path.basename(path.dirname(process.cwd()));
appendFileSync(${JSON.stringify(path.join(root, "..", `${path.basename(root)}-pi.jsonl`))}, JSON.stringify({ arm, versions, probe: process.env.PROBE ?? null }) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "agent_start" });
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "fake-model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(path.join(bin, "pi"), 0o755);
  return { bin, log: path.join(root, "..", `${path.basename(root)}-pi.jsonl`) };
}

async function piLog(file) {
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const BUILD_SCRIPT = `import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("dist", { recursive: true });
copyFileSync("src/index.mjs", "dist/index.mjs");
`;

/** A repository whose `ext` extension exports VERSION "one" at the first commit and "two" at the second. */
async function extensionRepository(root) {
  await write(path.join(root, "ext/build.mjs"), BUILD_SCRIPT);
  await write(path.join(root, "ext/src/index.mjs"), 'export const VERSION = "one";\nexport default function () {}\n');
  await write(
    path.join(root, "local-ext/index.mjs"),
    'export const VERSION = "local";\nexport default function () {}\n',
  );
  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "one");
  const one = git(root, "rev-parse", "HEAD");
  await write(path.join(root, "ext/src/index.mjs"), 'export const VERSION = "two";\nexport default function () {}\n');
  git(root, "commit", "-q", "-am", "two");
  return { one, two: git(root, "rev-parse", "HEAD") };
}

function gitExtension(ref, changes = {}) {
  return {
    source: { kind: "git", ref, path: "ext" },
    build: [NODE, "build.mjs"],
    entry: "dist/index.mjs",
    ...changes,
  };
}

function group({ arms, component, configuration = {} }) {
  return {
    schema_version: 2,
    kind: "group",
    id: "built",
    type: "description",
    input: { prompt: "Say done." },
    fixture: null,
    tools: [],
    configuration: {
      host: { name: "pi" },
      subject: { kind: "none" },
      ...configuration,
    },
    arms,
    component,
    expectations: Object.keys(arms).map((arm) => ({
      id: `${arm}-no-skill-read`,
      kind: "skill-read",
      variant: arm,
      expect: "never",
    })),
    review_questions: [],
  };
}

function runCli(root, bin, args) {
  return spawnSync(
    process.execPath,
    [entrypoint, ...args, ...(args[0] === "run" && !args.includes("--jobs") ? ["--jobs", "1"] : [])],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "..", "no-credentials"),
      },
    },
  );
}

test("arms built from two commits load different extension code, each distinct source built once", async () => {
  await withTempDirectory(async (temp) => {
    const root = path.join(temp, "repo");
    await mkdir(root);
    const { one, two } = await extensionRepository(root);
    const { bin, log } = await installFakePi(root);
    const definition = await write(
      path.join(root, "groups/built.json"),
      group({
        arms: {
          baseline: { host: { name: "pi", extensions: [gitExtension(one.slice(0, 12))] } },
          candidate: { host: { name: "pi", extensions: [gitExtension(two)] } },
          again: { host: { name: "pi", extensions: [gitExtension(one.slice(0, 12))] } },
        },
        component: ["host.extensions"],
      }),
    );

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(
      result.stdout,
      new RegExp(`; extensions: ext@${one.slice(0, 12)} \\(built\\), ext@${two} \\(built\\);`),
    );
    const entries = await piLog(log);
    assert.deepEqual(Object.fromEntries(entries.map(({ arm, versions }) => [arm, versions])), {
      baseline: ["one"],
      candidate: ["two"],
      again: ["one"],
    });
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/built");
    assert.deepEqual((await readdir(path.join(groupDirectory, "resources/host-extensions"))).sort(), ["0", "1"]);
    const recorded = async (arm) =>
      (await readJson(path.join(groupDirectory, arm, "run.json"))).resources.hostExtensions;
    const [baseline] = await recorded("baseline");
    const [candidate] = await recorded("candidate");
    const [again] = await recorded("again");
    assert.deepEqual(baseline.source, { kind: "git", ref: one.slice(0, 12), path: "ext", commit: one });
    assert.equal(candidate.source.commit, two);
    assert.equal(baseline.entry, "dist/index.mjs");
    assert.equal(baseline.directory, "resources/host-extensions/0/source");
    assert.equal(baseline.build.exitCode, 0);
    assert.deepEqual(baseline.build.argv, [NODE, "build.mjs"]);
    assert.match(baseline.sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(baseline.sha256, candidate.sha256);
    assert.deepEqual(again, baseline);
  });
});

test("the plan says how many extension builds run on the host, outside the seal", async () => {
  await withTempDirectory(async (temp) => {
    const root = path.join(temp, "repo");
    await mkdir(root);
    const { one, two } = await extensionRepository(root);
    const { bin } = await installFakePi(root);
    // Two distinct builds over three arms; the working-tree extension declares no build, so nothing runs for it.
    const definition = await write(
      path.join(root, "groups/built.json"),
      group({
        arms: {
          baseline: { host: { name: "pi", extensions: [gitExtension(one)] } },
          candidate: { host: { name: "pi", extensions: [gitExtension(two)] } },
          again: { host: { name: "pi", extensions: [gitExtension(one), { path: "local-ext", entry: "index.mjs" }] } },
        },
        component: ["host.extensions"],
      }),
    );

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /^Plan: .+; unsealed: 2 extension builds run on the host; uncommitted inputs$/m);
  });
});

test("a failed build invalidates the group before any subject starts", async () => {
  await withTempDirectory(async (temp) => {
    const root = path.join(temp, "repo");
    await mkdir(root);
    const { one, two } = await extensionRepository(root);
    const { bin, log } = await installFakePi(root);
    const failing = gitExtension(two, { build: [NODE, "-e", "console.error('compile error'); process.exit(3)"] });
    const definition = await write(
      path.join(root, "groups/built.json"),
      group({
        arms: {
          baseline: { host: { name: "pi", extensions: [gitExtension(one)] } },
          candidate: { host: { name: "pi", extensions: [failing] } },
        },
        component: ["host.extensions"],
      }),
    );

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(log), { code: "ENOENT" });
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/built");
    const summary = await readJson(path.join(groupDirectory, "group.json"));
    assert.equal(summary.state, "invalid");
    const candidate = await readJson(path.join(groupDirectory, "candidate/run.json"));
    assert.equal(candidate.state, "invalid");
    assert.match(
      candidate.error.message,
      /building host extension ext at [0-9a-f]{12} failed \(exit 3\): compile error/,
    );
  });
});

test("a path source is snapshotted when committed and refuses the run when it is not", async () => {
  await withTempDirectory(async (temp) => {
    const root = path.join(temp, "repo");
    await mkdir(root);
    await extensionRepository(root);
    const { bin, log } = await installFakePi(root);
    const definition = await write(
      path.join(root, "groups/built.json"),
      group({
        arms: {
          baseline: {},
          candidate: { host: { name: "pi", extensions: [{ path: "local-ext", entry: "index.mjs" }] } },
        },
        component: ["host.extensions"],
      }),
    );
    git(root, "add", "groups");
    git(root, "commit", "-q", "-m", "group");

    const loaded = await loadDefinition(definition, { root });
    assert.ok(loaded.files.includes(path.join(root, "local-ext")));
    const accepted = runCli(root, bin, ["run", definition]);
    assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
    assert.deepEqual(
      (await piLog(log)).map(({ arm, versions }) => [arm, versions]),
      [
        ["baseline", []],
        ["candidate", ["local"]],
      ],
    );
    const groupDirectory = path.join(accepted.stdout.match(/^Path: (.+)$/m)?.[1], "groups/built");
    const [recorded] = (await readJson(path.join(groupDirectory, "candidate/run.json"))).resources.hostExtensions;
    assert.deepEqual(recorded.source, { kind: "path", path: "local-ext" });
    assert.equal(recorded.build, null);
    assert.ok(recorded.path.startsWith(path.join(groupDirectory, "resources/host-extensions/0/source")));

    await write(path.join(root, "local-ext/index.mjs"), 'export const VERSION = "edited";\n');
    const refused = runCli(root, bin, ["run", definition]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /uncommitted inputs: local-ext\/index\.mjs/);
  });
});

test("runtime environment literals may differ between arms only where the component declares them", async () => {
  await withTempDirectory(async (temp) => {
    const root = path.join(temp, "repo");
    await mkdir(root);
    const { bin, log } = await installFakePi(root);
    const runtime = { runtime: { environment: { literal: { PROBE: "a", SHARED: "x" }, inherit: [] } } };
    const differing = {
      arms: { baseline: {}, candidate: { runtime: { environment: { literal: { PROBE: "b" } } } } },
      configuration: runtime,
    };
    const declared = await write(
      path.join(root, "groups/declared.json"),
      group({ ...differing, component: ["runtime.environment.literal.PROBE"] }),
    );
    const loaded = await loadDefinition(declared, { root });
    assert.equal(loaded.variants.baseline.runtimeLiteral, undefined);
    assert.deepEqual(loaded.variants.candidate.runtimeLiteral, { PROBE: "b", SHARED: "x" });
    // The whole literal object may be declared too.
    await loadDefinition(
      await write(
        path.join(root, "groups/whole.json"),
        group({ ...differing, component: ["runtime.environment.literal"] }),
      ),
      { root },
    );

    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/undeclared.json"), group({ ...differing, component: [] })), {
        root,
      }),
      { code: "undeclared-difference", message: /differ in runtime\.environment\.literal\.PROBE/ },
    );
    const session = group({
      arms: { baseline: {}, candidate: { runtime: { session: true } } },
      configuration: runtime,
      component: ["runtime.session"],
    });
    await assert.rejects(loadDefinition(await write(path.join(root, "groups/session.json"), session), { root }), {
      code: "unsupported-difference",
      message: /runtime\.session, which both arms must share/,
    });

    const result = runCli(root, bin, ["run", declared, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(
      (await piLog(log)).map(({ arm, probe }) => [arm, probe]),
      [
        ["baseline", "a"],
        ["candidate", "b"],
      ],
    );
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/built");
    const candidate = await readJson(path.join(groupDirectory, "candidate/run.json"));
    assert.deepEqual(candidate.resources.runtime.environment.literal, { PROBE: "b", SHARED: "x" });
  });
});

test("source extensions are validated when the definition loads", async () => {
  await withTempDirectory(async (root) => {
    const refusals = [
      ["a branch name as ref", gitExtension("main"), /source\.ref must be a commit SHA/],
      [
        "a path outside the root",
        gitExtension("abcdef1", { source: { kind: "git", ref: "abcdef1", path: "../x" } }),
        /source\.path/,
      ],
      ["no entry", { path: "local-ext" }, /entry must be a file path/],
      ["an empty build", gitExtension("abcdef1", { build: [] }), /build must be a non-empty array/],
      ["an unknown field", { path: "local-ext", entry: "index.mjs", version: "1" }, /unsupported field version/],
      ["an absolute path source", { path: "/tmp/ext", entry: "index.mjs" }, /path inside the definition root/],
    ];
    for (const [name, extension, message] of refusals) {
      const definition = await write(
        path.join(root, `groups/${name.replaceAll(" ", "-")}.json`),
        group({
          arms: { baseline: {}, candidate: { host: { name: "pi", extensions: [extension] } } },
          component: ["host.extensions"],
        }),
      );
      await assert.rejects(loadDefinition(definition, { root }), { name: "DefinitionError", message }, name);
    }
  });
});
