// The Freeflow arm's store is the one folder beside the workspace the subject may write, and the host runs Git and
// Track Work in it (the mod's turn-end sync). These tests hold the boundary R7 B1 found open: the subject's container
// sees the store's .git read-only, Track Work there leaves the commits to the host, and the guard refuses a write into
// the store's .git. No model runs.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { startContainer } from "../../../skills/evaluate-behavior/scripts/lib/container.mjs";
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
