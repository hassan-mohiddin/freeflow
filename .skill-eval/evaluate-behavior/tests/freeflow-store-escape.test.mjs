// The Freeflow arm's store is the one folder beside the workspace the subject may write, and the host runs Git and
// Track Work in it (the mod's turn-end sync). These tests hold the boundary R7 B1 found open: the subject's container
// sees the store's .git read-only, Track Work there leaves the commits to the host, and the guard refuses a write into
// the store's .git. No model runs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decideToolCall, guardState } from "../../../skills/evaluate-behavior/scripts/guard-rules.mjs";
import { prepareFreeflowStore } from "../../../skills/evaluate-behavior/scripts/lib/hosts/claude-code/launch.mjs";
import { startContainer } from "../../../skills/evaluate-behavior/scripts/lib/container.mjs";
import { freeflowEvents } from "../../../skills/evaluate-behavior/scripts/lib/subject.mjs";
import { dockerCalls, installFakeDocker } from "./helpers/fake-docker.mjs";

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-store-escape-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Runs `run` with the fake docker first on PATH, as the evaluator's own docker calls find it. */
async function withPath(bin, run) {
  const saved = process.env.PATH;
  process.env.PATH = [bin, saved ?? ""].join(path.delimiter);
  try {
    return await run();
  } finally {
    process.env.PATH = saved;
  }
}

test("a writable folder's .git is mounted read-only over the folder's read-write mount; a folder with no .git gets none", async () => {
  await withTempDirectory(async (root) => {
    const docker = await installFakeDocker(root);
    const workspace = path.join(root, "workspace");
    const store = path.join(root, "freeflow-home");
    const plain = path.join(root, "notes");
    await mkdir(workspace);
    await mkdir(path.join(store, ".git"), { recursive: true });
    await mkdir(plain);
    const handle = await withPath(docker.bin, () =>
      startContainer({
        container: { image: "example/image:1", workdir: "/testbed", network: "none" },
        workspace,
        writable: [store, plain],
      }),
    );
    await withPath(docker.bin, () => handle.remove());
    const created = (await dockerCalls(docker.log)).find((args) => args[0] === "create");
    const volumes = created.flatMap((arg, index) => (created[index - 1] === "--volume" ? [arg] : []));
    assert.deepEqual(volumes, [
      `${workspace}:${workspace}`,
      `${store}:${store}`,
      `${store}/.git:${store}/.git:ro`,
      `${plain}:${plain}`,
    ]);
  });
});

test("the run's event log is never read through a link the subject planted in events/: each is named as refused", async () => {
  await withTempDirectory(async (root) => {
    const home = path.join(root, "freeflow-home");
    const events = path.join(home, "events");
    await mkdir(events, { recursive: true });
    const line = { v: 1, ts: "2026-11-04T10:00:00.000Z", seq: 1, session: "s1", harness: "claude-code", agent: "main" };
    await writeFile(path.join(events, "s1.jsonl"), `${JSON.stringify({ ...line, kind: "turn.start", turn: 1 })}\n`);
    // A host file that parses as event lines, so a read through the link would count it.
    const outside = path.join(root, "host-secret.jsonl");
    await writeFile(outside, `${JSON.stringify({ ...line, session: "x", kind: "turn.start", turn: 9 })}\n`);
    await symlink(outside, path.join(events, "x.jsonl"));
    execFileSync("mkfifo", [path.join(events, "y.jsonl")]);
    const read = freeflowEvents(home, root);
    assert.deepEqual(read.logs, ["freeflow-home/events/s1.jsonl"]);
    assert.equal(read.lines, 1);
    assert.deepEqual(read.refused, ["events/x.jsonl", "events/y.jsonl"]);
    // events/ itself a link: nothing read.
    await rm(events, { recursive: true });
    const elsewhere = path.join(root, "elsewhere");
    await mkdir(elsewhere);
    await writeFile(path.join(elsewhere, "z.jsonl"), await readFile(outside, "utf8"));
    await symlink(elsewhere, events);
    const linked = freeflowEvents(home, root);
    assert.deepEqual([linked.lines, linked.logs, linked.refused], [0, [], ["events"]]);
  });
});

test("the guard lets the file tools write the store but not its .git, read both, and follows a link before it decides", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    const store = path.join(root, "freeflow-home");
    await mkdir(workspace);
    await mkdir(path.join(store, ".git", "hooks"), { recursive: true });
    await writeFile(path.join(store, ".git", "config"), "[core]\n");
    // A link the subject's bash could make in the store's files, pointing into its .git.
    await symlink(path.join(store, ".git"), path.join(store, "dot-git"));
    const environment = {
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
      SKILL_EVAL_WRITABLE_ROOT: workspace,
      SKILL_EVAL_WRITABLE_ROOTS: JSON.stringify([store]),
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["read", "write", "edit"]),
    };
    const decide = (tool, file) =>
      decideToolCall(guardState(environment), tool, { path: file }, workspace, environment);
    for (const [tool, file] of [
      ["write", path.join(store, ".git", "config")],
      ["edit", path.join(store, ".git", "config")],
      ["write", path.join(store, ".git", "hooks", "post-commit")],
      ["write", path.join(store, ".git", "commondir")],
      ["write", path.join(store, ".git")],
      ["write", path.join(store, "dot-git", "config")],
    ]) {
      const decision = decide(tool, file);
      assert.equal(decision?.block, true, `${tool} ${file}`);
      assert.match(decision.reason, /in a \.git only the host writes/);
    }
    assert.equal(decide("write", path.join(store, "rules", "style.md")), undefined);
    assert.equal(decide("read", path.join(store, ".git", "config")), undefined);
    // The workspace's own .git stays the subject's: its tasks commit there.
    await mkdir(path.join(workspace, ".git"));
    assert.equal(decide("write", path.join(workspace, ".git", "config")), undefined);
  });
});

// With a real engine: the store mounted as the Freeflow arm mounts it, the subject's attempts made from inside the
// container, then what the mod runs on the host at a turn's end. Skipped without docker or a local image with Git and
// Node (the suite's freeflow-top-line image has both); the tests never pull one.
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const trackWork = path.join(repositoryRoot, "skills", "track-work", "scripts", "working-record.mjs");

function imageWithGitAndNode() {
  if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status !== 0)
    return { skip: "docker is not installed or its daemon is not running" };
  for (const name of [process.env.SKILL_EVAL_ESCAPE_IMAGE, "freeflow-top-line:v1"].filter(Boolean)) {
    if (spawnSync("docker", ["image", "inspect", name], { encoding: "utf8" }).status !== 0) continue;
    const probe = spawnSync(
      "docker",
      ["run", "--rm", "--network", "none", "--entrypoint", "sh", name, "-c", "git --version && node --version"],
      { encoding: "utf8" },
    );
    if (probe.status === 0) return { image: name };
  }
  return { skip: "no local image with Git and Node (freeflow-top-line:v1, or SKILL_EVAL_ESCAPE_IMAGE)" };
}

const engine = imageWithGitAndNode();

test(
  "with the real mount, the subject cannot make the host run its code through the store: core.fsmonitor, commondir, a post-commit hook, a planted repository and a planted link all fail, and the host still commits what Track Work wrote in the container",
  { skip: engine.skip ?? false, timeout: 180_000 },
  async () => {
    await withTempDirectory(async (root) => {
      const workspace = path.join(root, "workspace");
      const marks = path.join(root, "marks");
      await mkdir(workspace);
      await mkdir(marks);
      const outside = path.join(marks, "outside.txt");
      await writeFile(outside, "the host's own file\n");
      const store = await prepareFreeflowStore(repositoryRoot, path.join(root, "freeflow-home"));
      const session = "11111111-2222-4333-8444-555555555555";
      const handle = await startContainer({
        container: { image: engine.image, workdir: "/testbed", network: "none" },
        workspace,
        resources: [repositoryRoot],
        writable: [store],
        environment: { FREEFLOW_HOME: store, FREEFLOW_HOST_COMMITS: "1", CLAUDE_CODE_SESSION_ID: session },
      });
      const inContainer = (script) =>
        spawnSync("docker", ["exec", handle.name, "sh", "-c", script], { encoding: "utf8" });
      try {
        // Each attempt on the store's .git fails in the container: it is mounted read-only.
        for (const attempt of [
          `git -C "$FREEFLOW_HOME" config core.fsmonitor "touch ${marks}/fsmonitor-ran; false #"`,
          `printf '/tmp/planted\\n' > "$FREEFLOW_HOME/.git/commondir"`,
          `printf '#!/bin/sh\\ntouch ${marks}/post-commit-ran\\n' > "$FREEFLOW_HOME/.git/hooks/post-commit" && chmod +x "$FREEFLOW_HOME/.git/hooks/post-commit"`,
          `rm -rf "$FREEFLOW_HOME/.git"`,
          `mv "$FREEFLOW_HOME/.git" "$FREEFLOW_HOME/old-git"`,
        ]) {
          const tried = inContainer(attempt);
          assert.notEqual(tried.status, 0, `${attempt} succeeded: ${tried.stdout}${tried.stderr}`);
        }
        // What the subject can plant in the store's files: a repository of its own with a core.fsmonitor, and its
        // session's event log as a link to a host file.
        const planted = inContainer(
          [
            `mkdir -p "$FREEFLOW_HOME/rules/planted" "$FREEFLOW_HOME/events"`,
            `cd "$FREEFLOW_HOME/rules/planted" && git init -q && echo x > f && git add f`,
            `git -c user.name=s -c user.email=s@x commit -qm planted`,
            `git config core.fsmonitor "touch ${marks}/nested-fsmonitor-ran; false #"`,
            `ln -s ${outside} "$FREEFLOW_HOME/events/${session}.jsonl"`,
          ].join(" && "),
        );
        assert.equal(planted.status, 0, planted.stderr);
        // Track Work in the container writes the store's files and leaves the commit to the host.
        const created = inContainer(
          `node ${trackWork} task create --title "Probe task" --cue "read when probing" --goal "probe the store" --no-project`,
        );
        assert.equal(created.status, 0, created.stderr);
        assert.match(
          created.stdout,
          /Store: not committed here; the host commits it \(FREEFLOW_HOST_COMMITS is set\)\./,
        );

        // What the mod runs on the host at a turn's end: session status, store sync, and the turn's event lines.
        const host = (args, input) =>
          spawnSync(process.execPath, [trackWork, ...args], {
            encoding: "utf8",
            input,
            env: { ...process.env, FREEFLOW_HOME: store, CLAUDE_CODE_SESSION_ID: session, FREEFLOW_HOST_COMMITS: "" },
          });
        assert.equal(JSON.parse(host(["session", "status"]).stdout).changed, true);
        const synced = host(["store", "sync"]);
        assert.equal(synced.status, 0, synced.stderr);
        assert.match(synced.stdout, /committed \d+ path\(s\)/);
        // A second turn: the planted repository changed beside a file of the store's own, so the host's sync runs
        // `git add` next to it again.
        assert.equal(
          inContainer(`echo y > "$FREEFLOW_HOME/rules/planted/f" && echo z > "$FREEFLOW_HOME/rules/z.md"`).status,
          0,
        );
        host(["session", "status"]);
        assert.match(host(["store", "sync"]).stdout, /committed \d+ path\(s\)/);
        assert.doesNotMatch(
          spawnSync("git", ["-C", store, "ls-files", "--stage"], { encoding: "utf8" }).stdout,
          /^160000 /m,
          "the planted repository was recorded",
        );
        const line = {
          v: 1,
          ts: "2026-11-04T10:00:00.000Z",
          session,
          harness: "claude-code",
          agent: "main",
          kind: "turn.start",
          turn: 1,
        };
        const appended = host(["events", "append", "--input", "-"], `${JSON.stringify(line)}\n`);
        assert.notEqual(appended.status, 0);
        assert.match(appended.stderr, /it is a symbolic link/);

        assert.deepEqual(await readdir(marks), ["outside.txt"], "a planted command ran on the host");
        assert.equal(await readFile(outside, "utf8"), "the host's own file\n");
        assert.doesNotMatch(await readFile(path.join(store, ".git", "config"), "utf8"), /fsmonitor/);
        const committed = spawnSync("git", ["-C", store, "log", "--name-only", "--format=%s"], { encoding: "utf8" });
        assert.match(committed.stdout, /tasks\/task-001-probe-task\/record\.md/);
        assert.equal(freeflowEvents(store, root).refused?.includes(`events/${session}.jsonl`), true);
      } finally {
        // The container wrote as its own user: hand the files back so the folder can be removed.
        inContainer(`chmod -R a+rwX "$FREEFLOW_HOME" 2>/dev/null; true`);
        await handle.remove();
      }
    });
  },
);

test(
  "the control: with the store's .git writable, as before the fix, the same plants from a container do run on the host",
  { skip: engine.skip ?? false, timeout: 180_000 },
  async () => {
    await withTempDirectory(async (root) => {
      const marks = path.join(root, "marks");
      await mkdir(marks);
      const store = await prepareFreeflowStore(repositoryRoot, path.join(root, "freeflow-home"));
      const script = [
        `git -C ${store} config core.fsmonitor "touch ${marks}/fsmonitor-ran; false #"`,
        `printf '#!/bin/sh\\ntouch ${marks}/post-commit-ran\\n' > ${store}/.git/hooks/post-commit`,
        `chmod +x ${store}/.git/hooks/post-commit`,
        `echo x > ${store}/rules/x.md`,
      ].join(" && ");
      const planted = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "--volume",
          `${store}:${store}`,
          "--entrypoint",
          "sh",
          engine.image,
          "-c",
          `${script}; chmod -R a+rwX ${store}`,
        ],
        { encoding: "utf8" },
      );
      assert.equal(planted.status, 0, planted.stderr);
      const host = (args) =>
        spawnSync(process.execPath, [trackWork, ...args], {
          encoding: "utf8",
          env: { ...process.env, FREEFLOW_HOME: store },
        });
      host(["session", "status"]);
      host(["store", "sync"]);
      assert.deepEqual((await readdir(marks)).sort(), ["fsmonitor-ran", "post-commit-ran"]);
    });
  },
);
