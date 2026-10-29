import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decideToolCall, guardState } from "../../../skills/evaluate-behavior/scripts/guard-rules.mjs";
import registerSkillEvalContainerRoute from "../../../skills/evaluate-behavior/scripts/pi-container-route.mjs";
import registerSkillEvalGuard from "../../../skills/evaluate-behavior/scripts/pi-guard.mjs";
import { missingContainerPrerequisites } from "../../../skills/evaluate-behavior/scripts/lib/container.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { runEvaluation } from "../../../skills/evaluate-behavior/scripts/lib/runner.mjs";
import { verifyConfinement } from "../../../skills/evaluate-behavior/scripts/lib/shell.mjs";
import { dockerCalls, installFakeDocker } from "./helpers/fake-docker.mjs";
import { installFakePi } from "./helpers/fake-pi.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const IMAGE = `example.org/task@sha256:${"a".repeat(64)}`;
const NODE = process.execPath;

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-container-test-")));
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

function containerGroup(changes = {}, configuration = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "boxed",
    type: "body",
    input: { prompt: "Fix the task with bash." },
    fixture: null,
    tools: ["bash"],
    configuration: {
      host: { name: "pi" },
      subject: { kind: "none" },
      environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" },
      ...configuration,
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: ["baseline", "candidate"].map((arm) => ({
      id: `${arm}-graded`,
      kind: "command",
      variant: arm,
      argv: [NODE, "-e", "require('node:fs').writeFileSync('graded.txt', 'graded in the image')"],
      pass: { exit_code: 0 },
    })),
    review_questions: [],
    ...changes,
  };
}

function cliEnvironment(root, bins) {
  const { DOCKER_HOST: _host, ...inherited } = process.env;
  return {
    ...inherited,
    PATH: [...bins, process.env.PATH ?? ""].join(path.delimiter),
    SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    SKILL_EVAL_PROBE_PUBLIC_URL: "",
  };
}

function runCli(root, bins, args) {
  return spawnSync(
    process.execPath,
    [entrypoint, ...args, ...(args[0] === "run" && !args.includes("--jobs") ? ["--jobs", "1"] : [])],
    {
      cwd: root,
      encoding: "utf8",
      env: cliEnvironment(root, bins),
    },
  );
}

test("a container environment needs a digest-pinned image and loads as the arms' shell", async () => {
  await withTempDirectory(async (root) => {
    const refusals = [
      [
        "a tag instead of a digest",
        { environment: { kind: "container", image: "example.org/task:latest", workdir: "/testbed", network: "none" } },
        /environment.image must be pinned by digest/,
      ],
      [
        "a relative workdir",
        { environment: { kind: "container", image: IMAGE, workdir: "testbed", network: "none" } },
        /environment.workdir must be an absolute path/,
      ],
      [
        "an open network",
        { environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "bridge" } },
        /environment.network must be "none"/,
      ],
      [
        "a container and a shell",
        { host: { name: "pi" }, shell: { isolation: "x", network: "none" } },
        /declares both shell and a container environment/,
      ],
    ];
    for (const [name, configuration, message] of refusals) {
      const file = await write(
        path.join(root, `groups/${name.replaceAll(" ", "-")}.json`),
        containerGroup({}, configuration),
      );
      await assert.rejects(loadDefinition(file, { root }), { name: "DefinitionError", message }, name);
    }
    const description = containerGroup({
      type: "description",
      tools: [],
      expectations: [{ id: "x", kind: "skill-read", variant: "baseline", expect: "never" }],
    });
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/description.json"), description), { root }),
      {
        message: /container environment is supported only in body groups/,
      },
    );

    const loaded = await loadDefinition(await write(path.join(root, "groups/ok.json"), containerGroup()), { root });
    assert.deepEqual(loaded.variants.candidate.shell, {
      isolation: "container",
      network: "none",
      workspace: "/testbed",
      container: { image: IMAGE, workdir: "/testbed", network: "none" },
    });

    // Arms may differ in the image only where the component declares it.
    const other = `example.org/task@sha256:${"b".repeat(64)}`;
    const differing = containerGroup({
      arms: {
        baseline: {},
        candidate: { environment: { kind: "container", image: other, workdir: "/testbed", network: "none" } },
      },
      component: ["environment.image"],
    });
    const loadedDiffering = await loadDefinition(await write(path.join(root, "groups/differing.json"), differing), {
      root,
    });
    assert.equal(loadedDiffering.variants.candidate.shell.container.image, other);
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/undeclared.json"), { ...differing, component: [] }), { root }),
      { code: "undeclared-difference", message: /differ in environment.image/ },
    );
  });
});

const CONTAINER_SHELL = {
  isolation: "container",
  network: "none",
  workspace: "/testbed",
  container: { image: IMAGE, workdir: "/testbed", network: "none" },
};
const ROUTE = Symbol.for("skill-eval.container-route");

/** Runs `body` with the guard's variables set, restoring the environment and the route flag afterwards. */
async function withGuardEnvironment(variables, body) {
  const saved = { ...process.env };
  const routed = globalThis[ROUTE];
  try {
    Object.assign(process.env, variables);
    await body();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    if (routed === undefined) delete globalThis[ROUTE];
    else globalThis[ROUTE] = routed;
  }
}

/** A Pi extension's tool_call handler, registered against a minimal extension API. */
function toolCallHandler(register) {
  const handlers = new Map();
  register({ on: (event, handler) => handlers.set(event, handler) });
  return handlers.get("tool_call");
}

/** What a host shell runs for `command`, with a docker stand-in that prints its arguments as JSON. */
async function dockerArguments(root, command) {
  const bin = path.join(root, "argv-docker");
  await write(
    path.join(bin, "docker"),
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n`,
  );
  spawnSync("chmod", ["+x", path.join(bin, "docker")]);
  const result = spawnSync("sh", ["-c", command], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("the guard leaves a container shell command to the route, loaded last, which runs it in the container", async () => {
  await withTempDirectory(async (root) => {
    const workspace = await realpath(root);
    await withGuardEnvironment(
      {
        SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
        SKILL_EVAL_WRITABLE_ROOT: workspace,
        SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["bash"]),
        SKILL_EVAL_SHELL: JSON.stringify(CONTAINER_SHELL),
      },
      async () => {
        delete globalThis[ROUTE];
        delete process.env.SKILL_EVAL_CONTAINER;
        const guard = toolCallHandler(registerSkillEvalGuard);
        assert.match(
          guard({ toolName: "bash", input: { command: "ls" } }, { cwd: workspace }).reason,
          /container for this evaluation is not running/,
        );

        process.env.SKILL_EVAL_CONTAINER = JSON.stringify({
          name: "skill-eval-subject-1",
          host: "unix:///x.sock",
          workdir: "/testbed",
        });
        // Without the route nothing would move the command into the container, so the guard refuses it.
        assert.match(
          guard({ toolName: "bash", input: { command: "ls" } }, { cwd: workspace }).reason,
          /container route is not loaded/,
        );

        const route = toolCallHandler(registerSkillEvalContainerRoute);
        const original = "echo 'hi' && pwd";
        const input = { command: original };
        // The guard allows the call and leaves the command as the model wrote it for the extensions after it.
        assert.equal(guard({ toolName: "bash", input }, { cwd: workspace }), undefined);
        assert.equal(input.command, original);
        assert.equal(route({ toolName: "bash", input }, { cwd: workspace }), undefined);
        const argv = await dockerArguments(root, input.command);
        assert.deepEqual(argv.slice(0, 8), [
          "--host",
          "unix:///x.sock",
          "exec",
          "-i",
          "--workdir",
          "/testbed",
          "skill-eval-subject-1",
          "sh",
        ]);
        assert.equal(argv[8], "-c");
        assert.equal(argv[10], "sh");
        assert.equal(argv[11], original);
        // The route leaves every other tool alone.
        assert.equal(route({ toolName: "read", input: { path: "a" } }, { cwd: workspace }), undefined);
      },
    );
  });
});

test("Freeflow's background commands and monitors run in the container like bash, and only there", async () => {
  await withTempDirectory(async (root) => {
    const workspace = await realpath(root);
    const variables = (shell) => ({
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
      SKILL_EVAL_WRITABLE_ROOT: workspace,
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["bash", "bash_background", "monitor", "stop_background"]),
      ...(shell === null ? {} : { SKILL_EVAL_SHELL: JSON.stringify(shell) }),
      SKILL_EVAL_CONTAINER: JSON.stringify({ name: "box", workdir: "/testbed" }),
    });
    const decide = (toolName, input) =>
      decideToolCall(guardState(process.env), toolName, input, workspace, process.env);

    await withGuardEnvironment(variables(CONTAINER_SHELL), async () => {
      for (const tool of ["bash_background", "monitor"]) {
        const decision = decide(tool, { command: "npm run dev", description: "dev server" });
        const argv = await dockerArguments(root, decision.command);
        assert.deepEqual(argv.slice(0, 5), ["exec", "-i", "--workdir", "/testbed", "box"], tool);
        assert.equal(argv.at(-1), "npm run dev", tool);
        assert.match(decide(tool, {}).reason, new RegExp(`${tool} needs a command`));
      }
      // Stopping one needs no confinement of its own: it ends the docker client, and the wrapper ends the command.
      assert.equal(decide("stop_background", { id: "bg123456" }), undefined);
      // Each route rewrites them, as it does bash.
      globalThis[ROUTE] = true;
      const route = toolCallHandler(registerSkillEvalContainerRoute);
      const input = { command: "tail -f log | grep --line-buffered ERROR", description: "errors" };
      assert.equal(route({ toolName: "monitor", input }, { cwd: workspace }), undefined);
      assert.match(input.command, /^skill_eval_in=.* docker exec -i --workdir '\/testbed' 'box' sh -c /);
    });

    // A shell isolation extension confines only the bash it wraps; a background command would run on the host.
    await withGuardEnvironment(variables({ isolation: "isolation/vm-shell", network: "none" }), async () => {
      assert.match(decide("bash_background", { command: "sleep 1" }).reason, /runs only in a container environment/);
      assert.match(decide("monitor", { command: "sleep 1", description: "x" }).reason, /only in a container/);
      assert.equal(decide("bash", { command: "ls" }), undefined);
    });
    await withGuardEnvironment(variables(null), async () => {
      assert.match(decide("bash_background", { command: "sleep 1" }).reason, /runs only in a declared shell/);
    });
  });
});

test("apply_patch writes only inside the workspace: every path its patch names must resolve there", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await write(path.join(workspace, "src/a.js"), "export const a = 1;\n");
    await mkdir(path.join(root, "outside"), { recursive: true });
    await symlink(path.join(root, "outside"), path.join(workspace, "escape"));
    const variables = {
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
      SKILL_EVAL_WRITABLE_ROOT: workspace,
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["apply_patch", "write"]),
    };
    await withGuardEnvironment(variables, async () => {
      const decide = (toolName, input) =>
        decideToolCall(guardState(process.env), toolName, input, workspace, process.env);
      const patch = (...lines) => ({ input: ["*** Begin Patch", ...lines, "*** End Patch"].join("\n") });
      assert.equal(
        decide(
          "apply_patch",
          patch(
            "*** Update File: src/a.js",
            "*** Move to: src/b.js",
            "@@",
            "-export const a = 1;",
            "+export const b = 1;",
            "*** Add File: src/new/c.js",
            "+export const c = 1;",
            "*** Delete File: @src/old.js",
          ),
        ),
        undefined,
      );
      const refused = [
        ["an absolute path outside", patch(`*** Add File: ${path.join(root, "outside", "x.js")}`, "+x")],
        ["a climb out of the workspace", patch("*** Add File: ../x.js", "+x")],
        ["the home directory", patch("*** Add File: ~/x.js", "+x")],
        ["a move out of the workspace", patch("*** Update File: src/a.js", "*** Move to: ../a.js", "@@", "-a", "+a")],
        ["an update outside, which reads the file", patch("*** Update File: /etc/hosts", "@@", "-a", "+a")],
        ["a delete outside", patch("*** Delete File: ../../etc/x")],
        ["a link that leads outside", patch("*** Add File: escape/x.js", "+x")],
        ["a header indented in an add section", patch("*** Add File: ok.js", "+x", "   *** Add File: ../x.js", "+x")],
        ["Windows line endings", { input: "*** Begin Patch\r\n*** Add File: ../x.js\r\n+x\r\n*** End Patch" }],
      ];
      for (const [label, input] of refused) {
        assert.match(decide("apply_patch", input)?.reason ?? "allowed", /apply_patch path escapes/, label);
      }
      assert.match(decide("apply_patch", {}).reason, /apply_patch needs a patch/);
      // Pi expands ~ the same way for its own file tools, so a write there is refused too.
      assert.match(decide("write", { path: "~/x.txt" }).reason, /write path escapes/);
      assert.equal(decide("write", { path: "@src/x.txt" }), undefined);
    });
  });
});

test("without a docker command line, the refusal says what to install and to ask first", async () => {
  await withTempDirectory(async (root) => {
    const saved = process.env.PATH;
    process.env.PATH = path.join(root, "empty");
    try {
      const [missing] = await missingContainerPrerequisites({ image: IMAGE }, "macos");
      assert.equal(missing.name, "a docker command line");
      assert.match(missing.install, /brew install colima docker && colima start/);
    } finally {
      process.env.PATH = saved;
    }
  });
});

test("a workspace folder the engine does not share is refused by name, before anything runs on an empty mount", async () => {
  await withTempDirectory(async (root) => {
    const container = { image: IMAGE, workdir: "/testbed", network: "none" };
    const saved = process.env.PATH;
    try {
      const hidden = await installFakeDocker(path.join(root, "hidden"), { hiddenMounts: true });
      process.env.PATH = `${hidden.bin}${path.delimiter}${saved}`;
      const [missing, ...rest] = await missingContainerPrerequisites(container, "macos", path.join(root, "work"));
      assert.deepEqual(rest, []);
      assert.equal(missing.name, "a workspace folder the container engine can see");
      assert.match(missing.found, /did not reach the container: cat: marker: No such file or directory/);
      assert.match(missing.install, /Colima, by default, only your home folder/);
      assert.match(missing.install, /set TMPDIR/);

      const shared = await installFakeDocker(path.join(root, "shared"));
      process.env.PATH = `${shared.bin}${path.delimiter}${saved}`;
      assert.deepEqual(await missingContainerPrerequisites(container, "macos", path.join(root, "work")), []);
      const run = (await dockerCalls(shared.log)).find((args) => args[0] === "run");
      assert.ok(run.includes("--network") && run[run.indexOf("--network") + 1] === "none", "the probe has no network");
      assert.ok(
        run.some((arg) => arg.endsWith(":/testbed:ro")),
        "the probe mounts read-only",
      );
    } finally {
      process.env.PATH = saved;
    }
  });
});

test("a container subject with background tools loads the route last and can read their output folder", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root, { rpcTools: [{ toolName: "bash", input: { command: "echo in-container" } }] });
    const docker = await installFakeDocker(root);
    await write(path.join(root, "extensions/tools.mjs"), "export default () => {};\n");
    const tools = ["read", "bash", "bash_background", "monitor", "stop_background", "apply_patch"];
    const runtime = { extensions: [{ entry: "extensions/tools.mjs", resources: ["extensions"] }] };
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup(
        { tools, arms: { baseline: {} }, component: undefined, expectations: [], review_questions: ["Ran?"] },
        { runtime },
      ),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const run = await readJson(path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed/baseline/run.json"));
    assert.equal(run.state, "complete", JSON.stringify(run.process));
    const extensions = run.process.args.flatMap((arg, index) =>
      arg === "--extension" ? [run.process.args[index + 1]] : [],
    );
    assert.match(extensions[0], /pi-guard\.mjs$/);
    assert.match(extensions.at(-1), /pi-container-route\.mjs$/);
    // The subject's temp folder, where Freeflow saves background output, is readable and mounted read-only.
    const temporary = run.resources.readableRoots.find((entry) => entry.endsWith(path.join("isolation", "tmp")));
    assert.ok(temporary, JSON.stringify(run.resources.readableRoots));
    const created = (await dockerCalls(docker.log)).filter((args) => args[0] === "create").at(-1);
    assert.ok(created.includes(`${temporary}:${temporary}:ro`), JSON.stringify(created));
    assert.equal(run.sealing.bash, "container");
    // The fake Pi ran bash through the guard and the route: the command reached the container.
    const calls = (await readFile(pi.tools, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(calls[0].output.trim(), "in-container");
    assert.equal(calls[0].isError, false);
  });
});

test("background tools are refused before anything runs when an arm has no container environment", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    await write(path.join(root, "extensions/tools.mjs"), "export default () => {};\n");
    const runtime = { extensions: [{ entry: "extensions/tools.mjs", resources: ["extensions"] }] };
    const group = containerGroup(
      {
        tools: ["read", "bash_background"],
        arms: { baseline: {} },
        component: undefined,
        expectations: [],
        review_questions: ["Ran?"],
      },
      { runtime },
    );
    delete group.configuration.environment;
    const definition = await write(path.join(root, "groups/boxed.json"), group);

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /bash_background run only in a container environment/);
    await assert.rejects(readFile(pi.log), { code: "ENOENT" });
  });
});

test("a stopped engine or a missing image refuses the run before anything starts, and nothing is pulled", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const definition = await write(path.join(root, "groups/boxed.json"), containerGroup());

    const down = await installFakeDocker(path.join(root, "down"), { daemonDown: true });
    const stopped = runCli(root, [pi.bin, down.bin], ["run", definition, "--uncommitted"]);
    assert.notEqual(stopped.status, 0);
    // The preflight runs after the plan and before any subject, so no result is written.
    assert.match(stopped.stdout, /^Plan: /m);
    assert.doesNotMatch(stopped.stdout, /^Path: /m);
    assert.match(stopped.stderr, /^Preflight: nothing started\.$/m);
    assert.match(
      stopped.stderr,
      /arm baseline runs in the container image example\.org\/task@sha256:a+, and this machine is missing:/,
    );
    assert.match(
      stopped.stderr,
      /- a running container engine: needs a docker daemon that answers `docker version` \(found Cannot connect/,
    );
    assert.match(stopped.stderr, /Ask the user before installing anything, then run again\.$/m);
    assert.deepEqual(
      (await dockerCalls(down.log)).map((args) => args[0]),
      ["version"],
    );

    const absent = await installFakeDocker(path.join(root, "absent"), { imageMissing: true });
    const refused = runCli(root, [pi.bin, absent.bin], ["run", definition, "--uncommitted"]);
    assert.notEqual(refused.status, 0);
    assert.doesNotMatch(refused.stdout, /^Path: /m);
    assert.match(
      refused.stderr,
      new RegExp(`- the image ${IMAGE.replace(".", "\\.")}: needs the image present locally`),
    );
    assert.match(refused.stderr, new RegExp(`Install: docker pull ${IMAGE.replace(".", "\\.")}`));
    assert.match(refused.stderr, /Download: about 4 MB compressed, from docker manifest inspect\./);
    const calls = await dockerCalls(absent.log);
    assert.deepEqual(
      calls.map((args) => args[0]),
      ["version", "image", "manifest"],
    );
    assert.ok(calls.every((args) => !args.includes("pull")));
    await assert.rejects(readFile(pi.log), { code: "ENOENT" });
  });
});

test("called without the CLI's preflight, the runner still makes a group invalid when its engine is stopped", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const definition = await write(path.join(root, "groups/boxed.json"), containerGroup());
    const down = await installFakeDocker(path.join(root, "down"), { daemonDown: true });
    const saved = { ...process.env };
    Object.assign(process.env, cliEnvironment(root, [pi.bin, down.bin]));
    try {
      const result = await runEvaluation(definition, {}, { root, dryRun: true });
      const run = await readJson(path.join(result.path, "groups/boxed/baseline/run.json"));
      assert.equal(run.state, "invalid");
      assert.match(
        run.error.message,
        /- a running container engine: needs a docker daemon that answers `docker version` \(found Cannot connect/,
      );
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
    await assert.rejects(readFile(pi.log), { code: "ENOENT" });
  });
});

test("probes, subjects and graders run in containers with the declared limits, in order, and are removed", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const definition = await write(path.join(root, "groups/boxed.json"), containerGroup());

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted", "--jobs", "1"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const calls = await dockerCalls(docker.log);
    const verbs = calls.map((args) => (args[0] === "--host" ? `host ${args[2]}` : args[0]));
    // After the image, one `run` checks that the engine shares the folder the workspaces live under.
    // Each container starts, then `exec` links the declared workdir to the workspace's mount.
    const probe = [
      "version",
      "image",
      "run",
      "context",
      "create",
      "start",
      "exec",
      ...Array(6).fill("host exec"),
      "rm",
    ];
    const subject = ["context", "create", "start", "exec", "rm"];
    // The run's preflight checks the engine and the image once before anything starts.
    const preflight = ["version", "image"];
    assert.deepEqual(verbs, [...preflight, ...probe, ...probe, ...subject, "run", "rm", ...subject, "run", "rm"]);

    for (const created of calls.filter((args) => args[0] === "create")) {
      const option = (name) => created[created.indexOf(name) + 1];
      assert.equal(option("--network"), "none");
      assert.equal(option("--memory"), "4g");
      assert.equal(option("--cpus"), "2");
      // The workspace is mounted at its own host path, where the shell starts; /testbed becomes a link to it.
      const workspace = option("--workdir");
      assert.match(workspace, /\/(confinement\/(baseline|candidate)|(baseline|candidate))\/workspace$/);
      assert.equal(option("--volume"), `${workspace}:${workspace}`);
      assert.ok(created.includes(IMAGE));
      const name = option("--name");
      const linked = calls.find((args) => args[0] === "exec" && args.includes(name));
      assert.deepEqual(linked.slice(0, 4), ["exec", "--user", "0", name]);
      assert.deepEqual(linked.slice(-2), ["/testbed", workspace]);
    }
    const removed = calls.filter((args) => args[0] === "rm").map((args) => args.at(-1));
    const names = calls.filter((args) => args[0] === "create").map((args) => args[args.indexOf("--name") + 1]);
    for (const name of names) assert.ok(removed.includes(name), `${name} was removed`);

    for (const arm of ["baseline", "candidate"]) {
      const run = await readJson(path.join(groupDirectory, arm, "run.json"));
      assert.equal(run.state, "complete");
      assert.equal(run.confinement.verified, true);
      assert.equal(run.confinement.isolation, "container");
      const record = run.postRun.commands[`${arm}-graded`];
      assert.equal(record.exitCode, 0);
      assert.equal(record.container.image, IMAGE);
      const graded = calls.find((args) => args[0] === "run" && args.includes(record.container.name));
      assert.ok(graded.includes("--rm"));
      assert.equal(graded[graded.indexOf("--network") + 1], "none");
      assert.match(
        graded[graded.indexOf("--volume") + 1],
        new RegExp(`/${arm}/commands/${arm}-graded/workspace:/testbed$`),
      );
      assert.equal(
        await readFile(path.join(groupDirectory, arm, record.directory, "graded.txt"), "utf8"),
        "graded in the image",
      );
    }
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.deepEqual(
      grade.checks.map(({ id, state }) => [id, state]),
      [
        ["baseline-graded", "pass"],
        ["candidate-graded", "pass"],
      ],
    );
  });
});

test("a container group without bash still runs its declared commands in a subject container", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup({ tools: ["read", "run_command"], commands: [{ id: "unit-tests", argv: ["npm", "test"] }] }),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted", "--jobs", "1"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const calls = await dockerCalls(docker.log);
    const verbs = calls.map((args) => (args[0] === "--host" ? `host ${args[2]}` : args[0]));
    // No shell to probe; each arm gets a subject container, then its grader runs in a fresh one.
    const preflight = ["version", "image"];
    const prerequisites = ["version", "image", "run"];
    const subject = ["context", "create", "start", "exec", "rm"];
    assert.deepEqual(verbs, [
      ...preflight,
      ...prerequisites,
      ...prerequisites,
      ...subject,
      "run",
      "rm",
      ...subject,
      "run",
      "rm",
    ]);
  });
});

test("a container subject's bash runs a declared skill's script at the path it was given, mounted read-only", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root, { rpcBash: "sh {skill}/scripts/hello.sh > from-skill.txt" });
    const docker = await installFakeDocker(root);
    await write(
      path.join(root, "skills/helper/SKILL.md"),
      "---\nname: helper\ndescription: Use when greeting.\n---\n\n# Helper\n\nRun scripts/hello.sh.\n",
    );
    // The fake engine, like an image, has no host node; a script the skill ships runs by its path.
    await write(path.join(root, "skills/helper/scripts/hello.sh"), "echo hello from the skill\n");
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup(
        {
          arms: { only: {} },
          reference: "only",
          component: undefined,
          expectations: [
            {
              id: "ran-script",
              kind: "file-text",
              variant: "only",
              path: "from-skill.txt",
              expect: "contains",
              value: "hello from the skill",
            },
          ],
        },
        {
          subject: {
            kind: "skill",
            source: { kind: "working-tree" },
            skills: ["skills/helper"],
            target: null,
            context: [],
          },
        },
      ),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const run = await readJson(path.join(groupDirectory, "only/run.json"));
    assert.equal(run.state, "complete");
    const skill = run.resources.skills[0].path;
    const created = (await dockerCalls(docker.log)).filter((args) => args[0] === "create").at(-1);
    const volumes = created.flatMap((arg, index) => (created[index - 1] === "--volume" ? [arg] : []));
    assert.deepEqual(volumes, [`${run.workspace}:${run.workspace}`, `${skill}:${skill}:ro`]);
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.equal(grade.checks[0].state, "pass", JSON.stringify(grade.checks[0]));
  });
});

test("a container subject's bash starts where Pi says it works, and bash and the file tools see the same files", async () => {
  await withTempDirectory(async (root) => {
    // As a model would: write with the file tool at the path Pi reported, read it from bash at that path and at the
    // declared workdir, write from bash, then read that back with the file tool.
    const pi = await installFakePi(root, {
      rpcTools: [
        { toolName: "write", input: { path: "{cwd}/from-write.txt", content: "written by write" } },
        {
          toolName: "bash",
          input: {
            command:
              "pwd && cat {cwd}/from-write.txt && echo && cat /testbed/from-write.txt && echo && " +
              "printf 'written by bash' > {cwd}/from-bash.txt",
          },
        },
        { toolName: "read", input: { path: "{cwd}/from-bash.txt" } },
      ],
    });
    const docker = await installFakeDocker(root);
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup({
        tools: ["read", "write", "bash"],
        arms: { only: {} },
        reference: "only",
        component: undefined,
        expectations: [
          {
            id: "bash-wrote",
            kind: "file-text",
            variant: "only",
            path: "from-bash.txt",
            expect: "contains",
            value: "written by bash",
          },
        ],
      }),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const run = await readJson(path.join(groupDirectory, "only/run.json"));
    assert.equal(run.state, "complete");
    const [written, bash, read] = (await readFile(pi.tools, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    // The working directory Pi reports is the workspace, and bash starts there too.
    assert.equal(written.cwd, run.workspace);
    assert.equal(written.isError, false, written.output);
    assert.equal(bash.isError, false, bash.output);
    assert.deepEqual(bash.output.trimEnd().split("\n"), [written.cwd, "written by write", "written by write"]);
    assert.equal(read.isError, false, read.output);
    assert.equal(read.output, "written by bash");
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.equal(grade.checks[0].state, "pass", JSON.stringify(grade.checks[0]));
    assert.ok((await dockerCalls(docker.log)).some((args) => args[0] === "exec" && args[1] === "--user"));
  });
});

test("network none is sealed on every path, refused where commands or graders would run on the host", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const sealed = await write(path.join(root, "groups/sealed.json"), containerGroup({}, { network: "none" }));
    await loadDefinition(sealed, { root });
    // The same task without a container would run its graders on the host: refused, naming the path.
    const { environment: _environment, ...hostConfiguration } = containerGroup({}, { network: "none" }).configuration;
    const unsealed = await write(
      path.join(root, "groups/unsealed.json"),
      containerGroup({ tools: ["read"], configuration: hostConfiguration }),
    );
    await assert.rejects(loadDefinition(unsealed, { root }), {
      name: "DefinitionError",
      message: /arm baseline declares network "none", but its command graders would run on the host/,
    });
    const commands = await write(
      path.join(root, "groups/commands.json"),
      containerGroup({
        tools: ["read", "run_command"],
        commands: [{ id: "unit-tests", argv: ["npm", "test"] }],
        expectations: [{ id: "noted", kind: "response-text", variant: "baseline", expect: "contains", value: "done" }],
        configuration: hostConfiguration,
      }),
    );
    await assert.rejects(loadDefinition(commands, { root }), {
      message: /its declared commands would run on the host/,
    });
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/odd.json"), containerGroup({}, { network: "open" })), {
        root,
      }),
      { message: /network must be "none" \(sealed\) or "host"/ },
    );

    // Each run records what held: every path in the container, so no network and the login out of reach.
    const result = runCli(root, [pi.bin, docker.bin], ["run", sealed, "--uncommitted"]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.deepEqual(run.sealing, {
      network: "none",
      declared: "none",
      bash: "container",
      commands: null,
      graders: "container",
      login: "out of reach",
    });
  });
});

test("cancelling a running subject removes its container", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const hang = path.join(root, "hang.log");
    const group = containerGroup(
      {
        expectations: [
          {
            id: "baseline-graded",
            kind: "command",
            variant: "baseline",
            argv: [NODE, "-e", "0"],
            pass: { exit_code: 0 },
          },
        ],
      },
      { runtime: { environment: { literal: { FAKE_PI_HANG: hang }, inherit: [] } } },
    );
    const definition = await write(path.join(root, "groups/boxed.json"), group);

    const child = spawn(process.execPath, [entrypoint, "run", definition, "--jobs", "1", "--uncommitted"], {
      cwd: root,
      env: cliEnvironment(root, [pi.bin, docker.bin]),
      stdio: "ignore",
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await readFile(hang, "utf8").catch(() => "")).includes("prompted")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    child.kill("SIGINT");
    await exited;

    const calls = await dockerCalls(docker.log);
    const subjectCreate = calls.findLast((args) => args[0] === "create");
    const name = subjectCreate[subjectCreate.indexOf("--name") + 1];
    assert.match(name, /^skill-eval-subject-/);
    const startIndex = calls.findIndex((args) => args[0] === "start" && args[1] === name);
    const removeIndex = calls.findIndex((args) => args[0] === "rm" && args.at(-1) === name);
    assert.ok(startIndex >= 0 && removeIndex > startIndex, JSON.stringify(calls));
  });
});

function localDockerImage() {
  if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status !== 0) {
    return { skip: "docker is not installed or its daemon is not running" };
  }
  for (const name of ["busybox", "alpine"]) {
    const inspected = spawnSync("docker", ["image", "inspect", "--format", "{{json .RepoDigests}}", name], {
      encoding: "utf8",
    });
    if (inspected.status !== 0) continue;
    const digest = JSON.parse(inspected.stdout.trim() || "[]")[0];
    if (typeof digest === "string") return { image: digest };
  }
  return { skip: "no busybox or alpine image is present locally, and the tests never pull one" };
}

const local = localDockerImage();

test(
  "a real container passes every confinement probe",
  { skip: local.skip ?? (spawnSync("pi", ["--version"]).status === 0 ? false : "pi is not installed") },
  async () => {
    await withTempDirectory(async (root) => {
      const saved = { ...process.env };
      process.env.SKILL_EVAL_PROBE_PUBLIC_URL = "";
      process.env.SKILL_EVAL_CREDENTIALS_DIR = path.join(root, "no-credentials");
      try {
        const container = { image: local.image, workdir: "/testbed", network: "none" };
        const record = await verifyConfinement({
          arm: "real",
          shell: { isolation: "container", network: "none", workspace: "/testbed", container },
          extensions: [],
          directory: path.join(root, "confinement/real"),
          groupDirectory: root,
        });
        assert.equal(record.verified, true, JSON.stringify(record, null, 2));
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    });
  },
);
