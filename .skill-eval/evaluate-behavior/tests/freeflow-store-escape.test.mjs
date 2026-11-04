// The Freeflow arm's store is the one folder beside the workspace the subject may write, and the host runs Git and
// Track Work in it (the mod's turn-end sync). These tests hold the boundary R7 B1 found open: the subject's container
// sees the store's .git read-only, Track Work there leaves the commits to the host, and the guard refuses a write into
// the store's .git. No model runs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { decideToolCall, guardState } from "../../../skills/evaluate-behavior/scripts/guard-rules.mjs";
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
