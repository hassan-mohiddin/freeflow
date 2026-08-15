import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { FREEFLOW_PACKAGE_NAME, refreshSnapshot } from "./freeflow-snapshot.mjs";

const execFile = promisify(execFileCallback);

async function runGit(cwd, args) {
  return (await execFile("git", args, { cwd })).stdout.trim();
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "freeflow-snapshot-test-"));
  await runGit(root, ["init", "-q"]);
  await runGit(root, ["config", "user.email", "freeflow-tests@example.invalid"]);
  await runGit(root, ["config", "user.name", "Freeflow Tests"]);
  await mkdir(join(root, "pi-extension", "freeflow"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: FREEFLOW_PACKAGE_NAME,
        version: "0.5.0",
        files: ["README.md", "pi-extension/**"],
        pi: { extensions: ["pi-extension/freeflow/index.js"] },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "README.md"), "fixture\n");
  await writeFile(join(root, "pi-extension", "freeflow", "index.js"), "export const version = 'first';\n");
  await writeFile(join(root, ".gitignore"), "ignored.js\n");
  await runGit(root, ["add", "."]);
  await runGit(root, ["commit", "-qm", "first snapshot"]);
  const firstCommit = await runGit(root, ["rev-parse", "HEAD"]);

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: FREEFLOW_PACKAGE_NAME,
        version: "0.6.0",
        files: ["README.md", "pi-extension/**"],
        pi: { extensions: ["pi-extension/freeflow/index.js"] },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "pi-extension", "freeflow", "index.js"), "export const version = 'second';\n");
  await runGit(root, ["add", "."]);
  await runGit(root, ["commit", "-qm", "second snapshot"]);
  const secondCommit = await runGit(root, ["rev-parse", "HEAD"]);

  return { firstCommit, root, secondCommit };
}

async function readSnapshot(target, metadata) {
  return {
    index: await readFile(join(target, "pi-extension", "freeflow", "index.js"), "utf8"),
    metadata: JSON.parse(await readFile(metadata, "utf8")),
    package: JSON.parse(await readFile(join(target, "package.json"), "utf8")),
  };
}

test("refreshes committed content only and records exact provenance", async () => {
  const fixture = await createFixture();
  const target = join(fixture.root, "cache", "pi-package");
  const metadata = `${target}.snapshot.json`;
  try {
    await writeFile(join(fixture.root, "pi-extension", "freeflow", "index.js"), "dirty\n");
    await writeFile(join(fixture.root, "pi-extension", "freeflow", "untracked.js"), "untracked\n");
    await writeFile(join(fixture.root, "ignored.js"), "ignored\n");

    const result = await refreshSnapshot({
      commit: fixture.firstCommit,
      metadataPath: metadata,
      sourceRoot: fixture.root,
      targetDir: target,
    });
    const snapshot = await readSnapshot(target, metadata);

    assert.equal(result.operation, "first-installation");
    assert.equal(result.sourceCommit, fixture.firstCommit);
    assert.equal(snapshot.index, "export const version = 'first';\n");
    assert.equal(snapshot.package.version, "0.5.0");
    assert.equal(snapshot.metadata.sourceCommit, fixture.firstCommit);
    assert.equal(snapshot.metadata.sourceTree.length, 40);
    assert.equal(snapshot.metadata.packageName, FREEFLOW_PACKAGE_NAME);
    assert.equal(snapshot.metadata.packageVersion, "0.5.0");
    assert.match(snapshot.metadata.npmPackIntegrity, /^sha512-/);
    assert.match(snapshot.metadata.tarballSha256, /^[0-9a-f]{64}$/);
    assert.equal(snapshot.metadata.sourceWorktreeDirty, true);
    assert.equal(snapshot.metadata.committedContentOnly, true);
    assert.equal(snapshot.metadata.ignoredFilesExcluded, true);
    assert.equal(await exists(join(target, "pi-extension", "freeflow", "untracked.js")), false);
    assert.equal(await exists(join(target, "ignored.js")), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("defaults to HEAD and atomically replaces the prior snapshot", async () => {
  const fixture = await createFixture();
  const target = join(fixture.root, "cache", "pi-package");
  const metadata = `${target}.snapshot.json`;
  try {
    const firstResult = await refreshSnapshot({
      metadataPath: metadata,
      sourceRoot: fixture.root,
      targetDir: target,
    });
    const first = await readSnapshot(target, metadata);
    assert.equal(firstResult.operation, "first-installation");
    assert.equal(first.package.version, "0.6.0");
    assert.equal(first.index, "export const version = 'second';\n");

    const result = await refreshSnapshot({
      commit: fixture.firstCommit,
      metadataPath: metadata,
      sourceRoot: fixture.root,
      targetDir: target,
    });
    const second = await readSnapshot(target, metadata);
    assert.equal(result.operation, "replacement");
    assert.equal(result.packageVersion, "0.5.0");
    assert.equal(second.package.version, "0.5.0");
    assert.equal(second.metadata.sourceCommit, fixture.firstCommit);
    assert.equal(await exists(`${target}.previous`), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("validation and publication failures preserve the active snapshot", async () => {
  const fixture = await createFixture();
  const target = join(fixture.root, "cache", "pi-package");
  const metadata = `${target}.snapshot.json`;
  try {
    await refreshSnapshot({
      commit: fixture.secondCommit,
      metadataPath: metadata,
      sourceRoot: fixture.root,
      targetDir: target,
    });
    const before = await readSnapshot(target, metadata);

    await assert.rejects(
      refreshSnapshot({
        commit: fixture.firstCommit,
        failAt: "provenance",
        metadataPath: metadata,
        sourceRoot: fixture.root,
        targetDir: target,
      }),
      /Injected snapshot failure at provenance/,
    );
    assert.deepEqual(await readSnapshot(target, metadata), before);

    await assert.rejects(
      refreshSnapshot({
        commit: fixture.firstCommit,
        failAt: "validation",
        metadataPath: metadata,
        sourceRoot: fixture.root,
        targetDir: target,
      }),
      /Injected snapshot failure at validation/,
    );
    assert.deepEqual(await readSnapshot(target, metadata), before);

    await assert.rejects(
      refreshSnapshot({
        commit: fixture.firstCommit,
        failAt: "publication-after-target",
        metadataPath: metadata,
        sourceRoot: fixture.root,
        targetDir: target,
      }),
      /Injected snapshot failure at publication-after-target/,
    );
    assert.deepEqual(await readSnapshot(target, metadata), before);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("a failed first publication leaves no partial snapshot", async () => {
  const fixture = await createFixture();
  const target = join(fixture.root, "cache", "pi-package");
  const metadata = `${target}.snapshot.json`;
  try {
    await assert.rejects(
      refreshSnapshot({
        commit: fixture.firstCommit,
        failAt: "publication-after-target",
        metadataPath: metadata,
        sourceRoot: fixture.root,
        targetDir: target,
      }),
      /Injected snapshot failure at publication-after-target/,
    );
    assert.equal(await exists(target), false);
    assert.equal(await exists(metadata), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
